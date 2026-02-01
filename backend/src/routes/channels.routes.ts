import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';
import * as openclaw from '../services/openclaw.service.js';

const router = Router();

// All supported channel types
const ALL_CHANNEL_TYPES = [
  'WHATSAPP', 'TELEGRAM', 'SLACK', 'DISCORD', 'TEAMS', 'GOOGLE_CHAT',
  'MATRIX', 'MATTERMOST', 'NEXTCLOUD',
  'LINE', 'WEBHOOK', 'CLI', 'WEB', 'API',
  'IMESSAGE', 'SIGNAL',
] as const;

// Channel metadata for the frontend
const CHANNEL_META: Record<string, { label: string; category: string; description: string; configFields: string[] }> = {
  WHATSAPP:    { label: 'WhatsApp',        category: 'principal', description: 'Canal estratégico via pareamento',           configFields: ['phone'] },
  TELEGRAM:    { label: 'Telegram',        category: 'principal', description: 'Bot Telegram para mensagens e grupos',      configFields: ['botToken', 'botUsername'] },
  SLACK:       { label: 'Slack',           category: 'principal', description: 'Canais e DMs corporativos',                 configFields: ['botToken', 'appToken', 'signingSecret'] },
  DISCORD:     { label: 'Discord',         category: 'principal', description: 'Comunidades e suporte',                     configFields: ['botToken', 'applicationId'] },
  TEAMS:       { label: 'Microsoft Teams', category: 'principal', description: 'Chat corporativo Microsoft',                configFields: ['appId', 'appPassword', 'tenantId'] },
  GOOGLE_CHAT: { label: 'Google Chat',     category: 'principal', description: 'Integração Google Workspace',               configFields: ['serviceAccountKey', 'spaceId'] },
  MATRIX:      { label: 'Matrix',          category: 'adicional', description: 'Canal descentralizado',                     configFields: ['homeserver', 'accessToken', 'userId'] },
  MATTERMOST:  { label: 'Mattermost',      category: 'adicional', description: 'Alternativa open source ao Slack',          configFields: ['serverUrl', 'botToken'] },
  NEXTCLOUD:   { label: 'Nextcloud Talk',  category: 'adicional', description: 'Integração Nextcloud',                      configFields: ['serverUrl', 'botToken'] },
  LINE:        { label: 'LINE',            category: 'adicional', description: 'Popular em mercados asiáticos',             configFields: ['channelAccessToken', 'channelSecret'] },
  IMESSAGE:    { label: 'iMessage',       category: 'adicional', description: 'Apple iMessage via bridge',                 configFields: ['bridgeUrl'] },
  SIGNAL:      { label: 'Signal',         category: 'adicional', description: 'Mensageria criptografada Signal',           configFields: ['phone', 'signalCliPath'] },
  WEBHOOK:     { label: 'Webhook',         category: 'tecnico',   description: 'Entrada/saída via HTTP',                    configFields: ['webhookUrl', 'secret'] },
  CLI:         { label: 'CLI / Local',     category: 'tecnico',   description: 'Execução local de agents',                  configFields: [] },
  WEB:         { label: 'Web Chat',        category: 'tecnico',   description: 'Widget de chat para websites',              configFields: ['allowedOrigins'] },
  API:         { label: 'API',             category: 'tecnico',   description: 'Integração via REST API',                   configFields: ['apiKey'] },
};

// GET /instances/:id/channels/types - Available channel types + metadata
router.get('/:id/channels/types', authenticate, async (_req: Request, res: Response) => {
  res.json(Object.entries(CHANNEL_META).map(([type, meta]) => ({ type, ...meta })));
});

// GET /instances/:id/channels - List channels
router.get('/:id/channels', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));

    const channels = await prisma.channel.findMany({
      where: { instanceId: req.params.id as string },
      orderBy: { createdAt: 'asc' },
    });

    // Enrich WhatsApp channels with real status from container
    const enriched = await Promise.all(channels.map(async (ch) => {
      if (ch.type === 'WHATSAPP' && instance.containerHost && instance.containerName) {
        const waStatus = await openclaw.getWhatsAppStatus(instance.containerHost, instance.containerName);
        return { ...ch, liveStatus: { paired: waStatus.paired, phone: waStatus.phone } };
      }
      return { ...ch, liveStatus: null };
    }));

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/channels - Create/activate channel
const createChannelSchema = z.object({
  type: z.enum(ALL_CHANNEL_TYPES),
  name: z.string().min(1).max(100),
  config: z.any().optional(),
});

