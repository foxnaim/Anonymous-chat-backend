import { Router } from 'express';
import {
  getCompanyStatsController,
  getMessageDistributionController,
  getGrowthMetricsController,
  getAchievementsController,
  getGroupedAchievementsController,
  getPlatformStatsController,
} from '../controllers/StatsController';
import { validate } from '../middleware/validation';
import {
  getCompanyStatsSchema,
  getMessageDistributionSchema,
  getGrowthMetricsSchema,
  getAchievementsSchema,
} from '../validators/statsValidator';
import { authenticate } from '../middleware/auth';

const router = Router();

// Все роуты требуют аутентификации
router.use((req, res, next) => {
  authenticate(req, res, next);
});

/**
 * @swagger
 * /api/stats/company/{id}:
 *   get:
 *     summary: Get company statistics
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Company statistics
 */
router.get('/company/:id', validate(getCompanyStatsSchema), getCompanyStatsController);

/**
 * @swagger
 * /api/stats/distribution/{id}:
 *   get:
 *     summary: Get message distribution for company
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Message distribution data
 */
router.get(
  '/distribution/:id',
  validate(getMessageDistributionSchema),
  getMessageDistributionController
);

/**
 * @swagger
 * /api/stats/growth/{id}:
 *   get:
 *     summary: Get growth metrics for company
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Growth metrics
 */
router.get('/growth/:id', validate(getGrowthMetricsSchema), getGrowthMetricsController);

/**
 * @swagger
 * /api/stats/achievements/{id}:
 *   get:
 *     summary: Get achievements for company
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Achievements data
 */
router.get('/achievements/:id', validate(getAchievementsSchema), getAchievementsController);

/**
 * @swagger
 * /api/stats/achievements/{id}/grouped:
 *   get:
 *     summary: Get grouped achievements for company
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Grouped achievements data
 */
router.get(
  '/achievements/:id/grouped',
  validate(getAchievementsSchema),
  getGroupedAchievementsController
);

/**
 * @swagger
 * /api/stats/platform:
 *   get:
 *     summary: Get platform statistics
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform statistics
 */
router.get('/platform', getPlatformStatsController);

export default router;
