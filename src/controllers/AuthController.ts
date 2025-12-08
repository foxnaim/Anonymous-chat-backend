import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError, ErrorCode } from '../utils/AppError';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';

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
  const body = req.body as { email?: string; password?: string; name?: string; role?: string };
  const { email, password, name, role = 'user' } = body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400, ErrorCode.BAD_REQUEST);
  }

  // Проверяем, существует ли пользователь
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError('User already exists', 409, ErrorCode.CONFLICT);
  }

  const hashedPassword = await hashPassword(String(password));

  const user = await User.create({
    email,
    password: hashedPassword,
    name,
    role,
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
