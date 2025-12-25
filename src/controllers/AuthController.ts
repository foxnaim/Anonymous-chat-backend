import { Request, Response } from "express";
import { Types } from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError, ErrorCode } from "../utils/AppError";
import { User } from "../models/User";
import { Company } from "../models/Company";
import { AdminUser } from "../models/AdminUser";
import {
  hashPassword,
  comparePassword,
  generateResetToken,
  hashResetToken,
  generateDailyPassword,
} from "../utils/password";
import { generateToken } from "../utils/jwt";
import { logger } from "../utils/logger";
import { emailService } from "../services/emailService";
import { config } from "../config/env";

/**
 * Вход в систему (для доступа в панель управления компанией)
 * Использует ТОЛЬКО постоянный пароль, установленный пользователем при создании компании
 * Ежедневный пароль здесь НЕ используется
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { email?: string; password?: string };
  const { email, password } = body;

  if (!email || !password) {
    throw new AppError(
      "Email and password are required",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new AppError(
      "Invalid email or password",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  // Проверяем ТОЛЬКО постоянный пароль из БД (для входа в систему)
  const isPasswordValid = await comparePassword(
    String(password),
    user.password,
  );
  if (!isPasswordValid) {
    throw new AppError(
      "Invalid email or password",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  // Проверяем, заблокирована ли компания (для пользователей с ролью company)
  if (user.role === "company" && user.companyId) {
    const company = await Company.findById(user.companyId);
    if (company && company.status === "Заблокирована") {
      throw new AppError("COMPANY_BLOCKED", 403, ErrorCode.FORBIDDEN);
    }
  }

  // Обновляем lastLogin
  user.lastLogin = new Date();
  await user.save();

  const token = generateToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    companyId: user.companyId?.toString(),
  });

  res.json({
    success: true,
    data: {
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        name: user.name,
      },
      token,
    },
  });
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
    companyName?: string;
    companyCode?: string;
  };
  const {
    email,
    password,
    name,
    role = "user",
    companyName,
    companyCode,
  } = body;

  if (!email || !password) {
    throw new AppError(
      "Email and password are required",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  // Проверяем, существует ли пользователь с таким email
  const existingUser = await User.findOne({
    email: String(email).toLowerCase(),
  });
  if (existingUser) {
    throw new AppError("User already exists", 409, ErrorCode.CONFLICT);
  }

  // Проверяем, не существует ли админ с таким email
  const existingAdmin = await AdminUser.findOne({
    email: String(email).toLowerCase(),
  });
  if (existingAdmin) {
    throw new AppError(
      "Admin with this email already exists",
      409,
      ErrorCode.CONFLICT,
    );
  }

  const hashedPassword = await hashPassword(String(password));

  let companyId: string | undefined;

  // Если регистрация компании, создаем компанию
  if (role === "company" && companyName && companyCode) {
    // Проверяем, не существует ли компания с таким кодом
    const existingCompanyByCode = await Company.findOne({
      code: String(companyCode).toUpperCase(),
    });
    if (existingCompanyByCode) {
      throw new AppError(
        "Company with this code already exists",
        409,
        ErrorCode.CONFLICT,
      );
    }

    // Проверяем, не существует ли компания с таким именем
    const existingCompanyByName = await Company.findOne({
      name: String(companyName).trim(),
    });
    if (existingCompanyByName) {
      throw new AppError(
        "Company with this name already exists",
        409,
        ErrorCode.CONFLICT,
      );
    }

    // Проверяем, не существует ли компания с таким email администратора
    const existingCompanyByEmail = await Company.findOne({
      adminEmail: String(email).toLowerCase(),
    });
    if (existingCompanyByEmail) {
      throw new AppError(
        "Company with this email already exists",
        409,
        ErrorCode.CONFLICT,
      );
    }

    const registeredDate = new Date().toISOString().split("T")[0];
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 60); // 60 дней пробного периода

    const company = await Company.create({
      name: String(companyName),
      code: String(companyCode).toUpperCase(),
      adminEmail: String(email).toLowerCase(),
      status: "Активна",
      plan: "Пробный",
      registered: registeredDate,
      trialEndDate: trialEndDate.toISOString().split("T")[0],
      employees: 0,
      messages: 0,
      messagesThisMonth: 0,
      messagesLimit: 999999,
      storageUsed: 0,
      storageLimit: 999999,
    });

    companyId = company._id.toString();
  }

  const user = await User.create({
    email: String(email).toLowerCase(),
    password: hashedPassword,
    name: name || companyName,
    role,
    companyId: companyId ? (companyId as unknown as Types.ObjectId) : undefined,
  });

  const token = generateToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    companyId: user.companyId?.toString(),
  });

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        name: user.name,
      },
      token,
    },
  });
});

export const verifyPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const body = req.body as { code?: string; password?: string };
    const { code, password } = body;

    if (!code || !password) {
      throw new AppError(
        "Code and password are required",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    const company = await Company.findOne({ code });
    if (!company) {
      throw new AppError("Company not found", 404, ErrorCode.NOT_FOUND);
    }

    // Находим пользователя компании
    const user = await User.findOne({
      companyId: company._id,
      role: "company",
    }).select("+password");
    if (!user) {
      throw new AppError("Company user not found", 404, ErrorCode.NOT_FOUND);
    }

    /**
     * Проверка пароля для отправки анонимных сообщений
     * Принимает ДВА типа паролей:
     * 1. Ежедневный пароль - генерируется автоматически каждый день на основе даты (UTC)
     *    Используется сотрудниками для отправки анонимных сообщений
     *    Обновляется автоматически каждый день в полночь UTC
     * 2. Постоянный пароль - пароль компании из БД
     *    Может использоваться как альтернатива ежедневному паролю
     */
    // Генерируем ежедневный пароль на основе текущей даты (UTC)
    const dailyPassword = generateDailyPassword(10);
    const isDailyPassword = password === dailyPassword;

    // Проверяем постоянный пароль из БД
    const isStoredPasswordValid = await comparePassword(
      String(password),
      user.password,
    );

    // Принимаем любой из двух паролей
    const isPasswordValid = isDailyPassword || isStoredPasswordValid;

    res.json({
      success: true,
      data: {
        isValid: isPasswordValid,
      },
    });
  },
);

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError("Not authenticated", 401, ErrorCode.UNAUTHORIZED);
  }

  const user = await User.findById(req.user.userId);
  if (!user) {
    throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        name: user.name,
        lastLogin: user.lastLogin,
      },
    },
  });
});

