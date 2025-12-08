import { Router } from 'express';
import {
  getAllCompanies,
  getCompanyById,
  getCompanyByCode,
  createCompany,
  updateCompany,
  updateCompanyStatus,
  updateCompanyPlan,
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

// Публичный роут для получения компании по коду
router.get('/code/:code', validate(getCompanyByCodeSchema), getCompanyByCode);

// Остальные роуты требуют аутентификации
router.use((req, res, next) => {
  authenticate(req, res, next);
});

router.get('/', authorize('admin', 'super_admin'), getAllCompanies);
router.get('/:id', validate(getCompanyByIdSchema), getCompanyById);
router.post('/', authorize('admin', 'super_admin'), validate(createCompanySchema), createCompany);
router.put('/:id', validate(updateCompanySchema), updateCompany);
router.put(
  '/:id/status',
  authorize('admin', 'super_admin'),
  validate(updateCompanyStatusSchema),
  updateCompanyStatus
);
router.put(
  '/:id/plan',
  authorize('admin', 'super_admin'),
  validate(updateCompanyPlanSchema),
  updateCompanyPlan
);

export default router;
