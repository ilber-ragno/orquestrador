import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldHelp } from '@/components/ui/help-tooltip'
import { cn } from '@/lib/utils'
import { t, tLabel, tOptions, tGroup } from '@/lib/term-translations'
import { useToast } from '@/components/ui/toast'
import { useInstance } from '@/context/instance-context'
import {
  Settings2,
  MessageSquare,
  Users,
  Brain,
  Wrench,
  FileText,
  RefreshCcw,
  Save,
  Loader2,
  Radio,
  Plus,
  Trash2,
  Activity,
  Search,
  ExternalLink,
  Shield,
  ShieldCheck,
  ShieldOff,
  Terminal,
  Puzzle,
  Globe,
  Database,
  X,
  AlertTriangle,
  Lock,
  Ban,
  ChevronDown,
} from 'lucide-react'

type TabKey = 'messages' | 'session' | 'agentsDefaults' | 'tools' | 'logging' | 'gateway' | 'commands' | 'plugins' | 'environment'

const tabs: { k: TabKey; l: string; i: typeof MessageSquare }[] = [
  { k: 'messages', l: 'Mensagens', i: MessageSquare },
  { k: 'session', l: 'Sessões', i: Users },
  { k: 'agentsDefaults', l: 'Modelo/IA', i: Brain },
  { k: 'tools', l: 'Ferramentas', i: Wrench },
  { k: 'commands', l: 'Comandos', i: Terminal },
  { k: 'plugins', l: 'Plugins', i: Puzzle },
  { k: 'environment', l: 'Ambiente', i: Globe },
  { k: 'logging', l: 'Logging', i: FileText },
  { k: 'gateway', l: 'Gateway', i: Radio },
]

interface ConfigSections {
  messages: {
    ackReaction: string
    ackReactionScope: string
    removeAckAfterReply: boolean
    responsePrefix: string
    queue: { mode: string; debounceMs: number; cap: number; drop: string }
    inbound: { debounceMs: number }
    tts: { auto: string; mode: string; provider: string; maxTextLength: number; voice: string; summaryModel: string }
    groupChat: { historyLimit: number }
  }
  session: {
    scope: string
    dmScope: string | null
    mainKey: string
    reset: { mode: string; atHour: number; idleMinutes: number; resetTriggers: string[] }
    resetByType: {
      dm: { idleMinutes: number | null }
      group: { idleMinutes: number | null }
      thread: { idleMinutes: number | null }
    }
    identityLinks: Record<string, string[]>
    agentToAgent: { maxPingPongTurns: number }
    sendPolicy: { default_: string; rules: string }
    store: string
  }
  agentsDefaults: {
    thinkingDefault: string
    contextTokens: number | null
    maxConcurrent: number
    timeoutSeconds: number
    blockStreamingDefault: boolean
    blockStreamingChunk: number
    verboseDefault: boolean
    imageModel: string
    fallbackChain: string[]
    heartbeat: { every: string | null; model: string | null; target: string | null }
    workspace: string
    repoRoot: string
    skipBootstrap: boolean
    bootstrapMaxChars: number
    userTimezone: string
    timeFormat: string
    elevatedDefault: string
    mediaMaxMb: number
    contextPruning: { mode: string }
    compaction: { mode: string; memoryFlushEnabled: boolean }
    typingMode: string
    typingIntervalSeconds: number
    humanDelay: { mode: string }
    subagents: { model: string; maxConcurrent: number; archiveAfterMinutes: number }
  }
  tools: {
    profile: string
    allow: string[]
    deny: string[]
    web: { searchEnabled: boolean; fetchEnabled: boolean; searchApiKey: string; searchMaxResults: number; fetchMaxChars: number; fetchReadability: boolean }
    elevated: { enabled: boolean; allowFrom: string[] }
    exec: { backgroundMs: number; timeoutSec: number; cleanupMs: number; applyPatchEnabled: boolean; security: string; safeBins: string[]; ask: string }
    media: { concurrency: number; imageEnabled: boolean; audioEnabled: boolean; videoEnabled: boolean }
    agentToAgent: { enabled: boolean; allow: string[] }
    byProvider: string
    sandboxTools: string
    subagentsTools: string
  }
  logging: {
    level: string
    consoleLevel: string | null
    consoleStyle: string
    file: string
    redactSensitive: string
    redactPatterns: string[]
  }
  gateway: {
    mode: string
    port: number
    bind: string
    auth: { mode: string; token: string; password: string; allowTailscale: boolean }
    remote: { url: string; token: string; tlsFingerprint: string }
    trustedProxies: string[]
    discovery: string
    controlUi: { allowInsecureAuth: boolean; dangerouslyDisableDeviceAuth: boolean }
    nodes: { browserMode: string }
  }
  commands: {
    native: string
    text: boolean
    bash: boolean
    config: boolean
    debug: boolean
    restart: boolean
    useAccessGroups: boolean
  }
  plugins: {
    enabled: boolean
    allow: string[]
    deny: string[]
    loadPaths: string[]
  }
  environment: {
    env: string
    shellEnvEnabled: boolean
    shellEnvTimeoutMs: number
  }
}

const defaultSections: ConfigSections = {
  messages: {
    ackReaction: '',
    ackReactionScope: 'all',
    removeAckAfterReply: true,
    responsePrefix: '',
    queue: { mode: 'collect', debounceMs: 2000, cap: 0, drop: 'old' },
    inbound: { debounceMs: 0 },
    tts: { auto: 'off', mode: 'final', provider: 'openai', maxTextLength: 5000, voice: '', summaryModel: '' },
    groupChat: { historyLimit: 50 },
  },
  session: {
    scope: 'main',
    dmScope: null,
    mainKey: 'main',
    reset: { mode: 'idle', atHour: 0, idleMinutes: 30, resetTriggers: ['/new', '/reset'] },
    resetByType: {
      dm: { idleMinutes: null },
      group: { idleMinutes: null },
      thread: { idleMinutes: null },
    },
    identityLinks: {},
    agentToAgent: { maxPingPongTurns: 5 },
    sendPolicy: { default_: 'allow', rules: '' },
    store: '',
  },
  agentsDefaults: {
    thinkingDefault: 'low',
    contextTokens: null,
    maxConcurrent: 5,
    timeoutSeconds: 120,
    blockStreamingDefault: false,
    blockStreamingChunk: 500,
    verboseDefault: false,
    imageModel: '',
    fallbackChain: [],
    heartbeat: { every: null, model: null, target: null },
    workspace: '',
    repoRoot: '',
    skipBootstrap: false,
    bootstrapMaxChars: 20000,
    userTimezone: '',
    timeFormat: 'auto',
    elevatedDefault: 'off',
    mediaMaxMb: 5,
    contextPruning: { mode: 'off' },
    compaction: { mode: 'default', memoryFlushEnabled: true },
    typingMode: 'never',
    typingIntervalSeconds: 6,
    humanDelay: { mode: 'off' },
    subagents: { model: '', maxConcurrent: 1, archiveAfterMinutes: 60 },
  },
  tools: {
    profile: 'messaging',
    allow: [],
    deny: [],
    web: { searchEnabled: true, fetchEnabled: true, searchApiKey: '', searchMaxResults: 5, fetchMaxChars: 50000, fetchReadability: true },
    elevated: { enabled: false, allowFrom: [] },
    exec: { backgroundMs: 10000, timeoutSec: 1800, cleanupMs: 1800000, applyPatchEnabled: false, security: 'allowlist', safeBins: [], ask: 'on-miss' },
    media: { concurrency: 2, imageEnabled: true, audioEnabled: true, videoEnabled: true },
    agentToAgent: { enabled: false, allow: [] },
    byProvider: '',
    sandboxTools: '',
    subagentsTools: '',
  },
  logging: {
    level: 'info',
    consoleLevel: null,
    consoleStyle: 'pretty',
    file: '',
    redactSensitive: 'tools',
    redactPatterns: [],
  },
  gateway: {
    mode: 'local',
    port: 18789,
    bind: 'loopback',
    auth: { mode: 'token', token: '', password: '', allowTailscale: false },
    remote: { url: '', token: '', tlsFingerprint: '' },
    trustedProxies: [],
    discovery: 'minimal',
    controlUi: { allowInsecureAuth: false, dangerouslyDisableDeviceAuth: false },
    nodes: { browserMode: 'off' },
  },
  commands: {
    native: 'auto',
    text: true,
    bash: false,
    config: false,
    debug: false,
    restart: false,
    useAccessGroups: true,
  },
  plugins: {
    enabled: true,
    allow: [],
    deny: [],
    loadPaths: [],
  },
  environment: {
    env: '',
    shellEnvEnabled: false,
    shellEnvTimeoutMs: 15000,
  },
}

