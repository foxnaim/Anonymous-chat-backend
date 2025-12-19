import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError, ErrorCode } from '../utils/AppError';
import { AdminUser } from '../models/AdminUser';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { hashPassword, generateSecurePassword } from '../utils/password';
import { emailService } from '../services/emailService';
import { logger } from '../utils/logger';

export const getAdmins = asyncHandler(async (req: Request, res: Response) => {
  // Только суперадмины могут видеть всех админов
  if (req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const { page, limit } = req.query;

  // Пагинация
  const pageNumber = page && typeof page === 'string' ? parseInt(page, 10) : 1;
  const pageSize = limit && typeof limit === 'string' ? parseInt(limit, 10) : 50;
  const skip = (pageNumber - 1) * pageSize;

  // Оптимизация: используем lean() для производительности и select для исключения ненужных полей
  const [admins, total] = await Promise.all([
    AdminUser.find()
      .select('-__v') // Исключаем версию документа
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
  if (req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const body = req.body as { email?: string; name?: string; role?: string };
  const { email, name, role = 'admin' } = body;

  if (!email) {
    throw new AppError('Email is required', 400, ErrorCode.BAD_REQUEST);
  }

  // Проверяем, не существует ли админ с таким email
  const existingAdminByEmail = await AdminUser.findOne({ email: String(email).toLowerCase() });
  if (existingAdminByEmail) {
    throw new AppError('Admin with this email already exists', 409, ErrorCode.CONFLICT);
  }

  // Проверяем, не существует ли админ с таким именем (если имя указано)
  if (name) {
    const existingAdminByName = await AdminUser.findOne({ name: String(name).trim() });
    if (existingAdminByName) {
      throw new AppError('Admin with this name already exists', 409, ErrorCode.CONFLICT);
    }
  }

  // Проверяем, не существует ли пользователь с таким email
  const existingUser = await User.findOne({ email: String(email).toLowerCase() });
  if (existingUser) {
    throw new AppError('User with this email already exists', 409, ErrorCode.CONFLICT);
  }

  // Проверяем, не существует ли компания с таким email
  const existingCompany = await Company.findOne({ adminEmail: String(email).toLowerCase() });
  if (existingCompany) {
    throw new AppError('Company with this email already exists', 409, ErrorCode.CONFLICT);
  }

  const createdAt = new Date().toISOString().split('T')[0];

  const admin = await AdminUser.create({
    email: String(email).toLowerCase(),
    name: name ? String(name) : undefined,
    role: String(role),
    createdAt,
  });

  // Генерируем безопасный случайный пароль
  const generatedPassword = generateSecurePassword(16);
  const hashedPassword = await hashPassword(generatedPassword);

  await User.create({
    email: String(email).toLowerCase(),
    password: hashedPassword,
    role: role === 'super_admin' ? 'super_admin' : 'admin',
    name,
  });

  // Отправляем пароль администратору по email
  try {
    await emailService.sendAdminPasswordEmail(
      String(email).toLowerCase(),
      name || 'Администратор',
      generatedPassword
    );
    logger.info(`Admin password email sent to ${email}`);
  } catch (error) {
    // Логируем ошибку, но не прерываем создание админа
    logger.error(`Failed to send admin password email to ${email}:`, error);
    // В development режиме возвращаем пароль в ответе для удобства тестирования
    if (process.env.NODE_ENV === 'development') {
      res.status(201).json({
        success: true,
        data: admin,
        // Только в development - никогда в production!
        _devPassword: generatedPassword,
        _devWarning:
          'This password is only shown in development mode. In production, it is sent via email only.',
      });
      return;
    }
  }

  res.status(201).json({
    success: true,
    data: admin,
    message: 'Admin created successfully. Password has been sent to the provided email address.',
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

export const deleteAdmin = asyncHandler(async (req: Request, res: Response) => {
  // Только суперадмины могут удалять админов
  if (req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const { id } = req.params;

  const admin = await AdminUser.findById(id);
  if (!admin) {
    throw new AppError('Admin not found', 404, ErrorCode.NOT_FOUND);
  }

  // Нельзя удалить самого себя
  if (req.user?.email === admin.email) {
    throw new AppError('Cannot delete yourself', 400, ErrorCode.BAD_REQUEST);
  }

  // Нельзя удалить другого суперадмина (только обычных админов)
  if (admin.role === 'super_admin') {
    throw new AppError('Cannot delete super admin', 403, ErrorCode.FORBIDDEN);
  }

  // Удаляем пользователя
  const user = await User.findOne({ email: admin.email });
  if (user) {
    await user.deleteOne();
  }

  // Удаляем админа
  await admin.deleteOne();

  res.json({
    success: true,
    message: 'Admin deleted successfully',
  });
});
