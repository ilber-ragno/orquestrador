import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';
import * as openclaw from '../services/openclaw.service.js';

const router = Router();

// GET /instances/:id/agents - List agents
router.get('/:id/agents', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));

    const agents = await prisma.agent.findMany({
      where: { instanceId: req.params.id as string },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    // Also fetch workspace files if container is available
    let workspaceFiles: Record<string, string | null> = {};
    if (instance.containerHost && instance.containerName) {
      const files = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'AGENTS.md', 'HEARTBEAT.md', 'MEMORY.md'];
      const results = await Promise.allSettled(
        files.map(f => openclaw.getWorkspaceFile(instance.containerHost!, instance.containerName!, f))
      );
      files.forEach((f, i) => {
        const r = results[i];
        workspaceFiles[f] = r.status === 'fulfilled' ? r.value : null;
      });
    }

    res.json({ agents, workspaceFiles });
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/agents - Create agent
const bindingRuleSchema = z.object({
  match: z.enum(['channel', 'accountId', 'peer.kind', 'peer.id', 'guildId', 'teamId']),
  value: z.string().max(200),
});

const sandboxSchema = z.object({
  mode: z.enum(['off', 'non-main', 'all']).optional(),
  scope: z.enum(['session', 'agent', 'shared']).optional(),
  workspaceAccess: z.enum(['none', 'ro', 'rw']).optional(),
  dockerImage: z.string().max(200).optional().nullable(),
  dockerNetwork: z.enum(['none', 'bridge']).optional().nullable(),
  dockerUser: z.string().max(50).optional().nullable(),
  dockerMemory: z.string().max(20).optional().nullable(),
  dockerCpus: z.number().min(0).max(32).optional().nullable(),
  dockerSetupCommand: z.string().max(1000).optional().nullable(),
  browserEnabled: z.boolean().optional().nullable(),
  pruneIdleHours: z.number().min(1).max(720).optional().nullable(),
  pruneMaxAgeDays: z.number().min(1).max(365).optional().nullable(),
});

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().max(200).optional().nullable(),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().max(10000).optional(),
  model: z.string().max(100).optional(),
  isDefault: z.boolean().optional().default(false),
  personality: z.any().optional(),
  emoji: z.string().max(10).optional().nullable(),
  avatar: z.string().max(500).optional().nullable(),
  theme: z.string().max(200).optional().nullable(),
  agentDir: z.string().max(500).optional().nullable(),
  mentionPatterns: z.array(z.string().max(100)).max(20).optional().nullable(),
  subagentsAllowAgents: z.array(z.string().max(100)).max(20).optional().nullable(),
  bindings: z.array(bindingRuleSchema).max(20).optional().nullable(),
  sandbox: sandboxSchema.optional().nullable(),
  toolsAllow: z.array(z.string().max(100)).max(50).optional().nullable(),
  toolsDeny: z.array(z.string().max(100)).max(50).optional().nullable(),
  workspacePath: z.string().max(500).optional().nullable(),
});

router.post('/:id/agents', authenticate, requireRole('ADMIN', 'OPERATOR'), validate(createAgentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));

    const data = req.body as z.infer<typeof createAgentSchema>;

    // Separate Prisma fields from OpenClaw-only fields
    const { displayName, agentDir, mentionPatterns, subagentsAllowAgents, bindings, sandbox, toolsAllow, toolsDeny, ...prismaFields } = data;

    // If setting as default, unset others
    if (data.isDefault) {
      await prisma.agent.updateMany({ where: { instanceId: req.params.id as string }, data: { isDefault: false } });
    }

    const agent = await prisma.agent.create({
      data: {
        instanceId: req.params.id as string,
        ...prismaFields,
        // Json fields: convert null to Prisma-compatible values
        bindings: bindings === null ? undefined : bindings,
        sandbox: sandbox === null ? undefined : sandbox,
        toolsAllow: toolsAllow === null ? undefined : toolsAllow,
        toolsDeny: toolsDeny === null ? undefined : toolsDeny,
      },
    });

    // Sync to workspace if container available
    if (instance.containerHost && instance.containerName) {
      if (data.systemPrompt) {
        await openclaw.writeWorkspaceFile(instance.containerHost, instance.containerName, 'SOUL.md', data.systemPrompt);
      }
      // Sync all fields to openclaw.json
      await syncAgentToConfig(instance, agent.name, {
        displayName: data.displayName as any,
        bindings: data.bindings as any,
        sandbox: data.sandbox as any,
        toolsAllow: data.toolsAllow as any,
        toolsDeny: data.toolsDeny as any,
        workspacePath: data.workspacePath as any,
        agentDir: data.agentDir as any,
        mentionPatterns: data.mentionPatterns as any,
        subagentsAllowAgents: data.subagentsAllowAgents as any,
        model: data.model as any,
        emoji: data.emoji as any,
        avatar: data.avatar as any,
        theme: data.theme as any,
        isDefault: data.isDefault,
      }).catch(() => {});
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'agent.create',
        resource: 'agent',
        resourceId: agent.id,
        details: { instanceId: req.params.id as string, name: data.name },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        correlationId: req.correlationId,
      },
    });

    res.status(201).json(agent);
  } catch (err) {
    next(err);
  }
});

