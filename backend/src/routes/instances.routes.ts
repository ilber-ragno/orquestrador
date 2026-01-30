import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';
import * as lxc from '../services/lxc.service.js';

const router = Router();

// GET /instances - List all instances with real container status
router.get('/', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const instances = await prisma.instance.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        configs: { select: { key: true, encrypted: true, version: true, updatedAt: true } },
        _count: { select: { configHistory: true } },
      },
    });

    // Fetch real container status from LXC
    const hosts = [...new Set(instances.map((i) => i.containerHost).filter(Boolean))] as string[];
    const containerStatusMap = new Map<string, string>();
    for (const host of hosts) {
      try {
        const containers = await lxc.listContainers(host);
        for (const c of containers) {
          containerStatusMap.set(`${host}:${c.name}`, c.status);
        }
      } catch {
        // Host unreachable - containers stay as DB status
      }
    }

    const result = instances.map((inst) => {
      // Sync real status from LXC
      let realStatus = inst.status;
      if (inst.containerHost && inst.containerName) {
        const lxcStatus = containerStatusMap.get(`${inst.containerHost}:${inst.containerName}`);
        if (lxcStatus) {
          realStatus = lxcStatus === 'running' ? 'running' : 'stopped';
        }
      }

      return {
        id: inst.id,
        name: inst.name,
        slug: inst.slug,
        description: inst.description,
        status: realStatus,
        containerName: inst.containerName,
        containerHost: inst.containerHost,
        containerType: inst.containerType,
        createdAt: inst.createdAt,
        updatedAt: inst.updatedAt,
        configCount: inst.configs.length,
        historyCount: inst._count.configHistory,
      };
    });

    // Update DB with real statuses
    for (const inst of result) {
      if (inst.status !== instances.find((i) => i.id === inst.id)?.status) {
        await prisma.instance.update({ where: { id: inst.id }, data: { status: inst.status } });
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /instances/:id/status - Instance status with summary
router.get('/:id/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({
      where: { id: req.params.id },
      include: {
        configs: { select: { key: true, value: true, encrypted: true, version: true, updatedAt: true } },
      },
    });
    if (!instance) {
      return next(new AppError(404, 'NOT_FOUND', 'Instance not found'));
    }

    // Build status summary from config
    const configMap = new Map(instance.configs.map((c) => [c.key, c]));

    const gatewayMode = configMap.get('gateway.mode')?.value || null;
    const gatewayPort = configMap.get('gateway.port')?.value || null;
    const providerDefault = configMap.get('provider.default')?.value || null;
    const whatsappStatus = configMap.get('whatsapp.status')?.value || null;

    res.json({
      id: instance.id,
      name: instance.name,
      slug: instance.slug,
      status: instance.status,
      summary: {
        gateway: {
          mode: gatewayMode,
          port: gatewayPort,
          status: instance.status === 'running' ? 'online' : 'offline',
        },
        provider: {
          default: providerDefault,
          configured: instance.configs.filter((c) => c.key.startsWith('provider.')).length > 0,
        },
        whatsapp: {
          status: whatsappStatus || 'disconnected',
        },
        configCount: instance.configs.length,
        lastConfigUpdate: instance.configs.reduce(
          (latest, c) => (c.updatedAt > latest ? c.updatedAt : latest),
          instance.createdAt,
        ),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /instances/:id/config - Get all config for instance
router.get('/:id/config', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id } });
    if (!instance) {
      return next(new AppError(404, 'NOT_FOUND', 'Instance not found'));
    }

    const configs = await prisma.instanceConfig.findMany({
      where: { instanceId: req.params.id },
      orderBy: { key: 'asc' },
    });

    // Mask encrypted values unless admin
    const result = configs.map((c) => ({
      id: c.id,
      key: c.key,
      value: c.encrypted ? maskSecret(c.value) : c.value,
      encrypted: c.encrypted,
      version: c.version,
      updatedAt: c.updatedAt,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /instances/:id/config - Update config (batch upsert)
const configUpdateSchema = z.object({
  configs: z.array(
    z.object({
      key: z.string().min(1).max(255),
      value: z.string(),
      encrypted: z.boolean().optional().default(false),
    }),
  ).min(1),
});

router.put(
  '/:id/config',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  validate(configUpdateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instance = await prisma.instance.findUnique({ where: { id: req.params.id } });
      if (!instance) {
        return next(new AppError(404, 'NOT_FOUND', 'Instance not found'));
      }

      const { configs } = req.body as z.infer<typeof configUpdateSchema>;
      const results = [];

      for (const cfg of configs) {
        // Get existing config for history
        const existing = await prisma.instanceConfig.findUnique({
          where: { instanceId_key: { instanceId: req.params.id, key: cfg.key } },
        });

        // Upsert config
        const updated = await prisma.instanceConfig.upsert({
          where: { instanceId_key: { instanceId: req.params.id, key: cfg.key } },
          update: {
            value: cfg.value,
            encrypted: cfg.encrypted,
            version: existing ? existing.version + 1 : 1,
          },
          create: {
            instanceId: req.params.id,
            key: cfg.key,
            value: cfg.value,
            encrypted: cfg.encrypted,
          },
        });

        // Record history
        await prisma.configHistory.create({
          data: {
            instanceId: req.params.id,
            key: cfg.key,
            previousValue: existing?.value || null,
            newValue: cfg.value,
            changedBy: req.user!.sub,
            correlationId: req.correlationId,
          },
        });

        // Audit log
        await prisma.auditLog.create({
          data: {
            userId: req.user!.sub,
            action: 'config.update',
            resource: 'instance_config',
            resourceId: updated.id,
            details: {
              instanceId: req.params.id,
              key: cfg.key,
              previousValue: existing?.encrypted ? '***' : existing?.value,
              newValue: cfg.encrypted ? '***' : cfg.value,
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            correlationId: req.correlationId,
          },
        });

        results.push({
          key: updated.key,
          version: updated.version,
          encrypted: updated.encrypted,
        });
      }

      // Update instance updatedAt
      await prisma.instance.update({
        where: { id: req.params.id },
        data: { updatedAt: new Date() },
      });

      res.json({ updated: results });
    } catch (err) {
      next(err);
    }
  },
);

// GET /instances/:id/config/history - Config change history
router.get('/:id/config/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id } });
    if (!instance) {
      return next(new AppError(404, 'NOT_FOUND', 'Instance not found'));
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const keyFilter = req.query.key as string | undefined;

    const where = {
      instanceId: req.params.id,
      ...(keyFilter ? { key: keyFilter } : {}),
    };

    const [history, total] = await Promise.all([
      prisma.configHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.configHistory.count({ where }),
    ]);

    // Enrich with user names
    const userIds = [...new Set(history.map((h) => h.changedBy))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = history.map((h) => ({
      id: h.id,
      key: h.key,
      previousValue: h.previousValue,
      newValue: h.newValue,
      changedBy: userMap.get(h.changedBy) || { id: h.changedBy, name: 'Unknown', email: '' },
      correlationId: h.correlationId,
      createdAt: h.createdAt,
    }));

    res.json({
      data: result,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /instances/:id - Update instance metadata
const instanceUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['stopped', 'running', 'error']).optional(),
});

router.put(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  validate(instanceUpdateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instance = await prisma.instance.findUnique({ where: { id: req.params.id } });
      if (!instance) {
        return next(new AppError(404, 'NOT_FOUND', 'Instance not found'));
      }

      const data = req.body as z.infer<typeof instanceUpdateSchema>;
      const updated = await prisma.instance.update({
        where: { id: req.params.id },
        data,
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'instance.update',
          resource: 'instance',
          resourceId: updated.id,
          details: { before: { name: instance.name, description: instance.description, status: instance.status }, after: data },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          correlationId: req.correlationId,
        },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

function maskSecret(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

export { router as instancesRoutes };
