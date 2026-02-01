import { useState, useEffect, useCallback, useRef } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Clock,
  Check,
  X,
  Loader2,
  Palette,
  Volume2,
  Globe,
  FolderOpen,
  Terminal,
  Lock,
  Zap,
  RefreshCw,
} from 'lucide-react'

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

interface ToolApproval {
  id: string
  instanceId: string
  sessionId: string | null
  category: 'TOOL' | 'EXEC' | 'API' | 'ELEVATED'
  toolName: string
  description: string
  context: string | null
  risk: 'low' | 'medium' | 'high'
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED'
  decidedBy: string | null
  decidedAt: string | null
  permanent: boolean
  createdAt: string
  decidedByUser?: { id: string; name: string } | null
}

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

const CATEGORY_ICONS: Record<string, typeof Palette> = {
  API: Palette,
  EXEC: Terminal,
  TOOL: Zap,
  ELEVATED: Lock,
}

const CATEGORY_LABELS: Record<string, string> = {
  API: 'Serviço externo',
  EXEC: 'Programa',
  TOOL: 'Ferramenta',
  ELEVATED: 'Permissão elevada',
}

function getCategoryIcon(toolName: string, category: string) {
  const lower = toolName.toLowerCase()
  if (lower.includes('dall-e') || lower.includes('dalle') || lower.includes('image')) return Palette
  if (lower.includes('elevenlabs') || lower.includes('tts') || lower.includes('audio')) return Volume2
  if (lower.includes('web') || lower.includes('fetch') || lower.includes('curl') || lower.includes('wget')) return Globe
  if (lower.includes('fs') || lower.includes('file')) return FolderOpen
  return CATEGORY_ICONS[category] || Zap
}

