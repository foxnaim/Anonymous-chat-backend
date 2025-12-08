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

router.get('/', validate(getMessagesSchema), getAllMessages);
router.get('/:id', validate(getMessageByIdSchema), getMessageById);
router.post('/', validate(createMessageSchema), createMessage);
router.put('/:id/status', validate(updateMessageStatusSchema), updateMessageStatus);

export default router;
