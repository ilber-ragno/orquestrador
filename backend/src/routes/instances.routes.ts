import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
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
      where: { isHidden: false },
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
      where: { id: req.params.id as string },
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
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) {
      return next(new AppError(404, 'NOT_FOUND', 'Instance not found'));
    }

    const configs = await prisma.instanceConfig.findMany({
      where: { instanceId: req.params.id as string },
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
      const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
      if (!instance) {
        return next(new AppError(404, 'NOT_FOUND', 'Instance not found'));
      }

      const { configs } = req.body as z.infer<typeof configUpdateSchema>;
      const results = [];

      for (const cfg of configs) {
        // Get existing config for history
        const existing = await prisma.instanceConfig.findUnique({
          where: { instanceId_key: { instanceId: req.params.id as string, key: cfg.key } },
        });

        // Upsert config
        const updated = await prisma.instanceConfig.upsert({
          where: { instanceId_key: { instanceId: req.params.id as string, key: cfg.key } },
          update: {
            value: cfg.value,
            encrypted: cfg.encrypted,
            version: existing ? existing.version + 1 : 1,
          },
          create: {
            instanceId: req.params.id as string,
            key: cfg.key,
            value: cfg.value,
            encrypted: cfg.encrypted,
          },
        });

        // Record history
        await prisma.configHistory.create({
          data: {
            instanceId: req.params.id as string,
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
              instanceId: req.params.id as string,
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
        where: { id: req.params.id as string },
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
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) {
      return next(new AppError(404, 'NOT_FOUND', 'Instance not found'));
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const keyFilter = req.query.key as string | undefined;

    const where = {
      instanceId: req.params.id as string,
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
      const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
      if (!instance) {
        return next(new AppError(404, 'NOT_FOUND', 'Instance not found'));
      }

      const data = req.body as z.infer<typeof instanceUpdateSchema>;
      const updated = await prisma.instance.update({
        where: { id: req.params.id as string },
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

// POST /instances - Create new instance with LXC container
const createInstanceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  containerHost: z.string().optional(),
  containerType: z.string().optional(),
  planId: z.string().optional(),
});

router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  validate(createInstanceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as z.infer<typeof createInstanceSchema>;

      // Check slug uniqueness
      const existing = await prisma.instance.findFirst({ where: { slug: data.slug } });
      if (existing) {
        return next(new AppError(409, 'CONFLICT', 'Slug já existe'));
      }

      const host = data.containerHost || process.env.LXC_DEFAULT_HOST || '145.223.31.7';
      const containerName = `clawdbot-${data.slug}`;

      // Create instance in DB first
      const instance = await prisma.instance.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description || null,
          containerName,
          containerHost: host,
          containerType: data.containerType || 'lxc',
          status: 'stopped',
          isHidden: false,
        },
      });

      // Launch LXC container asynchronously via job
      const jobService = await import('../services/job.service.js');
      const openclawSvc = await import('../services/openclaw.service.js');
      const job = await jobService.createJob({
        userId: req.user!.sub,
        instanceId: instance.id,
        type: 'instance.create',
        description: `Criar container ${containerName}`,
        steps: [
          'Criar container LXC',
          'Instalar Node.js',
          'Instalar OpenClaw',
          'Criar estrutura de diretórios',
          'Gerar configuração base',
          'Criar workspace e agent padrão',
          'Corrigir configuração (doctor)',
          'Iniciar gateway',
        ],
      });

      // Run async - don't await
      (async () => {
        try {
          await jobService.startJob(job.id);

          // Step 1: Create LXC container (or reuse existing)
          await jobService.startStep(job.steps[0].id);
          const checkExisting = await lxc.execInContainer(host, containerName, 'echo ok', 5000).catch(() => null);
          if (checkExisting && checkExisting.exitCode === 0) {
            await jobService.completeStep(job.steps[0].id, `Container ${containerName} já existe, reutilizando`);
          } else {
            const { execFile } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(execFile);
            await execAsync('bash', ['-c', `lxc launch ubuntu:24.04 ${containerName}`], { timeout: 120000 });
            await new Promise(r => setTimeout(r, 8000));
            await jobService.completeStep(job.steps[0].id, `Container ${containerName} criado`);
          }

          // Step 2: Install Node.js (check first, skip if already present)
          await jobService.startStep(job.steps[1].id);
          const nodeCheck = await lxc.execInContainer(host, containerName, 'node --version 2>/dev/null');
          if (nodeCheck.exitCode === 0 && nodeCheck.stdout.includes('v')) {
            await jobService.completeStep(job.steps[1].id, `Node.js já instalado: ${nodeCheck.stdout.trim()}`);
          } else {
            await lxc.execInContainer(host, containerName, 'apt-get update -qq && apt-get install -y -qq nodejs npm curl', 120000);
            const ver = await lxc.execInContainer(host, containerName, 'node --version');
            await jobService.completeStep(job.steps[1].id, `Node.js instalado: ${ver.stdout.trim()}`);
          }

          // Step 3: Install OpenClaw (check first, skip if already present)
          await jobService.startStep(job.steps[2].id);
          const ocInstalled = await openclawSvc.checkInstalled(host, containerName);
          if (ocInstalled) {
            const ver = await openclawSvc.getVersion(host, containerName);
            await jobService.completeStep(job.steps[2].id, `OpenClaw já instalado: ${ver}`);
          } else {
            const installResult = await openclawSvc.installOpenClaw(host, containerName);
            if (!installResult.success) throw new Error(`Falha ao instalar OpenClaw: ${installResult.output.slice(0, 500)}`);
            const ver = await openclawSvc.getVersion(host, containerName);
            await jobService.completeStep(job.steps[2].id, `OpenClaw instalado: ${ver}`);
          }

          // Step 4: Create full directory structure
          await jobService.startStep(job.steps[3].id);
          const dirsCmd = [
            'mkdir -p /root/.openclaw/agents/main/agent',
            'mkdir -p /root/.openclaw/agents/main/sessions',
            'mkdir -p /root/.openclaw/credentials/whatsapp/default',
            'mkdir -p /root/.openclaw/devices',
            'mkdir -p /root/.openclaw/cron',
            'mkdir -p /root/.openclaw/workspace',
            'mkdir -p /root/.openclaw/memory',
            'mkdir -p /root/.openclaw/identity',
            'mkdir -p /root/.openclaw/canvas',
          ].join(' && ');
          await lxc.execInContainer(host, containerName, dirsCmd);
          const dirCheck = await openclawSvc.checkDirectories(host, containerName);
          const dirSummary = Object.entries(dirCheck).map(([k, v]) => `${k}:${v ? 'OK' : 'FALTA'}`).join(', ');
          await jobService.completeStep(job.steps[3].id, `Diretórios: ${dirSummary}`);

          // Step 5: Generate base config if not exists
          await jobService.startStep(job.steps[4].id);
          const existingConfig = await openclawSvc.readConfig(host, containerName);
          if (existingConfig) {
            await jobService.completeStep(job.steps[4].id, 'Config openclaw.json já existe, mantido');
          } else {
            const token = crypto.randomBytes(24).toString('hex');
            const baseConfig = {
              meta: { lastTouchedVersion: '2026.1.29', lastTouchedAt: new Date().toISOString() },
              agents: {
                defaults: {
                  workspace: '/root/.openclaw/workspace',
                  maxConcurrent: 4,
                  subagents: { maxConcurrent: 8 },
                  model: { primary: 'anthropic:claude-sonnet-4-20250514' },
                },
              },
              commands: { native: 'auto', nativeSkills: 'auto' },
              messages: { ackReactionScope: 'group-mentions' },
              gateway: {
                mode: 'local',
                auth: { mode: 'token', token },
                port: 18789,
                bind: 'loopback',
                tailscale: { mode: 'off', resetOnExit: false },
              },
              auth: { profiles: {} },
              plugins: { entries: { whatsapp: { enabled: true } } },
              channels: { whatsapp: { selfChatMode: false, dmPolicy: 'pairing' } },
              hooks: {
                internal: {
                  enabled: true,
                  entries: {
                    'boot-md': { enabled: true },
                    'command-logger': { enabled: true },
                    'session-memory': { enabled: true },
                  },
                },
              },
              skills: { install: { nodeManager: 'npm' } },
            };
            await openclawSvc.writeConfig(host, containerName, baseConfig);
            await jobService.completeStep(job.steps[4].id, 'Config base gerado com gateway token');
          }

          // Step 6: Create workspace files and auth-profiles
          await jobService.startStep(job.steps[5].id);
          const wsFiles: Record<string, string> = {
            'SOUL.md': `# Soul\nVocê é um assistente inteligente e prestativo.\nResponda sempre em português brasileiro.\nSeja objetivo e claro nas respostas.`,
            'IDENTITY.md': `# Identidade\nNome: Assistente OpenClaw\nInstância: ${data.name}`,
            'USER.md': `# Usuário\nPerfil padrão do usuário.`,
            'TOOLS.md': `# Ferramentas\nLista de ferramentas disponíveis para o agente.`,
            'AGENTS.md': `# Agentes\nConfiguração dos agentes disponíveis.`,
          };
          let wsCreated = 0;
          for (const [fname, content] of Object.entries(wsFiles)) {
            const exists = await openclawSvc.readFile(host, containerName, `/root/.openclaw/workspace/${fname}`);
            if (!exists) {
              await openclawSvc.writeWorkspaceFile(host, containerName, fname, content);
              wsCreated++;
            }
          }
          const existingProfiles = await openclawSvc.getAuthProfiles(host, containerName);
          if (!existingProfiles) {
            await openclawSvc.writeAuthProfiles(host, containerName, {});
          }
          await jobService.completeStep(job.steps[5].id, `${wsCreated} workspace files criados, auth-profiles OK`);

          // Step 7: Run doctor --fix to correct any config issues
          await jobService.startStep(job.steps[6].id);
          const doctorResult = await lxc.execInContainer(host, containerName, 'openclaw doctor --fix --non-interactive 2>&1', 30000);
          await jobService.completeStep(job.steps[6].id, `Doctor executado (exit: ${doctorResult.exitCode})`);

          // Step 8: Start gateway
          await jobService.startStep(job.steps[7].id);
          const gwStart = await openclawSvc.startGateway(host, containerName);
          if (!gwStart.success) {
            await new Promise(r => setTimeout(r, 5000));
            const retry = await openclawSvc.startGateway(host, containerName);
            await jobService.completeStep(job.steps[7].id,
              retry.success ? `Gateway iniciado: ${retry.output}` : 'Gateway não iniciou automaticamente — pode ser iniciado pelo painel');
          } else {
            await jobService.completeStep(job.steps[7].id, `Gateway iniciado: ${gwStart.output}`);
          }

          await prisma.instance.update({ where: { id: instance.id }, data: { status: 'running' } });
          await jobService.completeJob(job.id, { containerName, status: 'running' });
        } catch (err: any) {
          for (const step of job.steps) {
            try { await jobService.failStep(step.id, err.message); } catch {}
          }
          await jobService.failJob(job.id, err.message);
          await prisma.instance.update({ where: { id: instance.id }, data: { status: 'error' } });
        }
      })();

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'instance.create',
          resource: 'instance',
          resourceId: instance.id,
          details: { name: data.name, slug: data.slug, containerName },
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.status(201).json({ ...instance, job: job.id });
    } catch (err) {
      next(err);
    }
  },
);

// ══════════════════════════════════════
// OPENCLAW INFO & EXEC
// ══════════════════════════════════════

// GET /instances/:id/openclaw-info - Get OpenClaw status summary
router.get('/:id/openclaw-info', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!inst) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!inst.containerHost || !inst.containerName) return res.json({});

    const info: Record<string, string> = {};

    // Version
    try {
      const v = await lxc.execInContainer(inst.containerHost, inst.containerName, 'openclaw --version 2>/dev/null || echo unknown');
      info.version = v.stdout.trim();
    } catch { info.version = 'N/A'; }

    // Status
    try {
      const s = await lxc.execInContainer(inst.containerHost, inst.containerName, 'openclaw status --json 2>/dev/null || echo "{}"');
      const parsed = JSON.parse(s.stdout || '{}');
      info.gatewayStatus = parsed.gateway?.status || parsed.status || 'unknown';
      info.gatewayPid = parsed.gateway?.pid?.toString() || '';
      info.gatewayUptime = parsed.gateway?.uptime || '';
      info.activeSessions = parsed.sessions?.active?.toString() || parsed.activeSessions?.toString() || '0';
      info.model = parsed.model?.primary || parsed.model || '';
      info.messagesProcessed = parsed.stats?.messages?.toString() || parsed.messagesProcessed?.toString() || '0';
    } catch { /* ignore */ }

    res.json(info);
  } catch (err) { next(err); }
});

