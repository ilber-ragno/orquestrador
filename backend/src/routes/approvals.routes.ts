import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
import * as approvalService from '../services/approval.service.js';

const router = Router();

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

async function getInstance(id: string, next: NextFunction) {
  const inst = await prisma.instance.findUnique({ where: { id } });
  if (!inst) { next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada')); return null; }
  return inst;
}

// ═══════════════════════════════════════
// LIST APPROVALS (filtros: status, category)
// ═══════════════════════════════════════

router.get('/:id/approvals', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const { status, category, page = '1', limit = '20' } = req.query as Record<string, string>;

    const result = await approvalService.listByInstance(inst.id, {
      status: status as any,
      category: category as any,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json(result);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// LIST PENDING
// ═══════════════════════════════════════

router.get('/:id/approvals/pending', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const pending = await approvalService.listPending(inst.id);
    res.json({ items: pending, total: pending.length });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// COUNT PENDING (for badge)
// ═══════════════════════════════════════

router.get('/:id/approvals/count', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const count = await approvalService.countPending(inst.id);
    res.json({ count });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// CREATE APPROVAL (manual or via webhook)
// ═══════════════════════════════════════

const createSchema = z.object({
  toolName: z.string().min(1).max(100),
  sessionId: z.string().optional(),
  context: z.string().max(5000).optional(),
  category: z.enum(['TOOL', 'EXEC', 'API', 'ELEVATED']).optional(),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  description: z.string().max(500).optional(),
});

router.post('/:id/approvals', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const data = createSchema.parse(req.body);
    const approval = await approvalService.createApproval(inst.id, data);
    res.status(201).json(approval);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// WEBHOOK (called by OpenClaw container)
// ═══════════════════════════════════════

router.post('/:id/approvals/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!inst) return res.status(404).json({ error: 'Not found' });

    // Validate via gateway token
    const token = req.headers['x-gateway-token'] || req.query.token;
    if (inst.gatewayToken && token !== inst.gatewayToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { toolName, sessionId, context } = req.body;
    if (!toolName) return res.status(400).json({ error: 'toolName required' });

    const approval = await approvalService.createApproval(inst.id, {
      toolName,
      sessionId,
      context,
    });

    res.status(201).json(approval);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// APPROVE
// ═══════════════════════════════════════

const approveSchema = z.object({
  permanent: z.boolean().default(false),
});

router.put('/:id/approvals/:aid/approve', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const { permanent } = approveSchema.parse(req.body);

    const approval = await prisma.toolApproval.findFirst({
      where: { id: req.params.aid as string, instanceId: inst.id },
    });
    if (!approval) return next(new AppError(404, 'NOT_FOUND', 'Aprovação não encontrada'));
    if (approval.status !== 'PENDING') return next(new AppError(400, 'INVALID_STATUS', 'Aprovação já decidida'));

    const result = await approvalService.approveApproval(approval.id, req.user!.sub, permanent);
    res.json(result);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// DENY
// ═══════════════════════════════════════

router.put('/:id/approvals/:aid/deny', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const approval = await prisma.toolApproval.findFirst({
      where: { id: req.params.aid as string, instanceId: inst.id },
    });
    if (!approval) return next(new AppError(404, 'NOT_FOUND', 'Aprovação não encontrada'));
    if (approval.status !== 'PENDING') return next(new AppError(400, 'INVALID_STATUS', 'Aprovação já decidida'));

    const result = await approvalService.denyApproval(approval.id, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// SSE STREAM (real-time)
// ═══════════════════════════════════════

router.get('/:id/approvals/stream', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response) => {
  const inst = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
  if (!inst) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('data: {"type":"connected"}\n\n');

  let lastCheck = new Date();

  const interval = setInterval(async () => {
    try {
      // Find new approvals since last check
      const newApprovals = await prisma.toolApproval.findMany({
        where: {
          instanceId: inst.id,
          createdAt: { gt: lastCheck },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const approval of newApprovals) {
        res.write(`data: ${JSON.stringify({ type: 'new_approval', data: approval })}\n\n`);
      }

      // Find status changes since last check
      const changed = await prisma.toolApproval.findMany({
        where: {
          instanceId: inst.id,
          decidedAt: { gt: lastCheck },
        },
      });

      for (const item of changed) {
        res.write(`data: ${JSON.stringify({ type: 'status_change', data: item })}\n\n`);
      }

      lastCheck = new Date();

      // Heartbeat
      res.write(': heartbeat\n\n');
    } catch (err) {
      logger.error({ err }, '[Approvals SSE] Erro no polling');
    }
  }, 3000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

export { router as approvalsRoutes };
