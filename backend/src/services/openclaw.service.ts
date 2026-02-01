import { execInContainer } from './lxc.service.js';
import { logger } from '../utils/logger.js';

const OPENCLAW_DIR = '/root/.openclaw';
const OPENCLAW_CONFIG = `${OPENCLAW_DIR}/openclaw.json`;
const OPENCLAW_BIN = '/usr/bin/openclaw';

// ═══════════════════════════════════════
// CONFIG SAFEGUARD — chaves reconhecidas pelo OpenClaw
// Chaves fora desta lista são removidas antes de gravar
// ═══════════════════════════════════════

const VALID_TOP_LEVEL_KEYS = new Set([
  'agents', 'channels', 'gateway', 'logging', 'messages', 'models',
  'plugins', 'session', 'tools', 'commands', 'env', 'skills',
  'workspace', 'repoRoot', 'skipBootstrap', 'bootstrapMaxChars',
  'userTimezone', 'timeFormat', 'elevatedDefault', 'mediaMaxMb',
  'contextPruning', 'compaction', 'typingMode', 'typingIntervalSeconds',
  'humanDelay', 'subagents',
]);

// Chaves PROIBIDAS dentro de channels.<name> — o OpenClaw não reconhece e trava
const CHANNEL_FORBIDDEN_KEYS = new Set([
  'enabled',        // OpenClaw usa plugins.entries.<name>.enabled, não channels.<name>.enabled
  'contactLabels',  // interno do painel (armazenado no BD, não no config)
]);

// Chaves PROIBIDAS dentro de agents.defaults (não se aplica a agents.list[] entries)
const AGENT_DEFAULTS_FORBIDDEN_KEYS = new Set([
  'identity', // identity é válido em agents.list[].identity mas NÃO em agents.defaults
]);

/**
 * Sanitiza o config removendo chaves que o OpenClaw não reconhece.
 * Previne o bug que travava o gateway.
 */
function sanitizeConfig(config: any): any {
  if (!config || typeof config !== 'object') return config;
  const sanitized = { ...config };

  // Remover top-level keys desconhecidas (preservar apenas as válidas)
  // Nota: não filtramos rigidamente o top-level para não quebrar configs personalizados
  // Mas filtramos dentro de channels e agents

  // Sanitizar channels
  if (sanitized.channels && typeof sanitized.channels === 'object') {
    for (const chKey of Object.keys(sanitized.channels)) {
      if (typeof sanitized.channels[chKey] === 'object' && sanitized.channels[chKey] !== null) {
        for (const forbiddenKey of CHANNEL_FORBIDDEN_KEYS) {
          if (forbiddenKey in sanitized.channels[chKey]) {
            logger.warn({ channel: chKey, key: forbiddenKey }, `[ConfigSafeguard] Removendo chave proibida de channels.${chKey}.${forbiddenKey}`);
            delete sanitized.channels[chKey][forbiddenKey];
          }
        }
      }
    }
  }

  // Sanitizar agents.defaults (não mexer em agents.list[] que usa identity legitimamente)
  if (sanitized.agents?.defaults && typeof sanitized.agents.defaults === 'object') {
    for (const forbiddenKey of AGENT_DEFAULTS_FORBIDDEN_KEYS) {
      if (forbiddenKey in sanitized.agents.defaults) {
        logger.warn({ key: forbiddenKey }, `[ConfigSafeguard] Removendo chave proibida de agents.defaults.${forbiddenKey}`);
        delete sanitized.agents.defaults[forbiddenKey];
      }
    }
  }

  // ═══ Regra obrigatória do OpenClaw: dmPolicy + allowFrom coerência ═══
  // Quando dmPolicy="open", allowFrom DEVE conter "*" senão o gateway não inicia
  // Quando dmPolicy="allowlist", allowFrom deve ter números específicos (sem "*")
  if (sanitized.channels && typeof sanitized.channels === 'object') {
    for (const [chName, chData] of Object.entries(sanitized.channels)) {
      if (typeof chData !== 'object' || chData === null) continue;
      const ch = chData as Record<string, any>;
      if (ch.dmPolicy === 'open') {
        // open EXIGE allowFrom: ["*"]
        if (!Array.isArray(ch.allowFrom) || !ch.allowFrom.includes('*')) {
          logger.info({ channel: chName }, `[ConfigSafeguard] dmPolicy=open → forçando allowFrom=["*"]`);
          ch.allowFrom = ['*'];
        }
      } else if (ch.dmPolicy === 'allowlist') {
        // allowlist não deve ter "*"
        if (Array.isArray(ch.allowFrom)) {
          ch.allowFrom = ch.allowFrom.filter((v: string) => v !== '*');
        }
      } else if (ch.dmPolicy === 'disabled') {
        // disabled → limpar allowFrom
        ch.allowFrom = [];
      }
      // Remover chaves que não são válidas no OpenClaw channels
      // phone, textChunkLimit, mediaMax etc devem ficar SÓ se documentados
      const VALID_CHANNEL_KEYS = new Set([
        'dmPolicy', 'allowFrom', 'groupPolicy', 'groupAllowFrom',
        'mediaMaxMb', 'debounceMs', 'textChunkLimit', 'chunkMode',
        'readReceipts', 'requireMention', 'historyLimit', 'streamMode',
        'replyToMode', 'linkPreview', 'reactionScope', 'configWrites',
        'customCommands', 'allowBots', 'maxLinesPerMessage', 'chatmode',
        'token', 'botToken', 'appToken', 'signingSecret', 'username',
        'applicationId', 'guildId', 'appId', 'appPassword', 'tenantId',
        'serviceAccountKey', 'spaceId', 'serviceAccountFile',
        'homeserver', 'accessToken', 'userId', 'url', 'secret',
        'apiKey', 'allowedOrigins', 'bridgeUrl', 'signalCliPath',
        'channelAccessToken', 'channelSecret',
        'mode', 'webhookPath', 'userTokenReadOnly',
        'webhookMode', 'webhookUrl', 'webhookSecret',
        'dmEnabled', 'dmGroupEnabled', 'threadHistoryScope',
        'slashCommandEnabled', 'mediaMax',
        'accounts', 'groups', 'guilds', 'channels',
      ]);
      const unknownKeys = Object.keys(ch).filter(k => !VALID_CHANNEL_KEYS.has(k));
      for (const uk of unknownKeys) {
        logger.warn({ channel: chName, key: uk }, `[ConfigSafeguard] Removendo chave desconhecida de channels.${chName}.${uk}`);
        delete ch[uk];
      }
    }
  }

  return sanitized;
}

