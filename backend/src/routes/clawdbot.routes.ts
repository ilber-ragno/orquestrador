import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error-handler.js';
import { prisma } from '../lib/prisma.js';
import * as openclaw from '../services/openclaw.service.js';

const router = Router();

// GET /instances/:id/clawdbot/validate - Validate OpenClaw installation (Etapa 8)
router.get('/:id/clawdbot/validate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const rawChecks = await openclaw.validateInstance(instance.containerHost, instance.containerName);
    const checks = rawChecks.map(c => ({ name: c.name, status: c.status, message: c.detail }));
    const allOk = checks.every(c => c.status === 'ok');
    const hasError = checks.some(c => c.status === 'error');

    res.json({
      instanceId: instance.id,
      instanceName: instance.name,
      overall: allOk ? 'ok' : hasError ? 'error' : 'warning',
      checks,
    });
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/clawdbot/install - Install OpenClaw in container (Etapa 9)
router.post('/:id/clawdbot/install', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const host = instance.containerHost;
    const container = instance.containerName;

    // Create a job to track installation
    const job = await prisma.job.create({
      data: {
        instanceId: instance.id,
        userId: req.user!.sub,
        type: 'clawdbot.install',
        description: `Instalar OpenClaw em ${instance.name}`,
        status: 'RUNNING',
        startedAt: new Date(),
        steps: {
          create: [
            { name: 'Verificar Node.js', sortOrder: 0, status: 'RUNNING', startedAt: new Date() },
            { name: 'Instalar OpenClaw', sortOrder: 1 },
            { name: 'Criar diretórios', sortOrder: 2 },
            { name: 'Gerar config base', sortOrder: 3 },
            { name: 'Validar instalação', sortOrder: 4 },
          ],
        },
      },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });

    // Run installation async
    (async () => {
      const steps = job.steps;
      try {
        // Step 1: Check Node
        const { execInContainer } = await import('../services/lxc.service.js');
        const nodeCheck = await execInContainer(host, container, 'node --version 2>/dev/null');
        await prisma.jobStep.update({
          where: { id: steps[0].id },
          data: { status: nodeCheck.exitCode === 0 ? 'COMPLETED' : 'FAILED', output: nodeCheck.stdout || 'Node.js não encontrado', endedAt: new Date() },
        });
        if (nodeCheck.exitCode !== 0) throw new Error('Node.js não disponível no container');

        // Step 2: Install
        await prisma.jobStep.update({ where: { id: steps[1].id }, data: { status: 'RUNNING', startedAt: new Date() } });
        const installResult = await openclaw.installOpenClaw(host, container);
        await prisma.jobStep.update({
          where: { id: steps[1].id },
          data: { status: installResult.success ? 'COMPLETED' : 'FAILED', output: installResult.output.slice(0, 2000), endedAt: new Date() },
        });
        if (!installResult.success) throw new Error('Falha na instalação');

        // Step 3: Create dirs
        await prisma.jobStep.update({ where: { id: steps[2].id }, data: { status: 'RUNNING', startedAt: new Date() } });
        const mkdirResult = await execInContainer(host, container, 'mkdir -p /root/.openclaw/{agents/main/agent,credentials/whatsapp/default,devices,cron,workspace,memory}');
        await prisma.jobStep.update({
          where: { id: steps[2].id },
          data: { status: mkdirResult.exitCode === 0 ? 'COMPLETED' : 'FAILED', output: mkdirResult.stdout || mkdirResult.stderr, endedAt: new Date() },
        });

        // Step 4: Generate base config
        await prisma.jobStep.update({ where: { id: steps[3].id }, data: { status: 'RUNNING', startedAt: new Date() } });
        const existing = await openclaw.readConfig(host, container);
        if (!existing) {
          const baseConfig = {
            agents: { defaults: { model: { primary: 'anthropic:claude-sonnet-4-20250514' } } },
            gateway: { port: 18789, mode: 'local', bind: '0.0.0.0', token: generateToken() },
            auth: { enabled: true },
            plugins: { whatsapp: { enabled: false } },
            channels: { whatsapp: { default: { enabled: false } } },
          };
          await openclaw.writeConfig(host, container, baseConfig);
        }
        await prisma.jobStep.update({
          where: { id: steps[3].id },
          data: { status: 'COMPLETED', output: existing ? 'Config já existente, mantido' : 'Config base criado', endedAt: new Date() },
        });

        // Step 5: Validate
        await prisma.jobStep.update({ where: { id: steps[4].id }, data: { status: 'RUNNING', startedAt: new Date() } });
        const checks = await openclaw.validateInstance(host, container);
        const summary = checks.map(c => `${c.status === 'ok' ? '✓' : c.status === 'warning' ? '!' : '✗'} ${c.name}: ${c.detail}`).join('\n');
        await prisma.jobStep.update({
          where: { id: steps[4].id },
          data: { status: 'COMPLETED', output: summary, endedAt: new Date() },
        });

        await prisma.job.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      } catch (err: any) {
        await prisma.job.update({ where: { id: job.id }, data: { status: 'FAILED', error: err.message, completedAt: new Date() } });
      }
    })();

    res.json({ jobId: job.id, message: 'Instalação iniciada' });
  } catch (err) {
    next(err);
  }
});

// POST /instances/:id/validate-all - Full validation + seal (Etapa 32)
router.post('/:id/validate-all', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await prisma.instance.findUnique({ where: { id: req.params.id as string } });
    if (!instance) return next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada'));
    if (!instance.containerHost || !instance.containerName) {
      return next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado'));
    }

    const rawChecks = await openclaw.validateInstance(instance.containerHost, instance.containerName);
    const checks: { name: string; status: string; message: string }[] = rawChecks.map(c => ({ name: c.name, status: c.status, message: c.detail }));
    const allOk = checks.every(c => c.status === 'ok');

    // Check DB-level items too
    const [providerCount, channelCount, agentCount] = await Promise.all([
      prisma.provider.count({ where: { instanceId: instance.id, isActive: true } }),
      prisma.channel.count({ where: { instanceId: instance.id, isActive: true } }),
      prisma.agent.count({ where: { instanceId: instance.id, isActive: true } }),
    ]);

    checks.push({
      name: 'db_providers',
      status: providerCount > 0 ? 'ok' : 'warning',
      message: `${providerCount} provider(s) no banco`,
    });
    checks.push({
      name: 'db_channels',
      status: channelCount > 0 ? 'ok' : 'warning',
      message: `${channelCount} canal(is) no banco`,
    });
    checks.push({
      name: 'db_agents',
      status: agentCount > 0 ? 'ok' : 'warning',
      message: `${agentCount} agent(s) no banco`,
    });

    const ready = allOk && providerCount > 0;

    if (ready !== instance.readyForProduction) {
      await prisma.instance.update({ where: { id: instance.id }, data: { readyForProduction: ready } });
    }

    res.json({
      instanceId: instance.id,
      readyForProduction: ready,
      overall: ready ? 'ok' : checks.some(c => c.status === 'error') ? 'error' : 'warning',
      checks,
    });
  } catch (err) {
    next(err);
  }
});

function generateToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export { router as clawdbotRoutes };
