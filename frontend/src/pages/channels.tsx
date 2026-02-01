import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { FieldHelp } from '@/components/ui/help-tooltip'
import {
  Plus,
  Loader2,
  MessageCircle,
  Send,
  Hash,
  Gamepad2,
  Building2,
  Mail,
  Network,
  Server,
  MapPin,
  Globe,
  Webhook,
  Terminal,
  Code2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Link2,
  Power,
  PowerOff,
  Trash2,
  Zap,
  Settings2,
  ChevronDown,
  ChevronUp,
  Shield,
  ShieldCheck,
  ShieldBan,
  UserPlus,
  UserMinus,
  Users,
  Phone,
  Tag,
  Search,
  Ban,
  Lock,
  Unlock,
} from 'lucide-react'

// --- Types ---

type ChannelType =
  | 'WHATSAPP' | 'TELEGRAM' | 'SLACK' | 'DISCORD' | 'TEAMS' | 'GOOGLE_CHAT'
  | 'MATRIX' | 'MATTERMOST' | 'NEXTCLOUD'
  | 'LINE' | 'WEBHOOK' | 'CLI' | 'WEB' | 'API'
  | 'IMESSAGE' | 'SIGNAL'

interface ChannelItem {
  id: string
  type: ChannelType
  name: string
  status: string
  isActive: boolean
  config: Record<string, any> | null
  dmPolicy: string
  allowFrom: string[]
  liveStatus?: { paired: boolean; phone: string | null } | null
  createdAt: string
}

interface AccessContact {
  id: string
  label: string
}

interface WhatsAppStatus {
  paired: boolean
  phone: string | null
  connected: boolean
  running: boolean
  data: any
}

// --- Channel Config ---

interface AdvancedField {
  key: string
  label: string
  type: 'text' | 'number' | 'checkbox' | 'select'
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[]
  min?: number
  max?: number
}

interface ChannelConfig {
  icon: any
  color: string
  label: string
  category: 'principal' | 'adicional' | 'tecnico'
  description: string
  configFields: { key: string; label: string; placeholder: string; type?: string }[]
  advancedFields?: AdvancedField[]
}

// Common advanced fields shared by all channel types
const commonAdvancedFields: AdvancedField[] = [
  { key: 'groupPolicy', label: 'Política de grupo', type: 'select', description: 'Como o bot interage em grupos', options: [{ value: 'open', label: 'Aberto' }, { value: 'allowlist', label: 'Lista permitida' }, { value: 'disabled', label: 'Desabilitado' }] },
  { key: 'requireMention', label: 'Exigir menção', type: 'checkbox', description: 'Bot responde apenas quando mencionado em grupos' },
  { key: 'historyLimit', label: 'Limite de histórico', type: 'number', description: 'Mensagens a carregar do histórico', min: 0, max: 1000 },
  { key: 'textChunkLimit', label: 'Limite de chunk de texto', type: 'number', description: 'Caracteres por mensagem', min: 100, max: 10000 },
  { key: 'mediaMax', label: 'Tamanho máx. mídia (MB)', type: 'number', description: 'Limite de upload de mídia', min: 1, max: 100 },
]