// ═══════════════════════════════════════
// READ / WRITE CONFIG
// ═══════════════════════════════════════

export async function readConfig(host: string, container: string): Promise<any | null> {
  const result = await execInContainer(host, container, `cat ${OPENCLAW_CONFIG} 2>/dev/null`);
  if (result.exitCode !== 0 || !result.stdout) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

/**
 * Escreve o config no container COM safeguards:
 * 1. Sanitiza removendo chaves proibidas
 * 2. Cria backup antes de gravar
 * 3. Valida JSON resultante
 * 4. Hot-reload via SIGUSR1 (se gateway estiver rodando)
 */
export async function writeConfig(host: string, container: string, config: any): Promise<boolean> {
  // 1. Sanitizar
  const safe = sanitizeConfig(config);

  // 2. Validar que o resultado é JSON válido
  let json: string;
  try {
    json = JSON.stringify(safe, null, 2);
    JSON.parse(json); // double-check
  } catch (err) {
    logger.error({ err }, '[ConfigSafeguard] Config resultante não é JSON válido — escrita abortada');
    return false;
  }

  // 3. Backup antes de gravar
  await execInContainer(host, container,
    `cp ${OPENCLAW_CONFIG} ${OPENCLAW_CONFIG}.bak 2>/dev/null; true`
  );

  // 4. Gravar
  const escaped = json.replace(/'/g, "'\\''");
  const result = await execInContainer(host, container, `cat > ${OPENCLAW_CONFIG} << 'EOFCFG'\n${escaped}\nEOFCFG`);

  if (result.exitCode !== 0) {
    logger.error({ exitCode: result.exitCode, stderr: result.stderr }, '[ConfigSafeguard] Falha ao gravar config — restaurando backup');
    await execInContainer(host, container,
      `cp ${OPENCLAW_CONFIG}.bak ${OPENCLAW_CONFIG} 2>/dev/null; true`
    );
    return false;
  }

  // 5. Verificar que o arquivo gravado é JSON válido
  const verify = await execInContainer(host, container,
    `python3 -c "import json; json.load(open('${OPENCLAW_CONFIG}'))" 2>&1`
  );
  if (verify.exitCode !== 0) {
    logger.error({ stderr: verify.stderr }, '[ConfigSafeguard] Config gravado corrompido — restaurando backup');
    await execInContainer(host, container,
      `cp ${OPENCLAW_CONFIG}.bak ${OPENCLAW_CONFIG} 2>/dev/null; true`
    );
    return false;
  }

  // 6. Hot-reload (SIGUSR1) se gateway estiver rodando
  await execInContainer(host, container,
    `kill -SIGUSR1 $(pgrep -f 'openclaw.*gateway' | head -1) 2>/dev/null; true`
  );

  logger.info({ container }, '[ConfigSafeguard] Config gravado e validado com sucesso');
  return true;
}

export async function readFile(host: string, container: string, path: string): Promise<string | null> {
  const result = await execInContainer(host, container, `cat ${path} 2>/dev/null`);
  if (result.exitCode !== 0) return null;
  return result.stdout;
}

export async function writeFile(host: string, container: string, path: string, content: string): Promise<boolean> {
  const escaped = content.replace(/'/g, "'\\''");
  const dir = path.substring(0, path.lastIndexOf('/'));
  const result = await execInContainer(host, container, `mkdir -p '${dir}' && cat > '${path}' << 'EOFFILE'\n${escaped}\nEOFFILE`);
  return result.exitCode === 0;
}

// ═══════════════════════════════════════
// CHECK / INSTALL
// ═══════════════════════════════════════

export async function checkInstalled(host: string, container: string): Promise<boolean> {
  const result = await execInContainer(host, container, `test -f ${OPENCLAW_BIN} && echo yes || echo no`);
  return result.stdout.trim() === 'yes';
}

export async function getVersion(host: string, container: string): Promise<string | null> {
  const result = await execInContainer(host, container, `${OPENCLAW_BIN} --version 2>/dev/null || npm list -g openclaw --depth=0 2>/dev/null | grep openclaw`);
  if (result.exitCode !== 0 && !result.stdout) return null;
  const match = result.stdout.match(/(\d{4}\.\d+\.\d+)/);
  return match ? match[1] : result.stdout.trim() || null;
}

export async function installOpenClaw(host: string, container: string): Promise<{ success: boolean; output: string }> {
  const result = await execInContainer(host, container, 'npm install -g openclaw 2>&1', 120000);
  return { success: result.exitCode === 0, output: result.stdout || result.stderr };
}

// ═══════════════════════════════════════
// MODELS
// ═══════════════════════════════════════

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  input: string;
  context: string;
  auth: boolean;
}

export async function listAvailableModels(host: string, container: string): Promise<{
  models: AvailableModel[];
  currentPrimary: string | null;
  currentFallbacks: string[];
}> {
  // Get models with auth from openclaw
  const result = await execInContainer(host, container,
    `cd ${OPENCLAW_DIR} && [ -f .env ] && set -a && . .env && set +a; ${OPENCLAW_BIN} models list --json 2>/dev/null`,
    15000
  );

  let configuredModels: AvailableModel[] = [];
  if (result.exitCode === 0 && result.stdout) {
    try {
      const data = JSON.parse(result.stdout);
      const items = Array.isArray(data) ? data : data.models || [];
      configuredModels = items
        .filter((m: any) => m.auth === true || m.auth === 'yes')
        .map((m: any) => ({
          id: m.id || m.model || '',
          name: m.name || m.label || m.id || '',
          provider: (m.id || '').split('/')[0] || m.provider || '',
          input: m.input || '',
          context: m.context || m.contextWindow || '',
          auth: true,
        }));
    } catch { /* parse error, try fallback */ }
  }

  // If --json didn't work, parse plain text output
  if (configuredModels.length === 0) {
    const plainResult = await execInContainer(host, container,
      `cd ${OPENCLAW_DIR} && [ -f .env ] && set -a && . .env && set +a; ${OPENCLAW_BIN} models list --all 2>/dev/null`,
      15000
    );
    if (plainResult.exitCode === 0 && plainResult.stdout) {
      const lines = plainResult.stdout.split('\n').filter(l => l.trim() && !l.startsWith('Model'));
      for (const line of lines) {
        const parts = line.split(/\s{2,}/);
        if (parts.length < 2) continue;
        const id = parts[0].trim();
        if (!id || id === '-') continue;
        const authCol = parts.find((p, i) => i >= 3 && (p.trim() === 'yes' || p.trim() === 'no'));
        const hasAuth = authCol?.trim() === 'yes';
        if (!hasAuth) continue;
        const provider = id.split('/')[0];
        const modelName = id.split('/').slice(1).join('/');
        configuredModels.push({
          id,
          name: modelName || id,
          provider,
          input: parts[1]?.trim() || '',
          context: parts[2]?.trim() || '',
          auth: true,
        });
      }
    }
  }

  // Get current primary and fallbacks from config
  const config = await readConfig(host, container);
  const currentPrimary = config?.agents?.defaults?.model?.primary || null;
  const currentFallbacks = config?.agents?.defaults?.model?.fallbacks || [];

  return { models: configuredModels, currentPrimary, currentFallbacks };
}

// ═══════════════════════════════════════
// DIRECTORIES & STRUCTURE
// ═══════════════════════════════════════

export async function checkDirectories(host: string, container: string): Promise<Record<string, boolean>> {
  const dirs = ['agents', 'credentials', 'devices', 'cron', 'workspace', 'memory'];
  const checks: Record<string, boolean> = {};
  const result = await execInContainer(host, container, `cd ${OPENCLAW_DIR} 2>/dev/null && for d in ${dirs.join(' ')}; do test -d "$d" && echo "$d:yes" || echo "$d:no"; done`);
  if (result.exitCode !== 0) {
    dirs.forEach(d => checks[d] = false);
    return checks;
  }
  result.stdout.split('\n').forEach(line => {
    const [dir, val] = line.split(':');
    if (dir) checks[dir] = val === 'yes';
  });
  return checks;
}

// ═══════════════════════════════════════
// AGENTS
// ═══════════════════════════════════════

export async function listAgents(host: string, container: string): Promise<string[]> {
  const result = await execInContainer(host, container, `ls -1 ${OPENCLAW_DIR}/agents/ 2>/dev/null`);
  if (result.exitCode !== 0 || !result.stdout) return [];
  return result.stdout.split('\n').filter(Boolean);
}

export async function getAgentConfig(host: string, container: string, agentName: string): Promise<any | null> {
  const path = `${OPENCLAW_DIR}/agents/${agentName}/agent`;
  const result = await execInContainer(host, container, `cat ${path}/auth-profiles.json 2>/dev/null`);
  if (result.exitCode !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

export async function getWorkspaceFile(host: string, container: string, fileName: string): Promise<string | null> {
  return readFile(host, container, `${OPENCLAW_DIR}/workspace/${fileName}`);
}

export async function writeWorkspaceFile(host: string, container: string, fileName: string, content: string): Promise<boolean> {
  return writeFile(host, container, `${OPENCLAW_DIR}/workspace/${fileName}`, content);
}

// ═══════════════════════════════════════
// AUTH PROFILES (provider keys)
// ═══════════════════════════════════════

export async function getAuthProfiles(host: string, container: string, agentName = 'main'): Promise<any | null> {
  const path = `${OPENCLAW_DIR}/agents/${agentName}/agent/auth-profiles.json`;
  const content = await readFile(host, container, path);
  if (!content) return null;
  try { return JSON.parse(content); } catch { return null; }
}

export async function writeAuthProfiles(host: string, container: string, profiles: any, agentName = 'main'): Promise<boolean> {
  const path = `${OPENCLAW_DIR}/agents/${agentName}/agent/auth-profiles.json`;
  return writeFile(host, container, path, JSON.stringify(profiles, null, 2));
}

// ═══════════════════════════════════════
// GATEWAY
// ═══════════════════════════════════════

export async function getGatewayStatus(host: string, container: string): Promise<{ running: boolean; pid: number | null; port: number | null }> {
  // Process name is truncated to 15 chars by Linux kernel: "openclaw-gatewa" (no trailing "y")
  const result = await execInContainer(host, container, `pgrep -f "openclaw-gateway" 2>/dev/null && echo FOUND || echo NOTFOUND`);
  const lines = result.stdout.split('\n');
  const found = lines.some(l => l.trim() === 'FOUND');
  let pid: number | null = null;
  if (found) {
    const pidLine = lines.find(l => /^\d+$/.test(l.trim()));
    if (pidLine) pid = parseInt(pidLine.trim());
  }

  let port: number | null = null;
  const config = await readConfig(host, container);
  if (config?.gateway?.port) port = config.gateway.port;

  return { running: found, pid, port };
}

export async function startGateway(host: string, container: string): Promise<{ success: boolean; output: string }> {
  // Kill existing gateway processes, clean lock, start fresh
  await execInContainer(host, container,
    'killall -9 openclaw-gateway 2>/dev/null; pkill -9 -f "openclaw gateway" 2>/dev/null; sleep 1; rm -f /root/.openclaw/gateway.lock',
    10000
  );
  // Load .env for API keys if it exists, then start gateway
  const result = await execInContainer(host, container,
    `cd ${OPENCLAW_DIR} && [ -f .env ] && set -a && . .env && set +a; nohup ${OPENCLAW_BIN} gateway > /tmp/openclaw-gateway.log 2>&1 & PID=$!; echo $PID`,
    15000
  );
  const pid = parseInt(result.stdout.trim().split('\n').pop() || '');
  if (isNaN(pid)) return { success: false, output: result.stderr || 'Failed to start' };
  // Wait for gateway to initialize
  await new Promise(r => setTimeout(r, 4000));
  const check = await execInContainer(host, container, `pgrep -f "openclaw-gateway" >/dev/null 2>&1 && echo OK || echo DEAD`);
  return { success: check.stdout.trim().includes('OK'), output: `PID: ${pid}` };
}

export async function stopGateway(host: string, container: string): Promise<{ success: boolean }> {
  const result = await execInContainer(host, container, 'pkill -f "openclaw" 2>/dev/null; sleep 1; pgrep -f "openclaw" >/dev/null 2>&1 && echo STILL_RUNNING || echo STOPPED');
  return { success: result.stdout.trim() === 'STOPPED' };
}

// ═══════════════════════════════════════
// GATEWAY HEALTH (real-time channel status)
// ═══════════════════════════════════════

export interface GatewayHealth {
  ok: boolean;
  channels: Record<string, {
    configured: boolean;
    linked: boolean;
    running: boolean;
    connected: boolean;
    self?: { e164?: string; jid?: string };
    lastError?: string | null;
    lastConnectedAt?: string | null;
    lastDisconnect?: string | null;
    accountId?: string;
  }>;
  channelOrder?: string[];
  agents?: any[];
}

export async function getGatewayHealth(host: string, container: string): Promise<GatewayHealth | null> {
  const result = await execInContainer(host, container, `${OPENCLAW_BIN} gateway call health --json 2>/dev/null`, 15000);
  if (result.exitCode !== 0 || !result.stdout) return null;
  try {
    const start = result.stdout.indexOf('{');
    if (start < 0) return null;
    return JSON.parse(result.stdout.slice(start));
  } catch { return null; }
}

// ═══════════════════════════════════════
// WHATSAPP
// ═══════════════════════════════════════

export async function getWhatsAppStatus(host: string, container: string): Promise<{ paired: boolean; phone: string | null; connected: boolean; running: boolean; data: any }> {
  // Try gateway status API first (more accurate than health for connection state)
  const statusResult = await execInContainer(host, container, `${OPENCLAW_BIN} gateway call status --json 2>/dev/null`, 15000);
  if (statusResult.exitCode === 0 && statusResult.stdout) {
    try {
      const start = statusResult.stdout.indexOf('{');
      if (start >= 0) {
        const status = JSON.parse(statusResult.stdout.slice(start));
        const link = status.linkChannel;
        if (link?.id === 'whatsapp') {
          const summaryText = (status.channelSummary || []).join(' ');
          const isLinked = !!link.linked;
          // Extract phone number from channelSummary (e.g. "WhatsApp: linked +5511920000061 auth 2m ago")
          const phoneMatch = summaryText.match(/\+\d+/);
          const phone = phoneMatch?.[0] || null;
          // If linked and authAgeMs is present, WhatsApp is active
          const isConnected = isLinked && link.authAgeMs != null;
          return {
            paired: isLinked,
            phone,
            connected: isConnected,
            running: isConnected,
            data: { ...link, channelSummary: status.channelSummary },
          };
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: gateway health API
  const health = await getGatewayHealth(host, container);
  if (health?.channels?.whatsapp) {
    const wa = health.channels.whatsapp;
    // health endpoint may report running:false even when linked - check linked + self as indicators
    const isActive = wa.linked && wa.self?.e164;
    return {
      paired: wa.linked,
      phone: wa.self?.e164 || wa.self?.jid || null,
      connected: isActive ? true : wa.connected,
      running: isActive ? true : wa.running,
      data: wa,
    };
  }

  // Last resort: paired.json file
  const result = await readFile(host, container, `${OPENCLAW_DIR}/devices/paired.json`);
  if (!result) return { paired: false, phone: null, connected: false, running: false, data: null };
  try {
    const data = JSON.parse(result);
    const paired = !!data?.phone || !!data?.jid;
    return { paired, phone: data?.phone || data?.jid || null, connected: false, running: false, data };
  } catch {
    return { paired: false, phone: null, connected: false, running: false, data: null };
  }
}

export async function startWhatsAppLogin(host: string, container: string): Promise<{ success: boolean; output: string; qrData: string | null }> {
  // Start login in background and poll INSIDE the container (single SSH call)
  // This avoids 45x SSH round-trips for polling
  const result = await execInContainer(host, container,
    `rm -f /tmp/wa-qr.txt /tmp/wa-qr.pid
    nohup bash -c 'script -qfec "timeout 50 ${OPENCLAW_BIN} channels login --channel whatsapp 2>&1" /tmp/wa-qr.txt' > /dev/null 2>&1 &
    echo $! > /tmp/wa-qr.pid
    # Poll inside container - much faster than external polling
    for i in $(seq 1 30); do
      sleep 1
      content=$(cat /tmp/wa-qr.txt 2>/dev/null || true)
      if echo "$content" | grep -qP '[█▀▄]'; then
        sleep 1
        cat /tmp/wa-qr.txt 2>/dev/null
        exit 0
      fi
      if echo "$content" | grep -qiE 'failed|Error|logged out|Session logged out|Unsupported'; then
        cat /tmp/wa-qr.txt 2>/dev/null
        exit 1
      fi
    done
    cat /tmp/wa-qr.txt 2>/dev/null
    exit 2`,
    40000
  );

  const output = result.stdout || '';

  // Cleanup background process
  await execInContainer(host, container,
    'kill $(cat /tmp/wa-qr.pid 2>/dev/null) 2>/dev/null; rm -f /tmp/wa-qr.pid',
    5000
  ).catch(() => {});

  const cleanOutput = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
  const hasQR = /[█▀▄░▓▐▌]/.test(output);

  return {
    success: hasQR || (!output.includes('failed') && !output.includes('Error') && !output.includes('logged out')),
    output: cleanOutput,
    qrData: hasQR ? output : null,
  };
}

export async function logoutWhatsApp(host: string, container: string): Promise<{ success: boolean; output: string }> {
  const result = await execInContainer(host, container, `${OPENCLAW_BIN} channels logout --channel whatsapp 2>&1`, 15000);
  return { success: result.exitCode === 0, output: result.stdout || result.stderr };
}

export async function getPairingCode(host: string, container: string, phone: string): Promise<{ success: boolean; code: string | null; output: string }> {
  const result = await execInContainer(host, container, `cd ${OPENCLAW_DIR} && ${OPENCLAW_BIN} pair --phone ${phone} 2>&1`, 30000);
  const match = result.stdout.match(/(\d{4}-?\d{4})/);
  return {
    success: result.exitCode === 0,
    code: match ? match[1] : null,
    output: result.stdout || result.stderr,
  };
}

// ═══════════════════════════════════════
// LOGS
// ═══════════════════════════════════════

export async function getLogs(host: string, container: string, lines = 100): Promise<string> {
  const result = await execInContainer(host, container,
    `tail -${lines} /tmp/openclaw-gateway.log 2>/dev/null || tail -${lines} /tmp/openclaw/*.log 2>/dev/null || echo "No logs found"`
  );
  return result.stdout;
}

// ═══════════════════════════════════════
// FULL VALIDATION
// ═══════════════════════════════════════

export interface ValidationCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
}

export async function validateInstance(host: string, container: string): Promise<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];

  // 1. OpenClaw installed
  const installed = await checkInstalled(host, container);
  checks.push({
    name: 'openclaw_installed',
    status: installed ? 'ok' : 'error',
    detail: installed ? 'OpenClaw instalado' : 'OpenClaw não encontrado',
  });

  if (!installed) return checks;

  // 2. Version
  const version = await getVersion(host, container);
  checks.push({
    name: 'openclaw_version',
    status: version ? 'ok' : 'warning',
    detail: version ? `Versão: ${version}` : 'Não foi possível detectar a versão',
  });

  // 3. Config exists
  const config = await readConfig(host, container);
  checks.push({
    name: 'config_exists',
    status: config ? 'ok' : 'error',
    detail: config ? 'openclaw.json encontrado' : 'openclaw.json não encontrado',
  });

  // 4. Directories
  const dirs = await checkDirectories(host, container);
  const allDirs = Object.values(dirs).every(v => v);
  checks.push({
    name: 'directories',
    status: allDirs ? 'ok' : 'warning',
    detail: allDirs ? 'Todos os diretórios existem' : `Faltando: ${Object.entries(dirs).filter(([,v]) => !v).map(([k]) => k).join(', ')}`,
  });

  // 5. Gateway running
  const gw = await getGatewayStatus(host, container);
  checks.push({
    name: 'gateway_running',
    status: gw.running ? 'ok' : 'warning',
    detail: gw.running ? `Gateway ativo (PID: ${gw.pid}, porta: ${gw.port})` : 'Gateway não está rodando',
  });

  // 6. WhatsApp paired
  const wa = await getWhatsAppStatus(host, container);
  checks.push({
    name: 'whatsapp_paired',
    status: wa.paired ? 'ok' : 'warning',
    detail: wa.paired ? `WhatsApp pareado: ${wa.phone}` : 'WhatsApp não pareado',
  });

  // 7. Provider configured
  const authProfiles = await getAuthProfiles(host, container);
  const hasProvider = authProfiles && Object.keys(authProfiles).length > 0;
  checks.push({
    name: 'provider_configured',
    status: hasProvider ? 'ok' : 'warning',
    detail: hasProvider ? `${Object.keys(authProfiles).length} provider(s) configurado(s)` : 'Nenhum provider configurado',
  });

  // 8. Agents exist
  const agents = await listAgents(host, container);
  checks.push({
    name: 'agents_exist',
    status: agents.length > 0 ? 'ok' : 'warning',
    detail: agents.length > 0 ? `${agents.length} agent(s): ${agents.join(', ')}` : 'Nenhum agent encontrado',
  });

  return checks;
}

// ═══════════════════════════════════════
// CRON JOBS
// ═══════════════════════════════════════

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastStatus: string | null;
}

export async function listCronJobs(host: string, container: string): Promise<CronJob[]> {
  // Read directly from file (fast) instead of CLI (slow ~5s startup)
  const raw = await readFile(host, container, `${OPENCLAW_DIR}/cron/jobs.json`);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      const jobs = data.jobs || (Array.isArray(data) ? data : []);
      return jobs.map((j: any, i: number) => ({
        id: j.id || String(i),
        name: j.name || j.command || 'unnamed',
        schedule: j.schedule || j.cron || '',
        command: j.command || '',
        enabled: j.enabled !== false,
        lastRun: j.lastRun || j.lastRunAt || null,
        nextRun: j.nextRun || j.nextRunAt || null,
        lastStatus: j.lastStatus || j.lastResult || null,
      }));
    } catch {}
  }
  return [];
}

export async function getCronStatus(host: string, container: string): Promise<any> {
  const jobs = await listCronJobs(host, container);
  return { totalJobs: jobs.length, enabled: jobs.filter(j => j.enabled).length, disabled: jobs.filter(j => !j.enabled).length };
}

export async function toggleCronJob(host: string, container: string, jobId: string, enable: boolean): Promise<boolean> {
  const action = enable ? 'enable' : 'disable';
  const result = await execInContainer(host, container, `${OPENCLAW_BIN} cron ${action} ${jobId} 2>&1`);
  return result.exitCode === 0;
}

export async function forceRunCronJob(host: string, container: string, jobId: string): Promise<{ success: boolean; output: string }> {
  const result = await execInContainer(host, container, `${OPENCLAW_BIN} cron run ${jobId} 2>&1`, 60000);
  return { success: result.exitCode === 0, output: result.stdout || result.stderr };
}

export async function removeCronJob(host: string, container: string, jobId: string): Promise<boolean> {
  const result = await execInContainer(host, container, `${OPENCLAW_BIN} cron rm ${jobId} 2>&1`);
  return result.exitCode === 0;
}

export async function getCronRunHistory(host: string, container: string, jobId?: string): Promise<any[]> {
  // Read from runs log file directly
  const runsFile = jobId
    ? `${OPENCLAW_DIR}/cron/runs/${jobId}.json`
    : `${OPENCLAW_DIR}/cron/runs.json`;
  const raw = await readFile(host, container, runsFile);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : (data.runs || []);
    } catch {}
  }
  return [];
}

