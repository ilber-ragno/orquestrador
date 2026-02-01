import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import * as openclaw from '../services/openclaw.service.js';
import { execInContainer } from '../services/lxc.service.js';

const SETUP_STEPS = [
  { id: 0, name: 'Preparação do Ambiente', key: 'environment', description: 'Verifica container e instala OpenClaw' },
  { id: 1, name: 'Configuração do Gateway', key: 'gateway', description: 'Configura porta, modo e token no openclaw.json' },
  { id: 2, name: 'Provedores de IA', key: 'providers', description: 'Cadastra provider e grava em auth-profiles.json' },
  { id: 3, name: 'Canais de Comunicação', key: 'channels', description: 'Verifica se há pelo menos um canal conectado' },
  { id: 4, name: 'Agente Padrão', key: 'agent', description: 'Escolhe modelo de IA e cria agent padrão' },
  { id: 5, name: 'Validação Final', key: 'validation', description: 'Roda checklist completo do OpenClaw' },
];

const router = Router();

// GET /:instId/setup - Get setup progress
router.get('/:instId/setup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    let progress = await prisma.setupProgress.findUnique({ where: { instanceId: req.params.instId as string } });

    if (!progress) {
      progress = await prisma.setupProgress.create({
        data: {
          instanceId: req.params.instId as string,
          steps: SETUP_STEPS.map((s) => ({ ...s, status: 'pending', evidence: null, completedAt: null })),
        },
      });
    }

    res.json({ ...progress, stepDefinitions: SETUP_STEPS });
  } catch (err) {
    next(err);
  }
});

