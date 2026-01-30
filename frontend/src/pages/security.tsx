import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
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
  const [tab, setTab] = useState<'users' | 'mfa' | 'sessions' | 'password'>('users')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Segurança</h1>
        <p className="text-muted-foreground text-sm mt-1">Usuários, permissões e autenticação</p>
      </div>
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit flex-wrap">
        {[{ k: 'users', l: 'Usuários', i: Users }, { k: 'mfa', l: '2FA', i: Smartphone }, { k: 'sessions', l: 'Sessões', i: Eye }, { k: 'password', l: 'Senha', i: Key }].map(({ k, l, i: Icon }) => (
          <button key={k} onClick={() => setTab(k as any)} className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors', tab === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />{l}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersPanel />}
      {tab === 'mfa' && <MfaPanel />}
      {tab === 'sessions' && <SessionsPanel />}
      {tab === 'password' && <PasswordPanel />}
    </div>
  )
}

function UsersPanel() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'CLIENT' })
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try { const { data } = await api.get('/security/users'); setUsers(data) } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try { await api.post('/security/users', form); setShowForm(false); setForm({ email: '', name: '', password: '', role: 'CLIENT' }); fetch() }
    catch (err: any) { setError(err.response?.data?.error?.message || 'Erro') }
    finally { setSaving(false) }
  }

  const handleUnlock = async (id: string) => {
    try { await api.post(`/security/users/${id}/unlock`); fetch() } catch {}
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    try { await api.put(`/security/users/${id}`, { isActive: !isActive }); fetch() } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.length} usuários</p>
        <div className="flex gap-2">
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
                <div><Label className="text-xs">Role</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
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
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', roleBadge[u.role] || roleBadge.CLIENT)}>{u.role}</span>
                    {u.twoFactorEnabled && <span title="2FA ativo"><Smartphone className="h-3 w-3 text-success" /></span>}
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
  const [setupData, setSetupData] = useState<{ secret: string; otpauth: string } | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSetup = async () => {
    setLoading(true)
    try { const { data } = await api.post('/security/2fa/setup'); setSetupData(data) } catch {}
    finally { setLoading(false) }
  }

  const handleVerify = async () => {
    setLoading(true); setMessage('')
    try { const { data } = await api.post('/security/2fa/verify', { code }); setMessage(data.message); setSetupData(null); setCode('') }
    catch (err: any) { setMessage(err.response?.data?.error?.message || 'Erro') }
    finally { setLoading(false) }
  }

  const handleDisable = async () => {
    setLoading(true); setMessage('')
    try { const { data } = await api.post('/security/2fa/disable', { code }); setMessage(data.message) }
    catch (err: any) { setMessage(err.response?.data?.error?.message || 'Erro') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" /> Autenticação em Duas Etapas (2FA)</CardTitle>
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
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try { const { data } = await api.get('/security/sessions'); setSessions(data) } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const handleRevoke = async (id: string) => {
    try { await api.delete(`/security/sessions/${id}`); fetch() } catch {}
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
      setMessage(data.message); setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) { setMessage(err.response?.data?.error?.message || 'Erro'); setIsError(true) }
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
