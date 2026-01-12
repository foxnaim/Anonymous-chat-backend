import { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError, ErrorCode } from "../utils/AppError";
import { Company } from "../models/Company";
import { User } from "../models/User";
import { AdminUser } from "../models/AdminUser";
import { SubscriptionPlan } from "../models/SubscriptionPlan";
import { Message } from "../models/Message";
import { hashPassword } from "../utils/password";
import { logger } from "../utils/logger";
import { cache } from "../utils/cacheRedis";

export const getAllCompanies = asyncHandler(
  async (req: Request, res: Response) => {
    // Только админы могут видеть все компании
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
    }

    const { page, limit } = req.query;

    // Пагинация
    const pageNumber =
      page && typeof page === "string" ? parseInt(page, 10) : 1;
    const pageSize =
      limit && typeof limit === "string" ? parseInt(limit, 10) : 20;
    const skip = (pageNumber - 1) * pageSize;

    // Оптимизация: используем lean() для производительности и select для исключения ненужных полей
    const [companies, total] = await Promise.all([
      Company.find()
        .select("-__v") // Исключаем версию документа
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean()
        .exec(),
      Company.countDocuments(),
    ]);

    // Преобразуем в формат фронтенда
    const companiesData = companies.map((company) => ({
      id: company._id.toString(),
      ...company,
      _id: undefined,
    }));

    res.json({
      success: true,
      data: companiesData,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  },
);

export const getCompanyById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const company = await Company.findById(id);
    if (!company) {
      throw new AppError("Company not found", 404, ErrorCode.NOT_FOUND);
    }

    // Проверка доступа
    if (
      req.user?.role === "company" &&
      req.user.companyId?.toString() !== company._id.toString()
    ) {
      throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
    }

    // Преобразуем в формат фронтенда (с числовым ID)
    const companyData = {
      id: company._id.toString(),
      ...company.toObject(),
      _id: undefined,
    };

    res.json({
      success: true,
      data: companyData,
    });
  },
);

export const getCompanyByCode = asyncHandler(
  async (req: Request, res: Response) => {
    const { code } = req.params;

    const company = await Company.findOne({ code: code.toUpperCase() });
    if (!company) {
      throw new AppError("Company not found", 404, ErrorCode.NOT_FOUND);
    }

    const companyData = {
      id: company._id.toString(),
      ...company.toObject(),
      _id: undefined,
    };

    res.json({
      success: true,
      data: companyData,
    });
  },
);

/**
 * Получить список публичных компаний для sitemap и SEO
 * Возвращает только публичные поля: code, name, status, updatedAt
 */
export const getPublicCompanies = asyncHandler(
  async (_req: Request, res: Response) => {
    // Получаем только активные компании (не заблокированные)
    const companies = await Company.find({ status: { $ne: "Заблокирована" } })
      .select("code name status updatedAt createdAt")
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Преобразуем в формат фронтенда
    const companiesData = companies.map((company) => ({
      id: company._id.toString(),
      code: company.code,
      name: company.name,
      status: company.status,
      updatedAt: company.updatedAt,
      createdAt: company.createdAt,
    }));

    res.json({
      success: true,
      data: companiesData,
    });
  },
);

