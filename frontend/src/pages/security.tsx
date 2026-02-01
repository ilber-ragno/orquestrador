import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { FieldHelp } from '@/components/ui/help-tooltip'
import {
  ShieldCheck,
  Users,
  Loader2,
  RefreshCw,
  Plus,
  Lock,
  Unlock,
  Key,
  Smartphone,
  X,
  AlertCircle,
  CheckCircle2,
  UserCog,
  Pencil,
  Trash2,
  Eye,
} from 'lucide-react'

interface UserItem { id: string; email: string; name: string; role: string; isActive: boolean; twoFactorEnabled: boolean; lastLoginAt: string | null; failedAttempts: number; lockedUntil: string | null; createdAt: string }
interface SessionItem { id: string; ipAddress: string | null; userAgent: string | null; createdAt: string; expiresAt: string }

const roleBadge: Record<string, string> = {
  ADMIN: 'bg-purple-400/10 text-purple-400',
  OPERATOR: 'bg-blue-400/10 text-blue-400',
  AUDITOR: 'bg-orange-400/10 text-orange-400',
  CLIENT: 'bg-muted text-muted-foreground',
}

export default function SecurityPage() {
  const [tab, setTab] = useState<'users' | 'mfa' | 'sessions' | 'password' | 'audit'>('users')
  const [auditResult, setAuditResult] = useState<string | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [fixLoading, setFixLoading] = useState(false)
  const toast = useToast()

  const runAudit = async (fix = false) => {
    fix ? setFixLoading(true) : setAuditLoading(true)
    try {
      const endpoint = fix ? 'openclaw-fix' : 'openclaw-audit'
      const { data } = await api.post(`/security/${endpoint}`)
      setAuditResult(data.output || data.message || 'Concluído')
      if (fix) toast.success('Correções aplicadas')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao executar auditoria')
    } finally {
      setAuditLoading(false)
      setFixLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usuários e Acesso</h1>
        <p className="text-muted-foreground text-sm mt-1">Usuários, permissões e autenticação</p>
      </div>
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit flex-wrap">
        {[{ k: 'users', l: 'Usuários', i: Users }, { k: 'mfa', l: '2FA', i: Smartphone }, { k: 'sessions', l: 'Sessões', i: Eye }, { k: 'password', l: 'Senha', i: Key }, { k: 'audit', l: 'Auditoria OpenClaw', i: ShieldCheck }].map(({ k, l, i: Icon }) => (
          <button key={k} onClick={() => setTab(k as any)} className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors', tab === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />{l}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersPanel />}
      {tab === 'mfa' && <MfaPanel />}
      {tab === 'sessions' && <SessionsPanel />}
      {tab === 'password' && <PasswordPanel />}
      {tab === 'audit' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Auditoria de Segurança OpenClaw</CardTitle>
              <CardDescription>Executa verificação profunda de segurança na instância selecionada via <code>openclaw security audit</code></CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button size="sm" className="gap-2" onClick={() => runAudit(false)} disabled={auditLoading || fixLoading}>
                  {auditLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  Executar Auditoria
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => runAudit(true)} disabled={auditLoading || fixLoading}>
                  {fixLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Corrigir Automaticamente
                </Button>
              </div>
              {auditResult && (
                <div className="bg-muted rounded-md p-4 max-h-96 overflow-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">{auditResult}</pre>
                </div>
              )}
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-medium mb-2">Checklist de Resposta a Incidentes</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-warning" /> Revogar tokens comprometidos imediatamente</li>
                  <li className="flex items-start gap-2"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-warning" /> Rotacionar API keys de providers afetados</li>
                  <li className="flex items-start gap-2"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-warning" /> Verificar logs de auditoria para atividade suspeita</li>
                  <li className="flex items-start gap-2"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-warning" /> Desconectar canais comprometidos</li>
                  <li className="flex items-start gap-2"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-warning" /> Rotacionar gateway token e senha</li>
                  <li className="flex items-start gap-2"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-warning" /> Revisar elevated access e allowlists</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function UsersPanel() {
  const toast = useToast()
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'CLIENT' })
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try { const { data } = await api.get('/security/users'); setUsers(data) }
    catch (err) { toast.error('Falha ao carregar usuários') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetch() }, [fetch])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api.post('/security/users', form)
      toast.success('Usuário criado com sucesso')
      setShowForm(false)
      setForm({ email: '', name: '', password: '', role: 'CLIENT' })
      fetch()
    }
    catch (err: any) { setError(err.response?.data?.error?.message || 'Erro') }
    finally { setSaving(false) }
  }

  const handleUnlock = async (id: string) => {
    try {
      await api.post(`/security/users/${id}/unlock`)
      toast.success('Usuário desbloqueado com sucesso')
      fetch()
    }
    catch (err) { toast.error('Falha ao desbloquear usuário') }
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await api.put(`/security/users/${id}`, { isActive: !isActive })
      toast.success(`Usuário ${!isActive ? 'ativado' : 'desativado'} com sucesso`)
      fetch()
    }
    catch (err) { toast.error('Falha ao alterar status do usuário') }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{users.length} usuários</p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-2" onClick={fetch} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Atualizar
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-3 w-3" /> Novo Usuário
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label className="text-xs">Email</Label><Input className="mt-1" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
                <div><Label className="text-xs">Nome</Label><Input className="mt-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                <div><Label className="text-xs">Senha</Label><Input className="mt-1" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required placeholder="Min 8 chars, Aa1" /></div>
                <div><Label className="text-xs flex items-center gap-1.5">Role <FieldHelp field="security.users.role" /></Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="CLIENT">Cliente</option><option value="OPERATOR">Operador</option><option value="AUDITOR">Auditor</option><option value="ADMIN">Admin</option>
                </select></div>
              </div>
              {error && <div className="text-sm text-error bg-error/10 px-3 py-2 rounded-md flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> {error}</div>}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" size="sm" disabled={saving}>{saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Criar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
        <div className="space-y-2">
          {users.map(u => (
            <Card key={u.id}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className={cn('h-9 w-9 rounded-full flex items-center justify-center', u.isActive ? 'bg-success/10' : 'bg-muted')}>
                  <UserCog className={cn('h-4 w-4', u.isActive ? 'text-success' : 'text-muted-foreground')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{u.name}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1', roleBadge[u.role] || roleBadge.CLIENT)}>{u.role} <FieldHelp field="security.users.role" /></span>
                    {u.twoFactorEnabled && <span title="2FA ativo" className="flex items-center gap-1"><Smartphone className="h-3 w-3 text-success" /> <FieldHelp field="security.users.twoFactor" /></span>}
                    {!u.isActive && <span className="text-[10px] text-error bg-error/10 px-1.5 py-0.5 rounded-full">Inativo</span>}
                    {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <span title="Conta bloqueada"><Lock className="h-3 w-3 text-error" /></span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.email} · {u.lastLoginAt ? `Último login: ${new Date(u.lastLoginAt).toLocaleDateString('pt-BR')}` : 'Nunca logou'}</p>
                </div>
                <div className="flex gap-1">
                  {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleUnlock(u.id)}><Unlock className="h-3 w-3" /> Desbloquear</Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleToggle(u.id, u.isActive)}>{u.isActive ? 'Desativar' : 'Ativar'}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function MfaPanel() {
  const toast = useToast()
  const [setupData, setSetupData] = useState<{ secret: string; otpauth: string } | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSetup = async () => {
    setLoading(true)
    try { const { data } = await api.post('/security/2fa/setup'); setSetupData(data) }
    catch (err) { toast.error('Falha ao configurar 2FA') }
    finally { setLoading(false) }
  }

  const handleVerify = async () => {
    setLoading(true); setMessage('')
    try {
      const { data } = await api.post('/security/2fa/verify', { code })
      toast.success('2FA ativado com sucesso')
      setMessage(data.message)
      setSetupData(null)
      setCode('')
    }
    catch (err: any) { setMessage(err.response?.data?.error?.message || 'Erro') }
    finally { setLoading(false) }
  }

  const handleDisable = async () => {
    if (!code || code.length !== 6) {
      toast.error('Informe um código TOTP válido de 6 dígitos')
      return
    }
    setLoading(true); setMessage('')
    try {
      const { data } = await api.post('/security/2fa/disable', { code })
      toast.success('2FA desabilitado com sucesso')
      setMessage(data.message)
      setCode('')
    }
    catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || 'Falha ao desabilitar 2FA'
      toast.error(errorMsg)
      setMessage(errorMsg)
    }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" /> Autenticação em Duas Etapas (2FA) <FieldHelp field="security.users.twoFactor" /></CardTitle>
          <CardDescription>Configure TOTP via app autenticador (Google Authenticator, Authy, etc)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!setupData ? (
            <Button onClick={handleSetup} disabled={loading} className="gap-2">{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />} Configurar 2FA</Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">Adicione esta chave ao seu app autenticador:</p>
              <div className="bg-muted p-3 rounded-md font-mono text-sm break-all">{setupData.secret}</div>
              <p className="text-xs text-muted-foreground">Ou use o URI: {setupData.otpauth}</p>
              <div className="flex gap-2">
                <Input placeholder="Código de 6 dígitos" value={code} onChange={e => setCode(e.target.value)} className="max-w-[200px]" />
                <Button onClick={handleVerify} disabled={loading || code.length !== 6}>{loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Verificar e Ativar</Button>
              </div>
            </div>
          )}
          <div className="pt-3 border-t border-border">
            <p className="text-sm text-muted-foreground mb-2">Para desabilitar, insira o código TOTP:</p>
            <div className="flex gap-2">
              <Input placeholder="Código TOTP" value={code} onChange={e => setCode(e.target.value)} className="max-w-[200px]" />
              <Button variant="destructive" size="sm" onClick={handleDisable} disabled={loading}>Desabilitar 2FA</Button>
            </div>
          </div>
          {message && <div className="text-sm px-3 py-2 rounded-md bg-muted">{message}</div>}
        </CardContent>
      </Card>
    </div>
  )
}

function SessionsPanel() {
  const toast = useToast()
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try { const { data } = await api.get('/security/sessions'); setSessions(data) }
    catch (err) { toast.error('Falha ao carregar sessões') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetch() }, [fetch])

  const handleRevoke = async (id: string) => {
    try {
      await api.delete(`/security/sessions/${id}`)
      toast.success('Sessão revogada com sucesso')
      fetch()
    }
    catch (err) { toast.error('Falha ao revogar sessão') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{sessions.length} sessões ativas</p>
        <Button variant="outline" size="sm" onClick={fetch} disabled={loading}><RefreshCw className="h-3 w-3 mr-1" /> Atualizar</Button>
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
        <div className="space-y-2">
          {sessions.map(s => (
            <Card key={s.id}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono">{s.ipAddress || 'IP desconhecido'}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.userAgent || 'User agent desconhecido'}</p>
                  <p className="text-xs text-muted-foreground">Criada: {new Date(s.createdAt).toLocaleString('pt-BR')} · Expira: {new Date(s.expiresAt).toLocaleString('pt-BR')}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-error gap-1" onClick={() => handleRevoke(s.id)}><Trash2 className="h-3 w-3" /> Revogar</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function PasswordPanel() {
  const toast = useToast()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setMessage(''); setIsError(false)
    if (form.newPassword !== form.confirmPassword) { setMessage('Senhas não coincidem'); setIsError(true); return }
    setSaving(true)
    try {
      const { data } = await api.post('/security/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword })
      toast.success('Senha alterada com sucesso')
      setMessage(data.message)
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || 'Falha ao alterar senha'
      toast.error(errorMsg)
      setMessage(errorMsg)
      setIsError(true)
    }
    finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" /> Alterar Senha</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <div><Label className="text-xs">Senha Atual</Label><Input className="mt-1" type="password" value={form.currentPassword} onChange={e => setForm({ ...form, currentPassword: e.target.value })} required /></div>
          <div><Label className="text-xs">Nova Senha</Label><Input className="mt-1" type="password" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} required placeholder="Min 8 chars, Aa1" /></div>
          <div><Label className="text-xs">Confirmar Nova Senha</Label><Input className="mt-1" type="password" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} required /></div>
          {message && <div className={cn('text-sm px-3 py-2 rounded-md', isError ? 'bg-error/10 text-error' : 'bg-success/10 text-success')}>{message}</div>}
          <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Alterar Senha</Button>
        </form>
      </CardContent>
    </Card>
  )
}
