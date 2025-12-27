import { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError, ErrorCode } from "../utils/AppError";
import { AdminUser } from "../models/AdminUser";
import { User } from "../models/User";
import { Company } from "../models/Company";
import { hashPassword, generateSecurePassword } from "../utils/password";
import { emailService } from "../services/emailService";
import { logger } from "../utils/logger";

export const getAdmins = asyncHandler(async (req: Request, res: Response) => {
  // Только суперадмины могут видеть всех админов
  if (req.user?.role !== "super_admin") {
    throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
  }

  const { page, limit } = req.query;

  // Пагинация
  const pageNumber = page && typeof page === "string" ? parseInt(page, 10) : 1;
  const pageSize =
    limit && typeof limit === "string" ? parseInt(limit, 10) : 50;
  const skip = (pageNumber - 1) * pageSize;

  // Оптимизация: выполняем запросы параллельно для максимальной скорости
  // Используем lean() для производительности (возвращает простые объекты без методов Mongoose)
  // select исключает ненужные поля
  // sort использует индекс createdAt для быстрой сортировки
  const [admins, total] = await Promise.all([
    AdminUser.find()
      .select("-__v") // Исключаем версию документа
      .sort({ createdAt: -1 }) // Использует индекс createdAt: -1
      .skip(skip)
      .limit(pageSize)
      .lean() // lean() для быстрого получения простых объектов без overhead Mongoose
      .exec(),
    AdminUser.countDocuments().exec(), // Параллельно считаем total
  ]);

  res.json({
    success: true,
    data: admins,
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  // Только суперадмины могут создавать админов
  if (req.user?.role !== "super_admin") {
    throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
  }

  const body = req.body as { email?: string; name?: string; role?: string };
  const { email, name, role = "admin" } = body;

  if (!email) {
    throw new AppError("Email is required", 400, ErrorCode.BAD_REQUEST);
  }

  // Нормализуем email для проверки
  const normalizedEmail = String(email).toLowerCase().trim();
  // name опционален: если не передан, используем email как имя; если пустой после trim — fallback на email
  const normalizedNameCandidate = name ? String(name).trim() : "";
  const normalizedName =
    normalizedNameCandidate && normalizedNameCandidate.length > 0
      ? normalizedNameCandidate
      : normalizedEmail.split("@")[0];

  // Если админ уже есть — возвращаем его (идемпотентность создания)
  const existingAdmin = await AdminUser.findOne({ email: normalizedEmail });
  if (existingAdmin) {
    logger.info(
      `Admin with email ${normalizedEmail} already exists. Returning existing admin (idempotent create).`,
    );
    return res.json({
      success: true,
      data: existingAdmin,
    });
  }

  // Проверяем, не существует ли компания с таким email (оставляем как конфликт)
  const existingCompany = await Company.findOne({
    adminEmail: normalizedEmail,
  });
  if (existingCompany) {
    logger.warn(
      `Attempt to create admin with existing company email: ${normalizedEmail}`,
    );
    throw new AppError(
      "Company with this email already exists",
      409,
      ErrorCode.CONFLICT,
    );
  }

  const createdAt = new Date().toISOString().split("T")[0];

  // Создаем админа - полагаемся на уникальный индекс MongoDB для предотвращения дубликатов
  // Это атомарная операция, которая предотвращает race condition
  let admin;
  try {
    admin = await AdminUser.create({
      email: normalizedEmail,
      name: normalizedName,
      role: String(role),
      createdAt,
    });
    logger.info(
      `AdminUser created: ${String(admin._id)} for email: ${normalizedEmail}`,
    );
  } catch (createError: unknown) {
    // Если это ошибка дубликата (уникальный индекс на email предотвратил создание)
    const error = createError as { code?: number; message?: string };
    if (
      error?.code === 11000 ||
      (error?.message && error.message.includes("duplicate")) ||
      (error?.message && error.message.includes("E11000"))
    ) {
      // Проверяем, действительно ли админ существует (может быть создан другим запросом)
      const existingAdmin = await AdminUser.findOne({ email: normalizedEmail });
      if (existingAdmin) {
        logger.info(
          `Admin with email ${normalizedEmail} already exists (race condition or duplicate request) — returning existing.`,
        );
        return res.json({
          success: true,
          data: existingAdmin,
        });
      }
      // Если админа нет, но была ошибка дубликата - это странно, пробрасываем как конфликт
      logger.error(
        `Unexpected duplicate key error for email ${normalizedEmail}, but admin not found`,
      );
      throw new AppError(
        "Admin with this email already exists",
        409,
        ErrorCode.CONFLICT,
      );
    }
    // Другие ошибки пробрасываем дальше
    throw createError;
  }

  // Генерируем безопасный случайный пароль
  const generatedPassword = generateSecurePassword(16);
  const hashedPassword = await hashPassword(generatedPassword);

  // Создаем или обновляем пользователя под этого админа (идемпотентно)
  try {
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      // Обновляем роль/имя при необходимости
      let shouldSave = false;
      const desiredRole = role === "super_admin" ? "super_admin" : "admin";
      if (existingUser.role !== desiredRole) {
        existingUser.role = desiredRole;
        shouldSave = true;
      }
      if (normalizedName && existingUser.name !== normalizedName) {
        existingUser.name = normalizedName;
        shouldSave = true;
      }
      if (shouldSave) {
        await existingUser.save();
      }
      logger.info(
        `User already exists for admin ${String(admin._id)}. Updated role/name if needed.`,
      );
    } else {
      await User.create({
        email: normalizedEmail,
        password: hashedPassword,
        role: role === "super_admin" ? "super_admin" : "admin",
        name: normalizedName,
      });
      logger.info(
        `User created for admin: ${String(admin._id)} with email: ${normalizedEmail}`,
      );
    }
  } catch (userError: unknown) {
    // Если при создании/обновлении пользователя произошла ошибка — пробуем откатить созданного админа
    const userErrorMessage =
      (userError as Error)?.message ??
      (typeof userError === "string"
        ? userError
        : JSON.stringify(userError ?? "Unknown error"));
    logger.error(
      `Failed to ensure user for admin ${String(admin._id)} (${normalizedEmail}): ${userErrorMessage}`,
    );
    await AdminUser.findByIdAndDelete(admin._id);
    throw userError;
  }

  // Отправляем email асинхронно ПОСЛЕ отправки ответа, чтобы не блокировать запрос
  // Используем setImmediate, чтобы гарантировать, что ответ уже отправлен
  setImmediate(async () => {
    try {
      await emailService.sendAdminPasswordEmail(
        String(email).toLowerCase(),
        name || "Администратор",
        generatedPassword,
      );
      logger.info(`Admin password email sent to ${email}`);
    } catch (error) {
      // Логируем ошибку, но не прерываем работу (админ уже создан)
      logger.error(`Failed to send admin password email to ${email}:`, error);
      // В development режиме можно вернуть пароль, но ответ уже отправлен
      if (process.env.NODE_ENV === "development") {
        logger.warn(
          `Development mode: Admin password for ${email} is ${generatedPassword}`,
        );
      }
    }
  });

  // Отправляем ответ клиенту, чтобы не блокировать UI
  return res.status(201).json({
    success: true,
    data: admin,
    message:
      "Admin created successfully. Password has been sent to the provided email address.",
  });
});

export const updateAdmin = asyncHandler(async (req: Request, res: Response) => {
  // Только суперадмины могут обновлять админов
  if (req.user?.role !== "super_admin") {
    throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
  }

  const { id } = req.params;
  const body = req.body as { name?: string; role?: string };
  const { name, role } = body;

  const admin = await AdminUser.findById(id);
  if (!admin) {
    throw new AppError("Admin not found", 404, ErrorCode.NOT_FOUND);
  }

  if (name && typeof name === "string") admin.name = name;
  if (
    role &&
    typeof role === "string" &&
    (role === "admin" || role === "super_admin")
  ) {
    admin.role = role;
  }

  await admin.save();

  // Обновляем пользователя
  const user = await User.findOne({ email: admin.email });
  if (user) {
    if (name && typeof name === "string") user.name = name;
    if (role && typeof role === "string")
      user.role = role === "super_admin" ? "super_admin" : "admin";
    await user.save();
  }

  res.json({
    success: true,
    data: admin,
  });
});

export const deleteAdmin = asyncHandler(async (req: Request, res: Response) => {
  // Только суперадмины могут удалять админов
  if (req.user?.role !== "super_admin") {
    throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
  }

  const { id } = req.params;

  const admin = await AdminUser.findById(id);
  if (!admin) {
    throw new AppError("Admin not found", 404, ErrorCode.NOT_FOUND);
  }

  // Нельзя удалить самого себя
  if (req.user?.email === admin.email) {
    throw new AppError("Cannot delete yourself", 400, ErrorCode.BAD_REQUEST);
  }

  // Нельзя удалить другого суперадмина (только обычных админов)
  if (admin.role === "super_admin") {
    throw new AppError("Cannot delete super admin", 403, ErrorCode.FORBIDDEN);
  }

  // Удаляем пользователя
  const user = await User.findOne({ email: admin.email });
  if (user) {
    await user.deleteOne();
  }

  // Удаляем админа
  await admin.deleteOne();

  // Дополнительная проверка: убедимся, что админ действительно удалён
  const stillExists = await AdminUser.findById(id);
  if (stillExists) {
    logger.error(
      `Failed to delete admin ${id} (${admin.email}) — document still exists after deleteOne`,
    );
    throw new AppError(
      "Failed to delete admin. Please try again.",
      500,
      ErrorCode.INTERNAL_ERROR,
    );
  }

  res.json({
    success: true,
    message: "Admin deleted successfully",
  });
});
