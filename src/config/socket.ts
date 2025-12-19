import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './env';
import { logger } from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: 'admin' | 'super_admin' | 'company';
  companyId?: string;
  companyCode?: string;
}

export let io: SocketIOServer | null = null;

export const initializeSocket = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.frontendUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Middleware для аутентификации
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      // Разрешаем подключение без токена (для публичных событий)
      // Но пользователь не будет иметь доступа к защищенным комнатам
      return next();
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as {
        userId: string;
        email: string;
        role: 'admin' | 'super_admin' | 'company';
        companyId?: string;
      };

      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      socket.companyId = decoded.companyId;

      // Если пользователь - компания, получаем код компании из БД
      if (decoded.role === 'company' && decoded.companyId) {
        const CompanyModel = (await import('../models/Company')).Company;
        const company = await CompanyModel.findById(decoded.companyId);
        if (company) {
          socket.companyCode = company.code;
        }
      }

      next();
    } catch (error) {
      logger.warn('Socket authentication failed:', error);
      // Разрешаем подключение, но без аутентификации
      next();
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`Socket connected: ${socket.id}`, {
      userId: socket.userId,
      role: socket.userRole,
      companyCode: socket.companyCode,
    });

    // Подключаем пользователя к соответствующим комнатам
    if (socket.userRole === 'admin' || socket.userRole === 'super_admin') {
      // Админы подключаются к комнате всех сообщений
      socket.join('admin:messages');
      logger.info(`Admin ${socket.userId} joined admin:messages room`);
    } else if (socket.userRole === 'company' && socket.companyCode) {
      // Компании подключаются к комнате своих сообщений
      socket.join(`company:${socket.companyCode}`);
      logger.info(`Company ${socket.companyCode} joined company:${socket.companyCode} room`);
    }

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });

    socket.on('error', (error) => {
      logger.error('Socket error:', error);
    });
  });

  logger.info('Socket.IO server initialized');
  return io;
};

/**
 * Отправить событие о новом сообщении
 */
export const emitNewMessage = (message: any) => {
  if (!io) return;

  // Отправляем всем админам
  io.to('admin:messages').emit('message:new', message);

  // Отправляем компании, которой принадлежит сообщение
  if (message.companyCode) {
    io.to(`company:${message.companyCode}`).emit('message:new', message);
  }

  logger.info(`Emitted message:new event for message ${message.id}`);
};

/**
 * Отправить событие об обновлении сообщения
 */
export const emitMessageUpdate = (message: any) => {
  if (!io) return;

  // Отправляем всем админам
  io.to('admin:messages').emit('message:updated', message);

  // Отправляем компании, которой принадлежит сообщение
  if (message.companyCode) {
    io.to(`company:${message.companyCode}`).emit('message:updated', message);
  }

  logger.info(`Emitted message:updated event for message ${message.id}`);
};

/**
 * Отправить событие об удалении сообщения
 */
export const emitMessageDelete = (messageId: string, companyCode: string) => {
  if (!io) return;

  // Отправляем всем админам
  io.to('admin:messages').emit('message:deleted', { id: messageId, companyCode });

  // Отправляем компании
  if (companyCode) {
    io.to(`company:${companyCode}`).emit('message:deleted', { id: messageId, companyCode });
  }

  logger.info(`Emitted message:deleted event for message ${messageId}`);
};

