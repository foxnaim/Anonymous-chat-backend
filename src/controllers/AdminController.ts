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

  // Оптимизация: используем lean() для производительности и select для исключения ненужных полей
  const [admins, total] = await Promise.all([
    AdminUser.find()
      .select("-__v") // Исключаем версию документа
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean()
      .exec(),
    AdminUser.countDocuments(),
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
  // name обязателен в модели, поэтому если не передан, используем email как имя
  const normalizedName = name
    ? String(name).trim()
    : normalizedEmail.split("@")[0];

  // Проверяем, что имя не пустое после trim
  if (!normalizedName || normalizedName.length === 0) {
    throw new AppError("Name is required", 400, ErrorCode.BAD_REQUEST);
  }

  // Проверяем, не существует ли пользователь с таким email (проверка до создания AdminUser)
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    logger.warn(
      `Attempt to create admin with existing user email: ${normalizedEmail}`,
    );
    throw new AppError(
      "User with this email already exists",
      409,
      ErrorCode.CONFLICT,
    );
  }

  // Проверяем, не существует ли компания с таким email (проверка до создания AdminUser)
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
        logger.warn(
          `Admin with email ${normalizedEmail} already exists (race condition or duplicate request)`,
        );
        throw new AppError(
          "Admin with this email already exists",
          409,
          ErrorCode.CONFLICT,
        );
      }
      // Если админа нет, но была ошибка дубликата - это странно, но обрабатываем
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

  // Создаем пользователя - если это падает, удаляем созданного админа
  try {
    await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      role: role === "super_admin" ? "super_admin" : "admin",
      name: normalizedName,
    });
    logger.info(
      `User created for admin: ${String(admin._id)} with email: ${normalizedEmail}`,
    );
  } catch (userError: unknown) {
    // Если создание User падает, проверяем причину
    const error = userError as { code?: number; message?: string };
    const isDuplicateError =
      error?.code === 11000 ||
      (error?.message && error.message.includes("duplicate")) ||
      (error?.message && error.message.includes("already exists"));

    if (isDuplicateError) {
      // Проверяем, не был ли User создан другим запросом (race condition)
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        // User уже существует - это race condition
        // Проверяем, не был ли AdminUser создан другим запросом
        const existingAdmin = await AdminUser.findOne({
          email: normalizedEmail,
        });
        if (
          existingAdmin &&
          existingAdmin._id.toString() !== admin._id.toString()
        ) {
          // AdminUser был создан другим запросом - это означает, что другой запрос успешно создал и AdminUser, и User
          // Удаляем наш AdminUser (который был создан позже из-за race condition)
          logger.warn(
            `AdminUser ${String(admin._id)} was created, but User already exists from another request. Deleting our AdminUser.`,
          );
          await AdminUser.findByIdAndDelete(admin._id);
          throw new AppError(
            "User with this email already exists",
            409,
            ErrorCode.CONFLICT,
          );
        }
        // Если это тот же AdminUser, значит User был создан между проверкой User (строка 72) и попыткой создания
        // Это означает, что другой запрос успешно создал User для того же AdminUser
        // В этом случае НЕ удаляем AdminUser, так как он уже связан с существующим User через другой запрос
        // Это успешный случай - админ создан, просто другим запросом
        logger.info(
          `User already exists for admin ${String(admin._id)} (same AdminUser). This is a race condition - another request created the User. Keeping AdminUser.`,
        );
        // НЕ удаляем AdminUser, так как он уже связан с существующим User
        // Возвращаем успех, так как админ фактически создан (другим запросом)
        // Но выбрасываем ошибку, чтобы фронтенд мог обработать race condition
        throw new AppError(
          "User with this email already exists",
          409,
          ErrorCode.CONFLICT,
        );
      }
      // Если User не существует, но была ошибка дубликата - странно, но обрабатываем
      logger.error(
        `Unexpected duplicate key error for User with email ${normalizedEmail}, but User not found. Rolling back AdminUser.`,
      );
      await AdminUser.findByIdAndDelete(admin._id);
      throw new AppError(
        "User with this email already exists",
        409,
        ErrorCode.CONFLICT,
      );
    }

    // Другие ошибки - удаляем AdminUser и пробрасываем дальше
    logger.error(
      `Failed to create User for admin ${String(admin._id)}, rolling back AdminUser creation`,
      userError,
    );
    await AdminUser.findByIdAndDelete(admin._id);
    throw userError;
  }

  // Отправляем пароль администратору по email
  try {
    await emailService.sendAdminPasswordEmail(
      String(email).toLowerCase(),
      name || "Администратор",
      generatedPassword,
    );
    logger.info(`Admin password email sent to ${email}`);
  } catch (error) {
    // Логируем ошибку, но не прерываем создание админа
    logger.error(`Failed to send admin password email to ${email}:`, error);
    // В development режиме возвращаем пароль в ответе для удобства тестирования
    if (process.env.NODE_ENV === "development") {
      res.status(201).json({
        success: true,
        data: admin,
        // Только в development - никогда в production!
        _devPassword: generatedPassword,
        _devWarning:
          "This password is only shown in development mode. In production, it is sent via email only.",
      });
      return;
    }
  }

  res.status(201).json({
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
