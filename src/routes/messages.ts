import { Router } from 'express';
import {
  getAllMessages,
  getMessageById,
  createMessage,
  updateMessageStatus,
} from '../controllers/MessageController';
import { validate } from '../middleware/validation';
import {
  createMessageSchema,
  updateMessageStatusSchema,
  getMessagesSchema,
  getMessageByIdSchema,
} from '../validators/messageValidator';
import { authenticate } from '../middleware/auth';

const router = Router();

// Все роуты требуют аутентификации
router.use((req, res, next) => {
  authenticate(req, res, next);
});

/**
 * @swagger
 * /api/messages:
 *   get:
 *     summary: Get all messages
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyCode
 *         schema:
 *           type: string
 *           length: 8
 *         description: Company code to filter messages
 *     responses:
 *       200:
 *         description: List of messages
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
 */
router.get('/', validate(getMessagesSchema), getAllMessages);

/**
 * @swagger
 * /api/messages/{id}:
 *   get:
 *     summary: Get message by ID
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID
 *     responses:
 *       200:
 *         description: Message details
 *       404:
 *         description: Message not found
 */
router.get('/:id', validate(getMessageByIdSchema), getMessageById);

/**
 * @swagger
 * /api/messages:
 *   post:
 *     summary: Create a new message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyCode
 *               - type
 *               - content
 *             properties:
 *               companyCode:
 *                 type: string
 *                 length: 8
 *               type:
 *                 type: string
 *                 enum: [complaint, praise, suggestion]
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 5000
 *     responses:
 *       201:
 *         description: Message created successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Company not found
 */
router.post('/', validate(createMessageSchema), createMessage);

/**
 * @swagger
 * /api/messages/{id}/status:
 *   put:
 *     summary: Update message status
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Новое, В работе, Решено, Отклонено, Спам]
 *               response:
 *                 type: string
 *                 maxLength: 2000
 *     responses:
 *       200:
 *         description: Message status updated
 *       404:
 *         description: Message not found
 */
router.put('/:id/status', validate(updateMessageStatusSchema), updateMessageStatus);

export default router;
