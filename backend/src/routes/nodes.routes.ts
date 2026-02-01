import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';
import { execInContainer } from '../services/lxc.service.js';

const router = Router();

const SAFE_ID = /^[\w\-\.]+$/;

async function getInstance(id: string, next: NextFunction) {
  const inst = await prisma.instance.findUnique({ where: { id } });
  if (!inst) { next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada')); return null; }
  if (!inst.containerHost || !inst.containerName) { next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado')); return null; }
  return inst;
}

// GET /instances/:id/nodes - List paired devices
router.get('/:id/nodes', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const result = await execInContainer(inst.containerHost!, inst.containerName!, 'openclaw devices list --json 2>&1');
    try {
      const devices = JSON.parse(result.stdout);
      res.json(Array.isArray(devices) ? devices : []);
    } catch {
      // If not JSON, parse text output
      const lines = result.stdout.trim().split('\n').filter(Boolean);
      const devices = lines.map((line, i) => {
        const parts = line.split(/\s+/);
        return { id: parts[0] || `device-${i}`, name: parts[1] || parts[0] || `Device ${i}`, type: parts[2] || 'unknown', status: parts[3] || 'unknown' };
      });
      res.json(devices);
    }
  } catch (err) { next(err); }
});

// POST /instances/:id/nodes/:deviceId/approve
router.post('/:id/nodes/:deviceId/approve', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const deviceId = req.params.deviceId as string;
    if (!SAFE_ID.test(deviceId)) return next(new AppError(400, 'INVALID_ID', 'ID inválido'));

    const result = await execInContainer(inst.containerHost!, inst.containerName!, `openclaw devices approve ${deviceId} 2>&1`);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'node.approve',
        resource: 'device',
        resourceId: deviceId,
        details: { instanceId: inst.id, output: result.stdout.substring(0, 500) } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: result.exitCode === 0, deviceId, output: result.stdout.trim() });
  } catch (err) { next(err); }
});

// POST /instances/:id/nodes/:deviceId/reject
router.post('/:id/nodes/:deviceId/reject', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const deviceId = req.params.deviceId as string;
    if (!SAFE_ID.test(deviceId)) return next(new AppError(400, 'INVALID_ID', 'ID inválido'));

    const result = await execInContainer(inst.containerHost!, inst.containerName!, `openclaw devices reject ${deviceId} 2>&1`);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'node.reject',
        resource: 'device',
        resourceId: deviceId,
        details: { instanceId: inst.id, output: result.stdout.substring(0, 500) } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: result.exitCode === 0, deviceId, output: result.stdout.trim() });
  } catch (err) { next(err); }
});

// POST /instances/:id/nodes/:deviceId/remove
router.post('/:id/nodes/:deviceId/remove', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;
    const deviceId = req.params.deviceId as string;
    if (!SAFE_ID.test(deviceId)) return next(new AppError(400, 'INVALID_ID', 'ID inválido'));

    const result = await execInContainer(inst.containerHost!, inst.containerName!, `openclaw devices remove ${deviceId} 2>&1`);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'node.remove',
        resource: 'device',
        resourceId: deviceId,
        details: { instanceId: inst.id, output: result.stdout.substring(0, 500) } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: result.exitCode === 0, deviceId, output: result.stdout.trim() });
  } catch (err) { next(err); }
});

export { router as nodesRoutes };
