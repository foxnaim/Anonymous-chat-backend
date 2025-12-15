import { Router } from 'express';
import { getAdmins, createAdmin, updateAdmin, deleteAdmin } from '../controllers/AdminController';
import { validate } from '../middleware/validation';
import { createAdminSchema, updateAdminSchema } from '../validators/adminValidator';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Все роуты требуют аутентификации и прав суперадмина
router.use((req, res, next) => {
  authenticate(req, res, next);
});
router.use(authorize('super_admin'));

/**
 * @swagger
 * /api/admins:
 *   get:
 *     summary: Get all admins (super admin only)
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of admins
 *       403:
 *         description: Forbidden
 */
router.get('/', getAdmins);

/**
 * @swagger
 * /api/admins:
 *   post:
 *     summary: Create a new admin (super admin only)
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, super_admin]
 *     responses:
 *       201:
 *         description: Admin created successfully
 *       403:
 *         description: Forbidden
 */
router.post('/', validate(createAdminSchema), createAdmin);

/**
 * @swagger
 * /api/admins/{id}:
 *   put:
 *     summary: Update admin (super admin only)
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, super_admin]
 *     responses:
 *       200:
 *         description: Admin updated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Admin not found
 */
router.put('/:id', validate(updateAdminSchema), updateAdmin);

/**
 * @swagger
 * /api/admins/{id}:
 *   delete:
 *     summary: Delete admin (super admin only)
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin ID
 *     responses:
 *       200:
 *         description: Admin deleted successfully
 *       403:
 *         description: Forbidden (cannot delete super admin or yourself)
 *       404:
 *         description: Admin not found
 */
router.delete('/:id', deleteAdmin);

export default router;
