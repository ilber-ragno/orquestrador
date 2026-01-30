import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { randomBytes } from 'crypto';
import * as lxc from '../services/lxc.service.js';
import * as jobService from '../services/job.service.js';

const router = Router();

// GET /:instId/gateway - Get gateway config
router.get('/:instId/gateway', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({
      where: { id: req.params.instId },
      select: { id: true, name: true, gatewayMode: true, gatewayBind: true, gatewayPort: true, gatewayToken: true, gatewayStatus: true, containerName: true, containerHost: true },
    });
    if (!inst) return res.status(404).json({ error: { message: 'Instance not found' } });

    res.json({
      mode: inst.gatewayMode || 'local',
      bind: inst.gatewayBind || '0.0.0.0',
      port: inst.gatewayPort || 8080,
      token: inst.gatewayToken ? `${inst.gatewayToken.slice(0, 8)}****` : null,
      status: inst.gatewayStatus || 'stopped',
      hasToken: !!inst.gatewayToken,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /:instId/gateway - Update gateway config
router.put(
  '/:instId/gateway',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { mode, bind, port } = req.body;
      const data: Record<string, unknown> = {};
      if (mode && ['local', 'remote'].includes(mode)) data.gatewayMode = mode;
      if (bind) data.gatewayBind = bind;
      if (port && Number.isInteger(port) && port > 0 && port < 65536) data.gatewayPort = port;

      const inst = await prisma.instance.update({
        where: { id: req.params.instId },
        data: data as any,
      });

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
      await prisma.instance.update({
        where: { id: req.params.instId },
        data: { gatewayToken: token },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'gateway.token_rotated',
          resource: 'gateway',
          resourceId: req.params.instId,
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

      const inst = await prisma.instance.findUnique({ where: { id: req.params.instId } });
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
          const cmd = action === 'start' ? 'systemctl start clawdbot-gateway'
            : action === 'stop' ? 'systemctl stop clawdbot-gateway'
            : 'systemctl restart clawdbot-gateway';

          const result = await lxc.execInContainer(inst.containerHost, inst.containerName, cmd);
          const newStatus = action === 'stop' ? 'stopped' : 'running';

          await prisma.instance.update({ where: { id: inst.id }, data: { gatewayStatus: newStatus } });
          await jobService.completeStep(job.steps[0].id, result.stdout || 'OK');
          await jobService.completeJob(job.id, { action, status: newStatus });

          await prisma.auditLog.create({
            data: {
              userId: req.user!.sub,
              action: `gateway.${action}`,
              resource: 'gateway',
              resourceId: inst.id,
              details: { containerName: inst.containerName, exitCode: result.exitCode } as any,
              ipAddress: req.ip,
              correlationId: req.correlationId,
            },
          });

          res.json({ success: true, status: newStatus, job: job.id });
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
