import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// GET /instances/:instId/providers
router.get('/:instId/providers', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providers = await prisma.provider.findMany({
      where: { instanceId: req.params.instId },
      orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
    });
    // Mask API keys
    const result = providers.map((p) => ({
      ...p,
      apiKey: maskKey(p.apiKey),
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /instances/:instId/providers
const createProviderSchema = z.object({
  type: z.enum(['OPENAI', 'ANTHROPIC', 'OPENROUTER', 'CUSTOM']),
  name: z.string().min(1).max(100),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional().nullable(),
  model: z.string().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  priority: z.number().int().min(0).optional().default(0),
});

router.post(
  '/:instId/providers',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  validate(createProviderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as z.infer<typeof createProviderSchema>;

      // If setting as default, unset others
      if (data.isDefault) {
        await prisma.provider.updateMany({
          where: { instanceId: req.params.instId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const provider = await prisma.provider.create({
        data: { ...data, instanceId: req.params.instId },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'provider.create',
          resource: 'provider',
          resourceId: provider.id,
          details: { type: data.type, name: data.name, instanceId: req.params.instId },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          correlationId: req.correlationId,
        },
      });

      res.status(201).json({ ...provider, apiKey: maskKey(provider.apiKey) });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /instances/:instId/providers/:id
router.put(
  '/:instId/providers/:id',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.provider.findFirst({
        where: { id: req.params.id, instanceId: req.params.instId },
      });
      if (!existing) return next(new AppError(404, 'NOT_FOUND', 'Provider not found'));

      const data = req.body;
      if (data.isDefault) {
        await prisma.provider.updateMany({
          where: { instanceId: req.params.instId, isDefault: true, id: { not: req.params.id } },
          data: { isDefault: false },
        });
      }

      const updated = await prisma.provider.update({
        where: { id: req.params.id },
        data,
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'provider.update',
          resource: 'provider',
          resourceId: updated.id,
          details: { before: { name: existing.name, type: existing.type }, after: data },
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.json({ ...updated, apiKey: maskKey(updated.apiKey) });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /instances/:instId/providers/:id
router.delete(
  '/:instId/providers/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.provider.findFirst({
        where: { id: req.params.id, instanceId: req.params.instId },
      });
      if (!existing) return next(new AppError(404, 'NOT_FOUND', 'Provider not found'));

      await prisma.provider.delete({ where: { id: req.params.id } });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'provider.delete',
          resource: 'provider',
          resourceId: req.params.id,
          details: { name: existing.name, type: existing.type },
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /instances/:instId/providers/:id/test - Test provider connectivity
router.post(
  '/:instId/providers/:id/test',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = await prisma.provider.findFirst({
        where: { id: req.params.id, instanceId: req.params.instId },
      });
      if (!provider) return next(new AppError(404, 'NOT_FOUND', 'Provider not found'));

      const result = await testProvider(provider.type, provider.apiKey, provider.baseUrl);

      await prisma.provider.update({
        where: { id: provider.id },
        data: { lastTestAt: new Date(), lastTestOk: result.success },
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// --- API Integrations ---

// GET /instances/:instId/integrations
router.get('/:instId/integrations', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const integrations = await prisma.apiIntegration.findMany({
      where: { instanceId: req.params.instId },
      orderBy: { createdAt: 'asc' },
    });
    const result = integrations.map((i) => ({
      ...i,
      authCredentials: i.authCredentials ? '****' : null,
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /instances/:instId/integrations
const createIntegrationSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  authType: z.enum(['bearer', 'basic', 'api_key', 'none']).optional().default('bearer'),
  authCredentials: z.string().optional().nullable(),
  scopes: z.array(z.string()).optional().nullable(),
  rateLimitReqs: z.number().int().positive().optional().nullable(),
  rateLimitWindow: z.number().int().positive().optional().nullable(),
});

router.post(
  '/:instId/integrations',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  validate(createIntegrationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as z.infer<typeof createIntegrationSchema>;
      const integration = await prisma.apiIntegration.create({
        data: { ...data, instanceId: req.params.instId },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'integration.create',
          resource: 'api_integration',
          resourceId: integration.id,
          details: { name: data.name, baseUrl: data.baseUrl },
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.status(201).json({ ...integration, authCredentials: integration.authCredentials ? '****' : null });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /instances/:instId/integrations/:id
router.delete(
  '/:instId/integrations/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.apiIntegration.findFirst({
        where: { id: req.params.id, instanceId: req.params.instId },
      });
      if (!existing) return next(new AppError(404, 'NOT_FOUND', 'Integration not found'));

      await prisma.apiIntegration.delete({ where: { id: req.params.id } });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'integration.delete',
          resource: 'api_integration',
          resourceId: req.params.id,
          details: { name: existing.name },
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// --- Helpers ---

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 6) + '****' + key.slice(-4);
}

async function testProvider(
  type: string,
  apiKey: string,
  baseUrl: string | null,
): Promise<{ success: boolean; latency: number; error?: string; model?: string }> {
  const start = Date.now();
  try {
    let url: string;
    const headers: Record<string, string> = {};

    switch (type) {
      case 'OPENAI':
        url = (baseUrl || 'https://api.openai.com') + '/v1/models';
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'ANTHROPIC':
        url = (baseUrl || 'https://api.anthropic.com') + '/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        headers['content-type'] = 'application/json';
        // Use a minimal request
        const body = JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        });
        const resp = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
        const latency = Date.now() - start;
        if (resp.ok || resp.status === 400) {
          // 400 means auth worked but request was bad - still means key is valid
          return { success: true, latency, model: 'claude-sonnet-4-20250514' };
        }
        const errData = await resp.text();
        return { success: false, latency, error: `HTTP ${resp.status}: ${errData.slice(0, 200)}` };
      case 'OPENROUTER':
        url = (baseUrl || 'https://openrouter.ai') + '/api/v1/models';
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      default:
        url = (baseUrl || '') + '/';
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    const latency = Date.now() - start;

    if (response.ok) {
      return { success: true, latency };
    }
    return { success: false, latency, error: `HTTP ${response.status}` };
  } catch (err: unknown) {
    return { success: false, latency: Date.now() - start, error: (err as Error).message };
  }
}

export { router as providersRoutes };