export const forgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const body = req.body as { email?: string };
    const { email } = body;

    if (!email) {
      throw new AppError("Email is required", 400, ErrorCode.BAD_REQUEST);
    }

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) {
      // Для безопасности не сообщаем, существует ли пользователь
      logger.info(`Password reset requested for non-existent email: ${email}`);
      res.json({
        success: true,
        message: "If the email exists, a password reset link has been sent",
      });
      return;
    }

    // Генерируем токен сброса пароля
    const resetToken = generateResetToken();
    const hashedToken = hashResetToken(resetToken);

    // Сохраняем токен и время истечения (1 час)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 час
    await user.save();

    // Ограничиваем ожидание отправки письма, чтобы не блокировать запрос
    const emailTimeoutMs = 10000; // 10 секунд достаточно для SMTP, иначе возвращаем успех
    const emailPromise = emailService.sendPasswordResetEmail(
      String(email),
      resetToken,
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("EMAIL_SEND_TIMEOUT")), emailTimeoutMs),
    );

    try {
      await Promise.race([emailPromise, timeoutPromise]);
      logger.info(`Password reset email sent to ${email}`);
    } catch (error) {
      // Логируем, но не падаем — фронту всегда отвечаем успехом
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send password reset email to ${email}:`, {
        error: errorMessage,
        note: "Railway may be blocking outbound SMTP connections. Consider using an external SMTP service (SendGrid, Mailgun, Resend, etc.)",
      });

      // В development, если SMTP не работает, или если Resend ограничивает тестовый домен, возвращаем токен для тестирования
      if (
        config.nodeEnv === "development" ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("TIMEOUT") ||
        errorMessage.includes("RESEND_TEST_DOMAIN_LIMIT")
      ) {
        logger.warn(`Password reset token for ${email}: ${resetToken}`);
        
        // Определяем причину для более информативного сообщения
        let warningMessage: string | undefined;
        if (config.nodeEnv === "production") {
          if (errorMessage.includes("RESEND_TEST_DOMAIN_LIMIT")) {
            warningMessage =
              "Resend test domain ограничивает отправку только на зарегистрированный email. Верифицируйте свой домен на https://resend.com/domains или используйте токен ниже для тестирования.";
          } else {
            warningMessage =
              "SMTP connection failed. Token provided for testing. Please configure an external SMTP service.";
          }
        }
        
        return res.json({
          success: true,
          message: "If the email exists, a password reset link has been sent",
          resetToken, // Для тестирования, если SMTP не работает
          warning: warningMessage,
        });
      }
    }

    // Всегда возвращаем успешный ответ (для безопасности не раскрываем детали)
    return res.json({
      success: true,
      message: "If the email exists, a password reset link has been sent",
    });
  },
);

export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const body = req.body as { token?: string; password?: string };
    const { token, password } = body;

    if (!token || !password) {
      throw new AppError(
        "Token and password are required",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    // Валидация пароля выполняется через Zod schema (resetPasswordSchema)

    const hashedToken = hashResetToken(String(token));

    // Находим пользователя с валидным токеном
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
      throw new AppError(
        "Invalid or expired reset token",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    // Обновляем пароль
    const hashedPassword = await hashPassword(String(password));
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: "Password has been reset successfully",
    });
  },
);

export const changeEmail = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(
      "Authentication required. Please log in to change your email.",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  const body = req.body as { newEmail?: string; password?: string };
  const { newEmail, password } = body;

  if (!newEmail || !password) {
    throw new AppError(
      "Both new email address and current password are required to change your email. Please fill in all fields.",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  // Валидация email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    throw new AppError(
      "The email address format is incorrect. Please enter a valid email address (e.g., user@example.com).",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  // Получаем пользователя с паролем
  const user = await User.findById(req.user.userId).select("+password");
  if (!user) {
    throw new AppError(
      "User account not found. Please try logging in again.",
      404,
      ErrorCode.NOT_FOUND,
    );
  }

  // Проверяем текущий пароль
  const isPasswordValid = await comparePassword(
    String(password),
    user.password,
  );
  if (!isPasswordValid) {
    throw new AppError(
      "The current password you entered is incorrect. Please check your password and try again. Make sure Caps Lock is off and you are using the correct password.",
      401,
      ErrorCode.UNAUTHORIZED,
    );
  }

  // Проверяем, что новый email отличается от текущего
  if (user.email.toLowerCase() === newEmail.toLowerCase()) {
    throw new AppError(
      "The new email address must be different from your current email address. Please enter a different email.",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  // Проверяем, что новый email не занят
  const existingUser = await User.findOne({ email: newEmail.toLowerCase() });
  if (existingUser) {
    throw new AppError(
      "This email address is already registered to another account. Please choose a different email address.",
      400,
      ErrorCode.BAD_REQUEST,
    );
  }

  // Обновляем email
  user.email = newEmail.toLowerCase();
  await user.save();

  res.json({
    success: true,
    data: {
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        name: user.name,
        lastLogin: user.lastLogin,
      },
    },
    message: "Email has been changed successfully",
  });
});

export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError(
        "Authentication required. Please log in to change your password.",
        401,
        ErrorCode.UNAUTHORIZED,
      );
    }

    const body = req.body as { currentPassword?: string; newPassword?: string };
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      throw new AppError(
        "Both current password and new password are required to change your password. Please fill in all fields.",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    // Валидация пароля выполняется через Zod schema (changePasswordSchema)

    // Получаем пользователя с паролем
    const user = await User.findById(req.user.userId).select("+password");
    if (!user) {
      throw new AppError(
        "User account not found. Please try logging in again.",
        404,
        ErrorCode.NOT_FOUND,
      );
    }

    // Проверяем текущий пароль
    const isPasswordValid = await comparePassword(
      String(currentPassword),
      user.password,
    );
    if (!isPasswordValid) {
      throw new AppError(
        "The current password you entered is incorrect. Please check your password and try again. Make sure Caps Lock is off and you are using the correct password.",
        401,
        ErrorCode.UNAUTHORIZED,
      );
    }

    // Проверяем, что новый пароль отличается от текущего
    const isSamePassword = await comparePassword(
      String(newPassword),
      user.password,
    );
    if (isSamePassword) {
      throw new AppError(
        "The new password must be different from your current password. Please choose a different password.",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    // Хешируем и сохраняем новый пароль
    const hashedPassword = await hashPassword(String(newPassword));
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password has been changed successfully",
    });
  },
);
