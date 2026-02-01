import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';
import * as openclaw from '../services/openclaw.service.js';
import { execInContainer } from '../services/lxc.service.js';

const router = Router();

const SAFE_ID = /^[\w\-\.]+$/;

async function getInstance(id: string, next: NextFunction) {
  const inst = await prisma.instance.findUnique({ where: { id } });
  if (!inst) { next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada')); return null; }
  if (!inst.containerHost || !inst.containerName) { next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado')); return null; }
  return inst;
}

// ════════════════════════════════════════
// CRON JOBS
// ════════════════════════════════════════

// GET /instances/:id/automations/crons
router.get('/:id/automations/crons', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const jobs = await openclaw.listCronJobs(inst.containerHost!, inst.containerName!);

    // Cross-reference with AuditLog to determine source (panel vs AI)
    const auditEntries = await prisma.auditLog.findMany({
      where: {
        action: 'cron.create',
        resource: 'cron',
      },
      select: { resourceId: true },
    });
    const panelCreated = new Set(auditEntries.map(a => a.resourceId).filter(Boolean));

    const enriched = jobs.map(j => ({
      ...j,
      source: panelCreated.has(j.name) || panelCreated.has(j.id) ? 'manual' as const : 'ai' as const,
    }));

    res.json(enriched);
  } catch (err) { next(err); }
});

// GET /instances/:id/automations/crons/status
router.get('/:id/automations/crons/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const status = await openclaw.getCronStatus(inst.containerHost!, inst.containerName!);
    res.json(status);
  } catch (err) { next(err); }
});

// GET /instances/:id/automations/crons/runs
router.get('/:id/automations/crons/runs', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const runs = await openclaw.getCronRunHistory(inst.containerHost!, inst.containerName!);
    res.json(runs);
  } catch (err) { next(err); }
});

// GET /instances/:id/automations/crons/:jobId/runs
router.get('/:id/automations/crons/:jobId/runs', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const jobId = req.params.jobId as string;
    if (!SAFE_ID.test(jobId)) return next(new AppError(400, 'INVALID_ID', 'ID inválido'));
    const runs = await openclaw.getCronRunHistory(inst.containerHost!, inst.containerName!, jobId);
    res.json(runs);
  } catch (err) { next(err); }
});

// POST /instances/:id/automations/crons/:jobId/toggle
router.post('/:id/automations/crons/:jobId/toggle', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const jobId = req.params.jobId as string;
    if (!SAFE_ID.test(jobId)) return next(new AppError(400, 'INVALID_ID', 'ID inválido'));
    const enable = req.body.enable === true;
    const success = await openclaw.toggleCronJob(inst.containerHost!, inst.containerName!, jobId, enable);
    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: enable ? 'cron.enable' : 'cron.disable',
        resource: 'cron',
        resourceId: jobId,
        details: { instanceId: inst.id, jobId },
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });
    res.json({ success, jobId, enabled: enable });
  } catch (err) { next(err); }
});

// POST /instances/:id/automations/crons/:jobId/run
router.post('/:id/automations/crons/:jobId/run', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const jobId = req.params.jobId as string;
    if (!SAFE_ID.test(jobId)) return next(new AppError(400, 'INVALID_ID', 'ID inválido'));
    const result = await openclaw.forceRunCronJob(inst.containerHost!, inst.containerName!, jobId);
    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'cron.force_run',
        resource: 'cron',
        resourceId: jobId,
        details: { instanceId: inst.id, jobId, success: result.success },
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });
    res.json(result);
  } catch (err) { next(err); }
});

// DELETE /instances/:id/automations/crons/:jobId
router.delete('/:id/automations/crons/:jobId', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const jobId = req.params.jobId as string;
    if (!SAFE_ID.test(jobId)) return next(new AppError(400, 'INVALID_ID', 'ID inválido'));
    const success = await openclaw.removeCronJob(inst.containerHost!, inst.containerName!, jobId);
    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'cron.remove',
        resource: 'cron',
        resourceId: jobId,
        details: { instanceId: inst.id, jobId },
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });
    res.json({ success, jobId });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════
// CRON CREATION
// ════════════════════════════════════════

const createCronSchema = z.object({
  name: z.string().min(1).max(100),
  scheduleType: z.enum(['at', 'every', 'cron']),
  scheduleValue: z.string().min(1).max(200),
  timezone: z.string().max(50).optional(),
  executionMode: z.enum(['main', 'isolated']),
  wakeMode: z.enum(['next-heartbeat', 'now']).optional(),
  agentId: z.string().max(100).optional(),
  deleteAfterRun: z.boolean().optional(),
  message: z.string().max(5000).optional(),
  model: z.string().max(100).optional(),
  thinking: z.enum(['xhigh', 'high', 'medium', 'low', 'minimal', 'off']).optional(),
  timeoutSeconds: z.number().int().min(10).max(600).optional(),
  postToMainPrefix: z.string().max(50).optional(),
  postToMainMode: z.enum(['summary', 'full']).optional(),
  postToMainMaxChars: z.number().int().min(100).max(50000).optional(),
  delivery: z.object({
    enabled: z.boolean().optional(),
    channel: z.string().max(100).optional(),
    to: z.string().max(200).optional(),
  }).optional(),
});

