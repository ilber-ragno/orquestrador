import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);
const router = Router();

interface HealthCheck {
  name: string
  status: 'ok' | 'warning' | 'error'
  message: string
  latency?: number
  details?: Record<string, unknown>
}

// GET /diagnostics/health - Full health check
router.get('/health', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const checks: HealthCheck[] = [];

    // Database check
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.push({ name: 'database', status: 'ok', message: 'PostgreSQL conectado', latency: Date.now() - dbStart });
    } catch (err) {
      checks.push({ name: 'database', status: 'error', message: `PostgreSQL falhou: ${(err as Error).message}`, latency: Date.now() - dbStart });
    }

    // Check database tables
    try {
      const [userCount, instanceCount, logCount] = await Promise.all([
        prisma.user.count(),
        prisma.instance.count(),
        prisma.auditLog.count(),
      ]);
      checks.push({
        name: 'database_data',
        status: 'ok',
        message: `${userCount} usuários, ${instanceCount} instâncias, ${logCount} logs`,
        details: { userCount, instanceCount, logCount },
      });
    } catch (err) {
      checks.push({ name: 'database_data', status: 'error', message: (err as Error).message });
    }

    // Check providers configured
    try {
      const providerCount = await prisma.provider.count();
      const defaultProvider = await prisma.provider.findFirst({ where: { isDefault: true } });
      checks.push({
        name: 'providers',
        status: providerCount > 0 ? 'ok' : 'warning',
        message: providerCount > 0
          ? `${providerCount} provider(s), padrão: ${defaultProvider?.name || 'nenhum'}`
          : 'Nenhum provider configurado',
        details: { count: providerCount, default: defaultProvider?.name || null },
      });
    } catch (err) {
      checks.push({ name: 'providers', status: 'error', message: (err as Error).message });
    }

    // Disk space
    try {
      const { stdout } = await exec('df', ['-h', '/']);
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        const usedPercent = parseInt(parts[4]);
        checks.push({
          name: 'disk',
          status: usedPercent > 90 ? 'error' : usedPercent > 75 ? 'warning' : 'ok',
          message: `${parts[4]} usado (${parts[2]} de ${parts[1]})`,
          details: { total: parts[1], used: parts[2], available: parts[3], percent: usedPercent },
        });
      }
    } catch {
      checks.push({ name: 'disk', status: 'warning', message: 'Não foi possível verificar disco' });
    }

    // Memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);
    checks.push({
      name: 'memory',
      status: memPercent > 90 ? 'error' : memPercent > 75 ? 'warning' : 'ok',
      message: `${memPercent}% usado (${formatBytes(usedMem)} de ${formatBytes(totalMem)})`,
      details: { total: totalMem, free: freeMem, used: usedMem, percent: memPercent },
    });

    // CPU load
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    const loadNormalized = Math.round((loadAvg[0] / cpuCount) * 100);
    checks.push({
      name: 'cpu',
      status: loadNormalized > 90 ? 'error' : loadNormalized > 70 ? 'warning' : 'ok',
      message: `Load: ${loadAvg[0].toFixed(2)} / ${cpuCount} cores (${loadNormalized}%)`,
      details: { load1: loadAvg[0], load5: loadAvg[1], load15: loadAvg[2], cores: cpuCount },
    });

    // Uptime
    const uptimeSec = os.uptime();
    checks.push({
      name: 'uptime',
      status: 'ok',
      message: formatUptime(uptimeSec),
      details: { seconds: uptimeSec },
    });

    // Sessions check
    try {
      const activeSessions = await prisma.session.count({
        where: { expiresAt: { gt: new Date() } },
      });
      checks.push({
        name: 'sessions',
        status: 'ok',
        message: `${activeSessions} sessões ativas`,
        details: { active: activeSessions },
      });
    } catch (err) {
      checks.push({ name: 'sessions', status: 'error', message: (err as Error).message });
    }

    const overallStatus = checks.some((c) => c.status === 'error')
      ? 'error'
      : checks.some((c) => c.status === 'warning')
        ? 'warning'
        : 'ok';

    res.json({ status: overallStatus, checks, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// GET /diagnostics/metrics - System metrics
router.get('/metrics', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // Network interfaces
    const nets = os.networkInterfaces();
    const networkInfo: { name: string; address: string; family: string }[] = [];
    for (const [name, ifaces] of Object.entries(nets)) {
      if (ifaces) {
        for (const iface of ifaces) {
          if (!iface.internal) {
            networkInfo.push({ name, address: iface.address, family: iface.family });
          }
        }
      }
    }

    // Disk info
    let diskInfo = null;
    try {
      const { stdout } = await exec('df', ['-B1', '/']);
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        diskInfo = {
          total: parseInt(parts[1]),
          used: parseInt(parts[2]),
          available: parseInt(parts[3]),
          percent: parseInt(parts[4]),
        };
      }
    } catch {
      // ignore
    }

    // Process info
    const processInfo = {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };

    res.json({
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        uptime: os.uptime(),
      },
      cpu: {
        model: cpus[0]?.model,
        cores: cpus.length,
        loadAvg: { '1m': loadAvg[0], '5m': loadAvg[1], '15m': loadAvg[2] },
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      disk: diskInfo,
      network: networkInfo,
      process: processInfo,
    });
  } catch (err) {
    next(err);
  }
});

// POST /diagnostics/cleanup - Cleanup expired sessions
router.post(
  '/cleanup',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await prisma.session.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'diagnostics.cleanup',
          resource: 'session',
          details: { deletedSessions: deleted.count },
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.json({ success: true, deletedSessions: deleted.count });
    } catch (err) {
      next(err);
    }
  },
);

// --- Helpers ---

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

export { router as diagnosticsRoutes };
