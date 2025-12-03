import { Router } from 'express';
import healthRoutes from './health';
import exampleRoutes from './example';

const router = Router();

router.use('/health', healthRoutes);
router.use('/examples', exampleRoutes);

export default router;

