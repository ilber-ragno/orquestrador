/**
 * Tradutor de termos técnicos do OpenClaw para português simples.
 *
 * USO:
 *   t('allowlist')          → "Lista fixa"
 *   t('per-peer')           → "Por contato"
 *   tDesc('allowlist')      → "O agente só pode usar os programas da lista"
 *   tLabel('queue.mode')    → "Modo da fila de mensagens"
 *   tOptions('scope')       → [{ value: 'main', label: 'Única' }, ...]
 *
 * Os valores técnicos NUNCA mudam — só a exibição.
 */

// ═══════════════════════════════════════
// TRADUÇÃO DE VALORES (o que aparece em selects e badges)
// ═══════════════════════════════════════

const values: Record<string, { label: string; desc?: string }> = {
  // Genéricos
  on: { label: 'Ligado' },
  off: { label: 'Desligado' },
  auto: { label: 'Automático' },
  yes: { label: 'Sim' },
  no: { label: 'Não' },
  none: { label: 'Nenhum' },
  all: { label: 'Todos' },
  allow: { label: 'Permitir' },
  deny: { label: 'Bloquear' },

  // messages.ackReactionScope
  'group-mentions': { label: 'Menções em grupo', desc: 'Só quando mencionarem o assistente em grupos' },
  groups: { label: 'Grupos', desc: 'Em todas as mensagens de grupo' },

  // messages.queue.mode
  collect: { label: 'Coletar', desc: 'Agrupa mensagens antes de processar' },
  steer: { label: 'Direcionar', desc: 'Redireciona mensagens ao agente adequado' },
  followup: { label: 'Acompanhar', desc: 'Trata como continuação da conversa' },
  interrupt: { label: 'Interromper', desc: 'Processa cada mensagem imediatamente' },

  // messages.queue.drop
  old: { label: 'Mais antigas', desc: 'Descarta as mensagens mais antigas da fila' },
  new: { label: 'Mais novas', desc: 'Descarta as mensagens mais novas da fila' },
  summarize: { label: 'Resumir', desc: 'Resume mensagens antigas em vez de descartar' },

  // messages.tts.auto
  always: { label: 'Sempre' },
  inbound: { label: 'Mensagens recebidas', desc: 'Só quando receber áudio do contato' },
  tagged: { label: 'Marcadas', desc: 'Só mensagens com tag específica' },

  // messages.tts.mode
  final: { label: 'Resposta final', desc: 'Só converte a última resposta em áudio' },

  // session.scope / dmScope
  main: { label: 'Única', desc: 'Todas as conversas compartilham o mesmo contexto' },
  'per-peer': { label: 'Por contato', desc: 'Cada contato tem sua própria conversa isolada' },
  'per-channel-peer': { label: 'Por canal e contato', desc: 'Isolada por canal (WhatsApp, Telegram) e contato' },
  'per-account-channel-peer': { label: 'Por conta, canal e contato', desc: 'Máximo isolamento: conta + canal + contato' },

  // session.reset.mode
  daily: { label: 'Diário', desc: 'Reseta em um horário fixo todo dia' },
  idle: { label: 'Por inatividade', desc: 'Reseta após ficar inativo por um tempo' },

  // agentsDefaults.thinkingDefault
  xhigh: { label: 'Máximo', desc: 'Raciocínio extenso — mais lento, mais preciso' },
  high: { label: 'Alto', desc: 'Raciocínio detalhado' },
  medium: { label: 'Médio', desc: 'Equilíbrio entre velocidade e precisão' },
  low: { label: 'Baixo', desc: 'Raciocínio rápido' },
  minimal: { label: 'Mínimo', desc: 'Praticamente sem raciocínio extra' },

  // agentsDefaults.contextPruning.mode
  adaptive: { label: 'Adaptativo', desc: 'Remove contexto antigo conforme necessário' },
  aggressive: { label: 'Agressivo', desc: 'Remove contexto de forma mais intensa para economizar tokens' },

  // agentsDefaults.compaction.mode
  default: { label: 'Padrão', desc: 'Compactação automática quando o contexto fica grande' },
  safeguard: { label: 'Proteção', desc: 'Compactação mais conservadora, preserva mais informação' },

  // agentsDefaults.typingMode
  never: { label: 'Nunca', desc: 'Não mostra indicador de digitação' },
  instant: { label: 'Instantâneo', desc: 'Mostra assim que começa a processar' },
  thinking: { label: 'Ao pensar', desc: 'Mostra durante o raciocínio' },
  message: { label: 'Ao responder', desc: 'Mostra enquanto gera a resposta' },

  // agentsDefaults.humanDelay.mode
  natural: { label: 'Natural', desc: 'Simula tempo de digitação humana' },
  custom: { label: 'Personalizado', desc: 'Tempo configurável' },

  // agentsDefaults.timeFormat
  '12': { label: '12 horas', desc: 'Ex: 3:30 PM' },
  '24': { label: '24 horas', desc: 'Ex: 15:30' },

  // tools.profile
  full: { label: 'Completo', desc: 'Todas as ferramentas disponíveis' },
  coding: { label: 'Programação', desc: 'Ferramentas focadas em código' },
  messaging: { label: 'Mensagens', desc: 'Ferramentas focadas em comunicação' },

  // tools.exec.security
  allowlist: { label: 'Lista fixa', desc: 'Só os programas da lista' },
  // 'full' já coberto acima como 'Completo' mas para exec tem outro sentido:
  // handled via context below
  // 'off' já coberto como 'Desligado'

  // tools.exec.ask
  'on-miss': { label: 'Pede aprovação', desc: 'Pergunta quando é algo novo' },
  // 'always' já coberto
  // 'never' já coberto

  // logging.level / consoleLevel
  debug: { label: 'Depuração', desc: 'Registra tudo (muito detalhado)' },
  info: { label: 'Informativo', desc: 'Registra operações normais' },
  warn: { label: 'Avisos', desc: 'Só registra avisos e erros' },
  error: { label: 'Erros', desc: 'Só registra erros' },

  // logging.consoleStyle
  pretty: { label: 'Visual', desc: 'Formatação colorida e legível' },
  compact: { label: 'Compacto', desc: 'Uma linha por registro' },
  json: { label: 'JSON', desc: 'Formato estruturado para processamento' },

  // logging.redactSensitive
  tools: { label: 'Ferramentas', desc: 'Oculta dados sensíveis das ferramentas' },

  // gateway.mode
  local: { label: 'Local', desc: 'Só aceita conexões deste servidor' },
  remote: { label: 'Remoto', desc: 'Conecta a um gateway externo' },
  hybrid: { label: 'Híbrido', desc: 'Local com conexão remota de backup' },

  // gateway.bind
  loopback: { label: 'Só este servidor', desc: 'Só aceita conexões locais (127.0.0.1)' },
  private: { label: 'Rede interna', desc: 'Aceita conexões da rede privada' },

  // gateway.auth.mode
  token: { label: 'Token', desc: 'Autenticação por chave secreta' },
  password: { label: 'Senha', desc: 'Autenticação por usuário e senha' },

  // gateway.discovery
  // 'minimal' já coberto como 'Mínimo'

  // gateway.nodes.browser.mode
  managed: { label: 'Gerenciado', desc: 'O OpenClaw controla o navegador' },
  external: { label: 'Externo', desc: 'Usa um navegador já aberto' },

  // commands.native
  // 'auto' já coberto como 'Automático'
  // 'off' já coberto como 'Desligado'
}

