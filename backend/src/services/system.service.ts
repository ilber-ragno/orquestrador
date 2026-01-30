import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

export interface ServiceInfo {
  name: string;
  description: string;
  status: 'running' | 'stopped' | 'failed' | 'unknown';
  enabled: boolean;
  pid: number | null;
  uptime: string | null;
  memory: string | null;
}

/**
 * List systemd services matching a pattern
 */
export async function listServices(pattern?: string): Promise<ServiceInfo[]> {
  try {
    const { stdout } = await execFileAsync('systemctl', [
      'list-units',
      '--type=service',
      '--all',
      '--no-pager',
      '--plain',
      '--no-legend',
    ]);

    const services: ServiceInfo[] = [];
    const lines = stdout.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;

      const unitName = parts[0].replace('.service', '');
      if (pattern && !unitName.includes(pattern)) continue;

      // Skip internal/system services
      if (unitName.startsWith('systemd-') || unitName.startsWith('dbus')) continue;

      const active = parts[2]; // active/inactive/failed
      const sub = parts[3]; // running/dead/exited/failed

      let status: ServiceInfo['status'] = 'unknown';
      if (sub === 'running') status = 'running';
      else if (active === 'inactive' || sub === 'dead' || sub === 'exited') status = 'stopped';
      else if (active === 'failed' || sub === 'failed') status = 'failed';

      const description = parts.slice(4).join(' ');

      services.push({
        name: unitName,
        description,
        status,
        enabled: false, // will be enriched
        pid: null,
        uptime: null,
        memory: null,
      });
    }

    // Enrich with enabled status
    for (const svc of services) {
      try {
        const { stdout: enabledOut } = await execFileAsync('systemctl', ['is-enabled', `${svc.name}.service`]);
        svc.enabled = enabledOut.trim() === 'enabled';
      } catch {
        svc.enabled = false;
      }
    }

    return services;
  } catch (err) {
    logger.error({ err }, 'Failed to list services');
    return [];
  }
}

/**
 * Get detailed status of a specific service
 */
export async function getServiceStatus(name: string): Promise<ServiceInfo | null> {
  try {
    const { stdout } = await execFileAsync('systemctl', [
      'show',
      `${name}.service`,
      '--no-pager',
      '--property=ActiveState,SubState,Description,MainPID,MemoryCurrent,ActiveEnterTimestamp,UnitFileState',
    ]);

    const props: Record<string, string> = {};
    for (const line of stdout.trim().split('\n')) {
      const [key, ...valueParts] = line.split('=');
      props[key] = valueParts.join('=');
    }

    let status: ServiceInfo['status'] = 'unknown';
    if (props.SubState === 'running') status = 'running';
    else if (props.ActiveState === 'inactive') status = 'stopped';
    else if (props.ActiveState === 'failed') status = 'failed';

    const pid = parseInt(props.MainPID) || null;
    const memory = props.MemoryCurrent && props.MemoryCurrent !== '[not set]'
      ? formatBytes(parseInt(props.MemoryCurrent))
      : null;

    const enterTime = props.ActiveEnterTimestamp;
    let uptime: string | null = null;
    if (enterTime && status === 'running') {
      const start = new Date(enterTime);
      const diff = Date.now() - start.getTime();
      uptime = formatDuration(diff);
    }

    return {
      name,
      description: props.Description || '',
      status,
      enabled: props.UnitFileState === 'enabled',
      pid: status === 'running' ? pid : null,
      uptime,
      memory,
    };
  } catch (err) {
    logger.error({ err, service: name }, 'Failed to get service status');
    return null;
  }
}

/**
 * Control a service (start/stop/restart/enable/disable)
 */
export async function controlService(
  name: string,
  action: 'start' | 'stop' | 'restart' | 'enable' | 'disable',
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('systemctl', [action, `${name}.service`]);
    logger.info({ service: name, action }, 'Service action executed');
    return { success: true, output: stdout || stderr || `${action} completed` };
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    logger.error({ err, service: name, action }, 'Service action failed');
    return { success: false, output: error.stderr || error.message || 'Unknown error' };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${(bytes / 1073741824).toFixed(1)}GB`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
