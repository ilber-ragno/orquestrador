import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
import * as protocolService from '../services/protocol.service.js';
import * as messageSender from '../services/message-sender.service.js';
import * as openclaw from '../services/openclaw.service.js';

const router = Router();

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

async function getInstance(id: string, next: NextFunction) {
  const inst = await prisma.instance.findUnique({ where: { id } });
  if (!inst) { next(new AppError(404, 'NOT_FOUND', 'Instância não encontrada')); return null; }
  if (!inst.containerHost || !inst.containerName) { next(new AppError(400, 'NO_CONTAINER', 'Instância sem container mapeado')); return null; }
  return inst;
}

function canAccessProtocol(userRole: string, userId: string, protocol: any, action: 'read' | 'write') {
  if (userRole === 'ADMIN') return true;
  if (userRole === 'AUDITOR' && action === 'read') return true;
  if (userRole === 'OPERATOR') {
    if (action === 'read') {
      // OPERATOR pode ler escalados (fila) e atribuídos a si
      return protocol.status === 'ESCALATED' || protocol.assignedTo === userId;
    }
    return protocol.assignedTo === userId;
  }
  return false;
}

// ═══════════════════════════════════════
// LIST PROTOCOLS
// ═══════════════════════════════════════

router.get('/:id/protocols', authenticate, requireRole('ADMIN', 'OPERATOR', 'AUDITOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const { status, assignedTo, sessionId, page = '1', limit = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = { instanceId: inst.id };
    if (status) where.status = status;
    if (assignedTo) where.assignedTo = assignedTo;
    if (sessionId) where.sessionId = sessionId;

    // OPERATOR sees only escalated (queue) + own
    if (req.user!.role === 'OPERATOR') {
      where.OR = [
        { status: 'ESCALATED' },
        { assignedTo: req.user!.sub },
      ];
    }

    const [protocols, total] = await Promise.all([
      prisma.protocol.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit),
        include: {
          assignedUser: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
        },
      }),
      prisma.protocol.count({ where }),
    ]);

    res.json({ protocols, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// MY PROTOCOLS
// ═══════════════════════════════════════

router.get('/:id/protocols/mine', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const protocols = await prisma.protocol.findMany({
      where: { instanceId: inst.id, assignedTo: req.user!.sub, status: { not: 'CLOSED' } },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
      },
    });

    res.json({ protocols });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// STATS
// ═══════════════════════════════════════

router.get('/:id/protocols/stats', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const [byStatus, avgSurvey, totalEscalated, recentEscalations] = await Promise.all([
      prisma.protocol.groupBy({
        by: ['status'],
        where: { instanceId: inst.id },
        _count: true,
      }),
      prisma.satisfactionSurvey.aggregate({
        where: { protocol: { instanceId: inst.id }, rating: { not: null } },
        _avg: { rating: true },
        _count: true,
      }),
      prisma.protocol.count({
        where: { instanceId: inst.id, escalatedAt: { not: null } },
      }),
      prisma.protocol.findMany({
        where: { instanceId: inst.id, escalatedAt: { not: null } },
        orderBy: { escalatedAt: 'desc' },
        take: 10,
        select: { escalationReason: true, escalatedAt: true, status: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    byStatus.forEach(s => { statusCounts[s.status] = s._count; });

    res.json({
      statusCounts,
      totalEscalated,
      csatAvg: avgSurvey._avg.rating,
      csatCount: avgSurvey._count,
      recentEscalations,
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// LEARNING PACKETS (must be before :pid routes)
// ═══════════════════════════════════════

router.get('/:id/protocols/learning', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const { from, to } = req.query as Record<string, string>;
    const where: any = { instanceId: inst.id };
    if (from) where.createdAt = { ...where.createdAt, gte: new Date(from) };
    if (to) where.createdAt = { ...where.createdAt, lte: new Date(to) };

    const packets = await prisma.learningPacket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { protocol: { select: { number: true, contactId: true, channel: true } } },
    });

    res.json({ packets });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// ESCALATION COUNTS (for sidebar badges, must be before :pid routes)
// ═══════════════════════════════════════

router.get('/:id/protocols/counts', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    const [escalated, mine] = await Promise.all([
      prisma.protocol.count({ where: { instanceId: inst.id, status: 'ESCALATED' } }),
      prisma.protocol.count({ where: { instanceId: inst.id, assignedTo: req.user!.sub, status: { not: 'CLOSED' } } }),
    ]);

    res.json({ escalated, mine });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// SSE: STREAM DE EVENTOS DE PROTOCOLO
// ═══════════════════════════════════════

router.get('/:id/protocols/stream', authenticate, async (req: Request, res: Response) => {
  const instanceId = req.params.id as string;
  const userId = req.user!.sub;
  const userRole = req.user!.role;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('data: {"type":"connected"}\n\n');

  let lastCheck = new Date();

  const interval = setInterval(async () => {
    try {
      const recentProtocols = await prisma.protocol.findMany({
        where: { instanceId, updatedAt: { gt: lastCheck } },
        include: { assignedUser: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      const recentMessages = await prisma.protocolMessage.findMany({
        where: { protocol: { instanceId }, createdAt: { gt: lastCheck } },
        include: {
          user: { select: { name: true } },
          protocol: { select: { id: true, number: true, sessionId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const recentAudits = await prisma.protocolAudit.findMany({
        where: { protocol: { instanceId }, createdAt: { gt: lastCheck } },
        include: { protocol: { select: { id: true, number: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      lastCheck = new Date();

      for (const p of recentProtocols) {
        if (userRole === 'OPERATOR' && p.status !== 'ESCALATED' && p.assignedTo !== userId) continue;
        res.write(`data: ${JSON.stringify({
          type: p.status === 'ESCALATED' ? 'escalation' : 'status_change',
          protocol: {
            id: p.id, number: p.number, status: p.status, mode: p.mode,
            sessionId: p.sessionId, contactName: p.contactName,
            assignedUser: p.assignedUser ? { id: p.assignedUser.id, name: p.assignedUser.name } : null,
            escalationReason: p.escalationReason,
          },
        })}\n\n`);
      }

      for (const m of recentMessages) {
        res.write(`data: ${JSON.stringify({
          type: 'new_message',
          protocolId: m.protocol.id,
          sessionId: m.protocol.sessionId,
          message: { id: m.id, type: m.type, content: m.content, userName: m.user?.name || 'Sistema', createdAt: m.createdAt },
        })}\n\n`);
      }

      for (const a of recentAudits) {
        res.write(`data: ${JSON.stringify({
          type: 'audit', protocolId: a.protocol.id, action: a.action, details: a.details,
        })}\n\n`);
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'protocol-stream: poll error');
    }
  }, 3000);

  req.on('close', () => { clearInterval(interval); });
});

// ═══════════════════════════════════════
// GET PROTOCOL DETAIL
// ═══════════════════════════════════════

router.get('/:id/protocols/:pid', authenticate, requireRole('ADMIN', 'OPERATOR', 'AUDITOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const protocol = await protocolService.getProtocol(req.params.pid as string);
    if (!protocol) return next(new AppError(404, 'NOT_FOUND', 'Protocolo não encontrado'));
    if (!canAccessProtocol(req.user!.role, req.user!.sub, protocol, 'read')) {
      return next(new AppError(403, 'FORBIDDEN', 'Sem permissão para acessar este protocolo'));
    }

    // Suggest attendant if escalated
    let suggestedAttendant: string | null = null;
    if (protocol.status === 'ESCALATED') {
      suggestedAttendant = await protocolService.suggestAttendant(protocol.instanceId, protocol.contactId);
    }

    res.json({ protocol, suggestedAttendant });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// TIMELINE (OpenClaw messages + internal messages merged)
// ═══════════════════════════════════════

router.get('/:id/protocols/:pid/timeline', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const protocol = await prisma.protocol.findUnique({ where: { id: req.params.pid as string } });
    if (!protocol) return next(new AppError(404, 'NOT_FOUND', 'Protocolo não encontrado'));
    if (!canAccessProtocol(req.user!.role, req.user!.sub, protocol, 'read')) {
      return next(new AppError(403, 'FORBIDDEN', 'Sem permissão'));
    }

    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    // Fetch OpenClaw messages
    const ocMessages = await openclaw.getSessionMessages(inst.containerHost!, inst.containerName!, protocol.sessionId);

    // Fetch internal messages
    const internalMessages = await prisma.protocolMessage.findMany({
      where: { protocolId: protocol.id },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true } } },
    });

    // Merge into unified timeline
    const timeline: any[] = [];

    for (const msg of ocMessages) {
      timeline.push({
        source: 'openclaw',
        id: msg.id,
        timestamp: msg.timestamp,
        role: msg.role,
        content: msg.content,
        mediaType: (msg as any).mediaType,
        mediaPath: (msg as any).mediaPath,
        mediaDuration: (msg as any).mediaDuration,
        transcript: (msg as any).transcript,
      });
    }

    for (const msg of internalMessages) {
      timeline.push({
        source: 'panel',
        id: msg.id,
        timestamp: msg.createdAt.toISOString(),
        type: msg.type,
        content: msg.content,
        userId: msg.userId,
        userName: msg.user?.name || null,
        metadata: msg.metadata,
      });
    }

    // Sort by timestamp
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json({ timeline, protocol: { number: protocol.number, status: protocol.status, mode: protocol.mode } });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// AUDIT TRAIL
// ═══════════════════════════════════════

router.get('/:id/protocols/:pid/audit', authenticate, requireRole('ADMIN', 'AUDITOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await prisma.protocolAudit.findMany({
      where: { protocolId: req.params.pid as string },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ entries });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// ASSIGN ATTENDANT
// ═══════════════════════════════════════

router.post('/:id/protocols/:pid/assign', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, mode = 'MODE_A' } = req.body;
    const assignTo = userId || req.user!.sub; // "Assumir eu mesmo" if no userId

    const protocol = await prisma.protocol.findUnique({ where: { id: req.params.pid as string } });
    if (!protocol) return next(new AppError(404, 'NOT_FOUND', 'Protocolo não encontrado'));

    if (protocol.status === 'CLOSED') {
      return next(new AppError(400, 'CLOSED', 'Protocolo já encerrado'));
    }

    // OPERATOR can only assign to self
    if (req.user!.role === 'OPERATOR' && assignTo !== req.user!.sub) {
      return next(new AppError(403, 'FORBIDDEN', 'Operador só pode assumir para si mesmo'));
    }

    const updated = await protocolService.assignProtocol(req.params.pid as string, assignTo, mode);
    res.json({ protocol: updated });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// CHANGE MODE
// ═══════════════════════════════════════

router.post('/:id/protocols/:pid/mode', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mode } = req.body;
    if (!['AI_ONLY', 'MODE_A', 'MODE_B'].includes(mode)) {
      return next(new AppError(400, 'INVALID_MODE', 'Modo inválido'));
    }

    const protocol = await prisma.protocol.findUnique({ where: { id: req.params.pid as string } });
    if (!protocol) return next(new AppError(404, 'NOT_FOUND', 'Protocolo não encontrado'));
    if (!canAccessProtocol(req.user!.role, req.user!.sub, protocol, 'write')) {
      return next(new AppError(403, 'FORBIDDEN', 'Sem permissão'));
    }

    const updated = await protocolService.changeMode(req.params.pid as string, mode, req.user!.sub);
    res.json({ protocol: updated });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// SEND MESSAGE (Mode A or B)
// ═══════════════════════════════════════

router.post('/:id/protocols/:pid/message', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return next(new AppError(400, 'EMPTY', 'Conteúdo da mensagem é obrigatório'));
    }

    const protocol = await prisma.protocol.findUnique({ where: { id: req.params.pid as string } });
    if (!protocol) return next(new AppError(404, 'NOT_FOUND', 'Protocolo não encontrado'));
    if (protocol.status === 'CLOSED') return next(new AppError(400, 'CLOSED', 'Protocolo encerrado'));
    if (!canAccessProtocol(req.user!.role, req.user!.sub, protocol, 'write')) {
      return next(new AppError(403, 'FORBIDDEN', 'Sem permissão'));
    }

    const inst = await getInstance(req.params.id as string, next);
    if (!inst) return;

    if (protocol.mode === 'MODE_B') {
      // Mode B: Send directly to client via gateway
      const result = await messageSender.sendMessageViaGateway(
        inst.containerHost!, inst.containerName!,
        protocol.channel, protocol.contactId, content.trim(),
      );
      if (!result.success) {
        return next(new AppError(502, 'SEND_FAILED', result.error || 'Falha ao enviar mensagem'));
      }

      await protocolService.addMessage(protocol.id, req.user!.sub, 'DIRECT', content.trim(), {
        messageId: result.messageId,
      });
    } else if (protocol.mode === 'MODE_A') {
      // Mode A: Inject context for AI
      const injected = await messageSender.injectContextForAI(
        inst.containerHost!, inst.containerName!,
        protocol.sessionId, content.trim(),
      );

      await protocolService.addMessage(protocol.id, req.user!.sub, 'INTERNAL', content.trim(), {
        injected,
      });
    } else {
      return next(new AppError(400, 'INVALID_MODE', 'Protocolo não está em modo de atendimento humano'));
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// ADD NOTE
// ═══════════════════════════════════════

router.post('/:id/protocols/:pid/note', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return next(new AppError(400, 'EMPTY', 'Conteúdo obrigatório'));

    const protocol = await prisma.protocol.findUnique({ where: { id: req.params.pid as string } });
    if (!protocol) return next(new AppError(404, 'NOT_FOUND', 'Protocolo não encontrado'));
    if (!canAccessProtocol(req.user!.role, req.user!.sub, protocol, 'write')) {
      return next(new AppError(403, 'FORBIDDEN', 'Sem permissão'));
    }

    const msg = await protocolService.addMessage(protocol.id, req.user!.sub, 'NOTE', content.trim());
    res.json({ message: msg });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// CLOSE PROTOCOL
// ═══════════════════════════════════════

const closeProtocolSchema = z.object({
  reason: z.string().min(1, 'Motivo é obrigatório').max(500),
  result: z.string().min(1, 'Resultado é obrigatório').max(2000),
  sendSurvey: z.boolean().optional().default(false),
});

router.post('/:id/protocols/:pid/close', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = closeProtocolSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Dados inválidos'));
    }
    const { reason, result: closureResult, sendSurvey: shouldSendSurvey } = parsed.data;

    const protocol = await prisma.protocol.findUnique({ where: { id: req.params.pid as string } });
    if (!protocol) return next(new AppError(404, 'NOT_FOUND', 'Protocolo não encontrado'));
    if (protocol.status === 'CLOSED') return next(new AppError(400, 'ALREADY_CLOSED', 'Protocolo já encerrado'));
    if (!canAccessProtocol(req.user!.role, req.user!.sub, protocol, 'write')) {
      return next(new AppError(403, 'FORBIDDEN', 'Sem permissão'));
    }

    // closeProtocol auto-creates learning packet if there was an escalation
    const closed = await protocolService.closeProtocol(protocol.id, req.user!.sub, reason, closureResult);

    // Send satisfaction survey if requested
    let survey = null;
    if (shouldSendSurvey) {
      const inst = await getInstance(req.params.id as string, next);
      if (inst) {
        survey = await protocolService.sendSurvey(protocol.id, req.user!.sub);
        // Send survey message to client
        const surveyMsg = `Atendimento encerrado (Protocolo ${protocol.number}).\n\nAvalie de 1 a 5: Como foi seu atendimento?\n1 ⭐ Péssimo\n2 ⭐⭐ Ruim\n3 ⭐⭐⭐ Regular\n4 ⭐⭐⭐⭐ Bom\n5 ⭐⭐⭐⭐⭐ Ótimo`;
        await messageSender.sendMessageViaGateway(
          inst.containerHost!, inst.containerName!,
          protocol.channel, protocol.contactId, surveyMsg,
        );
      }
    }

    res.json({ protocol: closed, survey });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════
// SURVEY
// ═══════════════════════════════════════

router.post('/:id/protocols/:pid/survey/send', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const protocol = await prisma.protocol.findUnique({ where: { id: req.params.pid as string } });
    if (!protocol) return next(new AppError(404, 'NOT_FOUND', 'Protocolo não encontrado'));

    const survey = await protocolService.sendSurvey(protocol.id, req.user!.sub);

    const inst = await getInstance(req.params.id as string, next);
    if (inst) {
      const surveyMsg = `Protocolo ${protocol.number}: Avalie de 1 a 5 como foi seu atendimento.`;
      await messageSender.sendMessageViaGateway(
        inst.containerHost!, inst.containerName!,
        protocol.channel, protocol.contactId, surveyMsg,
      );
    }

    res.json({ survey });
  } catch (err) { next(err); }
});

const surveyAnswerSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Nota mínima é 1').max(5, 'Nota máxima é 5'),
  comment: z.string().max(500).optional(),
});

router.post('/:id/protocols/:pid/survey/answer', authenticate, requireRole('ADMIN', 'OPERATOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = surveyAnswerSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(400, 'INVALID_RATING', parsed.error.errors[0]?.message || 'Nota deve ser de 1 a 5'));
    }
    const { rating, comment } = parsed.data;

    const survey = await protocolService.answerSurvey(req.params.pid as string, rating, comment);
    res.json({ survey });
  } catch (err) { next(err); }
});

export { router as protocolRoutes };
