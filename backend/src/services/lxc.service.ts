import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(execFile);

const SSH_KEY = process.env.LXC_SSH_KEY || '';
const LOCAL_IP = '145.223.31.7';

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function isLocalHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === LOCAL_IP) return true;
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (iface?.some((a) => a.address === host)) return true;
  }
  return false;
}

async function runCommand(command: string, timeout = 30000): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync('bash', ['-c', command], { timeout });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || err.message,
      exitCode: err.code || 1,
    };
  }
}

async function hostExec(host: string, command: string, timeout = 30000): Promise<ExecResult> {
  if (isLocalHost(host)) {
    return runCommand(command, timeout);
  }

  const sshArgs = [
    'ssh',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=10',
    ...(SSH_KEY ? ['-i', SSH_KEY] : []),
    `root@${host}`,
    command,
  ].join(' ');

  return runCommand(sshArgs, timeout);
}

export async function listContainers(host: string = LOCAL_IP) {
  const result = await hostExec(host, 'lxc list --format json');
  if (result.exitCode !== 0) throw new Error(`Failed to list containers: ${result.stderr}`);
  try {
    const containers = JSON.parse(result.stdout);
    return containers.map((c: any) => ({
      name: c.name,
      status: c.status?.toLowerCase() || 'unknown',
      type: c.type,
      architecture: c.architecture,
      created_at: c.created_at,
      state: {
        cpu: c.state?.cpu,
        memory: c.state?.memory ? {
          usage: c.state.memory.usage,
          peak: c.state.memory.usage_peak,
        } : null,
        network: c.state?.network ? Object.entries(c.state.network).map(([name, data]: [string, any]) => ({
          name,
          addresses: data.addresses?.filter((a: any) => a.scope === 'global').map((a: any) => a.address) || [],
        })) : [],
        pid: c.state?.pid,
        disk: c.state?.disk,
      },
    }));
  } catch {
    throw new Error(`Failed to parse container list: ${result.stdout.slice(0, 200)}`);
  }
}

export async function getContainerStatus(host: string, containerName: string) {
  const result = await hostExec(host, `lxc info ${containerName} --format json`);
  if (result.exitCode !== 0) throw new Error(`Container ${containerName}: ${result.stderr}`);
  try {
    const info = JSON.parse(result.stdout);
    return {
      name: info.name,
      status: info.status?.toLowerCase() || 'unknown',
      type: info.type,
      architecture: info.architecture,
      created_at: info.created_at,
      last_used_at: info.last_used_at,
      profiles: info.profiles,
      state: {
        cpu: info.state?.cpu,
        memory: info.state?.memory,
        network: info.state?.network,
        pid: info.state?.pid,
        processes: info.state?.processes,
        disk: info.state?.disk,
      },
    };
  } catch {
    throw new Error(`Failed to parse container info: ${result.stdout.slice(0, 200)}`);
  }
}

export async function controlContainer(host: string, containerName: string, action: 'start' | 'stop' | 'restart') {
  const result = await hostExec(host, `lxc ${action} ${containerName}`, 60000);
  if (result.exitCode !== 0) throw new Error(`Failed to ${action} ${containerName}: ${result.stderr}`);
  return { success: true, action, container: containerName, output: result.stdout };
}

export async function execInContainer(host: string, containerName: string, command: string, timeout = 30000) {
  const escapedCmd = command.replace(/'/g, "'\\''");
  const result = await hostExec(host, `lxc exec ${containerName} -- bash -c '${escapedCmd}'`, timeout);
  return result;
}

export async function getContainerLogs(host: string, containerName: string, lines = 50) {
  const result = await execInContainer(host, containerName, `journalctl -n ${lines} --no-pager 2>/dev/null || tail -${lines} /var/log/syslog 2>/dev/null || echo "No logs available"`);
  return result.stdout;
}

export async function getContainerServices(host: string, containerName: string) {
  const result = await execInContainer(host, containerName, 'systemctl list-units --type=service --all --no-pager --no-legend --plain 2>/dev/null | head -50');
  if (result.exitCode !== 0) return [];
  return result.stdout.split('\n').filter(Boolean).map((line) => {
    const parts = line.trim().split(/\s+/);
    return {
      name: parts[0]?.replace('.service', '') || '',
      load: parts[1] || '',
      active: parts[2] || '',
      sub: parts[3] || '',
      description: parts.slice(4).join(' ') || '',
    };
  });
}

export async function applyConfigToContainer(host: string, containerName: string, configKey: string, configValue: string) {
  const escapedValue = configValue.replace(/'/g, "'\\''").replace(/"/g, '\\"');
  const result = await execInContainer(host, containerName, `mkdir -p /etc/clawdbot && echo '${escapedValue}' > /etc/clawdbot/${configKey}`);
  return { success: result.exitCode === 0, output: result.stdout, error: result.stderr };
}
