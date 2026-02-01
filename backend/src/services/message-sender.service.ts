import { execInContainer } from './lxc.service.js';
import { logger } from '../utils/logger.js';

/**
 * Envia mensagem via OpenClaw CLI (openclaw message send)
 */
export async function sendMessageViaGateway(
  host: string,
  container: string,
  channel: string,
  to: string,
  message: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Sanitize inputs
    const safeMsg = message.replace(/'/g, "'\\''");
    const safeTo = to.replace(/[^+0-9@.a-zA-Z_:-]/g, '');
    const safeCh = channel.replace(/[^a-zA-Z0-9-]/g, '');

    const cmd = `openclaw message send --target "${safeTo}" --message '${safeMsg}' --channel ${safeCh} --json 2>&1`;
    const result = await execInContainer(host, container, cmd, 20000);

    if (result.exitCode !== 0) {
      logger.error({ host, container, channel, to, stderr: result.stderr }, 'message-sender: send failed');
      return { success: false, error: result.stderr || result.stdout || 'Send failed' };
    }

    // Parse JSON response
    try {
      const start = result.stdout.indexOf('{');
      if (start >= 0) {
        const data = JSON.parse(result.stdout.slice(start));
        const messageId = data?.payload?.result?.messageId || data?.messageId;
        return { success: true, messageId };
      }
    } catch { /* ignore parse errors */ }

    return { success: true };
  } catch (err: any) {
    logger.error({ host, container, err: err.message }, 'message-sender: exception');
    return { success: false, error: err.message };
  }
}

/**
 * Injeta contexto do atendente no workspace da IA (Mode A).
 * Escreve arquivo que a IA lê no próximo turno.
 */
export async function injectContextForAI(
  host: string,
  container: string,
  sessionId: string,
  content: string,
): Promise<boolean> {
  try {
    const safeContent = content.replace(/'/g, "'\\''");
    const filePath = `/root/.openclaw/workspace/.panel-inject-${sessionId}.md`;

    const cmd = `cat > '${filePath}' << 'PANEL_EOF'
# Instrução do Atendente (Painel)

${safeContent}

> Use esta informação para responder ao cliente na próxima mensagem.
> Após usar, este arquivo será removido automaticamente.
PANEL_EOF`;

    const result = await execInContainer(host, container, cmd, 5000);
    if (result.exitCode !== 0) {
      logger.error({ host, container, sessionId, stderr: result.stderr }, 'message-sender: inject failed');
      return false;
    }

    logger.info({ host, container, sessionId }, 'message-sender: context injected for AI');
    return true;
  } catch (err: any) {
    logger.error({ host, container, err: err.message }, 'message-sender: inject exception');
    return false;
  }
}
