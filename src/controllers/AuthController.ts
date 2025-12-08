import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError, ErrorCode } from '../utils/AppError';
import { User } from '../models/User';
import { Company } from '../models/Company';
import {
  hashPassword,
  comparePassword,
  generateResetToken,
  hashResetToken,
} from '../utils/password';
import { generateToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { emailService } from '../services/emailService';
import { config } from '../config/env';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { email?: string; password?: string };
  const { email, password } = body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400, ErrorCode.BAD_REQUEST);
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new AppError('Invalid email or password', 401, ErrorCode.UNAUTHORIZED);
  }

  const isPasswordValid = await comparePassword(String(password), user.password);
  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401, ErrorCode.UNAUTHORIZED);
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
  const { email, password, name, role = 'user', companyName, companyCode } = body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400, ErrorCode.BAD_REQUEST);
  }

  // Проверяем, существует ли пользователь
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError('User already exists', 409, ErrorCode.CONFLICT);
  }

  const hashedPassword = await hashPassword(String(password));

  let companyId: string | undefined;

  // Если регистрация компании, создаем компанию
  if (role === 'company' && companyName && companyCode) {
    // Проверяем, не существует ли компания с таким кодом
    const existingCompany = await Company.findOne({ code: String(companyCode).toUpperCase() });
    if (existingCompany) {
      throw new AppError('Company with this code already exists', 409, ErrorCode.CONFLICT);
    }

    const registeredDate = new Date().toISOString().split('T')[0];
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 60); // 60 дней пробного периода

    const company = await Company.create({
      name: String(companyName),
      code: String(companyCode).toUpperCase(),
      adminEmail: String(email).toLowerCase(),
      status: 'Пробная',
      plan: 'Пробный',
      registered: registeredDate,
      trialEndDate: trialEndDate.toISOString().split('T')[0],
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
    email,
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

export const verifyPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { code?: string; password?: string };
  const { code, password } = body;

  if (!code || !password) {
    throw new AppError('Code and password are required', 400, ErrorCode.BAD_REQUEST);
  }

  const company = await Company.findOne({ code });
  if (!company) {
    throw new AppError('Company not found', 404, ErrorCode.NOT_FOUND);
  }

  // Находим пользователя компании
  const user = await User.findOne({ companyId: company._id, role: 'company' }).select('+password');
  if (!user) {
    throw new AppError('Company user not found', 404, ErrorCode.NOT_FOUND);
  }

  const isPasswordValid = await comparePassword(String(password), user.password);

  res.json({
    success: true,
    data: {
      isValid: isPasswordValid,
    },
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Not authenticated', 401, ErrorCode.UNAUTHORIZED);
  }

  const user = await User.findById(req.user.userId);
  if (!user) {
    throw new AppError('User not found', 404, ErrorCode.NOT_FOUND);
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

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { email?: string };
  const { email } = body;

  if (!email) {
    throw new AppError('Email is required', 400, ErrorCode.BAD_REQUEST);
  }

  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user) {
    // Для безопасности не сообщаем, существует ли пользователь
    logger.info(`Password reset requested for non-existent email: ${email}`);
    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
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

  try {
    // Отправляем email с ссылкой для восстановления пароля
    await emailService.sendPasswordResetEmail(String(email), resetToken);
    logger.info(`Password reset email sent to ${email}`);

    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
    });
  } catch (error) {
    // Логируем ошибку, но не прерываем процесс
    logger.error(`Failed to send password reset email to ${email}:`, error);

    // В development режиме все еще возвращаем токен для тестирования
    if (config.nodeEnv === 'development') {
      logger.warn(`Password reset token for ${email}: ${resetToken}`);
      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
        resetToken, // Только в development для тестирования
      });
    } else {
      // В production возвращаем успешный ответ, но без токена
      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
      });
    }
  }
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { token?: string; password?: string };
  const { token, password } = body;

  if (!token || !password) {
    throw new AppError('Token and password are required', 400, ErrorCode.BAD_REQUEST);
  }

  if (String(password).length < 6) {
    throw new AppError('Password must be at least 6 characters', 400, ErrorCode.BAD_REQUEST);
  }

  const hashedToken = hashResetToken(String(token));

  // Находим пользователя с валидным токеном
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: new Date() },
  }).select('+resetPasswordToken +resetPasswordExpires');

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400, ErrorCode.BAD_REQUEST);
  }

  // Обновляем пароль
  const hashedPassword = await hashPassword(String(password));
  user.password = hashedPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Password has been reset successfully',
  });
});
