import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import * as openclaw from '../services/openclaw.service.js';
import { execInContainer } from '../services/lxc.service.js';

const router = Router();

// ═══════════════════════════════════════
// GET /:instId/openclaw-config - Read full config organized by sections
// ═══════════════════════════════════════
router.get('/:instId/openclaw-config', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({ where: { id: req.params.instId as string } });
    if (!inst?.containerHost || !inst?.containerName) {
      return res.status(404).json({ error: { message: 'Instância sem container mapeado' } });
    }

    const config = await openclaw.readConfig(inst.containerHost, inst.containerName);
    if (!config) return res.json({ sections: {} });

    // Organize into sections for the frontend
    const sections = {
      messages: {
        ackReaction: config.messages?.ackReaction ?? '',
        ackReactionScope: config.messages?.ackReactionScope ?? 'group-mentions',
        removeAckAfterReply: config.messages?.removeAckAfterReply ?? false,
        responsePrefix: config.messages?.responsePrefix ?? '',
        queue: {
          mode: config.messages?.queue?.mode ?? 'collect',
          debounceMs: config.messages?.queue?.debounceMs ?? 2000,
          cap: config.messages?.queue?.cap ?? 0,
          drop: config.messages?.queue?.drop ?? 'old',
        },
        inbound: {
          debounceMs: config.messages?.inbound?.debounceMs ?? 0,
        },
        tts: {
          auto: config.messages?.tts?.auto ?? 'off',
          mode: config.messages?.tts?.mode ?? 'final',
          provider: config.messages?.tts?.provider ?? 'elevenlabs',
          maxTextLength: config.messages?.tts?.maxTextLength ?? 5000,
          voice: config.messages?.tts?.voice ?? '',
          summaryModel: config.messages?.tts?.summaryModel ?? '',
        },
        groupChat: {
          historyLimit: config.messages?.groupChat?.historyLimit ?? 50,
        },
      },
      session: {
        scope: config.session?.scope ?? 'main',
        dmScope: config.session?.dmScope ?? null,
        mainKey: config.session?.mainKey ?? 'main',
        reset: {
          mode: config.session?.reset?.mode ?? 'idle',
          atHour: config.session?.reset?.atHour ?? 4,
          idleMinutes: config.session?.reset?.idleMinutes ?? 60,
          resetTriggers: config.session?.reset?.resetTriggers ?? ['/new', '/reset'],
        },
        resetByType: {
          dm: { idleMinutes: config.session?.resetByType?.dm?.idleMinutes ?? null },
          group: { idleMinutes: config.session?.resetByType?.group?.idleMinutes ?? null },
          thread: { idleMinutes: config.session?.resetByType?.thread?.idleMinutes ?? null },
        },
        identityLinks: config.session?.identityLinks ?? {},
        agentToAgent: {
          maxPingPongTurns: config.session?.agentToAgent?.maxPingPongTurns ?? 5,
        },
        sendPolicy: {
          default_: config.session?.sendPolicy?.default ?? 'allow',
          rules: config.session?.sendPolicy?.rules ? JSON.stringify(config.session.sendPolicy.rules) : '',
        },
        store: config.session?.store ?? '',
      },
      agentsDefaults: {
        thinkingDefault: config.agents?.defaults?.thinkingDefault ?? 'off',
        contextTokens: config.agents?.defaults?.contextTokens ?? null,
        maxConcurrent: config.agents?.defaults?.maxConcurrent ?? 4,
        timeoutSeconds: config.agents?.defaults?.timeoutSeconds ?? 120,
        blockStreamingDefault: config.agents?.defaults?.blockStreamingDefault ?? false,
        blockStreamingChunk: config.agents?.defaults?.blockStreamingChunk ?? 500,
        verboseDefault: config.agents?.defaults?.verboseDefault ?? false,
        imageModel: config.agents?.defaults?.imageModel ?? '',
        fallbackChain: config.agents?.defaults?.fallbackChain ?? [],
        heartbeat: {
          every: config.agents?.defaults?.heartbeat?.every ?? null,
          model: config.agents?.defaults?.heartbeat?.model ?? null,
          target: config.agents?.defaults?.heartbeat?.target ?? null,
        },
        workspace: config.agents?.defaults?.workspace ?? '',
        repoRoot: config.agents?.defaults?.repoRoot ?? '',
        skipBootstrap: config.agents?.defaults?.skipBootstrap ?? false,
        bootstrapMaxChars: config.agents?.defaults?.bootstrapMaxChars ?? 20000,
        userTimezone: config.agents?.defaults?.userTimezone ?? '',
        timeFormat: config.agents?.defaults?.timeFormat ?? 'auto',
        elevatedDefault: config.agents?.defaults?.elevatedDefault ?? 'off',
        mediaMaxMb: config.agents?.defaults?.mediaMaxMb ?? 5,
        contextPruning: {
          mode: config.agents?.defaults?.contextPruning?.mode ?? 'off',
        },
        compaction: {
          mode: config.agents?.defaults?.compaction?.mode ?? 'default',
          memoryFlushEnabled: config.agents?.defaults?.compaction?.memoryFlush?.enabled ?? true,
        },
        typingMode: config.agents?.defaults?.typingMode ?? 'never',
        typingIntervalSeconds: config.agents?.defaults?.typingIntervalSeconds ?? 6,
        humanDelay: {
          mode: config.agents?.defaults?.humanDelay?.mode ?? 'off',
        },
        subagents: {
          model: config.agents?.defaults?.subagents?.model ?? '',
          maxConcurrent: config.agents?.defaults?.subagents?.maxConcurrent ?? 1,
          archiveAfterMinutes: config.agents?.defaults?.subagents?.archiveAfterMinutes ?? 60,
        },
      },
      tools: {
        profile: config.tools?.profile ?? 'full',
        allow: config.tools?.allow ?? [],
        deny: config.tools?.deny ?? [],
        elevated: {
          enabled: config.tools?.elevated?.enabled ?? false,
          allowFrom: config.tools?.elevated?.allowFrom ?? [],
        },
        web: {
          searchEnabled: config.tools?.web?.search?.enabled ?? true,
          fetchEnabled: config.tools?.web?.fetch?.enabled ?? true,
          searchApiKey: config.tools?.web?.search?.apiKey ? '••••••••' : '',
          searchMaxResults: config.tools?.web?.search?.maxResults ?? 5,
          fetchMaxChars: config.tools?.web?.fetch?.maxChars ?? 50000,
          fetchReadability: config.tools?.web?.fetch?.readability ?? true,
        },
        exec: {
          backgroundMs: config.tools?.exec?.backgroundMs ?? 10000,
          timeoutSec: config.tools?.exec?.timeoutSec ?? 1800,
          cleanupMs: config.tools?.exec?.cleanupMs ?? 1800000,
          applyPatchEnabled: config.tools?.exec?.applyPatch?.enabled ?? false,
          security: config.tools?.exec?.security ?? 'allowlist',
          safeBins: config.tools?.exec?.safeBins ?? [],
          ask: config.tools?.exec?.ask ?? 'on-miss',
        },
        media: {
          concurrency: config.tools?.media?.concurrency ?? 2,
          imageEnabled: config.tools?.media?.image?.enabled ?? true,
          audioEnabled: config.tools?.media?.audio?.enabled ?? true,
          videoEnabled: config.tools?.media?.video?.enabled ?? true,
        },
        agentToAgent: {
          enabled: config.tools?.agentToAgent?.enabled ?? false,
          allow: config.tools?.agentToAgent?.allow ?? [],
        },
        byProvider: config.tools?.byProvider ? JSON.stringify(config.tools.byProvider) : '',
        sandboxTools: config.tools?.sandbox?.tools ? JSON.stringify(config.tools.sandbox.tools) : '',
        subagentsTools: config.tools?.subagents?.tools ? JSON.stringify(config.tools.subagents.tools) : '',
      },
      logging: {
        level: config.logging?.level ?? 'info',
        consoleLevel: config.logging?.consoleLevel ?? null,
        consoleStyle: config.logging?.consoleStyle ?? 'pretty',
        file: config.logging?.file ?? '',
        redactSensitive: config.logging?.redactSensitive ?? 'tools',
        redactPatterns: config.logging?.redactPatterns ?? [],
      },
      gateway: {
        mode: config.gateway?.mode ?? 'local',
        port: config.gateway?.port ?? 18789,
        bind: config.gateway?.bind ?? 'loopback',
        auth: {
          mode: config.gateway?.auth?.mode ?? 'token',
          token: config.gateway?.auth?.token ? '••••••••' : '',
          password: config.gateway?.auth?.password ? '••••••••' : '',
          allowTailscale: config.gateway?.auth?.allowTailscale ?? false,
        },
        remote: {
          url: config.gateway?.remote?.url ?? '',
          token: config.gateway?.remote?.token ? '••••••••' : '',
          tlsFingerprint: config.gateway?.remote?.tlsFingerprint ?? '',
        },
        trustedProxies: config.gateway?.trustedProxies ?? [],
        discovery: config.gateway?.discovery ?? 'minimal',
        controlUi: {
          allowInsecureAuth: config.gateway?.controlUi?.allowInsecureAuth ?? false,
          dangerouslyDisableDeviceAuth: config.gateway?.controlUi?.dangerouslyDisableDeviceAuth ?? false,
        },
        nodes: {
          browserMode: config.gateway?.nodes?.browser?.mode ?? 'off',
        },
      },
      commands: {
        native: config.commands?.native ?? 'auto',
        text: config.commands?.text ?? true,
        bash: config.commands?.bash ?? false,
        config: config.commands?.config ?? false,
        debug: config.commands?.debug ?? false,
        restart: config.commands?.restart ?? false,
        useAccessGroups: config.commands?.useAccessGroups ?? true,
      },
      plugins: {
        enabled: config.plugins?.enabled ?? true,
        allow: config.plugins?.allow ?? [],
        deny: config.plugins?.deny ?? [],
        loadPaths: config.plugins?.load?.paths ?? [],
      },
      environment: {
        env: config.env ? (typeof config.env === 'object' ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`).join('\n') : '') : '',
        shellEnvEnabled: config.env?.shellEnv?.enabled ?? false,
        shellEnvTimeoutMs: config.env?.shellEnv?.timeoutMs ?? 15000,
      },
    };

    res.json({ sections });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════
// PUT /:instId/openclaw-config/:section - Update a specific section
// ═══════════════════════════════════════

const messagesSchema = z.object({
  ackReaction: z.string().max(10).optional(),
  ackReactionScope: z.enum(['all', 'group-mentions', 'groups', 'none']).optional(),
  removeAckAfterReply: z.boolean().optional(),
  responsePrefix: z.string().max(500).optional(),
  queue: z.object({
    mode: z.enum(['collect', 'steer', 'followup', 'interrupt']).optional(),
    debounceMs: z.number().int().min(0).max(60000).optional(),
    cap: z.number().int().min(0).max(1000).optional(),
    drop: z.enum(['old', 'new', 'summarize']).optional(),
  }).optional(),
  inbound: z.object({
    debounceMs: z.number().int().min(0).max(60000).optional(),
  }).optional(),
  tts: z.object({
    auto: z.enum(['off', 'always', 'inbound', 'tagged']).optional(),
    mode: z.enum(['final', 'all']).optional(),
    provider: z.enum(['elevenlabs', 'openai']).optional(),
    maxTextLength: z.number().int().min(100).max(50000).optional(),
    voice: z.string().max(100).optional(),
    summaryModel: z.string().max(100).optional(),
  }).optional(),
  groupChat: z.object({
    historyLimit: z.number().int().min(1).max(500).optional(),
  }).optional(),
}).strict();

const sessionSchema = z.object({
  scope: z.enum(['main', 'per-peer', 'per-channel-peer', 'per-account-channel-peer']).optional(),
  dmScope: z.enum(['main', 'per-peer', 'per-channel-peer', 'per-account-channel-peer']).nullable().optional(),
  mainKey: z.string().max(100).optional(),
  reset: z.object({
    mode: z.enum(['daily', 'idle']).optional(),
    atHour: z.number().int().min(0).max(23).optional(),
    idleMinutes: z.number().int().min(1).max(10080).optional(),
    resetTriggers: z.array(z.string().max(50)).max(20).optional(),
  }).optional(),
  resetByType: z.object({
    dm: z.object({ idleMinutes: z.number().int().min(1).max(10080).nullable().optional() }).optional(),
    group: z.object({ idleMinutes: z.number().int().min(1).max(10080).nullable().optional() }).optional(),
    thread: z.object({ idleMinutes: z.number().int().min(1).max(10080).nullable().optional() }).optional(),
  }).optional(),
  identityLinks: z.record(z.string(), z.array(z.string())).optional(),
  agentToAgent: z.object({
    maxPingPongTurns: z.number().int().min(0).max(5).optional(),
  }).optional(),
  sendPolicy: z.object({
    default_: z.enum(['allow', 'deny']).optional(),
    rules: z.string().max(5000).optional(),
  }).optional(),
  store: z.string().max(500).optional(),
}).strict();

const agentsDefaultsSchema = z.object({
  thinkingDefault: z.enum(['xhigh', 'high', 'medium', 'low', 'minimal', 'off']).optional(),
  contextTokens: z.number().int().min(1000).max(1000000).nullable().optional(),
  maxConcurrent: z.number().int().min(1).max(50).optional(),
  timeoutSeconds: z.number().int().min(10).max(600).optional(),
  blockStreamingDefault: z.boolean().optional(),
  blockStreamingChunk: z.number().int().min(100).max(5000).optional(),
  verboseDefault: z.boolean().optional(),
  imageModel: z.string().max(100).optional(),
  fallbackChain: z.array(z.string().max(100)).max(10).optional(),
  heartbeat: z.object({
    every: z.string().max(20).nullable().optional(),
    model: z.string().max(100).nullable().optional(),
    target: z.string().max(200).nullable().optional(),
  }).optional(),
  workspace: z.string().max(500).optional(),
  repoRoot: z.string().max(500).optional(),
  skipBootstrap: z.boolean().optional(),
  bootstrapMaxChars: z.number().int().min(1000).max(100000).optional(),
  userTimezone: z.string().max(100).optional(),
  timeFormat: z.enum(['auto', '12', '24']).optional(),
  elevatedDefault: z.enum(['on', 'off']).optional(),
  mediaMaxMb: z.number().int().min(1).max(100).optional(),
  contextPruning: z.object({
    mode: z.enum(['off', 'adaptive', 'aggressive']).optional(),
  }).optional(),
  compaction: z.object({
    mode: z.enum(['default', 'safeguard']).optional(),
    memoryFlushEnabled: z.boolean().optional(),
  }).optional(),
  typingMode: z.enum(['never', 'instant', 'thinking', 'message']).optional(),
  typingIntervalSeconds: z.number().int().min(1).max(60).optional(),
  humanDelay: z.object({
    mode: z.enum(['off', 'natural', 'custom']).optional(),
  }).optional(),
  subagents: z.object({
    model: z.string().max(100).optional(),
    maxConcurrent: z.number().int().min(1).max(10).optional(),
    archiveAfterMinutes: z.number().int().min(1).max(1440).optional(),
  }).optional(),
}).strict();

const toolsSchema = z.object({
  profile: z.enum(['minimal', 'coding', 'messaging', 'full']).optional(),
  allow: z.array(z.string().max(100)).max(100).optional(),
  deny: z.array(z.string().max(100)).max(100).optional(),
  elevated: z.object({
    enabled: z.boolean().optional(),
    allowFrom: z.array(z.string().max(200)).max(50).optional(),
  }).optional(),
  web: z.object({
    searchEnabled: z.boolean().optional(),
    fetchEnabled: z.boolean().optional(),
    searchApiKey: z.string().max(500).optional(),
    searchMaxResults: z.number().int().min(1).max(10).optional(),
    fetchMaxChars: z.number().int().min(1000).max(500000).optional(),
    fetchReadability: z.boolean().optional(),
  }).optional(),
  exec: z.object({
    backgroundMs: z.number().int().min(1000).max(120000).optional(),
    timeoutSec: z.number().int().min(10).max(7200).optional(),
    cleanupMs: z.number().int().min(10000).max(7200000).optional(),
    applyPatchEnabled: z.boolean().optional(),
    security: z.enum(['allowlist', 'full', 'off']).optional(),
    safeBins: z.array(z.string().regex(/^[a-zA-Z0-9._\/-]+$/).max(100)).max(200).optional(),
    ask: z.enum(['on-miss', 'always', 'never']).optional(),
  }).optional(),
  media: z.object({
    concurrency: z.number().int().min(1).max(10).optional(),
    imageEnabled: z.boolean().optional(),
    audioEnabled: z.boolean().optional(),
    videoEnabled: z.boolean().optional(),
  }).optional(),
  agentToAgent: z.object({
    enabled: z.boolean().optional(),
    allow: z.array(z.string().max(100)).max(50).optional(),
  }).optional(),
  byProvider: z.string().max(5000).optional(),
  sandboxTools: z.string().max(5000).optional(),
  subagentsTools: z.string().max(5000).optional(),
}).strict();

const loggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  consoleLevel: z.enum(['debug', 'info', 'warn', 'error']).nullable().optional(),
  consoleStyle: z.enum(['pretty', 'compact', 'json']).optional(),
  file: z.string().max(500).optional(),
  redactSensitive: z.enum(['tools', 'off']).optional(),
  redactPatterns: z.array(z.string().max(500)).max(50).optional(),
}).strict();

const gatewaySchema = z.object({
  mode: z.enum(['local', 'remote', 'hybrid']).optional(),
  port: z.number().int().min(1024).max(65535).optional(),
  bind: z.enum(['loopback', 'all', 'private']).optional(),
  auth: z.object({
    mode: z.enum(['token', 'password']).optional(),
    token: z.string().max(500).optional(),
    password: z.string().max(500).optional(),
    allowTailscale: z.boolean().optional(),
  }).optional(),
  remote: z.object({
    url: z.string().max(500).optional(),
    token: z.string().max(500).optional(),
    tlsFingerprint: z.string().max(200).optional(),
  }).optional(),
  trustedProxies: z.array(z.string().max(50)).max(50).optional(),
  discovery: z.enum(['minimal', 'off', 'full']).optional(),
  controlUi: z.object({
    allowInsecureAuth: z.boolean().optional(),
    dangerouslyDisableDeviceAuth: z.boolean().optional(),
  }).optional(),
  nodes: z.object({
    browserMode: z.enum(['off', 'managed', 'external']).optional(),
  }).optional(),
}).strict();

const commandsSchema = z.object({
  native: z.enum(['auto', 'off']).optional(),
  text: z.boolean().optional(),
  bash: z.boolean().optional(),
  config: z.boolean().optional(),
  debug: z.boolean().optional(),
  restart: z.boolean().optional(),
  useAccessGroups: z.boolean().optional(),
}).strict();

const pluginsSchema = z.object({
  enabled: z.boolean().optional(),
  allow: z.array(z.string().max(200)).max(100).optional(),
  deny: z.array(z.string().max(200)).max(100).optional(),
  loadPaths: z.array(z.string().max(500)).max(20).optional(),
}).strict();

const environmentSchema = z.object({
  env: z.string().max(10000).optional(),
  shellEnvEnabled: z.boolean().optional(),
  shellEnvTimeoutMs: z.number().int().min(1000).max(60000).optional(),
}).strict();

const sectionSchemas: Record<string, z.ZodSchema> = {
  messages: messagesSchema,
  session: sessionSchema,
  agentsDefaults: agentsDefaultsSchema,
  tools: toolsSchema,
  logging: loggingSchema,
  gateway: gatewaySchema,
  commands: commandsSchema,
  plugins: pluginsSchema,
  environment: environmentSchema,
};

router.put(
  '/:instId/openclaw-config/:section',
  authenticate,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const section = req.params.section as string;
      const schema = sectionSchemas[section];
      if (!schema) {
        return res.status(400).json({ error: { message: `Seção inválida: ${section}. Use: ${Object.keys(sectionSchemas).join(', ')}` } });
      }

      const parsed = schema.parse(req.body);

      const inst = await prisma.instance.findUnique({ where: { id: req.params.instId as string } });
      if (!inst?.containerHost || !inst?.containerName) {
        return res.status(404).json({ error: { message: 'Instância sem container mapeado' } });
      }

      const config = await openclaw.readConfig(inst.containerHost, inst.containerName) || {};

      // Apply changes to the right section
      switch (section) {
        case 'messages': {
          const { queue, inbound, tts, groupChat, ...msgRest } = parsed as any;
          config.messages = deepMerge(config.messages || {}, msgRest);
          if (queue) config.messages.queue = deepMerge(config.messages.queue || {}, queue);
          if (inbound) config.messages.inbound = deepMerge(config.messages.inbound || {}, inbound);
          if (tts) config.messages.tts = deepMerge(config.messages.tts || {}, tts);
          if (groupChat) config.messages.groupChat = deepMerge(config.messages.groupChat || {}, groupChat);
          break;
        }
        case 'session': {
          const { resetByType, identityLinks, agentToAgent, sendPolicy, reset, ...sessRest } = parsed as any;
          config.session = deepMerge(config.session || {}, sessRest);
          if (reset) {
            const { resetTriggers, ...resetRest } = reset;
            config.session.reset = deepMerge(config.session.reset || {}, resetRest);
            if (resetTriggers !== undefined) config.session.reset.resetTriggers = resetTriggers;
          }
          if (resetByType) config.session.resetByType = deepMerge(config.session.resetByType || {}, resetByType);
          if (identityLinks !== undefined) config.session.identityLinks = identityLinks;
          if (agentToAgent) config.session.agentToAgent = deepMerge(config.session.agentToAgent || {}, agentToAgent);
          if (sendPolicy) {
            if (!config.session.sendPolicy) config.session.sendPolicy = {};
            if (sendPolicy.default_ !== undefined) config.session.sendPolicy.default = sendPolicy.default_;
            if (sendPolicy.rules !== undefined && sendPolicy.rules) {
              try { config.session.sendPolicy.rules = JSON.parse(sendPolicy.rules); } catch { /* keep as-is */ }
            }
          }
          break;
        }
        case 'agentsDefaults': {
          if (!config.agents) config.agents = {};
          if (!config.agents.defaults) config.agents.defaults = {};
          const { heartbeat, fallbackChain, contextPruning, compaction, humanDelay, subagents, ...rest } = parsed as any;
          Object.assign(config.agents.defaults, rest);
          if (heartbeat) config.agents.defaults.heartbeat = deepMerge(config.agents.defaults.heartbeat || {}, heartbeat);
          if (fallbackChain !== undefined) config.agents.defaults.fallbackChain = fallbackChain;
          if (contextPruning) config.agents.defaults.contextPruning = deepMerge(config.agents.defaults.contextPruning || {}, contextPruning);
          if (compaction) {
            if (!config.agents.defaults.compaction) config.agents.defaults.compaction = {};
            if (compaction.mode !== undefined) config.agents.defaults.compaction.mode = compaction.mode;
            if (compaction.memoryFlushEnabled !== undefined) {
              if (!config.agents.defaults.compaction.memoryFlush) config.agents.defaults.compaction.memoryFlush = {};
              config.agents.defaults.compaction.memoryFlush.enabled = compaction.memoryFlushEnabled;
            }
          }
          if (humanDelay) config.agents.defaults.humanDelay = deepMerge(config.agents.defaults.humanDelay || {}, humanDelay);
          if (subagents) config.agents.defaults.subagents = deepMerge(config.agents.defaults.subagents || {}, subagents);
          break;
        }
        case 'tools': {
          const { web, elevated, allow, deny, exec, media, agentToAgent, byProvider, sandboxTools, subagentsTools, ...rest } = parsed as any;
          config.tools = deepMerge(config.tools || {}, rest);
          if (allow !== undefined) config.tools.allow = allow;
          if (deny !== undefined) config.tools.deny = deny;
          if (web) {
            if (!config.tools.web) config.tools.web = {};
            if (web.searchEnabled !== undefined) {
              if (!config.tools.web.search) config.tools.web.search = {};
              config.tools.web.search.enabled = web.searchEnabled;
            }
            if (web.fetchEnabled !== undefined) {
              if (!config.tools.web.fetch) config.tools.web.fetch = {};
              config.tools.web.fetch.enabled = web.fetchEnabled;
            }
            if (web.searchApiKey !== undefined && web.searchApiKey !== '••••••••' && web.searchApiKey !== '') {
              if (!config.tools.web.search) config.tools.web.search = {};
              config.tools.web.search.apiKey = web.searchApiKey;
            }
            if (web.searchMaxResults !== undefined) {
              if (!config.tools.web.search) config.tools.web.search = {};
              config.tools.web.search.maxResults = web.searchMaxResults;
            }
            if (web.fetchMaxChars !== undefined) {
              if (!config.tools.web.fetch) config.tools.web.fetch = {};
              config.tools.web.fetch.maxChars = web.fetchMaxChars;
            }
            if (web.fetchReadability !== undefined) {
              if (!config.tools.web.fetch) config.tools.web.fetch = {};
              config.tools.web.fetch.readability = web.fetchReadability;
            }
          }
          if (elevated) {
            config.tools.elevated = deepMerge(config.tools.elevated || {}, elevated);
            if (elevated.allowFrom !== undefined) config.tools.elevated.allowFrom = elevated.allowFrom;
          }
          if (exec) {
            if (!config.tools.exec) config.tools.exec = {};
            if (exec.backgroundMs !== undefined) config.tools.exec.backgroundMs = exec.backgroundMs;
            if (exec.timeoutSec !== undefined) config.tools.exec.timeoutSec = exec.timeoutSec;
            if (exec.cleanupMs !== undefined) config.tools.exec.cleanupMs = exec.cleanupMs;
            if (exec.applyPatchEnabled !== undefined) {
              if (!config.tools.exec.applyPatch) config.tools.exec.applyPatch = {};
              config.tools.exec.applyPatch.enabled = exec.applyPatchEnabled;
            }
            if (exec.security !== undefined) config.tools.exec.security = exec.security;
            if (exec.safeBins !== undefined) config.tools.exec.safeBins = exec.safeBins;
            if (exec.ask !== undefined) config.tools.exec.ask = exec.ask;
          }
          if (media) {
            if (!config.tools.media) config.tools.media = {};
            if (media.concurrency !== undefined) config.tools.media.concurrency = media.concurrency;
            if (media.imageEnabled !== undefined) {
              if (!config.tools.media.image) config.tools.media.image = {};
              config.tools.media.image.enabled = media.imageEnabled;
            }
            if (media.audioEnabled !== undefined) {
              if (!config.tools.media.audio) config.tools.media.audio = {};
              config.tools.media.audio.enabled = media.audioEnabled;
            }
            if (media.videoEnabled !== undefined) {
              if (!config.tools.media.video) config.tools.media.video = {};
              config.tools.media.video.enabled = media.videoEnabled;
            }
          }
          if (agentToAgent) {
            config.tools.agentToAgent = deepMerge(config.tools.agentToAgent || {}, agentToAgent);
            if (agentToAgent.allow !== undefined) config.tools.agentToAgent.allow = agentToAgent.allow;
          }
          if (byProvider !== undefined && byProvider) {
            try { config.tools.byProvider = JSON.parse(byProvider); } catch { /* keep as-is */ }
          }
          if (sandboxTools !== undefined && sandboxTools) {
            if (!config.tools.sandbox) config.tools.sandbox = {};
            try { config.tools.sandbox.tools = JSON.parse(sandboxTools); } catch { /* keep as-is */ }
          }
          if (subagentsTools !== undefined && subagentsTools) {
            if (!config.tools.subagents) config.tools.subagents = {};
            try { config.tools.subagents.tools = JSON.parse(subagentsTools); } catch { /* keep as-is */ }
          }
          break;
        }
        case 'logging': {
          const { redactPatterns, ...logRest } = parsed as any;
          config.logging = deepMerge(config.logging || {}, logRest);
          if (redactPatterns !== undefined) config.logging.redactPatterns = redactPatterns;
          break;
        }
        case 'gateway': {
          const { auth, remote, trustedProxies, controlUi, nodes, ...gwRest } = parsed as any;
          config.gateway = deepMerge(config.gateway || {}, gwRest);
          if (auth) {
            if (!config.gateway.auth) config.gateway.auth = {};
            if (auth.mode !== undefined) config.gateway.auth.mode = auth.mode;
            if (auth.token !== undefined && auth.token !== '••••••••' && auth.token !== '') config.gateway.auth.token = auth.token;
            if (auth.password !== undefined && auth.password !== '••••••••' && auth.password !== '') config.gateway.auth.password = auth.password;
            if (auth.allowTailscale !== undefined) config.gateway.auth.allowTailscale = auth.allowTailscale;
          }
          if (remote) {
            if (!config.gateway.remote) config.gateway.remote = {};
            if (remote.url !== undefined) config.gateway.remote.url = remote.url;
            if (remote.token !== undefined && remote.token !== '••••••••' && remote.token !== '') config.gateway.remote.token = remote.token;
            if (remote.tlsFingerprint !== undefined) config.gateway.remote.tlsFingerprint = remote.tlsFingerprint;
          }
          if (trustedProxies !== undefined) config.gateway.trustedProxies = trustedProxies;
          if (controlUi) config.gateway.controlUi = deepMerge(config.gateway.controlUi || {}, controlUi);
          if (nodes) {
            if (!config.gateway.nodes) config.gateway.nodes = {};
            if (nodes.browserMode !== undefined) {
              if (!config.gateway.nodes.browser) config.gateway.nodes.browser = {};
              config.gateway.nodes.browser.mode = nodes.browserMode;
            }
          }
          break;
        }
        case 'commands': {
          config.commands = deepMerge(config.commands || {}, parsed);
          break;
        }
        case 'plugins': {
          const { loadPaths, ...plugRest } = parsed as any;
          config.plugins = deepMerge(config.plugins || {}, plugRest);
          if (loadPaths !== undefined) {
            if (!config.plugins.load) config.plugins.load = {};
            config.plugins.load.paths = loadPaths;
          }
          break;
        }
        case 'environment': {
          const { env: envStr, shellEnvEnabled, shellEnvTimeoutMs } = parsed as any;
          if (envStr !== undefined) {
            const envObj: Record<string, string> = {};
            envStr.split('\n').filter((l: string) => l.includes('=')).forEach((line: string) => {
              const idx = line.indexOf('=');
              envObj[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
            });
            config.env = deepMerge(config.env || {}, envObj);
          }
          if (shellEnvEnabled !== undefined || shellEnvTimeoutMs !== undefined) {
            if (!config.env) config.env = {};
            if (!config.env.shellEnv) config.env.shellEnv = {};
            if (shellEnvEnabled !== undefined) config.env.shellEnv.enabled = shellEnvEnabled;
            if (shellEnvTimeoutMs !== undefined) config.env.shellEnv.timeoutMs = shellEnvTimeoutMs;
          }
          break;
        }
      }

      // Update timestamp
      if (!config.meta) config.meta = {};
      config.meta.lastTouchedAt = new Date().toISOString();

      await openclaw.writeConfig(inst.containerHost, inst.containerName, config);

      // Hot-reload gateway via SIGUSR1 if running
      await hotReloadGateway(inst.containerHost, inst.containerName);

      await prisma.auditLog.create({
        data: {
          userId: req.user!.sub,
          action: `openclaw.config.${section}`,
          resource: 'openclaw_config',
          resourceId: inst.id,
          details: { section, changes: parsed } as any,
          ipAddress: req.ip,
          correlationId: req.correlationId,
        },
      });

      res.json({ success: true, section, applied: parsed });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: { message: 'Dados inválidos', details: err.errors } });
      }
      next(err);
    }
  },
);

// ═══════════════════════════════════════
// POST /:instId/openclaw-config/reload - Hot-reload gateway
// ═══════════════════════════════════════
router.post('/:instId/openclaw-config/reload', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await prisma.instance.findUnique({ where: { id: req.params.instId as string } });
    if (!inst?.containerHost || !inst?.containerName) {
      return res.status(404).json({ error: { message: 'Instância sem container mapeado' } });
    }

    const reloaded = await hotReloadGateway(inst.containerHost, inst.containerName);

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'openclaw.config.reload',
        resource: 'openclaw_config',
        resourceId: inst.id,
        details: { success: reloaded } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: reloaded, message: reloaded ? 'Gateway recarregado' : 'Gateway não está rodando' });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════
// POST /:instId/openclaw-config/gateway-action - Status, Probe, Restart
// ═══════════════════════════════════════
const gatewayActionSchema = z.object({
  action: z.enum(['status', 'probe', 'restart']),
});

router.post('/:instId/openclaw-config/gateway-action', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action } = gatewayActionSchema.parse(req.body);

    const inst = await prisma.instance.findUnique({ where: { id: req.params.instId as string } });
    if (!inst?.containerHost || !inst?.containerName) {
      return res.status(404).json({ error: { message: 'Instância sem container mapeado' } });
    }

    let result: { stdout: string; stderr: string };
    let message: string;

    switch (action) {
      case 'status':
        result = await execInContainer(inst.containerHost, inst.containerName, 'openclaw status --all 2>&1 || echo "OpenClaw não está rodando"');
        message = result.stdout.trim() || 'Sem resposta';
        break;
      case 'probe':
        result = await execInContainer(inst.containerHost, inst.containerName, 'openclaw probe 2>&1 || echo "Probe falhou"');
        message = result.stdout.trim() || 'Sem resposta';
        break;
      case 'restart':
        result = await execInContainer(inst.containerHost, inst.containerName, 'systemctl restart openclaw-gateway 2>&1 && echo "Gateway reiniciado" || echo "Falha ao reiniciar"');
        message = result.stdout.trim() || 'Sem resposta';
        break;
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: `openclaw.gateway.${action}`,
        resource: 'openclaw_config',
        resourceId: inst.id,
        details: { action, output: message } as any,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      },
    });

    res.json({ success: true, action, message });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: { message: 'Ação inválida', details: err.errors } });
    }
    next(err);
  }
});

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

async function hotReloadGateway(host: string, container: string): Promise<boolean> {
  const result = await execInContainer(host, container,
    'PID=$(pgrep -x "openclaw-gateway" 2>/dev/null | head -1); [ -n "$PID" ] && kill -USR1 "$PID" && echo RELOADED || echo NOT_RUNNING'
  );
  return result.stdout.trim().includes('RELOADED');
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] !== undefined) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) && typeof result[key] === 'object' && result[key] !== null) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  return result;
}

export { router as openclawConfigRoutes };