// Overrides por contexto (quando o mesmo valor técnico tem sentido diferente)
const contextOverrides: Record<string, Record<string, { label: string; desc?: string }>> = {
  'tools.exec.security': {
    full: { label: 'Liberado', desc: 'O agente pode executar qualquer programa' },
    off: { label: 'Bloqueado', desc: 'O agente não pode executar nada' },
    allowlist: { label: 'Lista fixa', desc: 'Só os programas da lista abaixo' },
  },
  'tools.profile': {
    full: { label: 'Completo', desc: 'Todas as ferramentas disponíveis' },
    minimal: { label: 'Mínimo', desc: 'Apenas ferramentas essenciais' },
  },
  'gateway.discovery': {
    minimal: { label: 'Mínimo', desc: 'Expõe poucas informações sobre o gateway' },
    full: { label: 'Completo', desc: 'Expõe todas as informações do gateway' },
    off: { label: 'Desligado', desc: 'Não expõe nenhuma informação' },
  },
  'gateway.bind': {
    all: { label: 'Todos', desc: 'Aceita conexões de qualquer IP (0.0.0.0)' },
  },
  'messages.tts.auto': {
    off: { label: 'Desligado', desc: 'Não converte texto em áudio' },
    all: { label: 'Todas', desc: 'Converte todas as mensagens em áudio' },
  },
  'messages.tts.mode': {
    all: { label: 'Todas as partes', desc: 'Converte cada parte da resposta em áudio' },
  },
}

