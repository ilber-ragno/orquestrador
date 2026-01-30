import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import * as lxc from '../services/lxc.service.js';
import * as jobService from '../services/job.service.js';

const router = Router();

// GET /containers - List all LXC containers from host
router.get('/', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Get instances with container mapping
    const instances = await prisma.instance.findMany({
      where: { containerName: { not: null } },
      select: { id: true, name: true, slug: true, containerName: true, containerHost: true, containerType: true, gatewayStatus: true, planId: true },
    });

    // Group by host
    const hosts = [...new Set(instances.map((i) => i.containerHost).filter(Boolean))] as string[];
    const containers: any[] = [];

    for (const host of hosts) {
      try {
        const hostContainers = await lxc.listContainers(host);
        for (const c of hostContainers) {
          const mapped = instances.find((i) => i.containerName === c.name && i.containerHost === host);
          containers.push({ ...c, host, instance: mapped || null });
        }
      } catch (err: any) {
        containers.push({ name: `[${host}]`, status: 'unreachable', error: err.message, host, instance: null });
      }
    }

    res.json(containers);
  } catch (err) {
    next(err);
  }
});

// GET /containers/:instanceId/status - Container status for instance
router.get('/:instanceId/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({ where: { id: req.params.instanceId } });
    if (!inst || !inst.containerName || !inst.containerHost) {
      return res.status(404).json({ error: { message: 'Instance has no container mapping' } });
    }

    const status = await lxc.getContainerStatus(inst.containerHost, inst.containerName);
    res.json({ instance: { id: inst.id, name: inst.name, slug: inst.slug }, container: status });
  } catch (err) {
    next(err);
  }
});

// POST /containers/:instanceId/:action - Control container (start/stop/restart)
router.post(
  '/:instanceId/:action',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const action = req.params.action as 'start' | 'stop' | 'restart';
      if (!['start', 'stop', 'restart'].includes(action)) {
        return res.status(400).json({ error: { message: 'Invalid action. Use start, stop, or restart' } });
      }

      const inst = await prisma.instance.findUnique({ where: { id: req.params.instanceId } });
      if (!inst || !inst.containerName || !inst.containerHost) {
        return res.status(404).json({ error: { message: 'Instance has no container mapping' } });
      }

      // Create job for the action
      const job = await jobService.createJob({
        userId: req.user!.sub,
        instanceId: inst.id,
        type: `container.${action}`,
        description: `${action} container ${inst.containerName}`,
        steps: [`${action} container`],
      });

      await jobService.startJob(job.id);
      const step = job.steps[0];
      await jobService.startStep(step.id);

      try {
        const result = await lxc.controlContainer(inst.containerHost, inst.containerName, action);
        await jobService.completeStep(step.id, JSON.stringify(result));
        await jobService.completeJob(job.id, result);

        await prisma.auditLog.create({
          data: {
            userId: req.user!.sub,
            action: `container.${action}`,
            resource: 'container',
            resourceId: inst.id,
            details: { containerName: inst.containerName, result } as any,
            ipAddress: req.ip,
            correlationId: req.correlationId,
          },
        });

        res.json({ success: true, job: job.id, result });
      } catch (err: any) {
        await jobService.failStep(step.id, err.message);
        await jobService.failJob(job.id, err.message);
        res.status(500).json({ error: { message: err.message }, job: job.id });
      }
    } catch (err) {
      next(err);
    }
  },
);

// POST /containers/:instanceId/exec - Execute command in container
router.post(
  '/:instanceId/exec',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inst = await prisma.instance.findUnique({ where: { id: req.params.instanceId } });
      if (!inst || !inst.containerName || !inst.containerHost) {
        return res.status(404).json({ error: { message: 'Instance has no container mapping' } });
      }

      const { command } = req.body;
      if (!command) return res.status(400).json({ error: { message: 'command is required' } });

      const result = await lxc.execInContainer(inst.containerHost, inst.containerName, command);

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'container.exec',
          resource: 'container',
          resourceId: inst.id,
          details: { containerName: inst.containerName, command, exitCode: result.exitCode } as any,
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /containers/:instanceId/logs - Get container logs
router.get('/:instanceId/logs', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({ where: { id: req.params.instanceId } });
    if (!inst || !inst.containerName || !inst.containerHost) {
      return res.status(404).json({ error: { message: 'Instance has no container mapping' } });
    }

    const lines = Math.min(500, parseInt(req.query.lines as string) || 50);
    const logs = await lxc.getContainerLogs(inst.containerHost, inst.containerName, lines);
    res.json({ logs, container: inst.containerName, lines });
  } catch (err) {
    next(err);
  }
});

// GET /containers/:instanceId/services - List services in container
router.get('/:instanceId/services', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({ where: { id: req.params.instanceId } });
    if (!inst || !inst.containerName || !inst.containerHost) {
      return res.status(404).json({ error: { message: 'Instance has no container mapping' } });
    }

    const services = await lxc.getContainerServices(inst.containerHost, inst.containerName);
    res.json(services);
  } catch (err) {
    next(err);
  }
});

export { router as containersRoutes };
