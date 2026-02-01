import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { FieldHelp } from '@/components/ui/help-tooltip'
import {
  Smartphone,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Trash2,
  Monitor,
  Tablet,
  Wifi,
  Clock,
} from 'lucide-react'

interface DeviceNode {
  id: string
  name: string
  type: string
  status: string
  capabilities?: string[]
  lastSeen?: string
}

const typeLabels: Record<string, { icon: typeof Smartphone; label: string }> = {
  phone: { icon: Smartphone, label: 'Celular' },
  tablet: { icon: Tablet, label: 'Tablet' },
  desktop: { icon: Monitor, label: 'Computador' },
  default: { icon: Wifi, label: 'Dispositivo' },
}

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  online: { label: 'Conectado', color: 'text-success', bg: 'bg-success/10' },
  connected: { label: 'Conectado', color: 'text-success', bg: 'bg-success/10' },
  approved: { label: 'Aprovado', color: 'text-success', bg: 'bg-success/10' },
  pending: { label: 'Aguardando aprovação', color: 'text-warning', bg: 'bg-warning/10' },
  offline: { label: 'Desconectado', color: 'text-muted-foreground', bg: 'bg-muted' },
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'agora mesmo'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`
  return `há ${Math.floor(diff / 86400)} dias`
}

export default function NodesPage() {
  const { selectedInstance } = useInstance()
  const toast = useToast()
  const [nodes, setNodes] = useState<DeviceNode[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchNodes = useCallback(async () => {
    if (!selectedInstance) return
    setLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedInstance.id}/nodes`)
      setNodes(data)
    } catch {
      toast.error('Erro ao carregar dispositivos')
    } finally {
      setLoading(false)
    }
  }, [selectedInstance, toast])

  useEffect(() => { fetchNodes() }, [fetchNodes])

  const handleAction = async (deviceId: string, action: 'approve' | 'reject' | 'remove') => {
    if (!selectedInstance) return
    setActionLoading(`${deviceId}-${action}`)
    try {
      await api.post(`/instances/${selectedInstance.id}/nodes/${deviceId}/${action}`)
      const labels = { approve: 'aprovado', reject: 'rejeitado', remove: 'removido' }
      toast.success(`Dispositivo ${labels[action]}`)
      fetchNodes()
    } catch {
      const labels = { approve: 'aprovar', reject: 'rejeitar', remove: 'remover' }
      toast.error(`Erro ao ${labels[action]} dispositivo`)
    } finally {
      setActionLoading(null)
    }
  }

  if (!selectedInstance) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Dispositivos</h1>
        <p className="text-muted-foreground text-sm">Selecione uma instância para visualizar os dispositivos conectados.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dispositivos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Aparelhos e computadores conectados ao assistente
            <FieldHelp field="nodes.status" />
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={fetchNodes} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : nodes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum dispositivo conectado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Dispositivos aparecem aqui quando se conectam ao assistente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {nodes.map(node => {
            const typeInfo = typeLabels[node.type] || typeLabels.default
            const Icon = typeInfo.icon
            const statusInfo = statusLabels[node.status] || statusLabels.offline
            const isPending = node.status === 'pending'
            const isOnline = node.status === 'online' || node.status === 'connected' || node.status === 'approved'

            return (
              <Card key={node.id} className={cn(isPending && 'border-warning/30')}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <div className={cn('h-10 w-10 rounded-full flex items-center justify-center', statusInfo.bg)}>
                    <Icon className={cn('h-5 w-5', statusInfo.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{node.name || node.id}</span>
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full font-medium',
                        statusInfo.bg, statusInfo.color
                      )}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Icon className="h-3 w-3" /> {typeInfo.label}
                      </span>
                      {node.lastSeen && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {timeAgo(node.lastSeen)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {isPending && (
                      <>
                        <Button
                          size="sm" className="h-8 text-xs gap-1.5 bg-success hover:bg-success/90 text-white"
                          onClick={() => handleAction(node.id, 'approve')}
                          disabled={actionLoading === `${node.id}-approve`}
                        >
                          {actionLoading === `${node.id}-approve` ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Aprovar
                        </Button>
                        <Button
                          size="sm" variant="destructive" className="h-8 text-xs gap-1.5"
                          onClick={() => handleAction(node.id, 'reject')}
                          disabled={actionLoading === `${node.id}-reject`}
                        >
                          {actionLoading === `${node.id}-reject` ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                          Recusar
                        </Button>
                      </>
                    )}
                    {!isPending && (
                      <Button
                        variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground hover:text-destructive"
                        onClick={() => handleAction(node.id, 'remove')}
                        disabled={!!actionLoading}
                      >
                        <Trash2 className="h-3 w-3" /> Remover
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
