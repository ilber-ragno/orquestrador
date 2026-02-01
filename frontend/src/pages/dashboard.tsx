import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/auth-context'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  Activity,
  Server,
  Shield,
  Wifi,
  WifiOff,
  Settings,
  RefreshCw,
  ArrowRight,
  Clock,
  FileText,
  Loader2,
  Cpu,
  HardDrive,
  MemoryStick,
  CheckCircle2,
  XCircle,
  Container,
  BadgeCheck,
  AlertTriangle,
  Terminal,
  Brain,
  MessageSquare,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function StatusBadge({ status, label }: { status: 'online' | 'offline' | 'warning' | 'error' | 'unknown'; label: string }) {
  const colors = {
    online: 'bg-success/10 text-success border-success/20',
    offline: 'bg-muted text-muted-foreground border-border',
    warning: 'bg-warning/10 text-warning border-warning/20',
    error: 'bg-error/10 text-error border-error/20',
    unknown: 'bg-muted text-muted-foreground border-border',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border', colors[status])}>
      <span className={cn('h-1.5 w-1.5 rounded-full', {
        'bg-success': status === 'online',
        'bg-muted-foreground': status === 'offline' || status === 'unknown',
        'bg-warning': status === 'warning',
        'bg-error': status === 'error',
      })} />
      {label}
    </span>
  )
}

interface ContainerData {
  name: string
  status: string
  host: string
  state?: {
    cpu?: { usage: number }
    memory?: { usage: number; peak: number }
    pid?: number
    network?: { name: string; addresses: string[] }[]
  }
  instance?: { id: string; name: string; slug: string; containerType: string | null } | null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { instances, selectedInstance, instanceStatus, statusLoading, refreshStatus, refreshInstances } = useInstance()
  const toast = useToast()
  const [containers, setContainers] = useState<ContainerData[]>([])
  const [containersLoading, setContainersLoading] = useState(false)
  const [validation, setValidation] = useState<{ checks: { name: string; status: string; message?: string; detail?: string }[] } | null>(null)
  const [validating, setValidating] = useState(false)
  const [openclawInfo, setOpenclawInfo] = useState<{ version?: string; gatewayStatus?: string; gatewayPid?: string; gatewayUptime?: string; activeSessions?: string; model?: string; messagesProcessed?: string } | null>(null)
  const [openclawLoading, setOpenclawLoading] = useState(false)
  const [termCmd, setTermCmd] = useState('')
  const [termOutput, setTermOutput] = useState('')
  const [termLoading, setTermLoading] = useState(false)

  const fetchContainers = useCallback(async () => {
    setContainersLoading(true)
    try {
      const { data } = await api.get('/containers')
      setContainers(data)
    } catch (err) {
      toast.error('Falha ao carregar containers')
    }
    finally { setContainersLoading(false) }
  }, [toast])

  useEffect(() => { fetchContainers() }, [fetchContainers])