// POST /instances/:id/openclaw-exec - Execute openclaw command
const SAFE_CMD = /^[a-zA-Z0-9\s\/\-\.\:\_\=\,\"\'\*\?\+\@\#\%\^\&\(\)\[\]\{\}\|\\]+$/;

router.post('/:id/openclaw-exec', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!inst) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!inst.containerHost || !inst.containerName) return next(new AppError(400, 'NO_CONTAINER', 'Sem container'));

    let cmd = (req.body.command || '').trim();
    if (!cmd) return next(new AppError(400, 'INVALID_CMD', 'Comando vazio'));

    // Ensure command starts with openclaw or is a slash command
    if (cmd.startsWith('/')) {
      cmd = `openclaw ${cmd}`;
    } else if (!cmd.startsWith('openclaw')) {
      cmd = `openclaw ${cmd}`;
    }

    // Basic sanity check
    if (cmd.length > 500) return next(new AppError(400, 'CMD_TOO_LONG', 'Comando muito longo'));

    const result = await lxc.execInContainer(inst.containerHost, inst.containerName, `${cmd} 2>&1`, 30000);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'openclaw.exec',
        resource: 'instance',
        resourceId: inst.id,
        details: { command: cmd, exitCode: result.exitCode } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: result.exitCode === 0, output: result.stdout, exitCode: result.exitCode });
  } catch (err) { next(err); }
});

function maskSecret(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

export { router as instancesRoutes };