router.post('/:id/channels', authenticate, requireRole('ADMIN', 'OPERATOR'), validate(createChannelSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));

    const data = req.body as z.infer<typeof createChannelSchema>;

    // Check if channel of this type already exists
    const existing = await prisma.channel.findFirst({
      where: { instanceId: req.params.id as string, type: data.type },
    });
    if (existing) {
      return next(new AppError(409, 'CHANNEL_EXISTS', `Canal ${CHANNEL_META[data.type]?.label || data.type} já existe nesta instância`));
    }

    const channel = await prisma.channel.create({
      data: { instanceId: req.params.id as string, ...data },
    });

    // Sync channel plugin + credentials to openclaw.json in container
    await syncChannelToContainer(instance, data.type, true, { credentials: data.config as Record<string, any> }).catch(() => {});

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'channel.create',
        resource: 'channel',
        resourceId: channel.id,
        details: { instanceId: req.params.id as string, type: data.type, name: data.name },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        correlationId: req.correlationId,
      },
    });

    res.status(201).json(channel);
  } catch (err) {
    next(err);
  }
});

// PUT /instances/:id/channels/:channelId - Update channel
const DM_POLICIES = ['pairing', 'allowlist', 'open', 'disabled'] as const;

const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.string().optional(),
  isEnabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  botToken: z.string().optional().nullable(),
  webhookUrl: z.string().url().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  dmPolicy: z.enum(DM_POLICIES).optional(),
  allowFrom: z.array(z.string().max(50)).max(500).optional(),
});

