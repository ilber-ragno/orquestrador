import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import {
  Compass,
  Loader2,
  CheckCircle2,
  ArrowRight,
  RotateCw,
  Server,
  Globe,
  Brain,
  Radio,
  GitBranch,
  ShieldCheck,
  Play,
  AlertTriangle,
} from 'lucide-react'
import { FieldHelp } from '@/components/ui/help-tooltip'

interface StepData { id: number; name: string; key: string; status: string; evidence: string | null; completedAt: string | null; completedBy?: string }
interface SetupData { id: string; instanceId: string; currentStep: number; steps: StepData[]; completed: boolean; completedAt: string | null }
interface ModelItem {
  id: string
  name: string
  provider: string
  input: string
  context: string
  auth: boolean
}

const stepIcons = [Server, Globe, Brain, Radio, GitBranch, ShieldCheck]

export default function SetupPage() {
  const { selectedId } = useInstance()
  const toast = useToast()
  const [setup, setSetup] = useState<SetupData | null>(null)
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<{ valid: boolean; checks: { step: string; ok: boolean; message: string }[] } | null>(null)
  const [completing, setCompleting] = useState<number | null>(null)

  // Step 4: model selection
  const [availableModels, setAvailableModels] = useState<ModelItem[]>([])
  const [currentModel, setCurrentModel] = useState<string | null>(null)
  const [currentFallbacks, setCurrentFallbacks] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [selectedFallback, setSelectedFallback] = useState<string>('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsSynced, setModelsSynced] = useState(true)

  const fetchSetup = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try { const { data } = await api.get(`/instances/${selectedId}/setup`); setSetup(data) } catch (err) {
      toast.error('Falha ao carregar dados do setup')
    }
    finally { setLoading(false) }
  }, [selectedId, toast])

  useEffect(() => { fetchSetup() }, [fetchSetup])

  // Fetch providers/models when step 4 is current
  const fetchProviderModels = useCallback(async () => {
    if (!selectedId) return
    setLoadingModels(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/setup/providers-models`)
      setAvailableModels(data.models || [])
      setCurrentModel(data.currentModel || null)
      setCurrentFallbacks(data.currentFallbacks || [])
      setModelsSynced(data.synced !== false)
      if (data.currentModel) setSelectedModel(data.currentModel)
      else if (data.models?.length > 0) setSelectedModel(data.models[0].id)
      if (data.currentFallbacks?.length > 0) setSelectedFallback(data.currentFallbacks[0])
    } catch (err) {
      toast.error('Falha ao carregar modelos disponíveis')
    }
    finally { setLoadingModels(false) }
  }, [selectedId, toast])

  useEffect(() => {
    if (setup && setup.currentStep === 4 && !setup.completed) {
      fetchProviderModels()
    }
  }, [setup?.currentStep, setup?.completed, fetchProviderModels])

  const handleCompleteStep = async (stepIndex: number) => {
    if (!selectedId) return
    setCompleting(stepIndex)
    try {
      const body: Record<string, any> = {}
      // Step 4 (agent): send selected model + fallback
      if (stepIndex === 4 && selectedModel) {
        body.model = selectedModel
        body.fallbackModel = selectedFallback || ''
      }
      const { data } = await api.post(`/instances/${selectedId}/setup/step/${stepIndex}`, body)
      setSetup(data)
    } catch (err) {
      toast.error('Falha ao concluir passo do setup')
    }
    finally { setCompleting(null) }
  }

  const handleValidate = async () => {
    if (!selectedId) return
    setValidating(true)
    try { const { data } = await api.post(`/instances/${selectedId}/setup/validate`); setValidation(data) } catch (err) {
      toast.error('Falha ao validar configuração')
    }
    finally { setValidating(false) }
  }

  const handleReset = async () => {
    if (!selectedId) return
    if (!window.confirm('Tem certeza que deseja resetar o setup? Todo progresso será perdido.')) return
    try { const { data } = await api.post(`/instances/${selectedId}/setup/reset`); setSetup(data); setValidation(null) } catch (err) {
      toast.error('Falha ao resetar setup')
    }
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
            const isFailed = step.status === 'failed'
            const isCurrent = i === setup.currentStep && !setup.completed
            const stepKey = ['environment', 'gateway', 'providers', 'channels', 'agent', 'validation'][i]
            return (
              <Card key={step.id} className={cn(isCurrent && 'ring-1 ring-primary', isCompleted && 'opacity-80')}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center gap-4">
                    <div className={cn('h-10 w-10 rounded-full flex items-center justify-center shrink-0', isCompleted ? 'bg-success/10' : isCurrent ? 'bg-primary/10' : 'bg-muted')}>
                      {isCompleted ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Icon className={cn('h-5 w-5', isCurrent ? 'text-primary' : 'text-muted-foreground')} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">#{i + 1}</span>
                        <h3 className={cn('text-sm font-medium', isCompleted && 'line-through text-muted-foreground')}>{step.name}</h3>
                      </div>
                      {step.evidence && (
                        <p className={cn('text-xs mt-0.5', isFailed ? 'text-warning' : 'text-muted-foreground')}>{step.evidence}</p>
                      )}
                      {step.completedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">Feito em {new Date(step.completedAt).toLocaleString('pt-BR')}</p>
                      )}
                    </div>
                    {!isCompleted && (
                      <Button size="sm" className="gap-1 shrink-0" variant={isCurrent ? 'default' : 'outline'} onClick={() => handleCompleteStep(i)} disabled={completing === i || (stepKey === 'agent' && isCurrent && !selectedModel)}>
                        {completing === i ? <Loader2 className="h-3 w-3 animate-spin" /> : isCurrent ? <Play className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                        {isCurrent ? 'Concluir' : 'Marcar'}
                      </Button>
                    )}
                  </div>

                  {/* Step 4 (agent) expanded: model selection */}
                  {stepKey === 'agent' && isCurrent && (
                    <div className="mt-4 pt-3 border-t border-border space-y-4">
                      {loadingModels ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Carregando modelos disponíveis...
                        </div>
                      ) : availableModels.length === 0 ? (
                        <p className="text-xs text-warning">Nenhum provedor de IA configurado. Volte à etapa "Provedores de IA" e cadastre pelo menos um provider com API key.</p>
                      ) : (() => {
                        const grouped: Record<string, ModelItem[]> = {}
                        for (const m of availableModels) {
                          if (!grouped[m.provider]) grouped[m.provider] = []
                          grouped[m.provider].push(m)
                        }
                        const providers = Object.keys(grouped).sort()
                        return (
                          <div className="space-y-4">
                            {!modelsSynced && (
                              <div className="flex items-start gap-2 p-2.5 rounded-md bg-warning/10 border border-warning/20">
                                <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                                <p className="text-xs text-warning">Modelos listados com base nos providers cadastrados. Complete a etapa "Provedores de IA" para sincronizar com o assistente.</p>
                              </div>
                            )}
                            {/* Primary model */}
                            <div>
                              <label className="text-xs font-medium text-foreground flex items-center gap-0 mb-1.5">
                                Modelo Principal <span className="text-destructive ml-0.5">*</span>
                                <FieldHelp field="setup.primaryModel" />
                              </label>
                              <p className="text-[11px] text-muted-foreground mb-2">IA que responderá as mensagens</p>
                              <select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="w-full h-9 px-3 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                <option value="">Selecione um modelo...</option>
                                {providers.map(provider => (
                                  <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                                    {grouped[provider].map(m => (
                                      <option key={m.id} value={m.id}>
                                        {m.id}{m.id === currentModel ? ' (atual)' : ''}{m.context ? ` — ${m.context} ctx` : ''}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>

                            {/* Fallback model */}
                            <div>
                              <label className="text-xs font-medium text-foreground flex items-center gap-0 mb-1.5">
                                Modelo Reserva <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
                                <FieldHelp field="setup.fallbackModel" />
                              </label>
                              <p className="text-[11px] text-muted-foreground mb-2">Usado automaticamente se o modelo principal falhar</p>
                              <select
                                value={selectedFallback}
                                onChange={(e) => setSelectedFallback(e.target.value)}
                                className="w-full h-9 px-3 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                <option value="">Nenhum (sem fallback)</option>
                                {providers.map(provider => (
                                  <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                                    {grouped[provider]
                                      .filter(m => m.id !== selectedModel)
                                      .map(m => (
                                        <option key={m.id} value={m.id}>
                                          {m.id}{currentFallbacks.includes(m.id) ? ' (atual)' : ''}{m.context ? ` — ${m.context} ctx` : ''}
                                        </option>
                                      ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>

                            {selectedModel && selectedFallback && selectedModel === selectedFallback && (
                              <p className="text-xs text-destructive">O modelo fallback deve ser diferente do principal.</p>
                            )}
                          </div>
                        )
                      })()}
                    </div>
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
