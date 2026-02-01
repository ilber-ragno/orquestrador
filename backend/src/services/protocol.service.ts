import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import * as openclaw from './openclaw.service.js';
import type { ProtocolStatus, AttendanceMode, ProtocolMessageType, ProtocolAuditAction } from '@prisma/client';

// ═══════════════════════════════════════
// PROTOCOL NUMBER GENERATION
// ═══════════════════════════════════════

export async function generateProtocolNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();

  const seq = await prisma.protocolSequence.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', year: currentYear, lastNum: 0 },
  });

  // Reset counter on year change
  if (seq.year !== currentYear) {
    await prisma.protocolSequence.update({
      where: { id: 'singleton' },
      data: { year: currentYear, lastNum: 1 },
    });
    return `CPR-${currentYear}-000001`;
  }

  const updated = await prisma.protocolSequence.update({
    where: { id: 'singleton' },
    data: { lastNum: { increment: 1 } },
  });

  return `CPR-${currentYear}-${String(updated.lastNum).padStart(6, '0')}`;
}

// ═══════════════════════════════════════
// PROTOCOL CRUD
// ═══════════════════════════════════════

export async function findOrCreateForSession(
  instanceId: string,
  sessionId: string,
  contactId: string,
  channel: string,
  contactName?: string | null,
) {
  const existing = await prisma.protocol.findFirst({
    where: { instanceId, sessionId, status: { not: 'CLOSED' } },
  });
  if (existing) return existing;

  const number = await generateProtocolNumber();
  const protocol = await prisma.protocol.create({
    data: {
      number,
      instanceId,
      sessionId,
      contactId,
      contactName: contactName || null,
      channel,
      status: 'ACTIVE',
      mode: 'AI_ONLY',
    },
  });

  await auditProtocol(protocol.id, null, 'CREATED', { number, sessionId, contactId, channel });
  logger.info({ protocolId: protocol.id, number }, 'protocol: created');
  return protocol;
}

export async function getProtocol(protocolId: string) {
  return prisma.protocol.findUnique({
    where: { id: protocolId },
    include: {
      assignedUser: { select: { id: true, name: true, email: true, role: true } },
      closedByUser: { select: { id: true, name: true } },
      survey: true,
      _count: { select: { messages: true, auditEntries: true, learningPackets: true } },
    },
  });
}

export async function escalateProtocol(protocolId: string, reason: string) {
  const protocol = await prisma.protocol.update({
    where: { id: protocolId },
    data: {
      status: 'ESCALATED',
      escalationReason: reason,
      escalatedAt: new Date(),
    },
  });

  await auditProtocol(protocolId, null, 'ESCALATED', { reason });
  logger.info({ protocolId, reason }, 'protocol: escalated');
  return protocol;
}

export async function assignProtocol(protocolId: string, userId: string, mode: AttendanceMode = 'MODE_A') {
  const protocol = await prisma.protocol.update({
    where: { id: protocolId },
    data: {
      status: 'IN_PROGRESS',
      assignedTo: userId,
      assignedAt: new Date(),
      mode,
    },
  });

  await auditProtocol(protocolId, userId, 'ASSIGNED', { mode });
  logger.info({ protocolId, userId, mode }, 'protocol: assigned');
  return protocol;
}

export async function changeMode(protocolId: string, mode: AttendanceMode, userId: string) {
  const action: ProtocolAuditAction = mode === 'MODE_B' ? 'TAKEOVER' : mode === 'AI_ONLY' ? 'RETURNED_TO_AI' : 'MODE_CHANGED';

  const data: any = { mode };
  if (mode === 'AI_ONLY') {
    data.status = 'ACTIVE';
    data.assignedTo = null;
    data.assignedAt = null;
  }

  const protocol = await prisma.protocol.update({
    where: { id: protocolId },
    data,
  });

  await auditProtocol(protocolId, userId, action, { mode });
  logger.info({ protocolId, mode, action }, 'protocol: mode changed');
  return protocol;
}

