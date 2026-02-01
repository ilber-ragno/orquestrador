import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

// GET /audit - Query audit logs with filters
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const action = req.query.action as string | undefined;
    const userId = req.query.userId as string | undefined;
    const resource = req.query.resource as string | undefined;
    const correlationId = req.query.correlationId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const search = req.query.search as string | undefined;
    const instanceId = req.query.instanceId as string | undefined;

    const where: Record<string, unknown> = {};
    if (action) where.action = { contains: action };
    if (userId) where.userId = userId;
    if (resource) where.resource = resource;
    if (correlationId) where.correlationId = correlationId;
    if (instanceId) {
      where.details = { path: ['instanceId'], equals: instanceId };
    }
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { action: { contains: search } },
        { resource: { contains: search } },
        { resourceId: { contains: search } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /audit/stats - Audit statistics
router.get('/stats', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalToday, totalWeek, totalAll, byAction, recentUsers] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.auditLog.count(),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.findMany({
        where: { userId: { not: null } },
        select: { userId: true, user: { select: { name: true, email: true } } },
        distinct: ['userId'],
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    res.json({
      totalToday,
      totalWeek,
      totalAll,
      topActions: byAction.map((a) => ({ action: a.action, count: a._count.action })),
      recentUsers: recentUsers.map((u) => ({ id: u.userId, name: u.user?.name, email: u.user?.email })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /audit/stream - SSE live tail
router.get('/stream', authenticate, async (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('data: {"type":"connected"}\n\n');

  let lastId: string | null = null;

  // Poll every 2 seconds for new logs
  const interval = setInterval(async () => {
    try {
      const where: Record<string, unknown> = {};
      if (lastId) {
        const lastLog = await prisma.auditLog.findUnique({ where: { id: lastId }, select: { createdAt: true } });
        if (lastLog) {
          where.createdAt = { gt: lastLog.createdAt };
        }
      }

      const newLogs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: 20,
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      for (const log of newLogs) {
        res.write(`data: ${JSON.stringify({ type: 'log', data: log })}\n\n`);
        lastId = log.id;
      }
    } catch {
      // Connection may have closed
    }
  }, 2000);

  // Set initial lastId to latest log
  try {
    const latest = await prisma.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (latest) lastId = latest.id;
  } catch {
    // ignore
  }

  req.on('close', () => {
    clearInterval(interval);
  });
});

export { router as auditRoutes };
