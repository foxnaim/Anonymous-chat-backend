import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  frontendUrl: string; // Используется для CORS и генерации ссылок
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  sentryDsn: string | undefined;
  sentryEnvironment: string;
  logLevel: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  // Email/SMTP настройки
  smtpHost: string | undefined;
  smtpPort: number;
  smtpUser: string | undefined;
  smtpPassword: string | undefined;
  smtpFrom: string | undefined;
  smtpSecure: boolean;
}

const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value || defaultValue || '';
};

export const config: EnvConfig = {
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  port: parseInt(getEnvVar('PORT', '3001'), 10),
  mongodbUri: getEnvVar('MONGODB_URI', 'mongodb://localhost:27017/anonymous-chat'),
  frontendUrl: getEnvVar('FRONTEND_URL', 'http://localhost:3000'),
  rateLimitWindowMs: parseInt(getEnvVar('RATE_LIMIT_WINDOW_MS', '900000'), 10),
  rateLimitMaxRequests: parseInt(getEnvVar('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
  sentryDsn: process.env.SENTRY_DSN,
  sentryEnvironment: getEnvVar('SENTRY_ENVIRONMENT', 'development'),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
  jwtSecret: getEnvVar('JWT_SECRET', 'your-secret-key-change-in-production'),
  jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', '7d'),
  // Email/SMTP настройки
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(getEnvVar('SMTP_PORT', '587'), 10),
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  smtpFrom: process.env.SMTP_FROM,
  smtpSecure: getEnvVar('SMTP_SECURE', 'false') === 'true',
};
