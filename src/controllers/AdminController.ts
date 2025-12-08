import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError, ErrorCode } from '../utils/AppError';
import { AdminUser } from '../models/AdminUser';
import { User } from '../models/User';
import { hashPassword } from '../utils/password';

export const getAdmins = asyncHandler(async (req: Request, res: Response) => {
  // Только суперадмины могут видеть всех админов
  if (req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const admins = await AdminUser.find().sort({ createdAt: -1 });

  res.json({
    success: true,
    data: admins,
  });
});

export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  // Только суперадмины могут создавать админов
  if (req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const body = req.body as { email?: string; name?: string; role?: string };
  const { email, name, role = 'admin' } = body;

  if (!email) {
    throw new AppError('Email is required', 400, ErrorCode.BAD_REQUEST);
  }

  // Проверяем, не существует ли админ
  const existingAdmin = await AdminUser.findOne({ email: String(email).toLowerCase() });
  if (existingAdmin) {
    throw new AppError('Admin with this email already exists', 409, ErrorCode.CONFLICT);
  }

  // Проверяем, не существует ли пользователь
  const existingUser = await User.findOne({ email: String(email).toLowerCase() });
  if (existingUser) {
    throw new AppError('User with this email already exists', 409, ErrorCode.CONFLICT);
  }

  const createdAt = new Date().toISOString().split('T')[0];

  const admin = await AdminUser.create({
    email: String(email).toLowerCase(),
    name: name ? String(name) : undefined,
    role: String(role),
    createdAt,
  });

  // Создаем пользователя для админа
  const defaultPassword = 'admin123'; // В продакшене должен генерироваться случайный пароль
  const hashedPassword = await hashPassword(defaultPassword);

  await User.create({
    email: String(email).toLowerCase(),
    password: hashedPassword,
    role: role === 'super_admin' ? 'super_admin' : 'admin',
    name,
  });

  res.status(201).json({
    success: true,
    data: admin,
  });
});

export const updateAdmin = asyncHandler(async (req: Request, res: Response) => {
  // Только суперадмины могут обновлять админов
  if (req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const { id } = req.params;
  const body = req.body as { name?: string; role?: string };
  const { name, role } = body;

  const admin = await AdminUser.findById(id);
  if (!admin) {
    throw new AppError('Admin not found', 404, ErrorCode.NOT_FOUND);
  }

  if (name && typeof name === 'string') admin.name = name;
  if (role && typeof role === 'string' && (role === 'admin' || role === 'super_admin')) {
    admin.role = role;
  }

  await admin.save();

  // Обновляем пользователя
  const user = await User.findOne({ email: admin.email });
  if (user) {
    if (name && typeof name === 'string') user.name = name;
    if (role && typeof role === 'string')
      user.role = role === 'super_admin' ? 'super_admin' : 'admin';
    await user.save();
  }

  res.json({
    success: true,
    data: admin,
  });
});
