import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError, ErrorCode } from '../utils/AppError';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { AdminUser } from '../models/AdminUser';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { hashPassword } from '../utils/password';

export const getAllCompanies = asyncHandler(async (req: Request, res: Response) => {
  // Только админы могут видеть все компании
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const { page, limit } = req.query;

  // Пагинация
  const pageNumber = page && typeof page === 'string' ? parseInt(page, 10) : 1;
  const pageSize = limit && typeof limit === 'string' ? parseInt(limit, 10) : 20;
  const skip = (pageNumber - 1) * pageSize;

  // Оптимизация: используем lean() для производительности и select для исключения ненужных полей
  const [companies, total] = await Promise.all([
    Company.find()
      .select('-__v') // Исключаем версию документа
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean()
      .exec(),
    Company.countDocuments(),
  ]);

  // Преобразуем в формат фронтенда
  const companiesData = companies.map(company => ({
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
    password?: string;
    plan?: string;
    employees?: number;
    messagesLimit?: number;
    storageLimit?: number;
  };
  const { name, code, adminEmail, password, plan, employees, messagesLimit, storageLimit } = body;

  if (!name || !code || !adminEmail || !password) {
    throw new AppError(
      'Name, code, adminEmail, and password are required',
      400,
      ErrorCode.BAD_REQUEST
    );
  }

  // Валидация пароля выполняется через Zod schema (createCompanySchema)

  // Проверяем, не существует ли компания с таким кодом
  const existingCompanyByCode = await Company.findOne({ code: String(code).toUpperCase() });
  if (existingCompanyByCode) {
    throw new AppError('Company with this code already exists', 409, ErrorCode.CONFLICT);
  }

  // Проверяем, не существует ли компания с таким именем
  const existingCompanyByName = await Company.findOne({ name: String(name).trim() });
  if (existingCompanyByName) {
    throw new AppError('Company with this name already exists', 409, ErrorCode.CONFLICT);
  }

  // Проверяем, не существует ли компания с таким email администратора
  const existingCompanyByEmail = await Company.findOne({
    adminEmail: String(adminEmail).toLowerCase(),
  });
  if (existingCompanyByEmail) {
    throw new AppError('Company with this email already exists', 409, ErrorCode.CONFLICT);
  }

  // Проверяем, не существует ли пользователь с таким email
  const existingUser = await User.findOne({ email: String(adminEmail).toLowerCase() });
  if (existingUser) {
    throw new AppError('User with this email already exists', 409, ErrorCode.CONFLICT);
  }

  // Проверяем, не существует ли админ с таким email
  const existingAdmin = await AdminUser.findOne({ email: String(adminEmail).toLowerCase() });
  if (existingAdmin) {
    throw new AppError('Admin with this email already exists', 409, ErrorCode.CONFLICT);
  }

  const registeredDate = new Date().toISOString().split('T')[0];
  const selectedPlan = plan || 'Пробный';
  const isTrialPlan = selectedPlan === 'Пробный';
  let trialEndDate: string | undefined;

  if (isTrialPlan) {
    const endDate = new Date(registeredDate);
    endDate.setMonth(endDate.getMonth() + 2);
    trialEndDate = endDate.toISOString().split('T')[0];
  }

  const company = await Company.create({
    name: String(name),
    code: String(code).toUpperCase(),
    adminEmail: String(adminEmail).toLowerCase(),
    status: 'Активна',
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

  // Создаем пользователя для компании с указанным паролем
  const hashedPassword = await hashPassword(String(password));

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
    logoUrl?: string;
    fullscreenMode?: boolean;
  };
  if (updates.code && typeof updates.code === 'string') {
    updates.code = updates.code.toUpperCase();
  }
  if (updates.adminEmail && typeof updates.adminEmail === 'string') {
    updates.adminEmail = updates.adminEmail.toLowerCase();
  }

  // Если план обновляется и пользователь - админ, обновляем лимиты
  if (
    updates.plan &&
    typeof updates.plan === 'string' &&
    (req.user?.role === 'admin' || req.user?.role === 'super_admin')
  ) {
    const plan = updates.plan;

    // Проверяем, является ли план пробным (Пробный, Trial, Бесплатный, Free, Тегін)
    const trialPlanNames = ['Пробный', 'Trial', 'Бесплатный', 'Free', 'Тегін'];
    const isTrialPlanByName = trialPlanNames.includes(plan);

    // Ищем план в базе данных по имени (проверяем все языковые варианты)
    const subscriptionPlan = await SubscriptionPlan.findOne({
      $or: [
        { 'name.ru': plan },
        { 'name.en': plan },
        { 'name.kk': plan },
        { name: plan }, // На случай, если name - строка
      ],
    });

    // Проверяем, является ли план бесплатным (по имени или по флагу isFree)
    const isTrialPlan = isTrialPlanByName || subscriptionPlan?.isFree === true;
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

    // Обновляем лимиты на основе нового плана
    // Проверяем, является ли план пробным (Пробный, Trial, Бесплатный, Free, Тегін)
    const trialPlanNames = ['Пробный', 'Trial', 'Бесплатный', 'Free', 'Тегін'];
    const isTrialPlanByName = trialPlanNames.includes(plan);

    // Ищем план в базе данных по имени (проверяем все языковые варианты)
    const subscriptionPlan = await SubscriptionPlan.findOne({
      $or: [
        { 'name.ru': plan },
        { 'name.en': plan },
        { 'name.kk': plan },
        { name: plan }, // На случай, если name - строка
      ],
    });

    // Проверяем, является ли план бесплатным (по имени или по флагу isFree)
    const isTrialPlan = isTrialPlanByName || subscriptionPlan?.isFree === true;
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

export const deleteCompany = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Только админы могут удалять компании
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  const company = await Company.findById(id);
  if (!company) {
    throw new AppError('Company not found', 404, ErrorCode.NOT_FOUND);
  }

  // Удаляем всех пользователей компании
  await User.deleteMany({ companyId: company._id });

  // Удаляем компанию
  await Company.findByIdAndDelete(id);

  res.json({
    success: true,
    message: 'Company deleted successfully',
  });
});
