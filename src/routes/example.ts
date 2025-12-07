import { Router } from 'express';
import { ExampleController } from '../controllers/ExampleController';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validation';
import {
  createExampleSchema,
  updateExampleSchema,
  getExampleByIdSchema,
  deleteExampleSchema,
} from '../validators/exampleValidator';

const router = Router();

router.get('/', asyncHandler(ExampleController.getAll));
router.get(
  '/:id',
  validate(getExampleByIdSchema),
  asyncHandler(ExampleController.getById)
);
router.post('/', validate(createExampleSchema), asyncHandler(ExampleController.create));
router.put(
  '/:id',
  validate(updateExampleSchema),
  asyncHandler(ExampleController.update)
);
router.delete(
  '/:id',
  validate(deleteExampleSchema),
  asyncHandler(ExampleController.delete)
);

export default router;


