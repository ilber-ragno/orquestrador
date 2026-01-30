import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Star,
  StarOff,
  Pencil,
  Link2,
  Brain,
  Globe,
  Key,
  X,
  Activity,
  Clock,
  Shield,
} from 'lucide-react'

// --- Types ---

interface Provider {
  id: string
  instanceId: string
  type: 'OPENAI' | 'ANTHROPIC' | 'OPENROUTER' | 'CUSTOM'
  name: string
  apiKey: string
  baseUrl: string | null
  model: string | null
  isActive: boolean
  isDefault: boolean
  priority: number
  lastTestAt: string | null
  lastTestOk: boolean | null
  createdAt: string
  updatedAt: string
}

interface Integration {
  id: string
  instanceId: string
  name: string
  baseUrl: string
  authType: string
  authCredentials: string | null
  scopes: string[] | null
  rateLimitReqs: number | null
  rateLimitWindow: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface TestResult {
  success: boolean
  latency: number
  error?: string
  model?: string
}

const providerTypeConfig = {
  OPENAI: { label: 'OpenAI', color: 'text-green-400', bg: 'bg-green-400/10', icon: Brain },
  ANTHROPIC: { label: 'Anthropic', color: 'text-orange-400', bg: 'bg-orange-400/10', icon: Brain },
  OPENROUTER: { label: 'OpenRouter', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: Globe },
  CUSTOM: { label: 'Custom', color: 'text-purple-400', bg: 'bg-purple-400/10', icon: Link2 },
}

const authTypeLabels: Record<string, string> = {
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  api_key: 'API Key',
  none: 'Sem Auth',
}

// --- Main Component ---

export default function ConnectionsPage() {
  const { selectedId } = useInstance()
  const [tab, setTab] = useState<'providers' | 'integrations'>('providers')

  if (!selectedId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Selecione um Clawdbot para gerenciar conexões
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inteligência e APIs</h1>
        <p className="text-muted-foreground text-sm mt-1">Provedores de IA e integrações externas</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setTab('providers')}
          className={cn(
            'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
            tab === 'providers' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Brain className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          Provedores de IA
        </button>
        <button
          onClick={() => setTab('integrations')}
          className={cn(
            'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
            tab === 'integrations' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Link2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          Integrações Externas
        </button>
      </div>

      {tab === 'providers' ? <ProvidersPanel instanceId={selectedId} /> : <IntegrationsPanel instanceId={selectedId} />}
    </div>
  )
}

// --- Providers Panel ---

function ProvidersPanel({ instanceId }: { instanceId: string }) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult | 'loading'>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchProviders = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/instances/${instanceId}/providers`)
      setProviders(data)
    } catch (err) {
      console.error('Failed to load providers', err)
    } finally {
      setLoading(false)
    }
  }, [instanceId])

  useEffect(() => { fetchProviders() }, [fetchProviders])

  const handleTest = async (provider: Provider) => {
    setTestResults((prev) => ({ ...prev, [provider.id]: 'loading' }))
    try {
      const { data } = await api.post(`/instances/${instanceId}/providers/${provider.id}/test`)
      setTestResults((prev) => ({ ...prev, [provider.id]: data }))
    } catch {
      setTestResults((prev) => ({ ...prev, [provider.id]: { success: false, latency: 0, error: 'Erro na requisição' } }))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/instances/${instanceId}/providers/${id}`)
      setProviders((prev) => prev.filter((p) => p.id !== id))
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Failed to delete provider', err)
    }
  }

