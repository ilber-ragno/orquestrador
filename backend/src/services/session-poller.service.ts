import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import * as openclaw from './openclaw.service.js';
import * as protocolService from './protocol.service.js';

const POLL_INTERVAL = 15_000; // 15 seconds
const PROTOCOL_CREATION_WINDOW = 24 * 3600_000; // 24h - create protocols for recent sessions
const ESCALATION_CHECK_WINDOW = 5 * 60_000; // 5 minutes - only check escalation in active sessions

// Escalation markers the AI emits when it needs human help
const ESCALATION_PATTERNS = [
  /\[ESCALAR:\s*(.+?)\]/i,
  /\[ESCALAÇÃO:\s*(.+?)\]/i,
  /\[TRANSFERIR:\s*(.+?)\]/i,
  /\[HUMAN_NEEDED:\s*(.+?)\]/i,
  /\[ATENDENTE:\s*(.+?)\]/i,
];

const SURVEY_CHECK_WINDOW = 60 * 60_000; // 1 hour - look for survey responses within 1h of sending

let intervalId: ReturnType<typeof setInterval> | null = null;

// Track which sessions we've already processed escalation for (avoid duplicates)
const processedEscalations = new Map<string, number>(); // sessionId -> timestamp
const processedSurveys = new Set<string>(); // protocolId set

function extractTextFromContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text' && c.text)
      .map((c: any) => c.text)
      .join('\n');
  }
  return '';
}

function detectSurveyResponse(messages: any[]): number | null {
  // Check last user message for a rating (1-5)
  // Only match if message contains exactly ONE digit (to avoid false positives)
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue;
    const text = extractTextFromContent(messages[i].content).trim();
    // Count digits in the text - must have exactly one
    const digits = text.match(/\d/g);
    if (digits && digits.length === 1) {
      const num = parseInt(digits[0]);
      if (num >= 1 && num <= 5) return num;
    }
    break; // Only check last user message
  }
  return null;
}

function detectEscalation(messages: any[]): { detected: boolean; reason: string } | null {
  // Check from end, only the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'assistant') continue;
    const text = extractTextFromContent(messages[i].content);
    for (const pattern of ESCALATION_PATTERNS) {
      const match = text.match(pattern);
      if (match) return { detected: true, reason: match[1].trim() };
    }
    break; // Only check the LAST assistant message
  }
  return null;
}

async function pollInstance(instance: { id: string; containerHost: string; containerName: string }) {
  const { containerHost: host, containerName: container } = instance;

  try {
    const sessions = await openclaw.listSessions(host, container);
    const now = Date.now();

    for (const session of sessions) {
      // Skip very old sessions (>24h)
      if (now - session.updatedAt > PROTOCOL_CREATION_WINDOW) continue;

      const contactId = session.origin?.from || session.key?.replace(/^whatsapp:/, '') || session.key;
      const contactName = session.origin?.label || null;
      const channel = session.lastChannel || 'whatsapp';

      // Find or create protocol for this session
      const protocol = await protocolService.findOrCreateForSession(
        instance.id,
        session.sessionId,
        contactId,
        channel,
        contactName,
      );

      // Skip if protocol is already closed or being handled by a human
      if (['CLOSED', 'IN_PROGRESS', 'ASSIGNED'].includes(protocol.status)) continue;

      // Only check for escalation in recently active sessions (5 min)
      if (now - session.updatedAt > ESCALATION_CHECK_WINDOW) continue;

      // Check for escalation markers - allow re-escalation if protocol returned to ACTIVE
      const escalationKey = session.sessionId;
      if (processedEscalations.has(escalationKey) && protocol.status === 'ESCALATED') continue;
      if (processedEscalations.has(escalationKey) && protocol.status === 'ACTIVE') {
        processedEscalations.delete(escalationKey);
      }

      try {
        const messages = await openclaw.getSessionMessages(host, container, session.sessionId);
        const escalation = detectEscalation(messages);

        if (escalation && protocol.status !== 'ESCALATED') {
          await protocolService.escalateProtocol(protocol.id, escalation.reason);
          processedEscalations.set(escalationKey, now);
          logger.info({
            protocolId: protocol.id,
            protocolNumber: protocol.number,
            reason: escalation.reason,
          }, 'session-poller: escalation detected');
        }
      } catch (err: any) {
        logger.error({ sessionId: session.sessionId, err: err.message }, 'session-poller: error reading messages');
      }
    }

    // Cleanup old processed escalations (older than 30 min)
    for (const [key, ts] of processedEscalations) {
      if (now - ts > 30 * 60_000) processedEscalations.delete(key);
    }
  } catch (err: any) {
    logger.error({ instanceId: instance.id, err: err.message }, 'session-poller: poll failed');
  }
}

async function checkPendingSurveys() {
  try {
    // Find surveys sent but not answered within the last hour
    const cutoff = new Date(Date.now() - SURVEY_CHECK_WINDOW);
    const pendingSurveys = await prisma.satisfactionSurvey.findMany({
      where: {
        answeredAt: null,
        sentAt: { gt: cutoff },
      },
      include: {
        protocol: {
          select: {
            id: true,
            number: true,
            sessionId: true,
            instanceId: true,
            instance: { select: { containerHost: true, containerName: true } },
          },
        },
      },
    });

    for (const survey of pendingSurveys) {
      if (processedSurveys.has(survey.protocolId)) continue;
      const { protocol } = survey;
      if (!protocol.instance.containerHost || !protocol.instance.containerName) continue;

      try {
        const messages = await openclaw.getSessionMessages(
          protocol.instance.containerHost,
          protocol.instance.containerName,
          protocol.sessionId,
        );
        const rating = detectSurveyResponse(messages);
        if (rating !== null) {
          await protocolService.answerSurvey(protocol.id, rating);
          processedSurveys.add(survey.protocolId);
          logger.info({
            protocolId: protocol.id,
            protocolNumber: protocol.number,
            rating,
          }, 'session-poller: survey response detected');
        }
      } catch (err: any) {
        logger.error({ protocolId: protocol.id, err: err.message }, 'session-poller: error checking survey');
      }
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'session-poller: checkPendingSurveys failed');
  }
}

async function pollAll() {
  try {
    const instances = await prisma.instance.findMany({
      where: {
        containerName: { not: null },
        containerHost: { not: null },
        channels: { some: { isActive: true } },
      },
    });

    for (const inst of instances) {
      if (!inst.containerHost || !inst.containerName) continue;
      await pollInstance({ id: inst.id, containerHost: inst.containerHost, containerName: inst.containerName });
    }

    // Check for pending survey responses
    await checkPendingSurveys();
  } catch (err: any) {
    logger.error({ err: err.message }, 'session-poller: pollAll failed');
  }
}

export function startSessionPoller() {
  if (intervalId) return;
  logger.info(`Session poller started (interval: ${POLL_INTERVAL / 1000}s)`);
  // First poll after 15s
  setTimeout(() => {
    pollAll();
    intervalId = setInterval(pollAll, POLL_INTERVAL);
  }, 15_000);
}

export function stopSessionPoller() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Session poller stopped');
  }
}