// ═══════════════════════════════════════
// SKILLS
// ═══════════════════════════════════════

export interface InstalledSkill {
  name: string;
  version: string;
  description: string | null;
  status: string;
}

export async function listSkills(host: string, container: string): Promise<InstalledSkill[]> {
  // Read from config and skills directory directly (fast) instead of CLI (~5s startup)
  const config = await readConfig(host, container);
  const skillEntries = config?.skills?.entries || {};
  const skills: InstalledSkill[] = [];

  // List installed skills from directory
  const dirResult = await execInContainer(host, container,
    `ls -1 ${OPENCLAW_DIR}/skills/ 2>/dev/null && for d in ${OPENCLAW_DIR}/skills/*/; do [ -f "$d/package.json" ] && cat "$d/package.json" 2>/dev/null; done`,
    5000
  );

  const installedDirs = new Set<string>();
  if (dirResult.exitCode === 0 && dirResult.stdout) {
    // Parse any package.json found
    const chunks = dirResult.stdout.split('\n');
    let currentJson = '';
    for (const line of chunks) {
      if (line.trim().startsWith('{')) currentJson = line;
      else if (currentJson) currentJson += line;

      if (currentJson && line.trim().endsWith('}')) {
        try {
          const pkg = JSON.parse(currentJson);
          const name = pkg.name?.replace(/^@openclaw\/skill-/, '') || '';
          if (name) {
            installedDirs.add(name);
            skills.push({
              name,
              version: pkg.version || '',
              description: pkg.description || null,
              status: 'ready',
            });
          }
        } catch {}
        currentJson = '';
      }
    }
  }

  // Add skills from config that aren't in the directory listing
  for (const [name, data] of Object.entries(skillEntries) as [string, any][]) {
    if (!installedDirs.has(name)) {
      skills.push({
        name,
        version: '',
        description: null,
        status: data.apiKey ? 'configured' : 'missing',
      });
    }
  }

  return skills;
}

