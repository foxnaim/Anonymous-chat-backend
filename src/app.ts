import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env';
import { swaggerSpec } from './config/swagger';
import { morganMiddleware } from './middleware/morgan';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { initializeSentry, setupSentryErrorHandler } from './config/sentry';
import routes from './routes';

const app: Application = express();

// Initialize Sentry if DSN is provided
initializeSentry(app);

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morganMiddleware);

// Rate limiting
app.use('/api', apiLimiter);

// Swagger documentation (ленивая инициализация)
app.use('/api-docs', swaggerUi.serve as unknown as express.RequestHandler[]);
app.use(
  '/api-docs',
  swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Anonymous Chat API',
  }) as unknown as express.RequestHandler
);

// Routes
app.use('/api', routes);

// Root endpoint
app.get('/', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Anonymous Chat API',
    version: '1.0.0',
    documentation: '/api-docs',
  });
});

// 404 handler
app.use((_req: Request, res: Response, _next: NextFunction): void => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
      code: 'NOT_FOUND',
    },
  });
});

// Sentry error handler (must be before errorHandler)
setupSentryErrorHandler(app);

// Error handler (must be last)
app.use(errorHandler);

export default app;
