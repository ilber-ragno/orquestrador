import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Compass,
  Loader2,
  CheckCircle2,
  Circle,
  ArrowRight,
  RotateCw,
  Server,
  Globe,
  Brain,
  MessageSquare,
  GitBranch,
  ShieldCheck,
  Play,
  AlertTriangle,
} from 'lucide-react'

interface StepData { id: number; name: string; key: string; status: string; evidence: string | null; completedAt: string | null; completedBy?: string }
interface SetupData { id: string; instanceId: string; currentStep: number; steps: StepData[]; completed: boolean; completedAt: string | null }

const stepIcons = [Server, Globe, Brain, MessageSquare, GitBranch, ShieldCheck]

export default function SetupPage() {
  const { selectedId } = useInstance()
  const [setup, setSetup] = useState<SetupData | null>(null)
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<{ valid: boolean; checks: { step: string; ok: boolean; message: string }[] } | null>(null)
  const [completing, setCompleting] = useState<number | null>(null)

  const fetchSetup = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try { const { data } = await api.get(`/instances/${selectedId}/setup`); setSetup(data) } catch {}
    finally { setLoading(false) }
  }, [selectedId])

  useEffect(() => { fetchSetup() }, [fetchSetup])

  const handleCompleteStep = async (stepIndex: number) => {
    if (!selectedId) return
    setCompleting(stepIndex)
    try {
      const { data } = await api.post(`/instances/${selectedId}/setup/step/${stepIndex}`, { evidence: `Completed via panel at ${new Date().toISOString()}` })
      setSetup(data)
    } catch {}
    finally { setCompleting(null) }
  }

  const handleValidate = async () => {
    if (!selectedId) return
    setValidating(true)
    try { const { data } = await api.post(`/instances/${selectedId}/setup/validate`); setValidation(data) } catch {}
    finally { setValidating(false) }
  }

  const handleReset = async () => {
    if (!selectedId) return
    try { const { data } = await api.post(`/instances/${selectedId}/setup/reset`); setSetup(data); setValidation(null) } catch {}
  }

  if (!selectedId) return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Selecione uma instância</div>

  const completedCount = setup?.steps.filter(s => s.status === 'completed').length || 0
  const totalSteps = setup?.steps.length || 6
  const progressPercent = Math.round((completedCount / totalSteps) * 100)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assistente de Configuração</h1>
          <p className="text-muted-foreground text-sm mt-1">Siga os passos para configurar sua instância</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleValidate} disabled={validating}>
            {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Validar
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
            <RotateCw className="h-3 w-3" /> Resetar
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{setup?.completed ? 'Tudo configurado!' : `${completedCount}/${totalSteps} passos concluídos`}</span>
            <span className="text-sm text-muted-foreground">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', setup?.completed ? 'bg-success' : 'bg-primary')} style={{ width: `${progressPercent}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Validation result */}
      {validation && (
        <Card className={cn('border-l-4', validation.valid ? 'border-l-success' : 'border-l-warning')}>
          <CardContent className="pt-4 pb-4 space-y-2">
            <p className={cn('text-sm font-medium', validation.valid ? 'text-success' : 'text-warning')}>
              {validation.valid ? 'Todas as validações passaram!' : 'Algumas configurações estão pendentes'}
            </p>
            {validation.checks.map((c) => (
              <div key={c.step} className="flex items-center gap-2 text-xs">
                {c.ok ? <CheckCircle2 className="h-3 w-3 text-success" /> : <AlertTriangle className="h-3 w-3 text-warning" />}
                <span className={c.ok ? 'text-foreground' : 'text-warning'}>{c.message}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Steps */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : setup ? (
        <div className="space-y-3">
          {setup.steps.map((step, i) => {
            const Icon = stepIcons[i] || Compass
            const isCompleted = step.status === 'completed'
            const isCurrent = i === setup.currentStep && !setup.completed
            return (
              <Card key={step.id} className={cn(isCurrent && 'ring-1 ring-primary', isCompleted && 'opacity-80')}>
                <CardContent className="py-4 px-5 flex items-center gap-4">
                  <div className={cn('h-10 w-10 rounded-full flex items-center justify-center shrink-0', isCompleted ? 'bg-success/10' : isCurrent ? 'bg-primary/10' : 'bg-muted')}>
                    {isCompleted ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Icon className={cn('h-5 w-5', isCurrent ? 'text-primary' : 'text-muted-foreground')} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">#{i + 1}</span>
                      <h3 className={cn('text-sm font-medium', isCompleted && 'line-through text-muted-foreground')}>{step.name}</h3>
                    </div>
                    {step.completedAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">Feito em {new Date(step.completedAt).toLocaleString('pt-BR')}</p>
                    )}
                  </div>
                  {!isCompleted && (
                    <Button size="sm" className="gap-1" variant={isCurrent ? 'default' : 'outline'} onClick={() => handleCompleteStep(i)} disabled={completing === i}>
                      {completing === i ? <Loader2 className="h-3 w-3 animate-spin" /> : isCurrent ? <Play className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                      {isCurrent ? 'Concluir' : 'Marcar'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