// ═══════════════════════════════════════
// TRADUÇÃO DE LABELS DE CAMPOS
// ═══════════════════════════════════════

const fieldLabels: Record<string, string> = {
  // Messages
  'ackReaction': 'Reação de confirmação',
  'ackReactionScope': 'Quando reagir',
  'removeAckAfterReply': 'Remover reação após responder',
  'responsePrefix': 'Prefixo da resposta',
  'queue.mode': 'Modo da fila de mensagens',
  'queue.debounceMs': 'Tempo de espera entre mensagens',
  'queue.cap': 'Limite da fila',
  'queue.drop': 'Quando a fila está cheia',
  'inbound.debounceMs': 'Espera entre mensagens recebidas',
  'tts.auto': 'Resposta em áudio',
  'tts.mode': 'Quando gerar áudio',
  'tts.provider': 'Serviço de voz',
  'tts.maxTextLength': 'Limite de texto para áudio',
  'tts.voice': 'Voz',
  'tts.summaryModel': 'Modelo para resumir antes do áudio',
  'groupChat.historyLimit': 'Mensagens de grupo no contexto',

  // Session
  'scope': 'Memória da conversa',
  'dmScope': 'Memória em conversas diretas',
  'mainKey': 'Nome da sessão principal',
  'reset.mode': 'Quando limpar a conversa',
  'reset.atHour': 'Horário de limpeza diária',
  'reset.idleMinutes': 'Minutos de inatividade para limpar',
  'reset.resetTriggers': 'Comandos que limpam a conversa',
  'agentToAgent.maxPingPongTurns': 'Limite de trocas entre agentes',
  'sendPolicy.default_': 'Política padrão de envio',
  'store': 'Armazenamento de sessão',

  // Agents Defaults
  'thinkingDefault': 'Nível de raciocínio',
  'contextTokens': 'Limite de contexto',
  'maxConcurrent': 'Agentes simultâneos',
  'timeoutSeconds': 'Tempo limite por resposta',
  'blockStreamingDefault': 'Bloquear streaming',
  'blockStreamingChunk': 'Tamanho do bloco de streaming',
  'verboseDefault': 'Modo detalhado',
  'imageModel': 'Modelo de imagem',
  'fallbackChain': 'Modelos alternativos',
  'heartbeat.every': 'Intervalo de verificação',
  'heartbeat.model': 'Modelo da verificação',
  'heartbeat.target': 'Destino da verificação',
  'workspace': 'Pasta de trabalho',
  'repoRoot': 'Pasta do repositório',
  'skipBootstrap': 'Pular inicialização',
  'bootstrapMaxChars': 'Limite de leitura na inicialização',
  'userTimezone': 'Fuso horário',
  'timeFormat': 'Formato de hora',
  'elevatedDefault': 'Permissões elevadas',
  'mediaMaxMb': 'Tamanho máximo de mídia',
  'contextPruning.mode': 'Limpeza de contexto',
  'compaction.mode': 'Compactação de memória',
  'compaction.memoryFlushEnabled': 'Salvar memória ao compactar',
  'typingMode': 'Indicador de digitação',
  'typingIntervalSeconds': 'Intervalo do indicador',
  'humanDelay.mode': 'Simular tempo humano',
  'subagents.model': 'Modelo dos sub-agentes',
  'subagents.maxConcurrent': 'Sub-agentes simultâneos',
  'subagents.archiveAfterMinutes': 'Arquivar sub-agente após',

  // Tools
  'profile': 'Perfil de ferramentas',
  'exec.backgroundMs': 'Tempo em segundo plano',
  'exec.timeoutSec': 'Tempo máximo de execução',
  'exec.cleanupMs': 'Limpar processos após',
  'exec.applyPatchEnabled': 'Permitir aplicar patches',
  'exec.security': 'Modo de segurança',
  'exec.safeBins': 'Programas permitidos',
  'exec.ask': 'Aprovação de comandos',
  'web.searchEnabled': 'Busca na internet',
  'web.fetchEnabled': 'Acessar páginas web',
  'web.searchApiKey': 'Chave da busca web',
  'web.searchMaxResults': 'Resultados por busca',
  'web.fetchMaxChars': 'Limite de leitura de página',
  'web.fetchReadability': 'Extrair conteúdo principal',
  'media.concurrency': 'Mídias simultâneas',
  'media.imageEnabled': 'Processar imagens',
  'media.audioEnabled': 'Processar áudios',
  'media.videoEnabled': 'Processar vídeos',
  'agentToAgent.enabled': 'Comunicação entre agentes',
  'elevated.enabled': 'Permissões elevadas',
  'elevated.allowFrom': 'Permitido para',

  // Logging
  'level': 'Nível de registro',
  'consoleLevel': 'Nível no terminal',
  'consoleStyle': 'Estilo do terminal',
  'file': 'Arquivo de registro',
  'redactSensitive': 'Ocultar dados sensíveis',
  'redactPatterns': 'Padrões para ocultar',

  // Gateway
  'mode': 'Modo de conexão',
  'port': 'Porta',
  'bind': 'Aceitar conexões de',
  'auth.mode': 'Tipo de autenticação',
  'auth.token': 'Token de acesso',
  'auth.password': 'Senha',
  'auth.allowTailscale': 'Permitir Tailscale',
  'remote.url': 'URL do gateway remoto',
  'remote.token': 'Token remoto',
  'remote.tlsFingerprint': 'Impressão digital TLS',
  'trustedProxies': 'Proxies confiáveis',
  'discovery': 'Descoberta de serviço',
  'controlUi.allowInsecureAuth': 'Permitir autenticação insegura',
  'controlUi.dangerouslyDisableDeviceAuth': 'Desabilitar autenticação de dispositivo',
  'nodes.browserMode': 'Navegador integrado',

  // Commands
  'native': 'Comandos nativos',
  'text': 'Comandos de texto',
  'bash': 'Comandos do terminal',
  'config': 'Comandos de configuração',
  'debug': 'Comandos de depuração',
  'restart': 'Comando de reiniciar',
  'useAccessGroups': 'Usar grupos de acesso',

  // Plugins
  'enabled': 'Ativado',
  'allow': 'Lista de permitidos',
  'deny': 'Lista de bloqueados',
  'loadPaths': 'Caminhos de plugins',

  // Environment
  'env': 'Variáveis do sistema',
  'shellEnvEnabled': 'Carregar do terminal',
  'shellEnvTimeoutMs': 'Tempo limite de carregamento',
}