router.post('/:id/automations/crons', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const data = createCronSchema.parse(req.body);

    // Build the openclaw cron add command
    let schedule = '';
    switch (data.scheduleType) {
      case 'at': schedule = `at:${data.scheduleValue}`; break;
      case 'every': schedule = `every:${data.scheduleValue}`; break;
      case 'cron': schedule = data.scheduleValue; break;
    }

    // Write cron to openclaw.json
    const config = await openclaw.readConfig(inst.containerHost!, inst.containerName!) || {};
    if (!config.crons) config.crons = {};
    if (!config.crons.entries) config.crons.entries = {};

    const cronEntry: any = {
      schedule,
      enabled: true,
      execution: data.executionMode,
    };
    if (data.timezone) cronEntry.timezone = data.timezone;
    if (data.wakeMode && data.wakeMode !== 'next-heartbeat') cronEntry.wakeMode = data.wakeMode;
    if (data.agentId) cronEntry.agentId = data.agentId;
    if (data.deleteAfterRun) cronEntry.deleteAfterRun = true;
    if (data.executionMode === 'isolated') {
      cronEntry.isolated = {};
      if (data.message) cronEntry.isolated.message = data.message;
      if (data.model) cronEntry.isolated.model = data.model;
      if (data.thinking) cronEntry.isolated.thinking = data.thinking;
      if (data.timeoutSeconds) cronEntry.isolated.timeoutSeconds = data.timeoutSeconds;
      if (data.postToMainPrefix || data.postToMainMode || data.postToMainMaxChars) {
        cronEntry.isolated.postToMain = {};
        if (data.postToMainPrefix) cronEntry.isolated.postToMain.prefix = data.postToMainPrefix;
        if (data.postToMainMode) cronEntry.isolated.postToMain.mode = data.postToMainMode;
        if (data.postToMainMaxChars) cronEntry.isolated.postToMain.maxChars = data.postToMainMaxChars;
      }
    }
    if (data.delivery?.enabled) {
      cronEntry.delivery = {};
      if (data.delivery.channel) cronEntry.delivery.channel = data.delivery.channel;
      if (data.delivery.to) cronEntry.delivery.to = data.delivery.to;
    }

    config.crons.entries[data.name] = cronEntry;
    await openclaw.writeConfig(inst.containerHost!, inst.containerName!, config);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'cron.create',
        resource: 'cron',
        resourceId: data.name,
        details: { instanceId: inst.id, cronEntry } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.status(201).json({ success: true, name: data.name, cron: cronEntry });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { message: 'Dados inválidos', details: err.errors } });
    }
    next(err);
  }
});

// POST /instances/:id/automations/crons/:jobId/edit - Edit existing cron
router.post('/:id/automations/crons/:jobId/edit', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const jobId = req.params.jobId as string;
    if (!SAFE_ID.test(jobId)) return next(new AppError(400, 'INVALID_ID', 'ID inválido'));

    const data = createCronSchema.partial().parse(req.body);

    const config = await openclaw.readConfig(inst.containerHost!, inst.containerName!) || {};
    if (!config.crons?.entries?.[jobId]) {
      return next(new AppError(404, 'NOT_FOUND', 'Cron job não encontrado no config'));
    }

    const entry = config.crons.entries[jobId];
    if (data.scheduleValue) {
      let schedule = '';
      const st = data.scheduleType || 'cron';
      switch (st) {
        case 'at': schedule = `at:${data.scheduleValue}`; break;
        case 'every': schedule = `every:${data.scheduleValue}`; break;
        case 'cron': schedule = data.scheduleValue; break;
      }
      entry.schedule = schedule;
    }
    if (data.timezone !== undefined) entry.timezone = data.timezone || undefined;
    if (data.executionMode) entry.execution = data.executionMode;
    if (data.wakeMode) entry.wakeMode = data.wakeMode === 'next-heartbeat' ? undefined : data.wakeMode;
    if (data.agentId !== undefined) entry.agentId = data.agentId || undefined;
    if (data.deleteAfterRun !== undefined) entry.deleteAfterRun = data.deleteAfterRun || undefined;
    if (data.executionMode === 'isolated' || entry.execution === 'isolated') {
      if (!entry.isolated) entry.isolated = {};
      if (data.message !== undefined) entry.isolated.message = data.message || undefined;
      if (data.model !== undefined) entry.isolated.model = data.model || undefined;
      if (data.thinking !== undefined) entry.isolated.thinking = data.thinking || undefined;
      if (data.timeoutSeconds !== undefined) entry.isolated.timeoutSeconds = data.timeoutSeconds || undefined;
      if (data.postToMainPrefix !== undefined || data.postToMainMode !== undefined || data.postToMainMaxChars !== undefined) {
        if (!entry.isolated.postToMain) entry.isolated.postToMain = {};
        if (data.postToMainPrefix !== undefined) entry.isolated.postToMain.prefix = data.postToMainPrefix;
        if (data.postToMainMode !== undefined) entry.isolated.postToMain.mode = data.postToMainMode;
        if (data.postToMainMaxChars !== undefined) entry.isolated.postToMain.maxChars = data.postToMainMaxChars;
      }
    }
    if (data.delivery) {
      entry.delivery = data.delivery.enabled ? { channel: data.delivery.channel, to: data.delivery.to } : undefined;
    }

    config.crons.entries[jobId] = entry;
    await openclaw.writeConfig(inst.containerHost!, inst.containerName!, config);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'cron.edit',
        resource: 'cron',
        resourceId: jobId,
        details: { instanceId: inst.id, jobId, changes: data } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: true, jobId, cron: entry });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { message: 'Dados inválidos', details: err.errors } });
    }
    next(err);
  }
});