// ═══════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════

export interface InstalledHook {
  name: string;
  type: string;
  enabled: boolean;
  description: string | null;
}

export async function listHooks(host: string, container: string): Promise<InstalledHook[]> {
  // Read directly from config (fast) instead of CLI (~5s startup)
  const config = await readConfig(host, container);
  if (config?.hooks?.internal?.entries) {
    return Object.entries(config.hooks.internal.entries).map(([name, data]: [string, any]) => ({
      name,
      type: 'internal',
      enabled: data.enabled !== false,
      description: null,
    }));
  }
  return [];
}

export async function toggleHook(host: string, container: string, hookName: string, enable: boolean): Promise<boolean> {
  const action = enable ? 'enable' : 'disable';
  const result = await execInContainer(host, container, `${OPENCLAW_BIN} hooks ${action} ${hookName} 2>&1`);
  return result.exitCode === 0;
}

// ═══════════════════════════════════════
// PROCESSES
// ═══════════════════════════════════════

export interface ContainerProcess {
  pid: number;
  user: string;
  cpu: string;
  memory: string;
  command: string;
}

// ═══════════════════════════════════════
// SESSIONS & MESSAGES
// ═══════════════════════════════════════

export interface SessionEntry {
  key: string;
  sessionId: string;
  updatedAt: number;
  chatType: string;
  lastChannel: string;
  origin?: { label?: string; from?: string; provider?: string; surface?: string; chatType?: string };
  deliveryContext?: { channel?: string; to?: string; accountId?: string };
}