export const createCompany = asyncHandler(
  async (req: Request, res: Response) => {
    // Только админы могут создавать компании
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
    }

    const body = req.body as {
      name?: string;
      code?: string;
      adminEmail?: string;
      password?: string;
      plan?: string;
      employees?: number;
      messagesLimit?: number;
      storageLimit?: number;
    };
    const {
      name,
      code,
      adminEmail,
      password,
      plan,
      employees,
      messagesLimit,
      storageLimit,
    } = body;

    const normalizedName = name ? String(name).trim() : "";
    const normalizedCode = code ? String(code).toUpperCase() : "";
    const normalizedEmail = adminEmail
      ? String(adminEmail).toLowerCase().trim()
      : "";
    const normalizedPassword = password ? String(password) : "";

    if (
      !normalizedName ||
      !normalizedCode ||
      !normalizedEmail ||
      !normalizedPassword
    ) {
      throw new AppError(
        "Name, code, adminEmail, and password are required",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    // Валидация пароля выполняется через Zod schema (createCompanySchema)

    // Проверяем, не существует ли компания уже (код, email, имя) — делаем создание идемпотентным
    const existingCompany =
      (await Company.findOne({ code: normalizedCode })) ||
      (await Company.findOne({ adminEmail: normalizedEmail })) ||
      (await Company.findOne({ name: normalizedName }));

    if (existingCompany) {
      const companyData = {
        id: existingCompany._id.toString(),
        ...existingCompany.toObject(),
        _id: undefined,
      };

      res.json({
        success: true,
        data: companyData,
        message:
          "Company already exists. Returning existing company (idempotent create).",
      });
      return;
    }

    // Проверяем, не существует ли пользователь с таким email — если есть и привязан к другой компании, отдаем конфликт
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });
    if (
      existingUser &&
      existingUser.companyId &&
      existingUser.companyId.toString() !== ""
    ) {
      throw new AppError(
        "User with this email already exists",
        409,
        ErrorCode.CONFLICT,
      );
    }

    // Проверяем, не существует ли админ с таким email
    const existingAdmin = await AdminUser.findOne({
      email: normalizedEmail,
    });
    if (existingAdmin) {
      throw new AppError(
        "Admin with this email already exists",
        409,
        ErrorCode.CONFLICT,
      );
    }

    const registeredDate = new Date().toISOString().split("T")[0];
    const selectedPlan = plan || "Пробный";
    const isTrialPlan = selectedPlan === "Пробный";
    let trialEndDate: string | undefined;

    if (isTrialPlan) {
      const endDate = new Date(registeredDate);
      endDate.setMonth(endDate.getMonth() + 2);
      trialEndDate = endDate.toISOString().split("T")[0];
    }

    let company;
    try {
      company = await Company.create({
        name: normalizedName,
        code: normalizedCode,
        adminEmail: normalizedEmail,
        status: "Активна",
        plan: selectedPlan,
        registered: registeredDate,
        trialEndDate,
        employees: employees || 0,
        messages: 0,
        messagesThisMonth: 0,
        messagesLimit: isTrialPlan ? 999999 : messagesLimit || 10,
        storageUsed: 0,
        storageLimit: isTrialPlan ? 999999 : storageLimit || 1,
      });
    } catch (createError: unknown) {
      const error = createError as { code?: number; message?: string };
      if (
        error?.code === 11000 ||
        (error?.message && error.message.includes("duplicate")) ||
        (error?.message && error.message.includes("E11000"))
      ) {
        const dupCompany =
          (await Company.findOne({ code: normalizedCode })) ||
          (await Company.findOne({ adminEmail: normalizedEmail })) ||
          (await Company.findOne({ name: normalizedName }));

        if (dupCompany) {
          const companyData = {
            id: dupCompany._id.toString(),
            ...dupCompany.toObject(),
            _id: undefined,
          };

          res.json({
            success: true,
            data: companyData,
            message:
              "Company already exists (race condition). Returning existing.",
          });
          return;
        }
      }
      throw createError;
    }

    // Создаем пользователя для компании с указанным паролем
    const hashedPassword = await hashPassword(normalizedPassword);

    // Создаем или обновляем пользователя под эту компанию (идемпотентно)
    const user = await User.findOne({ email: normalizedEmail });
    if (user) {
      let shouldSave = false;
      if (
        !user.companyId ||
        user.companyId.toString() !== company._id.toString()
      ) {
        user.companyId = company._id;
        shouldSave = true;
      }
      if (user.role !== "company") {
        user.role = "company";
        shouldSave = true;
      }
      const desiredName = `${normalizedName} Admin`;
      if (desiredName && user.name !== desiredName) {
        user.name = desiredName;
        shouldSave = true;
      }
      // При создании через админ-панель email считается верифицированным
      if (!user.isVerified) {
        user.isVerified = true;
        shouldSave = true;
      }
      if (shouldSave) {
        await user.save();
      }
    } else {
      await User.create({
        email: normalizedEmail,
        password: hashedPassword,
        role: "company",
        companyId: company._id,
        name: `${normalizedName} Admin`,
        isVerified: true, // При создании через админ-панель email считается верифицированным
      });
    }

    const companyData = {
      id: company._id.toString(),
      ...company.toObject(),
      _id: undefined,
    };

    // Инвалидируем кэш планов, так как статистика изменилась
    void cache.delete("plans:all");

    res.status(201).json({
      success: true,
      data: companyData,
    });
    return;
  },
);

