import { Router } from 'express';
import {
  getAllPlans,
  createPlan,
  getFreePlanSettings,
  updateFreePlanSettings,
} from '../controllers/PlanController';
import { validate } from '../middleware/validation';
import { createPlanSchema, updateFreePlanSettingsSchema } from '../validators/planValidator';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Публичный роут для получения всех планов
router.get('/', getAllPlans);

// Остальные роуты требуют аутентификации
router.use((req, res, next) => {
  authenticate(req, res, next);
});

router.get('/free-settings', getFreePlanSettings);
router.post('/', authorize('admin', 'super_admin'), validate(createPlanSchema), createPlan);
router.put(
  '/free-settings',
  authorize('admin', 'super_admin'),
  validate(updateFreePlanSettingsSchema),
  updateFreePlanSettings
);

export default router;