const channelConfig: Record<ChannelType, ChannelConfig> = {
  WHATSAPP:    { icon: MessageCircle, color: 'text-green-400',  label: 'WhatsApp',        category: 'principal', description: 'Canal estratégico via pareamento',           configFields: [{ key: 'phone', label: 'Telefone', placeholder: '5561999999999' }], advancedFields: [
    { key: 'textChunkLimit', label: 'Limite de chunk', type: 'number', description: 'Caracteres por mensagem (padrão: 4000)', min: 100, max: 10000 },
    { key: 'chunkMode', label: 'Modo de chunk', type: 'select', description: 'Como dividir mensagens longas', options: [{ value: 'length', label: 'Por tamanho (length)' }, { value: 'newline', label: 'Por quebra de linha (newline)' }] },
    { key: 'mediaMax', label: 'Tamanho máx. mídia (MB)', type: 'number', description: 'Limite de upload (padrão: 50MB)', min: 1, max: 100 },
    { key: 'readReceipts', label: 'Confirmação de leitura', type: 'checkbox', description: 'Enviar confirmação de leitura ao receber mensagem' },
    { key: 'groupPolicy', label: 'Política de grupo', type: 'select', options: [{ value: 'open', label: 'Aberto' }, { value: 'allowlist', label: 'Lista permitida' }, { value: 'disabled', label: 'Desabilitado' }] },
    { key: 'requireMention', label: 'Exigir menção', type: 'checkbox', description: 'Bot responde apenas quando mencionado' },
    { key: 'groupAllowFrom', label: 'Grupos permitidos (JIDs)', type: 'text', description: 'JIDs separados por vírgula', placeholder: '5561999999999-1234567890@g.us' },
  ] },
  TELEGRAM:    { icon: Send,          color: 'text-blue-400',   label: 'Telegram',        category: 'principal', description: 'Bot Telegram para mensagens e grupos',      configFields: [{ key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC-DEF...', type: 'password' }, { key: 'botUsername', label: 'Username do Bot', placeholder: '@meubot' }], advancedFields: [
    { key: 'webhookMode', label: 'Modo Webhook', type: 'checkbox', description: 'Usar webhook ao invés de polling' },
    { key: 'webhookUrl', label: 'URL do Webhook', type: 'text', placeholder: 'https://bot.example.com/webhook' },
    { key: 'webhookSecret', label: 'Secret do Webhook', type: 'text', placeholder: 'secret-token' },
    { key: 'webhookPath', label: 'Path do Webhook', type: 'text', placeholder: '/webhook/telegram' },
    { key: 'historyLimit', label: 'Limite de histórico', type: 'number', min: 0, max: 1000 },
    { key: 'mediaMax', label: 'Tamanho máx. mídia (MB)', type: 'number', min: 1, max: 100 },
    { key: 'replyToMode', label: 'Modo de resposta', type: 'select', description: 'Como responder em threads', options: [{ value: 'off', label: 'Desligado' }, { value: 'first', label: 'Primeira mensagem' }, { value: 'all', label: 'Todas as mensagens' }] },
    { key: 'linkPreview', label: 'Preview de links', type: 'checkbox', description: 'Mostrar preview de links nas mensagens (padrão: sim)' },
    { key: 'streamMode', label: 'Modo de streaming', type: 'select', description: 'Como enviar respostas parciais', options: [{ value: 'off', label: 'Desligado' }, { value: 'partial', label: 'Parcial' }, { value: 'block', label: 'Bloco' }] },
    { key: 'customCommands', label: 'Comandos customizados', type: 'text', description: 'Comandos separados por vírgula (ex: start,help,status)', placeholder: 'start,help,status' },
    { key: 'reactionScope', label: 'Escopo de reações', type: 'select', options: [{ value: 'off', label: 'Desligado' }, { value: 'own', label: 'Apenas próprias' }, { value: 'all', label: 'Todas' }, { value: 'allowlist', label: 'Lista permitida' }] },
    { key: 'configWrites', label: 'Permitir /config writes', type: 'checkbox', description: 'Permitir alterar config via comandos no chat' },
    { key: 'groupPolicy', label: 'Política de grupo', type: 'select', options: [{ value: 'open', label: 'Aberto' }, { value: 'allowlist', label: 'Lista permitida' }, { value: 'disabled', label: 'Desabilitado' }] },
    { key: 'requireMention', label: 'Exigir menção', type: 'checkbox', description: 'Bot responde apenas quando mencionado' },
  ] },
  SLACK:       { icon: Hash,          color: 'text-purple-400', label: 'Slack',           category: 'principal', description: 'Canais e DMs corporativos',                 configFields: [{ key: 'botToken', label: 'Bot Token (xoxb-)', placeholder: 'xoxb-...', type: 'password' }, { key: 'appToken', label: 'App Token (xapp-)', placeholder: 'xapp-...', type: 'password' }, { key: 'signingSecret', label: 'Signing Secret', placeholder: '...', type: 'password' }], advancedFields: [
    { key: 'dmEnabled', label: 'DMs habilitadas', type: 'checkbox', description: 'Permite DMs para o bot' },
    { key: 'dmPolicy', label: 'Política de DM', type: 'select', options: [{ value: 'open', label: 'Aberto' }, { value: 'allowlist', label: 'Lista permitida' }, { value: 'disabled', label: 'Desabilitado' }] },
    { key: 'historyLimit', label: 'Limite de histórico', type: 'number', description: 'Mensagens do histórico (padrão: 50)', min: 0, max: 1000 },
    { key: 'allowBots', label: 'Permitir bots', type: 'checkbox', description: 'Responder a mensagens de outros bots' },
    { key: 'reactionScope', label: 'Notificações de reações', type: 'select', options: [{ value: 'off', label: 'Desligado' }, { value: 'own', label: 'Apenas próprias' }, { value: 'all', label: 'Todas' }] },
    { key: 'threadHistoryScope', label: 'Escopo do histórico de thread', type: 'select', description: 'Contexto para threads', options: [{ value: 'thread', label: 'Apenas thread' }, { value: 'channel', label: 'Canal completo' }] },
    { key: 'slashCommandEnabled', label: 'Slash commands', type: 'checkbox', description: 'Habilitar slash commands do bot' },
    { key: 'textChunkLimit', label: 'Limite de chunk', type: 'number', description: 'Caracteres por mensagem (padrão: 4000)', min: 100, max: 10000 },
    { key: 'mediaMax', label: 'Tamanho máx. mídia (MB)', type: 'number', description: 'Limite de upload (padrão: 20MB)', min: 1, max: 100 },
    { key: 'groupPolicy', label: 'Política de grupo', type: 'select', options: [{ value: 'open', label: 'Aberto' }, { value: 'allowlist', label: 'Lista permitida' }, { value: 'disabled', label: 'Desabilitado' }] },
    { key: 'requireMention', label: 'Exigir menção', type: 'checkbox', description: 'Bot responde apenas quando mencionado' },
  ] },
  DISCORD:     { icon: Gamepad2,      color: 'text-indigo-400', label: 'Discord',         category: 'principal', description: 'Comunidades e suporte',                     configFields: [{ key: 'botToken', label: 'Bot Token', placeholder: '...', type: 'password' }, { key: 'applicationId', label: 'Application ID', placeholder: '123456789' }], advancedFields: [
    { key: 'guildId', label: 'Guild ID', type: 'text', placeholder: '123456789012345678', description: 'ID do servidor Discord' },
    { key: 'allowBots', label: 'Permitir bots', type: 'checkbox', description: 'Responder a mensagens de outros bots' },
    { key: 'dmEnabled', label: 'DMs habilitadas', type: 'checkbox', description: 'Permite DMs para o bot' },
    { key: 'dmPolicy', label: 'Política de DM', type: 'select', options: [{ value: 'open', label: 'Aberto' }, { value: 'allowlist', label: 'Lista permitida' }, { value: 'disabled', label: 'Desabilitado' }] },
    { key: 'dmGroupEnabled', label: 'DM em grupo', type: 'checkbox', description: 'Permitir DMs em grupo' },
    { key: 'maxLinesPerMessage', label: 'Linhas por mensagem', type: 'number', description: 'Máximo de linhas por mensagem (padrão: 17)', min: 1, max: 100 },
    { key: 'historyLimit', label: 'Limite de histórico', type: 'number', min: 0, max: 1000 },
    { key: 'textChunkLimit', label: 'Limite de chunk', type: 'number', min: 100, max: 10000 },
    { key: 'mediaMax', label: 'Tamanho máx. mídia (MB)', type: 'number', min: 1, max: 100 },
    { key: 'reactionScope', label: 'Escopo de reações', type: 'select', options: [{ value: 'off', label: 'Desligado' }, { value: 'own', label: 'Apenas próprias' }, { value: 'all', label: 'Todas' }, { value: 'allowlist', label: 'Lista permitida' }] },
    { key: 'groupPolicy', label: 'Política de grupo', type: 'select', options: [{ value: 'open', label: 'Aberto' }, { value: 'allowlist', label: 'Lista permitida' }, { value: 'disabled', label: 'Desabilitado' }] },
    { key: 'requireMention', label: 'Exigir menção', type: 'checkbox', description: 'Bot responde apenas quando mencionado' },
  ] },
  TEAMS:       { icon: Building2,     color: 'text-blue-500',   label: 'Microsoft Teams', category: 'principal', description: 'Chat corporativo Microsoft',                configFields: [{ key: 'appId', label: 'App ID', placeholder: '...' }, { key: 'appPassword', label: 'App Password', placeholder: '...', type: 'password' }, { key: 'tenantId', label: 'Tenant ID', placeholder: '...' }], advancedFields: commonAdvancedFields },
  GOOGLE_CHAT: { icon: Mail,          color: 'text-red-400',    label: 'Google Chat',     category: 'principal', description: 'Integração Google Workspace',               configFields: [{ key: 'serviceAccountKey', label: 'Service Account Key (JSON)', placeholder: '{"type":"service_account"...}', type: 'password' }, { key: 'spaceId', label: 'Space ID', placeholder: 'spaces/...' }], advancedFields: [
    { key: 'serviceAccountFile', label: 'Service Account File', type: 'text', description: 'Caminho para arquivo de credenciais', placeholder: '/path/to/credentials.json' },
    ...commonAdvancedFields,
  ] },
  MATRIX:      { icon: Network,       color: 'text-teal-400',   label: 'Matrix',          category: 'adicional', description: 'Canal descentralizado',                     configFields: [{ key: 'homeserver', label: 'Homeserver', placeholder: 'https://matrix.org' }, { key: 'accessToken', label: 'Access Token', placeholder: '...', type: 'password' }, { key: 'userId', label: 'User ID', placeholder: '@bot:matrix.org' }], advancedFields: commonAdvancedFields },
  MATTERMOST:  { icon: Server,        color: 'text-blue-400',   label: 'Mattermost',      category: 'adicional', description: 'Alternativa open source ao Slack',          configFields: [{ key: 'serverUrl', label: 'Server URL', placeholder: 'https://mattermost.example.com' }, { key: 'botToken', label: 'Bot Token', placeholder: '...', type: 'password' }], advancedFields: [
    { key: 'chatmode', label: 'Modo de chat', type: 'select', description: 'Quando o bot responde', options: [{ value: 'oncall', label: 'Ao chamar (oncall)' }, { value: 'onmessage', label: 'Toda mensagem (onmessage)' }, { value: 'onchar', label: 'Por caractere (onchar)' }] },
    ...commonAdvancedFields,
  ] },
  NEXTCLOUD:   { icon: Globe,         color: 'text-blue-300',   label: 'Nextcloud Talk',  category: 'adicional', description: 'Integração Nextcloud',                      configFields: [{ key: 'serverUrl', label: 'Server URL', placeholder: 'https://nextcloud.example.com' }, { key: 'botToken', label: 'Bot Token', placeholder: '...', type: 'password' }], advancedFields: commonAdvancedFields },
  LINE:        { icon: MapPin,        color: 'text-green-300',  label: 'LINE',            category: 'adicional', description: 'Popular em mercados asiáticos',             configFields: [{ key: 'channelAccessToken', label: 'Channel Access Token', placeholder: '...', type: 'password' }, { key: 'channelSecret', label: 'Channel Secret', placeholder: '...', type: 'password' }], advancedFields: commonAdvancedFields },
  IMESSAGE:    { icon: MessageCircle, color: 'text-blue-500',   label: 'iMessage',        category: 'adicional', description: 'Apple iMessage via bridge',                 configFields: [{ key: 'bridgeUrl', label: 'Bridge URL', placeholder: 'http://localhost:29318' }], advancedFields: commonAdvancedFields },
  SIGNAL:      { icon: Shield,        color: 'text-blue-400',   label: 'Signal',          category: 'adicional', description: 'Mensageria criptografada Signal',           configFields: [{ key: 'phone', label: 'Número Signal', placeholder: '+5561999999999' }, { key: 'signalCliPath', label: 'CLI Path', placeholder: '/usr/local/bin/signal-cli' }], advancedFields: [
    { key: 'reactionScope', label: 'Notificações de reações', type: 'select', options: [{ value: 'off', label: 'Desligado' }, { value: 'own', label: 'Apenas próprias' }, { value: 'all', label: 'Todas' }] },
    ...commonAdvancedFields,
  ] },
  WEBHOOK:     { icon: Webhook,       color: 'text-orange-400', label: 'Webhook',         category: 'tecnico',   description: 'Entrada/saída via HTTP',                   configFields: [{ key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://...' }, { key: 'secret', label: 'Secret', placeholder: '...', type: 'password' }] },
  CLI:         { icon: Terminal,      color: 'text-gray-400',   label: 'CLI / Local',     category: 'tecnico',   description: 'Execução local de agents',                 configFields: [] },
  WEB:         { icon: Globe,         color: 'text-cyan-400',   label: 'Web Chat',        category: 'tecnico',   description: 'Widget de chat para websites',              configFields: [{ key: 'allowedOrigins', label: 'Origens permitidas', placeholder: 'https://meusite.com' }] },
  API:         { icon: Code2,         color: 'text-yellow-400', label: 'API',             category: 'tecnico',   description: 'Integração via REST API',                  configFields: [{ key: 'apiKey', label: 'API Key', placeholder: '...', type: 'password' }] },
}

// Mapping from advanced field keys to help-text keys
const fieldHelpMap: Record<string, string> = {
  dmPolicy: 'channels.dmPolicy',
  chunkMode: 'channels.chunkMode',
  streamMode: 'channels.streamMode',
  replyToMode: 'channels.replyToMode',
  linkPreview: 'channels.linkPreview',
  allowBots: 'channels.allowBots',
  groupAllowFrom: 'channels.groupAllowFrom',
}

const categories = [
  { key: 'principal', label: 'Canais Principais', description: 'Os canais mais utilizados' },
  { key: 'adicional', label: 'Canais Adicionais', description: 'Canais especializados e regionais' },
  { key: 'tecnico', label: 'Canais Técnicos', description: 'Integrações e execução local' },
]

const statusLabels: Record<string, { label: string; color: string; icon: any }> = {
  connected: { label: 'Conectado', color: 'text-green-400', icon: CheckCircle2 },
  pairing: { label: 'Pareando', color: 'text-yellow-400', icon: AlertCircle },
  disconnected: { label: 'Desconectado', color: 'text-muted-foreground', icon: XCircle },
  disabled: { label: 'Desativado', color: 'text-muted-foreground', icon: PowerOff },
  error: { label: 'Erro', color: 'text-red-400', icon: XCircle },
  configured: { label: 'Configurado', color: 'text-blue-400', icon: Settings2 },
}

// --- Component ---

export default function ChannelsPage() {
  const { selectedId } = useInstance()
  const toast = useToast()
  const [channels, setChannels] = useState<ChannelItem[]>([])
  const [loading, setLoading] = useState(false)
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null)
  const [pairingPhone, setPairingPhone] = useState('')
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [pairingLoading, setPairingLoading] = useState(false)
  const [showPairingModal, setShowPairingModal] = useState(false)
  const [loginOutput, setLoginOutput] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)
  const [configForm, setConfigForm] = useState<Record<string, any>>({})
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [dmPolicyForm, setDmPolicyForm] = useState<string>('open')
  const [allowFromForm, setAllowFromForm] = useState<string>('')
  // Access control states
  const [allowList, setAllowList] = useState<AccessContact[]>([])
  const [denyList, setDenyList] = useState<AccessContact[]>([])
  const [newContactId, setNewContactId] = useState('')
  const [newContactLabel, setNewContactLabel] = useState('')
  const [contactSearchFilter, setContactSearchFilter] = useState('')
  const [activeAccessTab, setActiveAccessTab] = useState<'allow' | 'deny'>('allow')

  const fetchChannels = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/channels`)
      setChannels(data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Falha ao carregar canais')
    } finally {
      setLoading(false)
    }
  }, [selectedId, toast])

  const fetchWaStatus = useCallback(async () => {
    if (!selectedId) return
    try {
      const { data } = await api.get(`/instances/${selectedId}/channels/whatsapp/status`)
      setWaStatus(data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Falha ao buscar status do WhatsApp')
    }
  }, [selectedId, toast])

  useEffect(() => { fetchChannels(); fetchWaStatus() }, [fetchChannels, fetchWaStatus])

  const handleAddChannel = async (type: ChannelType) => {
    if (!selectedId) return
    const meta = channelConfig[type]
    try {
      await api.post(`/instances/${selectedId}/channels`, { type, name: meta.label })
      setShowAddModal(false)
      toast.success(`Canal ${meta.label} criado com sucesso`)
      await fetchChannels()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao criar canal')
    }
  }

  const handleToggle = async (ch: ChannelItem) => {
    if (!selectedId) return
    setTogglingId(ch.id)
    try {
      await api.post(`/instances/${selectedId}/channels/${ch.id}/toggle`)
      toast.success(`Canal ${ch.name} ${ch.isActive ? 'desativado' : 'ativado'}`)
      await fetchChannels()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao alternar canal')
    } finally { setTogglingId(null) }
  }

  const handleDelete = async (ch: ChannelItem) => {
    if (!selectedId || !window.confirm(`Remover canal ${ch.name}?`)) return
    try {
      await api.delete(`/instances/${selectedId}/channels/${ch.id}`)
      toast.success(`Canal ${ch.name} removido`)
      await fetchChannels()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao remover canal')
    }
  }

  const handleTest = async (ch: ChannelItem) => {
    if (!selectedId) return
    setTestingId(ch.id)
    try {
      const { data } = await api.post(`/instances/${selectedId}/channels/${ch.id}/test`)
      if (data.success) {
        toast.success(`Conectado (${data.latency}ms)`)
      } else {
        toast.error(`Falhou: ${data.error}`)
      }
      await fetchChannels()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao testar canal')
    } finally { setTestingId(null) }
  }

  const handleSaveConfig = async (ch: ChannelItem) => {
    if (!selectedId) return
    setSavingConfig(true)
    try {
      const payload: Record<string, any> = {}
      const mergedConfig = { ...(ch.config || {}), ...configForm }

      // Store contact labels in config
      const contactLabels: Record<string, string> = {}
      allowList.forEach(c => { if (c.label) contactLabels[c.id] = c.label })
      denyList.forEach(c => { if (c.label) contactLabels[c.id] = c.label })
      mergedConfig.contactLabels = contactLabels

      // Store denyFrom in config
      mergedConfig.denyFrom = denyList.map(c => c.id)

      payload.config = mergedConfig

      if (dmPolicyForm !== ch.dmPolicy) {
        payload.dmPolicy = dmPolicyForm
      }

      // allowFrom always from the allowList state
      payload.allowFrom = allowList.map(c => c.id)

      await api.put(`/instances/${selectedId}/channels/${ch.id}`, payload)
      setExpandedChannel(null)
      setConfigForm({})
      setNewContactId('')
      setNewContactLabel('')
      setContactSearchFilter('')
      toast.success('Configuração salva com sucesso')
      await fetchChannels()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao salvar configuração')
    } finally { setSavingConfig(false) }
  }

  const [pairingError, setPairingError] = useState<string | null>(null)

  // Start WhatsApp login (QR code flow)
  const handleWhatsAppLogin = async () => {
    if (!selectedId) return
    setLoginLoading(true)
    setLoginOutput(null)
    setPairingError(null)
    setShowPairingModal(true)
    try {
      const { data } = await api.post(`/instances/${selectedId}/channels/whatsapp/login`)
      if (data.qrData) {
        setLoginOutput(data.qrData)
        startPairingPoll()
      } else if (data.output) {
        const out = data.output as string
        if (out.includes('logged out') || out.includes('Error') || out.includes('failed') || out.includes('timeout') || out.includes('Session logged out')) {
          const msg = out.includes('logged out')
            ? 'Sessão WhatsApp expirada. Cache limpo. Clique em "Tentar Novamente" para gerar um novo QR Code.'
            : out
          setPairingError(msg)
        } else {
          setLoginOutput(out)
          startPairingPoll()
        }
      } else {
        setPairingError('Não foi possível iniciar o pareamento. Verifique se o container tem acesso à internet.')
      }
    } catch (err: any) {
      setPairingError(err?.response?.data?.error?.message || 'Erro ao iniciar login WhatsApp')
    } finally { setLoginLoading(false) }
  }

  // Poll for WhatsApp connection status
  const startPairingPoll = () => {
    const interval = setInterval(async () => {
      if (!selectedId) { clearInterval(interval); return }
      try {
        const { data } = await api.get(`/instances/${selectedId}/channels/whatsapp/status`)
        setWaStatus(data)
        if (data.connected || data.paired) {
          clearInterval(interval)
          setShowPairingModal(false)
          setLoginOutput(null)
          toast.success('WhatsApp conectado com sucesso')
          await fetchChannels()
        }
      } catch (err: any) {
        toast.error(err?.response?.data?.error?.message || 'Erro ao verificar status do WhatsApp')
      }
    }, 3000)
    // Stop polling after 2 minutes
    setTimeout(() => clearInterval(interval), 120000)
  }

  const handlePair = async () => {
    if (!selectedId || !pairingPhone.trim()) return
    setPairingLoading(true)
    setPairingCode(null)
    setPairingError(null)
    try {
      const { data } = await api.post(`/instances/${selectedId}/channels/whatsapp/pair`, { phone: pairingPhone })
      if (data.code) {
        setPairingCode(data.code)
      } else if (data.output) {
        setPairingError(`Não foi possível extrair o código. Saída: ${data.output}`)
      } else {
        setPairingError(data.success ? 'Código não retornado pelo container' : 'Falha no pareamento. Verifique se o container está rodando.')
      }
    } catch (err: any) {
      setPairingError(err?.response?.data?.error?.message || 'Erro ao solicitar pareamento')
    } finally { setPairingLoading(false) }
  }

  if (!selectedId) return <div className="p-8 text-center text-muted-foreground">Selecione uma instância</div>

  const activeTypes = new Set(channels.map(c => c.type))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Canais de Comunicação</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Gerenciar canais de entrada e saída do Clawdbot</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { fetchChannels(); fetchWaStatus() }} disabled={loading}>
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> <span className="hidden sm:inline">Atualizar</span>
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowAddModal(true)}>
            <Plus className="h-3 w-3" /> <span className="hidden sm:inline">Novo</span> Canal
          </Button>
        </div>
      </div>

      {/* Active channels */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : channels.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nenhum canal configurado. Clique em "Novo Canal" para adicionar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {channels.filter(ch => ch.type !== 'WHATSAPP').map((ch) => {
            const cfg = channelConfig[ch.type]
            if (!cfg) return null
            const Icon = cfg.icon
            const st = statusLabels[ch.status] || statusLabels.disconnected
            const StIcon = st.icon
            const isExpanded = expandedChannel === ch.id

            return (
              <Card key={ch.id} className={cn(!ch.isActive && 'opacity-50')}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center bg-muted shrink-0">
                      <Icon className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium truncate">{ch.name}</p>
                        <div className="flex items-center gap-1">
                          <StIcon className={cn('h-3 w-3', st.color)} />
                          <span className={cn('text-[10px] sm:text-xs font-medium', st.color)}>{st.label}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground truncate hidden sm:block">
                        {cfg.description}
                        {ch.liveStatus?.paired && ` · ${ch.liveStatus.phone}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleTest(ch)} disabled={testingId === ch.id} title="Testar">
                        {testingId === ch.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleToggle(ch)} disabled={togglingId === ch.id} title={ch.isActive ? 'Desativar' : 'Ativar'}>
                        {togglingId === ch.id ? <Loader2 className="h-3 w-3 animate-spin" /> : ch.isActive ? <Power className="h-3 w-3 text-green-400" /> : <PowerOff className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                        if (isExpanded) {
                          setExpandedChannel(null)
                        } else {
                          setExpandedChannel(ch.id)
                          setConfigForm({})
                          setDmPolicyForm(ch.dmPolicy || 'open')
                          setAllowFromForm(Array.isArray(ch.allowFrom) ? ch.allowFrom.join('\n') : '')
                          // Parse allow list with labels from config
                          const labels = (ch.config as any)?.contactLabels || {}
                          const currentAllow = Array.isArray(ch.allowFrom) ? ch.allowFrom : []
                          setAllowList(currentAllow.map((id: string) => ({ id, label: labels[id] || '' })))
                          // Parse deny list from config
                          const currentDeny = Array.isArray((ch.config as any)?.denyFrom) ? (ch.config as any).denyFrom : []
                          setDenyList(currentDeny.map((id: string) => ({ id, label: labels[id] || '' })))
                          setNewContactId('')
                          setNewContactLabel('')
                          setContactSearchFilter('')
                          setActiveAccessTab('allow')
                        }
                      }} title="Configurar">
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={() => handleDelete(ch)} title="Remover">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded config */}
                  {isExpanded && (
                    <div className="mt-4 pt-3 border-t border-border space-y-4">
                      {/* Config fields */}
                      {cfg.configFields.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {cfg.configFields.map((f) => (
                            <div key={f.key}>
                              <Label className="text-xs text-muted-foreground">{f.label}</Label>
                              <Input
                                className="mt-1"
                                type={f.type || 'text'}
                                placeholder={f.placeholder}
                                defaultValue={(ch.config as any)?.[f.key] || ''}
                                onChange={(e) => setConfigForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Advanced per-type fields */}
                      {cfg.advancedFields && cfg.advancedFields.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuração Avançada</Label>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {cfg.advancedFields.map((f) => {
                              const val = configForm[f.key] ?? (ch.config as any)?.[f.key] ?? ''
                              if (f.type === 'checkbox') {
                                const checked = configForm[f.key] !== undefined ? !!configForm[f.key] : !!(ch.config as any)?.[f.key]
                                return (
                                  <label key={f.key} className="flex items-start gap-3 cursor-pointer col-span-1">
                                    <input
                                      type="checkbox"
                                      checked={!!checked}
                                      onChange={(e) => setConfigForm(prev => ({ ...prev, [f.key]: e.target.checked }))}
                                      className="mt-1 h-4 w-4 rounded border-input accent-primary"
                                    />
                                    <div>
                                      <div className="flex items-center">
                                        <span className="text-xs font-medium">{f.label}</span>
                                        {fieldHelpMap[f.key] && <FieldHelp field={fieldHelpMap[f.key]} />}
                                      </div>
                                      {f.description && <p className="text-[10px] text-muted-foreground">{f.description}</p>}
                                    </div>
                                  </label>
                                )
                              }
                              if (f.type === 'select' && f.options) {
                                return (
                                  <div key={f.key}>
                                    <div className="flex items-center">
                                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                                      {fieldHelpMap[f.key] && <FieldHelp field={fieldHelpMap[f.key]} />}
                                    </div>
                                    {f.description && <p className="text-[10px] text-muted-foreground">{f.description}</p>}
                                    <select
                                      className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                                      value={val}
                                      onChange={(e) => setConfigForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                    >
                                      <option value="">Padrão</option>
                                      {f.options.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                )
                              }
                              return (
                                <div key={f.key}>
                                  <div className="flex items-center">
                                    <Label className="text-xs text-muted-foreground">{f.label}</Label>
                                    {fieldHelpMap[f.key] && <FieldHelp field={fieldHelpMap[f.key]} />}
                                  </div>
                                  {f.description && <p className="text-[10px] text-muted-foreground">{f.description}</p>}
                                  <Input
                                    className="mt-1"
                                    type={f.type === 'number' ? 'number' : 'text'}
                                    min={f.min}
                                    max={f.max}
                                    placeholder={f.placeholder || ''}
                                    value={val}
                                    onChange={(e) => setConfigForm(prev => ({ ...prev, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* ═══════════════════════════════════════ */}
                      {/* CONTROLE DE ACESSO COMPLETO */}
                      {/* ═══════════════════════════════════════ */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" />
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Controle de Acesso</Label>
                          <FieldHelp field="channels.dmPolicy" />
                        </div>

                        {/* Policy selector cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {([
                            { value: 'open', label: 'Aberto', desc: 'Todos podem enviar mensagens', icon: Unlock, color: 'text-green-400' },
                            { value: 'pairing', label: 'Pareamento', desc: 'Apenas após parear dispositivo', icon: Link2, color: 'text-blue-400' },
                            { value: 'allowlist', label: 'Lista Permitida', desc: 'Somente contatos autorizados', icon: ShieldCheck, color: 'text-yellow-400' },
                            { value: 'disabled', label: 'Bloqueado', desc: 'Nenhuma DM aceita', icon: Lock, color: 'text-red-400' },
                          ] as const).map((opt) => {
                            const OptIcon = opt.icon
                            return (
                              <button
                                key={opt.value}
                                onClick={() => setDmPolicyForm(opt.value)}
                                className={cn(
                                  'p-3 rounded-lg border text-left transition-all',
                                  dmPolicyForm === opt.value
                                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                                    : 'border-border hover:bg-accent'
                                )}
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  <OptIcon className={cn('h-3.5 w-3.5', dmPolicyForm === opt.value ? opt.color : 'text-muted-foreground')} />
                                  <p className="text-xs font-semibold">{opt.label}</p>
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</p>
                              </button>
                            )
                          })}
                        </div>

                        {/* Access control panel - shows for open (blocklist) and allowlist (allowlist) */}
                        {(dmPolicyForm === 'open' || dmPolicyForm === 'allowlist') && (
                          <div className="border border-border rounded-lg overflow-hidden">
                            {/* Tab header */}
                            {dmPolicyForm === 'open' ? (
                              <div className="bg-muted/50 px-4 py-2.5 border-b border-border">
                                <div className="flex items-center gap-2">
                                  <ShieldBan className="h-3.5 w-3.5 text-red-400" />
                                  <span className="text-xs font-semibold">Lista de Bloqueio (Exceções)</span>
                                  <FieldHelp field="channels.denyFrom" />
                                  <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full font-medium">{denyList.length}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Modo aberto — estes contatos NÃO poderão enviar mensagens
                                </p>
                              </div>
                            ) : (
                              <div className="flex border-b border-border">
                                <button
                                  onClick={() => setActiveAccessTab('allow')}
                                  className={cn(
                                    'flex-1 px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 transition-colors',
                                    activeAccessTab === 'allow' ? 'bg-green-500/10 text-green-400 border-b-2 border-green-400' : 'text-muted-foreground hover:bg-accent'
                                  )}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Permitidos
                                  <FieldHelp field="channels.allowFrom" />
                                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', activeAccessTab === 'allow' ? 'bg-green-500/20' : 'bg-muted')}>{allowList.length}</span>
                                </button>
                                <button
                                  onClick={() => setActiveAccessTab('deny')}
                                  className={cn(
                                    'flex-1 px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 transition-colors',
                                    activeAccessTab === 'deny' ? 'bg-red-500/10 text-red-400 border-b-2 border-red-400' : 'text-muted-foreground hover:bg-accent'
                                  )}
                                >
                                  <ShieldBan className="h-3.5 w-3.5" />
                                  Bloqueados
                                  <FieldHelp field="channels.denyFrom" />
                                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', activeAccessTab === 'deny' ? 'bg-red-500/20' : 'bg-muted')}>{denyList.length}</span>
                                </button>
                              </div>
                            )}

                            <div className="p-4 space-y-3">
                              {/* Add contact form */}
                              <div className="flex gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex gap-2">
                                    <div className="relative flex-1">
                                      <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                      <Input
                                        className="pl-8 h-8 text-xs font-mono"
                                        placeholder="5561999999999 ou @user_id"
                                        value={newContactId}
                                        onChange={(e) => setNewContactId(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && newContactId.trim()) {
                                            const list = dmPolicyForm === 'open' || activeAccessTab === 'deny' ? denyList : allowList
                                            const setList = dmPolicyForm === 'open' || activeAccessTab === 'deny' ? setDenyList : setAllowList
                                            if (!list.find(c => c.id === newContactId.trim())) {
                                              setList([...list, { id: newContactId.trim(), label: newContactLabel.trim() || '' }])
                                            }
                                            setNewContactId('')
                                            setNewContactLabel('')
                                          }
                                        }}
                                      />
                                    </div>
                                    <div className="relative w-36">
                                      <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                      <Input
                                        className="pl-8 h-8 text-xs"
                                        placeholder="Nome (opcional)"
                                        value={newContactLabel}
                                        onChange={(e) => setNewContactLabel(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && newContactId.trim()) {
                                            const list = dmPolicyForm === 'open' || activeAccessTab === 'deny' ? denyList : allowList
                                            const setList = dmPolicyForm === 'open' || activeAccessTab === 'deny' ? setDenyList : setAllowList
                                            if (!list.find(c => c.id === newContactId.trim())) {
                                              setList([...list, { id: newContactId.trim(), label: newContactLabel.trim() || '' }])
                                            }
                                            setNewContactId('')
                                            setNewContactLabel('')
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 shrink-0"
                                  disabled={!newContactId.trim()}
                                  onClick={() => {
                                    const list = dmPolicyForm === 'open' || activeAccessTab === 'deny' ? denyList : allowList
                                    const setList = dmPolicyForm === 'open' || activeAccessTab === 'deny' ? setDenyList : setAllowList
                                    if (newContactId.trim() && !list.find(c => c.id === newContactId.trim())) {
                                      setList([...list, { id: newContactId.trim(), label: newContactLabel.trim() || '' }])
                                    }
                                    setNewContactId('')
                                    setNewContactLabel('')
                                  }}
                                >
                                  {dmPolicyForm === 'open' || activeAccessTab === 'deny'
                                    ? <><UserMinus className="h-3 w-3" /> Bloquear</>
                                    : <><UserPlus className="h-3 w-3" /> Permitir</>
                                  }
                                </Button>
                              </div>

                              {/* Search filter */}
                              {(() => {
                                const currentList = dmPolicyForm === 'open' ? denyList
                                  : activeAccessTab === 'allow' ? allowList : denyList
                                if (currentList.length > 5) {
                                  return (
                                    <div className="relative">
                                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                      <Input
                                        className="pl-8 h-7 text-xs"
                                        placeholder="Filtrar contatos..."
                                        value={contactSearchFilter}
                                        onChange={(e) => setContactSearchFilter(e.target.value)}
                                      />
                                    </div>
                                  )
                                }
                                return null
                              })()}

                              {/* Contact list */}
                              {(() => {
                                const isDenyView = dmPolicyForm === 'open' || activeAccessTab === 'deny'
                                const currentList = isDenyView ? denyList : allowList
                                const setCurrentList = isDenyView ? setDenyList : setAllowList
                                const filtered = contactSearchFilter
                                  ? currentList.filter(c =>
                                      c.id.toLowerCase().includes(contactSearchFilter.toLowerCase()) ||
                                      c.label.toLowerCase().includes(contactSearchFilter.toLowerCase())
                                    )
                                  : currentList

                                if (currentList.length === 0) {
                                  return (
                                    <div className="py-6 text-center">
                                      <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                                      <p className="text-xs text-muted-foreground">
                                        {isDenyView
                                          ? 'Nenhum contato bloqueado. Adicione números para impedir o envio de mensagens.'
                                          : 'Nenhum contato na lista. Adicione números autorizados a enviar mensagens.'}
                                      </p>
                                    </div>
                                  )
                                }

                                return (
                                  <div className="space-y-1 max-h-[250px] overflow-y-auto">
                                    {filtered.map((contact) => (
                                      <div
                                        key={contact.id}
                                        className={cn(
                                          'flex items-center gap-2 px-3 py-2 rounded-md group transition-colors',
                                          isDenyView ? 'hover:bg-red-500/5' : 'hover:bg-green-500/5'
                                        )}
                                      >
                                        <div className={cn(
                                          'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
                                          isDenyView ? 'bg-red-500/10' : 'bg-green-500/10'
                                        )}>
                                          {isDenyView
                                            ? <Ban className="h-3 w-3 text-red-400" />
                                            : <ShieldCheck className="h-3 w-3 text-green-400" />
                                          }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-mono font-medium truncate">{contact.id}</p>
                                          {contact.label && (
                                            <p className="text-[10px] text-muted-foreground truncate">{contact.label}</p>
                                          )}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                                          onClick={() => setCurrentList(currentList.filter(c => c.id !== contact.id))}
                                          title="Remover"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                    {contactSearchFilter && filtered.length === 0 && (
                                      <p className="text-xs text-muted-foreground text-center py-3">Nenhum resultado para "{contactSearchFilter}"</p>
                                    )}
                                  </div>
                                )
                              })()}

                              {/* Quick-add info */}
                              <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
                                {dmPolicyForm === 'open'
                                  ? '💡 Modo aberto: todos podem enviar mensagens, exceto os listados acima.'
                                  : activeAccessTab === 'allow'
                                    ? '💡 Modo lista permitida: apenas os contatos listados acima podem enviar mensagens.'
                                    : '💡 Contatos bloqueados: estes são impedidos mesmo se estiverem na lista de permitidos.'
                                }
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Summary badge */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Shield className="h-3 w-3" />
                            Política: <span className="font-medium text-foreground">{
                              dmPolicyForm === 'open' ? 'Aberto' :
                              dmPolicyForm === 'allowlist' ? 'Lista Permitida' :
                              dmPolicyForm === 'pairing' ? 'Pareamento' : 'Bloqueado'
                            }</span>
                          </div>
                          {allowList.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <ShieldCheck className="h-3 w-3 text-green-400" />
                              <span className="text-green-400 font-medium">{allowList.length}</span>
                              <span className="text-muted-foreground">permitido(s)</span>
                            </div>
                          )}
                          {denyList.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <ShieldBan className="h-3 w-3 text-red-400" />
                              <span className="text-red-400 font-medium">{denyList.length}</span>
                              <span className="text-muted-foreground">bloqueado(s)</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button size="sm" className="gap-2" onClick={() => handleSaveConfig(ch)} disabled={savingConfig}>
                          {savingConfig ? <Loader2 className="h-3 w-3 animate-spin" /> : <Settings2 className="h-3 w-3" />} Salvar Configuração
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* WhatsApp Pairing Section */}
      {channels.some(c => c.type === 'WHATSAPP') && (
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-green-400" />
              WhatsApp — Status e Pareamento
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {waStatus?.connected ? `Conectado: ${waStatus.phone}` : waStatus?.paired ? `Pareado (${waStatus.phone}) — desconectado` : 'Não pareado'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-4 sm:px-6">
            {/* Status line */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              {waStatus?.connected ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                  <span className="text-sm font-medium text-green-400">Conectado</span>
                  <span className="text-xs text-muted-foreground truncate">({waStatus.phone})</span>
                </div>
              ) : waStatus?.paired ? (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-yellow-400">Pareado mas desconectado</span>
                  <span className="text-xs text-muted-foreground truncate">({waStatus.phone})</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">Não pareado</span>
                </div>
              )}
              <Button variant="ghost" size="sm" className="sm:ml-auto gap-1 self-start" onClick={fetchWaStatus}>
                <RefreshCw className="h-3 w-3" /> Verificar
              </Button>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-3 border-t border-border">
              {/* QR Code Login Button */}
              <Button size="sm" onClick={handleWhatsAppLogin} disabled={loginLoading} variant={waStatus?.paired ? 'outline' : 'default'} className="gap-2 w-fit">
                {loginLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
                {waStatus?.paired ? 'Reconectar via QR' : 'Parear via QR Code'}
              </Button>

              {/* Code-based pairing */}
              {!waStatus?.paired && (
                <div className="flex items-center gap-2">
                  <Input value={pairingPhone} onChange={(e) => setPairingPhone(e.target.value)} placeholder="5561999999999" className="flex-1 min-w-0" />
                  <Button variant="outline" onClick={handlePair} disabled={pairingLoading || !pairingPhone.trim()} className="gap-2 shrink-0">
                    {pairingLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />} Código
                  </Button>
                </div>
              )}
            </div>

            {/* Pairing code result */}
            {pairingCode && (
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">Digite este código no WhatsApp:</p>
                <p className="text-3xl font-mono font-bold tracking-widest">{pairingCode}</p>
                <p className="text-xs text-muted-foreground mt-2">O código expira em alguns minutos</p>
              </div>
            )}

            {/* Error display */}
            {pairingError && !showPairingModal && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="h-4 w-4" />
                  <span className="font-medium">Erro no Pareamento</span>
                </div>
                <p className="text-xs text-red-400/80 break-all">{pairingError}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* WhatsApp QR Code Modal */}
      {showPairingModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70" onClick={() => setShowPairingModal(false)}>
          <div className="bg-card border border-border rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg sm:mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-green-400" />
                  Pareamento WhatsApp
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Escaneie o QR Code com seu WhatsApp</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowPairingModal(false)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              {loginLoading ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-green-400" />
                  <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
                  <p className="text-xs text-muted-foreground">Aguarde, isso pode levar até 45 segundos</p>
                </div>
              ) : loginOutput ? (() => {
                const qrLines = loginOutput
                  .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
                  .split('\n')
                  .filter((line: string) => /[█▀▄▌▐░▓]/.test(line))
                  .join('\n')
                return qrLines ? (
                <div className="space-y-3">
                  <div className="bg-white rounded-lg p-2 overflow-x-auto flex justify-center">
                    <pre className="text-black font-mono whitespace-pre select-none mx-auto" style={{ fontSize: 'min(1.8vw, 7px)', lineHeight: 'min(1.8vw, 7px)' }}>{qrLines}</pre>
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs text-muted-foreground">Abra o WhatsApp no celular &gt; Menu &gt; Dispositivos Vinculados &gt; Vincular Dispositivo</p>
                    <p className="text-xs text-muted-foreground">Aponte a câmera para o QR Code acima</p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-green-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Aguardando conexão...
                  </div>
                </div>
                ) : (
                <div className="text-center py-6 space-y-3">
                  <AlertCircle className="h-10 w-10 text-yellow-400 mx-auto" />
                  <p className="text-sm text-yellow-400 font-medium">QR Code não encontrado na resposta</p>
                  <p className="text-xs text-muted-foreground break-all max-h-32 overflow-y-auto">{loginOutput.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim()}</p>
                  <Button variant="outline" size="sm" onClick={handleWhatsAppLogin} className="gap-2 mt-2">
                    <RefreshCw className="h-3 w-3" /> Tentar Novamente
                  </Button>
                </div>
                )
              })() : pairingError ? (
                <div className="text-center py-6 space-y-3">
                  <XCircle className="h-10 w-10 text-red-400 mx-auto" />
                  <p className="text-sm text-red-400 font-medium">Falha ao gerar QR Code</p>
                  <p className="text-xs text-red-400/70 break-all max-h-32 overflow-y-auto">{pairingError}</p>
                  <Button variant="outline" size="sm" onClick={handleWhatsAppLogin} className="gap-2 mt-2">
                    <RefreshCw className="h-3 w-3" /> Tentar Novamente
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Add Channel Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setShowAddModal(false)}>
          <div className="bg-card border border-border rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-3xl max-h-[85vh] sm:max-h-[80vh] overflow-y-auto sm:mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
              <div>
                <h2 className="text-base sm:text-lg font-bold">Adicionar Canal</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">Selecione o tipo de canal para ativar</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 sm:p-6 space-y-6">
              {categories.map((cat) => {
                const items = Object.entries(channelConfig).filter(([, c]) => c.category === cat.key)
                return (
                  <div key={cat.key}>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">{cat.label}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {items.map(([type, meta]) => {
                        const Icon = meta.icon
                        const alreadyActive = activeTypes.has(type as ChannelType)
                        return (
                          <button
                            key={type}
                            disabled={alreadyActive}
                            onClick={() => handleAddChannel(type as ChannelType)}
                            className={cn(
                              'flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                              alreadyActive
                                ? 'border-border/50 opacity-50 cursor-not-allowed'
                                : 'border-border hover:bg-accent cursor-pointer'
                            )}
                          >
                            <div className="h-8 w-8 rounded-full flex items-center justify-center bg-muted shrink-0">
                              <Icon className={cn('h-4 w-4', meta.color)} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{meta.label}</p>
                              <p className="text-xs text-muted-foreground truncate">{alreadyActive ? 'Já ativado' : meta.description}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