export default function OpenClawConfigPage() {
  const [tab, setTab] = useState<TabKey>('messages')
  const [sections, setSections] = useState<ConfigSections>(defaultSections)
  const [loading, setLoading] = useState(false)
  const [reloading, setReloading] = useState(false)
  const toast = useToast()
  const { selectedId } = useInstance()

  const fetchConfig = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/openclaw-config`)
      if (data.sections) {
        setSections((prev) => deepMergeSections(prev, data.sections))
      }
    } catch {
      toast.error('Falha ao carregar configuração OpenClaw')
    } finally {
      setLoading(false)
    }
  }, [selectedId, toast])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const saveSection = async (section: TabKey) => {
    if (!selectedId) return
    try {
      await api.put(`/instances/${selectedId}/openclaw-config/${section}`, sections[section])
      toast.success(`Seção "${tabs.find((t) => t.k === section)?.l}" salva com sucesso`)
    } catch {
      toast.error('Falha ao salvar configuração')
    }
  }

  const handleReload = async () => {
    if (!selectedId) return
    setReloading(true)
    try {
      await api.post(`/instances/${selectedId}/openclaw-config/reload`)
      toast.success('Gateway recarregado com sucesso')
    } catch {
      toast.error('Falha ao recarregar gateway')
    } finally {
      setReloading(false)
    }
  }

  const handleGatewayAction = async (action: 'status' | 'probe' | 'restart') => {
    if (!selectedId) return
    try {
      const { data } = await api.post(`/instances/${selectedId}/openclaw-config/gateway-action`, { action })
      toast.success(data.message || `Ação "${action}" executada`)
    } catch {
      toast.error(`Falha ao executar ação "${action}"`)
    }
  }

  const updateSection = <K extends keyof ConfigSections>(section: K, value: ConfigSections[K]) => {
    setSections((prev) => ({ ...prev, [section]: value }))
  }

  if (!selectedId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuração OpenClaw</h1>
          <p className="text-muted-foreground text-sm mt-1">Selecione uma instância para configurar</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings2 className="h-5 w-5 sm:h-6 sm:w-6" /> <span className="sm:hidden">OpenClaw</span><span className="hidden sm:inline">Configuração OpenClaw</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Editor visual das seções de configuração do OpenClaw
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleReload}
          disabled={reloading}
        >
          {reloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Recarregar Gateway
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto max-w-full flex-wrap sm:flex-nowrap sm:w-fit">
        {tabs.map(({ k, l, i: Icon }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              'px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0',
              tab === k
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 inline mr-1 sm:mr-1.5 -mt-0.5" />
            <span className="hidden sm:inline">{l}</span>
            <span className="sm:hidden">{l.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {tab === 'messages' && (
            <MessagesPanel
              data={sections.messages}
              onChange={(v) => updateSection('messages', v)}
              onSave={() => saveSection('messages')}
            />
          )}
          {tab === 'session' && (
            <SessionPanel
              data={sections.session}
              onChange={(v) => updateSection('session', v)}
              onSave={() => saveSection('session')}
            />
          )}
          {tab === 'agentsDefaults' && (
            <AgentsDefaultsPanel
              data={sections.agentsDefaults}
              onChange={(v) => updateSection('agentsDefaults', v)}
              onSave={() => saveSection('agentsDefaults')}
            />
          )}
          {tab === 'tools' && (
            <ToolsPanel
              data={sections.tools}
              onChange={(v) => updateSection('tools', v)}
              onSave={() => saveSection('tools')}
            />
          )}
          {tab === 'logging' && (
            <LoggingPanel
              data={sections.logging}
              onChange={(v) => updateSection('logging', v)}
              onSave={() => saveSection('logging')}
            />
          )}
          {tab === 'gateway' && (
            <GatewayPanel
              data={sections.gateway}
              onChange={(v) => updateSection('gateway', v)}
              onSave={() => saveSection('gateway')}
              onAction={handleGatewayAction}
            />
          )}
          {tab === 'commands' && (
            <CommandsPanel
              data={sections.commands}
              onChange={(v) => updateSection('commands', v)}
              onSave={() => saveSection('commands')}
            />
          )}
          {tab === 'plugins' && (
            <PluginsPanel
              data={sections.plugins}
              onChange={(v) => updateSection('plugins', v)}
              onSave={() => saveSection('plugins')}
            />
          )}
          {tab === 'environment' && (
            <EnvironmentPanel
              data={sections.environment}
              onChange={(v) => updateSection('environment', v)}
              onSave={() => saveSection('environment')}
            />
          )}
        </>
      )}
    </div>
  )
}

/* ─── Helpers ─── */

function deepMergeSections(target: any, source: any): any {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] !== undefined && source[key] !== null) {
      if (typeof source[key] === 'object' && !Array.isArray(source[key]) && typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
        result[key] = deepMergeSections(result[key], source[key])
      } else {
        result[key] = source[key]
      }
    }
  }
  return result
}

function SelectField({
  label,
  description,
  value,
  onChange,
  options,
  helpField,
}: {
  label: string
  description?: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  helpField?: string
}) {
  return (
    <div>
      <div className="flex items-center">
        <Label className="text-xs">{label}</Label>
        {helpField && <FieldHelp field={helpField} />}
      </div>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      <select
        className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function CheckboxField({
  label,
  description,
  checked,
  onChange,
  helpField,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  helpField?: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-input accent-primary"
      />
      <div className="flex items-center">
        <span className="text-sm font-medium">{label}</span>
        {helpField && <FieldHelp field={helpField} />}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </label>
  )
}

function TagInput({
  label,
  description,
  values,
  onChange,
  placeholder,
  helpField,
}: {
  label: string
  description?: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  helpField?: string
}) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const trimmed = input.trim()
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed])
      setInput('')
    }
  }

  return (
    <div>
      <div className="flex items-center">
        <Label className="text-xs">{label}</Label>
        {helpField && <FieldHelp field={helpField} />}
      </div>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      <div className="flex gap-2 mt-1">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder || 'Digite e pressione Enter'}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} className="shrink-0">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {values.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-mono"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Label with help tooltip — shorthand for inline labels */
function LH({ text, field, className }: { text: string; field: string; className?: string }) {
  return (
    <div className={cn('flex items-center', className)}>
      <Label className="text-xs">{text}</Label>
      <FieldHelp field={field} />
    </div>
  )
}

function SaveButton({ onClick, saving }: { onClick: () => void; saving?: boolean }) {
  return (
    <div className="flex justify-end pt-4 border-t border-border">
      <Button className="gap-2" onClick={onClick} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar
      </Button>
    </div>
  )
}

function AdvancedToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors pt-2"
    >
      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      {open ? 'Ocultar configurações avançadas' : 'Mostrar configurações avançadas'}
    </button>
  )
}

/* ─── Mensagens ─── */

function MessagesPanel({
  data,
  onChange,
  onSave,
}: {
  data: ConfigSections['messages']
  onChange: (v: ConfigSections['messages']) => void
  onSave: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Mensagens
        </CardTitle>
        <CardDescription>Como o assistente reage e responde às mensagens. Os padrões funcionam bem para a maioria dos casos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <LH text="Reação de confirmação" field="messages.ackReaction" />
            <Input
              className="mt-1"
              value={data.ackReaction}
              onChange={(e) => onChange({ ...data, ackReaction: e.target.value })}
              placeholder="Ex: \uD83D\uDC4D"
            />
          </div>
          <div>
            <LH text="Histórico em grupos" field="messages.groupChat.historyLimit" />
            <p className="text-xs text-muted-foreground mt-0.5">Mensagens recentes a incluir como contexto em grupos</p>
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={500}
              value={data.groupChat.historyLimit}
              onChange={(e) =>
                onChange({ ...data, groupChat: { ...data.groupChat, historyLimit: Number(e.target.value) } })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <CheckboxField
              label="Remover reação após resposta"
              helpField="messages.removeAckAfterReply"
              description="Remove a reação de confirmação quando o bot responde"
              checked={data.removeAckAfterReply}
              onChange={(v) => onChange({ ...data, removeAckAfterReply: v })}
            />
          </div>
          <div className="sm:col-span-2">
            <LH text="Prefixo de resposta" field="messages.responsePrefix" />
            <p className="text-xs text-muted-foreground mt-0.5">
              Variáveis disponíveis: {'{model}'}, {'{provider}'}, {'{thinkingLevel}'}, {'{identity.name}'}
            </p>
            <Input
              className="mt-1"
              value={data.responsePrefix}
              onChange={(e) => onChange({ ...data, responsePrefix: e.target.value })}
              placeholder="Ex: [{model}] ou [Bot]"
            />
          </div>
        </div>

        <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />

        {showAdvanced && (<>
        <div className="border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label={tLabel('ackReactionScope')}
              helpField="messages.ackReactionScope"
              value={data.ackReactionScope}
              onChange={(v) => onChange({ ...data, ackReactionScope: v })}
              options={tOptions(['all', 'group-mentions', 'groups', 'none'], 'messages.ackReactionScope')}
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Fila de mensagens</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SelectField
              label={tLabel('queue.mode')}
              helpField="messages.queue.mode"
              value={data.queue.mode}
              onChange={(v) => onChange({ ...data, queue: { ...data.queue, mode: v } })}
              options={tOptions(['collect', 'steer', 'followup', 'interrupt'], 'messages.queue.mode')}
            />
            <div>
              <LH text="Espera antes de processar (ms)" field="messages.queue.debounceMs" />
              <Input
                className="mt-1"
                type="number"
                min={0}
                max={60000}
                value={data.queue.debounceMs}
                onChange={(e) =>
                  onChange({ ...data, queue: { ...data.queue, debounceMs: Number(e.target.value) } })
                }
              />
            </div>
            <div>
              <LH text="Limite da fila" field="messages.queue.cap" />
              <p className="text-xs text-muted-foreground mt-0.5">0 = sem limite</p>
              <Input
                className="mt-1"
                type="number"
                min={0}
                max={100}
                value={data.queue.cap}
                onChange={(e) =>
                  onChange({ ...data, queue: { ...data.queue, cap: Number(e.target.value) } })
                }
              />
            </div>
            <SelectField
              label={tLabel('queue.drop')}
              helpField="messages.queue.drop"
              description="Ação quando a fila atinge a capacidade"
              value={data.queue.drop}
              onChange={(v) => onChange({ ...data, queue: { ...data.queue, drop: v } })}
              options={tOptions(['old', 'new', 'summarize'], 'messages.queue.drop')}
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Inbound</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <LH text="Espera de entrada (ms)" field="messages.inbound.debounceMs" />
              <p className="text-xs text-muted-foreground mt-0.5">Atraso antes de processar mensagem recebida</p>
              <Input
                className="mt-1"
                type="number"
                min={0}
                max={60000}
                value={data.inbound.debounceMs}
                onChange={(e) =>
                  onChange({ ...data, inbound: { ...data.inbound, debounceMs: Number(e.target.value) } })
                }
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Texto para Fala (TTS)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SelectField
              label={tLabel('tts.auto')}
              helpField="messages.tts.auto"
              value={data.tts.auto}
              onChange={(v) => onChange({ ...data, tts: { ...data.tts, auto: v } })}
              options={tOptions(['off', 'always', 'inbound', 'tagged'], 'messages.tts.auto')}
            />
            <SelectField
              label={tLabel('tts.mode')}
              helpField="messages.tts.mode"
              value={data.tts.mode}
              onChange={(v) => onChange({ ...data, tts: { ...data.tts, mode: v } })}
              options={tOptions(['final', 'all'], 'messages.tts.mode')}
            />
            <SelectField
              label={tLabel('tts.provider')}
              helpField="messages.tts.provider"
              value={data.tts.provider}
              onChange={(v) => onChange({ ...data, tts: { ...data.tts, provider: v } })}
              options={[
                { value: 'elevenlabs', label: 'ElevenLabs' },
                { value: 'openai', label: 'OpenAI' },
              ]}
            />
            <div>
              <LH text="Voz do assistente" field="messages.tts.voice" />
              <Input
                className="mt-1"
                value={data.tts.voice}
                onChange={(e) => onChange({ ...data, tts: { ...data.tts, voice: e.target.value } })}
                placeholder="Ex: alloy, nova, shimmer"
              />
            </div>
            <div>
              <LH text="Limite para áudio" field="messages.tts.maxTextLength" />
              <Input
                className="mt-1"
                type="number"
                min={100}
                max={50000}
                value={data.tts.maxTextLength}
                onChange={(e) =>
                  onChange({ ...data, tts: { ...data.tts, maxTextLength: Number(e.target.value) } })
                }
              />
            </div>
            <div>
              <LH text="Modelo de resumo para áudio" field="messages.tts.summaryModel" />
              <p className="text-xs text-muted-foreground mt-0.5">Modelo para resumir textos longos antes do TTS</p>
              <Input
                className="mt-1"
                value={data.tts.summaryModel}
                onChange={(e) => onChange({ ...data, tts: { ...data.tts, summaryModel: e.target.value } })}
                placeholder="Ex: sonnet, gpt-mini"
              />
            </div>
          </div>
        </div>
        </>)}

        <SaveButton onClick={handleSave} saving={saving} />
      </CardContent>
    </Card>
  )
}

/* ─── Sessoes ─── */

function SessionPanel({
  data,
  onChange,
  onSave,
}: {
  data: ConfigSections['session']
  onChange: (v: ConfigSections['session']) => void
  onSave: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [newLinkName, setNewLinkName] = useState('')
  const [newLinkAddr, setNewLinkAddr] = useState('')
  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  const addIdentityLink = () => {
    const name = newLinkName.trim()
    const addr = newLinkAddr.trim()
    if (!name || !addr) return
    const existing = data.identityLinks[name] || []
    if (!existing.includes(addr)) {
      onChange({
        ...data,
        identityLinks: { ...data.identityLinks, [name]: [...existing, addr] },
      })
    }
    setNewLinkAddr('')
  }

  const removeIdentityAddr = (name: string, addr: string) => {
    const updated = (data.identityLinks[name] || []).filter((a) => a !== addr)
    if (updated.length === 0) {
      const { [name]: _, ...rest } = data.identityLinks
      onChange({ ...data, identityLinks: rest })
    } else {
      onChange({ ...data, identityLinks: { ...data.identityLinks, [name]: updated } })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" /> Sessões
        </CardTitle>
        <CardDescription>Controla quando as conversas são reiniciadas. Os padrões funcionam bem para a maioria dos casos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label={tLabel('reset.mode')}
            helpField="sessions.reset.mode"
            value={data.reset.mode}
            onChange={(v) => onChange({ ...data, reset: { ...data.reset, mode: v } })}
            options={tOptions(['daily', 'idle'], 'session.reset.mode')}
          />
          {data.reset.mode === 'daily' && (
            <div>
              <LH text="Hora do reset diário" field="sessions.reset.atHour" />
              <Input
                className="mt-1"
                type="number"
                min={0}
                max={23}
                value={data.reset.atHour}
                onChange={(e) =>
                  onChange({ ...data, reset: { ...data.reset, atHour: Number(e.target.value) } })
                }
              />
            </div>
          )}
          {data.reset.mode === 'idle' && (
            <div>
              <LH text="Minutos de inatividade" field="sessions.reset.idleMinutes" />
              <Input
                className="mt-1"
                type="number"
                min={1}
                value={data.reset.idleMinutes}
                onChange={(e) =>
                  onChange({ ...data, reset: { ...data.reset, idleMinutes: Number(e.target.value) } })
                }
              />
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-1">Reset Triggers</p>
          <p className="text-xs text-muted-foreground mb-3">
            Comandos que resetam a sessão (ex: /new, /reset)
          </p>
          <TagInput
            label=""
            values={data.reset.resetTriggers}
            onChange={(v) => onChange({ ...data, reset: { ...data.reset, resetTriggers: v } })}
            placeholder="/comando (Enter para adicionar)"
          />
        </div>

        <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />

        {showAdvanced && (<>
        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Escopo e Armazenamento</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label={tLabel('scope')}
              helpField="sessions.scope"
              description="Escopo de sessão padrão"
              value={data.scope}
              onChange={(v) => onChange({ ...data, scope: v })}
              options={tOptions(['main', 'thread', 'channel'], 'session.scope')}
            />
            <SelectField
              label={tLabel('dmScope')}
              helpField="sessions.dmScope"
              description="Escopo de sessão em conversas privadas"
              value={data.dmScope || ''}
              onChange={(v) => onChange({ ...data, dmScope: v || null })}
              options={[
                { value: '', label: 'Herdar do escopo principal' },
                ...tOptions(['main', 'thread', 'channel'], 'session.scope'),
              ]}
            />
            <div>
              <LH text="Chave principal" field="sessions.mainKey" />
              <p className="text-xs text-muted-foreground mt-0.5">Identificador da sessão principal</p>
              <Input
                className="mt-1"
                value={data.mainKey}
                onChange={(e) => onChange({ ...data, mainKey: e.target.value })}
                placeholder="main"
              />
            </div>
            <div>
              <LH text="Store" field="sessions.store" />
              <p className="text-xs text-muted-foreground mt-0.5">Backend de armazenamento de sessões</p>
              <Input
                className="mt-1"
                value={data.store}
                onChange={(e) => onChange({ ...data, store: e.target.value })}
                placeholder="Padrão do sistema"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-1">Overrides de reset por tipo</p>
          <p className="text-xs text-muted-foreground mb-3">
            Defina tempos de inatividade específicos por tipo de conversa (deixe vazio para herdar o padrão)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <LH text="Inatividade em privado (min)" field="sessions.reset.dm.idleMinutes" />
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={data.resetByType.dm.idleMinutes ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value)
                  onChange({
                    ...data,
                    resetByType: { ...data.resetByType, dm: { idleMinutes: val } },
                  })
                }}
                placeholder="Herdar padrão"
              />
            </div>
            <div>
              <LH text="Inatividade em grupos (min)" field="sessions.reset.group.idleMinutes" />
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={data.resetByType.group.idleMinutes ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value)
                  onChange({
                    ...data,
                    resetByType: { ...data.resetByType, group: { idleMinutes: val } },
                  })
                }}
                placeholder="Herdar padrão"
              />
            </div>
            <div>
              <LH text="Inatividade em threads (min)" field="sessions.reset.thread.idleMinutes" />
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={data.resetByType.thread.idleMinutes ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value)
                  onChange({
                    ...data,
                    resetByType: { ...data.resetByType, thread: { idleMinutes: val } },
                  })
                }}
                placeholder="Herdar padrão"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-1">Identity Links</p>
          <p className="text-xs text-muted-foreground mb-3">
            Mapeie identidades entre plataformas (ex: alice → telegram:123, whatsapp:+5511...)
          </p>
          <div className="flex gap-2 mb-3">
            <Input
              value={newLinkName}
              onChange={(e) => setNewLinkName(e.target.value)}
              placeholder="Nome (ex: alice)"
              className="w-36"
            />
            <Input
              value={newLinkAddr}
              onChange={(e) => setNewLinkAddr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addIdentityLink()
                }
              }}
              placeholder="Endereço (ex: telegram:123456)"
              className="flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={addIdentityLink} className="shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {Object.keys(data.identityLinks).length > 0 && (
            <div className="space-y-2">
              {Object.entries(data.identityLinks).map(([name, addrs]) => (
                <div key={name} className="p-2 rounded-md bg-muted">
                  <span className="text-sm font-medium">{name}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {addrs.map((addr) => (
                      <span
                        key={addr}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background text-xs font-mono"
                      >
                        {addr}
                        <button
                          type="button"
                          onClick={() => removeIdentityAddr(name, addr)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-1">Agent-to-Agent</p>
          <p className="text-xs text-muted-foreground mb-3">
            Configurações de comunicação entre agentes
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <LH text="Limite de idas e vindas (0-5)" field="sessions.agentToAgent.maxPingPongTurns" />
              <Input
                className="mt-1"
                type="number"
                min={0}
                max={5}
                value={data.agentToAgent.maxPingPongTurns}
                onChange={(e) =>
                  onChange({ ...data, agentToAgent: { ...data.agentToAgent, maxPingPongTurns: Number(e.target.value) } })
                }
              />
            </div>
            <SelectField
              label={tLabel('sendPolicy.default_')}
              helpField="sessions.sendPolicy.default"
              description="Política padrão de envio de mensagens"
              value={data.sendPolicy.default_}
              onChange={(v) => onChange({ ...data, sendPolicy: { ...data.sendPolicy, default_: v } })}
              options={tOptions(['allow', 'deny'])}
            />
            <div className="sm:col-span-2">
              <LH text="Regras de roteamento" field="sessions.sendPolicy.rules" />
              <p className="text-xs text-muted-foreground mt-0.5">Regras avançadas de roteamento em formato JSON</p>
              <textarea
                className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y"
                value={data.sendPolicy.rules}
                onChange={(e) => onChange({ ...data, sendPolicy: { ...data.sendPolicy, rules: e.target.value } })}
                placeholder='[{"from": "agent-a", "to": "agent-b", "action": "allow"}]'
              />
            </div>
          </div>
        </div>
        </>)}

        <SaveButton onClick={handleSave} saving={saving} />
      </CardContent>
    </Card>
  )
}

/* ─── Modelo/IA ─── */

const modelAliases = [
  { alias: 'opus', model: 'claude-opus-4-5-20251101' },
  { alias: 'sonnet', model: 'claude-sonnet-4-20250514' },
  { alias: 'gpt', model: 'gpt-4.1' },
  { alias: 'gpt-mini', model: 'gpt-4.1-mini' },
  { alias: 'gemini', model: 'gemini-2.5-pro' },
  { alias: 'gemini-flash', model: 'gemini-2.5-flash' },
]

function AgentsDefaultsPanel({
  data,
  onChange,
  onSave,
}: {
  data: ConfigSections['agentsDefaults']
  onChange: (v: ConfigSections['agentsDefaults']) => void
  onSave: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4" /> Modelo / IA
        </CardTitle>
        <CardDescription>Configurações do modelo de inteligência artificial. Os padrões já estão otimizados.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SelectField
            label={tLabel('thinkingDefault')}
            helpField="ia.thinkingDefault"
            value={data.thinkingDefault}
            onChange={(v) => onChange({ ...data, thinkingDefault: v })}
            options={tOptions(['xhigh', 'high', 'medium', 'low', 'minimal', 'off'], 'agentsDefaults.thinkingDefault')}
          />
          <div>
            <LH text="Conversas simultâneas" field="ia.maxConcurrent" />
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={50}
              value={data.maxConcurrent}
              onChange={(e) => onChange({ ...data, maxConcurrent: Number(e.target.value) })}
            />
          </div>
          <div>
            <LH text="Tempo máximo de resposta (s)" field="ia.timeoutSeconds" />
            <Input
              className="mt-1"
              type="number"
              min={10}
              max={600}
              value={data.timeoutSeconds}
              onChange={(e) => onChange({ ...data, timeoutSeconds: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <TagInput
            label="Modelos alternativos"
            helpField="ia.fallbackChain"
            description="Lista ordenada de modelos substitutos (ex: opus, sonnet, gpt). O primeiro é o principal."
            values={data.fallbackChain}
            onChange={(v) => onChange({ ...data, fallbackChain: v })}
            placeholder="Alias ou ID do modelo"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label={tLabel('typingMode')}
            helpField="ia.typingMode"
            description="Quando mostrar indicador de digitação"
            value={data.typingMode}
            onChange={(v) => onChange({ ...data, typingMode: v })}
            options={tOptions(['never', 'instant', 'thinking', 'message'], 'agentsDefaults.typingMode')}
          />
          <SelectField
            label={tLabel('humanDelay.mode')}
            helpField="ia.humanDelay"
            description="Simula atraso humano nas respostas"
            value={data.humanDelay.mode}
            onChange={(v) => onChange({ ...data, humanDelay: { mode: v } })}
            options={tOptions(['off', 'natural', 'custom'], 'agentsDefaults.humanDelay.mode')}
          />
        </div>

        <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />

        {showAdvanced && (<>
        <div className="border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <LH text="Tamanho do contexto" field="ia.contextTokens" />
              <p className="text-xs text-muted-foreground mt-0.5">Padrão: 200000. Deixe vazio para padrão.</p>
              <Input
                className="mt-1"
                type="number"
                min={1000}
                max={1000000}
                value={data.contextTokens ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value)
                  onChange({ ...data, contextTokens: val })
                }}
                placeholder="200000"
              />
            </div>
            <div>
              <LH text="Tamanho de envio parcial" field="ia.blockStreamingChunk" />
              <Input
                className="mt-1"
                type="number"
                min={100}
                max={5000}
                value={data.blockStreamingChunk}
                onChange={(e) => onChange({ ...data, blockStreamingChunk: Number(e.target.value) })}
              />
            </div>
            <div>
              <LH text="Modelo de imagem" field="ia.imageModel" />
              <Input
                className="mt-1"
                value={data.imageModel}
                onChange={(e) => onChange({ ...data, imageModel: e.target.value })}
                placeholder="Ex: dall-e-3"
              />
            </div>
            <div className="flex items-end">
              <CheckboxField
                label="Enviar resposta completa"
                helpField="ia.blockStreaming"
                description="Envia resposta completa ao invés de streaming"
                checked={data.blockStreamingDefault}
                onChange={(v) => onChange({ ...data, blockStreamingDefault: v })}
              />
            </div>
            <div className="flex items-end">
              <CheckboxField
                label="Modo detalhado"
                helpField="ia.verboseDefault"
                description="Modo detalhado para respostas dos agentes"
                checked={data.verboseDefault}
                onChange={(v) => onChange({ ...data, verboseDefault: v })}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-1">Verificação periódica</p>
          <p className="text-xs text-muted-foreground mb-3">Execução automática do agente em intervalos regulares</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <LH text="Frequência do heartbeat" field="ia.heartbeat.every" />
              <Input
                className="mt-1"
                value={data.heartbeat.every ?? ''}
                onChange={(e) =>
                  onChange({ ...data, heartbeat: { ...data.heartbeat, every: e.target.value || null } })
                }
                placeholder="Ex: 30m, 1h"
              />
            </div>
            <div>
              <LH text="Modelo do heartbeat" field="ia.heartbeat.model" />
              <Input
                className="mt-1"
                value={data.heartbeat.model ?? ''}
                onChange={(e) =>
                  onChange({ ...data, heartbeat: { ...data.heartbeat, model: e.target.value || null } })
                }
                placeholder="Ex: sonnet"
              />
            </div>
            <div>
              <LH text="Destino do heartbeat" field="ia.heartbeat.target" />
              <Input
                className="mt-1"
                value={data.heartbeat.target ?? ''}
                onChange={(e) =>
                  onChange({ ...data, heartbeat: { ...data.heartbeat, target: e.target.value || null } })
                }
                placeholder="Ex: telegram:chat123"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Workspace e Bootstrap</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <LH text="Pasta de trabalho" field="ia.workspace" />
              <p className="text-xs text-muted-foreground mt-0.5">Diretório de trabalho do agente</p>
              <Input
                className="mt-1"
                value={data.workspace}
                onChange={(e) => onChange({ ...data, workspace: e.target.value })}
                placeholder="~/.openclaw/workspace"
              />
            </div>
            <div>
              <LH text="Raiz do repositório" field="ia.repoRoot" />
              <Input
                className="mt-1"
                value={data.repoRoot}
                onChange={(e) => onChange({ ...data, repoRoot: e.target.value })}
                placeholder="Raiz do repositório"
              />
            </div>
            <div>
              <LH text="Tamanho da inicialização" field="ia.bootstrapMaxChars" />
              <Input
                className="mt-1"
                type="number"
                min={1000}
                max={100000}
                value={data.bootstrapMaxChars}
                onChange={(e) => onChange({ ...data, bootstrapMaxChars: Number(e.target.value) })}
              />
            </div>
            <div>
              <LH text="Fuso horário" field="ia.userTimezone" />
              <Input
                className="mt-1"
                value={data.userTimezone}
                onChange={(e) => onChange({ ...data, userTimezone: e.target.value })}
                placeholder="Ex: America/Sao_Paulo"
              />
            </div>
            <SelectField
              label={tLabel('timeFormat')}
              helpField="ia.timeFormat"
              value={data.timeFormat}
              onChange={(v) => onChange({ ...data, timeFormat: v })}
              options={tOptions(['auto', '12', '24'], 'agentsDefaults.timeFormat')}
            />
            <div>
              <LH text="Tamanho máximo de mídia (MB)" field="ia.mediaMaxMb" />
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={100}
                value={data.mediaMaxMb}
                onChange={(e) => onChange({ ...data, mediaMaxMb: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-end">
              <CheckboxField
                label="Pular inicialização"
                helpField="ia.skipBootstrap"
                description="Ignora o carregamento inicial de contexto"
                checked={data.skipBootstrap}
                onChange={(v) => onChange({ ...data, skipBootstrap: v })}
              />
            </div>
            <SelectField
              label={tLabel('elevatedDefault')}
              helpField="ia.elevatedDefault"
              description="Permissões elevadas por padrão"
              value={data.elevatedDefault}
              onChange={(v) => onChange({ ...data, elevatedDefault: v })}
              options={tOptions(['on', 'off'])}
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Comportamento de Resposta</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SelectField
              label={tLabel('contextPruning.mode')}
              helpField="ia.contextPruning"
              description="Modo de poda de contexto para conversas longas"
              value={data.contextPruning.mode}
              onChange={(v) => onChange({ ...data, contextPruning: { mode: v } })}
              options={tOptions(['off', 'adaptive', 'aggressive'], 'agentsDefaults.contextPruning.mode')}
            />
            <SelectField
              label={tLabel('compaction.mode')}
              helpField="ia.compaction"
              description="Modo de compactação de contexto"
              value={data.compaction.mode}
              onChange={(v) => onChange({ ...data, compaction: { ...data.compaction, mode: v } })}
              options={tOptions(['default', 'safeguard'], 'agentsDefaults.compaction.mode')}
            />
            <div className="flex items-end">
              <CheckboxField
                label="Salvar memória ao compactar"
                helpField="ia.memoryFlush"
                description="Flush de memória durante compactação"
                checked={data.compaction.memoryFlushEnabled}
                onChange={(v) => onChange({ ...data, compaction: { ...data.compaction, memoryFlushEnabled: v } })}
              />
            </div>
            <div>
              <LH text="Frequência do digitando (s)" field="ia.typingInterval" />
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={60}
                value={data.typingIntervalSeconds}
                onChange={(e) => onChange({ ...data, typingIntervalSeconds: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Subagentes</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <LH text="Modelo dos sub-agentes" field="ia.subagents.model" />
              <Input
                className="mt-1"
                value={data.subagents.model}
                onChange={(e) => onChange({ ...data, subagents: { ...data.subagents, model: e.target.value } })}
                placeholder="Ex: sonnet"
              />
            </div>
            <div>
              <LH text="Sub-agentes simultâneos" field="ia.subagents.maxConcurrent" />
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={10}
                value={data.subagents.maxConcurrent}
                onChange={(e) => onChange({ ...data, subagents: { ...data.subagents, maxConcurrent: Number(e.target.value) } })}
              />
            </div>
            <div>
              <LH text="Arquivar sub-agente após (min)" field="ia.subagents.archiveAfterMinutes" />
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={1440}
                value={data.subagents.archiveAfterMinutes}
                onChange={(e) => onChange({ ...data, subagents: { ...data.subagents, archiveAfterMinutes: Number(e.target.value) } })}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-2">Aliases de Modelo (referência)</p>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Alias</th>
                  <th className="text-left px-3 py-1.5 font-medium">Modelo</th>
                </tr>
              </thead>
              <tbody>
                {modelAliases.map((a) => (
                  <tr key={a.alias} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono font-medium">{a.alias}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{a.model}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>)}

        <SaveButton onClick={handleSave} saving={saving} />
      </CardContent>
    </Card>
  )
}

/* ─── Ferramentas ─── */

const profileDescriptions: Record<string, string> = {
  minimal: 'Apenas ferramentas essenciais. Ideal para bots simples.',
  coding: 'Inclui ferramentas de execução de código e arquivos.',
  messaging: 'Otimizado para bots de mensageria com integrações.',
  full: 'Todas as ferramentas disponíveis.',
}

const toolGroups = [
  { value: 'group:fs', label: tGroup('group:fs') },
  { value: 'group:runtime', label: tGroup('group:runtime') },
  { value: 'group:sessions', label: tGroup('group:sessions') },
  { value: 'group:memory', label: tGroup('group:memory') },
  { value: 'group:web', label: tGroup('group:web') },
  { value: 'group:ui', label: tGroup('group:ui') },
]

const SUGGESTED_BINS = [
  'wget', 'node', 'npm', 'npx', 'pip3', 'git',
  'docker', 'ffmpeg', 'openssl', 'systemctl', 'tar',
  'unzip', 'ssh', 'scp', 'rsync', 'jq', 'sed', 'awk',
  'chmod', 'chown', 'touch', 'rm', 'wc', 'sort', 'diff',
  'python3', 'curl', 'ls', 'cat', 'head', 'tail', 'grep',
  'find', 'df', 'free', 'mkdir', 'cp', 'mv',
]

function ExecSafeBinsEditor({
  safeBins,
  onChange,
}: {
  safeBins: string[]
  onChange: (bins: string[]) => void
}) {
  const [newBin, setNewBin] = useState('')

  const addBin = (bin: string) => {
    const trimmed = bin.trim().toLowerCase()
    if (!trimmed || safeBins.includes(trimmed)) return
    if (!/^[a-zA-Z0-9._\/-]+$/.test(trimmed)) return
    onChange([...safeBins, trimmed])
    setNewBin('')
  }

  const removeBin = (bin: string) => {
    onChange(safeBins.filter((b) => b !== bin))
  }

  const suggestions = SUGGESTED_BINS.filter((b) => !safeBins.includes(b))

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Programas na lista ({safeBins.length})</p>
        {safeBins.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum programa na lista. Adicione abaixo.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {safeBins.map((bin) => (
              <span
                key={bin}
                className="inline-flex items-center gap-1 px-2 py-1 sm:py-0.5 rounded-md text-xs font-mono bg-primary/10 text-primary border border-primary/20"
              >
                {bin}
                <button
                  type="button"
                  onClick={() => removeBin(bin)}
                  className="ml-0.5 p-0.5 -mr-0.5 hover:text-red-500 active:text-red-600 transition-colors rounded"
                  title={`Remover ${bin}`}
                >
                  <X className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          className="flex-1 font-mono text-sm sm:text-xs h-10 sm:h-9"
          placeholder="Nome do programa (ex: wget)"
          value={newBin}
          onChange={(e) => setNewBin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addBin(newBin)
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 sm:h-9 w-full sm:w-auto shrink-0"
          onClick={() => addBin(newBin)}
          disabled={!newBin.trim()}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Sugestões</p>
          <div className="flex flex-wrap gap-1.5 sm:gap-1">
            {suggestions.slice(0, 20).map((bin) => (
              <button
                key={bin}
                type="button"
                onClick={() => addBin(bin)}
                className="px-2.5 py-1.5 sm:px-2 sm:py-0.5 rounded text-xs sm:text-[11px] font-mono border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors"
              >
                + {bin}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ToolsPanel({
  data,
  onChange,
  onSave,
}: {
  data: ConfigSections['tools']
  onChange: (v: ConfigSections['tools']) => void
  onSave: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  const toggleGroupInList = (list: 'allow' | 'deny', group: string) => {
    const current = data[list]
    if (current.includes(group)) {
      onChange({ ...data, [list]: current.filter((g) => g !== group) })
    } else {
      onChange({ ...data, [list]: [...current, group] })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4" /> Ferramentas
        </CardTitle>
        <CardDescription>O que o assistente pode fazer: quais ferramentas, programas e acessos estão liberados.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <SelectField
              label={tLabel('profile')}
              helpField="tools.profile"
              description={profileDescriptions[data.profile] || ''}
              value={data.profile}
              onChange={(v) => onChange({ ...data, profile: v })}
              options={tOptions(['minimal', 'coding', 'messaging', 'full'], 'tools.profile')}
            />
          </div>
        </div>

        {/* ─── Presets de Permissões ─── */}
        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Configuração rápida</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              {
                label: 'Atendimento',
                emoji: '💬',
                desc: 'Responder mensagens, buscar na web, processar mídia',
                apply: () => onChange({
                  ...data,
                  profile: 'messaging',
                  web: { ...data.web, searchEnabled: true, fetchEnabled: true },
                  media: { ...data.media, imageEnabled: true, audioEnabled: true, videoEnabled: false },
                  exec: { ...data.exec, security: 'allowlist', safeBins: ['curl', 'wget', 'jq', 'ffmpeg'], ask: 'on-miss' },
                }),
              },
              {
                label: 'Criação',
                emoji: '🎨',
                desc: 'Tudo de Atendimento + gerar imagens, áudios e vídeos',
                apply: () => onChange({
                  ...data,
                  profile: 'full',
                  web: { ...data.web, searchEnabled: true, fetchEnabled: true },
                  media: { ...data.media, imageEnabled: true, audioEnabled: true, videoEnabled: true },
                  allow: [...new Set([...data.allow, 'group:web', 'group:media'])],
                  exec: { ...data.exec, security: 'allowlist', safeBins: [...new Set([...data.exec.safeBins, 'curl', 'wget', 'ffmpeg', 'python3', 'node', 'jq'])], ask: 'on-miss' },
                }),
              },
              {
                label: 'Técnico',
                emoji: '🛠️',
                desc: 'Tudo liberado: terminal, código, arquivos, internet',
                apply: () => onChange({
                  ...data,
                  profile: 'full',
                  web: { ...data.web, searchEnabled: true, fetchEnabled: true },
                  media: { ...data.media, imageEnabled: true, audioEnabled: true, videoEnabled: true },
                  allow: [...new Set([...data.allow, 'group:web', 'group:media', 'group:fs', 'group:exec'])],
                  exec: { ...data.exec, security: 'full', ask: 'never' },
                  elevated: { ...data.elevated, enabled: true },
                }),
              },
              {
                label: 'Mínimo',
                emoji: '🔒',
                desc: 'Só responder mensagens, sem ferramentas extras',
                apply: () => onChange({
                  ...data,
                  profile: 'minimal',
                  web: { ...data.web, searchEnabled: false, fetchEnabled: false },
                  media: { ...data.media, imageEnabled: false, audioEnabled: false, videoEnabled: false },
                  exec: { ...data.exec, security: 'off', safeBins: [], ask: 'never' },
                  allow: [],
                  deny: [],
                }),
              },
            ]).map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={preset.apply}
                className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-center"
                title={preset.desc}
              >
                <span className="text-xl">{preset.emoji}</span>
                <span className="text-xs font-medium">{preset.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{preset.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Programas Permitidos</p>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Controle quais programas o agente pode usar no terminal do container
          </p>

          {/* Modo de segurança */}
          <p className="text-xs font-medium text-muted-foreground mb-2">Modo de segurança</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            {([
              { value: 'allowlist', label: 'Lista fixa', desc: 'Só os programas da lista abaixo', icon: ShieldCheck, color: 'text-green-600 dark:text-green-400' },
              { value: 'full', label: 'Liberado', desc: 'Pode executar qualquer programa', icon: AlertTriangle, color: 'text-yellow-600 dark:text-yellow-400' },
              { value: 'off', label: 'Bloqueado', desc: 'Não pode executar nada', icon: Ban, color: 'text-red-600 dark:text-red-400' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...data, exec: { ...data.exec, security: opt.value } })}
                className={cn(
                  'flex items-center sm:items-start gap-2 sm:gap-2.5 p-2.5 sm:p-3 rounded-lg border text-left transition-all min-w-0',
                  data.exec.security === opt.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border hover:border-foreground/20',
                )}
              >
                <opt.icon className={cn('h-4 w-4 shrink-0', data.exec.security === opt.value ? opt.color : 'text-muted-foreground')} />
                <div className="min-w-0">
                  <p className={cn('text-xs sm:text-sm font-medium', data.exec.security === opt.value ? '' : 'text-muted-foreground')}>{opt.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 hidden sm:block">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Aviso quando liberado */}
          {data.exec.security === 'full' && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 mb-4">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                O agente pode executar qualquer programa no terminal. Use apenas se confiar totalmente nas ações do agente.
              </p>
            </div>
          )}

          {data.exec.security === 'off' && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/50 mb-4">
              <Ban className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                O agente não pode executar nenhum programa no terminal.
              </p>
            </div>
          )}

          {/* Comportamento de aprovação — só visível se não bloqueado */}
          {data.exec.security !== 'off' && (
            <>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {data.exec.security === 'allowlist' ? 'Quando o agente tenta usar algo fora da lista' : 'Aprovação de comandos'}
              </p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {([
                  { value: 'on-miss', label: 'Pede aprovação', desc: 'Pede sua permissão para comandos novos' },
                  { value: 'always', label: 'Sempre pede', desc: 'Pede permissão para tudo' },
                  { value: 'never', label: 'Nunca pede', desc: 'Executa sem perguntar' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange({ ...data, exec: { ...data.exec, ask: opt.value } })}
                    className={cn(
                      'px-2 sm:px-3 py-2 sm:py-1.5 rounded-md text-[11px] sm:text-xs border transition-colors text-center',
                      data.exec.ask === opt.value
                        ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:border-foreground/20',
                    )}
                    title={opt.desc}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Lista de programas — só visível se allowlist */}
          {data.exec.security === 'allowlist' && (
            <ExecSafeBinsEditor
              safeBins={data.exec.safeBins}
              onChange={(bins) => onChange({ ...data, exec: { ...data.exec, safeBins: bins } })}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CheckboxField
            label="Busca na internet"
            helpField="tools.web.search"
            description="Permite ao agente realizar buscas na internet"
            checked={data.web.searchEnabled}
            onChange={(v) => onChange({ ...data, web: { ...data.web, searchEnabled: v } })}
          />
          <CheckboxField
            label="Acessar páginas web"
            helpField="tools.web.fetch"
            description="Permite ao agente acessar URLs diretamente"
            checked={data.web.fetchEnabled}
            onChange={(v) => onChange({ ...data, web: { ...data.web, fetchEnabled: v } })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CheckboxField
            label="Processar imagens"
            helpField="tools.media.image"
            checked={data.media.imageEnabled}
            onChange={(v) => onChange({ ...data, media: { ...data.media, imageEnabled: v } })}
          />
          <CheckboxField
            label="Processar áudios"
            helpField="tools.media.audio"
            checked={data.media.audioEnabled}
            onChange={(v) => onChange({ ...data, media: { ...data.media, audioEnabled: v } })}
          />
          <CheckboxField
            label="Processar vídeos"
            helpField="tools.media.video"
            checked={data.media.videoEnabled}
            onChange={(v) => onChange({ ...data, media: { ...data.media, videoEnabled: v } })}
          />
        </div>

        {/* ─── Cards visuais por categoria ─── */}
        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Capacidades do assistente</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              {
                icon: '🌐',
                label: 'Internet',
                desc: 'Buscar e acessar páginas',
                active: data.web.searchEnabled || data.web.fetchEnabled,
                toggle: () => {
                  const next = !(data.web.searchEnabled || data.web.fetchEnabled)
                  onChange({ ...data, web: { ...data.web, searchEnabled: next, fetchEnabled: next } })
                },
              },
              {
                icon: '🎨',
                label: 'Criar mídia',
                desc: 'Gerar imagens, áudios, vídeos',
                active: data.media.imageEnabled || data.media.audioEnabled || data.media.videoEnabled,
                toggle: () => {
                  const next = !(data.media.imageEnabled || data.media.audioEnabled || data.media.videoEnabled)
                  onChange({ ...data, media: { ...data.media, imageEnabled: next, audioEnabled: next, videoEnabled: next } })
                },
              },
              {
                icon: '📁',
                label: 'Arquivos',
                desc: 'Ler e escrever arquivos',
                active: data.allow.includes('group:fs'),
                toggle: () => {
                  const has = data.allow.includes('group:fs')
                  onChange({
                    ...data,
                    allow: has ? data.allow.filter(a => a !== 'group:fs') : [...data.allow, 'group:fs'],
                    deny: has ? data.deny : data.deny.filter(d => d !== 'group:fs'),
                  })
                },
              },
              {
                icon: '⚙️',
                label: 'Terminal',
                desc: 'Executar programas',
                active: data.exec.security !== 'off',
                toggle: () => {
                  onChange({
                    ...data,
                    exec: { ...data.exec, security: data.exec.security === 'off' ? 'allowlist' : 'off' },
                  })
                },
              },
            ]).map((cat) => (
              <button
                key={cat.label}
                type="button"
                onClick={cat.toggle}
                className={cn(
                  'flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all',
                  cat.active
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-border hover:border-foreground/20',
                )}
              >
                <span className="text-lg">{cat.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium">{cat.label}</p>
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      cat.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600',
                    )} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{cat.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />

        {showAdvanced && (<>
        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-1">Lista de permitidos</p>
          <p className="text-xs text-muted-foreground mb-3">
            Ferramentas ou grupos permitidos explicitamente (sobrepõe o perfil)
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {toolGroups.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => toggleGroupInList('allow', g.value)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-mono border transition-colors',
                  data.allow.includes(g.value)
                    ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
                    : 'border-border text-muted-foreground hover:border-foreground/30',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <TagInput
            label=""
            values={data.allow.filter((v) => !v.startsWith('group:'))}
            onChange={(v) => onChange({ ...data, allow: [...data.allow.filter((a) => a.startsWith('group:')), ...v] })}
            placeholder="Tool name individual (Enter para adicionar)"
          />
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-1">Lista de bloqueados</p>
          <p className="text-xs text-muted-foreground mb-3">
            Ferramentas ou grupos bloqueados explicitamente
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {toolGroups.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => toggleGroupInList('deny', g.value)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-mono border transition-colors',
                  data.deny.includes(g.value)
                    ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400'
                    : 'border-border text-muted-foreground hover:border-foreground/30',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <TagInput
            label=""
            values={data.deny.filter((v) => !v.startsWith('group:'))}
            onChange={(v) => onChange({ ...data, deny: [...data.deny.filter((a) => a.startsWith('group:')), ...v] })}
            placeholder="Tool name individual (Enter para adicionar)"
          />
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Tempos de execução</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <LH text="Tempo em segundo plano (ms)" field="tools.exec.backgroundMs" />
              <p className="text-xs text-muted-foreground mt-0.5">Tempo para operações em background</p>
              <Input
                className="mt-1"
                type="number"
                min={1000}
                max={120000}
                value={data.exec.backgroundMs}
                onChange={(e) => onChange({ ...data, exec: { ...data.exec, backgroundMs: Number(e.target.value) } })}
              />
            </div>
            <div>
              <LH text="Tempo máximo de execução (s)" field="tools.exec.timeoutSec" />
              <Input
                className="mt-1"
                type="number"
                min={10}
                max={7200}
                value={data.exec.timeoutSec}
                onChange={(e) => onChange({ ...data, exec: { ...data.exec, timeoutSec: Number(e.target.value) } })}
              />
            </div>
            <div>
              <LH text="Limpar processos após (ms)" field="tools.exec.cleanupMs" />
              <Input
                className="mt-1"
                type="number"
                min={10000}
                max={7200000}
                value={data.exec.cleanupMs}
                onChange={(e) => onChange({ ...data, exec: { ...data.exec, cleanupMs: Number(e.target.value) } })}
              />
            </div>
            <div className="flex items-end">
              <CheckboxField
                label="Permitir aplicar correções"
                helpField="tools.exec.applyPatch"
                description="Habilitar apply-patch via exec"
                checked={data.exec.applyPatchEnabled}
                onChange={(v) => onChange({ ...data, exec: { ...data.exec, applyPatchEnabled: v } })}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Web (detalhes avançados)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <CheckboxField
              label="Extrair conteúdo principal"
              helpField="tools.web.readability"
              description="Extrai conteúdo principal de páginas (web.fetch.readability)"
              checked={data.web.fetchReadability}
              onChange={(v) => onChange({ ...data, web: { ...data.web, fetchReadability: v } })}
            />
            <div>
              <LH text="Chave da busca web" field="tools.web.search.apiKey" />
              <Input
                className="mt-1"
                type="password"
                value={data.web.searchApiKey}
                onChange={(e) => onChange({ ...data, web: { ...data.web, searchApiKey: e.target.value } })}
                placeholder="Chave de API para busca web"
              />
            </div>
            <div>
              <LH text="Resultados por busca" field="tools.web.search.maxResults" />
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={10}
                value={data.web.searchMaxResults}
                onChange={(e) => onChange({ ...data, web: { ...data.web, searchMaxResults: Number(e.target.value) } })}
              />
            </div>
            <div>
              <LH text="Limite de leitura de página" field="tools.web.fetch.maxChars" />
              <Input
                className="mt-1"
                type="number"
                min={1000}
                max={500000}
                value={data.web.fetchMaxChars}
                onChange={(e) => onChange({ ...data, web: { ...data.web, fetchMaxChars: Number(e.target.value) } })}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Mídia (concorrência)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <LH text="Mídias simultâneas" field="tools.media.concurrency" />
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={10}
                value={data.media.concurrency}
                onChange={(e) => onChange({ ...data, media: { ...data.media, concurrency: Number(e.target.value) } })}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Comunicação entre agentes</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CheckboxField
              label="Comunicação entre agentes"
              helpField="tools.agentToAgent"
              description="Permite que agentes se comuniquem diretamente"
              checked={data.agentToAgent.enabled}
              onChange={(v) => onChange({ ...data, agentToAgent: { ...data.agentToAgent, enabled: v } })}
            />
            {data.agentToAgent.enabled && (
              <div className="sm:col-span-2">
                <TagInput
                  label="Agentes permitidos"
                  helpField="tools.agentToAgent.allow"
                  description="IDs de agentes que podem se comunicar"
                  values={data.agentToAgent.allow}
                  onChange={(v) => onChange({ ...data, agentToAgent: { ...data.agentToAgent, allow: v } })}
                  placeholder="ID do agente"
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" /> Ferramentas elevadas
          </p>
          <CheckboxField
            label="Ferramentas elevadas"
            helpField="tools.elevated"
            description="Habilita ferramentas que requerem permissões especiais (ex: execução de código, acesso filesystem)"
            checked={data.elevated.enabled}
            onChange={(v) => onChange({ ...data, elevated: { ...data.elevated, enabled: v } })}
          />
          {data.elevated.enabled && (
            <div className="mt-3">
              <TagInput
                label="Permitido para"
                helpField="tools.elevated.allowFrom"
                description="IDs de canal/conta com acesso elevado (E.164 para WhatsApp, IDs para Telegram/Discord)"
                values={data.elevated.allowFrom}
                onChange={(v) => onChange({ ...data, elevated: { ...data.elevated, allowFrom: v } })}
                placeholder="Ex: telegram:123456, whatsapp:+5511999..."
              />
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Configuração avançada (JSON)</p>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <LH text="Políticas por provedor" field="tools.byProvider" />
              <p className="text-xs text-muted-foreground mt-0.5">JSON com políticas de ferramentas por provider</p>
              <textarea
                className="mt-1 w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y"
                value={data.byProvider}
                onChange={(e) => onChange({ ...data, byProvider: e.target.value })}
                placeholder='{"openai": {"allow": ["group:web"]}, "anthropic": {"deny": ["group:fs"]}}'
              />
            </div>
            <div>
              <LH text="Ferramentas do sandbox" field="tools.sandbox" />
              <p className="text-xs text-muted-foreground mt-0.5">JSON com ferramentas disponíveis no sandbox</p>
              <textarea
                className="mt-1 w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y"
                value={data.sandboxTools}
                onChange={(e) => onChange({ ...data, sandboxTools: e.target.value })}
                placeholder='["exec", "fs.read", "fs.write"]'
              />
            </div>
            <div>
              <LH text="Ferramentas dos sub-agentes" field="tools.subagents" />
              <p className="text-xs text-muted-foreground mt-0.5">JSON com ferramentas disponíveis para subagentes</p>
              <textarea
                className="mt-1 w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y"
                value={data.subagentsTools}
                onChange={(e) => onChange({ ...data, subagentsTools: e.target.value })}
                placeholder='["exec", "web.search"]'
              />
            </div>
          </div>
        </div>
        </>)}

        <SaveButton onClick={handleSave} saving={saving} />
      </CardContent>
    </Card>
  )
}

/* ─── Logging ─── */

function LoggingPanel({
  data,
  onChange,
  onSave,
}: {
  data: ConfigSections['logging']
  onChange: (v: ConfigSections['logging']) => void
  onSave: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" /> Logging
        </CardTitle>
        <CardDescription>Controla o nível de detalhe dos registros do sistema. O padrão é suficiente para uso normal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SelectField
          label={tLabel('level')}
          helpField="logging.level"
          value={data.level}
          onChange={(v) => onChange({ ...data, level: v })}
          options={tOptions(['debug', 'info', 'warn', 'error'], 'logging.level')}
        />

        <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />

        {showAdvanced && (<>
        <div className="border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SelectField
              label={tLabel('consoleLevel')}
              helpField="logging.consoleLevel"
              description="Sobrescreve o nível apenas para o terminal"
              value={data.consoleLevel || ''}
              onChange={(v) => onChange({ ...data, consoleLevel: v || null })}
              options={[
                { value: '', label: 'Herdar do nível principal' },
                ...tOptions(['debug', 'info', 'warn', 'error'], 'logging.level'),
              ]}
            />
            <SelectField
              label={tLabel('consoleStyle')}
              helpField="logging.consoleStyle"
              value={data.consoleStyle}
              onChange={(v) => onChange({ ...data, consoleStyle: v })}
              options={tOptions(['pretty', 'compact', 'json'], 'logging.consoleStyle')}
            />
            <SelectField
              label={tLabel('redactSensitive')}
              helpField="logging.redactSensitive"
              description="Controla ocultação de tokens e chaves nos registros"
              value={data.redactSensitive}
              onChange={(v) => onChange({ ...data, redactSensitive: v })}
              options={tOptions(['tools', 'off'], 'logging.redactSensitive')}
            />
            <div className="sm:col-span-2">
              <LH text="Arquivo de log" field="logging.file" />
              <p className="text-xs text-muted-foreground mt-0.5">Caminho customizado para o arquivo de log</p>
              <Input
                className="mt-1"
                value={data.file}
                onChange={(e) => onChange({ ...data, file: e.target.value })}
                placeholder="Ex: /var/log/openclaw/bot.log"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <LH text="Padrões de ocultação" field="logging.redactPatterns" />
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            Expressões regulares para redatar nos logs (uma por linha)
          </p>
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y"
            value={data.redactPatterns.join('\n')}
            onChange={(e) => {
              const lines = e.target.value.split('\n').filter((l) => l.trim() !== '')
              onChange({ ...data, redactPatterns: lines })
            }}
            placeholder="Ex:\nsk-[a-zA-Z0-9]{20,}\nBEARER [a-zA-Z0-9-._~+/]+"
          />
        </div>
        </>)}

        <SaveButton onClick={handleSave} saving={saving} />
      </CardContent>
    </Card>
  )
}

/* ─── Gateway ─── */

function GatewayPanel({
  data,
  onChange,
  onSave,
  onAction,
}: {
  data: ConfigSections['gateway']
  onChange: (v: ConfigSections['gateway']) => void
  onSave: () => void
  onAction: (action: 'status' | 'probe' | 'restart') => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  const handleAction = async (action: 'status' | 'probe' | 'restart') => {
    setActionLoading(action)
    await onAction(action)
    setActionLoading(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-4 w-4" /> Gateway
        </CardTitle>
        <CardDescription>Conexão do assistente com os serviços de mensageria. Altere apenas se souber o que está fazendo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => handleAction('status')}
            disabled={!!actionLoading}
          >
            {actionLoading === 'status' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
            Status
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => handleAction('probe')}
            disabled={!!actionLoading}
          >
            {actionLoading === 'probe' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Probe
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => handleAction('restart')}
            disabled={!!actionLoading}
          >
            {actionLoading === 'restart' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Restart
          </Button>
          {data.port > 0 && (
            <a
              href={`http://127.0.0.1:${data.port}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-border bg-background text-sm hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Control UI
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            label={tLabel('mode')}
            helpField="gateway.mode"
            description="Como o gateway se conecta aos serviços"
            value={data.mode}
            onChange={(v) => onChange({ ...data, mode: v })}
            options={tOptions(['local', 'remote', 'hybrid'], 'gateway.mode')}
          />
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Autenticação</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label={tLabel('auth.mode')}
              helpField="gateway.auth.mode"
              value={data.auth.mode}
              onChange={(v) => onChange({ ...data, auth: { ...data.auth, mode: v } })}
              options={tOptions(['token', 'password'], 'gateway.auth.mode')}
            />
            <div>
              <LH text="Token de acesso" field="gateway.auth.token" />
              <Input
                className="mt-1"
                type="password"
                value={data.auth.token}
                onChange={(e) => onChange({ ...data, auth: { ...data.auth, token: e.target.value } })}
                placeholder="Token de autenticação do gateway"
              />
            </div>
          </div>
        </div>

        <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />

        {showAdvanced && (<>
        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Rede</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <LH text="Porta de comunicação" field="gateway.port" />
              <p className="text-xs text-muted-foreground mt-0.5">Porta TCP do gateway</p>
              <Input
                className="mt-1"
                type="number"
                min={1024}
                max={65535}
                value={data.port}
                onChange={(e) => onChange({ ...data, port: Number(e.target.value) })}
              />
            </div>
            <SelectField
              label={tLabel('bind')}
              helpField="gateway.bind"
              description="Interface de rede para escutar conexões"
              value={data.bind}
              onChange={(v) => onChange({ ...data, bind: v })}
              options={tOptions(['loopback', 'all', 'private'], 'gateway.bind')}
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Acesso Remoto</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <LH text="URL do gateway remoto" field="gateway.remote.url" />
              <Input
                className="mt-1"
                value={data.remote.url}
                onChange={(e) => onChange({ ...data, remote: { ...data.remote, url: e.target.value } })}
                placeholder="https://gateway.example.com"
              />
            </div>
            <div>
              <LH text="Token do gateway remoto" field="gateway.remote.token" />
              <Input
                className="mt-1"
                type="password"
                value={data.remote.token}
                onChange={(e) => onChange({ ...data, remote: { ...data.remote, token: e.target.value } })}
                placeholder="Token do gateway remoto"
              />
            </div>
            <div>
              <LH text="Impressão digital TLS" field="gateway.remote.tlsFingerprint" />
              <Input
                className="mt-1"
                value={data.remote.tlsFingerprint}
                onChange={(e) =>
                  onChange({ ...data, remote: { ...data.remote, tlsFingerprint: e.target.value } })
                }
                placeholder="sha256:..."
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Autenticação extra</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <LH text="Senha do gateway" field="gateway.auth.password" />
              <p className="text-xs text-muted-foreground mt-0.5">Via env OPENCLAW_GATEWAY_PASSWORD</p>
              <Input
                className="mt-1"
                type="password"
                value={data.auth.password}
                onChange={(e) => onChange({ ...data, auth: { ...data.auth, password: e.target.value } })}
                placeholder="Senha do gateway"
              />
            </div>
            <div className="flex items-end">
              <CheckboxField
                label="Permitir Tailscale"
                helpField="gateway.auth.allowTailscale"
                description="Aceitar conexões autenticadas via Tailscale"
                checked={data.auth.allowTailscale}
                onChange={(v) => onChange({ ...data, auth: { ...data.auth, allowTailscale: v } })}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Control UI</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CheckboxField
              label="Permitir autenticação insegura"
              helpField="gateway.controlUi.allowInsecureAuth"
              description="Permite autenticação sem HTTPS na Control UI"
              checked={data.controlUi.allowInsecureAuth}
              onChange={(v) => onChange({ ...data, controlUi: { ...data.controlUi, allowInsecureAuth: v } })}
            />
            <CheckboxField
              label="Desabilitar autenticação de dispositivo"
              helpField="gateway.controlUi.dangerouslyDisableDeviceAuth"
              description="PERIGOSO: Desativa autenticação por dispositivo"
              checked={data.controlUi.dangerouslyDisableDeviceAuth}
              onChange={(v) => onChange({ ...data, controlUi: { ...data.controlUi, dangerouslyDisableDeviceAuth: v } })}
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              label={tLabel('discovery')}
              helpField="gateway.discovery"
              description="Modo de descoberta de rede local"
              value={data.discovery}
              onChange={(v) => onChange({ ...data, discovery: v })}
              options={tOptions(['minimal', 'off', 'full'], 'gateway.discovery')}
            />
            <SelectField
              label={tLabel('nodes.browserMode')}
              helpField="gateway.nodes.browser.mode"
              description="Modo do navegador gerenciado por nodes"
              value={data.nodes.browserMode}
              onChange={(v) => onChange({ ...data, nodes: { ...data.nodes, browserMode: v } })}
              options={tOptions(['off', 'managed', 'external'], 'gateway.nodes.browser.mode')}
            />
            <div>
              <LH text="Proxies confiáveis" field="gateway.trustedProxies" />
              <p className="text-xs text-muted-foreground mt-0.5">Um IP/CIDR por linha</p>
              <textarea
                className="mt-1 w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y"
                value={data.trustedProxies.join('\n')}
                onChange={(e) => {
                  const lines = e.target.value.split('\n').filter((l) => l.trim() !== '')
                  onChange({ ...data, trustedProxies: lines })
                }}
                placeholder="127.0.0.1&#10;10.0.0.0/8"
              />
            </div>
          </div>
        </div>
        </>)}

        <SaveButton onClick={handleSave} saving={saving} />
      </CardContent>
    </Card>
  )
}

