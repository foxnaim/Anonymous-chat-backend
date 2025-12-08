import { Router } from 'express';
import { getAdmins, createAdmin, updateAdmin } from '../controllers/AdminController';
import { validate } from '../middleware/validation';
import { createAdminSchema, updateAdminSchema } from '../validators/adminValidator';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Все роуты требуют аутентификации и прав суперадмина
router.use((req, res, next) => {
  authenticate(req, res, next);
});
router.use(authorize('super_admin'));

router.get('/', getAdmins);
router.post('/', validate(createAdminSchema), createAdmin);
router.put('/:id', validate(updateAdminSchema), updateAdmin);

export default router;
