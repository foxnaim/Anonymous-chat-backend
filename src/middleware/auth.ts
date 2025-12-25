import { Request, Response, NextFunction } from "express";
import { verifyToken, JWTPayload, TokenError } from "../utils/jwt";
import { AppError, ErrorCode } from "../utils/AppError";

// Расширяем Request для добавления user
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(
        new AppError("No token provided", 401, ErrorCode.UNAUTHORIZED),
      );
    }

    const token = authHeader.substring(7); // Убираем "Bearer "

    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof TokenError) {
      const message =
        error.code === "EXPIRED"
          ? "Token has expired. Please login again"
          : error.code === "MALFORMED"
            ? "Invalid token format"
            : "Invalid token";
      return next(new AppError(message, 401, ErrorCode.UNAUTHORIZED));
    }
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError("Authentication failed", 401, ErrorCode.UNAUTHORIZED));
    }
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(
        new AppError("Authentication required", 401, ErrorCode.UNAUTHORIZED),
      );
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("Insufficient permissions", 403, ErrorCode.FORBIDDEN),
      );
    }

    next();
  };
};

// Middleware для проверки, что пользователь является владельцем компании или админом
export const authorizeCompany = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    return next(
      new AppError("Authentication required", 401, ErrorCode.UNAUTHORIZED),
    );
  }

  // Админы и суперадмины имеют доступ ко всему
  if (req.user.role === "admin" || req.user.role === "super_admin") {
    return next();
  }

  // Для компаний проверяем, что они работают со своей компанией
  if (req.user.role === "company") {
    const companyId =
      req.params.companyId ||
      (req.body as { companyId?: string }).companyId ||
      (req.query as { companyId?: string }).companyId;
    if (companyId && req.user.companyId?.toString() !== String(companyId)) {
      return next(
        new AppError("Access denied to this company", 403, ErrorCode.FORBIDDEN),
      );
    }
  }

  next();
};