  const handleSaved = () => {
    setShowForm(false)
    setEditingProvider(null)
    fetchProviders()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {providers.length} provedor{providers.length !== 1 ? 'es' : ''} de IA configurado{providers.length !== 1 ? 's' : ''}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={fetchProviders} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Atualizar
          </Button>
          <Button size="sm" className="gap-2" onClick={() => { setEditingProvider(null); setShowForm(true) }}>
            <Plus className="h-3 w-3" /> Novo Provedor
          </Button>
        </div>
      </div>

      {/* Form modal */}
      {(showForm || editingProvider) && (
        <ProviderForm
          instanceId={instanceId}
          provider={editingProvider}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditingProvider(null) }}
        />
      )}

      {/* Provider list */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : providers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">Nenhum provedor de IA configurado</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Adicione um provedor para começar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {providers.map((prov) => {
            const cfg = providerTypeConfig[prov.type]
            const testResult = testResults[prov.id]
            return (
              <Card key={prov.id} className={cn(prov.isDefault && 'ring-1 ring-primary/50')}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-4">
                    <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
                      <cfg.icon className={cn('h-5 w-5', cfg.color)} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm truncate">{prov.name}</h3>
                        {prov.isDefault && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                            <Star className="h-2.5 w-2.5" /> Padrão
                          </span>
                        )}
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', cfg.bg, cfg.color)}>
                          {cfg.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Key className="h-3 w-3" /> {prov.apiKey}
                        </span>
                        {prov.model && (
                          <span className="flex items-center gap-1">
                            <Brain className="h-3 w-3" /> {prov.model}
                          </span>
                        )}
                        {prov.baseUrl && (
                          <span className="flex items-center gap-1 truncate max-w-[200px]">
                            <Globe className="h-3 w-3" /> {prov.baseUrl}
                          </span>
                        )}
                      </div>

                      {/* Test result */}
                      {testResult && testResult !== 'loading' && (
                        <div className={cn('mt-2 text-xs flex items-center gap-1.5 px-2 py-1 rounded-md w-fit', testResult.success ? 'bg-success/10 text-success' : 'bg-error/10 text-error')}>
                          {testResult.success ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {testResult.success ? `Conectado (${testResult.latency}ms)` : testResult.error}
                          {testResult.model && <span className="text-muted-foreground ml-1">- {testResult.model}</span>}
                        </div>
                      )}

                      {/* Last test info */}
                      {prov.lastTestAt && !testResult && (
                        <div className={cn('mt-2 text-xs flex items-center gap-1', prov.lastTestOk ? 'text-success/70' : 'text-error/70')}>
                          <Clock className="h-3 w-3" />
                          Último teste: {new Date(prov.lastTestAt).toLocaleString('pt-BR')}
                          {prov.lastTestOk ? ' - OK' : ' - Falhou'}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Testar conectividade"
                        onClick={() => handleTest(prov)}
                        disabled={testResult === 'loading'}
                      >
                        {testResult === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3 text-warning" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Editar"
                        onClick={() => { setEditingProvider(prov); setShowForm(false) }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {deleteConfirm === prov.id ? (
                        <div className="flex items-center gap-1">
                          <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => handleDelete(prov.id)}>
                            Confirmar
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDeleteConfirm(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Excluir" onClick={() => setDeleteConfirm(prov.id)}>
                          <Trash2 className="h-3 w-3 text-error" />
                        </Button>
                      )}
                    </div>
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

// --- Provider Form ---

function ProviderForm({
  instanceId,
  provider,
  onSaved,
  onCancel,
}: {
  instanceId: string
  provider: Provider | null
  onSaved: () => void
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    type: provider?.type || 'ANTHROPIC' as Provider['type'],
    name: provider?.name || '',
    apiKey: '',
    baseUrl: provider?.baseUrl || '',
    model: provider?.model || '',
    isDefault: provider?.isDefault || false,
    priority: provider?.priority || 0,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        type: form.type,
        name: form.name,
        isDefault: form.isDefault,
        priority: form.priority,
      }
      if (form.apiKey) payload.apiKey = form.apiKey
      if (form.baseUrl) payload.baseUrl = form.baseUrl
      if (form.model) payload.model = form.model

      if (provider) {
        await api.put(`/instances/${instanceId}/providers/${provider.id}`, payload)
      } else {
        if (!form.apiKey) {
          setError('API Key é obrigatória')
          setSaving(false)
          return
        }
        payload.apiKey = form.apiKey
        await api.post(`/instances/${instanceId}/providers`, payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      setError(msg || 'Erro ao salvar provedor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{provider ? 'Editar Provedor' : 'Novo Provedor'}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as Provider['type'] })}
              >
                <option value="ANTHROPIC">Anthropic</option>
                <option value="OPENAI">OpenAI</option>
                <option value="OPENROUTER">OpenRouter</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input className="mt-1" placeholder="Claude Principal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">API Key {provider && <span className="text-muted-foreground/50">(deixe vazio para manter)</span>}</Label>
              <Input className="mt-1" type="password" placeholder="sk-..." value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required={!provider} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Modelo (opcional)</Label>
              <Input className="mt-1" placeholder="claude-sonnet-4-20250514" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Base URL (opcional)</Label>
              <Input className="mt-1" placeholder="https://api.anthropic.com" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Prioridade</Label>
              <Input className="mt-1" type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="rounded border-input"
            />
            <Label htmlFor="isDefault" className="text-sm cursor-pointer">Definir como provedor padrão</Label>
          </div>

          {error && (
            <div className="text-sm text-error flex items-center gap-1.5 bg-error/10 px-3 py-2 rounded-md">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" size="sm" className="gap-2" disabled={saving}>
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {provider ? 'Salvar Alterações' : 'Criar Provedor'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// --- Integrations Panel ---

function IntegrationsPanel({ instanceId }: { instanceId: string }) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchIntegrations = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/instances/${instanceId}/integrations`)
      setIntegrations(data)
    } catch (err) {
      console.error('Failed to load integrations', err)
    } finally {
      setLoading(false)
    }
  }, [instanceId])

  useEffect(() => { fetchIntegrations() }, [fetchIntegrations])

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/instances/${instanceId}/integrations/${id}`)
      setIntegrations((prev) => prev.filter((i) => i.id !== id))
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Failed to delete integration', err)
    }
  }

  const handleSaved = () => {
    setShowForm(false)
    fetchIntegrations()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {integrations.length} integração{integrations.length !== 1 ? 'ões' : ''} configurada{integrations.length !== 1 ? 's' : ''}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={fetchIntegrations} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Atualizar
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-3 w-3" /> Nova Integração
          </Button>
        </div>
      </div>

      {showForm && (
        <IntegrationForm instanceId={instanceId} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : integrations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Link2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">Nenhuma integração configurada</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Conecte serviços externos para expandir funcionalidades</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {integrations.map((integ) => (
            <Card key={integ.id}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-blue-400/10 flex items-center justify-center shrink-0">
                    <Link2 className="h-5 w-5 text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm truncate">{integ.name}</h3>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                        {authTypeLabels[integ.authType] || integ.authType}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 truncate">
                        <Globe className="h-3 w-3 shrink-0" /> {integ.baseUrl}
                      </span>
                      {integ.authCredentials && (
                        <span className="flex items-center gap-1">
                          <Shield className="h-3 w-3" /> {integ.authCredentials}
                        </span>
                      )}
                      {integ.rateLimitReqs && (
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" /> {integ.rateLimitReqs} req/{integ.rateLimitWindow}s
                        </span>
                      )}
                    </div>
                    {integ.scopes && Array.isArray(integ.scopes) && integ.scopes.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {integ.scopes.map((s) => (
                          <span key={s} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {deleteConfirm === integ.id ? (
                      <div className="flex items-center gap-1">
                        <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => handleDelete(integ.id)}>
                          Confirmar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDeleteConfirm(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Excluir" onClick={() => setDeleteConfirm(integ.id)}>
                        <Trash2 className="h-3 w-3 text-error" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Integration Form ---

function IntegrationForm({
  instanceId,
  onSaved,
  onCancel,
}: {
  instanceId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    baseUrl: '',
    authType: 'bearer',
    authCredentials: '',
    rateLimitReqs: '',
    rateLimitWindow: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        baseUrl: form.baseUrl,
        authType: form.authType,
      }
      if (form.authCredentials) payload.authCredentials = form.authCredentials
      if (form.rateLimitReqs) payload.rateLimitReqs = parseInt(form.rateLimitReqs)
      if (form.rateLimitWindow) payload.rateLimitWindow = parseInt(form.rateLimitWindow)

      await api.post(`/instances/${instanceId}/integrations`, payload)
      onSaved()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      setError(msg || 'Erro ao criar integração')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Nova Integração</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input className="mt-1" placeholder="WASender API" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Base URL</Label>
              <Input className="mt-1" placeholder="https://api.example.com" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} required />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tipo de Auth</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.authType}
                onChange={(e) => setForm({ ...form, authType: e.target.value })}
              >
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="api_key">API Key</option>
                <option value="none">Sem Auth</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Credenciais</Label>
              <Input className="mt-1" type="password" placeholder="Token ou credenciais" value={form.authCredentials} onChange={(e) => setForm({ ...form, authCredentials: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Rate Limit (req)</Label>
              <Input className="mt-1" type="number" placeholder="100" value={form.rateLimitReqs} onChange={(e) => setForm({ ...form, rateLimitReqs: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Rate Limit (janela em seg)</Label>
              <Input className="mt-1" type="number" placeholder="60" value={form.rateLimitWindow} onChange={(e) => setForm({ ...form, rateLimitWindow: e.target.value })} />
            </div>
          </div>

          {error && (
            <div className="text-sm text-error flex items-center gap-1.5 bg-error/10 px-3 py-2 rounded-md">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" size="sm" className="gap-2" disabled={saving}>
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Criar Integração
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
