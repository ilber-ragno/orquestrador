import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import * as jobService from '../services/job.service.js';

const router = Router();

// GET /jobs - List jobs with filters
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;
    const instanceId = req.query.instanceId as string | undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = { contains: type };
    if (instanceId) where.instanceId = instanceId;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { steps: { orderBy: { sortOrder: 'asc' } } },
      }),
      prisma.job.count({ where }),
    ]);

    res.json({ data: jobs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
});

// GET /jobs/stats - Job statistics
router.get('/stats', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [pending, running, completed, failed, cancelled] = await Promise.all([
      prisma.job.count({ where: { status: 'PENDING' } }),
      prisma.job.count({ where: { status: 'RUNNING' } }),
      prisma.job.count({ where: { status: 'COMPLETED' } }),
      prisma.job.count({ where: { status: 'FAILED' } }),
      prisma.job.count({ where: { status: 'CANCELLED' } }),
    ]);
    res.json({ pending, running, completed, failed, cancelled, total: pending + running + completed + failed + cancelled });
  } catch (err) {
    next(err);
  }
});

// GET /jobs/:id - Get job detail
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!job) return res.status(404).json({ error: { message: 'Job not found' } });
    res.json(job);
  } catch (err) {
    next(err);
  }
});

// POST /jobs - Create a job
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await jobService.createJob({
      userId: req.user!.sub,
      instanceId: req.body.instanceId,
      type: req.body.type,
      description: req.body.description,
      input: req.body.input,
      maxRetries: req.body.maxRetries,
      timeout: req.body.timeout,
      steps: req.body.steps,
    });
    res.status(201).json(job);
  } catch (err) {
    next(err);
  }
});

// POST /jobs/:id/cancel - Cancel a job
router.post('/:id/cancel', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await jobService.cancelJob(req.params.id);
    res.json(job);
  } catch (err) {
    next(err);
  }
});

// GET /jobs/:id/stream - SSE job progress
router.get('/:id/stream', authenticate, async (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('data: {"type":"connected"}\n\n');

  const interval = setInterval(async () => {
    try {
      const job = await prisma.job.findUnique({
        where: { id: req.params.id },
        include: { steps: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!job) {
        res.write('data: {"type":"not_found"}\n\n');
        clearInterval(interval);
        res.end();
        return;
      }
      res.write(`data: ${JSON.stringify({ type: 'update', data: job })}\n\n`);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) {
        clearInterval(interval);
        res.end();
      }
    } catch {
      // connection closed
    }
  }, 1000);

  req.on('close', () => clearInterval(interval));
});

export { router as jobsRoutes };
