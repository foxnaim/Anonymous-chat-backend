import rateLimit from "express-rate-limit";
import { config } from "../config/env";

/**
 * Rate limiter для API endpoints
 * Защита от злоупотреблений и DDoS атак
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: config.nodeEnv === "production" ? 100 : 1000, // Максимум запросов за окно
  message: {
    success: false,
    error: {
      message: "Too many requests from this IP, please try again later.",
      code: "TOO_MANY_REQUESTS",
    },
  },
  standardHeaders: true, // Возвращает информацию о лимите в заголовках `RateLimit-*`
  legacyHeaders: false, // Отключает заголовки `X-RateLimit-*`
});
