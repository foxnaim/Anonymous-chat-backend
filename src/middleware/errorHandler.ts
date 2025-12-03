import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, {
      statusCode: err.statusCode,
      code: err.code,
      path: req.path,
      method: req.method,
    });

    const errorResponse: any = {
      success: false,
      error: {
        message: err.message,
        code: err.code,
      },
    };

    // Add validation details if present
    if ((err as any).details) {
      errorResponse.error.details = (err as any).details;
    }

    // Add stack trace in development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.error.stack = err.stack;
    }

    res.status(err.statusCode).json(errorResponse);
    return;
  }

  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