/* ─── Comandos ─── */

function CommandsPanel({
  data,
  onChange,
  onSave,
}: {
  data: ConfigSections['commands']
  onChange: (v: ConfigSections['commands']) => void
  onSave: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Terminal className="h-4 w-4" /> Comandos
        </CardTitle>
        <CardDescription>Comandos que os usuários podem enviar ao assistente via chat.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SelectField
          label={tLabel('native')}
          helpField="commands.native"
          description="Modo de comandos nativos do OpenClaw"
          value={data.native}
          onChange={(v) => onChange({ ...data, native: v })}
          options={tOptions(['auto', 'off'], 'commands.native')}
        />

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Comandos habilitados</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <CheckboxField
              label="/text"
              helpField="commands.text"
              description="Enviar texto diretamente"
              checked={data.text}
              onChange={(v) => onChange({ ...data, text: v })}
            />
            <CheckboxField
              label="/bash"
              helpField="commands.bash"
              description="Executar comandos bash"
              checked={data.bash}
              onChange={(v) => onChange({ ...data, bash: v })}
            />
            <CheckboxField
              label="/config"
              helpField="commands.config"
              description="Editar configuração"
              checked={data.config}
              onChange={(v) => onChange({ ...data, config: v })}
            />
            <CheckboxField
              label="/debug"
              helpField="commands.debug"
              description="Modo de depuração"
              checked={data.debug}
              onChange={(v) => onChange({ ...data, debug: v })}
            />
            <CheckboxField
              label="/restart"
              helpField="commands.restart"
              description="Reiniciar o agente"
              checked={data.restart}
              onChange={(v) => onChange({ ...data, restart: v })}
            />
          </div>
        </div>

        <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />

        {showAdvanced && (<>
        <div className="border-t border-border pt-4">
          <CheckboxField
            label="Usar grupos de acesso"
            helpField="commands.useAccessGroups"
            description="Restringe comandos por grupo de acesso (useAccessGroups)"
            checked={data.useAccessGroups}
            onChange={(v) => onChange({ ...data, useAccessGroups: v })}
          />
        </div>
        </>)}

        <SaveButton onClick={handleSave} saving={saving} />
      </CardContent>
    </Card>
  )
}

