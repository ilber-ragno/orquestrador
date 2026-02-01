import { prisma } from '../lib/prisma.js';
import { ApprovalCategory, ApprovalStatus } from '@prisma/client';
import { logger } from '../utils/logger.js';
import * as openclaw from './openclaw.service.js';

// ═══════════════════════════════════════
// RISK MAP — Classificação automática
// ═══════════════════════════════════════

interface ToolClassification {
  risk: 'low' | 'medium' | 'high';
  category: ApprovalCategory;
  description: string;
}

const RISK_MAP: Record<string, ToolClassification> = {
  'dall-e':       { risk: 'low',    category: 'API',      description: 'Gerar imagens com IA' },
  'dalle':        { risk: 'low',    category: 'API',      description: 'Gerar imagens com IA' },
  'elevenlabs':   { risk: 'low',    category: 'API',      description: 'Gerar áudio/voz com IA' },
  'tts':          { risk: 'low',    category: 'API',      description: 'Converter texto em voz' },
  'group:web':    { risk: 'low',    category: 'TOOL',     description: 'Buscar na internet' },
  'web:search':   { risk: 'low',    category: 'TOOL',     description: 'Buscar na internet' },
  'web:fetch':    { risk: 'low',    category: 'TOOL',     description: 'Acessar páginas da web' },
  'ffmpeg':       { risk: 'low',    category: 'EXEC',     description: 'Converter vídeos e áudios' },
  'curl':         { risk: 'low',    category: 'EXEC',     description: 'Baixar conteúdo da internet' },
  'wget':         { risk: 'low',    category: 'EXEC',     description: 'Baixar arquivos da internet' },
  'jq':           { risk: 'low',    category: 'EXEC',     description: 'Processar dados JSON' },
  'node':         { risk: 'medium', category: 'EXEC',     description: 'Executar código JavaScript' },
  'python3':      { risk: 'medium', category: 'EXEC',     description: 'Executar código Python' },
  'python':       { risk: 'medium', category: 'EXEC',     description: 'Executar código Python' },
  'pip3':         { risk: 'medium', category: 'EXEC',     description: 'Instalar pacotes Python' },
  'pip':          { risk: 'medium', category: 'EXEC',     description: 'Instalar pacotes Python' },
  'npm':          { risk: 'medium', category: 'EXEC',     description: 'Instalar pacotes Node.js' },
  'npx':          { risk: 'medium', category: 'EXEC',     description: 'Executar pacote Node.js' },
  'group:fs':     { risk: 'medium', category: 'TOOL',     description: 'Ler e escrever arquivos' },
  'fs:write':     { risk: 'medium', category: 'TOOL',     description: 'Escrever arquivos' },
  'fs:read':      { risk: 'low',    category: 'TOOL',     description: 'Ler arquivos' },
  'git':          { risk: 'medium', category: 'EXEC',     description: 'Gerenciar código com Git' },
  'rm':           { risk: 'high',   category: 'EXEC',     description: 'Apagar arquivos' },
  'ssh':          { risk: 'high',   category: 'EXEC',     description: 'Conectar a outro servidor' },
  'docker':       { risk: 'high',   category: 'EXEC',     description: 'Gerenciar containers Docker' },
  'sudo':         { risk: 'high',   category: 'EXEC',     description: 'Executar como administrador' },
  'systemctl':    { risk: 'high',   category: 'EXEC',     description: 'Gerenciar serviços do sistema' },
  'chmod':        { risk: 'medium', category: 'EXEC',     description: 'Alterar permissões de arquivo' },
  'chown':        { risk: 'medium', category: 'EXEC',     description: 'Alterar dono de arquivo' },
  'elevated':     { risk: 'high',   category: 'ELEVATED', description: 'Permissão elevada de ferramenta' },
};