// POST /:instId/setup/step/:stepIndex - Execute a setup step (real action)
router.post(
  '/:instId/setup/step/:stepIndex',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stepIndex = parseInt(req.params.stepIndex as string);
      if (stepIndex < 0 || stepIndex >= SETUP_STEPS.length) {
        return res.status(400).json({ error: { message: 'Índice de etapa inválido' } });
      }

      const inst = await prisma.instance.findUnique({
        where: { id: req.params.instId as string },
        include: { providers: true, configs: true, agents: true, channels: true },
      });
      if (!inst) return res.status(404).json({ error: { message: 'Instância não encontrada' } });

      let progress = await prisma.setupProgress.findUnique({ where: { instanceId: req.params.instId as string } });
      if (!progress) {
        progress = await prisma.setupProgress.create({
          data: {
            instanceId: req.params.instId as string,
            steps: SETUP_STEPS.map((s) => ({ ...s, status: 'pending', evidence: null, completedAt: null })),
          },
        });
      }

      const steps = progress.steps as any[];
      const stepKey = SETUP_STEPS[stepIndex].key;
      let evidence = '';
      let success = false;

      const host = inst.containerHost;
      const container = inst.containerName;

      switch (stepKey) {
        case 'environment': {
          if (!host || !container) {
            evidence = 'Container não mapeado na instância';
            break;
          }
          // Check/install OpenClaw
          const installed = await openclaw.checkInstalled(host, container);
          if (!installed) {
            const result = await openclaw.installOpenClaw(host, container);
            evidence = result.success ? 'OpenClaw instalado com sucesso' : `Falha: ${result.output.slice(0, 200)}`;
            success = result.success;
          } else {
            const version = await openclaw.getVersion(host, container);
            evidence = `OpenClaw já instalado (v${version})`;
            success = true;
          }
          // Verify directories
          if (success) {
            const dirs = await openclaw.checkDirectories(host, container);
            const missing = Object.entries(dirs).filter(([, v]) => !v).map(([k]) => k);
            if (missing.length > 0) {
              const { execInContainer } = await import('../services/lxc.service.js');
              await execInContainer(host, container, `mkdir -p /root/.openclaw/{${missing.join(',')}}`);
              evidence += ` | Diretórios criados: ${missing.join(', ')}`;
            }
          }
          break;
        }

        case 'gateway': {
          if (!host || !container) { evidence = 'Container não mapeado'; break; }
          const config = await openclaw.readConfig(host, container) || {};
          if (!config.gateway) config.gateway = {};
          config.gateway.port = req.body.port || config.gateway.port || 18789;
          config.gateway.mode = req.body.mode || config.gateway.mode || 'local';
          config.gateway.bind = 'loopback';
          // Use gateway.auth.token (gateway.token is deprecated)
          if (!config.gateway.auth) config.gateway.auth = {};
          if (!config.gateway.auth.token) {
            config.gateway.auth.token = crypto.randomBytes(24).toString('hex');
          }
          // Remove deprecated gateway.token if present
          delete config.gateway.token;
          await openclaw.writeConfig(host, container, config);

          // Update DB
          await prisma.instance.update({
            where: { id: inst.id },
            data: { gatewayMode: config.gateway.mode, gatewayPort: config.gateway.port, gatewayBind: config.gateway.bind, gatewayToken: config.gateway.auth?.token || null },
          });

          // Start gateway
          const gwResult = await openclaw.startGateway(host, container);
          if (gwResult.success) {
            await prisma.instance.update({ where: { id: inst.id }, data: { gatewayStatus: 'running' } });
          }
          evidence = gwResult.success ? `Gateway iniciado (porta ${config.gateway.port})` : `Gateway configurado mas falha ao iniciar: ${gwResult.output}`;
          success = true; // Config saved regardless
          break;
        }

        case 'providers': {
          // Check if at least one provider exists
          if (inst.providers.length === 0) {
            evidence = 'Nenhum provider cadastrado. Cadastre ao menos um em Conexões > Provedores de IA.';
            break;
          }
          // Sync to container
          if (host && container) {
            const profiles: Record<string, any> = {};
            for (const p of inst.providers.filter(p => p.isActive)) {
              profiles[p.type.toLowerCase()] = {
                name: p.name, type: p.type, apiKey: p.apiKey,
                ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
                ...(p.model ? { model: p.model } : {}),
              };
            }
            await openclaw.writeAuthProfiles(host, container, profiles);
            evidence = `${Object.keys(profiles).length} provider(s) sincronizado(s) com auth-profiles.json`;
          } else {
            evidence = `${inst.providers.length} provider(s) cadastrado(s) no banco`;
          }
          success = true;
          break;
        }

        case 'channels': {
          if (!host || !container) { evidence = 'Container não mapeado'; break; }

          // Ler config do container para verificar canais habilitados
          const chConfig = await openclaw.readConfig(host, container);
          const connectedChannels: string[] = [];

          // Checar WhatsApp via status real
          const waStatus = await openclaw.getWhatsAppStatus(host, container);
          if (waStatus.connected) connectedChannels.push(`WhatsApp (${waStatus.phone})`);
          else if (waStatus.paired) connectedChannels.push(`WhatsApp (${waStatus.phone} - pareado)`);

          // Checar outros canais habilitados via plugins.entries
          const pluginEntries = chConfig?.plugins?.entries || {};
          for (const [name, val] of Object.entries(pluginEntries)) {
            if (name === 'whatsapp') continue; // já checado acima
            if ((val as any)?.enabled) {
              connectedChannels.push(name.charAt(0).toUpperCase() + name.slice(1));
            }
          }

          // Também verificar canais do DB com status connected/paired
          for (const ch of inst.channels) {
            if (ch.status === 'connected' || ch.status === 'paired') {
              const label = ch.name || ch.type;
              if (!connectedChannels.some(c => c.toLowerCase().includes(ch.type.toLowerCase()))) {
                connectedChannels.push(label);
              }
            }
          }

          if (connectedChannels.length > 0) {
            evidence = `${connectedChannels.length} canal(is) conectado(s): ${connectedChannels.join(', ')}`;
            success = true;
          } else {
            evidence = 'Nenhum canal conectado. Configure pelo menos um canal em Canais.';
          }
          break;
        }

        case 'agent': {
          const selectedModel = req.body.model as string | undefined;
          const selectedFallback = req.body.fallbackModel as string | undefined;

          // Criar ou atualizar agent padrão
          let defaultAgent = inst.agents.find(a => a.isDefault);
          if (!defaultAgent) {
            defaultAgent = await prisma.agent.create({
              data: {
                instanceId: inst.id,
                name: 'Principal',
                description: 'Agent padrão do Clawdbot',
                systemPrompt: 'Você é um assistente prestativo e amigável.',
                model: selectedModel || null,
                fallbackModel: selectedFallback || null,
                isDefault: true,
              },
            });
          } else {
            const updateData: Record<string, any> = {};
            if (selectedModel) updateData.model = selectedModel;
            if (selectedFallback !== undefined) updateData.fallbackModel = selectedFallback || null;
            if (Object.keys(updateData).length > 0) {
              defaultAgent = await prisma.agent.update({
                where: { id: defaultAgent.id },
                data: updateData,
              });
            }
          }

          // Sync com container
          if (host && container) {
            if (defaultAgent.systemPrompt) {
              await openclaw.writeWorkspaceFile(host, container, 'SOUL.md', defaultAgent.systemPrompt);
            }

            // Atualizar agents.defaults.model no openclaw.json
            if (selectedModel || selectedFallback !== undefined) {
              const agentConfig = await openclaw.readConfig(host, container) || {};
              if (!agentConfig.agents) agentConfig.agents = {};
              if (!agentConfig.agents.defaults) agentConfig.agents.defaults = {};
              if (!agentConfig.agents.defaults.model) agentConfig.agents.defaults.model = {};
              if (selectedModel) agentConfig.agents.defaults.model.primary = selectedModel;
              if (selectedFallback) {
                agentConfig.agents.defaults.model.fallbacks = [selectedFallback];
              } else if (selectedFallback === '') {
                delete agentConfig.agents.defaults.model.fallbacks;
              }
              await openclaw.writeConfig(host, container, agentConfig);
            }

            // Apply via CLI for immediate effect
            if (selectedModel && host && container) {
              await execInContainer(host, container,
                `cd /root/.openclaw && [ -f .env ] && set -a && . .env && set +a; openclaw models set "${selectedModel}" 2>/dev/null`,
                10000
              );
            }
            if (selectedFallback && host && container) {
              await execInContainer(host, container,
                `cd /root/.openclaw && [ -f .env ] && set -a && . .env && set +a; openclaw models fallbacks clear 2>/dev/null; openclaw models fallbacks add "${selectedFallback}" 2>/dev/null`,
                10000
              );
            }

            const parts = [];
            if (selectedModel) parts.push(`primário: ${selectedModel}`);
            if (selectedFallback) parts.push(`fallback: ${selectedFallback}`);
            evidence = `Agent "${defaultAgent.name}" configurado${parts.length ? ` (${parts.join(', ')})` : ''}`;
          } else {
            evidence = `Agent "${defaultAgent.name}" criado no banco`;
          }
          success = true;
          break;
        }

        case 'validation': {
          if (!host || !container) { evidence = 'Container não mapeado'; break; }
          const checks = await openclaw.validateInstance(host, container);
          const allOk = checks.every(c => c.status === 'ok');
          evidence = checks.map(c => `${c.status === 'ok' ? '✓' : c.status === 'warning' ? '!' : '✗'} ${c.detail}`).join(' | ');
          success = allOk;

          if (allOk) {
            await prisma.instance.update({ where: { id: inst.id }, data: { readyForProduction: true } });
          }
          break;
        }
      }

      // Update step status
      steps[stepIndex] = {
        ...steps[stepIndex],
        status: success ? 'completed' : 'failed',
        evidence,
        completedAt: success ? new Date().toISOString() : null,
        completedBy: req.user!.sub,
      };

      const allCompleted = steps.every((s) => s.status === 'completed');
      const nextStep = steps.findIndex((s) => s.status === 'pending');

      const updated = await prisma.setupProgress.update({
        where: { instanceId: req.params.instId as string },
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
          action: 'setup.step_execute',
          resource: 'setup',
          resourceId: req.params.instId as string,
          details: { stepIndex, stepName: SETUP_STEPS[stepIndex].name, success, evidence } as any,
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.json({ ...updated, stepDefinitions: SETUP_STEPS, lastStepResult: { success, evidence } });
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
      await prisma.setupProgress.deleteMany({ where: { instanceId: req.params.instId as string } });

      const progress = await prisma.setupProgress.create({
        data: {
          instanceId: req.params.instId as string,
          steps: SETUP_STEPS.map((s) => ({ ...s, status: 'pending', evidence: null, completedAt: null })),
        },
      });

      res.json({ ...progress, stepDefinitions: SETUP_STEPS });
    } catch (err) {
      next(err);
    }
  },
);

