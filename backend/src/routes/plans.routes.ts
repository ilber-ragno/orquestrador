import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// GET /plans - List all plans
router.get('/', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { usages: true } } },
    });
    res.json(plans);
  } catch (err) {
    next(err);
  }
});

// GET /plans/:id - Get plan with usage
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await prisma.plan.findUnique({
      where: { id: req.params.id as string },
      include: { usages: { orderBy: { period: 'desc' }, take: 12 } },
    });
    if (!plan) return res.status(404).json({ error: { message: 'Plan not found' } });
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

// POST /plans - Create plan (admin only)
router.post('/', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, maxMessages, maxSessions, maxTokens, maxCostCents, maxChannels, maxProviders, blockOnExceed, fallbackAction } = req.body;
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const plan = await prisma.plan.create({
      data: { name, description, maxMessages, maxSessions, maxTokens, maxCostCents, maxChannels, maxProviders, blockOnExceed: blockOnExceed ?? true, fallbackAction: fallbackAction ?? 'block' },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'plan.create',
        resource: 'plan',
        resourceId: plan.id,
        details: { name } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.status(201).json(plan);
  } catch (err) {
    next(err);
  }
});

// PUT /plans/:id - Update plan
const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  maxMessages: z.number().int().min(0).optional().nullable(),
  maxSessions: z.number().int().min(0).optional().nullable(),
  maxTokens: z.number().int().min(0).optional().nullable(),
  maxCostCents: z.number().int().min(0).optional().nullable(),
  maxChannels: z.number().int().min(0).optional().nullable(),
  maxProviders: z.number().int().min(0).optional().nullable(),
  blockOnExceed: z.boolean().optional(),
  fallbackAction: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

router.put('/:id', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updatePlanSchema.parse(req.body);

    const plan = await prisma.plan.update({
      where: { id: req.params.id as string },
      data: data as any,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'plan.update',
        resource: 'plan',
        resourceId: plan.id,
        details: req.body as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json(plan);
  } catch (err) {
    next(err);
  }
});

// DELETE /plans/:id
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.plan.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /plans/:id/assign/:instanceId - Assign plan to instance
router.post('/:id/assign/:instanceId', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.instance.update({
      where: { id: req.params.instanceId as string },
      data: { planId: req.params.id as string },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'plan.assign',
        resource: 'plan',
        resourceId: req.params.id as string,
        details: { instanceId: req.params.instanceId as string } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: true, planId: req.params.id as string, instanceId: req.params.instanceId as string });
  } catch (err) {
    next(err);
  }
});

// GET /plans/usage/:instanceId - Get usage for instance
router.get('/usage/:instanceId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({ where: { id: req.params.instanceId as string } });
    if (!inst) return res.status(404).json({ error: { message: 'Instance not found' } });

    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    let usage = null;
    let plan = null;

    if (inst.planId) {
      plan = await prisma.plan.findUnique({ where: { id: inst.planId } });
      usage = await prisma.planUsage.findFirst({
        where: { planId: inst.planId, instanceId: inst.id, period },
      });

      if (!usage) {
        usage = await prisma.planUsage.create({
          data: { planId: inst.planId, instanceId: inst.id, period },
        });
      }
    }

    res.json({
      plan,
      usage,
      limits: plan
        ? {
            messages: { used: usage?.messages || 0, max: plan.maxMessages, percent: plan.maxMessages ? Math.round(((usage?.messages || 0) / plan.maxMessages) * 100) : null },
            sessions: { used: usage?.sessions || 0, max: plan.maxSessions, percent: plan.maxSessions ? Math.round(((usage?.sessions || 0) / plan.maxSessions) * 100) : null },
            tokens: { used: usage?.tokensUsed || 0, max: plan.maxTokens, percent: plan.maxTokens ? Math.round(((usage?.tokensUsed || 0) / plan.maxTokens) * 100) : null },
            cost: { used: usage?.costCents || 0, max: plan.maxCostCents, percent: plan.maxCostCents ? Math.round(((usage?.costCents || 0) / plan.maxCostCents) * 100) : null },
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

export { router as plansRoutes };
