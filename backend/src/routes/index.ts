import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { healthRoutes } from './health.routes.js';
import { instancesRoutes } from './instances.routes.js';
import { auditRoutes } from './audit.routes.js';
import { servicesRoutes } from './services.routes.js';
import { providersRoutes } from './providers.routes.js';
import { diagnosticsRoutes } from './diagnostics.routes.js';
import { jobsRoutes } from './jobs.routes.js';
import { containersRoutes } from './containers.routes.js';
import { gatewayRoutes } from './gateway.routes.js';
import { plansRoutes } from './plans.routes.js';
import { setupRoutes } from './setup.routes.js';
import { securityRoutes } from './security.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/', healthRoutes);
router.use('/instances', instancesRoutes);
router.use('/audit', auditRoutes);
router.use('/services', servicesRoutes);
router.use('/instances', providersRoutes);
router.use('/diagnostics', diagnosticsRoutes);
router.use('/jobs', jobsRoutes);
router.use('/containers', containersRoutes);
router.use('/instances', gatewayRoutes);
router.use('/plans', plansRoutes);
router.use('/instances', setupRoutes);
router.use('/security', securityRoutes);

export { router as routes };
