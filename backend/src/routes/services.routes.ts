import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';
import * as systemService from '../services/system.service.js';

const router = Router();

// GET /services - List all systemd services (filtered)
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pattern = req.query.pattern as string | undefined;
    const services = await systemService.listServices(pattern);
    res.json(services);
  } catch (err) {
    next(err);
  }
});

// GET /services/:name/status - Detailed service status
router.get('/:name/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const info = await systemService.getServiceStatus(req.params.name as string);
    if (!info) {
      return next(new AppError(404, 'NOT_FOUND', `Service '${req.params.name as string}' not found`));
    }
    res.json(info);
  } catch (err) {
    next(err);
  }
});

// POST /services/:name/:action - Control service (start/stop/restart/enable/disable)
const serviceActionSchema = z.object({});

router.post(
  '/:name/:action',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = req.params.name as string;
      const action = req.params.action as string;
      const validActions = ['start', 'stop', 'restart', 'enable', 'disable'];
      if (!validActions.includes(action)) {
        return next(new AppError(400, 'INVALID_ACTION', `Invalid action '${action}'. Valid: ${validActions.join(', ')}`));
      }

      // Audit before action
      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: `service.${action}`,
          resource: 'service',
          resourceId: name,
          details: { service: name, action },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          correlationId: req.correlationId,
        },
      });

      const result = await systemService.controlService(
        name,
        action as 'start' | 'stop' | 'restart' | 'enable' | 'disable',
      );

      // Get updated status
      const status = await systemService.getServiceStatus(name);

      res.json({
        success: result.success,
        output: result.output,
        status,
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as servicesRoutes };
