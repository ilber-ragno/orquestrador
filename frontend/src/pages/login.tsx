import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Bot, Loader2, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password, needsTotp ? totpCode : undefined)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error
      if (resp?.code === 'TOTP_REQUIRED') {
        setNeedsTotp(true)
        setError('')
      } else {
        setError(resp?.message || 'Falha ao fazer login')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Clawdbot</h1>
          <p className="text-sm text-muted-foreground mt-1">Painel de Orquestração</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {needsTotp ? (
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  Verificação em duas etapas
                </span>
              ) : 'Entrar'}
            </CardTitle>
            <CardDescription>
              {needsTotp
                ? 'Digite o código do seu app autenticador'
                : 'Faça login para acessar o painel'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {!needsTotp ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@clawd.local"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="totpCode">Código TOTP</Label>
                  <Input
                    id="totpCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : needsTotp ? 'Verificar' : 'Entrar'}
              </Button>

              {needsTotp && (
                <button
                  type="button"
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setNeedsTotp(false); setTotpCode(''); setError(''); }}
                >
                  Voltar ao login
                </button>
              )}
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Clawdbot Orchestrator v1.0
        </p>
      </div>
    </div>
  )
}
