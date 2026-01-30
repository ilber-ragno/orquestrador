import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/auth-context'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  const [containers, setContainers] = useState<ContainerData[]>([])
  const [containersLoading, setContainersLoading] = useState(false)

  const fetchContainers = useCallback(async () => {
    setContainersLoading(true)
    try {
      const { data } = await api.get('/containers')
      setContainers(data)
    } catch {}
    finally { setContainersLoading(false) }
  }, [])

  useEffect(() => { fetchContainers() }, [fetchContainers])

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
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
                  <p className="text-sm font-medium">Container: {instanceContainer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {containerRunning ? 'Em execução' : 'Parado'}
                    {instanceContainer.state?.pid ? ` · PID ${instanceContainer.state.pid}` : ''}
                    {selectedInstance.containerType ? ` · ${selectedInstance.containerType}` : ''}
                  </p>
                </div>
              </div>
              <StatusBadge status={containerStatus} label={containerRunning ? 'Running' : 'Stopped'} />
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
                    <p className="text-xs text-muted-foreground">IP</p>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Gateway</CardTitle>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Provider IA</CardTitle>
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
              {provider?.default ? `Padrão: ${provider.default}` : 'Nenhum provider definido'}
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
              <StatusBadge status="online" label="OK" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Sessão JWT ativa</p>
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
              Containers LXC
            </CardTitle>
            <CardDescription>{runningCount}/{totalCount} containers ativos</CardDescription>
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
                      label={c.status === 'running' ? 'Running' : 'Stopped'}
                    />
                  </div>
                </div>
              ))}
              {containers.length === 0 && !containersLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum container encontrado</p>
              )}
              {containersLoading && (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Config + First Steps */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuração
            </CardTitle>
            <CardDescription>Estado da instância selecionada</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Container</span>
                <span className="font-medium">{selectedInstance?.containerName || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge
                  status={selectedInstance?.status === 'running' ? 'online' : 'offline'}
                  label={selectedInstance?.status === 'running' ? 'Running' : 'Stopped'}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Chaves configuradas</span>
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
                <p className="text-xs font-medium text-muted-foreground">Primeiros passos:</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn('h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold',
                    provider?.configured ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground')}>1</span>
                  <span className="text-muted-foreground">Provedor de IA em <strong>Conexões</strong></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn('h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold',
                    gateway?.mode ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground')}>2</span>
                  <span className="text-muted-foreground">Gateway em <strong>Serviços</strong></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">3</span>
                  <span className="text-muted-foreground">Ou use o <strong>Setup Guiado</strong></span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