export async function listSessions(host: string, container: string, agentId = 'main'): Promise<SessionEntry[]> {
  const path = `${OPENCLAW_DIR}/agents/${agentId}/sessions/sessions.json`;
  const raw = await readFile(host, container, path);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Object.entries(data).map(([key, val]: [string, any]) => ({
      key,
      sessionId: val.sessionId,
      updatedAt: val.updatedAt,
      chatType: val.chatType || 'direct',
      lastChannel: val.lastChannel || val.deliveryContext?.channel || 'unknown',
      origin: val.origin || null,
      deliveryContext: val.deliveryContext || null,
    })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch { return []; }
}

export interface SessionMessage {
  type: string;
  id: string;
  timestamp: string;
  role?: string;
  content?: any;
  mediaType?: string;       // 'audio' | 'image' | 'video' | 'document' | 'sticker'
  mediaPath?: string;       // local path e.g. /tmp/tts-xxx/voice.mp3
  mediaDuration?: string;   // e.g. "00:57"
  transcript?: string;      // audio transcript text
  customType?: string;
  data?: any;
}

function extractTextFromContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text || '')
      .join('\n');
  }
  return '';
}

function parseMessageContent(role: string, content: any): { text: string; mediaType?: string; mediaPath?: string; mediaDuration?: string; transcript?: string } {
  const rawText = extractTextFromContent(content);

  // Detect MEDIA: prefix (TTS audio or sent media)
  const mediaMatch = rawText.match(/^MEDIA:(.+\.(?:mp3|ogg|wav|opus|m4a|aac))$/m);
  if (mediaMatch) {
    const cleanText = rawText.replace(/^MEDIA:.+$/m, '').trim();
    return {
      text: cleanText,
      mediaType: 'audio',
      mediaPath: mediaMatch[1],
    };
  }

  // Detect <media:TYPE> placeholder from inbound
  const placeholderMatch = rawText.match(/<media:(image|video|audio|document|sticker)>/i);
  if (placeholderMatch) {
    const mtype = placeholderMatch[1].toLowerCase();
    const cleanText = rawText.replace(/<media:\w+>/gi, '').trim();
    return { text: cleanText, mediaType: mtype };
  }

  // Detect audio duration pattern like "00:57\nMEDIA:/tmp/..."
  const durationMediaMatch = rawText.match(/^(\d{2}:\d{2})\s*\n?MEDIA:(.+\.(?:mp3|ogg|wav|opus|m4a|aac))$/m);
  if (durationMediaMatch) {
    const cleanText = rawText.replace(/^\d{2}:\d{2}\s*\n?MEDIA:.+$/m, '').trim();
    return {
      text: cleanText,
      mediaType: 'audio',
      mediaPath: durationMediaMatch[2],
      mediaDuration: durationMediaMatch[1],
    };
  }

  return { text: rawText };
}

