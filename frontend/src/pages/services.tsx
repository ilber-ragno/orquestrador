import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { FieldHelp } from '@/components/ui/help-tooltip'
import {
  Play,
  Square,
  RotateCw,
  Power,
  PowerOff,
  Search,
  RefreshCw,
  Loader2,
  Server,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MinusCircle,
} from 'lucide-react'

interface ServiceInfo {
  name: string
  description: string
  status: 'running' | 'stopped' | 'failed' | 'unknown'
  enabled: boolean
  pid: number | null
  uptime: string | null
  memory: string | null
}

const statusConfig = {
  running: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Funcionando' },
  stopped: { icon: MinusCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Parado' },
  failed: { icon: XCircle, color: 'text-error', bg: 'bg-error/10', label: 'Com erro' },
  unknown: { icon: AlertCircle, color: 'text-warning', bg: 'bg-warning/10', label: 'Desconhecido' },
}

/** Descrições amigáveis para serviços conhecidos */
const friendlyDescriptions: Record<string, string> = {
  'openclaw-gateway': 'Ponte de comunicação entre os canais (WhatsApp, Telegram) e o assistente',
  'openclaw-watchdog': 'Monitor que verifica se os serviços estão funcionando e reinicia se necessário',
  'openclaw-heartbeat': 'Tarefa automática que executa rotinas periódicas do assistente',
  'openclaw-agent': 'O assistente de IA que processa e responde mensagens',
  nginx: 'Servidor web que gerencia conexões HTTPS e direciona requisições',
  postgresql: 'Banco de dados onde ficam salvas todas as configurações e histórico',
  redis: 'Memória rápida para cache e filas de processamento',
}

export default function ServicesPage() {
  const toast = useToast()
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedService, setSelectedService] = useState<ServiceInfo | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchServices = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/services')
      setServices(data)
    } catch {
      toast.error('Erro ao carregar serviços')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  const handleAction = async (name: string, action: string) => {
    setActionLoading(`${name}:${action}`)
    try {
      const { data } = await api.post(`/services/${name}/${action}`)
      if (data.status) {
        setServices((prev) => prev.map((s) => (s.name === name ? { ...s, ...data.status } : s)))
        if (selectedService?.name === name) setSelectedService(data.status)
        const actionLabels: Record<string, string> = {
          start: 'iniciado', stop: 'parado', restart: 'reiniciado', enable: 'ativado para início automático', disable: 'desativado do início automático',
        }
        toast.success(`Serviço ${name} ${actionLabels[action] || action} com sucesso`)
      }
    } catch {
      toast.error(`Erro ao executar ação no serviço ${name}`)
    } finally {
      setActionLoading(null)
    }
  }

  const fetchDetail = async (name: string) => {
    setDetailLoading(true)
    try {
      const { data } = await api.get(`/services/${name}/status`)
      setSelectedService(data)
    } catch {
      toast.error('Erro ao carregar detalhes do serviço')
    } finally {
      setDetailLoading(false)
    }
  }

  const getDescription = (svc: ServiceInfo) => {
    return friendlyDescriptions[svc.name] || svc.description
  }

  const filtered = services.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      (friendlyDescriptions[s.name] || '').toLowerCase().includes(search.toLowerCase()),
  )

  const counts = {
    running: services.filter((s) => s.status === 'running').length,
    stopped: services.filter((s) => s.status === 'stopped').length,
    failed: services.filter((s) => s.status === 'failed').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Serviços</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Componentes que mantêm o assistente funcionando
            <FieldHelp field="services.status" />
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={fetchServices} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Atualizar
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.running}</p>
              <p className="text-xs text-muted-foreground">Funcionando</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <MinusCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.stopped}</p>
              <p className="text-xs text-muted-foreground">Parados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-error/10 flex items-center justify-center">
              <XCircle className="h-4 w-4 text-error" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.failed}</p>
              <p className="text-xs text-muted-foreground">Com erro</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar serviço..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Service list + detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum serviço encontrado</CardContent></Card>
          ) : (
            filtered.map((svc) => {
              const cfg = statusConfig[svc.status]
              const isSelected = selectedService?.name === svc.name
              return (
                <Card
                  key={svc.name}
                  className={cn('cursor-pointer transition-colors', isSelected && 'ring-1 ring-primary')}
                  onClick={() => fetchDetail(svc.name)}
                >
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', cfg.bg)}>
                      <cfg.icon className={cn('h-4 w-4', cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{svc.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{getDescription(svc)}</p>
                    </div>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                      {cfg.label}
                    </span>
                    <div className="flex gap-1">
                      {svc.status !== 'running' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Iniciar serviço"
                          disabled={actionLoading !== null}
                          onClick={(e) => { e.stopPropagation(); handleAction(svc.name, 'start') }}
                        >
                          {actionLoading === `${svc.name}:start` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 text-success" />}
                        </Button>
                      )}
                      {svc.status === 'running' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Reiniciar serviço"
                            disabled={actionLoading !== null}
                            onClick={(e) => { e.stopPropagation(); handleAction(svc.name, 'restart') }}
                          >
                            {actionLoading === `${svc.name}:restart` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3 text-warning" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Parar serviço"
                            disabled={actionLoading !== null}
                            onClick={(e) => { e.stopPropagation(); handleAction(svc.name, 'stop') }}
                          >
                            {actionLoading === `${svc.name}:stop` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3 text-error" />}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selectedService ? (
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  {selectedService.name}
                </CardTitle>
                <CardDescription>{getDescription(selectedService)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {detailLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : (
                  <>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <span className={cn('font-medium', statusConfig[selectedService.status].color)}>
                          {statusConfig[selectedService.status].label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Power className="h-3 w-3" /> Início automático
                          <FieldHelp field="services.enabled" />
                        </span>
                        <span className={cn('font-medium', selectedService.enabled ? 'text-success' : 'text-muted-foreground')}>
                          {selectedService.enabled ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      {selectedService.uptime && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Ativo há
                            <FieldHelp field="services.uptime" />
                          </span>
                          <span className="font-medium">{selectedService.uptime}</span>
                        </div>
                      )}
                      {selectedService.memory && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground flex items-center gap-1">
                              Memória em uso
                              <FieldHelp field="services.memory" />
                            </span>
                            <span className="font-medium">{selectedService.memory}</span>
                          </div>
                          {(() => {
                            const m = selectedService.memory.match(/([\d.]+)\s*(MB|GB|KB)/i);
                            if (!m) return null;
                            let mb = parseFloat(m[1]);
                            if (m[2].toUpperCase() === 'GB') mb *= 1024;
                            if (m[2].toUpperCase() === 'KB') mb /= 1024;
                            const pct = Math.min(100, Math.round((mb / 512) * 100));
                            const color = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-emerald-500';
                            return (
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border">
                      {selectedService.status !== 'running' ? (
                        <Button size="sm" className="gap-1 flex-1" onClick={() => handleAction(selectedService.name, 'start')}>
                          <Play className="h-3 w-3" /> Iniciar
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" className="gap-1 flex-1" onClick={() => handleAction(selectedService.name, 'restart')}>
                            <RotateCw className="h-3 w-3" /> Reiniciar
                          </Button>
                          <Button size="sm" variant="destructive" className="gap-1 flex-1" onClick={() => handleAction(selectedService.name, 'stop')}>
                            <Square className="h-3 w-3" /> Parar
                          </Button>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {!selectedService.enabled ? (
                        <Button size="sm" variant="outline" className="gap-1 flex-1 text-xs" onClick={() => handleAction(selectedService.name, 'enable')}>
                          <Power className="h-3 w-3" /> Ativar início automático
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="gap-1 flex-1 text-xs" onClick={() => handleAction(selectedService.name, 'disable')}>
                          <PowerOff className="h-3 w-3" /> Desativar início automático
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Selecione um serviço para ver detalhes
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
