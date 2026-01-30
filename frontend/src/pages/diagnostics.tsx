import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Stethoscope,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  HardDrive,
  Cpu,
  MemoryStick,
  Clock,
  Users,
  Brain,
  Globe,
  Trash2,
  Server,
  Activity,
} from 'lucide-react'

interface HealthCheck {
  name: string
  status: 'ok' | 'warning' | 'error'
  message: string
  latency?: number
  details?: Record<string, unknown>
}

interface HealthResult {
  status: 'ok' | 'warning' | 'error'
  checks: HealthCheck[]
  timestamp: string
}

interface SystemMetrics {
  system: { hostname: string; platform: string; release: string; arch: string; uptime: number }
  cpu: { model: string; cores: number; loadAvg: { '1m': number; '5m': number; '15m': number } }
  memory: { total: number; free: number; used: number; percent: number }
  disk: { total: number; used: number; available: number; percent: number } | null
  network: { name: string; address: string; family: string }[]
  process: { pid: number; nodeVersion: string; platform: string; arch: string; uptime: number; memoryUsage: { rss: number; heapTotal: number; heapUsed: number } }
}

const checkIcons: Record<string, typeof Database> = {
  database: Database,
  database_data: Database,
  providers: Brain,
  disk: HardDrive,
  memory: MemoryStick,
  cpu: Cpu,
  uptime: Clock,
  sessions: Users,
}

const statusConfig = {
  ok: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'OK' },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'Atenção' },
  error: { icon: XCircle, color: 'text-error', bg: 'bg-error/10', label: 'Erro' },
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let val = bytes
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(1)} ${units[i]}`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

export default function DiagnosticsPage() {
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/diagnostics/health')
      setHealth(data)
    } catch (err) {
      console.error('Failed to load health', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true)
    try {
      const { data } = await api.get('/diagnostics/metrics')
      setMetrics(data)
    } catch (err) {
      console.error('Failed to load metrics', err)
    } finally {
      setMetricsLoading(false)
    }
  }, [])

  const handleCleanup = async () => {
    setCleanupLoading(true)
    setCleanupResult(null)
    try {
      const { data } = await api.post('/diagnostics/cleanup')
      setCleanupResult(`${data.deletedSessions} sessões expiradas removidas`)
      fetchHealth()
    } catch (err) {
      console.error('Failed to cleanup', err)
      setCleanupResult('Erro ao executar limpeza')
    } finally {
      setCleanupLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    fetchMetrics()
  }, [fetchHealth, fetchMetrics])

  const overallCfg = health ? statusConfig[health.status] : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Diagnóstico</h1>
          <p className="text-muted-foreground text-sm mt-1">Saúde e métricas do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { fetchHealth(); fetchMetrics() }} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Overall status */}
      {health && overallCfg && (
        <Card className={cn('border-l-4', health.status === 'ok' ? 'border-l-success' : health.status === 'warning' ? 'border-l-warning' : 'border-l-error')}>
          <CardContent className="py-4 flex items-center gap-4">
            <div className={cn('h-12 w-12 rounded-full flex items-center justify-center', overallCfg.bg)}>
              <overallCfg.icon className={cn('h-6 w-6', overallCfg.color)} />
            </div>
            <div>
              <h2 className={cn('text-lg font-bold', overallCfg.color)}>{overallCfg.label}</h2>
              <p className="text-sm text-muted-foreground">
                {health.checks.filter((c) => c.status === 'ok').length}/{health.checks.length} verificações OK
                {' - '}
                {new Date(health.timestamp).toLocaleString('pt-BR')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health checks */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Stethoscope className="h-5 w-5" /> Health Checks
        </h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : health ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {health.checks.map((check) => {
              const cfg = statusConfig[check.status]
              const Icon = checkIcons[check.name] || Activity
              return (
                <Card key={check.name}>
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
                      <Icon className={cn('h-4 w-4', cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">{check.name.replace('_', ' ')}</span>
                        <cfg.icon className={cn('h-3 w-3', cfg.color)} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{check.message}</p>
                    </div>
                    {check.latency !== undefined && (
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">{check.latency}ms</span>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : null}
      </div>

      {/* System metrics */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Server className="h-5 w-5" /> Métricas do Sistema
        </h2>
        {metricsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : metrics ? (
          <div className="space-y-4">
            {/* Resource bars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Cpu className="h-4 w-4" /> CPU
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Load {metrics.cpu.loadAvg['1m'].toFixed(2)}</span>
                      <span>{metrics.cpu.cores} cores</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', metrics.cpu.loadAvg['1m'] / metrics.cpu.cores > 0.7 ? 'bg-error' : 'bg-success')}
                        style={{ width: `${Math.min(100, (metrics.cpu.loadAvg['1m'] / metrics.cpu.cores) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{metrics.cpu.model}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MemoryStick className="h-4 w-4" /> Memória
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatBytes(metrics.memory.used)}</span>
                      <span>{formatBytes(metrics.memory.total)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', metrics.memory.percent > 80 ? 'bg-error' : metrics.memory.percent > 60 ? 'bg-warning' : 'bg-success')}
                        style={{ width: `${metrics.memory.percent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{metrics.memory.percent}% usado</p>
                  </div>
                </CardContent>
              </Card>

              {metrics.disk && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <HardDrive className="h-4 w-4" /> Disco
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatBytes(metrics.disk.used)}</span>
                        <span>{formatBytes(metrics.disk.total)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', metrics.disk.percent > 90 ? 'bg-error' : metrics.disk.percent > 75 ? 'bg-warning' : 'bg-success')}
                          style={{ width: `${metrics.disk.percent}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">{metrics.disk.percent}% usado</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* System info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Servidor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hostname</span>
                    <span className="font-mono text-xs">{metrics.system.hostname}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">OS</span>
                    <span className="font-mono text-xs">{metrics.system.platform} {metrics.system.release}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Arch</span>
                    <span className="font-mono text-xs">{metrics.system.arch}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="font-mono text-xs">{formatUptime(metrics.system.uptime)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Processo Node.js</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PID</span>
                    <span className="font-mono text-xs">{metrics.process.pid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Node</span>
                    <span className="font-mono text-xs">{metrics.process.nodeVersion}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RSS</span>
                    <span className="font-mono text-xs">{formatBytes(metrics.process.memoryUsage.rss)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heap</span>
                    <span className="font-mono text-xs">{formatBytes(metrics.process.memoryUsage.heapUsed)} / {formatBytes(metrics.process.memoryUsage.heapTotal)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Network */}
            {metrics.network.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Globe className="h-4 w-4" /> Rede
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {metrics.network.map((n, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground w-16 truncate">{n.name}</span>
                        <span className="font-mono text-xs">{n.address}</span>
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{n.family}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ações de Manutenção</CardTitle>
          <CardDescription>Operações de limpeza e manutenção do sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Limpar Sessões Expiradas</p>
              <p className="text-xs text-muted-foreground">Remove sessões de refresh token expiradas do banco</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleCleanup} disabled={cleanupLoading}>
              {cleanupLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Executar
            </Button>
          </div>
          {cleanupResult && (
            <p className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">{cleanupResult}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
