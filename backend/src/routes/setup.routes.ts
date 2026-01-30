import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const SETUP_STEPS = [
  { id: 0, name: 'Preparação do Ambiente', key: 'environment' },
  { id: 1, name: 'Configuração do Gateway', key: 'gateway' },
  { id: 2, name: 'Provedores de IA', key: 'providers' },
  { id: 3, name: 'Canal WhatsApp', key: 'whatsapp' },
  { id: 4, name: 'Roteamento e Regras', key: 'routing' },
  { id: 5, name: 'Validação Final', key: 'validation' },
];

const router = Router();

// GET /:instId/setup - Get setup progress
router.get('/:instId/setup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    let progress = await prisma.setupProgress.findUnique({
      where: { instanceId: req.params.instId },
    });

    if (!progress) {
      progress = await prisma.setupProgress.create({
        data: {
          instanceId: req.params.instId,
          steps: SETUP_STEPS.map((s) => ({ ...s, status: 'pending', evidence: null, completedAt: null })),
        },
      });
    }

    res.json({ ...progress, stepDefinitions: SETUP_STEPS });
  } catch (err) {
    next(err);
  }
});

// POST /:instId/setup/step/:stepIndex - Complete a setup step
router.post(
  '/:instId/setup/step/:stepIndex',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stepIndex = parseInt(req.params.stepIndex);
      if (stepIndex < 0 || stepIndex >= SETUP_STEPS.length) {
        return res.status(400).json({ error: { message: 'Invalid step index' } });
      }

      let progress = await prisma.setupProgress.findUnique({
        where: { instanceId: req.params.instId },
      });

      if (!progress) {
        progress = await prisma.setupProgress.create({
          data: {
            instanceId: req.params.instId,
            steps: SETUP_STEPS.map((s) => ({ ...s, status: 'pending', evidence: null, completedAt: null })),
          },
        });
      }

      const steps = progress.steps as any[];
      steps[stepIndex] = {
        ...steps[stepIndex],
        status: 'completed',
        evidence: req.body.evidence || null,
        completedAt: new Date().toISOString(),
        completedBy: req.user!.sub,
      };

      const allCompleted = steps.every((s) => s.status === 'completed');
      const nextStep = steps.findIndex((s) => s.status === 'pending');

      const updated = await prisma.setupProgress.update({
        where: { instanceId: req.params.instId },
        data: {
          steps: steps as any,
          currentStep: nextStep === -1 ? SETUP_STEPS.length : nextStep,
          completed: allCompleted,
          completedAt: allCompleted ? new Date() : null,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: 'setup.step_complete',
          resource: 'setup',
          resourceId: req.params.instId,
          details: { stepIndex, stepName: SETUP_STEPS[stepIndex].name, evidence: req.body.evidence } as any,
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.json({ ...updated, stepDefinitions: SETUP_STEPS });
    } catch (err) {
      next(err);
    }
  },
);

// POST /:instId/setup/reset - Reset setup progress
router.post(
  '/:instId/setup/reset',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.setupProgress.deleteMany({ where: { instanceId: req.params.instId } });

      const progress = await prisma.setupProgress.create({
        data: {
          instanceId: req.params.instId,
          steps: SETUP_STEPS.map((s) => ({ ...s, status: 'pending', evidence: null, completedAt: null })),
        },
      });

      res.json({ ...progress, stepDefinitions: SETUP_STEPS });
    } catch (err) {
      next(err);
    }
  },
);

// POST /:instId/setup/validate - Run validation for current step
router.post(
  '/:instId/setup/validate',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inst = await prisma.instance.findUnique({
        where: { id: req.params.instId },
        include: { providers: true, configs: true },
      });
      if (!inst) return res.status(404).json({ error: { message: 'Instance not found' } });

      const checks = [
        { step: 'environment', ok: !!inst.containerName && !!inst.containerHost, message: inst.containerName ? 'Container mapeado' : 'Container não mapeado' },
        { step: 'gateway', ok: !!inst.gatewayMode && !!inst.gatewayPort && !!inst.gatewayToken, message: inst.gatewayMode ? `Gateway ${inst.gatewayMode}:${inst.gatewayPort}` : 'Gateway não configurado' },
        { step: 'providers', ok: inst.providers.length > 0 && inst.providers.some((p) => p.isDefault), message: inst.providers.length > 0 ? `${inst.providers.length} providers` : 'Nenhum provider' },
        { step: 'whatsapp', ok: inst.configs.some((c) => c.key.startsWith('whatsapp.')), message: inst.configs.some((c) => c.key.startsWith('whatsapp.')) ? 'WhatsApp configurado' : 'WhatsApp não configurado' },
        { step: 'routing', ok: inst.configs.some((c) => c.key.startsWith('routing.')), message: inst.configs.some((c) => c.key.startsWith('routing.')) ? 'Rotas configuradas' : 'Sem regras de roteamento' },
      ];

      const allOk = checks.every((c) => c.ok);
      res.json({ valid: allOk, checks });
    } catch (err) {
      next(err);
    }
  },
);

export { router as setupRoutes };
