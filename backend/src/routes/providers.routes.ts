import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';
import * as openclaw from '../services/openclaw.service.js';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto.js';

function decryptApiKey(key: string): string {
  try {
    return isEncrypted(key) ? decrypt(key) : key;
  } catch {
    return key; // Fallback for legacy unencrypted keys
  }
}

const router = Router();

// Sync all providers for an instance to auth-profiles.json in the container
async function syncProvidersToContainer(instanceId: string) {
  const instance = await prisma.instance.findUnique({ where: { id: instanceId } });
  if (!instance?.containerHost || !instance?.containerName) return;

  const providers = await prisma.provider.findMany({ where: { instanceId, isActive: true } });
  const profiles: Record<string, { name: string; type: string; apiKey: string; baseUrl?: string; model?: string }> = {};
  for (const p of providers) {
    const key = p.type.toLowerCase();
    profiles[key] = {
      name: p.name,
      type: p.type,
      apiKey: decryptApiKey(p.apiKey),
      ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
      ...(p.model ? { model: p.model } : {}),
    };
  }

  await openclaw.writeAuthProfiles(instance.containerHost, instance.containerName, profiles);

  // Sync ElevenLabs API key to skill sag in openclaw.json
  const elevenlabs = providers.find(p => p.type === 'ELEVENLABS');
  if (elevenlabs) {
    const config = await openclaw.readConfig(instance.containerHost, instance.containerName);
    if (config) {
      if (!config.skills) config.skills = {};
      if (!config.skills.entries) config.skills.entries = {};
      config.skills.entries.sag = { apiKey: decryptApiKey(elevenlabs.apiKey) };
      await openclaw.writeConfig(instance.containerHost, instance.containerName, config);
    }
  }

  // Sync default model in openclaw.json
  const defaultProvider = providers.find(p => p.isDefault) || providers[0];
  if (defaultProvider) {
    const config = await openclaw.readConfig(instance.containerHost, instance.containerName);
    if (config) {
      if (!config.agents) config.agents = {};
      if (!config.agents.defaults) config.agents.defaults = {};
      if (!config.agents.defaults.model) config.agents.defaults.model = {};
      config.agents.defaults.model.primary = `${defaultProvider.type.toLowerCase()}:${defaultProvider.model || 'default'}`;
      await openclaw.writeConfig(instance.containerHost, instance.containerName, config);
    }
  }
}

// GET /instances/:instId/providers
router.get('/:instId/providers', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providers = await prisma.provider.findMany({
      where: { instanceId: req.params.instId as string },
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
  type: z.enum(['OPENAI', 'ANTHROPIC', 'OPENROUTER', 'ELEVENLABS', 'CUSTOM']),
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

      // Validate API key format matches provider type
      const keyError = validateApiKeyFormat(data.type, data.apiKey);
      if (keyError) return next(new AppError(400, 'INVALID_API_KEY', keyError));

      // If setting as default, unset others
      if (data.isDefault) {
        await prisma.provider.updateMany({
          where: { instanceId: req.params.instId as string, isDefault: true },
          data: { isDefault: false },
        });
      }

      const provider = await prisma.provider.create({
        data: { ...data, apiKey: encrypt(data.apiKey), instanceId: req.params.instId as string } as any,
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'provider.create',
          resource: 'provider',
          resourceId: provider.id,
          details: { type: data.type, name: data.name, instanceId: req.params.instId as string },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          correlationId: req.correlationId,
        },
      });

      // Sync to container
      syncProvidersToContainer(req.params.instId as string).catch(() => {});

      res.status(201).json({ ...provider, apiKey: maskKey(provider.apiKey) });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /instances/:instId/providers/:id
const updateProviderSchema = z.object({
  type: z.enum(['OPENAI', 'ANTHROPIC', 'OPENROUTER', 'ELEVENLABS', 'CUSTOM']).optional(),
  name: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional().nullable(),
  model: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
});

router.put(
  '/:instId/providers/:id',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  validate(updateProviderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.provider.findFirst({
        where: { id: req.params.id as string, instanceId: req.params.instId as string },
      });
      if (!existing) return next(new AppError(404, 'NOT_FOUND', 'Provider not found'));

      const data = req.body as z.infer<typeof updateProviderSchema>;

      // Validate API key format if apiKey or type changed
      if (data.apiKey) {
        const checkType = data.type || existing.type;
        const keyError = validateApiKeyFormat(checkType, data.apiKey);
        if (keyError) return next(new AppError(400, 'INVALID_API_KEY', keyError));
      }

      if (data.isDefault) {
        await prisma.provider.updateMany({
          where: { instanceId: req.params.instId as string, isDefault: true, id: { not: req.params.id as string } },
          data: { isDefault: false },
        });
      }

      // Encrypt apiKey if provided
      const updateData = { ...data };
      if (updateData.apiKey) {
        updateData.apiKey = encrypt(updateData.apiKey);
      }

      const updated = await prisma.provider.update({
        where: { id: req.params.id as string },
        data: updateData,
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

      // Sync to container
      syncProvidersToContainer(req.params.instId as string).catch(() => {});

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
        where: { id: req.params.id as string, instanceId: req.params.instId as string },
      });
      if (!existing) return next(new AppError(404, 'NOT_FOUND', 'Provider not found'));

      await prisma.provider.delete({ where: { id: req.params.id as string } });

      // Sync to container (removes deleted provider from auth-profiles.json)
      syncProvidersToContainer(req.params.instId as string).catch(() => {});

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'provider.delete',
          resource: 'provider',
          resourceId: req.params.id as string,
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
        where: { id: req.params.id as string, instanceId: req.params.instId as string },
      });
      if (!provider) return next(new AppError(404, 'NOT_FOUND', 'Provider not found'));

      const result = await testProvider(provider.type, decryptApiKey(provider.apiKey), provider.baseUrl);

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
      where: { instanceId: req.params.instId as string },
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
        data: { ...data, instanceId: req.params.instId as string } as any,
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
        where: { id: req.params.id as string, instanceId: req.params.instId as string },
      });
      if (!existing) return next(new AppError(404, 'NOT_FOUND', 'Integration not found'));

      await prisma.apiIntegration.delete({ where: { id: req.params.id as string } });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'integration.delete',
          resource: 'api_integration',
          resourceId: req.params.id as string,
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

function validateApiKeyFormat(type: string, apiKey: string): string | null {
  switch (type) {
    case 'OPENAI':
      if (apiKey.startsWith('sk_')) return 'Esta API key parece ser do ElevenLabs, não da OpenAI';
      if (apiKey.startsWith('sk-ant-')) return 'Esta API key parece ser da Anthropic, não da OpenAI';
      break;
    case 'ANTHROPIC':
      if (!apiKey.startsWith('sk-ant-')) return 'API key da Anthropic deve começar com sk-ant-';
      break;
    case 'ELEVENLABS':
      if (apiKey.startsWith('sk-')) return 'Esta API key parece ser da OpenAI/Anthropic, não do ElevenLabs';
      break;
    case 'OPENROUTER':
      if (apiKey.startsWith('sk-ant-') || apiKey.startsWith('sk_')) return 'Esta API key não parece ser do OpenRouter';
      break;
  }
  return null;
}

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
      case 'ELEVENLABS':
        url = (baseUrl || 'https://api.elevenlabs.io') + '/v1/voices';
        headers['xi-api-key'] = apiKey;
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