export async function getSessionMessages(host: string, container: string, sessionId: string, agentId = 'main'): Promise<SessionMessage[]> {
  const path = `${OPENCLAW_DIR}/agents/${agentId}/sessions/${sessionId}.jsonl`;
  // Use tail to get last 200 lines to avoid huge payloads
  const result = await execInContainer(host, container, `tail -200 ${path} 2>/dev/null`, 10000);
  if (result.exitCode !== 0 || !result.stdout) return [];
  try {
    const messages: SessionMessage[] = [];
    for (const line of result.stdout.split('\n').filter(Boolean)) {
      let parsed: any;
      try { parsed = JSON.parse(line); } catch { continue; }

      if (parsed.type !== 'message' || !parsed.message) continue;

      const msg = parsed.message;
      const role = msg.role;

      // Skip tool calls and tool results — they are internal agent mechanics
      if (role === 'toolResult' || role === 'toolCall') continue;

      // Skip messages that are purely tool calls (content is only toolCall blocks)
      if (Array.isArray(msg.content)) {
        const hasOnlyTools = msg.content.every((c: any) => c.type === 'toolCall' || c.type === 'toolResult' || c.type === 'thinking');
        if (hasOnlyTools) continue;
      }

      // Only include user and assistant messages
      if (role !== 'user' && role !== 'assistant') continue;

      const parsed2 = parseMessageContent(role, msg.content);

      // Skip delivery-mirror messages that are just filenames
      if (msg.model === 'delivery-mirror' && !parsed2.mediaType) continue;

      messages.push({
        type: 'message',
        id: parsed.id,
        timestamp: parsed.timestamp,
        role,
        content: parsed2.text || msg.content,
        mediaType: parsed2.mediaType,
        mediaPath: parsed2.mediaPath,
        mediaDuration: parsed2.mediaDuration,
        transcript: parsed2.transcript,
      });
    }
    return messages;
  } catch { return []; }
}

export async function listProcesses(host: string, container: string): Promise<ContainerProcess[]> {
  const result = await execInContainer(host, container, 'ps aux --sort=-%mem 2>/dev/null | head -25');
  if (result.exitCode !== 0 || !result.stdout) return [];
  return result.stdout.split('\n').slice(1).filter(Boolean).map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      pid: parseInt(parts[1]) || 0,
      user: parts[0] || '',
      cpu: parts[2] || '0',
      memory: parts[3] || '0',
      command: parts.slice(10).join(' ') || '',
    };
  }).filter(p => p.pid > 0);
}
