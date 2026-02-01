import { useState, useEffect, useCallback, useRef } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  ScrollText,
  Search,
  RefreshCw,
  Loader2,
  User,
  Clock,
  Filter,
  Radio,
  X,
  Activity,
  Shield,
  ChevronDown,
  ChevronRight,
  BarChart3,
} from 'lucide-react'

interface AuditLog {
  id: string
  userId: string | null
  action: string
  resource: string | null
  resourceId: string | null
  details: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  correlationId: string | null
  createdAt: string
  user: { id: string; name: string; email: string } | null
}

interface AuditStats {
  totalToday: number
  totalWeek: number
  totalAll: number
  topActions: { action: string; count: number }[]
  recentUsers: { id: string; name: string; email: string }[]
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const actionColors: Record<string, string> = {
  'auth.login': 'text-success bg-success/10',
  'auth.logout': 'text-muted-foreground bg-muted',
  'auth.refresh': 'text-blue-400 bg-blue-400/10',
  'auth.login_failed': 'text-error bg-error/10',
  'provider.create': 'text-purple-400 bg-purple-400/10',
  'provider.update': 'text-orange-400 bg-orange-400/10',
  'provider.delete': 'text-error bg-error/10',
  'integration.create': 'text-blue-400 bg-blue-400/10',
  'integration.delete': 'text-error bg-error/10',
  'config.update': 'text-warning bg-warning/10',
  'instance.update': 'text-purple-400 bg-purple-400/10',
}

function getActionColor(action: string): string {
  return actionColors[action] || 'text-muted-foreground bg-muted'
}

export default function LogsPage() {
  const { selectedInstance, instances } = useInstance()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [resourceFilter, setResourceFilter] = useState('')
  const [instanceFilter, setInstanceFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [liveTail, setLiveTail] = useState(false)
  const [liveEvents, setLiveEvents] = useState<AuditLog[]>([])
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', '30')
      if (search) params.set('search', search)
      if (actionFilter) params.set('action', actionFilter)
      if (resourceFilter) params.set('resource', resourceFilter)
      if (instanceFilter) params.set('instanceId', instanceFilter)

      const { data } = await api.get(`/audit?${params.toString()}`)
      setLogs(data.data)
      setPagination(data.pagination)
    } catch (err) {
      console.error('Failed to load logs', err)
    } finally {
      setLoading(false)
    }
  }, [page, search, actionFilter, resourceFilter, instanceFilter])

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/audit/stats')
      setStats(data)
    } catch (err) {
      console.error('Failed to load stats', err)
    }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    if (showStats && !stats) fetchStats()
  }, [showStats, stats, fetchStats])

  // Live tail SSE
  useEffect(() => {
    if (!liveTail) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      return
    }

    const token = localStorage.getItem('accessToken')
    const es = new EventSource(`/api/audit/stream?token=${token}`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        if (parsed.type === 'log') {
          setLiveEvents((prev) => [parsed.data, ...prev].slice(0, 100))
        }
      } catch {
        // ignore
      }
    }

    es.onerror = () => {
      // Will auto-reconnect
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [liveTail])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchLogs()
  }

  const clearFilters = () => {
    setSearch('')
    setActionFilter('')
    setResourceFilter('')
    setInstanceFilter('')
    setPage(1)
  }

  const displayLogs = liveTail ? liveEvents : logs

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico de Ações</h1>
          <p className="text-muted-foreground text-sm mt-1">Registro imutável de todas as ações do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showStats ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
            onClick={() => setShowStats(!showStats)}
          >
            <BarChart3 className="h-3 w-3" />
            Estatísticas
          </Button>
          <Button
            variant={liveTail ? 'default' : 'outline'}
            size="sm"
            className={cn('gap-2', liveTail && 'bg-success hover:bg-success/90')}
            onClick={() => { setLiveTail(!liveTail); setLiveEvents([]) }}
          >
            <Radio className={cn('h-3 w-3', liveTail && 'animate-pulse')} />
            {liveTail ? 'Live' : 'Live Tail'}
          </Button>
        </div>
      </div>

      {/* Stats panel */}
      {showStats && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                <Activity className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalToday}</p>
                <p className="text-xs text-muted-foreground">Hoje</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-400/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalWeek}</p>
                <p className="text-xs text-muted-foreground">Última semana</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-purple-400/10 flex items-center justify-center">
                <ScrollText className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalAll}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showStats && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Top Ações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.topActions.map((a) => (
                <div key={a.action} className="flex items-center justify-between text-sm">
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getActionColor(a.action))}>
                    {a.action}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">{a.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Usuários Recentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.recentUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-2 text-sm">
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <span className="truncate">{u.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and filters */}
      {!liveTail && (
        <div className="space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ação, recurso..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)} title="Filtros">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={fetchLogs} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Atualizar
            </Button>
          </form>

          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Ação</label>
                <Input
                  placeholder="auth.login, provider.create..."
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Recurso</label>
                <Input
                  placeholder="provider, api_integration..."
                  value={resourceFilter}
                  onChange={(e) => setResourceFilter(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Instância</label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={instanceFilter}
                  onChange={(e) => { setInstanceFilter(e.target.value); setPage(1) }}
                >
                  <option value="">Todas</option>
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                  ))}
                </select>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-3 w-3" /> Limpar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Live tail indicator */}
      {liveTail && (
        <div className="flex items-center gap-2 text-sm text-success">
          <Radio className="h-3 w-3 animate-pulse" />
          Live tail ativo - {liveEvents.length} eventos capturados
        </div>
      )}

      {/* Log list */}
      <div className="space-y-2">
        {loading && !liveTail ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : displayLogs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ScrollText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">
                {liveTail ? 'Aguardando novos eventos...' : 'Nenhum log encontrado'}
              </p>
            </CardContent>
          </Card>
        ) : (
          displayLogs.map((log) => {
            const isExpanded = expandedLog === log.id
            return (
              <Card
                key={log.id}
                className={cn('cursor-pointer transition-colors hover:bg-muted/30', isExpanded && 'ring-1 ring-primary/30')}
                onClick={() => setExpandedLog(isExpanded ? null : log.id)}
              >
                <CardContent className="py-3 px-3 sm:px-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}

                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded shrink-0 truncate max-w-[180px] sm:max-w-none', getActionColor(log.action))}>
                      {log.action}
                    </span>

                    {log.resource && (
                      <span className="text-xs text-muted-foreground truncate max-w-[140px] sm:max-w-none">
                        {log.resource}
                        {log.resourceId && <span className="font-mono ml-1">#{log.resourceId.slice(0, 8)}</span>}
                      </span>
                    )}

                    <span className="flex-1 min-w-0" />

                    {log.user && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3 shrink-0" /> <span className="truncate max-w-[80px]">{log.user.name}</span>
                      </span>
                    )}

                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3" />
                      {new Date(log.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground">ID do Log:</span>
                          <span className="font-mono ml-1">{log.id}</span>
                        </div>
                        {log.correlationId && (
                          <div>
                            <span className="text-muted-foreground">Correlation ID:</span>
                            <span className="font-mono ml-1">{log.correlationId}</span>
                          </div>
                        )}
                        {log.ipAddress && (
                          <div>
                            <span className="text-muted-foreground">IP:</span>
                            <span className="font-mono ml-1">{log.ipAddress}</span>
                          </div>
                        )}
                        {log.user && (
                          <div>
                            <span className="text-muted-foreground">Usuário:</span>
                            <span className="ml-1">{log.user.name} ({log.user.email})</span>
                          </div>
                        )}
                      </div>

                      {log.details && Object.keys(log.details).length > 0 && (
                        <div>
                          <span className="text-muted-foreground block mb-1">Detalhes:</span>
                          <pre className="bg-muted/50 rounded-md p-2 overflow-x-auto text-[11px] font-mono whitespace-pre-wrap">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.userAgent && (
                        <div>
                          <span className="text-muted-foreground">User Agent:</span>
                          <span className="ml-1 text-muted-foreground/70 truncate block">{log.userAgent}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {!liveTail && pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {pagination.total} registros - Página {pagination.page} de {pagination.totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