// POST /:instId/setup/validate - Run full validation
router.post(
  '/:instId/setup/validate',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const inst = await prisma.instance.findUnique({
        where: { id: req.params.instId as string },
        include: { providers: true, configs: true, agents: true, channels: true },
      });
      if (!inst) return res.status(404).json({ error: { message: 'Instância não encontrada' } });

      const checks = [];

      // DB-level checks
      checks.push({ step: 'environment', ok: !!inst.containerName && !!inst.containerHost, message: inst.containerName ? 'Container mapeado' : 'Container não mapeado' });
      checks.push({ step: 'gateway', ok: !!inst.gatewayMode && !!inst.gatewayPort, message: inst.gatewayMode ? `Gateway ${inst.gatewayMode}:${inst.gatewayPort}` : 'Gateway não configurado' });
      checks.push({ step: 'providers', ok: inst.providers.length > 0, message: inst.providers.length > 0 ? `${inst.providers.length} provider(s)` : 'Nenhum provider' });
      // Check channels - validate any connected channel
      const connectedDbChannels = inst.channels.filter(c => c.status === 'connected' || c.status === 'paired');
      let channelOk = connectedDbChannels.length > 0;
      let channelMessage = channelOk
        ? `${connectedDbChannels.length} canal(is) conectado(s)`
        : 'Nenhum canal conectado';
      // Verify in container too
      if (!channelOk && inst.containerHost && inst.containerName) {
        const waStatus = await openclaw.getWhatsAppStatus(inst.containerHost, inst.containerName);
        if (waStatus.connected || waStatus.paired) {
          channelOk = true;
          channelMessage = `WhatsApp conectado: ${waStatus.phone}`;
        }
      }
      checks.push({ step: 'channels', ok: channelOk, message: channelMessage });
      checks.push({ step: 'agent', ok: inst.agents.length > 0, message: inst.agents.length > 0 ? `${inst.agents.length} agent(s)` : 'Nenhum agent' });

      // Container-level checks
      if (inst.containerHost && inst.containerName) {
        const containerChecks = await openclaw.validateInstance(inst.containerHost, inst.containerName);
        for (const c of containerChecks) {
          checks.push({ step: c.name, ok: c.status === 'ok', message: c.detail });
        }
      }

      const allOk = checks.every((c) => c.ok);
      res.json({ valid: allOk, checks });
    } catch (err) {
      next(err);
    }
  },
);