// PUT /instances/:id/agents/:agentId - Update agent
router.put('/:id/agents/:agentId', authenticate, requireRole('ADMIN', 'OPERATOR'), validate(createAgentSchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.agent.findFirst({ where: { id: req.params.agentId as string, instanceId: req.params.id as string } });
    if (!agent) return next(new AppError(404, 'NOT_FOUND', 'Agent não encontrado'));

    const data = req.body;

    // Separate Prisma fields from OpenClaw-only fields
    const { displayName, agentDir, mentionPatterns, subagentsAllowAgents, bindings, sandbox, toolsAllow, toolsDeny, ...prismaUpdateFields } = data;

    if (data.isDefault) {
      await prisma.agent.updateMany({ where: { instanceId: req.params.id as string, NOT: { id: agent.id } }, data: { isDefault: false } });
    }

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        ...prismaUpdateFields,
        // Json fields: only include if explicitly provided, convert null to Prisma.JsonNull
        ...(bindings !== undefined ? { bindings: bindings ?? undefined } : {}),
        ...(sandbox !== undefined ? { sandbox: sandbox ?? undefined } : {}),
        ...(toolsAllow !== undefined ? { toolsAllow: toolsAllow ?? undefined } : {}),
        ...(toolsDeny !== undefined ? { toolsDeny: toolsDeny ?? undefined } : {}),
      },
    });

    // Sync prompt to workspace
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (instance?.containerHost && instance.containerName) {
      if (data.systemPrompt) {
        await openclaw.writeWorkspaceFile(instance.containerHost, instance.containerName, 'SOUL.md', data.systemPrompt);
      }
      // Sync all fields to openclaw.json via unified sync
      await syncAgentToConfig(instance, updated.name, {
        displayName: data.displayName,
        bindings: data.bindings,
        sandbox: data.sandbox,
        toolsAllow: data.toolsAllow,
        toolsDeny: data.toolsDeny,
        workspacePath: data.workspacePath,
        agentDir: data.agentDir,
        mentionPatterns: data.mentionPatterns,
        subagentsAllowAgents: data.subagentsAllowAgents,
        model: data.model,
        emoji: data.emoji,
        avatar: data.avatar,
        theme: data.theme,
        isDefault: data.isDefault,
      }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /instances/:id/agents/:agentId - Delete agent
router.delete('/:id/agents/:agentId', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.agent.findFirst({ where: { id: req.params.agentId as string, instanceId: req.params.id as string } });
    if (!agent) return next(new AppError(404, 'NOT_FOUND', 'Agent não encontrado'));

    await prisma.agent.delete({ where: { id: agent.id } });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'agent.delete',
        resource: 'agent',
        resourceId: agent.id,
        details: { instanceId: req.params.id as string, name: agent.name },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        correlationId: req.correlationId,
      },
    });

    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// PUT /instances/:id/agents/workspace/:fileName - Update workspace file
const workspaceSchema = z.object({ content: z.string().max(50000) });

router.put('/:id/agents/workspace/:fileName', authenticate, requireRole('ADMIN', 'OPERATOR'), validate(workspaceSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const allowed = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'AGENTS.md', 'HEARTBEAT.md', 'MEMORY.md'];
    if (!allowed.includes(req.params.fileName as string)) {
      return next(new AppError(400, 'INVALID_FILE', `Arquivo não permitido. Use: ${allowed.join(', ')}`));
    }

    const ok = await openclaw.writeWorkspaceFile(instance.containerHost, instance.containerName, req.params.fileName as string, req.body.content);
    if (!ok) return next(new AppError(500, 'WRITE_FAILED', 'Falha ao escrever arquivo no container'));

    res.json({ success: true, fileName: req.params.fileName as string });
  } catch (err) {
    next(err);
  }
});