  const fetchOpenclawInfo = useCallback(async () => {
    if (!selectedInstance) return
    setOpenclawLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedInstance.id}/openclaw-info`)
      setOpenclawInfo(data)
    } catch { /* ignore */ }
    finally { setOpenclawLoading(false) }
  }, [selectedInstance])

  useEffect(() => { fetchOpenclawInfo() }, [fetchOpenclawInfo])

  const runTerminalCmd = async () => {
    if (!termCmd.trim() || !selectedInstance) return
    setTermLoading(true)
    try {
      const { data } = await api.post(`/instances/${selectedInstance.id}/openclaw-exec`, { command: termCmd.trim() })
      setTermOutput(data.output || data.stdout || 'Sem saída')
    } catch (err: any) {
      setTermOutput(err?.response?.data?.error?.message || 'Erro ao executar comando')
    }
    finally { setTermLoading(false) }
  }

  const handleValidate = useCallback(async () => {
    if (!selectedInstance) return
    setValidating(true)
    try {
      const { data } = await api.get(`/instances/${selectedInstance.id}/clawdbot/validate`)
      setValidation(data)
    } catch (err) {
      toast.error('Falha ao validar ambiente do Clawdbot')
    }
    finally { setValidating(false) }
  }, [selectedInstance, toast])

  useEffect(() => { setValidation(null) }, [selectedInstance])

  const handleRefresh = () => {
    refreshStatus()
    refreshInstances()
    fetchContainers()
  }

  const gateway = instanceStatus?.summary?.gateway
  const provider = instanceStatus?.summary?.provider
  const whatsapp = instanceStatus?.summary?.whatsapp

  const instanceContainer = containers.find(c => c.instance?.id === selectedInstance?.id)
  const containerRunning = instanceContainer?.status === 'running'

  const gatewayStatus = gateway?.status === 'online' ? 'online' as const : 'offline' as const
  const providerStatus = provider?.configured ? 'online' as const : 'warning' as const
  const whatsappStatus = whatsapp?.status === 'connected' ? 'online' as const : whatsapp?.status === 'disconnected' ? 'offline' as const : 'warning' as const
  const containerStatus = containerRunning ? 'online' as const : 'offline' as const

  const runningCount = containers.filter(c => c.status === 'running').length
  const totalCount = containers.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {selectedInstance
              ? `${selectedInstance.name} — ${selectedInstance.description || selectedInstance.slug}`
              : `Bem-vindo, ${user?.name}`}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleRefresh} disabled={statusLoading || containersLoading}>
          {(statusLoading || containersLoading) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Atualizar
        </Button>
      </div>

      {/* Container Status for selected instance */}
      {selectedInstance && instanceContainer && (
        <Card className={cn('border-l-4', containerRunning ? 'border-l-success' : 'border-l-error')}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('h-10 w-10 rounded-full flex items-center justify-center', containerRunning ? 'bg-success/10' : 'bg-error/10')}>
                  <Server className={cn('h-5 w-5', containerRunning ? 'text-success' : 'text-error')} />
                </div>
                <div>
                  <p className="text-sm font-medium">Servidor: {instanceContainer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {containerRunning ? 'Em execução' : 'Parado'}
                    {selectedInstance.containerType ? ` · Tipo: ${selectedInstance.containerType}` : ''}
                  </p>
                </div>
              </div>
              <StatusBadge status={containerStatus} label={containerRunning ? 'Ativo' : 'Parado'} />
            </div>
            {instanceContainer.state && containerRunning && (
              <div className="grid grid-cols-3 gap-4 mt-4 pt-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Memória</p>
                    <p className="text-sm font-medium">{instanceContainer.state.memory ? formatBytes(instanceContainer.state.memory.usage) : 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">CPU</p>
                    <p className="text-sm font-medium">{instanceContainer.state.cpu ? `${(instanceContainer.state.cpu.usage / 1e9).toFixed(1)}s` : 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Endereço</p>
                    <p className="text-sm font-medium">{instanceContainer.state.network?.find(n => n.name === 'eth0')?.addresses?.[0]?.substring(0, 20) || 'N/A'}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conexão Principal</CardTitle>
            {gatewayStatus === 'online' ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusBadge status={gatewayStatus} label={gatewayStatus === 'online' ? 'Online' : 'Offline'} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {gateway?.mode ? `Modo: ${gateway.mode}` : 'Não configurado'}
              {gateway?.port ? ` | Porta: ${gateway.port}` : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inteligência Artificial</CardTitle>
            <Activity className={cn('h-4 w-4', providerStatus === 'online' ? 'text-success' : 'text-warning')} />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusBadge
                status={providerStatus}
                label={provider?.configured ? 'Configurado' : 'Pendente'}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {provider?.default ? `Modelo: ${provider.default}` : 'Nenhuma IA configurada'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">WhatsApp</CardTitle>
            <Server className={cn('h-4 w-4', whatsappStatus === 'online' ? 'text-success' : 'text-muted-foreground')} />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusBadge
                status={whatsappStatus}
                label={whatsapp?.status === 'connected' ? 'Conectado' : 'Desconectado'}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Canal de comunicação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Segurança</CardTitle>
            <Shield className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusBadge status="online" label="Configurado" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Autenticação ativa</p>
          </CardContent>
        </Card>
      </div>

      {/* Containers Overview + Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* All Containers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Container className="h-4 w-4" />
              Servidores do Clawdbot
            </CardTitle>
            <CardDescription>{runningCount}/{totalCount} servidores ativos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {containers.map((c) => (
                <div key={c.name} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    {c.status === 'running'
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="text-sm font-medium">{c.instance?.name || c.name}</span>
                    {c.instance?.containerType && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c.instance.containerType}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {c.state?.memory && <span>{formatBytes(c.state.memory.usage)}</span>}
                    <StatusBadge
                      status={c.status === 'running' ? 'online' : 'offline'}
                      label={c.status === 'running' ? 'Ativo' : 'Parado'}
                    />
                  </div>
                </div>
              ))}
              {containers.length === 0 && !containersLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum servidor encontrado</p>
              )}
              {containersLoading && (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* OpenClaw Validation */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4" />
                  Validação do Clawdbot
                </CardTitle>
                <CardDescription>Checklist do ambiente</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleValidate} disabled={validating || !selectedInstance}>
                {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Validar'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!validation && !validating && (
              <p className="text-sm text-muted-foreground text-center py-4">Clique em "Validar" para verificar o ambiente</p>
            )}
            {validating && (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            )}
            {validation && (
              <div className="space-y-1.5">
                {validation.checks.map((check, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2 text-sm">
                      {check.status === 'ok' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      ) : check.status === 'warning' ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-error shrink-0" />
                      )}
                      <span className="text-muted-foreground">{check.name}</span>
                    </div>
                    <span className={cn('text-xs', check.status === 'ok' ? 'text-success' : check.status === 'warning' ? 'text-warning' : 'text-error')}>
                      {(() => { const msg = check.message || check.detail || ''; return msg.length > 40 ? msg.substring(0, 40) + '...' : msg })()}
                    </span>
                  </div>
                ))}
                {validation.checks.length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                      {validation.checks.every(c => c.status === 'ok') ? (
                        <>
                          <BadgeCheck className="h-4 w-4 text-success" />
                          <span className="text-sm font-medium text-success">Pronto para operacao</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-warning" />
                          <span className="text-sm font-medium text-warning">
                            {validation.checks.filter(c => c.status !== 'ok').length} item(s) pendente(s)
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* OpenClaw Info */}
      {selectedInstance && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Brain className="h-5 w-5" /> OpenClaw
            {openclawLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card>
              <CardContent className="pt-3 pb-3 px-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Versão</p>
                <p className="text-sm font-medium mt-0.5">{openclawInfo?.version || 'N/A'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3 px-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gateway</p>
                <p className={cn('text-sm font-medium mt-0.5', openclawInfo?.gatewayStatus === 'running' ? 'text-success' : 'text-muted-foreground')}>
                  {openclawInfo?.gatewayStatus || 'N/A'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3 px-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Uptime</p>
                <p className="text-sm font-medium mt-0.5">{openclawInfo?.gatewayUptime || 'N/A'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3 px-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sessões</p>
                <p className="text-sm font-medium mt-0.5">{openclawInfo?.activeSessions || '0'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3 px-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Modelo</p>
                <p className="text-sm font-medium mt-0.5 truncate" title={openclawInfo?.model}>{openclawInfo?.model || 'N/A'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3 px-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Mensagens</p>
                <p className="text-sm font-medium mt-0.5">{openclawInfo?.messagesProcessed || '0'}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Config + First Steps */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuração
            </CardTitle>
            <CardDescription>Estado do Clawdbot selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Servidor</span>
                <span className="font-medium">{selectedInstance?.containerName || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge
                  status={selectedInstance?.status === 'running' ? 'online' : 'offline'}
                  label={selectedInstance?.status === 'running' ? 'Ativo' : 'Parado'}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Configurações realizadas</span>
                <span className="font-medium">{instanceStatus?.summary?.configCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Última alteração</span>
                <span className="font-medium text-xs">
                  {instanceStatus?.summary?.lastConfigUpdate
                    ? new Date(instanceStatus.summary.lastConfigUpdate).toLocaleString('pt-BR')
                    : 'Nunca'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Histórico</span>
                <span className="font-medium">{selectedInstance?.historyCount ?? 0} alterações</span>
              </div>

              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-xs font-medium text-muted-foreground">O que fazer agora:</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn('h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold',
                    provider?.configured ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground')}>1</span>
                  <span className="text-muted-foreground">Configurar IA em <strong>Conexões</strong></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn('h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold',
                    gateway?.mode ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground')}>2</span>
                  <span className="text-muted-foreground">Conexão Principal em <strong>Serviços</strong></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">3</span>
                  <span className="text-muted-foreground">Ou use o <strong>Assistente Inicial</strong></span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Terminal OpenClaw */}
      {selectedInstance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="h-4 w-4" /> Terminal OpenClaw
            </CardTitle>
            <CardDescription>Execute comandos slash no container ({selectedInstance.containerName})</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {['/status', '/model list', '/channels status', '/doctor', '/probe'].map(cmd => (
                <Button key={cmd} variant="outline" size="sm" className="text-xs h-7" onClick={() => { setTermCmd(cmd); }}>
                  {cmd}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="openclaw <comando> ou /slash-command"
                value={termCmd}
                onChange={e => setTermCmd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runTerminalCmd()}
              />
              <Button size="sm" onClick={runTerminalCmd} disabled={termLoading || !termCmd.trim()}>
                {termLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Executar'}
              </Button>
            </div>
            {termOutput && (
              <div className="bg-muted rounded-md p-3 max-h-64 overflow-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">{termOutput}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