// ═══════════════════════════════════════
// TRADUÇÃO DE TOOL GROUPS
// ═══════════════════════════════════════

const toolGroupLabels: Record<string, string> = {
  'group:fs': 'Arquivos',
  'group:runtime': 'Execução',
  'group:sessions': 'Sessões',
  'group:memory': 'Memória',
  'group:web': 'Internet',
  'group:ui': 'Interface',
}

// ═══════════════════════════════════════
// FUNÇÕES DE TRADUÇÃO
// ═══════════════════════════════════════

/**
 * Traduz um valor técnico para label amigável.
 * @param value - Valor técnico (ex: 'allowlist', 'per-peer')
 * @param context - Contexto opcional para desambiguar (ex: 'tools.exec.security')
 * @returns Label traduzido ou o valor original se não houver tradução
 */
export function t(value: string, context?: string): string {
  if (context && contextOverrides[context]?.[value]) {
    return contextOverrides[context][value].label
  }
  return values[value]?.label ?? value
}

/**
 * Traduz um valor técnico e retorna a descrição.
 * @param value - Valor técnico
 * @param context - Contexto opcional
 * @returns Descrição traduzida ou undefined
 */
export function tDesc(value: string, context?: string): string | undefined {
  if (context && contextOverrides[context]?.[value]) {
    return contextOverrides[context][value].desc
  }
  return values[value]?.desc
}

/**
 * Traduz o label de um campo de configuração.
 * @param field - Chave do campo (ex: 'queue.mode', 'exec.security')
 * @returns Label traduzido ou a chave original
 */
export function tLabel(field: string): string {
  return fieldLabels[field] ?? field
}

/**
 * Gera um array de options traduzidas para um SelectField.
 * @param vals - Lista de valores técnicos
 * @param context - Contexto opcional para desambiguar
 * @returns Array de { value, label } com labels traduzidos
 */
export function tOptions(vals: string[], context?: string): { value: string; label: string }[] {
  return vals.map((v) => ({ value: v, label: t(v, context) }))
}

/**
 * Traduz um tool group.
 * @param group - Chave do grupo (ex: 'group:fs')
 * @returns Label traduzido
 */
export function tGroup(group: string): string {
  return toolGroupLabels[group] ?? group
}
