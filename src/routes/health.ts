import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import mongoose from 'mongoose';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     uptime:
 *                       type: number
 *                     message:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                     environment:
 *                       type: string
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *       503:
 *         description: Service is unhealthy
 */
router.get(
  '/health',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const healthCheck = {
      uptime: process.uptime(),
      message: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      },
    };

    const statusCode = healthCheck.database.status === 'connected' ? 200 : 503;

    res.status(statusCode).json({
      success: true,
      data: healthCheck,
    });
  })
);

export default router;
