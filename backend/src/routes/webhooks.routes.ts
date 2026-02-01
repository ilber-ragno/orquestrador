import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// GET /instances/:id/webhooks - List webhook endpoints
router.get('/:id/webhooks', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { instanceId: req.params.id as string },
      include: { _count: { select: { logs: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(endpoints);
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/webhooks - Create webhook endpoint
const createWebhookSchema = z.object({
  url: z.string().url(),
  secret: z.string().max(255).optional(),
  events: z.array(z.string()).min(1),
});

router.post('/:id/webhooks', authenticate, requireRole('ADMIN', 'OPERATOR'), validate(createWebhookSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));

    const data = req.body as z.infer<typeof createWebhookSchema>;
    const endpoint = await prisma.webhookEndpoint.create({
      data: { instanceId: req.params.id as string, url: data.url, secret: data.secret, events: data.events },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'webhook.create',
        resource: 'webhook_endpoint',
        resourceId: endpoint.id,
        details: { instanceId: req.params.id as string, url: data.url, events: data.events },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        correlationId: req.correlationId,
      },
    });

    res.status(201).json(endpoint);
  } catch (err) {
    next(err);
  }
});

// DELETE /instances/:id/webhooks/:webhookId - Delete webhook endpoint
router.delete('/:id/webhooks/:webhookId', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: req.params.webhookId as string, instanceId: req.params.id as string } });
    if (!endpoint) return next(new AppError(404, 'NOT_FOUND', 'Webhook não encontrado'));

    await prisma.webhookEndpoint.delete({ where: { id: endpoint.id } });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// GET /instances/:id/webhooks/:webhookId/logs - Webhook delivery logs
router.get('/:id/webhooks/:webhookId/logs', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const [logs, total] = await Promise.all([
      prisma.webhookLog.findMany({
        where: { endpointId: req.params.webhookId as string },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.webhookLog.count({ where: { endpointId: req.params.webhookId as string } }),
    ]);

    res.json({ data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════
// WEBHOOK DISPATCHER (for use by other services)
// ═══════════════════════════════════════

export async function dispatchWebhook(instanceId: string, eventType: string, payload: any): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { instanceId, isActive: true },
  });

  for (const endpoint of endpoints) {
    const events = endpoint.events as string[];
    if (!events.includes(eventType) && !events.includes('*')) continue;

    const maxRetries = 3;
    let attempt = 0;
    let success = false;
    let statusCode: number | null = null;
    let responseBody = '';

    while (attempt <= maxRetries && !success) {
      try {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (endpoint.secret) {
          const { createHmac } = await import('crypto');
          const signature = createHmac('sha256', endpoint.secret).update(JSON.stringify(payload)).digest('hex');
          headers['X-Webhook-Signature'] = signature;
        }
        headers['X-Webhook-Event'] = eventType;

        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() }),
          signal: AbortSignal.timeout(10000),
        });

        statusCode = res.status;
        responseBody = await res.text().catch(() => '');
        success = res.ok;
      } catch (err: any) {
        responseBody = err.message;
      }
      attempt++;
    }

    await prisma.webhookLog.create({
      data: {
        endpointId: endpoint.id,
        eventType,
        payload,
        statusCode,
        response: responseBody.slice(0, 2000),
        retries: attempt - 1,
        success,
      },
    });
  }
}

export { router as webhooksRoutes };
