import { Router } from 'express';
import {
  getAllCompanies,
  getCompanyById,
  getCompanyByCode,
  createCompany,
  updateCompany,
  updateCompanyStatus,
  updateCompanyPlan,
  deleteCompany,
} from '../controllers/CompanyController';
import { validate } from '../middleware/validation';
import {
  createCompanySchema,
  updateCompanySchema,
  getCompanyByIdSchema,
  getCompanyByCodeSchema,
  updateCompanyStatusSchema,
  updateCompanyPlanSchema,
} from '../validators/companyValidator';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /api/companies/code/{code}:
 *   get:
 *     summary: Get company by code (public)
 *     tags: [Companies]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *           length: 8
 *         description: Company code
 *     responses:
 *       200:
 *         description: Company details
 *       404:
 *         description: Company not found
 */
router.get('/code/:code', validate(getCompanyByCodeSchema), getCompanyByCode);

// Остальные роуты требуют аутентификации
router.use((req, res, next) => {
  authenticate(req, res, next);
});

/**
 * @swagger
 * /api/companies:
 *   get:
 *     summary: Get all companies (admin only, with pagination)
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of companies with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       403:
 *         description: Forbidden
 */
router.get('/', authorize('admin', 'super_admin'), getAllCompanies);

/**
 * @swagger
 * /api/companies/{id}:
 *   get:
 *     summary: Get company by ID
 *     tags: [Companies]
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
 *         description: Company details
 *       404:
 *         description: Company not found
 */
router.get('/:id', validate(getCompanyByIdSchema), getCompanyById);

/**
 * @swagger
 * /api/companies:
 *   post:
 *     summary: Create a new company (admin only)
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Company created successfully
 *       403:
 *         description: Forbidden
 */
router.post('/', authorize('admin', 'super_admin'), validate(createCompanySchema), createCompany);

/**
 * @swagger
 * /api/companies/{id}:
 *   put:
 *     summary: Update company
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Company updated
 *       404:
 *         description: Company not found
 */
router.put('/:id', validate(updateCompanySchema), updateCompany);

/**
 * @swagger
 * /api/companies/{id}/status:
 *   put:
 *     summary: Update company status (admin only)
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Company status updated
 *       403:
 *         description: Forbidden
 */
router.put(
  '/:id/status',
  authorize('admin', 'super_admin'),
  validate(updateCompanyStatusSchema),
  updateCompanyStatus
);

/**
 * @swagger
 * /api/companies/{id}/plan:
 *   put:
 *     summary: Update company plan (admin only)
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Company plan updated
 *       403:
 *         description: Forbidden
 */
router.put(
  '/:id/plan',
  authorize('admin', 'super_admin'),
  validate(updateCompanyPlanSchema),
  updateCompanyPlan
);

/**
 * @swagger
 * /api/companies/{id}:
 *   delete:
 *     summary: Delete company (admin only)
 *     tags: [Companies]
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
 *         description: Company deleted successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Company not found
 */
router.delete('/:id', authorize('admin', 'super_admin'), deleteCompany);

export default router;