// ════════════════════════════════════════
// SKILLS
// ════════════════════════════════════════

// GET /instances/:id/automations/skills
router.get('/:id/automations/skills', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const skills = await openclaw.listSkills(inst.containerHost!, inst.containerName!);
    res.json(skills);
  } catch (err) { next(err); }
});

// POST /instances/:id/automations/skills/install - Install skill from ClawHub
const installSkillSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[\w\-\/\.]+$/),
});

router.post('/:id/automations/skills/install', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const { slug } = installSkillSchema.parse(req.body);
    const result = await execInContainer(inst.containerHost!, inst.containerName!, `clawhub install ${slug} 2>&1`);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'skill.install',
        resource: 'skill',
        resourceId: slug,
        details: { instanceId: inst.id, slug, output: result.stdout.trim() } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    const success = !result.stdout.includes('Error') && !result.stdout.includes('error');
    res.json({ success, slug, output: result.stdout.trim() });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { message: 'Slug inválido', details: err.errors } });
    }
    next(err);
  }
});

// POST /instances/:id/automations/skills/update - Update all skills
router.post('/:id/automations/skills/update', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const result = await execInContainer(inst.containerHost!, inst.containerName!, 'clawhub update --all 2>&1');

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'skill.update_all',
        resource: 'skill',
        resourceId: inst.id,
        details: { instanceId: inst.id, output: result.stdout.trim() } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: true, output: result.stdout.trim() });
  } catch (err) { next(err); }
});

// PUT /instances/:id/automations/skills/:name/config - Update skill config
const skillConfigSchema = z.object({
  enabled: z.boolean().optional(),
  apiKey: z.string().max(500).optional(),
  env: z.record(z.string(), z.string()).optional(),
  config: z.any().optional(),
});

router.put('/:id/automations/skills/:name/config', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const skillName = req.params.name as string;
    if (!SAFE_ID.test(skillName)) return next(new AppError(400, 'INVALID_NAME', 'Nome inválido'));

    const data = skillConfigSchema.parse(req.body);

    // Update skill config in openclaw.json
    const config = await openclaw.readConfig(inst.containerHost!, inst.containerName!) || {};
    if (!config.skills) config.skills = {};
    if (!config.skills.entries) config.skills.entries = {};

    const entry = config.skills.entries[skillName] || {};
    if (data.enabled !== undefined) entry.enabled = data.enabled;
    if (data.apiKey !== undefined) entry.apiKey = data.apiKey;
    if (data.env) entry.env = { ...(entry.env || {}), ...data.env };
    if (data.config !== undefined) entry.config = data.config;

    config.skills.entries[skillName] = entry;
    await openclaw.writeConfig(inst.containerHost!, inst.containerName!, config);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'skill.config',
        resource: 'skill',
        resourceId: skillName,
        details: { instanceId: inst.id, skillName, changes: data } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: true, skillName, applied: data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { message: 'Dados inválidos', details: err.errors } });
    }
    next(err);
  }
});

// ════════════════════════════════════════
// HOOKS
// ════════════════════════════════════════

// GET /instances/:id/automations/hooks
router.get('/:id/automations/hooks', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const hooks = await openclaw.listHooks(inst.containerHost!, inst.containerName!);
    res.json(hooks);
  } catch (err) { next(err); }
});

// POST /instances/:id/automations/hooks/:name/toggle
router.post('/:id/automations/hooks/:name/toggle', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const hookName = req.params.name as string;
    if (!SAFE_ID.test(hookName)) return next(new AppError(400, 'INVALID_NAME', 'Nome inválido'));
    const enable = req.body.enable === true;
    const success = await openclaw.toggleHook(inst.containerHost!, inst.containerName!, hookName, enable);
    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: enable ? 'hook.enable' : 'hook.disable',
        resource: 'hook',
        resourceId: hookName,
        details: { instanceId: inst.id, hookName },
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });
    res.json({ success, hookName, enabled: enable });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════
// PROCESSES
// ════════════════════════════════════════

// GET /instances/:id/automations/processes
router.get('/:id/automations/processes', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const processes = await openclaw.listProcesses(inst.containerHost!, inst.containerName!);
    res.json(processes);
  } catch (err) { next(err); }
});

export { router as automationsRoutes };
