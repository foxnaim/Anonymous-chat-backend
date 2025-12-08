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

router.get(
  '/',
  asyncHandler((req, res) => ExampleController.getAll(req, res))
);
router.get(
  '/:id',
  validate(getExampleByIdSchema),
  asyncHandler((req, res) => ExampleController.getById(req, res))
);
router.post(
  '/',
  validate(createExampleSchema),
  asyncHandler((req, res) => ExampleController.create(req, res))
);
router.put(
  '/:id',
  validate(updateExampleSchema),
  asyncHandler((req, res) => ExampleController.update(req, res))
);
router.delete(
  '/:id',
  validate(deleteExampleSchema),
  asyncHandler((req, res) => ExampleController.delete(req, res))
);

export default router;