router.put('/:id/channels/:channelId', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channel = await prisma.channel.findFirst({ where: { id: req.params.channelId as string, instanceId: req.params.id as string } });
    if (!channel) return next(new AppError(404, 'NOT_FOUND', 'Canal não encontrado'));

    const data = updateChannelSchema.parse(req.body);
    const updated = await prisma.channel.update({
      where: { id: channel.id },
      data: data as any,
    });

    // Sync changes to container (dmPolicy, allowFrom, credentials)
    if (data.dmPolicy || data.allowFrom || data.config) {
      const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
      if (instance) {
        await syncChannelToContainer(instance, channel.type, channel.isActive, {
          dmPolicy: data.dmPolicy,
          allowFrom: data.allowFrom,
          credentials: data.config as Record<string, any>,
        }).catch(() => {});
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'channel.update',
        resource: 'channel',
        resourceId: channel.id,
        details: { type: channel.type, changes: req.body },
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/channels/:channelId/toggle - Enable/disable channel
router.post('/:id/channels/:channelId/toggle', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channel = await prisma.channel.findFirst({ where: { id: req.params.channelId as string, instanceId: req.params.id as string } });
    if (!channel) return next(new AppError(404, 'NOT_FOUND', 'Canal não encontrado'));

    const newActive = !channel.isActive;
    const updated = await prisma.channel.update({
      where: { id: channel.id },
      data: { isActive: newActive, status: newActive ? 'disconnected' : 'disabled' },
    });

    // Sync to container
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (instance) {
      await syncChannelToContainer(instance, channel.type, newActive).catch(() => {});
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: newActive ? 'channel.enable' : 'channel.disable',
        resource: 'channel',
        resourceId: channel.id,
        details: { type: channel.type, name: channel.name, isActive: newActive },
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /instances/:id/channels/:channelId - Remove channel
router.delete('/:id/channels/:channelId', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channel = await prisma.channel.findFirst({ where: { id: req.params.channelId as string, instanceId: req.params.id as string } });
    if (!channel) return next(new AppError(404, 'NOT_FOUND', 'Canal não encontrado'));

    await prisma.channel.delete({ where: { id: channel.id } });

    // Disable in container
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (instance) {
      await syncChannelToContainer(instance, channel.type, false).catch(() => {});
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'channel.delete',
        resource: 'channel',
        resourceId: req.params.channelId as string,
        details: { type: channel.type, name: channel.name },
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/channels/whatsapp/pair - Request WhatsApp pairing
const pairSchema = z.object({ phone: z.string().min(10).max(20) });

router.post('/:id/channels/whatsapp/pair', authenticate, requireRole('ADMIN', 'OPERATOR'), validate(pairSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const { phone } = req.body;
    const result = await openclaw.getPairingCode(instance.containerHost, instance.containerName, phone);

    if (result.success && result.code) {
      const existing = await prisma.channel.findFirst({
        where: { instanceId: req.params.id as string, type: 'WHATSAPP' },
      });
      if (existing) {
        await prisma.channel.update({ where: { id: existing.id }, data: { status: 'pairing', config: { phone, code: result.code } } });
      } else {
        await prisma.channel.create({
          data: { instanceId: req.params.id as string, type: 'WHATSAPP', name: 'WhatsApp Principal', status: 'pairing', config: { phone, code: result.code } },
        });
      }
    }

    res.json({
      success: result.success,
      code: result.code,
      output: result.output,
    });
  } catch (err) {
    next(err);
  }
});

// GET /instances/:id/channels/whatsapp/status - WhatsApp real-time status via gateway
router.get('/:id/channels/whatsapp/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return res.json({ paired: false, phone: null, connected: false, running: false, status: 'no_container' });
    }

    const waStatus = await openclaw.getWhatsAppStatus(instance.containerHost, instance.containerName);

    // Sync status to DB
    const ch = await prisma.channel.findFirst({ where: { instanceId: req.params.id as string, type: 'WHATSAPP' } });
    if (ch) {
      const newStatus = waStatus.connected ? 'connected' : waStatus.paired ? 'disconnected' : 'disconnected';
      if (ch.status !== newStatus) {
        await prisma.channel.update({ where: { id: ch.id }, data: { status: newStatus } });
      }
    }

    res.json(waStatus);
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/channels/whatsapp/login - Start WhatsApp login (QR code flow)
router.post('/:id/channels/whatsapp/login', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const result = await openclaw.startWhatsAppLogin(instance.containerHost, instance.containerName);

    // Create/update channel record
    const existing = await prisma.channel.findFirst({
      where: { instanceId: req.params.id as string, type: 'WHATSAPP' },
    });
    if (!existing) {
      await prisma.channel.create({
        data: { instanceId: req.params.id as string, type: 'WHATSAPP', name: 'WhatsApp Principal', status: 'pairing' },
      });
    } else if (existing.status !== 'pairing') {
      await prisma.channel.update({ where: { id: existing.id }, data: { status: 'pairing' } });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/channels/whatsapp/logout - Logout WhatsApp
router.post('/:id/channels/whatsapp/logout', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const result = await openclaw.logoutWhatsApp(instance.containerHost, instance.containerName);

    const ch = await prisma.channel.findFirst({ where: { instanceId: req.params.id as string, type: 'WHATSAPP' } });
    if (ch) {
      await prisma.channel.update({ where: { id: ch.id }, data: { status: 'disconnected' } });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/channels/:channelId/test - Test channel connectivity
router.post('/:id/channels/:channelId/test', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channel = await prisma.channel.findFirst({ where: { id: req.params.channelId as string, instanceId: req.params.id as string } });
    if (!channel) return next(new AppError(404, 'NOT_FOUND', 'Canal não encontrado'));

    const result = await testChannel(channel);

    await prisma.channel.update({
      where: { id: channel.id },
      data: { status: result.success ? 'connected' : 'error' },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- Helpers ---

// Map channel type to openclaw.json plugin/channel key
function channelKey(type: string): string {
  const map: Record<string, string> = {
    WHATSAPP: 'whatsapp', TELEGRAM: 'telegram', SLACK: 'slack',
    DISCORD: 'discord', TEAMS: 'teams', GOOGLE_CHAT: 'google-chat',
    SIGNAL: 'signal', IMESSAGE: 'imessage', MATRIX: 'matrix',
    MATTERMOST: 'mattermost', NEXTCLOUD: 'nextcloud', NOSTR: 'nostr',
    LINE: 'line', ZALO: 'zalo', WEBHOOK: 'webhook', CLI: 'cli',
    WEB: 'web', API: 'api',
  };
  return map[type] || type.toLowerCase();
}

// Map channel config fields to openclaw.json credential keys per type
const CREDENTIAL_MAP: Record<string, Record<string, string>> = {
  TELEGRAM:    { botToken: 'token', botUsername: 'username' },
  SLACK:       { botToken: 'botToken', appToken: 'appToken', signingSecret: 'signingSecret' },
  DISCORD:     { botToken: 'token', applicationId: 'applicationId' },
  TEAMS:       { appId: 'appId', appPassword: 'appPassword', tenantId: 'tenantId' },
  GOOGLE_CHAT: { serviceAccountKey: 'serviceAccountKey', spaceId: 'spaceId' },
  MATRIX:      { homeserver: 'homeserver', accessToken: 'accessToken', userId: 'userId' },
  MATTERMOST:  { serverUrl: 'url', botToken: 'token' },
  NEXTCLOUD:   { serverUrl: 'url', botToken: 'token' },
  LINE:        { channelAccessToken: 'channelAccessToken', channelSecret: 'channelSecret' },
  IMESSAGE:    { bridgeUrl: 'bridgeUrl' },
  SIGNAL:      { phone: 'phone', signalCliPath: 'signalCliPath' },
  WEBHOOK:     { webhookUrl: 'url', secret: 'secret' },
  WEB:         { allowedOrigins: 'allowedOrigins' },
  API:         { apiKey: 'apiKey' },
};

async function syncChannelToContainer(instance: any, type: string, enabled: boolean, opts?: { dmPolicy?: string; allowFrom?: string[]; credentials?: Record<string, any> }) {
  if (!instance.containerHost || !instance.containerName) return;
  const config = await openclaw.readConfig(instance.containerHost, instance.containerName);
  if (!config) return;

  const key = channelKey(type);

  // Update plugins section
  if (!config.plugins) config.plugins = {};
  if (!config.plugins.entries) config.plugins.entries = {};
  config.plugins.entries[key] = { enabled };

  // Update channels section — do NOT write 'enabled' key (OpenClaw doesn't recognize it)
  if (!config.channels) config.channels = {};
  if (!config.channels[key]) config.channels[key] = {};

  // Sync DM policy if provided
  if (opts?.dmPolicy) {
    config.channels[key].dmPolicy = opts.dmPolicy;
  }
  // allowFrom: quando open → ["*"], quando allowlist → números específicos
  if (opts?.allowFrom !== undefined) {
    if (opts.dmPolicy === 'open' || (!opts.dmPolicy && config.channels[key].dmPolicy === 'open')) {
      config.channels[key].allowFrom = ['*'];
    } else {
      config.channels[key].allowFrom = opts.allowFrom;
    }
  } else if (opts?.dmPolicy === 'open') {
    config.channels[key].allowFrom = ['*'];
  }

  // denyFrom is stored ONLY in the panel DB (Channel.config.denyFrom)
  // It must NEVER be written to openclaw.json — OpenClaw rejects unknown keys and crashes the gateway.
  delete config.channels[key].denyFrom;

  // Sync credentials to openclaw.json (skip internal/panel-only fields)
  const INTERNAL_KEYS = new Set(['contactLabels', 'denyFrom', 'phone']);
  if (opts?.credentials && Object.keys(opts.credentials).length > 0) {
    const credMap = CREDENTIAL_MAP[type];
    if (credMap) {
      for (const [srcKey, destKey] of Object.entries(credMap)) {
        if (opts.credentials[srcKey] !== undefined && opts.credentials[srcKey] !== null && opts.credentials[srcKey] !== '') {
          config.channels[key][destKey] = opts.credentials[srcKey];
        }
      }
    }
    // Sync advanced config fields (not internal, not credential-mapped)
    const mappedKeys = new Set(Object.keys(CREDENTIAL_MAP[type] || {}));
    for (const [k, v] of Object.entries(opts.credentials)) {
      if (!INTERNAL_KEYS.has(k) && !mappedKeys.has(k) && v !== undefined && v !== null && v !== '') {
        config.channels[key][k] = v;
      }
    }
  }

  // Remove the 'enabled' key from channels — OpenClaw doesn't recognize it
  delete config.channels[key].enabled;

  await openclaw.writeConfig(instance.containerHost, instance.containerName, config);
}

async function testChannel(channel: any): Promise<{ success: boolean; latency: number; error?: string }> {
  const start = Date.now();
  const cfg = (channel.config as Record<string, any>) || {};

  try {
    switch (channel.type) {
      case 'WHATSAPP': {
        // Test via gateway health
        const instance = await prisma.instance.findFirst({ where: { channels: { some: { id: channel.id } } } });
        if (!instance?.containerHost || !instance?.containerName) {
          return { success: false, latency: 0, error: 'Container não mapeado' };
        }
        const waStatus = await openclaw.getWhatsAppStatus(instance.containerHost, instance.containerName);
        return {
          success: waStatus.connected,
          latency: Date.now() - start,
          error: waStatus.connected ? undefined : waStatus.paired ? 'Pareado mas desconectado' : 'Não pareado',
        };
      }
      case 'TELEGRAM': {
        if (!cfg.botToken) return { success: false, latency: 0, error: 'Bot token não configurado' };
        const resp = await fetch(`https://api.telegram.org/bot${cfg.botToken}/getMe`, { signal: AbortSignal.timeout(10000) });
        return { success: resp.ok, latency: Date.now() - start, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      }
      case 'SLACK': {
        if (!cfg.botToken) return { success: false, latency: 0, error: 'Bot token não configurado' };
        const resp = await fetch('https://slack.com/api/auth.test', {
          headers: { Authorization: `Bearer ${cfg.botToken}` },
          signal: AbortSignal.timeout(10000),
        });
        return { success: resp.ok, latency: Date.now() - start, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      }
      case 'DISCORD': {
        if (!cfg.botToken) return { success: false, latency: 0, error: 'Bot token não configurado' };
        const resp = await fetch('https://discord.com/api/v10/users/@me', {
          headers: { Authorization: `Bot ${cfg.botToken}` },
          signal: AbortSignal.timeout(10000),
        });
        return { success: resp.ok, latency: Date.now() - start, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      }
      case 'TEAMS': {
        if (!cfg.appId || !cfg.appPassword) return { success: false, latency: 0, error: 'App ID e Password não configurados' };
        // Test OAuth token endpoint
        const resp = await fetch(`https://login.microsoftonline.com/${cfg.tenantId || 'botframework.com'}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=client_credentials&client_id=${cfg.appId}&client_secret=${encodeURIComponent(cfg.appPassword)}&scope=https://api.botframework.com/.default`,
          signal: AbortSignal.timeout(10000),
        });
        return { success: resp.ok, latency: Date.now() - start, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      }
      case 'MATRIX': {
        if (!cfg.homeserver || !cfg.accessToken) return { success: false, latency: 0, error: 'Homeserver e access token não configurados' };
        const resp = await fetch(`${cfg.homeserver}/_matrix/client/v3/account/whoami`, {
          headers: { Authorization: `Bearer ${cfg.accessToken}` },
          signal: AbortSignal.timeout(10000),
        });
        return { success: resp.ok, latency: Date.now() - start, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      }
      case 'MATTERMOST': {
        if (!cfg.serverUrl || !cfg.botToken) return { success: false, latency: 0, error: 'Server URL e bot token não configurados' };
        const resp = await fetch(`${cfg.serverUrl}/api/v4/users/me`, {
          headers: { Authorization: `Bearer ${cfg.botToken}` },
          signal: AbortSignal.timeout(10000),
        });
        return { success: resp.ok, latency: Date.now() - start, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      }
      case 'LINE': {
        if (!cfg.channelAccessToken) return { success: false, latency: 0, error: 'Channel access token não configurado' };
        const resp = await fetch('https://api.line.me/v2/bot/info', {
          headers: { Authorization: `Bearer ${cfg.channelAccessToken}` },
          signal: AbortSignal.timeout(10000),
        });
        return { success: resp.ok, latency: Date.now() - start, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      }
      case 'WEBHOOK': {
        if (!cfg.webhookUrl) return { success: false, latency: 0, error: 'Webhook URL não configurada' };
        const resp = await fetch(cfg.webhookUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
        return { success: resp.ok || resp.status === 405, latency: Date.now() - start };
      }
      case 'CLI':
        // CLI is always available locally
        return { success: true, latency: Date.now() - start };
      default: {
        // Check if required config fields are present
        const meta = CHANNEL_META[channel.type];
        if (meta?.configFields?.length) {
          const missing = meta.configFields.filter((f: string) => !cfg[f]);
          if (missing.length > 0) {
            return { success: false, latency: 0, error: `Campos faltando: ${missing.join(', ')}` };
          }
        }
        return { success: true, latency: Date.now() - start };
      }
    }
  } catch (err: unknown) {
    return { success: false, latency: Date.now() - start, error: (err as Error).message };
  }
}

export { router as channelsRoutes };
