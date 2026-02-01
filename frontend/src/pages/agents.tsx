import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { FieldHelp } from '@/components/ui/help-tooltip'
import { cn } from '@/lib/utils'
import {
  Plus,
  Save,
  Trash2,
  Loader2,
  Bot,
  FileText,
  Edit3,
  X,
  Heart,
  User,
  Wrench,
  Users,
  Brain,
  Fingerprint,
  Timer,
  ChevronLeft,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
// MAPEAMENTO DE ARQUIVOS WORKSPACE → PT-BR
// ═══════════════════════════════════════════════════════════════

interface WorkspaceFileMeta {
  file: string
  label: string
  description: string
  icon: typeof Heart
  color: string
}

const workspaceFilesMeta: WorkspaceFileMeta[] = [
  {
    file: 'SOUL.md',
    label: 'Alma',
    description: 'Personalidade central, tom de voz e princípios do assistente',
    icon: Heart,
    color: 'text-rose-500',
  },
  {
    file: 'IDENTITY.md',
    label: 'Identidade',
    description: 'Nome, emoji, avatar e tema visual do assistente',
    icon: Fingerprint,
    color: 'text-violet-500',
  },
  {
    file: 'USER.md',
    label: 'Usuário',
    description: 'Perfil e preferências do usuário que o assistente atende',
    icon: User,
    color: 'text-blue-500',
  },
  {
    file: 'TOOLS.md',
    label: 'Ferramentas',
    description: 'Notas sobre skills, integrações e credenciais disponíveis',
    icon: Wrench,
    color: 'text-amber-500',
  },
  {
    file: 'AGENTS.md',
    label: 'Agentes',
    description: 'Configuração e referência para múltiplos agentes',
    icon: Users,
    color: 'text-emerald-500',
  },
  {
    file: 'HEARTBEAT.md',
    label: 'Rotina',
    description: 'Tarefas periódicas executadas automaticamente (2-4x ao dia)',
    icon: Timer,
    color: 'text-orange-500',
  },
  {
    file: 'MEMORY.md',
    label: 'Memória',
    description: 'Memória de longo prazo curada, carregada em sessões principais',
    icon: Brain,
    color: 'text-pink-500',
  },
]

interface BindingRule {
  match: string  // e.g. 'channel', 'accountId', 'peer.kind', 'peer.id', 'guildId', 'teamId'
  value: string
}

interface SandboxConfig {
  mode: string   // 'off' | 'non-main' | 'all'
  scope: string  // 'session' | 'agent' | 'shared'
  workspaceAccess: string  // 'none' | 'ro' | 'rw'
}

interface AgentItem {
  id: string
  name: string
  description: string | null
  systemPrompt: string | null
  model: string | null
  emoji: string | null
  avatar: string | null
  theme: string | null
  isDefault: boolean
  isActive: boolean
  bindings: BindingRule[] | null
  sandbox: SandboxConfig | null
  toolsAllow: string[] | null
  toolsDeny: string[] | null
  workspacePath: string | null
  createdAt: string
}

export default function AgentsPage() {
  const { selectedId } = useInstance()
  const toast = useToast()
  const [agents, setAgents] = useState<AgentItem[]>([])
  const [workspaceFiles, setWorkspaceFiles] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', displayName: '', description: '', systemPrompt: '', model: '', emoji: '', avatar: '', theme: '',
    agentDir: '', isDefault: false,
    mentionPatterns: [] as string[],
    subagentsAllowAgents: [] as string[],
    bindings: [] as BindingRule[],
    sandbox: { mode: 'off', scope: 'session', workspaceAccess: 'none', dockerImage: '', dockerNetwork: 'none', dockerUser: '1000:1000', dockerMemory: '', dockerCpus: 0, dockerSetupCommand: '', browserEnabled: false, pruneIdleHours: 24, pruneMaxAgeDays: 7 } as SandboxConfig & Record<string, any>,
    toolsAllow: [] as string[],
    toolsDeny: [] as string[],
    workspacePath: '',
  })
  const [editingFile, setEditingFile] = useState<WorkspaceFileMeta | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const fetchAgents = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/agents`)
      setAgents(data.agents)
      setWorkspaceFiles(data.workspaceFiles || {})
    } catch (err) {
      toast.error('Erro ao carregar agentes')
    } finally {
      setLoading(false)
    }
  }, [selectedId, toast])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const handleSave = async () => {
    if (!selectedId || !form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await api.put(`/instances/${selectedId}/agents/${editingId}`, form)
        toast.success('Agent atualizado com sucesso')
      } else {
        await api.post(`/instances/${selectedId}/agents`, form)
        toast.success('Agent criado com sucesso')
      }
      setShowForm(false)
      setEditingId(null)
      setForm({ name: '', displayName: '', description: '', systemPrompt: '', model: '', emoji: '', avatar: '', theme: '', agentDir: '', isDefault: false, mentionPatterns: [], subagentsAllowAgents: [], bindings: [], sandbox: { mode: 'off', scope: 'session', workspaceAccess: 'none', dockerImage: '', dockerNetwork: 'none', dockerUser: '1000:1000', dockerMemory: '', dockerCpus: 0, dockerSetupCommand: '', browserEnabled: false, pruneIdleHours: 24, pruneMaxAgeDays: 7 }, toolsAllow: [], toolsDeny: [], workspacePath: '' })
      await fetchAgents()
    } catch (err) {
      toast.error('Erro ao salvar agent')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!selectedId || !window.confirm('Remover este agent?')) return
    try {
      await api.delete(`/instances/${selectedId}/agents/${id}`)
      toast.success('Agent excluído com sucesso')
      await fetchAgents()
    } catch (err) {
      toast.error('Erro ao excluir agent')
    }
  }

  const handleEdit = (agent: AgentItem) => {
    const sb = (agent.sandbox || {}) as any
    setForm({
      name: agent.name,
      displayName: (agent as any).displayName || '',
      description: agent.description || '',
      systemPrompt: agent.systemPrompt || '',
      model: agent.model || '',
      emoji: agent.emoji || '',
      avatar: agent.avatar || '',
      theme: agent.theme || '',
      agentDir: (agent as any).agentDir || '',
      isDefault: agent.isDefault || false,
      mentionPatterns: (agent as any).mentionPatterns || [],
      subagentsAllowAgents: (agent as any).subagentsAllowAgents || [],
      bindings: agent.bindings || [],
      sandbox: { mode: sb.mode || 'off', scope: sb.scope || 'session', workspaceAccess: sb.workspaceAccess || 'none', dockerImage: sb.dockerImage || '', dockerNetwork: sb.dockerNetwork || 'none', dockerUser: sb.dockerUser || '1000:1000', dockerMemory: sb.dockerMemory || '', dockerCpus: sb.dockerCpus || 0, dockerSetupCommand: sb.dockerSetupCommand || '', browserEnabled: sb.browserEnabled || false, pruneIdleHours: sb.pruneIdleHours ?? 24, pruneMaxAgeDays: sb.pruneMaxAgeDays ?? 7 },
      toolsAllow: agent.toolsAllow || [],
      toolsDeny: agent.toolsDeny || [],
      workspacePath: agent.workspacePath || '',
    })
    setEditingId(agent.id)
    setShowForm(true)
  }

  const handleOpenFile = (meta: WorkspaceFileMeta) => {
    setEditingFile(meta)
    setFileContent(workspaceFiles[meta.file] || '')
    setSaveSuccess(false)
  }

  const handleSaveFile = async () => {
    if (!selectedId || !editingFile) return
    setSaving(true)
    setSaveSuccess(false)
    try {
      await api.put(`/instances/${selectedId}/agents/workspace/${editingFile.file}`, { content: fileContent })
      setSaveSuccess(true)
      toast.success('Arquivo salvo com sucesso')
      // Update local state
      setWorkspaceFiles(prev => ({ ...prev, [editingFile.file]: fileContent }))
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      toast.error('Erro ao salvar arquivo')
    } finally {
      setSaving(false)
    }
  }

  if (!selectedId) return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Selecione uma instância</div>

  // ═══════════════════════════════════════════════════════════════
  // EDITOR DE ARQUIVO WORKSPACE (tela cheia)
  // ═══════════════════════════════════════════════════════════════
  if (editingFile) {
    const Icon = editingFile.icon
    const charCount = fileContent.length
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditingFile(null)} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>
            <div className="flex items-center gap-2">
              <Icon className={cn('h-5 w-5', editingFile.color)} />
              <div>
                <h1 className="text-xl font-bold tracking-tight">{editingFile.label}</h1>
                <p className="text-xs text-muted-foreground">{editingFile.description}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">{charCount.toLocaleString()} chars</span>
            <Button size="sm" onClick={handleSaveFile} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saveSuccess ? 'Salvo' : 'Salvar'}
            </Button>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <textarea
              className="w-full rounded-md bg-background px-4 py-3 text-sm font-mono min-h-[calc(100vh-240px)] resize-y border-0 focus:outline-none focus:ring-0"
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              placeholder={`Conteúdo de ${editingFile.label}...`}
              spellCheck={false}
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // TELA PRINCIPAL
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personalidade</h1>
          <p className="text-muted-foreground text-sm mt-1">Configurar comportamento, identidade e memória do assistente</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', displayName: '', description: '', systemPrompt: '', model: '', emoji: '', avatar: '', theme: '', agentDir: '', isDefault: false, mentionPatterns: [], subagentsAllowAgents: [], bindings: [], sandbox: { mode: 'off', scope: 'session', workspaceAccess: 'none', dockerImage: '', dockerNetwork: 'none', dockerUser: '1000:1000', dockerMemory: '', dockerCpus: 0, dockerSetupCommand: '', browserEnabled: false, pruneIdleHours: 24, pruneMaxAgeDays: 7 }, toolsAllow: [], toolsDeny: [], workspacePath: '' }) }}>
          <Plus className="h-3 w-3" /> Novo Agent
        </Button>
      </div>

      {/* Workspace Files Grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Arquivos do Workspace</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {workspaceFilesMeta.map((meta) => {
            const Icon = meta.icon
            const content = workspaceFiles[meta.file]
            const exists = content != null && content.length > 0
            const charCount = content?.length || 0
            const preview = content?.replace(/^#.*\n*/m, '').slice(0, 80).trim() || ''

            return (
              <Card
                key={meta.file}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group',
                  !exists && 'opacity-60'
                )}
                onClick={() => handleOpenFile(meta)}
              >
                <CardContent className="py-4 px-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                      exists ? 'bg-primary/5 group-hover:bg-primary/10' : 'bg-muted'
                    )}>
                      <Icon className={cn('h-5 w-5', exists ? meta.color : 'text-muted-foreground')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{meta.label}</p>
                        {exists && (
                          <span className="text-[10px] text-muted-foreground font-mono">{charCount.toLocaleString()}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {exists ? (preview || meta.description) : meta.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Create/Edit Agent form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" />
              {editingId ? 'Editar Agent' : 'Novo Agent'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">Nome (ID)</Label>
                  <FieldHelp field="agents.name" />
                </div>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="principal" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Display Name</Label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Assistente Principal" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Modelo (opcional)</Label>
                <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="anthropic/claude-sonnet-4-5" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Agent Dir</Label>
                <Input value={form.agentDir} onChange={(e) => setForm({ ...form, agentDir: e.target.value })} placeholder="/home/openclaw/.openclaw/agents/meu-agente" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Descricao</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Agent padrao do Clawdbot" className="mt-1" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">Emoji</Label>
                  <FieldHelp field="agents.emoji" />
                </div>
                <Input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="🤖" className="mt-1" maxLength={10} />
              </div>
              <div>
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">Avatar (URL)</Label>
                  <FieldHelp field="agents.avatar" />
                </div>
                <Input value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.target.value })} placeholder="https://..." className="mt-1" />
              </div>
              <div>
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">Tema (personalidade)</Label>
                  <FieldHelp field="agents.theme" />
                </div>
                <Input value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} placeholder="amigável e profissional" className="mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-input" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
                <span className="text-sm">Agent padrão</span>
              </label>
            </div>
            <div>
              <div className="flex items-center">
                <Label className="text-xs text-muted-foreground">System Prompt</Label>
                <FieldHelp field="agents.systemPrompt" />
              </div>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px] resize-y"
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                placeholder="Voce e um assistente prestativo e amigavel..."
              />
            </div>

            {/* Mention Patterns & Subagents */}
            <div className="border-t border-border pt-4">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Multi-Agent</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div>
                  <div className="flex items-center">
                    <Label className="text-xs text-muted-foreground">Mention Patterns</Label>
                    <FieldHelp field="agents.mentionPatterns" />
                  </div>
                  <textarea
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y font-mono"
                    value={form.mentionPatterns.join('\n')}
                    onChange={(e) => setForm({ ...form, mentionPatterns: e.target.value.split('\n').filter(s => s.trim()) })}
                    placeholder="@assistente&#10;hey bot&#10;/ask"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Padrões que ativam este agente em grupo (um por linha)</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Subagents Allow</Label>
                  <textarea
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y font-mono"
                    value={form.subagentsAllowAgents.join('\n')}
                    onChange={(e) => setForm({ ...form, subagentsAllowAgents: e.target.value.split('\n').filter(s => s.trim()) })}
                    placeholder="pesquisador&#10;coder&#10;reviewer"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">IDs de agentes que este pode invocar como subagente</p>
                </div>
              </div>
            </div>

            {/* Bindings */}
            <div className="border-t border-border pt-4">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bindings (Routing)</Label>
              <p className="text-xs text-muted-foreground mb-2">Regras de roteamento: em quais canais/contas esse agente responde</p>
              {form.bindings.map((b, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm w-40"
                    value={b.match}
                    onChange={(e) => {
                      const updated = [...form.bindings]
                      updated[i] = { ...b, match: e.target.value }
                      setForm({ ...form, bindings: updated })
                    }}
                  >
                    <option value="channel">Canal</option>
                    <option value="accountId">Account ID</option>
                    <option value="peer.kind">Tipo de peer</option>
                    <option value="peer.id">Peer ID</option>
                    <option value="guildId">Guild ID</option>
                    <option value="teamId">Team ID</option>
                  </select>
                  <Input
                    className="flex-1"
                    value={b.value}
                    onChange={(e) => {
                      const updated = [...form.bindings]
                      updated[i] = { ...b, value: e.target.value }
                      setForm({ ...form, bindings: updated })
                    }}
                    placeholder="valor do match"
                  />
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => setForm({ ...form, bindings: form.bindings.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setForm({ ...form, bindings: [...form.bindings, { match: 'channel', value: '' }] })}>
                <Plus className="h-3 w-3" /> Adicionar Binding
              </Button>
            </div>

            {/* Sandbox */}
            <div className="border-t border-border pt-4">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sandbox</Label>
              <p className="text-xs text-muted-foreground mb-2">Isolamento de execução do agente</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Modo</Label>
                  <select
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.sandbox.mode}
                    onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, mode: e.target.value } })}
                  >
                    <option value="off">Desligado (off)</option>
                    <option value="non-main">Não-principal (non-main)</option>
                    <option value="all">Todos (all)</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Escopo</Label>
                  <select
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.sandbox.scope}
                    onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, scope: e.target.value } })}
                  >
                    <option value="session">Por sessão</option>
                    <option value="agent">Por agente</option>
                    <option value="shared">Compartilhado</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Acesso ao workspace</Label>
                  <select
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.sandbox.workspaceAccess}
                    onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, workspaceAccess: e.target.value } })}
                  >
                    <option value="none">Nenhum</option>
                    <option value="ro">Somente leitura (ro)</option>
                    <option value="rw">Leitura e escrita (rw)</option>
                  </select>
                </div>
              </div>
              {form.sandbox.mode !== 'off' && (
                <>
                  <div className="col-span-full mt-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Docker</Label>
                  </div>
                  <div>
                    <div className="flex items-center">
                      <Label className="text-xs text-muted-foreground">Imagem</Label>
                      <FieldHelp field="agents.docker.image" />
                    </div>
                    <Input value={form.sandbox.dockerImage} onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, dockerImage: e.target.value } })} placeholder="node:20-slim" className="mt-1" />
                  </div>
                  <div>
                    <div className="flex items-center">
                      <Label className="text-xs text-muted-foreground">Network</Label>
                      <FieldHelp field="agents.docker.network" />
                    </div>
                    <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.sandbox.dockerNetwork} onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, dockerNetwork: e.target.value } })}>
                      <option value="none">none</option>
                      <option value="bridge">bridge</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">User</Label>
                    <Input value={form.sandbox.dockerUser} onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, dockerUser: e.target.value } })} placeholder="1000:1000" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Memory</Label>
                    <Input value={form.sandbox.dockerMemory} onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, dockerMemory: e.target.value } })} placeholder="1g" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">CPUs</Label>
                    <Input type="number" min={0} step={0.5} value={form.sandbox.dockerCpus || ''} onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, dockerCpus: Number(e.target.value) || 0 } })} placeholder="2" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Setup Command</Label>
                    <Input value={form.sandbox.dockerSetupCommand} onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, dockerSetupCommand: e.target.value } })} placeholder="apt-get install -y git" className="mt-1" />
                  </div>
                  <div className="col-span-full flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="rounded border-input" checked={form.sandbox.browserEnabled} onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, browserEnabled: e.target.checked } })} />
                      <span className="text-sm">Browser sandboxed</span>
                    </label>
                  </div>
                  <div className="col-span-full mt-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Prune</Label>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Idle Hours</Label>
                    <Input type="number" min={1} value={form.sandbox.pruneIdleHours} onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, pruneIdleHours: Number(e.target.value) || 24 } })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Age Days</Label>
                    <Input type="number" min={1} value={form.sandbox.pruneMaxAgeDays} onChange={(e) => setForm({ ...form, sandbox: { ...form.sandbox, pruneMaxAgeDays: Number(e.target.value) || 7 } })} className="mt-1" />
                  </div>
                </>
              )}
            </div>

            {/* Tools per-agent */}
            <div className="border-t border-border pt-4">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ferramentas per-agent</Label>
              <p className="text-xs text-muted-foreground mb-2">Sobrepõe a configuração global de ferramentas</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Allow (permitir)</Label>
                  <textarea
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y font-mono"
                    value={form.toolsAllow.join('\n')}
                    onChange={(e) => setForm({ ...form, toolsAllow: e.target.value.split('\n').filter(s => s.trim()) })}
                    placeholder="group:web&#10;group:memory&#10;tool-name"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Deny (bloquear)</Label>
                  <textarea
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y font-mono"
                    value={form.toolsDeny.join('\n')}
                    onChange={(e) => setForm({ ...form, toolsDeny: e.target.value.split('\n').filter(s => s.trim()) })}
                    placeholder="group:fs&#10;group:runtime"
                  />
                </div>
              </div>
            </div>

            {/* Workspace Path */}
            <div className="border-t border-border pt-4">
              <Label className="text-xs text-muted-foreground">Workspace Path (customizado)</Label>
              <p className="text-xs text-muted-foreground mb-1">Nunca reutilizar agentDir entre agentes diferentes</p>
              <Input
                value={form.workspacePath}
                onChange={(e) => setForm({ ...form, workspacePath: e.target.value })}
                placeholder="/home/openclaw/.openclaw/agents/meu-agente"
                className="mt-1"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="gap-2">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {editingId ? 'Atualizar' : 'Criar'}
              </Button>
              <Button variant="ghost" onClick={() => { setShowForm(false); setEditingId(null) }}>
                <X className="h-3 w-3 mr-1" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent list */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : agents.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Agents Cadastrados</h2>
          <div className="space-y-2">
            {agents.map((agent) => (
              <Card key={agent.id} className={cn(agent.isDefault && 'ring-1 ring-primary')}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    {agent.emoji ? <span className="text-lg">{agent.emoji}</span> : <Bot className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{agent.name}</p>
                      {agent.isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Padrao</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{agent.description || agent.model || 'Sem descricao'}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(agent)} title="Editar">
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(agent.id)} title="Remover">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
