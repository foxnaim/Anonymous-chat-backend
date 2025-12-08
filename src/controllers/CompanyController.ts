import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError, ErrorCode } from '../utils/AppError';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { hashPassword } from '../utils/password';

export const getAllCompanies = asyncHandler(async (req: Request, res: Response) => {
  // Только админы могут видеть все компании
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const companies = await Company.find().sort({ createdAt: -1 });

  // Преобразуем в формат фронтенда
  const companiesData = companies.map(company => ({
    id: company._id.toString(),
    ...company.toObject(),
    _id: undefined,
  }));

  res.json({
    success: true,
    data: companiesData,
  });
});

export const getCompanyById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const company = await Company.findById(id);
  if (!company) {
    throw new AppError('Company not found', 404, ErrorCode.NOT_FOUND);
  }

  // Проверка доступа
  if (req.user?.role === 'company' && req.user.companyId?.toString() !== company._id.toString()) {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
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
});

export const getCompanyByCode = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.params;

  const company = await Company.findOne({ code: code.toUpperCase() });
  if (!company) {
    throw new AppError('Company not found', 404, ErrorCode.NOT_FOUND);
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
});

export const createCompany = asyncHandler(async (req: Request, res: Response) => {
  // Только админы могут создавать компании
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const body = req.body as {
    name?: string;
    code?: string;
    adminEmail?: string;
    status?: string;
    plan?: string;
    employees?: number;
    messagesLimit?: number;
    storageLimit?: number;
  };
  const { name, code, adminEmail, status, plan, employees, messagesLimit, storageLimit } = body;

  if (!name || !code || !adminEmail) {
    throw new AppError('Name, code, and adminEmail are required', 400, ErrorCode.BAD_REQUEST);
  }

  // Проверяем, не существует ли компания с таким кодом
  const existingCompany = await Company.findOne({ code: String(code).toUpperCase() });
  if (existingCompany) {
    throw new AppError('Company with this code already exists', 409, ErrorCode.CONFLICT);
  }

  // Проверяем, не существует ли пользователь с таким email
  const existingUser = await User.findOne({ email: String(adminEmail).toLowerCase() });
  if (existingUser) {
    throw new AppError('User with this email already exists', 409, ErrorCode.CONFLICT);
  }

  const registeredDate = new Date().toISOString().split('T')[0];
  let trialEndDate: string | undefined;

  if (status === 'Пробная') {
    const endDate = new Date(registeredDate);
    endDate.setMonth(endDate.getMonth() + 2);
    trialEndDate = endDate.toISOString().split('T')[0];
  }

  const company = await Company.create({
    name: String(name),
    code: String(code).toUpperCase(),
    adminEmail: String(adminEmail).toLowerCase(),
    status: status || 'Пробная',
    plan: plan || 'Бесплатный',
    registered: registeredDate,
    trialEndDate,
    employees: employees || 0,
    messages: 0,
    messagesThisMonth: 0,
    messagesLimit: status === 'Пробная' ? 999999 : messagesLimit,
    storageUsed: 0,
    storageLimit: status === 'Пробная' ? 999999 : storageLimit,
  });

  // Создаем пользователя для компании
  const defaultPassword = 'password12'; // В продакшене должен генерироваться случайный пароль
  const hashedPassword = await hashPassword(defaultPassword);

  await User.create({
    email: adminEmail.toLowerCase(),
    password: hashedPassword,
    role: 'company',
    companyId: company._id,
    name: `${name} Admin`,
  });

  const companyData = {
    id: company._id.toString(),
    ...company.toObject(),
    _id: undefined,
  };

  res.status(201).json({
    success: true,
    data: companyData,
  });
});

export const updateCompany = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const company = await Company.findById(id);
  if (!company) {
    throw new AppError('Company not found', 404, ErrorCode.NOT_FOUND);
  }

  // Проверка доступа
  if (req.user?.role === 'company' && req.user.companyId?.toString() !== company._id.toString()) {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
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
  };
  if (updates.code && typeof updates.code === 'string') {
    updates.code = updates.code.toUpperCase();
  }
  if (updates.adminEmail && typeof updates.adminEmail === 'string') {
    updates.adminEmail = updates.adminEmail.toLowerCase();
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
});

export const updateCompanyStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as { status?: string };
  const { status } = body;

  // Только админы могут менять статус
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const company = await Company.findById(id);
  if (!company) {
    throw new AppError('Company not found', 404, ErrorCode.NOT_FOUND);
  }

  if (status && typeof status === 'string') {
    company.status = status as 'Активна' | 'Пробная' | 'Заблокирована';
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
});

export const updateCompanyPlan = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as { plan?: string; planEndDate?: string };
  const { plan, planEndDate } = body;

  // Только админы могут менять план
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const company = await Company.findById(id);
  if (!company) {
    throw new AppError('Company not found', 404, ErrorCode.NOT_FOUND);
  }

  if (plan && typeof plan === 'string') {
    company.plan = plan;
  }
  if (planEndDate && typeof planEndDate === 'string') {
    company.trialEndDate = planEndDate;
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
});
