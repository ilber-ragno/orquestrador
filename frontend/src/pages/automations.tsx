import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldHelp } from '@/components/ui/help-tooltip'
import {
  Clock,
  Play,
  Pause,
  Trash2,
  Package,
  Webhook,
  Cpu,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  ChevronDown,
  ChevronRight,
  Plus,
  Download,
  Settings2,
  Save,
  Power,
  PowerOff,
  Bot,
  UserCircle,
} from 'lucide-react'

interface CronJob {
  id: string
  name: string
  schedule: string
  command: string
  enabled: boolean
  lastRun: string | null
  nextRun: string | null
  lastStatus: string | null
  source?: 'manual' | 'ai'
}

interface Skill {
  name: string
  version: string
  description: string | null
  status: string
}

interface Hook {
  name: string
  type: string
  enabled: boolean
  description: string | null
}

interface Process {
  pid: number
  user: string
  cpu: string
  memory: string
  command: string
}

type Tab = 'crons' | 'skills' | 'hooks' | 'processes'

export default function AutomationsPage() {
  const { selectedInstance } = useInstance()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('crons')
  const [loading, setLoading] = useState(false)

  const [crons, setCrons] = useState<CronJob[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [hooks, setHooks] = useState<Hook[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [expandedCron, setExpandedCron] = useState<string | null>(null)
  const [cronRuns, setCronRuns] = useState<any[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Skills install/update
  const [installSlug, setInstallSlug] = useState('')
  const [installLoading, setInstallLoading] = useState(false)
  const [updateAllLoading, setUpdateAllLoading] = useState(false)
  const [editingSkill, setEditingSkill] = useState<string | null>(null)
  const [skillConfigForm, setSkillConfigForm] = useState<{ enabled?: boolean; apiKey?: string; env?: Record<string, string> }>({})
  const [skillSaving, setSkillSaving] = useState(false)

  // Cron creation
  const [showCronForm, setShowCronForm] = useState(false)
  const [cronForm, setCronForm] = useState({
    name: '',
    scheduleType: 'cron' as 'at' | 'every' | 'cron',
    scheduleValue: '',
    timezone: '',
    executionMode: 'main' as 'main' | 'isolated',
    message: '',
    model: '',
    thinking: 'off' as 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'off',
    timeoutSeconds: 120,
    wakeMode: 'next-heartbeat' as 'next-heartbeat' | 'now',
    agentId: '',
    deleteAfterRun: false,
    postToMainPrefix: 'Cron',
    postToMainMode: 'summary' as 'summary' | 'full',
    postToMainMaxChars: 8000,
    deliveryEnabled: false,
    deliveryChannel: '',
    deliveryTo: '',
  })
  const [cronSaving, setCronSaving] = useState(false)

  const id = selectedInstance?.id

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      if (tab === 'crons') {
        const { data } = await api.get(`/instances/${id}/automations/crons`)
        setCrons(data)
      } else if (tab === 'skills') {
        const { data } = await api.get(`/instances/${id}/automations/skills`)
        setSkills(data)
      } else if (tab === 'hooks') {
        const { data } = await api.get(`/instances/${id}/automations/hooks`)
        setHooks(data)
      } else if (tab === 'processes') {
        const { data } = await api.get(`/instances/${id}/automations/processes`)
        setProcesses(data)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao carregar dados de automação')
    } finally {
      setLoading(false)
    }
  }, [id, tab, toast])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh processes every 15s
  useEffect(() => {
    if (tab !== 'processes') return
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [tab, fetchData])

  const toggleCron = async (jobId: string, enable: boolean) => {
    if (!id) return
    setActionLoading(jobId)
    try {
      await api.post(`/instances/${id}/automations/crons/${jobId}/toggle`, { enable })
      setCrons(prev => prev.map(c => c.id === jobId ? { ...c, enabled: enable } : c))
      toast.success(`Cron job ${enable ? 'ativado' : 'pausado'} com sucesso`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao alternar cron job')
    } finally { setActionLoading(null) }
  }

  const runCron = async (jobId: string) => {
    if (!id) return
    setActionLoading(`run-${jobId}`)
    try {
      await api.post(`/instances/${id}/automations/crons/${jobId}/run`)
      toast.success('Cron job executado com sucesso')
      fetchData()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao executar cron job')
    } finally { setActionLoading(null) }
  }

  const removeCron = async (jobId: string) => {
    if (!id) return
    if (!window.confirm('Remover este cron job?')) return
    setActionLoading(`del-${jobId}`)
    try {
      await api.delete(`/instances/${id}/automations/crons/${jobId}`)
      setCrons(prev => prev.filter(c => c.id !== jobId))
      toast.success('Cron job removido com sucesso')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao remover cron job')
    } finally { setActionLoading(null) }
  }

  const expandCron = async (jobId: string) => {
    if (expandedCron === jobId) { setExpandedCron(null); return }
    setExpandedCron(jobId)
    if (!id) return
    try {
      const { data } = await api.get(`/instances/${id}/automations/crons/${jobId}/runs`)
      setCronRuns(data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao carregar histórico de execuções')
      setCronRuns([])
    }
  }

  const toggleHook = async (hookName: string, enable: boolean) => {
    if (!id) return
    setActionLoading(hookName)
    try {
      await api.post(`/instances/${id}/automations/hooks/${hookName}/toggle`, { enable })
      setHooks(prev => prev.map(h => h.name === hookName ? { ...h, enabled: enable } : h))
      toast.success(`Hook ${enable ? 'ativado' : 'desativado'} com sucesso`)
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao alternar hook')
    } finally { setActionLoading(null) }
  }

  // Skills actions
  const installSkill = async () => {
    if (!id || !installSlug.trim()) return
    setInstallLoading(true)
    try {
      const { data } = await api.post(`/instances/${id}/automations/skills/install`, { slug: installSlug.trim() })
      if (data.success) {
        toast.success(`Skill "${installSlug}" instalada com sucesso`)
        setInstallSlug('')
        fetchData()
      } else {
        toast.error(data.output || 'Falha ao instalar skill')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao instalar skill')
    } finally { setInstallLoading(false) }
  }

  const updateAllSkills = async () => {
    if (!id) return
    setUpdateAllLoading(true)
    try {
      const { data } = await api.post(`/instances/${id}/automations/skills/update`)
      toast.success(data.output || 'Skills atualizadas')
      fetchData()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao atualizar skills')
    } finally { setUpdateAllLoading(false) }
  }

  const saveSkillConfig = async (skillName: string) => {
    if (!id) return
    setSkillSaving(true)
    try {
      await api.put(`/instances/${id}/automations/skills/${skillName}/config`, skillConfigForm)
      toast.success(`Config de "${skillName}" salva`)
      setEditingSkill(null)
      setSkillConfigForm({})
      fetchData()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao salvar config da skill')
    } finally { setSkillSaving(false) }
  }

  // Cron creation
  const createCron = async () => {
    if (!id || !cronForm.name.trim() || !cronForm.scheduleValue.trim()) return
    setCronSaving(true)
    try {
      await api.post(`/instances/${id}/automations/crons`, {
        name: cronForm.name,
        scheduleType: cronForm.scheduleType,
        scheduleValue: cronForm.scheduleValue,
        timezone: cronForm.timezone || undefined,
        executionMode: cronForm.executionMode,
        wakeMode: cronForm.wakeMode !== 'next-heartbeat' ? cronForm.wakeMode : undefined,
        agentId: cronForm.agentId || undefined,
        deleteAfterRun: cronForm.deleteAfterRun || undefined,
        message: cronForm.executionMode === 'isolated' ? cronForm.message || undefined : undefined,
        model: cronForm.executionMode === 'isolated' ? cronForm.model || undefined : undefined,
        thinking: cronForm.executionMode === 'isolated' ? cronForm.thinking : undefined,
        timeoutSeconds: cronForm.executionMode === 'isolated' ? cronForm.timeoutSeconds : undefined,
        postToMainPrefix: cronForm.executionMode === 'isolated' && cronForm.postToMainPrefix !== 'Cron' ? cronForm.postToMainPrefix : undefined,
        postToMainMode: cronForm.executionMode === 'isolated' && cronForm.postToMainMode !== 'summary' ? cronForm.postToMainMode : undefined,
        postToMainMaxChars: cronForm.executionMode === 'isolated' && cronForm.postToMainMaxChars !== 8000 ? cronForm.postToMainMaxChars : undefined,
        delivery: cronForm.deliveryEnabled ? { enabled: true, channel: cronForm.deliveryChannel || undefined, to: cronForm.deliveryTo || undefined } : undefined,
      })
      toast.success(`Cron "${cronForm.name}" criado com sucesso`)
      setShowCronForm(false)
      setCronForm({ name: '', scheduleType: 'cron', scheduleValue: '', timezone: '', executionMode: 'main', message: '', model: '', thinking: 'off', timeoutSeconds: 120, wakeMode: 'next-heartbeat', agentId: '', deleteAfterRun: false, postToMainPrefix: 'Cron', postToMainMode: 'summary', postToMainMaxChars: 8000, deliveryEnabled: false, deliveryChannel: '', deliveryTo: '' })
      fetchData()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao criar cron')
    } finally { setCronSaving(false) }
  }

  const tabs: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: 'crons', label: 'Cron Jobs', icon: Clock, count: crons.length },
    { key: 'skills', label: 'Skills', icon: Package, count: skills.length },
    { key: 'hooks', label: 'Hooks', icon: Webhook, count: hooks.length },
    { key: 'processes', label: 'Processos', icon: Cpu, count: processes.length },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6" /> Automações
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Crons, skills, hooks e processos criados pela IA no container
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.count > 0 && (
              <span className="bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded-full">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && tab === 'crons' && (
        <>
          {/* Cron creation form */}
          <div className="flex gap-2 mb-4">
            <Button size="sm" className="gap-1.5" onClick={() => setShowCronForm(!showCronForm)}>
              <Plus className="h-3 w-3" /> Novo Cron
            </Button>
          </div>
          {showCronForm && (
            <div className="border border-border rounded-lg p-4 mb-4 space-y-4 bg-card">
              <p className="text-sm font-semibold">Criar Novo Cron Job</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center">
                    <Label className="text-xs">Nome</Label>
                    <FieldHelp field="cron.name" />
                  </div>
                  <Input className="mt-1" value={cronForm.name} onChange={(e) => setCronForm({ ...cronForm, name: e.target.value })} placeholder="backup-diario" />
                </div>
                <div>
                  <div className="flex items-center">
                    <Label className="text-xs">Tipo de schedule</Label>
                    <FieldHelp field="cron.schedule" />
                  </div>
                  <select className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={cronForm.scheduleType} onChange={(e) => setCronForm({ ...cronForm, scheduleType: e.target.value as any })}>
                    <option value="cron">Cron (5 campos)</option>
                    <option value="every">Every (intervalo)</option>
                    <option value="at">At (horário fixo)</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center">
                    <Label className="text-xs">Valor do schedule</Label>
                    <FieldHelp field="cron.schedule" />
                  </div>
                  <Input className="mt-1" value={cronForm.scheduleValue} onChange={(e) => setCronForm({ ...cronForm, scheduleValue: e.target.value })} placeholder={cronForm.scheduleType === 'cron' ? '0 */6 * * *' : cronForm.scheduleType === 'every' ? '30m' : '14:00'} />
                </div>
                <div>
                  <Label className="text-xs">Timezone (opcional)</Label>
                  <Input className="mt-1" value={cronForm.timezone} onChange={(e) => setCronForm({ ...cronForm, timezone: e.target.value })} placeholder="America/Sao_Paulo" />
                </div>
                <div>
                  <Label className="text-xs">Modo de execução</Label>
                  <select className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={cronForm.executionMode} onChange={(e) => setCronForm({ ...cronForm, executionMode: e.target.value as any })}>
                    <option value="main">Principal (heartbeat)</option>
                    <option value="isolated">Isolado (agent turn)</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center">
                    <Label className="text-xs">Wake Mode</Label>
                    <FieldHelp field="cron.wakeMode" />
                  </div>
                  <select className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={cronForm.wakeMode} onChange={(e) => setCronForm({ ...cronForm, wakeMode: e.target.value as any })}>
                    <option value="next-heartbeat">Próximo heartbeat</option>
                    <option value="now">Imediato (now)</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center">
                    <Label className="text-xs">Agent (opcional)</Label>
                    <FieldHelp field="cron.agentId" />
                  </div>
                  <Input className="mt-1" value={cronForm.agentId} onChange={(e) => setCronForm({ ...cronForm, agentId: e.target.value })} placeholder="ID do agente" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cronForm.deleteAfterRun} onChange={(e) => setCronForm({ ...cronForm, deleteAfterRun: e.target.checked })} className="h-4 w-4 rounded border-input accent-primary" />
                    <span className="text-xs font-medium">Deletar após executar</span>
                    <FieldHelp field="cron.deleteAfterRun" />
                  </label>
                </div>
              </div>
              {cronForm.executionMode === 'isolated' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border">
                  <div className="sm:col-span-2">
                    <div className="flex items-center">
                      <Label className="text-xs">Mensagem</Label>
                      <FieldHelp field="cron.command" />
                    </div>
                    <textarea className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] resize-y" value={cronForm.message} onChange={(e) => setCronForm({ ...cronForm, message: e.target.value })} placeholder="Verifique atualizações pendentes..." />
                  </div>
                  <div>
                    <Label className="text-xs">Modelo</Label>
                    <Input className="mt-1" value={cronForm.model} onChange={(e) => setCronForm({ ...cronForm, model: e.target.value })} placeholder="sonnet" />
                  </div>
                  <div>
                    <div className="flex items-center">
                      <Label className="text-xs">Thinking</Label>
                      <FieldHelp field="cron.thinking" />
                    </div>
                    <select className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={cronForm.thinking} onChange={(e) => setCronForm({ ...cronForm, thinking: e.target.value as any })}>
                      <option value="off">Desligado</option>
                      <option value="minimal">Mínimo</option>
                      <option value="low">Baixo</option>
                      <option value="medium">Médio</option>
                      <option value="high">Alto</option>
                      <option value="xhigh">Extra Alto</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Timeout (seg)</Label>
                    <Input className="mt-1" type="number" min={10} max={600} value={cronForm.timeoutSeconds} onChange={(e) => setCronForm({ ...cronForm, timeoutSeconds: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs">Post to Main Prefix</Label>
                    <Input className="mt-1" value={cronForm.postToMainPrefix} onChange={(e) => setCronForm({ ...cronForm, postToMainPrefix: e.target.value })} placeholder="Cron" />
                  </div>
                  <div>
                    <Label className="text-xs">Post to Main Mode</Label>
                    <select className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={cronForm.postToMainMode} onChange={(e) => setCronForm({ ...cronForm, postToMainMode: e.target.value as any })}>
                      <option value="summary">Resumo</option>
                      <option value="full">Completo</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Post to Main Max Chars</Label>
                    <Input className="mt-1" type="number" min={100} max={50000} value={cronForm.postToMainMaxChars} onChange={(e) => setCronForm({ ...cronForm, postToMainMaxChars: Number(e.target.value) })} />
                  </div>
                </div>
              )}
              <div className="pt-2 border-t border-border">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={cronForm.deliveryEnabled} onChange={(e) => setCronForm({ ...cronForm, deliveryEnabled: e.target.checked })} className="h-4 w-4 rounded border-input accent-primary" />
                  <span className="text-sm font-medium">Entregar resultado em canal</span>
                </label>
                {cronForm.deliveryEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Canal</Label>
                      <Input className="mt-1" value={cronForm.deliveryChannel} onChange={(e) => setCronForm({ ...cronForm, deliveryChannel: e.target.value })} placeholder="telegram, whatsapp..." />
                    </div>
                    <div>
                      <Label className="text-xs">Destinatário</Label>
                      <Input className="mt-1" value={cronForm.deliveryTo} onChange={(e) => setCronForm({ ...cronForm, deliveryTo: e.target.value })} placeholder="chat_id ou número" />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={createCron} disabled={cronSaving || !cronForm.name.trim() || !cronForm.scheduleValue.trim()} className="gap-1.5">
                  {cronSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Criar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCronForm(false)}>Cancelar</Button>
              </div>
            </div>
          )}
          <CronsTab
            crons={crons}
            expandedCron={expandedCron}
            cronRuns={cronRuns}
            actionLoading={actionLoading}
            onToggle={toggleCron}
            onRun={runCron}
            onRemove={removeCron}
            onExpand={expandCron}
          />
        </>
      )}

      {!loading && tab === 'skills' && (
        <SkillsTab
          skills={skills}
          installSlug={installSlug}
          onInstallSlugChange={setInstallSlug}
          onInstall={installSkill}
          installLoading={installLoading}
          onUpdateAll={updateAllSkills}
          updateAllLoading={updateAllLoading}
          editingSkill={editingSkill}
          onEditSkill={setEditingSkill}
          skillConfigForm={skillConfigForm}
          onSkillConfigChange={setSkillConfigForm}
          onSaveSkillConfig={saveSkillConfig}
          skillSaving={skillSaving}
        />
      )}
      {!loading && tab === 'hooks' && (
        <HooksTab hooks={hooks} actionLoading={actionLoading} onToggle={toggleHook} />
      )}
      {!loading && tab === 'processes' && <ProcessesTab processes={processes} />}
    </div>
  )
}

function CronsTab({
  crons, expandedCron, cronRuns, actionLoading, onToggle, onRun, onRemove, onExpand,
}: {
  crons: CronJob[]
  expandedCron: string | null
  cronRuns: any[]
  actionLoading: string | null
  onToggle: (id: string, enable: boolean) => void
  onRun: (id: string) => void
  onRemove: (id: string) => void
  onExpand: (id: string) => void
}) {
  if (crons.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Nenhum cron job encontrado</p>
        <p className="text-sm mt-1">A IA pode criar crons automaticamente via WhatsApp ou chat</p>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium"></th>
            <th className="text-left px-4 py-2 font-medium">Nome</th>
            <th className="text-left px-4 py-2 font-medium">Origem</th>
            <th className="text-left px-4 py-2 font-medium">Agenda</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-left px-4 py-2 font-medium">Última Execução</th>
            <th className="text-left px-4 py-2 font-medium">Próxima</th>
            <th className="text-right px-4 py-2 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {crons.map(job => (
            <>
              <tr key={job.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2">
                  <button onClick={() => onExpand(job.id)} className="text-muted-foreground hover:text-foreground">
                    {expandedCron === job.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </td>
                <td className="px-4 py-2 font-medium">{job.name}</td>
                <td className="px-4 py-2">
                  {job.source === 'ai' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" title="Criada pelo assistente via conversa">
                      <Bot className="h-3 w-3" /> Assistente
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" title="Criada manualmente pelo painel">
                      <UserCircle className="h-3 w-3" /> Painel
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{job.schedule}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    job.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  }`}>
                    {job.enabled ? <CheckCircle2 className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                    {job.enabled ? 'Ativo' : 'Pausado'}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  {job.lastRun ? new Date(job.lastRun).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  {job.nextRun ? new Date(job.nextRun).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onToggle(job.id, !job.enabled)}
                      disabled={actionLoading === job.id}
                      className="p-1.5 rounded hover:bg-muted"
                      title={job.enabled ? 'Pausar' : 'Retomar'}
                    >
                      {actionLoading === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : job.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => onRun(job.id)}
                      disabled={actionLoading === `run-${job.id}`}
                      className="p-1.5 rounded hover:bg-muted text-blue-600"
                      title="Executar agora"
                    >
                      {actionLoading === `run-${job.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => onRemove(job.id)}
                      disabled={actionLoading === `del-${job.id}`}
                      className="p-1.5 rounded hover:bg-muted text-red-600"
                      title="Remover"
                    >
                      {actionLoading === `del-${job.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </td>
              </tr>
              {expandedCron === job.id && (
                <tr key={`${job.id}-runs`} className="border-t border-border bg-muted/20">
                  <td colSpan={8} className="px-8 py-3">
                    {cronRuns.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum histórico de execução</p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Histórico de execuções:</p>
                        {cronRuns.slice(0, 10).map((run: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 text-xs">
                            <span className={`w-2 h-2 rounded-full ${run.status === 'ok' || run.success ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-muted-foreground">{run.timestamp || run.at ? new Date(run.timestamp || run.at).toLocaleString('pt-BR') : '—'}</span>
                            <span className="truncate max-w-md">{run.output || run.result || run.status || ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SkillsTab({
  skills, installSlug, onInstallSlugChange, onInstall, installLoading,
  onUpdateAll, updateAllLoading, editingSkill, onEditSkill,
  skillConfigForm, onSkillConfigChange, onSaveSkillConfig, skillSaving,
}: {
  skills: Skill[]
  installSlug: string
  onInstallSlugChange: (v: string) => void
  onInstall: () => void
  installLoading: boolean
  onUpdateAll: () => void
  updateAllLoading: boolean
  editingSkill: string | null
  onEditSkill: (name: string | null) => void
  skillConfigForm: any
  onSkillConfigChange: (v: any) => void
  onSaveSkillConfig: (name: string) => void
  skillSaving: boolean
}) {
  return (
    <div className="space-y-4">
      {/* Install / Update actions */}
      <div className="flex flex-wrap items-end gap-3 p-3 bg-muted rounded-lg">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Instalar do ClawHub</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={installSlug}
              onChange={(e) => onInstallSlugChange(e.target.value)}
              placeholder="slug da skill (ex: weather, dalle)"
              onKeyDown={(e) => { if (e.key === 'Enter') onInstall() }}
            />
            <Button size="sm" className="gap-1.5 shrink-0" onClick={onInstall} disabled={installLoading || !installSlug.trim()}>
              {installLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Instalar
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onUpdateAll} disabled={updateAllLoading}>
          {updateAllLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Atualizar Todas
        </Button>
      </div>

      {skills.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma skill instalada</p>
          <p className="text-sm mt-1">Use o campo acima para instalar skills do ClawHub</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map(skill => (
            <div key={skill.name} className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm">{skill.name}</p>
                  {skill.description && <p className="text-xs text-muted-foreground mt-1">{skill.description}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs px-2 py-0.5 rounded-full">
                    {skill.status || 'instalado'}
                  </span>
                  <button
                    onClick={() => {
                      if (editingSkill === skill.name) {
                        onEditSkill(null)
                      } else {
                        onEditSkill(skill.name)
                        onSkillConfigChange({ enabled: true })
                      }
                    }}
                    className="p-1 rounded hover:bg-muted"
                    title="Configurar"
                  >
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              {skill.version && <p className="text-xs text-muted-foreground mt-2">v{skill.version}</p>}

              {/* Inline config editor */}
              {editingSkill === skill.name && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skillConfigForm.enabled !== false}
                      onChange={(e) => onSkillConfigChange({ ...skillConfigForm, enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span className="text-xs font-medium">Habilitada</span>
                  </label>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">API Key (se necessário)</Label>
                    <Input
                      className="mt-0.5 h-7 text-xs"
                      type="password"
                      value={skillConfigForm.apiKey || ''}
                      onChange={(e) => onSkillConfigChange({ ...skillConfigForm, apiKey: e.target.value })}
                      placeholder="sk-..."
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Env (KEY=VALUE por linha)</Label>
                    <textarea
                      className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono min-h-[40px] resize-y"
                      value={Object.entries(skillConfigForm.env || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
                      onChange={(e) => {
                        const env: Record<string, string> = {}
                        e.target.value.split('\n').filter(l => l.includes('=')).forEach(l => {
                          const [k, ...v] = l.split('=')
                          if (k.trim()) env[k.trim()] = v.join('=')
                        })
                        onSkillConfigChange({ ...skillConfigForm, env })
                      }}
                      placeholder="MY_VAR=value"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Config (JSON)</Label>
                    <textarea
                      className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono min-h-[40px] resize-y"
                      value={skillConfigForm.config ? (typeof skillConfigForm.config === 'string' ? skillConfigForm.config : JSON.stringify(skillConfigForm.config, null, 2)) : ''}
                      onChange={(e) => {
                        try { onSkillConfigChange({ ...skillConfigForm, config: JSON.parse(e.target.value) }) }
                        catch { onSkillConfigChange({ ...skillConfigForm, config: e.target.value }) }
                      }}
                      placeholder='{"key": "value"}'
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onSaveSkillConfig(skill.name)} disabled={skillSaving}>
                      {skillSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEditSkill(null)}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HooksTab({
  hooks, actionLoading, onToggle,
}: {
  hooks: Hook[]
  actionLoading: string | null
  onToggle: (name: string, enable: boolean) => void
}) {
  if (hooks.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Webhook className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Nenhum hook instalado</p>
        <p className="text-sm mt-1">Hooks reagem a eventos do gateway (boot, comandos, memória)</p>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Nome</th>
            <th className="text-left px-4 py-2 font-medium">Tipo</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-right px-4 py-2 font-medium">Ação</th>
          </tr>
        </thead>
        <tbody>
          {hooks.map(hook => (
            <tr key={hook.name} className="border-t border-border hover:bg-muted/30">
              <td className="px-4 py-2 font-medium">{hook.name}</td>
              <td className="px-4 py-2 text-muted-foreground">{hook.type || 'internal'}</td>
              <td className="px-4 py-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  hook.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {hook.enabled ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {hook.enabled ? 'Ativo' : 'Desativado'}
                </span>
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => onToggle(hook.name, !hook.enabled)}
                  disabled={actionLoading === hook.name}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    hook.enabled
                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                  }`}
                >
                  {actionLoading === hook.name ? <Loader2 className="h-3 w-3 animate-spin inline" /> : hook.enabled ? 'Desativar' : 'Ativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProcessesTab({ processes }: { processes: Process[] }) {
  if (processes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Cpu className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Nenhum processo encontrado</p>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium">PID</th>
            <th className="text-left px-4 py-2 font-medium">Usuário</th>
            <th className="text-right px-4 py-2 font-medium">CPU%</th>
            <th className="text-right px-4 py-2 font-medium">MEM%</th>
            <th className="text-left px-4 py-2 font-medium">Comando</th>
          </tr>
        </thead>
        <tbody>
          {processes.map(p => {
            const isGateway = p.command.includes('openclaw') || p.command.includes('gateway')
            return (
              <tr key={p.pid} className={`border-t border-border hover:bg-muted/30 ${isGateway ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                <td className="px-4 py-2 font-mono text-xs">{p.pid}</td>
                <td className="px-4 py-2 text-muted-foreground">{p.user}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{p.cpu}%</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{p.memory}%</td>
                <td className="px-4 py-2 truncate max-w-md text-xs">
                  {isGateway && <Zap className="h-3 w-3 inline mr-1 text-blue-500" />}
                  {p.command}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-muted/30 text-xs text-muted-foreground">
        Atualização automática a cada 15 segundos
      </div>
    </div>
  )
}
