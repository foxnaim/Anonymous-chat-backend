import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError, ErrorCode } from '../utils/AppError';
import { Message, MessageStatus } from '../models/Message';
import { sanitizeMessageContent } from '../utils/sanitize';

// Генерация ID сообщения в формате FB-YYYY-XXXXXX
const generateMessageId = (): string => {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `FB-${year}-${random}`;
};

export const getAllMessages = asyncHandler(async (req: Request, res: Response) => {
  const { companyCode, page, limit } = req.query;

  interface MessageQuery {
    companyCode?: string;
  }

  const query: MessageQuery = {};
  if (companyCode && typeof companyCode === 'string') {
    query.companyCode = companyCode.toUpperCase();
  }

  // Если пользователь - компания, показываем только их сообщения
  if (req.user?.role === 'company' && req.user.companyId) {
    const CompanyModel = (await import('../models/Company')).Company;
    const company = await CompanyModel.findById(req.user.companyId);
    if (company) {
      query.companyCode = company.code;
    }
  }

  // Пагинация
  const pageNumber = page && typeof page === 'string' ? parseInt(page, 10) : 1;
  const pageSize = limit && typeof limit === 'string' ? parseInt(limit, 10) : 50;
  const skip = (pageNumber - 1) * pageSize;

  // Оптимизация: используем select для исключения ненужных полей и lean() для производительности
  const [messages, total] = await Promise.all([
    Message.find(query)
      .select('-__v') // Исключаем версию документа
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean()
      .exec(),
    Message.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: messages,
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

export const getMessageById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const message = await Message.findOne({ id });
  if (!message) {
    throw new AppError('Message not found', 404, ErrorCode.NOT_FOUND);
  }

  // Проверка доступа для компаний
  if (req.user?.role === 'company' && req.user.companyId) {
    const CompanyModel = (await import('../models/Company')).Company;
    const company = await CompanyModel.findById(req.user.companyId);
    if (company && message.companyCode !== company.code) {
      throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
    }
  }

  res.json({
    success: true,
    data: message,
  });
});

export const createMessage = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { companyCode?: string; type?: string; content?: string };
  const { companyCode, type, content } = body;

  if (!companyCode || !type || !content) {
    throw new AppError('CompanyCode, type, and content are required', 400, ErrorCode.BAD_REQUEST);
  }

  // Проверяем существование компании
  const CompanyModel = (await import('../models/Company')).Company;
  const company = await CompanyModel.findOne({ code: String(companyCode).toUpperCase() });
  if (!company) {
    throw new AppError('Company not found', 404, ErrorCode.NOT_FOUND);
  }

  // Проверяем лимиты сообщений
  if (company.messagesLimit && company.messagesLimit !== 999999) {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    // Подсчитываем сообщения за текущий месяц
    const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
    const messagesThisMonth = await Message.countDocuments({
      companyCode: company.code,
      createdAt: { $gte: startOfMonth },
    });

    if (messagesThisMonth >= company.messagesLimit) {
      throw new AppError('Message limit exceeded for this month', 403, ErrorCode.FORBIDDEN);
    }
  }

  const now = new Date().toISOString().split('T')[0];
  const messageId = generateMessageId();

  // Санитизируем контент сообщения для защиты от XSS
  const sanitizedContent = sanitizeMessageContent(String(content));

  const message = await Message.create({
    id: messageId,
    companyCode: companyCode.toUpperCase(),
    type,
    content: sanitizedContent,
    status: 'Новое',
    createdAt: now,
    updatedAt: now,
    lastUpdate: now,
  });

  // Обновляем счетчик сообщений компании
  company.messages += 1;
  const currentMonth = new Date().getMonth();
  const messageMonth = new Date(message.createdAt).getMonth();
  if (currentMonth === messageMonth) {
    company.messagesThisMonth = (company.messagesThisMonth || 0) + 1;
  }
  await company.save();

  res.status(201).json({
    success: true,
    data: message,
  });
});

export const updateMessageStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as { status?: string; response?: string };
  const { status, response } = body;

  const message = await Message.findOne({ id });
  if (!message) {
    throw new AppError('Message not found', 404, ErrorCode.NOT_FOUND);
  }

  // Проверка доступа для компаний
  if (req.user?.role === 'company' && req.user.companyId) {
    const CompanyModel = (await import('../models/Company')).Company;
    const company = await CompanyModel.findById(req.user.companyId);
    if (company && message.companyCode !== company.code) {
      throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
    }
  }

  const now = new Date().toISOString().split('T')[0];
  if (status && typeof status === 'string') {
    const validStatuses: Array<'Новое' | 'В работе' | 'Решено' | 'Отклонено' | 'Спам'> = [
      'Новое',
      'В работе',
      'Решено',
      'Отклонено',
      'Спам',
    ];
    if (validStatuses.includes(status as MessageStatus)) {
      message.status = status as MessageStatus;
    }
  }
  message.updatedAt = now;
  message.lastUpdate = now;
  if (response !== undefined && typeof response === 'string') {
    // Санитизируем ответ компании для защиты от XSS
    message.companyResponse = sanitizeMessageContent(response);
  }

  await message.save();

  res.json({
    success: true,
    data: message,
  });
});

export const moderateMessage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as { action?: string };
  const { action } = body;

  // Только админы могут модерировать сообщения
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw new AppError('Access denied', 403, ErrorCode.FORBIDDEN);
  }

  if (!action || (action !== 'approve' && action !== 'reject')) {
    throw new AppError('Action must be "approve" or "reject"', 400, ErrorCode.BAD_REQUEST);
  }

  const message = await Message.findOne({ id });
  if (!message) {
    throw new AppError('Message not found', 404, ErrorCode.NOT_FOUND);
  }

  const now = new Date().toISOString().split('T')[0];

  if (action === 'approve') {
    // При одобрении статус остается как есть или меняется на "Новое" если был отклонен
    if (message.status === 'Отклонено' || message.status === 'Спам') {
      message.status = 'Новое';
    }
  } else if (action === 'reject') {
    // При отклонении помечаем как спам
    message.status = 'Спам';
  }

  message.updatedAt = now;
  message.lastUpdate = now;

  await message.save();

  res.json({
    success: true,
    data: message,
    message: action === 'approve' ? 'Message approved' : 'Message rejected',
  });
});
