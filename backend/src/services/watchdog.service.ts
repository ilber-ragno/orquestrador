import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import * as openclaw from './openclaw.service.js';
import { execInContainer } from './lxc.service.js';

const CHECK_INTERVAL = 60_000; // 60 seconds
const RESTART_COOLDOWN = 5 * 60_000; // 5 minutes between restarts
const MAX_RESTARTS_PER_HOUR = 3;
const CRASH_LOOP_THRESHOLD = 3; // consecutive crashes → config sanitize

interface InstanceState {
  wasConnected: boolean;
  lastRestart: number;
  restartsThisHour: number;
  hourStart: number;
  consecutiveCrashes: number;
  lastConfigSanitize: number;
}

const state = new Map<string, InstanceState>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function getState(instanceId: string): InstanceState {
  if (!state.has(instanceId)) {
    state.set(instanceId, {
      wasConnected: false, lastRestart: 0, restartsThisHour: 0,
      hourStart: Date.now(), consecutiveCrashes: 0, lastConfigSanitize: 0,
    });
  }
  const s = state.get(instanceId)!;
  // Reset hourly counter
  if (Date.now() - s.hourStart > 3600_000) {
    s.restartsThisHour = 0;
    s.hourStart = Date.now();
  }
  return s;
}

function canRestart(s: InstanceState): boolean {
  if (s.restartsThisHour >= MAX_RESTARTS_PER_HOUR) return false;
  if (Date.now() - s.lastRestart < RESTART_COOLDOWN) return false;
  return true;
}

/**
 * Check gateway logs for config errors (e.g. "Unrecognized key", "Invalid config").
 * Returns the error message if found, null otherwise.
 */
async function detectConfigError(host: string, container: string): Promise<string | null> {
  const result = await execInContainer(host, container,
    `tail -50 /tmp/openclaw-gateway.log 2>/dev/null || true`, 5000);
  if (!result.stdout) return null;
  const lines = result.stdout.split('\n');
  for (const line of lines) {
    if (/Invalid config|Unrecognized key|invalid.*config/i.test(line)) {
      return line.trim();
    }
  }
  return null;
}

/**
 * Auto-sanitize openclaw.json by reading, running through sanitizeConfig, and writing back.
 * This removes any unknown keys that OpenClaw rejects (e.g. denyFrom).
 */
async function autoSanitizeConfig(host: string, container: string, instanceId: string): Promise<boolean> {
  try {
    const config = await openclaw.readConfig(host, container);
    if (!config) return false;
    // writeConfig already calls sanitizeConfig + backup + hot-reload
    const ok = await openclaw.writeConfig(host, container, config);
    if (ok) {
      logger.info({ instanceId, container }, 'watchdog: config auto-sanitized successfully');
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'watchdog.config_sanitize',
          resource: 'config',
          resourceId: instanceId,
          details: { container, reason: 'crash_loop_detected' } as any,
          ipAddress: '127.0.0.1',
        },
      });
    }
    return ok;
  } catch (err: any) {
    logger.error({ instanceId, err: err.message }, 'watchdog: config sanitize failed');
    return false;
  }
}