const RISK_CONFIG = {
  low: { label: 'Baixo', color: 'text-green-600 bg-green-50 border-green-200', dot: 'bg-green-500' },
  medium: { label: 'Médio', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
  high: { label: 'Alto', color: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-500' },
}

const STATUS_CONFIG = {
  PENDING: { label: 'Aguardando', color: 'text-yellow-600 bg-yellow-50', icon: Clock },
  APPROVED: { label: 'Liberado', color: 'text-green-600 bg-green-50', icon: ShieldCheck },
  DENIED: { label: 'Negado', color: 'text-red-600 bg-red-50', icon: ShieldX },
  EXPIRED: { label: 'Expirado', color: 'text-muted-foreground bg-muted', icon: Clock },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Agora'
  if (mins < 60) return `Há ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Há ${hours}h`
  const days = Math.floor(hours / 24)
  return `Há ${days}d`
}

// ═══════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════

export default function ApprovalsPage() {
  const { selectedId } = useInstance()
  const toast = useToast()
  const [pending, setPending] = useState<ToolApproval[]>([])
  const [history, setHistory] = useState<ToolApproval[]>([])
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [permanentChecked, setPermanentChecked] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const eventSourceRef = useRef<EventSource | null>(null)

  const fetchData = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const [pendingRes, historyRes] = await Promise.all([
        api.get(`/instances/${selectedId}/approvals/pending`),
        api.get(`/instances/${selectedId}/approvals`, { params: { limit: 50 } }),
      ])
      setPending(pendingRes.data.items || [])
      const allItems: ToolApproval[] = historyRes.data.items || []
      setHistory(allItems.filter(i => i.status !== 'PENDING'))
    } catch {
      toast.error('Erro ao carregar aprovações')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => { fetchData() }, [fetchData])

  // SSE for real-time updates
  useEffect(() => {
    if (!selectedId) return
    const token = localStorage.getItem('token')
    if (!token) return

    const es = new EventSource(`/api/instances/${selectedId}/approvals/stream?token=${token}`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'new_approval' || data.type === 'status_change') {
          fetchData()
        }
      } catch { /* ignore parse errors */ }
    }

    es.onerror = () => {
      // Reconnect after 5s
      es.close()
      setTimeout(() => {
        if (eventSourceRef.current === es) fetchData()
      }, 5000)
    }

    return () => { es.close() }
  }, [selectedId, fetchData])

  const handleApprove = async (id: string) => {
    setActing(id)
    try {
      await api.put(`/instances/${selectedId}/approvals/${id}/approve`, {
        permanent: permanentChecked[id] || false,
      })
      toast.success('Acesso liberado')
      fetchData()
    } catch {
      toast.error('Erro ao liberar')
    } finally {
      setActing(null)
    }
  }

  const handleDeny = async (id: string) => {
    setActing(id)
    try {
      await api.put(`/instances/${selectedId}/approvals/${id}/deny`, {})
      toast.success('Acesso negado')
      fetchData()
    } catch {
      toast.error('Erro ao negar')
    } finally {
      setActing(null)
    }
  }

  if (!selectedId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Selecione uma instância para ver as aprovações.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" />
            Aprovações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie os acessos que o assistente precisa para funcionar
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-1">
        <button
          onClick={() => setTab('pending')}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-t transition-colors',
            tab === 'pending'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Pendentes
          {pending.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-red-500 text-white">
              {pending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-t transition-colors',
            tab === 'history'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Histórico
        </button>
      </div>

      {/* Loading */}
      {loading && pending.length === 0 && history.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Pending Tab */}
      {tab === 'pending' && (
        <div className="space-y-4">
          {pending.length === 0 && !loading && (
            <Card>
              <CardContent className="py-12 text-center">
                <ShieldCheck className="h-12 w-12 mx-auto text-green-500 mb-3" />
                <p className="text-lg font-medium">Tudo certo!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Nenhuma aprovação pendente. O assistente tem tudo que precisa.
                </p>
              </CardContent>
            </Card>
          )}

          {pending.map((item) => {
            const Icon = getCategoryIcon(item.toolName, item.category)
            const riskCfg = RISK_CONFIG[item.risk] || RISK_CONFIG.low
            const isActing = acting === item.id

            return (
              <Card key={item.id} className="border-l-4 border-l-yellow-400 animate-in fade-in slide-in-from-top-2 duration-300">
                <CardContent className="p-4 md:p-5">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    {/* Icon + Info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-base">{item.description}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                            {item.toolName}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {CATEGORY_LABELS[item.category] || item.category}
                          </span>
                          <span className={cn('text-xs px-2 py-0.5 rounded border flex items-center gap-1', riskCfg.color)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', riskCfg.dot)} />
                            Risco {riskCfg.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(item.createdAt)}
                          </span>
                        </div>
                        {item.context && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.context}</p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 shrink-0 md:items-end">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(item.id)}
                          disabled={isActing}
                          className="bg-green-600 hover:bg-green-700 text-white min-w-[100px]"
                        >
                          {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                          Liberar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeny(item.id)}
                          disabled={isActing}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Negar
                        </Button>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permanentChecked[item.id] || false}
                          onChange={(e) => setPermanentChecked(p => ({ ...p, [item.id]: e.target.checked }))}
                          className="rounded border-input"
                        />
                        Liberar permanentemente
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-2">
          {history.length === 0 && !loading && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhum histórico de aprovações.</p>
              </CardContent>
            </Card>
          )}

          {history.map((item) => {
            const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.PENDING
            const StatusIcon = statusCfg.icon

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <StatusIcon className={cn('h-4 w-4 shrink-0', statusCfg.color.split(' ')[0])} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{item.description}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">{item.toolName}</span>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded', statusCfg.color)}>
                  {statusCfg.label}
                </span>
                {item.permanent && item.status === 'APPROVED' && (
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                    Permanente
                  </span>
                )}
                {item.decidedByUser && (
                  <span className="text-xs text-muted-foreground hidden md:block">
                    por {item.decidedByUser.name}
                  </span>
                )}
                <span className="text-xs text-muted-foreground shrink-0">
                  {timeAgo(item.decidedAt || item.createdAt)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