export const updateCompany = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const company = await Company.findById(id);
    if (!company) {
      throw new AppError("Company not found", 404, ErrorCode.NOT_FOUND);
    }

    // Проверка доступа
    if (
      req.user?.role === "company" &&
      req.user.companyId?.toString() !== company._id.toString()
    ) {
      throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
    }

    const updates = req.body as {
      code?: string;
      adminEmail?: string;
      name?: string;
      status?: string;
      plan?: string;
      employees?: number;
      messagesLimit?: number;
      storageLimit?: number;
      logoUrl?: string;
      fullscreenMode?: boolean;
    };
    if (updates.code && typeof updates.code === "string") {
      updates.code = updates.code.toUpperCase();
    }
    if (updates.adminEmail && typeof updates.adminEmail === "string") {
      updates.adminEmail = updates.adminEmail.toLowerCase();
    }

    // Валидация размера логотипа (base64 строка)
    if (
      updates.logoUrl &&
      typeof updates.logoUrl === "string" &&
      updates.logoUrl !== ""
    ) {
      // Проверяем, является ли это base64 строкой
      if (updates.logoUrl.startsWith("data:image/")) {
        // Примерный размер base64 строки (base64 увеличивает размер на ~33%)
        // Для изображения 200x200px сжатого до ~500KB, base64 будет ~667KB
        const base64Size = (updates.logoUrl.length * 3) / 4; // Размер в байтах
        const maxSizeBytes = 1024 * 1024; // 1MB максимум для base64 строки

        if (base64Size > maxSizeBytes) {
          throw new AppError(
            "Logo file is too large. Maximum size: 1MB",
            400,
            ErrorCode.BAD_REQUEST,
          );
        }
      }
    }

    // Если план обновляется и пользователь - админ, обновляем лимиты
    if (
      updates.plan &&
      typeof updates.plan === "string" &&
      (req.user?.role === "admin" || req.user?.role === "super_admin")
    ) {
      const plan = updates.plan;

      // Проверяем, является ли план пробным (Пробный, Trial, Бесплатный, Free, Тегін)
      const trialPlanNames = [
        "Пробный",
        "Trial",
        "Бесплатный",
        "Free",
        "Тегін",
      ];
      const isTrialPlanByName = trialPlanNames.includes(plan);

      // Ищем план в базе данных по имени (проверяем все языковые варианты)
      const subscriptionPlan = await SubscriptionPlan.findOne({
        $or: [
          { "name.ru": plan },
          { "name.en": plan },
          { "name.kk": plan },
          { name: plan }, // На случай, если name - строка
        ],
      });

      // Проверяем, является ли план бесплатным (по имени или по флагу isFree)
      const isTrialPlan =
        isTrialPlanByName || subscriptionPlan?.isFree === true;
      if (isTrialPlan) {
        // Для пробного/бесплатного плана устанавливаем неограниченные лимиты
        updates.messagesLimit = 999999;
        updates.storageLimit = 999999;
      } else if (subscriptionPlan) {
        // Обновляем лимиты из найденного плана
        updates.messagesLimit = subscriptionPlan.messagesLimit;
        updates.storageLimit = subscriptionPlan.storageLimit;
      }
      // Если план не найден, оставляем лимиты как есть (или используем переданные значения)
    }

    Object.assign(company, updates);
    await company.save();

    const companyData = {
      id: company._id.toString(),
      ...company.toObject(),
      _id: undefined,
    };

    res.json({
      success: true,
      data: companyData,
    });
  },
);

export const updateCompanyStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as { status?: string };
    const { status } = body;

    // Только админы могут менять статус
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
    }

    const company = await Company.findById(id);
    if (!company) {
      throw new AppError("Company not found", 404, ErrorCode.NOT_FOUND);
    }

    if (status && typeof status === "string") {
      company.status = status as "Активна" | "Пробная" | "Заблокирована";
    }
    await company.save();

    const companyData = {
      id: company._id.toString(),
      ...company.toObject(),
      _id: undefined,
    };

    res.json({
      success: true,
      data: companyData,
    });
  },
);

