import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import * as openclaw from '../services/openclaw.service.js';
import { execInContainer } from '../services/lxc.service.js';
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

// GET /diagnostics/instance/:id - Per-instance diagnostics inside container (Etapa 28)
router.get('/instance/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return res.status(404).json({ error: { message: 'Instância não encontrada' } });
    if (!instance.containerHost || !instance.containerName) {
      return res.json({ status: 'error', checks: [{ name: 'container', status: 'error', message: 'Container não mapeado', suggestion: null }] });
    }

    const host = instance.containerHost;
    const container = instance.containerName;
    const checks: { name: string; status: 'ok' | 'warning' | 'error'; message: string; suggestion: string | null }[] = [];

    // OpenClaw checks
    const openclawChecks = await openclaw.validateInstance(host, container);
    for (const c of openclawChecks) {
      let suggestion: string | null = null;
      if (c.status === 'error' && c.name === 'openclaw_installed') suggestion = 'Instalar via Setup > Preparação do Ambiente';
      if (c.status === 'warning' && c.name === 'gateway_running') suggestion = 'Iniciar gateway via Setup > Configuração do Gateway';
      if (c.status === 'warning' && c.name === 'whatsapp_paired') suggestion = 'Parear via Canais > WhatsApp';
      if (c.status === 'warning' && c.name === 'provider_configured') suggestion = 'Cadastrar provider em Conexões > Provedores de IA';
      checks.push({ name: c.name, status: c.status, message: c.detail, suggestion });
    }

    // Container disk usage
    try {
      const diskResult = await execInContainer(host, container, "df -h / | tail -1 | awk '{print $5, $2, $3, $4}'");
      if (diskResult.exitCode === 0) {
        const parts = diskResult.stdout.trim().split(' ');
        const percent = parseInt(parts[0]);
        checks.push({
          name: 'container_disk',
          status: percent > 90 ? 'error' : percent > 75 ? 'warning' : 'ok',
          message: `Disco: ${parts[0]} usado (${parts[2]} de ${parts[1]})`,
          suggestion: percent > 90 ? 'Limpar arquivos temporários ou logs antigos' : null,
        });
      }
    } catch {}

    // Container memory
    try {
      const memResult = await execInContainer(host, container, "free -m | grep Mem | awk '{printf \"%d %d %d\", $2, $3, $3*100/$2}'");
      if (memResult.exitCode === 0) {
        const parts = memResult.stdout.trim().split(' ');
        const percent = parseInt(parts[2]);
        checks.push({
          name: 'container_memory',
          status: percent > 90 ? 'error' : percent > 75 ? 'warning' : 'ok',
          message: `Memória: ${percent}% (${parts[1]}MB de ${parts[0]}MB)`,
          suggestion: percent > 90 ? 'Reiniciar serviços ou aumentar memória do container' : null,
        });
      }
    } catch {}

    // Recent error logs
    try {
      const logResult = await execInContainer(host, container, "tail -100 /tmp/openclaw-gateway.log 2>/dev/null | grep -i 'error\\|fatal\\|crash' | tail -5");
      if (logResult.stdout.trim()) {
        checks.push({
          name: 'recent_errors',
          status: 'warning',
          message: `Erros recentes: ${logResult.stdout.trim().split('\n').length} encontrados`,
          suggestion: 'Verificar logs do gateway em Tarefas > Logs',
        });
      } else {
        checks.push({ name: 'recent_errors', status: 'ok', message: 'Sem erros recentes nos logs', suggestion: null });
      }
    } catch {}

    const overallStatus = checks.some(c => c.status === 'error') ? 'error' : checks.some(c => c.status === 'warning') ? 'warning' : 'ok';
    res.json({ status: overallStatus, instanceId: instance.id, instanceName: instance.name, checks, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════
// OPENCLAW DOCTOR
// ══════════════════════════════════════

// POST /diagnostics/doctor - Run openclaw doctor
router.post('/doctor', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instId = req.query.instanceId as string | undefined;
    const where = instId ? { id: instId } : { containerHost: { not: null as any }, containerName: { not: null as any } };
    const inst = await prisma.instance.findFirst({ where });
    if (!inst || !inst.containerHost || !inst.containerName) {
      return res.status(400).json({ error: { message: 'Nenhuma instância com container disponível' } });
    }

    const result = await execInContainer(inst.containerHost, inst.containerName, 'openclaw doctor 2>&1');

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'diagnostics.doctor',
        resource: 'instance',
        resourceId: inst.id,
        details: { output: result.stdout.substring(0, 2000) } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: result.exitCode === 0, output: result.stdout, instanceId: inst.id });
  } catch (err) {
    next(err);
  }
});

// POST /diagnostics/doctor-fix - Run openclaw doctor --fix
router.post('/doctor-fix', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instId = req.query.instanceId as string | undefined;
    const where = instId ? { id: instId } : { containerHost: { not: null as any }, containerName: { not: null as any } };
    const inst = await prisma.instance.findFirst({ where });
    if (!inst || !inst.containerHost || !inst.containerName) {
      return res.status(400).json({ error: { message: 'Nenhuma instância com container disponível' } });
    }

    const result = await execInContainer(inst.containerHost, inst.containerName, 'openclaw doctor --fix 2>&1');

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'diagnostics.doctor_fix',
        resource: 'instance',
        resourceId: inst.id,
        details: { output: result.stdout.substring(0, 2000) } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: result.exitCode === 0, output: result.stdout, instanceId: inst.id });
  } catch (err) {
    next(err);
  }
});

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
