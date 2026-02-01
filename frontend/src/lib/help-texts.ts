import type { HelpContent } from '@/components/ui/help-tooltip'

export const helpTexts: Record<string, HelpContent> = {
  // ═══════════════════════════════════════
  // OPENCLAW CONFIG — Aba Mensagens
  // ═══════════════════════════════════════
  'messages.ackReaction': {
    title: 'Reação de confirmação',
    description: 'Emoji que o assistente coloca na mensagem assim que começa a processá-la, sinalizando que "entendeu".',
    example: '👀 ou ✅',
    suggestion: 'Use um emoji discreto como 👀 para não poluir a conversa',
  },
  'messages.ackReactionScope': {
    title: 'Quando reagir',
    description: 'Controla em quais situações o assistente coloca o emoji de confirmação.',
    example: '"Todas" = reage a toda mensagem, "Menções em grupo" = só quando for mencionado em grupos',
    suggestion: 'Para uso empresarial, "Menções em grupo" é ideal',
  },
  'messages.removeAckAfterReply': {
    title: 'Remover reação após responder',
    description: 'Se ativado, o assistente remove o emoji de confirmação depois de enviar a resposta final.',
    suggestion: 'Deixe ativado para manter a conversa limpa',
  },
  'messages.responsePrefix': {
    title: 'Prefixo da resposta',
    description: 'Texto que aparece no início de toda resposta do assistente. Útil para identificar que é uma resposta automática.',
    example: '🤖 ou [Bot]',
    suggestion: 'Deixe vazio para respostas mais naturais',
  },
  'messages.queue.mode': {
    title: 'Modo da fila de mensagens',
    description: 'Como o assistente lida quando várias mensagens chegam ao mesmo tempo.',
    example: '"Coletar" = junta tudo e responde uma vez. "Interromper" = para de responder e lê a nova mensagem.',
    suggestion: '"Coletar" funciona bem para a maioria dos casos',
  },
  'messages.queue.debounceMs': {
    title: 'Espera antes de processar',
    description: 'Quantos milissegundos o assistente espera antes de processar, para juntar mensagens que chegam em sequência.',
    example: '2000 = espera 2 segundos',
    suggestion: '2000ms (2 segundos) é um bom equilíbrio',
  },
  'messages.queue.cap': {
    title: 'Limite da fila',
    description: 'Número máximo de mensagens que ficam na fila esperando processamento.',
    example: '5 = máximo 5 mensagens na fila',
    suggestion: 'Entre 3 e 10 é adequado',
  },
  'messages.queue.drop': {
    title: 'O que descartar quando a fila enche',
    description: 'Quando a fila está cheia, decide quais mensagens são removidas.',
    example: '"Antigas" = remove as mais antigas. "Resumir" = condensa tudo em um resumo.',
  },
  'messages.inbound.debounceMs': {
    title: 'Espera de entrada',
    description: 'Milissegundos de espera para agrupar mensagens que chegam de um mesmo contato em sequência rápida.',
    example: '1500 = espera 1,5 segundo',
  },
  'messages.groupChat.historyLimit': {
    title: 'Histórico em grupos',
    description: 'Quantas mensagens anteriores do grupo o assistente lê para entender o contexto antes de responder.',
    example: '50 = lê as últimas 50 mensagens',
    suggestion: 'Entre 20 e 100. Valores altos gastam mais tokens de IA',
  },
  'messages.tts.auto': {
    title: 'Áudio automático',
    description: 'Quando o assistente converte respostas de texto em áudio automaticamente.',
    example: '"Sempre" = toda resposta vira áudio. "Desligado" = apenas texto.',
  },
  'messages.tts.mode': {
    title: 'O que converter em áudio',
    description: 'Quais respostas do assistente são convertidas em áudio.',
    example: '"Resposta final" = só a resposta principal. "Todas" = incluindo mensagens intermediárias.',
  },
  'messages.tts.provider': {
    title: 'Serviço de voz',
    description: 'Qual empresa processa a conversão de texto em áudio. Cada uma tem vozes e qualidade diferentes.',
    suggestion: 'ElevenLabs tem vozes mais naturais. OpenAI é mais rápido.',
  },
  'messages.tts.voice': {
    title: 'Voz do assistente',
    description: 'Nome da voz utilizada na conversão de texto em áudio. Depende do serviço escolhido.',
    example: 'Para ElevenLabs: "Rachel". Para OpenAI: "alloy" ou "nova".',
  },
  'messages.tts.maxTextLength': {
    title: 'Limite de texto para áudio',
    description: 'Respostas maiores que esse número de caracteres não serão convertidas em áudio, pois ficariam longas demais.',
    example: '500 = respostas com mais de 500 caracteres ficam só em texto',
    suggestion: '500 caracteres é um bom limite',
  },
  'messages.tts.summaryModel': {
    title: 'Modelo para resumir antes do áudio',
    description: 'Quando a resposta é muito longa para áudio, o assistente pode resumi-la usando esse modelo de IA antes de converter.',
    example: 'openai/gpt-4o-mini',
  },

  // ═══════════════════════════════════════
  // OPENCLAW CONFIG — Aba Sessions
  // ═══════════════════════════════════════
  'sessions.scope': {
    title: 'Tipo de conversa',
    description: 'Define como o assistente organiza as conversas. "Principal" = uma conversa só para todos. "Por par" = uma conversa separada para cada contato.',
    example: '"Por par" = cada pessoa tem seu próprio histórico com o assistente',
    suggestion: '"Por par" é o mais comum para atendimento',
  },
  'sessions.dmScope': {
    title: 'Tipo de conversa em mensagens diretas',
    description: 'Mesmo que o tipo de conversa, mas aplicado apenas a mensagens privadas (DM). Se vazio, usa o mesmo do geral.',
  },
  'sessions.mainKey': {
    title: 'Nome da conversa principal',
    description: 'Identificador interno da conversa principal. Normalmente não precisa alterar.',
    example: 'main',
    suggestion: 'Mantenha como "main" a não ser que tenha motivo específico',
  },
  'sessions.store': {
    title: 'Local de armazenamento',
    description: 'Pasta onde as conversas são salvas no disco. Deixe vazio para usar o padrão.',
    suggestion: 'Só altere se precisar salvar em disco externo ou local específico',
  },
  'sessions.reset.mode': {
    title: 'Quando limpar conversa',
    description: 'Define quando o assistente esquece a conversa anterior e começa uma nova.',
    example: '"Diário" = toda manhã começa zerado. "Por inatividade" = limpa após ficar sem conversar.',
  },
  'sessions.reset.atHour': {
    title: 'Hora do reset diário',
    description: 'Se o modo de reset é "Diário", em qual hora do dia a conversa é limpa (0 = meia-noite, 12 = meio-dia).',
    example: '6 = limpa às 6h da manhã',
  },
  'sessions.reset.idleMinutes': {
    title: 'Minutos de inatividade',
    description: 'Se o modo é "Por inatividade", após quantos minutos sem mensagens a conversa é limpa.',
    example: '60 = limpa após 1 hora sem conversar',
    suggestion: '60 minutos é um bom padrão',
  },
  'sessions.reset.dm.idleMinutes': {
    title: 'Inatividade em mensagens privadas',
    description: 'Minutos de inatividade para limpar conversas privadas (DM).',
  },
  'sessions.reset.group.idleMinutes': {
    title: 'Inatividade em grupos',
    description: 'Minutos de inatividade para limpar conversas de grupo.',
  },
  'sessions.reset.thread.idleMinutes': {
    title: 'Inatividade em threads',
    description: 'Minutos de inatividade para limpar threads (tópicos) de conversa.',
  },
  'sessions.agentToAgent.enabled': {
    title: 'Comunicação entre assistentes',
    description: 'Permite que dois assistentes conversem entre si. Útil quando você tem múltiplos agentes especializados.',
  },
  'sessions.agentToAgent.maxPingPongTurns': {
    title: 'Limite de idas e vindas',
    description: 'Quantas vezes dois assistentes podem trocar mensagens entre si antes de parar. Evita loops infinitos.',
    example: '5 = máximo 5 trocas',
    suggestion: '3 a 5 é seguro',
  },
  'sessions.sendPolicy.default': {
    title: 'Política de envio padrão',
    description: 'Define se, por padrão, o assistente pode enviar mensagens para outros assistentes. "Permitir" = pode. "Negar" = não pode.',
  },
  'sessions.sendPolicy.rules': {
    title: 'Regras de roteamento',
    description: 'Regras avançadas que definem quais assistentes podem conversar com quais. Formato avançado.',
    suggestion: 'Só configure se tiver múltiplos assistentes com regras específicas',
  },

  // ═══════════════════════════════════════
  // OPENCLAW CONFIG — Aba IA
  // ═══════════════════════════════════════
  'ia.thinkingDefault': {
    title: 'Nível de raciocínio',
    description: 'Quanto o assistente pensa antes de responder. Níveis mais altos geram respostas mais elaboradas, mas mais lentas e caras.',
    example: '"Médio" = bom equilíbrio. "Muito alto" = resposta detalhada mas mais lenta.',
    suggestion: '"Médio" para uso geral, "Alto" para tarefas complexas',
  },
  'ia.maxConcurrent': {
    title: 'Conversas simultâneas',
    description: 'Quantas conversas o assistente processa ao mesmo tempo. Cada conversa adicional usa mais recursos.',
    example: '3 = atende 3 pessoas ao mesmo tempo',
    suggestion: 'Entre 1 e 5 dependendo do plano de IA contratado',
  },
  'ia.timeoutSeconds': {
    title: 'Tempo máximo de resposta',
    description: 'Segundos que o assistente tem para gerar uma resposta. Se passar desse tempo, a resposta é cancelada.',
    example: '120 = 2 minutos',
    suggestion: '120 segundos para respostas normais, 300 para tarefas complexas',
  },
  'ia.contextTokens': {
    title: 'Tamanho do contexto',
    description: 'Quantos "tokens" (pedaços de texto) o assistente consegue lembrar da conversa. Quanto maior, mais contexto ele tem, mas mais caro fica.',
    example: '128000 = ~96.000 palavras de contexto',
    suggestion: 'Depende do modelo. GPT-4o suporta até 128k, Claude até 200k',
  },
  'ia.blockStreamingChunk': {
    title: 'Tamanho de envio parcial',
    description: 'Quando o assistente envia a resposta em partes, esse é o tamanho de cada pedaço enviado.',
    suggestion: 'Deixe o padrão a menos que tenha problemas de velocidade',
  },
  'ia.imageModel': {
    title: 'Modelo de geração de imagens',
    description: 'Qual modelo de IA é usado quando o assistente precisa criar ou analisar imagens.',
    example: 'openai/dall-e-3 ou openai/gpt-4o',
  },
  'ia.blockStreaming': {
    title: 'Bloquear respostas parciais',
    description: 'Se ativado, o assistente só envia a resposta completa. Se desativado, envia em partes conforme vai gerando.',
    suggestion: 'Desativado é melhor para UX — o usuário vê a resposta sendo montada',
  },
  'ia.verboseDefault': {
    title: 'Respostas detalhadas',
    description: 'Se ativado, o assistente dá respostas mais longas e detalhadas por padrão.',
    suggestion: 'Desativado para atendimento rápido. Ativado para consultoria.',
  },
  'ia.heartbeat.every': {
    title: 'Frequência do heartbeat',
    description: 'De quanto em quanto tempo o assistente executa uma tarefa de rotina automática (heartbeat). Usa formato cron.',
    example: '"0 */6 * * *" = a cada 6 horas',
    suggestion: 'A cada 6-12 horas é suficiente para a maioria dos usos',
  },
  'ia.heartbeat.model': {
    title: 'Modelo do heartbeat',
    description: 'Qual modelo de IA é usado nas tarefas automáticas de rotina. Pode ser um modelo mais barato.',
    example: 'openai/gpt-4o-mini',
    suggestion: 'Use um modelo barato como gpt-4o-mini para economizar',
  },
  'ia.heartbeat.target': {
    title: 'Destino do heartbeat',
    description: 'Para onde o resultado da tarefa automática é enviado.',
    example: 'channel ou log',
  },
  'ia.fallbackChain': {
    title: 'Modelos reserva',
    description: 'Lista de modelos de IA que são usados caso o modelo principal falhe ou esteja indisponível.',
    example: 'Se o Claude falhar, usa GPT-4o. Se GPT-4o falhar, usa Gemini.',
    suggestion: 'Configure pelo menos 1 modelo reserva para evitar quedas',
  },
  'ia.workspace': {
    title: 'Pasta de trabalho',
    description: 'Onde o assistente salva arquivos que ele cria ou edita durante conversas.',
    example: '~/.openclaw/workspace',
    suggestion: 'Deixe o padrão a menos que precise de pasta específica',
  },
  'ia.repoRoot': {
    title: 'Raiz do repositório',
    description: 'Pasta principal de código que o assistente deve conhecer, se ele trabalha com programação.',
    example: '/home/user/meu-projeto',
  },
  'ia.bootstrapMaxChars': {
    title: 'Tamanho da inicialização',
    description: 'Quantidade máxima de caracteres lidos na inicialização do assistente para entender o contexto.',
    example: '20000 = lê até 20 mil caracteres',
    suggestion: '20000 é suficiente para a maioria dos projetos',
  },
  'ia.userTimezone': {
    title: 'Fuso horário',
    description: 'Fuso horário do usuário para que o assistente saiba a hora local correta.',
    example: 'America/Sao_Paulo',
    suggestion: 'Use "America/Sao_Paulo" para horário de Brasília',
  },
  'ia.timeFormat': {
    title: 'Formato de hora',
    description: 'Como o assistente mostra horários nas respostas.',
    example: '"12 horas" = 2:30 PM. "24 horas" = 14:30.',
    suggestion: '"24 horas" é padrão no Brasil',
  },
  'ia.mediaMaxMb': {
    title: 'Tamanho máximo de mídia',
    description: 'Limite em megabytes para arquivos de mídia (fotos, áudio, vídeo) que o assistente aceita processar.',
    example: '5 = máximo 5MB por arquivo',
    suggestion: '5MB para fotos, aumente para 20MB se precisa de vídeos',
  },
  'ia.skipBootstrap': {
    title: 'Pular inicialização',
    description: 'Se ativado, o assistente não lê arquivos de contexto ao iniciar. Inicia mais rápido mas com menos contexto.',
    suggestion: 'Mantenha desativado para melhor desempenho do assistente',
  },
  'ia.elevatedDefault': {
    title: 'Permissões elevadas',
    description: 'Se ativado, o assistente tem permissões avançadas por padrão, podendo executar mais ações no sistema.',
    suggestion: 'Mantenha desligado por segurança. Ligue apenas se necessário.',
  },
  'ia.contextPruning': {
    title: 'Limpeza de contexto',
    description: 'Como o assistente gerencia memória quando a conversa fica muito longa.',
    example: '"Adaptativo" = remove automaticamente partes menos relevantes. "Agressivo" = remove mais para economizar tokens.',
    suggestion: '"Adaptativo" é ideal para maioria dos usos',
  },
  'ia.compaction': {
    title: 'Compactação de conversa',
    description: 'Quando a conversa fica muito longa, o assistente pode compactá-la (resumir) para continuar funcionando.',
    example: '"Padrão" = compacta normalmente. "Safeguard" = mantém mais informações importantes.',
  },
  'ia.memoryFlush': {
    title: 'Limpeza de memória',
    description: 'Se ativado, quando a conversa é compactada, informações antigas são salvas em memória de longo prazo.',
    suggestion: 'Mantenha ativado para não perder informações importantes',
  },
  'ia.typingMode': {
    title: 'Indicador de digitação',
    description: 'Quando mostrar o "digitando..." no chat enquanto o assistente prepara a resposta.',
    example: '"Pensando" = mostra enquanto raciocina. "Nunca" = não mostra nada.',
    suggestion: '"Pensando" dá melhor experiência ao usuário',
  },
  'ia.typingInterval': {
    title: 'Frequência do "digitando..."',
    description: 'De quantos em quantos segundos o assistente atualiza o indicador de "digitando...".',
    example: '6 = atualiza a cada 6 segundos',
  },
  'ia.humanDelay': {
    title: 'Atraso humano',
    description: 'Simula o tempo que um humano levaria para digitar, tornando as respostas mais naturais.',
    example: '"Natural" = atraso variável. "Desligado" = responde instantaneamente.',
    suggestion: '"Natural" para atendimento ao cliente, "Desligado" para produtividade',
  },
  'ia.subagents.model': {
    title: 'Modelo dos sub-agentes',
    description: 'Qual modelo de IA os assistentes auxiliares usam. Pode ser diferente (e mais barato) que o principal.',
    example: 'openai/gpt-4o-mini',
    suggestion: 'Use um modelo mais barato para economizar',
  },
  'ia.subagents.maxConcurrent': {
    title: 'Sub-agentes simultâneos',
    description: 'Quantos assistentes auxiliares podem trabalhar ao mesmo tempo em tarefas diferentes.',
    example: '1 = um de cada vez. 3 = três ao mesmo tempo.',
    suggestion: '1 para começar, aumente conforme necessidade',
  },
  'ia.subagents.archiveAfterMinutes': {
    title: 'Tempo para arquivar sub-agente',
    description: 'Após quantos minutos sem uso, um assistente auxiliar é arquivado para liberar recursos.',
    example: '60 = arquiva após 1 hora',
  },

  // ═══════════════════════════════════════
  // OPENCLAW CONFIG — Aba Tools
  // ═══════════════════════════════════════
  'tools.profile': {
    title: 'Perfil de ferramentas',
    description: 'Conjunto pré-definido de ferramentas disponíveis para o assistente.',
    example: '"Minimal" = só o básico. "Full" = todas as ferramentas disponíveis.',
    suggestion: '"Full" para uso geral. "Minimal" se quiser limitar capacidades.',
  },
  'tools.allow': {
    title: 'Ferramentas permitidas',
    description: 'Lista de grupos de ferramentas que o assistente pode usar. Selecione os que fazem sentido para seu uso.',
    example: '"Filesystem" = ler/escrever arquivos. "Web" = acessar internet.',
  },
  'tools.deny': {
    title: 'Ferramentas bloqueadas',
    description: 'Lista de grupos de ferramentas que o assistente NÃO pode usar, mesmo que estejam no perfil.',
  },
  'tools.exec.backgroundMs': {
    title: 'Tempo máximo em segundo plano',
    description: 'Milissegundos que uma tarefa pode rodar em segundo plano antes de ser cancelada.',
    example: '10000 = 10 segundos',
  },
  'tools.exec.timeoutSec': {
    title: 'Tempo máximo de execução',
    description: 'Segundos que uma tarefa pode rodar no total antes de ser cancelada.',
    example: '1800 = 30 minutos',
  },
  'tools.exec.cleanupMs': {
    title: 'Tempo para limpar processos',
    description: 'Milissegundos após os quais processos terminados são removidos da memória.',
    example: '1800000 = 30 minutos',
  },
  'tools.exec.applyPatch': {
    title: 'Aplicar patches',
    description: 'Se ativado, o assistente pode aplicar correções automáticas em código.',
    suggestion: 'Ative apenas se o assistente trabalha com programação',
  },
  'tools.web.search': {
    title: 'Busca na web',
    description: 'Permite que o assistente pesquise na internet para responder perguntas com informações atualizadas.',
    suggestion: 'Ative para assistentes que precisam de informações em tempo real',
  },
  'tools.web.fetch': {
    title: 'Acessar páginas da web',
    description: 'Permite que o assistente abra e leia páginas da internet.',
  },
  'tools.web.readability': {
    title: 'Modo leitura',
    description: 'Se ativado, ao acessar páginas web, remove propagandas e formatação, mantendo apenas o texto útil.',
    suggestion: 'Mantenha ativado para resultados mais limpos',
  },
  'tools.web.search.apiKey': {
    title: 'Chave da busca web',
    description: 'Chave de API do serviço de busca (ex: Brave Search). Necessária para o assistente pesquisar na internet.',
    suggestion: 'Obtenha uma chave gratuita em brave.com/search/api',
  },
  'tools.web.search.maxResults': {
    title: 'Resultados por busca',
    description: 'Quantos resultados de busca o assistente analisa para responder.',
    example: '5 = analisa os 5 primeiros resultados',
    suggestion: '5 é suficiente para a maioria das consultas',
  },
  'tools.web.fetch.maxChars': {
    title: 'Limite de leitura de página',
    description: 'Máximo de caracteres que o assistente lê de cada página da web.',
    example: '50000 = lê até 50 mil caracteres (~12 páginas A4)',
  },
  'tools.media.concurrency': {
    title: 'Mídias simultâneas',
    description: 'Quantos arquivos de mídia (fotos, áudios) o assistente processa ao mesmo tempo.',
    example: '2 = processa 2 arquivos ao mesmo tempo',
  },
  'tools.media.image': {
    title: 'Processar imagens',
    description: 'Se ativado, o assistente consegue receber, analisar e responder sobre imagens.',
  },
  'tools.media.audio': {
    title: 'Processar áudio',
    description: 'Se ativado, o assistente consegue receber e transcrever mensagens de áudio.',
  },
  'tools.media.video': {
    title: 'Processar vídeo',
    description: 'Se ativado, o assistente consegue receber e analisar vídeos.',
  },
  'tools.agentToAgent': {
    title: 'Comunicação entre assistentes',
    description: 'Permite que este assistente converse com outros assistentes para colaborar em tarefas.',
  },
  'tools.agentToAgent.allow': {
    title: 'Assistentes permitidos',
    description: 'Lista de assistentes com quem este pode se comunicar.',
    example: 'ID do assistente financeiro, ID do assistente de vendas',
  },
  'tools.elevated': {
    title: 'Ferramentas elevadas',
    description: 'Se ativado, permite ao assistente usar ferramentas com permissões avançadas do sistema.',
    suggestion: 'Mantenha desativado por segurança. Ative apenas quando necessário.',
  },
  'tools.elevated.allowFrom': {
    title: 'Quem pode usar ferramentas elevadas',
    description: 'Lista de contatos que podem solicitar ações avançadas ao assistente.',
    example: 'Número do administrador: 5511999999999',
  },
  'tools.byProvider': {
    title: 'Políticas por provedor',
    description: 'Configurações avançadas de ferramentas específicas para cada provedor de IA.',
    suggestion: 'Só altere se precisar de comportamentos diferentes por provedor',
  },
  'tools.sandbox': {
    title: 'Ferramentas do sandbox',
    description: 'Ferramentas disponíveis quando o assistente roda em ambiente isolado (sandbox).',
  },
  'tools.subagents': {
    title: 'Ferramentas dos sub-agentes',
    description: 'Ferramentas disponíveis para assistentes auxiliares.',
  },

  // ═══════════════════════════════════════
  // OPENCLAW CONFIG — Aba Logging
  // ═══════════════════════════════════════
  'logging.level': {
    title: 'Nível de registro',
    description: 'Quantidade de informações registradas nos logs do sistema. Mais detalhado = mais informações para diagnóstico.',
    example: '"Info" = eventos normais. "Debug" = tudo (muito detalhado).',
    suggestion: '"Info" para produção, "Debug" para investigar problemas',
  },
  'logging.consoleLevel': {
    title: 'Nível do console',
    description: 'Nível de detalhe dos logs mostrados no terminal. Se vazio, usa o mesmo nível geral.',
  },
  'logging.consoleStyle': {
    title: 'Formato do console',
    description: 'Como os logs aparecem no terminal.',
    example: '"Pretty" = colorido e legível. "Compact" = resumido. "JSON" = formato técnico.',
    suggestion: '"Pretty" para leitura humana, "JSON" para processamento automático',
  },
  'logging.redactSensitive': {
    title: 'Ocultar dados sensíveis',
    description: 'Se ativado, senhas, chaves e dados pessoais são mascarados nos logs.',
    suggestion: 'Mantenha ativado por segurança. Desative temporariamente apenas para debug.',
  },
  'logging.file': {
    title: 'Arquivo de log',
    description: 'Caminho do arquivo onde os logs são salvos. Vazio = não salva em arquivo.',
    example: '/var/log/openclaw.log',
  },
  'logging.redactPatterns': {
    title: 'Padrões de ocultação',
    description: 'Lista de padrões de texto que devem ser mascarados nos logs. Útil para ocultar dados específicos.',
    example: 'CPF, números de cartão, tokens',
  },

  // ═══════════════════════════════════════
  // OPENCLAW CONFIG — Aba Gateway
  // ═══════════════════════════════════════
  'gateway.mode': {
    title: 'Modo de operação',
    description: 'Como o gateway (ponte de comunicação) funciona.',
    example: '"Local" = roda neste servidor. "Remoto" = conecta a outro servidor. "Híbrido" = ambos.',
    suggestion: '"Local" para a maioria das instalações',
  },
  'gateway.port': {
    title: 'Porta de comunicação',
    description: 'Número da porta que o gateway usa para receber conexões.',
    example: '3000',
    suggestion: 'Escolha uma porta livre entre 3000 e 9000',
  },
  'gateway.bind': {
    title: 'Endereço de escuta',
    description: 'De onde o gateway aceita conexões.',
    example: '"Loopback" = só deste servidor. "Todas" = de qualquer lugar.',
    suggestion: '"Loopback" é mais seguro para uso local',
  },
  'gateway.auth.mode': {
    title: 'Tipo de autenticação',
    description: 'Como dispositivos se autenticam para se conectar ao gateway.',
    example: '"Token" = usa um código secreto. "Senha" = usa usuário e senha.',
  },
  'gateway.auth.token': {
    title: 'Token de acesso',
    description: 'Código secreto que dispositivos usam para se conectar ao gateway.',
    suggestion: 'Use um token longo e aleatório. Nunca compartilhe publicamente.',
  },
  'gateway.remote.url': {
    title: 'URL do gateway remoto',
    description: 'Endereço do gateway remoto ao qual este se conecta.',
    example: 'https://gateway.exemplo.com.br',
  },
  'gateway.remote.token': {
    title: 'Token do gateway remoto',
    description: 'Código de autenticação para conectar ao gateway remoto.',
  },
  'gateway.remote.tlsFingerprint': {
    title: 'Impressão digital TLS',
    description: 'Verificação de segurança da conexão com o gateway remoto. Garante que está conectando ao servidor correto.',
  },
  'gateway.auth.password': {
    title: 'Senha do gateway',
    description: 'Senha de acesso ao painel de controle do gateway.',
    suggestion: 'Use uma senha forte com letras, números e símbolos',
  },
  'gateway.auth.allowTailscale': {
    title: 'Permitir Tailscale',
    description: 'Se ativado, dispositivos conectados via Tailscale (rede privada) podem acessar o gateway sem senha.',
  },
  'gateway.controlUi.allowInsecureAuth': {
    title: 'Permitir acesso sem HTTPS',
    description: 'Se ativado, permite acessar o painel do gateway sem conexão segura (HTTPS). Menos seguro.',
    suggestion: 'Mantenha desativado em produção',
  },
  'gateway.controlUi.dangerouslyDisableDeviceAuth': {
    title: 'Desativar autenticação de dispositivos',
    description: 'Se ativado, qualquer dispositivo pode se conectar sem autenticação. Muito inseguro.',
    suggestion: 'NUNCA ative em produção. Apenas para testes.',
  },
  'gateway.discovery': {
    title: 'Descoberta automática',
    description: 'Permite que dispositivos na mesma rede encontrem o gateway automaticamente.',
    example: '"Full" = descoberta completa. "Minimal" = básica. "Desligado" = manual.',
  },
  'gateway.nodes.browser.mode': {
    title: 'Navegador integrado',
    description: 'Se o gateway gerencia um navegador para o assistente acessar páginas web.',
    example: '"Gerenciado" = o gateway controla o navegador. "Desligado" = sem navegador.',
  },
  'gateway.trustedProxies': {
    title: 'Proxies confiáveis',
    description: 'Lista de servidores intermediários confiáveis. Necessário quando o gateway está atrás de um balanceador de carga.',
    suggestion: 'Só configure se usar Cloudflare, Nginx ou similar na frente',
  },

  // ═══════════════════════════════════════
  // OPENCLAW CONFIG — Aba Commands
  // ═══════════════════════════════════════
  'commands.native': {
    title: 'Comandos nativos',
    description: 'Controla se os comandos internos do assistente (como /help, /status) ficam disponíveis.',
    example: '"Automático" = ativados por padrão. "Desligado" = desativados.',
    suggestion: '"Automático" para a maioria dos casos',
  },
  'commands.useAccessGroups': {
    title: 'Usar grupos de acesso',
    description: 'Se ativado, os comandos respeitam permissões por grupo de acesso. Útil para restringir quem pode usar cada comando.',
    suggestion: 'Ative se tem múltiplos usuários com permissões diferentes',
  },
  'commands.text': {
    title: 'Comando /text',
    description: 'Permite usar o comando /text para enviar mensagens de texto formatadas.',
  },
  'commands.bash': {
    title: 'Comando /bash',
    description: 'Permite usar o comando /bash para executar comandos do sistema. Use com cuidado!',
    suggestion: 'Desative por segurança. Ative apenas para administradores.',
  },
  'commands.config': {
    title: 'Comando /config',
    description: 'Permite usar o comando /config para alterar configurações via chat.',
    suggestion: 'Ative para administradores que querem configurar pelo chat',
  },
  'commands.debug': {
    title: 'Comando /debug',
    description: 'Permite usar o comando /debug para ver informações técnicas de diagnóstico.',
    suggestion: 'Útil para resolver problemas. Desative para usuários finais.',
  },
  'commands.restart': {
    title: 'Comando /restart',
    description: 'Permite usar o comando /restart para reiniciar o assistente pelo chat.',
    suggestion: 'Ative para administradores. Desative para usuários comuns.',
  },

  // ═══════════════════════════════════════
  // OPENCLAW CONFIG — Aba Plugins
  // ═══════════════════════════════════════
  'plugins.enabled': {
    title: 'Plugins habilitados',
    description: 'Liga ou desliga o sistema de plugins do assistente. Plugins adicionam funcionalidades extras.',
  },
  'plugins.allow': {
    title: 'Plugins permitidos',
    description: 'Lista de plugins que podem ser carregados. Se vazia, todos são permitidos (exceto os bloqueados).',
    example: 'weather, calendar, gmail',
  },
  'plugins.deny': {
    title: 'Plugins bloqueados',
    description: 'Lista de plugins que nunca devem ser carregados, mesmo que estejam instalados.',
  },
  'plugins.load.paths': {
    title: 'Pastas de plugins',
    description: 'Pastas adicionais onde o assistente procura por plugins para carregar.',
    example: '/home/user/meus-plugins',
  },

  // ═══════════════════════════════════════
  // OPENCLAW CONFIG — Aba Environment
  // ═══════════════════════════════════════
  'env.vars': {
    title: 'Variáveis do sistema',
    description: 'Valores configuráveis que o assistente e seus plugins podem usar. Formato chave=valor.',
    example: 'OPENAI_API_KEY=sk-... ou EMPRESA_NOME=MinhaEmpresa',
    suggestion: 'Use para chaves de API, configurações de plugins e valores personalizados',
  },
  'env.shellEnv': {
    title: 'Variáveis do shell',
    description: 'Se ativado, o assistente herda variáveis de ambiente do sistema operacional.',
  },
  'env.shellEnv.timeoutMs': {
    title: 'Tempo para carregar variáveis',
    description: 'Milissegundos que o sistema espera para carregar as variáveis do shell.',
    example: '15000 = 15 segundos',
  },

  // ═══════════════════════════════════════
  // CHANNELS — Campos comuns
  // ═══════════════════════════════════════
  'channels.dmPolicy': {
    title: 'Política de acesso',
    description: 'Quem pode conversar diretamente com o assistente por mensagem privada.',
    example: '"Aberto" = qualquer pessoa. "Lista de permitidos" = só contatos autorizados. "Desativado" = ninguém.',
    suggestion: '"Lista de permitidos" para mais segurança',
  },
  'channels.allowFrom': {
    title: 'Contatos autorizados',
    description: 'Lista de números/contatos que podem conversar com o assistente em mensagens privadas.',
    example: '5511999999999',
  },
  'channels.denyFrom': {
    title: 'Contatos bloqueados',
    description: 'Lista de números/contatos que estão bloqueados e NÃO podem conversar com o assistente.',
    example: '5511888888888',
  },
  'channels.groupAllowFrom': {
    title: 'Grupos autorizados',
    description: 'Lista de grupos em que o assistente pode participar e responder mensagens.',
    example: 'ID do grupo do WhatsApp',
  },
  'channels.chunkMode': {
    title: 'Modo de divisão de mensagens',
    description: 'Como mensagens longas são divididas ao enviar.',
    example: '"Por tamanho" = corta no limite de caracteres. "Por parágrafo" = corta em quebras de linha.',
  },
  'channels.streamMode': {
    title: 'Envio em tempo real',
    description: 'Se o assistente envia a resposta conforme vai gerando ou espera terminar.',
    example: '"Parcial" = envia em partes. "Bloco" = envia tudo de uma vez.',
  },
  'channels.replyToMode': {
    title: 'Modo de resposta',
    description: 'Como o assistente responde em conversas com múltiplas mensagens.',
    example: '"Primeira" = responde à primeira mensagem. "Todas" = responde a cada uma.',
  },
  'channels.linkPreview': {
    title: 'Pré-visualização de links',
    description: 'Se ativado, o assistente gera pré-visualização quando envia links.',
  },
  'channels.allowBots': {
    title: 'Permitir outros bots',
    description: 'Se ativado, o assistente responde a mensagens enviadas por outros bots/assistentes.',
    suggestion: 'Desative para evitar loops infinitos entre bots',
  },

  // ═══════════════════════════════════════
  // AGENTS — Campos
  // ═══════════════════════════════════════
  'agents.name': {
    title: 'Nome do assistente',
    description: 'Nome de identificação do assistente. Aparece em logs e no painel.',
    example: 'Atendente, Financeiro, Suporte',
  },
  'agents.systemPrompt': {
    title: 'Personalidade e instruções',
    description: 'Texto que define como o assistente se comporta, qual sua personalidade e quais são suas regras.',
    example: '"Você é um assistente de vendas da empresa X. Seja educado e objetivo."',
    suggestion: 'Seja específico sobre o que o assistente deve e não deve fazer',
  },
  'agents.theme': {
    title: 'Tom de voz',
    description: 'Descrição livre do estilo de comunicação do assistente.',
    example: '"Profissional e amigável" ou "Técnico e direto"',
  },
  'agents.emoji': {
    title: 'Emoji do assistente',
    description: 'Emoji que representa o assistente visualmente no painel e em notificações.',
    example: '🤖 ou 🧑‍💼 ou 🎯',
  },
  'agents.avatar': {
    title: 'Foto do assistente',
    description: 'URL de uma imagem que representa o assistente.',
  },
  'agents.mentionPatterns': {
    title: 'Nomes que ativam o assistente',
    description: 'Palavras ou nomes que, quando mencionados em grupos, fazem o assistente responder.',
    example: '"@bot", "assistente", "ajuda"',
    suggestion: 'Use o nome do assistente e variações comuns',
  },
  'agents.docker.image': {
    title: 'Imagem do ambiente isolado',
    description: 'Qual ambiente protegido o assistente usa para executar código e tarefas.',
    suggestion: 'Deixe o padrão a menos que precise de um ambiente customizado',
  },
  'agents.docker.network': {
    title: 'Rede do ambiente isolado',
    description: 'Se o ambiente isolado tem acesso à internet.',
    example: '"Nenhuma" = sem internet. "Bridge" = com internet.',
  },

  // ═══════════════════════════════════════
  // AUTOMATIONS — Cron
  // ═══════════════════════════════════════
  'cron.name': {
    title: 'Nome da automação',
    description: 'Nome descritivo para identificar a automação no painel.',
    example: '"Relatório diário", "Limpeza semanal"',
  },
  'cron.schedule': {
    title: 'Agenda de execução',
    description: 'Quando a automação roda. Usa formato de agendamento (cron).',
    example: '"0 9 * * *" = todo dia às 9h. "0 */6 * * *" = a cada 6 horas.',
    suggestion: 'Use uma ferramenta online de "cron expression" para montar a agenda',
  },
  'cron.command': {
    title: 'O que fazer',
    description: 'Instrução em texto que o assistente executa quando a automação dispara.',
    example: '"Gere um relatório de vendas do dia" ou "Verifique se há emails pendentes"',
  },
  'cron.thinking': {
    title: 'Nível de raciocínio',
    description: 'Quanto o assistente pensa ao executar esta automação. Níveis mais altos são melhores para tarefas complexas.',
    example: '"Alto" para relatórios. "Baixo" para tarefas simples.',
  },
  'cron.wakeMode': {
    title: 'Quando começar',
    description: 'Se a automação executa imediatamente ao ser criada ou aguarda o próximo horário agendado.',
    example: '"Agora" = executa imediatamente. "Próximo ciclo" = espera o horário.',
  },
  'cron.agentId': {
    title: 'Qual assistente executa',
    description: 'Se você tem múltiplos assistentes, escolha qual deles executa esta automação.',
  },
  'cron.deleteAfterRun': {
    title: 'Excluir após executar',
    description: 'Se ativado, a automação é removida após executar uma vez. Útil para tarefas pontuais.',
  },

  // ═══════════════════════════════════════
  // SETUP — Wizard
  // ═══════════════════════════════════════
  'setup.environment': {
    title: 'Preparação do Ambiente',
    description: 'Verifica se o servidor está pronto e instala o Clawdbot.',
  },
  'setup.gateway': {
    title: 'Gateway',
    description: 'Configura a ponte de comunicação entre o assistente e os canais (WhatsApp, Telegram, etc).',
  },
  'setup.providers': {
    title: 'Provedores de IA',
    description: 'Cadastra as chaves de acesso aos serviços de inteligência artificial (OpenAI, Anthropic, etc).',
    suggestion: 'Você precisa de pelo menos um provedor configurado com chave de API válida.',
  },
  'setup.channels': {
    title: 'Canais de Comunicação',
    description: 'Conecta os canais por onde as pessoas vão conversar com o assistente (WhatsApp, Telegram, etc).',
  },
  'setup.agent': {
    title: 'Agente Padrão',
    description: 'Escolhe o modelo de IA que o assistente vai usar e configura seu comportamento inicial.',
  },
  'setup.validation': {
    title: 'Validação Final',
    description: 'Verifica se tudo está configurado corretamente antes de ativar o assistente.',
  },
  'setup.primaryModel': {
    title: 'Modelo Principal',
    description: 'O modelo de IA que o assistente usa para responder mensagens. Este é o "cérebro" do assistente.',
    suggestion: 'Claude Sonnet 4 ou GPT-4o são boas opções para uso geral.',
  },
  'setup.fallbackModel': {
    title: 'Modelo Reserva',
    description: 'Modelo de IA usado quando o principal estiver indisponível. Garante que o assistente nunca pare de funcionar.',
    suggestion: 'Escolha um modelo de outro provedor para ter redundância.',
  },

  // ═══════════════════════════════════════
  // NODES / DEVICES
  // ═══════════════════════════════════════
  'nodes.type': {
    title: 'Tipo de dispositivo',
    description: 'Qual tipo de aparelho está conectado ao assistente.',
  },
  'nodes.status': {
    title: 'Status da conexão',
    description: 'Se o dispositivo está conectado e funcionando.',
  },
  'nodes.lastSeen': {
    title: 'Última atividade',
    description: 'Quando o dispositivo se comunicou pela última vez com o assistente.',
  },
  'nodes.capabilities': {
    title: 'Funcionalidades',
    description: 'O que o dispositivo é capaz de fazer (enviar mensagens, receber áudio, etc).',
  },

  // ═══════════════════════════════════════
  // SERVICES
  // ═══════════════════════════════════════
  'services.status': {
    title: 'Status do serviço',
    description: 'Se o serviço está funcionando, parado ou com algum problema.',
  },
  'services.enabled': {
    title: 'Início automático',
    description: 'Se ativado, o serviço inicia automaticamente quando o servidor liga.',
  },
  'services.uptime': {
    title: 'Tempo ativo',
    description: 'Há quanto tempo o serviço está funcionando sem interrupção.',
  },
  'services.memory': {
    title: 'Memória usada',
    description: 'Quantidade de memória RAM que o serviço está consumindo.',
  },

  // ═══════════════════════════════════════
  // CONNECTIONS — Providers
  // ═══════════════════════════════════════
  'connections.provider.type': {
    title: 'Tipo de provedor',
    description: 'Qual serviço de IA este provedor utiliza.',
    example: 'OpenAI (GPT), Anthropic (Claude), OpenRouter (múltiplos modelos)',
  },
  'connections.provider.apiKey': {
    title: 'Chave de API',
    description: 'Código de acesso ao serviço de IA. Obtido no painel do provedor.',
    suggestion: 'Nunca compartilhe sua chave de API. Ela é como uma senha.',
  },
  'connections.provider.baseUrl': {
    title: 'URL personalizada',
    description: 'Endereço alternativo do serviço. Deixe vazio para usar o padrão.',
    suggestion: 'Só altere se usar um proxy ou endpoint customizado',
  },
  'connections.provider.isDefault': {
    title: 'Provedor padrão',
    description: 'Se ativado, este provedor é usado quando nenhum outro é especificado.',
  },
  'connections.provider.priority': {
    title: 'Prioridade',
    description: 'Ordem de preferência entre provedores. Menor número = maior prioridade.',
    example: '0 = primeira escolha, 1 = segunda escolha',
  },

  // ═══════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════
  'security.users.role': {
    title: 'Perfil do usuário',
    description: 'Nível de permissão do usuário no painel.',
    example: '"Admin" = acesso total. "Operador" = opera e monitora. "Auditor" = só visualiza.',
  },
  'security.users.twoFactor': {
    title: 'Autenticação em duas etapas',
    description: 'Camada extra de segurança. Além da senha, exige um código do celular para entrar.',
    suggestion: 'Recomendado para todos os administradores',
  },
}
