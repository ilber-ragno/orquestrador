import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
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
  Cpu,
  HardDrive,
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
  running: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Rodando' },
  stopped: { icon: MinusCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Parado' },
  failed: { icon: XCircle, color: 'text-error', bg: 'bg-error/10', label: 'Falhou' },
  unknown: { icon: AlertCircle, color: 'text-warning', bg: 'bg-warning/10', label: 'Desconhecido' },
}

export default function ServicesPage() {
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
    } catch (err) {
      console.error('Failed to load services', err)
    } finally {
      setLoading(false)
    }
  }, [])

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
      }
    } catch (err) {
      console.error(`Failed to ${action} ${name}`, err)
    } finally {
      setActionLoading(null)
    }
  }

  const fetchDetail = async (name: string) => {
    setDetailLoading(true)
    try {
      const { data } = await api.get(`/services/${name}/status`)
      setSelectedService(data)
    } catch (err) {
      console.error('Failed to load service detail', err)
    } finally {
      setDetailLoading(false)
    }
  }

  const filtered = services.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()),
  )

  const counts = {
    running: services.filter((s) => s.status === 'running').length,
    stopped: services.filter((s) => s.status === 'stopped').length,
    failed: services.filter((s) => s.status === 'failed').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Serviços</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerenciar serviços systemd do servidor</p>
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
              <p className="text-xs text-muted-foreground">Rodando</p>
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
              <p className="text-xs text-muted-foreground">Com falha</p>
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
                      <p className="text-xs text-muted-foreground truncate">{svc.description}</p>
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
                          title="Iniciar"
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
                            title="Reiniciar"
                            disabled={actionLoading !== null}
                            onClick={(e) => { e.stopPropagation(); handleAction(svc.name, 'restart') }}
                          >
                            {actionLoading === `${svc.name}:restart` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3 text-warning" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Parar"
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
                <CardDescription>{selectedService.description}</CardDescription>
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
                        <span className="text-muted-foreground flex items-center gap-1"><Power className="h-3 w-3" /> Boot</span>
                        <span className="font-medium">{selectedService.enabled ? 'Habilitado' : 'Desabilitado'}</span>
                      </div>
                      {selectedService.pid && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1"><Cpu className="h-3 w-3" /> PID</span>
                          <span className="font-mono text-xs">{selectedService.pid}</span>
                        </div>
                      )}
                      {selectedService.uptime && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Uptime</span>
                          <span className="font-medium">{selectedService.uptime}</span>
                        </div>
                      )}
                      {selectedService.memory && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1"><HardDrive className="h-3 w-3" /> Memória</span>
                          <span className="font-medium">{selectedService.memory}</span>
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
                          <Power className="h-3 w-3" /> Habilitar Boot
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="gap-1 flex-1 text-xs" onClick={() => handleAction(selectedService.name, 'disable')}>
                          <PowerOff className="h-3 w-3" /> Desabilitar Boot
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
