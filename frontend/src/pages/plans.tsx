import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  CreditCard,
  Plus,
  Loader2,
  RefreshCw,
  X,
  AlertCircle,
  CheckCircle2,
  Zap,
  MessageSquare,
  Users,
  Coins,
  Hash,
  Link2,
  Shield,
  Pencil,
  Trash2,
} from 'lucide-react'

interface Plan { id: string; name: string; description: string | null; maxMessages: number | null; maxSessions: number | null; maxTokens: number | null; maxCostCents: number | null; maxChannels: number | null; maxProviders: number | null; blockOnExceed: boolean; fallbackAction: string; isActive: boolean; _count?: { usages: number } }
interface UsageData { plan: Plan | null; usage: any; limits: Record<string, { used: number; max: number | null; percent: number | null }> | null }

export default function PlansPage() {
  const { selectedId } = useInstance()
  const [plans, setPlans] = useState<Plan[]>([])
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    try { const { data } = await api.get('/plans'); setPlans(data) } catch {}
    finally { setLoading(false) }
  }, [])

  const fetchUsage = useCallback(async () => {
    if (!selectedId) return
    try { const { data } = await api.get(`/plans/usage/${selectedId}`); setUsage(data) } catch {}
  }, [selectedId])

  useEffect(() => { fetchPlans(); fetchUsage() }, [fetchPlans, fetchUsage])

  const handleAssign = async (planId: string) => {
    if (!selectedId) return
    try { await api.post(`/plans/${planId}/assign/${selectedId}`); fetchUsage() } catch {}
  }

  const handleDelete = async (id: string) => {
    try { await api.delete(`/plans/${id}`); fetchPlans() } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planos e Limites</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de planos comerciais e consumo por instância</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={fetchPlans} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Atualizar
          </Button>
          <Button size="sm" className="gap-2" onClick={() => { setEditingPlan(null); setShowForm(true) }}>
            <Plus className="h-3 w-3" /> Novo Plano
          </Button>
        </div>
      </div>

      {/* Usage for current instance */}
      {usage?.limits && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Consumo da Instância</CardTitle>
            <CardDescription>Plano: {usage.plan?.name || 'Nenhum'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Object.entries(usage.limits).map(([key, val]) => {
                const icons: Record<string, typeof MessageSquare> = { messages: MessageSquare, sessions: Users, tokens: Hash, cost: Coins }
                const labels: Record<string, string> = { messages: 'Mensagens', sessions: 'Sessões', tokens: 'Tokens', cost: 'Custo (R$)' }
                const Icon = icons[key] || Zap
                const displayUsed = key === 'cost' ? (val.used / 100).toFixed(2) : val.used.toLocaleString()
                const displayMax = val.max ? (key === 'cost' ? (val.max / 100).toFixed(2) : val.max.toLocaleString()) : '∞'
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="h-3 w-3" /> {labels[key] || key}
                    </div>
                    <div className="text-sm font-medium">{displayUsed} / {displayMax}</div>
                    {val.percent !== null && (
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', val.percent > 90 ? 'bg-error' : val.percent > 70 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, val.percent)}%` }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      {showForm && (
        <PlanForm plan={editingPlan} onSaved={() => { setShowForm(false); setEditingPlan(null); fetchPlans() }} onCancel={() => { setShowForm(false); setEditingPlan(null) }} />
      )}

      {/* Plans list */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const isAssigned = usage?.plan?.id === plan.id
            return (
              <Card key={plan.id} className={cn(isAssigned && 'ring-1 ring-primary')}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    {plan.name}
                    {isAssigned && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Ativo</span>}
                  </CardTitle>
                  {plan.description && <CardDescription>{plan.description}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1"><MessageSquare className="h-3 w-3 text-muted-foreground" /> Msg: {plan.maxMessages?.toLocaleString() || '∞'}</div>
                    <div className="flex items-center gap-1"><Users className="h-3 w-3 text-muted-foreground" /> Sessões: {plan.maxSessions || '∞'}</div>
                    <div className="flex items-center gap-1"><Hash className="h-3 w-3 text-muted-foreground" /> Tokens: {plan.maxTokens?.toLocaleString() || '∞'}</div>
                    <div className="flex items-center gap-1"><Coins className="h-3 w-3 text-muted-foreground" /> Custo: {plan.maxCostCents ? `R$${(plan.maxCostCents / 100).toFixed(0)}` : '∞'}</div>
                    <div className="flex items-center gap-1"><Link2 className="h-3 w-3 text-muted-foreground" /> Canais: {plan.maxChannels || '∞'}</div>
                    <div className="flex items-center gap-1"><Shield className="h-3 w-3 text-muted-foreground" /> Exceder: {plan.blockOnExceed ? 'Bloqueia' : plan.fallbackAction}</div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-border">
                    {!isAssigned && (
                      <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => handleAssign(plan.id)}>
                        <CheckCircle2 className="h-3 w-3" /> Atribuir
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={() => { setEditingPlan(plan); setShowForm(true) }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs gap-1 text-error" onClick={() => handleDelete(plan.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
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

function PlanForm({ plan, onSaved, onCancel }: { plan: Plan | null; onSaved: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [f, setF] = useState({
    name: plan?.name || '', description: plan?.description || '',
    maxMessages: plan?.maxMessages?.toString() || '', maxSessions: plan?.maxSessions?.toString() || '',
    maxTokens: plan?.maxTokens?.toString() || '', maxCostCents: plan?.maxCostCents?.toString() || '',
    maxChannels: plan?.maxChannels?.toString() || '', maxProviders: plan?.maxProviders?.toString() || '',
    blockOnExceed: plan?.blockOnExceed ?? true, fallbackAction: plan?.fallbackAction || 'block',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const payload: any = {
        name: f.name, description: f.description || null,
        maxMessages: f.maxMessages ? parseInt(f.maxMessages) : null,
        maxSessions: f.maxSessions ? parseInt(f.maxSessions) : null,
        maxTokens: f.maxTokens ? parseInt(f.maxTokens) : null,
        maxCostCents: f.maxCostCents ? parseInt(f.maxCostCents) : null,
        maxChannels: f.maxChannels ? parseInt(f.maxChannels) : null,
        maxProviders: f.maxProviders ? parseInt(f.maxProviders) : null,
        blockOnExceed: f.blockOnExceed, fallbackAction: f.fallbackAction,
      }
      if (plan) await api.put(`/plans/${plan.id}`, payload)
      else await api.post('/plans', payload)
      onSaved()
    } catch (err: any) { setError(err.response?.data?.error?.message || 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between"><span>{plan ? 'Editar' : 'Novo'} Plano</span><Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}><X className="h-4 w-4" /></Button></CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label className="text-xs text-muted-foreground">Nome</Label><Input className="mt-1" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></div>
            <div><Label className="text-xs text-muted-foreground">Descrição</Label><Input className="mt-1" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
            <div><Label className="text-xs text-muted-foreground">Max Mensagens</Label><Input className="mt-1" type="number" value={f.maxMessages} onChange={e => setF({ ...f, maxMessages: e.target.value })} placeholder="∞" /></div>
            <div><Label className="text-xs text-muted-foreground">Max Sessões</Label><Input className="mt-1" type="number" value={f.maxSessions} onChange={e => setF({ ...f, maxSessions: e.target.value })} placeholder="∞" /></div>
            <div><Label className="text-xs text-muted-foreground">Max Tokens</Label><Input className="mt-1" type="number" value={f.maxTokens} onChange={e => setF({ ...f, maxTokens: e.target.value })} placeholder="∞" /></div>
            <div><Label className="text-xs text-muted-foreground">Max Custo (centavos)</Label><Input className="mt-1" type="number" value={f.maxCostCents} onChange={e => setF({ ...f, maxCostCents: e.target.value })} placeholder="∞" /></div>
            <div><Label className="text-xs text-muted-foreground">Max Canais</Label><Input className="mt-1" type="number" value={f.maxChannels} onChange={e => setF({ ...f, maxChannels: e.target.value })} placeholder="∞" /></div>
            <div>
              <Label className="text-xs text-muted-foreground">Ação ao exceder</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={f.fallbackAction} onChange={e => setF({ ...f, fallbackAction: e.target.value })}>
                <option value="block">Bloquear</option>
                <option value="throttle">Limitar velocidade</option>
                <option value="notify">Apenas notificar</option>
              </select>
            </div>
          </div>
          {error && <div className="text-sm text-error flex items-center gap-1.5 bg-error/10 px-3 py-2 rounded-md"><AlertCircle className="h-3.5 w-3.5" /> {error}</div>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" size="sm" className="gap-2" disabled={saving}>{saving && <Loader2 className="h-3 w-3 animate-spin" />}{plan ? 'Salvar' : 'Criar'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
