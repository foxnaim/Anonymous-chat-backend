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

/**
 * @swagger
 * /api/plans:
 *   get:
 *     summary: Get all plans (public)
 *     tags: [Plans]
 *     responses:
 *       200:
 *         description: List of plans
 */
router.get('/', getAllPlans);

/**
 * @swagger
 * /api/plans/free-settings:
 *   get:
 *     summary: Get free plan settings (public)
 *     tags: [Plans]
 *     description: Получение настроек бесплатного плана (количество дней пробного периода и т.д.). Публичный endpoint, так как используется на странице регистрации.
 *     responses:
 *       200:
 *         description: Free plan settings
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
 *                     messagesLimit:
 *                       type: integer
 *                     storageLimit:
 *                       type: number
 *                     freePeriodDays:
 *                       type: integer
 */
// Получение настроек бесплатного плана - публичный endpoint (нужен для страницы регистрации)
router.get('/free-settings', getFreePlanSettings);

// Остальные роуты требуют аутентификации
router.use((req, res, next) => {
  authenticate(req, res, next);
});

/**
 * @swagger
 * /api/plans:
 *   post:
 *     summary: Create a new plan (admin only)
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - messagesLimit
 *               - storageLimit
 *               - features
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               messagesLimit:
 *                 type: integer
 *               storageLimit:
 *                 type: number
 *               features:
 *                 type: array
 *               isFree:
 *                 type: boolean
 *               freePeriodDays:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Plan created successfully
 *       403:
 *         description: Forbidden
 */
router.post('/', authorize('admin', 'super_admin'), validate(createPlanSchema), createPlan);

/**
 * @swagger
 * /api/plans/free-settings:
 *   put:
 *     summary: Update free plan settings (admin only)
 *     tags: [Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messagesLimit
 *               - storageLimit
 *               - freePeriodDays
 *             properties:
 *               messagesLimit:
 *                 type: integer
 *               storageLimit:
 *                 type: number
 *               freePeriodDays:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Free plan settings updated
 *       403:
 *         description: Forbidden
 */
router.put(
  '/free-settings',
  authorize('admin', 'super_admin'),
  validate(updateFreePlanSettingsSchema),
  updateFreePlanSettings
);

export default router;
