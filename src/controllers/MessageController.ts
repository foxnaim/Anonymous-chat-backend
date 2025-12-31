import { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { AppError, ErrorCode } from "../utils/AppError";
import { Message, MessageStatus, type IMessage } from "../models/Message";
import { sanitizeMessageContent } from "../utils/sanitize";
import {
  emitNewMessage,
  emitMessageUpdate,
  emitMessageDelete,
} from "../config/socket";

// Генерация ID сообщения в формате FB-YYYY-XXXXXX
const generateMessageId = (): string => {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `FB-${year}-${random}`;
};

export const getAllMessages = asyncHandler(
  async (req: Request, res: Response) => {
    const { companyCode, page, limit, messageId } = req.query;

    interface MessageQuery {
      companyCode?: string;
      id?: { $regex: string; $options: string };
    }

    const query: MessageQuery = {};
    
    // Поиск по ID сообщения (без учета регистра и дефисов)
    if (messageId && typeof messageId === "string" && messageId.trim().length > 0) {
      // Нормализуем ID: убираем дефисы и пробелы, приводим к верхнему регистру
      const normalizedId = messageId.replace(/[-_\s]/g, '').toUpperCase().trim();
      if (normalizedId.length > 0) {
        // Экранируем специальные символы regex и ищем по ID без учета регистра
        const escapedId = normalizedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.id = { 
          $regex: escapedId, 
          $options: 'i' 
        };
      }
    }
    
    if (companyCode && typeof companyCode === "string") {
      query.companyCode = companyCode.toUpperCase();
    }

    // Если пользователь - компания, показываем только их сообщения
    if (req.user?.role === "company" && req.user.companyId) {
      const CompanyModel = (await import("../models/Company")).Company;
      const company = await CompanyModel.findById(req.user.companyId);
      if (company) {
        query.companyCode = company.code;
      }
    }

    // Если ищем по ID, не применяем пагинацию или увеличиваем лимит
    const isSearchingById = !!messageId;
    const pageNumber =
      page && typeof page === "string" ? parseInt(page, 10) : 1;
    const pageSize = isSearchingById
      ? 1000 // Большой лимит для поиска по ID
      : limit && typeof limit === "string" ? parseInt(limit, 10) : 50;
    const skip = isSearchingById ? 0 : (pageNumber - 1) * pageSize;

    // Оптимизация: используем select для исключения ненужных полей и lean() для производительности
    const [messages, total] = await Promise.all([
      Message.find(query)
        .select("-__v") // Исключаем версию документа
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
  },
);

export const getMessageById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const message = await Message.findOne({ id });
    if (!message) {
      throw new AppError("Message not found", 404, ErrorCode.NOT_FOUND);
    }

    // Проверка доступа для компаний
    if (req.user?.role === "company" && req.user.companyId) {
      const CompanyModel = (await import("../models/Company")).Company;
      const company = await CompanyModel.findById(req.user.companyId);
      if (company && message.companyCode !== company.code) {
        throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
      }
    }

    res.json({
      success: true,
      data: message,
    });
  },
);

export const createMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const body = req.body as {
      companyCode?: string;
      type?: string;
      content?: string;
    };
    const { companyCode, type, content } = body;

    if (!companyCode || !type || !content) {
      throw new AppError(
        "CompanyCode, type, and content are required",
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    // Проверяем существование компании
    const CompanyModel = (await import("../models/Company")).Company;
    const company = await CompanyModel.findOne({
      code: String(companyCode).toUpperCase(),
    });
    if (!company) {
      throw new AppError("Company not found", 404, ErrorCode.NOT_FOUND);
    }

    // Проверяем лимиты сообщений
    if (company.messagesLimit && company.messagesLimit !== 999999) {
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      // Подсчитываем сообщения за текущий месяц
      const startOfMonth = new Date(currentYear, currentMonth, 1)
        .toISOString()
        .split("T")[0];
      const messagesThisMonth = await Message.countDocuments({
        companyCode: company.code,
        createdAt: { $gte: startOfMonth },
      });

      if (messagesThisMonth >= company.messagesLimit) {
        throw new AppError(
          "Message limit exceeded for this month",
          403,
          ErrorCode.FORBIDDEN,
        );
      }
    }

    const now = new Date().toISOString().split("T")[0];
    const messageId = generateMessageId();

    // Санитизируем контент сообщения для защиты от XSS
    const sanitizedContent = sanitizeMessageContent(String(content));

    const message = await Message.create({
      id: messageId,
      companyCode: companyCode.toUpperCase(),
      type,
      content: sanitizedContent,
      status: "Новое",
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

    // Отправляем событие через WebSocket
    emitNewMessage(JSON.parse(JSON.stringify(message)) as IMessage);

    res.status(201).json({
      success: true,
      data: message,
    });
  },
);

export const updateMessageStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as { status?: string; response?: string };
    const { status, response } = body;

    const message = await Message.findOne({ id });
    if (!message) {
      throw new AppError("Message not found", 404, ErrorCode.NOT_FOUND);
    }

    // Проверка доступа для компаний
    if (req.user?.role === "company" && req.user.companyId) {
      const CompanyModel = (await import("../models/Company")).Company;
      const company = await CompanyModel.findById(req.user.companyId);
      if (company && message.companyCode !== company.code) {
        throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
      }
    }

    // Блокируем изменение статуса и ответа для сообщений, отклоненных админом
    // (статус "Спам" с previousStatus означает, что сообщение было отклонено админом)
    const isRejectedByAdmin =
      message.status === "Спам" && message.previousStatus;

    if (isRejectedByAdmin) {
      if (status) {
        throw new AppError(
          "Cannot modify status of message rejected by admin",
          403,
          ErrorCode.FORBIDDEN,
        );
      }
      if (response !== undefined) {
        throw new AppError(
          "Cannot modify response for message rejected by admin",
          403,
          ErrorCode.FORBIDDEN,
        );
      }
    }

    const now = new Date().toISOString().split("T")[0];
    if (status && typeof status === "string") {
      const validStatuses: Array<
        "Новое" | "В работе" | "Решено" | "Отклонено" | "Спам"
      > = ["Новое", "В работе", "Решено", "Отклонено", "Спам"];
      if (validStatuses.includes(status as MessageStatus)) {
        message.status = status as MessageStatus;
      }
    }
    message.updatedAt = now;
    message.lastUpdate = now;
    if (response !== undefined && typeof response === "string") {
      // Санитизируем ответ компании для защиты от XSS
      message.companyResponse = sanitizeMessageContent(response);
    }

    await message.save();

    // Отправляем событие через WebSocket
    emitMessageUpdate(JSON.parse(JSON.stringify(message)) as IMessage);

    res.json({
      success: true,
      data: message,
    });
  },
);

export const moderateMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as { action?: string };
    const { action } = body;

    // Только админы могут модерировать сообщения
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
    }

    if (!action || (action !== "approve" && action !== "reject")) {
      throw new AppError(
        'Action must be "approve" or "reject"',
        400,
        ErrorCode.BAD_REQUEST,
      );
    }

    const message = await Message.findOne({ id });
    if (!message) {
      throw new AppError("Message not found", 404, ErrorCode.NOT_FOUND);
    }

    const now = new Date().toISOString().split("T")[0];

    if (action === "approve") {
      // При одобрении: если был спам и есть previousStatus, возвращаем предыдущий статус
      if (message.status === "Спам" && message.previousStatus) {
        message.status = message.previousStatus;
        message.previousStatus = undefined;
      }
      // Иначе статус остается как есть
    } else if (action === "reject") {
      // При отклонении: сохраняем текущий статус в previousStatus (если он не "Спам")
      // и помечаем как спам
      if (message.status !== "Спам") {
        message.previousStatus = message.status;
      }
      message.status = "Спам";
    }

    message.updatedAt = now;
    message.lastUpdate = now;

    await message.save();

    // Отправляем событие через WebSocket
    emitMessageUpdate(JSON.parse(JSON.stringify(message)) as IMessage);

    res.json({
      success: true,
      data: message,
      message: action === "approve" ? "Message approved" : "Message rejected",
    });
  },
);

export const deleteMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Только админы могут удалять сообщения
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      throw new AppError("Access denied", 403, ErrorCode.FORBIDDEN);
    }

    const message = await Message.findOne({ id });
    if (!message) {
      throw new AppError("Message not found", 404, ErrorCode.NOT_FOUND);
    }

    // Удаляем сообщение
    await Message.deleteOne({ id });

    // Обновляем счетчик сообщений компании
    const CompanyModel = (await import("../models/Company")).Company;
    const company = await CompanyModel.findOne({ code: message.companyCode });
    if (company) {
      company.messages = Math.max(0, (company.messages || 0) - 1);

      // Обновляем счетчик сообщений за текущий месяц
      const currentMonth = new Date().getMonth();
      const messageMonth = new Date(message.createdAt).getMonth();
      if (currentMonth === messageMonth) {
        company.messagesThisMonth = Math.max(
          0,
          (company.messagesThisMonth || 0) - 1,
        );
      }

      await company.save();
    }

    // Отправляем событие через WebSocket
    emitMessageDelete(id, message.companyCode);

    res.json({
      success: true,
      message: "Message deleted successfully",
    });
  },
);