/* ─── Plugins ─── */

function PluginsPanel({
  data,
  onChange,
  onSave,
}: {
  data: ConfigSections['plugins']
  onChange: (v: ConfigSections['plugins']) => void
  onSave: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Puzzle className="h-4 w-4" /> Plugins
        </CardTitle>
        <CardDescription>Ative ou desative plugins do assistente. Os padrões permitem todos os plugins.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <CheckboxField
          label="Plugins ativados"
          helpField="plugins.enabled"
          description="Ativa o sistema de plugins do OpenClaw"
          checked={data.enabled}
          onChange={(v) => onChange({ ...data, enabled: v })}
        />

        {data.enabled && (
          <>
            <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />

            {showAdvanced && (<>
            <div className="border-t border-border pt-4">
              <TagInput
                label="Plugins permitidos"
                helpField="plugins.allow"
                description="Plugins permitidos explicitamente (vazio = todos)"
                values={data.allow}
                onChange={(v) => onChange({ ...data, allow: v })}
                placeholder="Nome do plugin"
              />
            </div>

            <div className="border-t border-border pt-4">
              <TagInput
                label="Plugins bloqueados"
                helpField="plugins.deny"
                description="Plugins bloqueados explicitamente"
                values={data.deny}
                onChange={(v) => onChange({ ...data, deny: v })}
                placeholder="Nome do plugin"
              />
            </div>

            <div className="border-t border-border pt-4">
              <TagInput
                label="Pastas de plugins"
                helpField="plugins.load.paths"
                description="Diretórios adicionais para carregar plugins"
                values={data.loadPaths}
                onChange={(v) => onChange({ ...data, loadPaths: v })}
                placeholder="/path/to/plugins"
              />
            </div>
            </>)}
          </>
        )}

        <SaveButton onClick={handleSave} saving={saving} />
      </CardContent>
    </Card>
  )
}

