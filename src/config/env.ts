import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  corsOrigin: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  sentryDsn: string | undefined;
  sentryEnvironment: string;
  logLevel: string;
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
  corsOrigin: getEnvVar('CORS_ORIGIN', 'http://localhost:3000'),
  rateLimitWindowMs: parseInt(getEnvVar('RATE_LIMIT_WINDOW_MS', '900000'), 10),
  rateLimitMaxRequests: parseInt(getEnvVar('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
  sentryDsn: process.env.SENTRY_DSN,
  sentryEnvironment: getEnvVar('SENTRY_ENVIRONMENT', 'development'),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
};