export const updateCompanyPlan = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as { plan?: string; planEndDate?: string };
    const { plan, planEndDate } = body;

    // Только админы могут менять план
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
    }

    const company = await Company.findById(id);
    if (!company) {
      throw new AppError("Company not found", 404, ErrorCode.NOT_FOUND);
    }

    if (plan && typeof plan === "string") {
      company.plan = plan;

      // Обновляем лимиты на основе нового плана
      // Проверяем, является ли план пробным (Пробный, Trial, Бесплатный, Free, Тегін)
      const trialPlanNames = [
        "Пробный",
        "Trial",
        "Бесплатный",
        "Free",
        "Тегін",
      ];
      const isTrialPlanByName = trialPlanNames.includes(plan);

      // Ищем план в базе данных по имени (проверяем все языковые варианты)
      const subscriptionPlan = await SubscriptionPlan.findOne({
        $or: [
          { "name.ru": plan },
          { "name.en": plan },
          { "name.kk": plan },
          { name: plan }, // На случай, если name - строка
        ],
      });

      // Проверяем, является ли план бесплатным (по имени или по флагу isFree)
      const isTrialPlan =
        isTrialPlanByName || subscriptionPlan?.isFree === true;
      if (isTrialPlan) {
        // Для пробного/бесплатного плана устанавливаем неограниченные лимиты
        company.messagesLimit = 999999;
        company.storageLimit = 999999;
      } else if (subscriptionPlan) {
        // Обновляем лимиты из найденного плана
        company.messagesLimit = subscriptionPlan.messagesLimit;
        company.storageLimit = subscriptionPlan.storageLimit;
      } else {
        // Если план не найден, используем дефолтные значения
        // Это может быть кастомный план или план с другим названием
        // Оставляем текущие лимиты или устанавливаем дефолтные
        if (!company.messagesLimit) {
          company.messagesLimit = 10;
        }
        if (!company.storageLimit) {
          company.storageLimit = 1;
        }
      }
    }

    if (planEndDate && typeof planEndDate === "string") {
      company.trialEndDate = planEndDate;
    }

    await company.save();

    // Инвалидируем кэш планов, так как статистика изменилась
    void cache.delete("plans:all");

    const companyData = {
      id: company._id.toString(),
      ...company.toObject(),
      _id: undefined,
    };

    res.json({
      success: true,
      data: companyData,
    });
  },
);

export const deleteCompany = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const cleanId = id.trim();

    logger.info(
      `[CompanyController] DELETE request for company ID: ${cleanId}`,
    );

    // Только админы могут удалять компании
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
    }

    // 1. Находим компанию
    const company = await Company.findById(cleanId).lean();
    if (!company) {
      logger.warn(`[CompanyController] Company with ID ${cleanId} not found`);
      throw new AppError("Company not found", 404, ErrorCode.NOT_FOUND);
    }

    const companyCode = company.code;
    const companyId = company._id.toString();

    logger.info(
      `[CompanyController] Deleting company: ${company.name} (code: ${companyCode}, id: ${companyId})`,
    );

    // 2. Удаляем все сообщения компании по companyCode
    const messagesResult = await Message.deleteMany({ companyCode });
    logger.info(
      `[CompanyController] Deleted ${messagesResult.deletedCount} messages for company ${companyCode}`,
    );

    // 3. Удаляем всех пользователей компании по companyId
    const usersResult = await User.deleteMany({ companyId: company._id });
    logger.info(
      `[CompanyController] Deleted ${usersResult.deletedCount} users for company ${companyId}`,
    );

    // 4. Удаляем компанию по ID
    await Company.findByIdAndDelete(cleanId);

    // Инвалидируем кэш планов, так как статистика изменилась
    void cache.delete("plans:all");

    logger.info(
      `[CompanyController] Successfully deleted company ${company.name} (${companyCode})`,
    );

    res.json({
      success: true,
      message: "Company deleted successfully",
    });
  },
);
