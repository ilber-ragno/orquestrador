import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { healthRoutes } from './health.routes.js';
import { instancesRoutes } from './instances.routes.js';
import { auditRoutes } from './audit.routes.js';
import { servicesRoutes } from './services.routes.js';
import { providersRoutes } from './providers.routes.js';
import { diagnosticsRoutes } from './diagnostics.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/', healthRoutes);
router.use('/instances', instancesRoutes);
router.use('/audit', auditRoutes);
router.use('/services', servicesRoutes);
router.use('/instances', providersRoutes);
router.use('/diagnostics', diagnosticsRoutes);

export { router as routes };