async function checkInstance(instance: { id: string; containerHost: string; containerName: string }) {
  const s = getState(instance.id);
  const { containerHost: host, containerName: container } = instance;

  try {
    // First check if gateway process exists
    const gwStatus = await openclaw.getGatewayStatus(host, container);
    const health = gwStatus.running ? await openclaw.getGatewayHealth(host, container) : null;

    if (!gwStatus.running) {
      // Track consecutive crashes
      if (s.lastRestart > 0 && Date.now() - s.lastRestart < RESTART_COOLDOWN) {
        // Gateway died shortly after last restart → likely crash loop
        s.consecutiveCrashes++;
      }

      // Update DB status
      await prisma.instance.update({ where: { id: instance.id }, data: { gatewayStatus: 'stopped' } });

      // If crash-looping, try to auto-fix config before restarting
      if (s.consecutiveCrashes >= CRASH_LOOP_THRESHOLD) {
        const configError = await detectConfigError(host, container);
        logger.warn({
          instanceId: instance.id, container, crashes: s.consecutiveCrashes, configError,
        }, 'watchdog: crash loop detected — attempting config sanitize');

        // Only sanitize once per 10 minutes to avoid loops
        if (Date.now() - s.lastConfigSanitize > 10 * 60_000) {
          const fixed = await autoSanitizeConfig(host, container, instance.id);
          s.lastConfigSanitize = Date.now();
          if (fixed) {
            s.consecutiveCrashes = 0; // Reset after fix
          }
        }
      }

      if (!canRestart(s)) {
        logger.warn({ instanceId: instance.id, container }, 'watchdog: gateway down but cooldown active');
        return;
      }

      logger.info({ instanceId: instance.id, container }, 'watchdog: gateway process not found, starting...');
      const result = await openclaw.startGateway(host, container);
      s.lastRestart = Date.now();
      s.restartsThisHour++;

      // Verify gateway actually stayed alive (detect immediate crash)
      if (result.success) {
        // Wait a bit more and re-check
        await new Promise(r => setTimeout(r, 3000));
        const recheck = await openclaw.getGatewayStatus(host, container);
        if (!recheck.running) {
          result.success = false;
          s.consecutiveCrashes++;
          logger.warn({ instanceId: instance.id, container },
            'watchdog: gateway died immediately after start — possible config error');
          // Check logs for config error
          const configError = await detectConfigError(host, container);
          if (configError) {
            logger.error({ instanceId: instance.id, container, configError },
              'watchdog: config error detected in gateway logs');
            // Sanitize and retry once
            if (Date.now() - s.lastConfigSanitize > 10 * 60_000) {
              const fixed = await autoSanitizeConfig(host, container, instance.id);
              s.lastConfigSanitize = Date.now();
              if (fixed) {
                s.consecutiveCrashes = 0;
                logger.info({ instanceId: instance.id }, 'watchdog: retrying gateway start after config fix');
                const retry = await openclaw.startGateway(host, container);
                result.success = retry.success;
              }
            }
          }
        } else {
          // Gateway stayed alive → reset crash counter
          s.consecutiveCrashes = 0;
        }
      }

      await prisma.instance.update({ where: { id: instance.id }, data: { gatewayStatus: result.success ? 'running' : 'error' } });

      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'watchdog.gateway_restart',
          resource: 'gateway',
          resourceId: instance.id,
          details: { container, success: result.success, reason: 'gateway_not_running', crashes: s.consecutiveCrashes } as any,
          ipAddress: '127.0.0.1',
        },
      });

      logger.info({ instanceId: instance.id, success: result.success }, 'watchdog: gateway start completed');
      return;
    }

    // Gateway process running — reset crash counter
    s.consecutiveCrashes = 0;

    // Check if gateway is actually responsive (not zombie)
    if (!health || !health.ok) {
      logger.warn({ instanceId: instance.id, container, health }, 'watchdog: gateway running but not healthy');
      // Don't restart immediately — give it a cycle to recover
    }

    // Gateway process running - check WhatsApp status
    const waStatus = await openclaw.getWhatsAppStatus(host, container);
    const waChannel = await prisma.channel.findFirst({ where: { instanceId: instance.id, type: 'WHATSAPP' } });
    if (!waChannel) return;

    // Sync DB status
    const newStatus = waStatus.connected ? 'connected' : 'disconnected';
    if (waChannel.status !== newStatus) {
      await prisma.channel.update({ where: { id: waChannel.id }, data: { status: newStatus } });
    }

    // Also update gateway status
    await prisma.instance.update({ where: { id: instance.id }, data: { gatewayStatus: 'running' } });

    // Auto-recover: was connected, now disconnected
    if (s.wasConnected && !waStatus.connected) {
      if (!canRestart(s)) {
        logger.warn({ instanceId: instance.id, container }, 'watchdog: WhatsApp disconnected but cooldown active');
        s.wasConnected = false;
        return;
      }

      logger.info({ instanceId: instance.id, container }, 'watchdog: WhatsApp disconnected, restarting gateway...');
      const result = await openclaw.startGateway(host, container);
      s.lastRestart = Date.now();
      s.restartsThisHour++;

      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'watchdog.whatsapp_reconnect',
          resource: 'channel',
          resourceId: waChannel.id,
          details: { container, success: result.success, reason: 'whatsapp_disconnected' } as any,
          ipAddress: '127.0.0.1',
        },
      });

      logger.info({ instanceId: instance.id, success: result.success }, 'watchdog: WhatsApp reconnect attempt completed');
    }

    s.wasConnected = waStatus.connected;
  } catch (err: any) {
    logger.error({ instanceId: instance.id, err: err.message }, 'watchdog: check failed');
  }
}

async function checkAll() {
  try {
    const instances = await prisma.instance.findMany({
      where: {
        containerName: { not: null },
        containerHost: { not: null },
        channels: { some: { isActive: true } },
      },
    });

    logger.info({ count: instances.length }, 'watchdog: checking instances');

    for (const inst of instances) {
      if (!inst.containerHost || !inst.containerName) continue;
      await checkInstance({ id: inst.id, containerHost: inst.containerHost, containerName: inst.containerName });
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'watchdog: checkAll failed');
  }
}

export function startWatchdog() {
  if (intervalId) return;
  logger.info(`Watchdog started (interval: ${CHECK_INTERVAL / 1000}s, cooldown: ${RESTART_COOLDOWN / 60000}min, max: ${MAX_RESTARTS_PER_HOUR}/hr)`);
  // Run first check after 10s to let the server stabilize
  setTimeout(() => {
    checkAll();
    intervalId = setInterval(checkAll, CHECK_INTERVAL);
  }, 10_000);
}

export function stopWatchdog() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Watchdog stopped');
  }
}
