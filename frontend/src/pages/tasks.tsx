import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import {
  ListTodo,
  Loader2,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  Ban,
  ChevronDown,
  ChevronRight,
  Activity,
} from 'lucide-react'

interface JobStep { id: string; name: string; status: string; output: string | null; error: string | null; startedAt: string | null; endedAt: string | null; sortOrder: number }
interface Job { id: string; instanceId: string | null; userId: string; type: string; description: string; status: string; input: any; output: any; error: string | null; retries: number; maxRetries: number; timeout: number; startedAt: string | null; completedAt: string | null; createdAt: string; steps: JobStep[] }
interface JobStats { pending: number; running: number; completed: number; failed: number; cancelled: number; total: number }

const statusCfg: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  PENDING: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Pendente' },
  RUNNING: { icon: Activity, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Executando' },
  COMPLETED: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Concluído' },
  FAILED: { icon: XCircle, color: 'text-error', bg: 'bg-error/10', label: 'Falhou' },
  CANCELLED: { icon: Ban, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Cancelado' },
}

export default function TasksPage() {
  const { selectedId } = useInstance()
  const toast = useToast()
  const [jobs, setJobs] = useState<Job[]>([])
  const [stats, setStats] = useState<JobStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' })
      if (selectedId) params.set('instanceId', selectedId)
      const { data } = await api.get(`/jobs?${params}`)
      setJobs(data.data)
      setTotalPages(data.pagination.totalPages)
    } catch (err) {
      toast.error('Falha ao carregar tarefas')
    }
    finally { setLoading(false) }
  }, [page, selectedId, toast])

  const fetchStats = useCallback(async () => {
    try { const { data } = await api.get('/jobs/stats'); setStats(data) } catch (err) {
      toast.error('Falha ao carregar estatísticas')
    }
  }, [toast])

  useEffect(() => { fetchJobs(); fetchStats() }, [fetchJobs, fetchStats])

  const handleCancel = async (jobId: string) => {
    try {
      await api.post(`/jobs/${jobId}/cancel`)
      toast.success('Tarefa cancelada com sucesso')
      fetchJobs()
      fetchStats()
    } catch (err) {
      toast.error('Falha ao cancelar tarefa')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ações em Andamento</h1>
          <p className="text-muted-foreground text-sm mt-1">Jobs e execuções do sistema</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => { fetchJobs(); fetchStats() }} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Atualizar
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries({ PENDING: stats.pending, RUNNING: stats.running, COMPLETED: stats.completed, FAILED: stats.failed, CANCELLED: stats.cancelled }).map(([key, val]) => {
            const cfg = statusCfg[key]
            return (
              <Card key={key}>
                <CardContent className="pt-3 pb-3 flex items-center gap-3">
                  <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', cfg.bg)}>
                    <cfg.icon className={cn('h-4 w-4', cfg.color)} />
                  </div>
                  <div><p className="text-xl font-bold">{val}</p><p className="text-[10px] text-muted-foreground">{cfg.label}</p></div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : jobs.length === 0 ? (
          <Card><CardContent className="py-12 text-center"><ListTodo className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" /><p className="text-muted-foreground text-sm">Nenhuma tarefa registrada</p></CardContent></Card>
        ) : jobs.map((job) => {
          const cfg = statusCfg[job.status] || statusCfg.PENDING
          const isExpanded = expandedJob === job.id
          return (
            <Card key={job.id} className={cn('cursor-pointer', isExpanded && 'ring-1 ring-primary/30')} onClick={() => setExpandedJob(isExpanded ? null : job.id)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
                    <cfg.icon className={cn('h-4 w-4', cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{job.description}</p>
                    <p className="text-xs text-muted-foreground">{job.type} · {job.steps.length} etapa{job.steps.length !== 1 ? 's' : ''}</p>
                  </div>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', cfg.bg, cfg.color)}>{cfg.label}</span>
                  {job.retries > 0 && <span className="text-[10px] text-muted-foreground">retry {job.retries}/{job.maxRetries}</span>}
                  <span className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  {['PENDING', 'RUNNING'].includes(job.status) && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleCancel(job.id) }}>
                      <Ban className="h-3 w-3" /> Cancelar
                    </Button>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border space-y-3">
                    {job.steps.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Etapas:</p>
                        {job.steps.map((step) => {
                          const sCfg = statusCfg[step.status] || statusCfg.PENDING
                          return (
                            <div key={step.id} className="flex items-center gap-2 text-xs pl-2">
                              <sCfg.icon className={cn('h-3 w-3', sCfg.color)} />
                              <span className="flex-1">{step.name}</span>
                              <span className={cn('font-medium', sCfg.color)}>{sCfg.label}</span>
                              {step.output && <span className="text-muted-foreground truncate max-w-[200px]">{step.output}</span>}
                              {step.error && <span className="text-error truncate max-w-[200px]">{step.error}</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {job.error && <div className="text-xs text-error bg-error/10 p-2 rounded">{job.error}</div>}
                    {job.output && <pre className="text-[11px] bg-muted/50 p-2 rounded overflow-x-auto">{JSON.stringify(job.output, null, 2)}</pre>}
                    <div className="text-[10px] text-muted-foreground">ID: {job.id}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Página {page} de {totalPages}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  )
}
