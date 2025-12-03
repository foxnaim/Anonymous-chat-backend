import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError, ErrorCode } from '../utils/AppError';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        const validationError = new AppError(
          'Validation error',
          400,
          ErrorCode.VALIDATION_ERROR,
          true
        );
        (validationError as any).details = errorMessages;
        throw validationError;
      }
      next(error);
    }
  };
};

