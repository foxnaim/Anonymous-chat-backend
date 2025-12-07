import morgan from 'morgan';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

const stream = {
  write: (message: string): void => {
    logger.info(message.trim());
  },
};

const skip = (): boolean => {
  return process.env.NODE_ENV === 'test';
};

export const morganMiddleware = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  { stream, skip }
);