export function autoClassify(toolName: string): ToolClassification {
  const lower = toolName.toLowerCase().trim();

  // Direct match
  if (RISK_MAP[lower]) return RISK_MAP[lower];

  // Partial match
  for (const [key, val] of Object.entries(RISK_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }

  // Default: medium risk EXEC
  return {
    risk: 'medium',
    category: 'EXEC',
    description: `Executar programa: ${toolName}`,
  };
}

// ═══════════════════════════════════════
// CRUD
// ═══════════════════════════════════════

export async function createApproval(instanceId: string, data: {
  toolName: string;
  sessionId?: string;
  context?: string;
  category?: ApprovalCategory;
  risk?: string;
  description?: string;
}) {
  const classification = autoClassify(data.toolName);

  // Avoid duplicates: check if PENDING already exists for same tool
  const existing = await prisma.toolApproval.findFirst({
    where: {
      instanceId,
      toolName: data.toolName,
      status: 'PENDING',
    },
  });
  if (existing) return existing;

  const approval = await prisma.toolApproval.create({
    data: {
      instanceId,
      toolName: data.toolName,
      sessionId: data.sessionId,
      category: data.category || classification.category,
      risk: data.risk || classification.risk,
      description: data.description || classification.description,
      context: data.context,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    },
  });

  logger.info({ instanceId, toolName: data.toolName, approvalId: approval.id }, '[Approval] Novo pedido criado');
  return approval;
}

export async function approveApproval(id: string, userId: string, permanent: boolean) {
  const approval = await prisma.toolApproval.update({
    where: { id },
    data: {
      status: 'APPROVED',
      decidedBy: userId,
      decidedAt: new Date(),
      permanent,
    },
    include: { instance: true },
  });

  // If permanent, sync to openclaw.json
  if (permanent && approval.instance.containerHost && approval.instance.containerName) {
    await syncApprovalToConfig(
      approval.instance.containerHost,
      approval.instance.containerName,
      approval.toolName,
      approval.category,
    );
  }

  logger.info({ approvalId: id, userId, permanent, toolName: approval.toolName }, '[Approval] Aprovado');
  return approval;
}

export async function denyApproval(id: string, userId: string) {
  const approval = await prisma.toolApproval.update({
    where: { id },
    data: {
      status: 'DENIED',
      decidedBy: userId,
      decidedAt: new Date(),
    },
  });

  logger.info({ approvalId: id, userId, toolName: approval.toolName }, '[Approval] Negado');
  return approval;
}

export async function listByInstance(instanceId: string, filters?: {
  status?: ApprovalStatus;
  category?: ApprovalCategory;
  page?: number;
  limit?: number;
}) {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = { instanceId };
  if (filters?.status) where.status = filters.status;
  if (filters?.category) where.category = filters.category;

  const [items, total] = await Promise.all([
    prisma.toolApproval.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        decidedByUser: { select: { id: true, name: true } },
      },
    }),
    prisma.toolApproval.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function listPending(instanceId: string) {
  return prisma.toolApproval.findMany({
    where: { instanceId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
}

export async function countPending(instanceId: string) {
  return prisma.toolApproval.count({
    where: { instanceId, status: 'PENDING' },
  });
}

export async function expireOld() {
  const result = await prisma.toolApproval.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
  if (result.count > 0) {
    logger.info({ count: result.count }, '[Approval] Pedidos expirados');
  }
  return result.count;
}

// ═══════════════════════════════════════
// SYNC TO CONFIG
// ═══════════════════════════════════════

async function syncApprovalToConfig(
  host: string,
  container: string,
  toolName: string,
  category: ApprovalCategory,
) {
  try {
    const config = await openclaw.readConfig(host, container);
    if (!config) return;

    if (category === 'EXEC') {
      // Add to safeBins
      if (!config.tools) config.tools = {};
      if (!config.tools.exec) config.tools.exec = {};
      if (!Array.isArray(config.tools.exec.safeBins)) config.tools.exec.safeBins = [];
      if (!config.tools.exec.safeBins.includes(toolName)) {
        config.tools.exec.safeBins.push(toolName);
      }
    } else if (category === 'TOOL' || category === 'API') {
      // Add to tools.allow
      if (!config.tools) config.tools = {};
      if (!Array.isArray(config.tools.allow)) config.tools.allow = [];
      if (!config.tools.allow.includes(toolName)) {
        config.tools.allow.push(toolName);
      }
    }

    await openclaw.writeConfig(host, container, config);
    logger.info({ host, container, toolName, category }, '[Approval] Sincronizado com openclaw.json');
  } catch (err) {
    logger.error({ err, toolName }, '[Approval] Falha ao sincronizar com config');
  }
}

// ═══════════════════════════════════════
// LOG DETECTION PATTERNS
// ═══════════════════════════════════════

const BLOCKED_PATTERNS = [
  /Tool "([^"]+)" (?:blocked|denied|not allowed)/i,
  /exec denied[:\s]+"?([^"\n]+)"?/i,
  /approval needed[:\s]+"?([^"\n]+)"?/i,
  /sub-?agent needs[:\s]+"?([^"\n]+)"?/i,
  /\[BLOCKED\]\s*(.+)/i,
  /permission denied for tool[:\s]+"?([^"\n]+)"?/i,
  /safeBins.*not.*(?:include|contain|allow).*"([^"]+)"/i,
];

export function detectBlockedTools(logContent: string): string[] {
  const tools = new Set<string>();
  for (const pattern of BLOCKED_PATTERNS) {
    const matches = logContent.matchAll(new RegExp(pattern, 'gi'));
    for (const match of matches) {
      if (match[1]) {
        tools.add(match[1].trim());
      }
    }
  }
  return [...tools];
}
