import { useState, useEffect, useCallback } from 'react'
import { useInstance } from '@/context/instance-context'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  Plus,
  Save,
  Trash2,
  History,
  Lock,
  Unlock,
  Loader2,
  ChevronDown,
  ChevronRight,
  User,
  Clock,
} from 'lucide-react'

interface ConfigItem {
  id: string
  key: string
  value: string
  encrypted: boolean
  version: number
  updatedAt: string
}

interface HistoryItem {
  id: string
  key: string
  previousValue: string | null
  newValue: string | null
  changedBy: { name: string; email: string }
  createdAt: string
}

export default function SettingsPage() {
  const { selectedId } = useInstance()
  const toast = useToast()
  const [configs, setConfigs] = useState<ConfigItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newEncrypted, setNewEncrypted] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchConfigs = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/config`)
      setConfigs(data)
      setEditValues({})
    } catch {
      toast.error('Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }, [selectedId, toast])

  const fetchHistory = useCallback(async () => {
    if (!selectedId) return
    setHistoryLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/config/history?limit=50`)
      setHistory(data.data)
    } catch {
      toast.error('Erro ao carregar histórico de configurações')
    } finally {
      setHistoryLoading(false)
    }
  }, [selectedId, toast])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  const handleAddConfig = async () => {
    if (!selectedId || !newKey.trim() || !newValue.trim()) return
    setSaving(true)
    try {
      await api.put(`/instances/${selectedId}/config`, {
        configs: [{ key: newKey.trim(), value: newValue.trim(), encrypted: newEncrypted }],
      })
      setNewKey('')
      setNewValue('')
      setNewEncrypted(false)
      toast.success('Configuração adicionada com sucesso')
      await fetchConfigs()
    } catch {
      toast.error('Erro ao adicionar configuração')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateConfig = async (key: string, encrypted: boolean) => {
    if (!selectedId || !editValues[key]) return
    setSaving(true)
    try {
      await api.put(`/instances/${selectedId}/config`, {
        configs: [{ key, value: editValues[key], encrypted }],
      })
      setEditValues((prev) => { const n = { ...prev }; delete n[key]; return n })
      toast.success('Configuração atualizada com sucesso')
      await fetchConfigs()
    } catch {
      toast.error('Erro ao atualizar configuração')
    } finally {
      setSaving(false)
    }
  }

  const groupedConfigs = configs.reduce<Record<string, ConfigItem[]>>((acc, cfg) => {
    const group = cfg.key.split('.')[0] || 'geral'
    if (!acc[group]) acc[group] = []
    acc[group].push(cfg)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground text-sm mt-1">Ajustes do Clawdbot selecionado</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory() }}
        >
          <History className="h-3 w-3" />
          {showHistory ? 'Ocultar' : 'Histórico'}
        </Button>
      </div>

      {/* Add new config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Nova Configuração
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="newKey" className="text-xs text-muted-foreground">Chave</Label>
              <Input
                id="newKey"
                placeholder="gateway.mode"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="newValue" className="text-xs text-muted-foreground">Valor</Label>
              <Input
                id="newValue"
                placeholder="local"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setNewEncrypted(!newEncrypted)}
                title={newEncrypted ? 'Encriptar: SIM' : 'Encriptar: NÃO'}
              >
                {newEncrypted ? <Lock className="h-4 w-4 text-warning" /> : <Unlock className="h-4 w-4 text-muted-foreground" />}
              </Button>
              <Button onClick={handleAddConfig} disabled={saving || !newKey.trim() || !newValue.trim()} className="gap-2">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Salvar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Config list grouped */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : Object.keys(groupedConfigs).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nenhuma configuração definida. Adicione uma acima.
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedConfigs).map(([group, items]) => (
          <ConfigGroup key={group} group={group} items={items} editValues={editValues} setEditValues={setEditValues} onSave={handleUpdateConfig} saving={saving} />
        ))
      )}

      {/* History panel */}
      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico de Alterações
            </CardTitle>
            <CardDescription>Últimas 50 alterações</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="border border-border rounded-md p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{h.key}</span>
                      <span className="text-muted-foreground flex items-center gap-1 text-xs ml-auto">
                        <User className="h-3 w-3" /> {h.changedBy.name}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" /> {new Date(h.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-error">{h.previousValue ? `- ${h.previousValue}` : '(novo)'}</span>
                      <span className="text-success">+ {h.newValue}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ConfigGroup({
  group,
  items,
  editValues,
  setEditValues,
  onSave,
  saving,
}: {
  group: string
  items: ConfigItem[]
  editValues: Record<string, string>
  setEditValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onSave: (key: string, encrypted: boolean) => void
  saving: boolean
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="text-base flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {group}
          <span className="text-xs text-muted-foreground font-normal">({items.length})</span>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent>
          <div className="space-y-2">
            {items.map((cfg) => (
              <div key={cfg.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {cfg.encrypted && <Lock className="h-3 w-3 text-warning shrink-0" />}
                  <span className="font-mono text-xs truncate">{cfg.key}</span>
                </div>
                <Input
                  className="max-w-xs text-xs h-7"
                  defaultValue={cfg.value}
                  onChange={(e) => setEditValues((prev) => ({ ...prev, [cfg.key]: e.target.value }))}
                  placeholder={cfg.encrypted ? '****' : 'valor'}
                />
                <span className="text-[10px] text-muted-foreground shrink-0">v{cfg.version}</span>
                {editValues[cfg.key] && (
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onSave(cfg.key, cfg.encrypted)} disabled={saving}>
                    <Save className="h-3 w-3" /> Salvar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
