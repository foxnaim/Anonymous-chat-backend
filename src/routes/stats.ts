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

router.get('/company/:id', validate(getCompanyStatsSchema), getCompanyStatsController);
router.get(
  '/distribution/:id',
  validate(getMessageDistributionSchema),
  getMessageDistributionController
);
router.get('/growth/:id', validate(getGrowthMetricsSchema), getGrowthMetricsController);
router.get('/achievements/:id', validate(getAchievementsSchema), getAchievementsController);
router.get(
  '/achievements/:id/grouped',
  validate(getAchievementsSchema),
  getGroupedAchievementsController
);
router.get('/platform', getPlatformStatsController);

export default router;