// GET /:instId/setup/providers-models - List available AI models from OpenClaw
router.get('/:instId/setup/providers-models', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({
      where: { id: req.params.instId as string },
    });
    if (!inst) return res.status(404).json({ error: { message: 'Instância não encontrada' } });

    const host = inst.containerHost;
    const container = inst.containerName;

    if (!host || !container) {
      return res.json({ models: [], currentModel: null, currentFallbacks: [] });
    }

    let { models, currentPrimary, currentFallbacks } = await openclaw.listAvailableModels(host, container);

    // Fallback: if OpenClaw CLI returns no models, build list from DB providers
    let synced = true;
    if (models.length === 0) {
      synced = false;
      const dbProviders = await prisma.provider.findMany({
        where: { instanceId: inst.id, isActive: true },
        orderBy: { priority: 'asc' },
      });

      const KNOWN_MODELS: Record<string, { id: string; name: string; context: string }[]> = {
        openai: [
          { id: 'openai/gpt-4o', name: 'GPT-4o', context: '128k' },
          { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', context: '128k' },
          { id: 'openai/gpt-4.1', name: 'GPT-4.1', context: '1M' },
          { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', context: '1M' },
          { id: 'openai/o3-mini', name: 'o3 Mini', context: '200k' },
        ],
        anthropic: [
          { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', context: '200k' },
          { id: 'anthropic/claude-opus-4-20250514', name: 'Claude Opus 4', context: '200k' },
          { id: 'anthropic/claude-haiku-3.5', name: 'Claude Haiku 3.5', context: '200k' },
        ],
        openrouter: [
          { id: 'openrouter/auto', name: 'Auto (melhor custo-benefício)', context: 'variável' },
          { id: 'openrouter/anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (via OpenRouter)', context: '200k' },
          { id: 'openrouter/openai/gpt-4o', name: 'GPT-4o (via OpenRouter)', context: '128k' },
          { id: 'openrouter/google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (via OpenRouter)', context: '1M' },
        ],
        google: [
          { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: '1M' },
          { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: '1M' },
        ],
      };

      for (const prov of dbProviders) {
        const provType = prov.type.toLowerCase();
        const knownModels = KNOWN_MODELS[provType] || [];
        for (const km of knownModels) {
          models.push({
            id: km.id,
            name: km.name,
            provider: provType,
            input: '',
            context: km.context,
            auth: true,
          });
        }
      }
    }

    // Group models by provider
    const grouped: Record<string, { id: string; name: string; provider: string; input: string; context: string }[]> = {};
    for (const m of models) {
      if (!grouped[m.provider]) grouped[m.provider] = [];
      grouped[m.provider].push(m);
    }

    res.json({ models, grouped, currentModel: currentPrimary, currentFallbacks, synced });
  } catch (err) {
    next(err);
  }
});

export { router as setupRoutes };