// --- Helpers ---

async function syncAgentToConfig(instance: any, agentName: string, opts: {
  displayName?: string | null;
  bindings?: any[] | null;
  sandbox?: any | null;
  toolsAllow?: string[] | null;
  toolsDeny?: string[] | null;
  workspacePath?: string | null;
  agentDir?: string | null;
  mentionPatterns?: string[] | null;
  subagentsAllowAgents?: string[] | null;
  model?: string | null;
  emoji?: string | null;
  avatar?: string | null;
  theme?: string | null;
  isDefault?: boolean;
}) {
  if (!instance.containerHost || !instance.containerName) return;
  const config = await openclaw.readConfig(instance.containerHost, instance.containerName);
  if (!config) return;

  if (!config.agents) config.agents = {};
  if (!config.agents.entries) config.agents.entries = {};

  const entry = config.agents.entries[agentName] || {};

  // Identity
  if (opts.displayName !== undefined || opts.emoji !== undefined || opts.avatar !== undefined || opts.theme !== undefined) {
    if (!entry.identity) entry.identity = {};
    if (opts.displayName !== undefined) entry.identity.name = opts.displayName || undefined;
    if (opts.emoji !== undefined) entry.identity.emoji = opts.emoji || undefined;
    if (opts.avatar !== undefined) entry.identity.avatar = opts.avatar || undefined;
    if (opts.theme !== undefined) entry.identity.theme = opts.theme || undefined;
  }
  if (opts.model !== undefined) entry.model = opts.model || undefined;
  if (opts.isDefault !== undefined) entry.default = opts.isDefault;
  if (opts.agentDir !== undefined) entry.agentDir = opts.agentDir || undefined;
  if (opts.bindings !== undefined) entry.bindings = opts.bindings;
  if (opts.sandbox !== undefined) {
    const sb = opts.sandbox || {};
    entry.sandbox = { mode: sb.mode, scope: sb.scope, workspaceAccess: sb.workspaceAccess };
    if (sb.dockerImage || sb.dockerNetwork !== 'none' || sb.dockerUser !== '1000:1000' || sb.dockerMemory || sb.dockerCpus || sb.dockerSetupCommand) {
      entry.sandbox.docker = {
        ...(sb.dockerImage ? { image: sb.dockerImage } : {}),
        ...(sb.dockerNetwork && sb.dockerNetwork !== 'none' ? { network: sb.dockerNetwork } : {}),
        ...(sb.dockerUser && sb.dockerUser !== '1000:1000' ? { user: sb.dockerUser } : {}),
        ...(sb.dockerMemory ? { memory: sb.dockerMemory } : {}),
        ...(sb.dockerCpus ? { cpus: sb.dockerCpus } : {}),
        ...(sb.dockerSetupCommand ? { setupCommand: sb.dockerSetupCommand } : {}),
      };
    }
    if (sb.browserEnabled) entry.sandbox.browser = { enabled: true };
    if (sb.pruneIdleHours !== 24 || sb.pruneMaxAgeDays !== 7) {
      entry.sandbox.prune = { idleHours: sb.pruneIdleHours, maxAgeDays: sb.pruneMaxAgeDays };
    }
  }
  if (opts.toolsAllow !== undefined || opts.toolsDeny !== undefined) {
    if (!entry.tools) entry.tools = {};
    if (opts.toolsAllow !== undefined) entry.tools.allow = opts.toolsAllow;
    if (opts.toolsDeny !== undefined) entry.tools.deny = opts.toolsDeny;
  }
  if (opts.workspacePath !== undefined) entry.workspacePath = opts.workspacePath;
  if (opts.mentionPatterns !== undefined) {
    if (!entry.groupChat) entry.groupChat = {};
    entry.groupChat.mentionPatterns = opts.mentionPatterns;
  }
  if (opts.subagentsAllowAgents !== undefined) {
    if (!entry.subagents) entry.subagents = {};
    entry.subagents.allowAgents = opts.subagentsAllowAgents;
  }

  config.agents.entries[agentName] = entry;
  await openclaw.writeConfig(instance.containerHost, instance.containerName, config);
}

export { router as agentsRoutes };
