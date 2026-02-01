import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import {
  Plus,
  Loader2,
  Webhook,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
} from 'lucide-react'

interface WebhookEndpoint {
  id: string
  url: string
  secret: string | null
  events: string[]
  isActive: boolean
  createdAt: string
  _count: { logs: number }
}

interface WebhookLog {
  id: string
  eventType: string
  statusCode: number | null
  success: boolean
  retries: number
  createdAt: string
}

const AVAILABLE_EVENTS = [
  { value: '*', label: 'Todos os eventos' },
  { value: 'message.received', label: 'Mensagem recebida' },
  { value: 'message.sent', label: 'Mensagem enviada' },
  { value: 'session.created', label: 'Sessão criada' },
  { value: 'session.ended', label: 'Sessão encerrada' },
  { value: 'channel.connected', label: 'Canal conectado' },
  { value: 'channel.disconnected', label: 'Canal desconectado' },
  { value: 'agent.error', label: 'Erro de agente' },
  { value: 'gateway.start', label: 'Gateway iniciado' },
  { value: 'gateway.stop', label: 'Gateway parado' },
]

export default function WebhooksPage() {
  const { selectedId } = useInstance()
  const toast = useToast()
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ url: '', secret: '', events: ['*'] as string[] })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  const fetchEndpoints = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/webhooks`)
      setEndpoints(data)
    } catch {
      toast.error('Erro ao carregar webhooks')
    } finally {
      setLoading(false)
    }
  }, [selectedId, toast])

  useEffect(() => { fetchEndpoints() }, [fetchEndpoints])

  const handleCreate = async () => {
    if (!selectedId || !form.url.trim() || form.events.length === 0) return
    setSaving(true)
    try {
      await api.post(`/instances/${selectedId}/webhooks`, {
        url: form.url,
        secret: form.secret || undefined,
        events: form.events,
      })
      toast.success('Webhook criado com sucesso')
      setShowForm(false)
      setForm({ url: '', secret: '', events: ['*'] })
      await fetchEndpoints()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao criar webhook')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (ep: WebhookEndpoint) => {
    if (!selectedId || !window.confirm(`Remover webhook ${ep.url}?`)) return
    try {
      await api.delete(`/instances/${selectedId}/webhooks/${ep.id}`)
      toast.success('Webhook removido')
      await fetchEndpoints()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao remover webhook')
    }
  }

  const handleExpand = async (ep: WebhookEndpoint) => {
    if (expandedId === ep.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(ep.id)
    setLogsLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/webhooks/${ep.id}/logs?limit=10`)
      setLogs(data.data || [])
    } catch {
      toast.error('Erro ao carregar logs')
    } finally {
      setLogsLoading(false)
    }
  }

  const toggleEvent = (ev: string) => {
    setForm(prev => {
      const has = prev.events.includes(ev)
      if (ev === '*') return { ...prev, events: has ? [] : ['*'] }
      const filtered = prev.events.filter(e => e !== '*' && e !== ev)
      if (!has) filtered.push(ev)
      return { ...prev, events: filtered }
    })
  }

  if (!selectedId) return <div className="p-8 text-center text-muted-foreground">Selecione uma instância</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-muted-foreground text-sm mt-1">Endpoints para receber notificações de eventos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={fetchEndpoints} disabled={loading}>
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> Atualizar
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-3 w-3" /> Novo Webhook
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4" /> Novo Webhook
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">URL do endpoint</Label>
                <Input className="mt-1" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://meu-servidor.com/webhook" />
              </div>
              <div>
                <Label className="text-xs">Secret (opcional, para assinatura HMAC)</Label>
                <Input className="mt-1" type="password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="meu-secret-seguro" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-2 block">Eventos</Label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_EVENTS.map((ev) => (
                  <button
                    key={ev.value}
                    onClick={() => toggleEvent(ev.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                      form.events.includes(ev.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                    )}
                  >
                    {ev.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={saving || !form.url.trim() || form.events.length === 0} className="gap-2">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Criar
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                <X className="h-3 w-3 mr-1" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Endpoints list */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : endpoints.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nenhum webhook configurado. Clique em "Novo Webhook" para adicionar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {endpoints.map((ep) => {
            const isExpanded = expandedId === ep.id
            return (
              <Card key={ep.id} className={cn(!ep.isActive && 'opacity-50')}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full flex items-center justify-center bg-muted shrink-0">
                      <Webhook className="h-4 w-4 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ep.url}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{(ep.events as string[]).join(', ')}</span>
                        <span className="text-[10px] text-muted-foreground">· {ep._count.logs} entregas</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleExpand(ep)} title="Logs">
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => handleDelete(ep)} title="Remover">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Delivery logs */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Últimas entregas</p>
                      {logsLoading ? (
                        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                      ) : logs.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">Nenhuma entrega registrada</p>
                      ) : (
                        <div className="space-y-1">
                          {logs.map((log) => (
                            <div key={log.id} className="flex items-center gap-2 text-xs py-1">
                              {log.success
                                ? <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                                : <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                              }
                              <span className="font-mono text-muted-foreground">{log.eventType}</span>
                              <span className={cn('font-mono', log.success ? 'text-green-400' : 'text-red-400')}>
                                {log.statusCode || 'ERR'}
                              </span>
                              {log.retries > 0 && <span className="text-muted-foreground">({log.retries} retries)</span>}
                              <span className="text-muted-foreground ml-auto">{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