export async function closeProtocol(
  protocolId: string,
  userId: string,
  reason: string,
  result: string,
) {
  // Get protocol before closing (need escalation info for learning)
  const existing = await prisma.protocol.findUnique({
    where: { id: protocolId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });

  const protocol = await prisma.protocol.update({
    where: { id: protocolId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedBy: userId,
      closureReason: reason,
      closureResult: result,
      mode: 'AI_ONLY',
    },
  });

  await auditProtocol(protocolId, userId, 'CLOSED', { reason, result });
  logger.info({ protocolId, userId, reason }, 'protocol: closed');

  // Auto-create learning packet if there was an escalation
  if (existing?.escalationReason) {
    try {
      const humanMessages = (existing.messages || [])
        .filter(m => m.type === 'INTERNAL' || m.type === 'DIRECT')
        .map(m => m.content)
        .join('\n');

      // Fetch AI context from OpenClaw session messages
      let aiContext = '';
      try {
        const inst = await prisma.instance.findUnique({ where: { id: protocol.instanceId } });
        if (inst?.containerHost && inst?.containerName) {
          const sessionMsgs = await openclaw.getSessionMessages(
            inst.containerHost,
            inst.containerName,
            existing.sessionId,
          );
          // Get last AI messages before escalation
          const assistantMsgs = sessionMsgs
            .filter((m: any) => m.role === 'assistant')
            .slice(-5); // Last 5 AI messages
          aiContext = assistantMsgs
            .map((m: any) => {
              if (typeof m.content === 'string') return m.content;
              if (Array.isArray(m.content)) return m.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
              return '';
            })
            .join('\n---\n');
        }
      } catch {
        aiContext = `Sessão: ${existing.sessionId}, Contato: ${existing.contactId}`;
      }

      await createLearningPacket(
        protocolId,
        protocol.instanceId,
        existing.escalationReason,
        aiContext || `Sessão: ${existing.sessionId}`,
        humanMessages || 'Sem mensagens do atendente',
        result,
        [reason],
      );
      logger.info({ protocolId }, 'protocol: learning packet auto-created');
    } catch (err: any) {
      logger.error({ protocolId, err: err.message }, 'protocol: failed to create learning packet');
    }
  }

  return protocol;
}

// ═══════════════════════════════════════
// PROTOCOL MESSAGES
// ═══════════════════════════════════════

export async function addMessage(
  protocolId: string,
  userId: string | null,
  type: ProtocolMessageType,
  content: string,
  metadata?: any,
) {
  const msg = await prisma.protocolMessage.create({
    data: {
      protocolId,
      userId,
      type,
      content,
      metadata: metadata || undefined,
    },
  });

  const action: ProtocolAuditAction = type === 'NOTE' ? 'NOTE_ADDED' : 'MESSAGE_SENT';
  await auditProtocol(protocolId, userId, action, { messageType: type, messageId: msg.id });
  return msg;
}

// ═══════════════════════════════════════
// SATISFACTION SURVEY
// ═══════════════════════════════════════

export async function sendSurvey(protocolId: string, userId: string) {
  const survey = await prisma.satisfactionSurvey.create({
    data: { protocolId },
  });

  await prisma.protocol.update({
    where: { id: protocolId },
    data: { status: 'CLOSED' }, // Keep closed, survey is addon
  });

  await auditProtocol(protocolId, userId, 'SURVEY_SENT', { surveyId: survey.id });
  return survey;
}

export async function answerSurvey(protocolId: string, rating: number, comment?: string) {
  const survey = await prisma.satisfactionSurvey.update({
    where: { protocolId },
    data: { rating, comment, answeredAt: new Date() },
  });

  await auditProtocol(protocolId, null, 'SURVEY_ANSWERED', { rating, comment });
  return survey;
}

// ═══════════════════════════════════════
// AI LEARNING
// ═══════════════════════════════════════

export async function createLearningPacket(
  protocolId: string,
  instanceId: string,
  escalationReason: string,
  aiContext: string,
  humanResponse: string,
  resolution?: string,
  tags: string[] = [],
) {
  return prisma.learningPacket.create({
    data: {
      protocolId,
      instanceId,
      escalationReason,
      aiContext,
      humanResponse,
      resolution,
      tags,
    },
  });
}

// ═══════════════════════════════════════
// PROTOCOL AUDIT
// ═══════════════════════════════════════

export async function auditProtocol(
  protocolId: string,
  userId: string | null,
  action: ProtocolAuditAction,
  details?: any,
) {
  return prisma.protocolAudit.create({
    data: {
      protocolId,
      userId,
      action,
      details: details || undefined,
    },
  });
}

// ═══════════════════════════════════════
// SUGGEST ATTENDANT (continuidade)
// ═══════════════════════════════════════

export async function suggestAttendant(instanceId: string, contactId: string): Promise<string | null> {
  const last = await prisma.protocol.findFirst({
    where: { instanceId, contactId, assignedTo: { not: null }, status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
    select: { assignedTo: true },
  });
  return last?.assignedTo || null;
}