/* ─── Ambiente ─── */

function EnvironmentPanel({
  data,
  onChange,
  onSave,
}: {
  data: ConfigSections['environment']
  onChange: (v: ConfigSections['environment']) => void
  onSave: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" /> Ambiente
        </CardTitle>
        <CardDescription>Variáveis de ambiente disponíveis para o assistente. Altere apenas se necessário.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <LH text="Variáveis do sistema" field="env.vars" />
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            KEY=VALUE por linha. Disponíveis para o agente durante execução.
          </p>
          <textarea
            className="w-full min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y"
            value={data.env}
            onChange={(e) => onChange({ ...data, env: e.target.value })}
            placeholder="API_KEY=sk-...\nDATABASE_URL=postgres://...\nNODE_ENV=production"
          />
        </div>

        <AdvancedToggle open={showAdvanced} onToggle={() => setShowAdvanced(!showAdvanced)} />

        {showAdvanced && (<>
        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-3">Variáveis do terminal</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CheckboxField
              label="Carregar variáveis do terminal"
              helpField="env.shellEnv"
              description="Carregar variáveis do shell do sistema (env.shellEnv.enabled)"
              checked={data.shellEnvEnabled}
              onChange={(v) => onChange({ ...data, shellEnvEnabled: v })}
            />
            <div>
              <LH text="Tempo para carregar variáveis (ms)" field="env.shellEnv.timeoutMs" />
              <Input
                className="mt-1"
                type="number"
                min={1000}
                max={60000}
                value={data.shellEnvTimeoutMs}
                onChange={(e) => onChange({ ...data, shellEnvTimeoutMs: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
        </>)}

        <SaveButton onClick={handleSave} saving={saving} />
      </CardContent>
    </Card>
  )
}
