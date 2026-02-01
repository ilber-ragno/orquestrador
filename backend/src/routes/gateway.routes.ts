import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { randomBytes } from 'crypto';
import * as openclaw from '../services/openclaw.service.js';
import * as jobService from '../services/job.service.js';

const router = Router();

// GET /:instId/gateway - Get gateway config
router.get('/:instId/gateway', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({
      where: { id: req.params.instId as string },
      select: { id: true, name: true, gatewayMode: true, gatewayBind: true, gatewayPort: true, gatewayToken: true, gatewayStatus: true, containerName: true, containerHost: true },
    });
    if (!inst) return res.status(404).json({ error: { message: 'Instance not found' } });

    // Try reading live status from container
    let liveRunning = false;
    let livePid: number | null = null;
    if (inst.containerHost && inst.containerName) {
      try {
        const gw = await openclaw.getGatewayStatus(inst.containerHost, inst.containerName);
        liveRunning = gw.running;
        livePid = gw.pid;
      } catch {}
    }

    res.json({
      mode: inst.gatewayMode || 'local',
      bind: inst.gatewayBind || '0.0.0.0',
      port: inst.gatewayPort || 18789,
      token: inst.gatewayToken ? `${inst.gatewayToken.slice(0, 8)}****` : null,
      status: liveRunning ? 'running' : (inst.gatewayStatus || 'stopped'),
      hasToken: !!inst.gatewayToken,
      pid: livePid,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /:instId/gateway - Update gateway config
const updateGatewaySchema = z.object({
  mode: z.enum(['local', 'remote']).optional(),
  bind: z.enum(['loopback', 'lan', 'tailscale']).optional(),
  port: z.number().int().min(1024).max(65535).optional(),
});

router.put(
  '/:instId/gateway',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { mode, bind, port } = updateGatewaySchema.parse(req.body);
      const data: Record<string, unknown> = {};
      if (mode) data.gatewayMode = mode;
      if (bind) data.gatewayBind = bind;
      if (port) data.gatewayPort = port;

      const inst = await prisma.instance.update({
        where: { id: req.params.instId as string },
        data: data as any,
      });

      // Sync to openclaw.json in container
      if (inst.containerHost && inst.containerName) {
        try {
          const config = await openclaw.readConfig(inst.containerHost, inst.containerName);
          if (config) {
            if (!config.gateway) config.gateway = {};
            if (mode) config.gateway.mode = mode;
            if (bind) config.gateway.bind = bind;
            if (port) config.gateway.port = port;
            await openclaw.writeConfig(inst.containerHost, inst.containerName, config);
          }
        } catch {}
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'gateway.update',
          resource: 'gateway',
          resourceId: inst.id,
          details: { changes: data } as any,
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.json({ mode: inst.gatewayMode, bind: inst.gatewayBind, port: inst.gatewayPort, status: inst.gatewayStatus });
    } catch (err) {
      next(err);
    }
  },
);

// POST /:instId/gateway/token - Generate/rotate gateway token
router.post(
  '/:instId/gateway/token',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = randomBytes(32).toString('hex');
      const inst = await prisma.instance.update({
        where: { id: req.params.instId as string },
        data: { gatewayToken: token },
      });

      // Sync token to openclaw.json
      if (inst.containerHost && inst.containerName) {
        try {
          const config = await openclaw.readConfig(inst.containerHost, inst.containerName);
          if (config) {
            if (!config.gateway) config.gateway = {};
            config.gateway.token = token;
            await openclaw.writeConfig(inst.containerHost, inst.containerName, config);
          }
        } catch {}
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'gateway.token_rotated',
          resource: 'gateway',
          resourceId: req.params.instId as string,
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.json({ token, message: 'Token gerado. Copie agora, não será exibido novamente.' });
    } catch (err) {
      next(err);
    }
  },
);

// POST /:instId/gateway/:action - Control gateway (start/stop/restart)
router.post(
  '/:instId/gateway/:action',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const action = req.params.action as string;
      if (!['start', 'stop', 'restart', 'validate'].includes(action)) {
        return res.status(400).json({ error: { message: 'Invalid action' } });
      }

      const inst = await prisma.instance.findUnique({ where: { id: req.params.instId as string } });
      if (!inst) return res.status(404).json({ error: { message: 'Instance not found' } });

      if (action === 'validate') {
        // Validate gateway config
        const issues: string[] = [];
        if (!inst.gatewayMode) issues.push('Gateway mode não configurado');
        if (!inst.gatewayPort) issues.push('Porta não configurada');
        if (!inst.gatewayToken) issues.push('Token não gerado');

        return res.json({
          valid: issues.length === 0,
          issues,
          config: { mode: inst.gatewayMode, bind: inst.gatewayBind, port: inst.gatewayPort, hasToken: !!inst.gatewayToken },
        });
      }

      // Execute action in container if mapped
      if (inst.containerName && inst.containerHost) {
        const job = await jobService.createJob({
          userId: req.user!.sub,
          instanceId: inst.id,
          type: `gateway.${action}`,
          description: `${action} gateway em ${inst.containerName}`,
          steps: [`${action} gateway service`],
        });

        await jobService.startJob(job.id);
        await jobService.startStep(job.steps[0].id);

        try {
          let result: { success: boolean; output?: string };

          if (action === 'start' || action === 'restart') {
            result = await openclaw.startGateway(inst.containerHost, inst.containerName);
          } else {
            result = await openclaw.stopGateway(inst.containerHost, inst.containerName);
          }

          const newStatus = (action === 'stop' || !result.success) ? 'stopped' : 'running';
          await prisma.instance.update({ where: { id: inst.id }, data: { gatewayStatus: newStatus } });

          if (result.success) {
            await jobService.completeStep(job.steps[0].id, result.output || 'OK');
            await jobService.completeJob(job.id, { action, status: newStatus });
          } else {
            await jobService.failStep(job.steps[0].id, result.output || 'Falhou');
            await jobService.failJob(job.id, result.output || 'Falhou');
          }

          await prisma.auditLog.create({
            data: {
              userId: req.user!.sub,
              action: `gateway.${action}`,
              resource: 'gateway',
              resourceId: inst.id,
              details: { containerName: inst.containerName, success: result.success } as any,
              ipAddress: req.ip,
              correlationId: req.correlationId,
            },
          });

          res.json({ success: result.success, status: newStatus, job: job.id });
        } catch (err: any) {
          await jobService.failStep(job.steps[0].id, err.message);
          await jobService.failJob(job.id, err.message);
          res.status(500).json({ error: { message: err.message }, job: job.id });
        }
      } else {
        // No container mapped, update status only
        const newStatus = action === 'stop' ? 'stopped' : 'running';
        await prisma.instance.update({ where: { id: inst.id }, data: { gatewayStatus: newStatus } });
        res.json({ success: true, status: newStatus, note: 'No container mapped - status updated locally' });
      }
    } catch (err) {
      next(err);
    }
  },
);

export { router as gatewayRoutes };
