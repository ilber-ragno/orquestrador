import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { healthRoutes } from './health.routes.js';
import { instancesRoutes } from './instances.routes.js';
import { auditRoutes } from './audit.routes.js';
import { servicesRoutes } from './services.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/', healthRoutes);
router.use('/instances', instancesRoutes);
router.use('/audit', auditRoutes);
router.use('/services', servicesRoutes);

export { router as routes };
