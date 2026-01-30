import { useAuth } from '@/context/auth-context'
import { useInstance } from '@/context/instance-context'
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

export default function DashboardPage() {
  const { user } = useAuth()
  const { selectedInstance, instanceStatus, statusLoading, refreshStatus } = useInstance()

  const gateway = instanceStatus?.summary?.gateway
  const provider = instanceStatus?.summary?.provider
  const whatsapp = instanceStatus?.summary?.whatsapp

  const gatewayStatus = gateway?.status === 'online' ? 'online' : 'offline'
  const providerStatus = provider?.configured ? 'online' : 'warning'
  const whatsappStatus = whatsapp?.status === 'connected' ? 'online' : whatsapp?.status === 'disconnected' ? 'offline' : 'warning'

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
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refreshStatus()} disabled={statusLoading}>
          {statusLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Atualizar
        </Button>
      </div>

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

      {/* Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuração
            </CardTitle>
            <CardDescription>Estado da configuração da instância</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Primeiros Passos
            </CardTitle>
            <CardDescription>Configure sua instância</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-2">
              <div className="flex items-center gap-2">
                <span className={cn('h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold',
                  provider?.configured ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground')}>1</span>
                <span>Configure um provedor de IA em <strong>Conexões</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold',
                  gateway?.mode ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground')}>2</span>
                <span>Configure o Gateway em <strong>Serviços</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">3</span>
                <span>Ou use o <strong>Setup Guiado</strong></span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
