import { useState, useEffect } from 'react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import {
  AlertTriangle,
  UserCheck,
  Loader2,
  X,
} from 'lucide-react'

interface AssignModalProps {
  open: boolean
  onClose: () => void
  protocol: {
    id: string
    number: string
    escalationReason?: string
    contactName?: string
  }
  instanceId: string
  currentUserId: string
  onAssigned: () => void
}

interface UserOption {
  id: string
  name: string
  email: string
  role: string
}

export function AssignModal({
  open,
  onClose,
  protocol,
  instanceId,
  currentUserId,
  onAssigned,
}: AssignModalProps) {
  const toast = useToast()
  const [users, setUsers] = useState<UserOption[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState(currentUserId)
  const [selectedMode, setSelectedMode] = useState('MODE_A')
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelectedUserId(currentUserId)
    setSelectedMode('MODE_A')
    fetchUsers()
  }, [open])

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const { data } = await api.get('/security/users')
      const list: UserOption[] = (data.users || data || [])
        .filter((u: any) => u.role === 'ADMIN' || u.role === 'OPERATOR')
        .filter((u: any) => u.active !== false)
        .map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        }))
      setUsers(list)
    } catch {
      toast.error('Erro ao carregar operadores')
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleAssign = async (userId?: string) => {
    const targetUserId = userId || selectedUserId
    if (!targetUserId || assigning) return
    setAssigning(true)
    try {
      await api.post(`/instances/${instanceId}/protocols/${protocol.id}/assign`, {
        userId: targetUserId,
        mode: selectedMode,
      })
      toast.success('Protocolo atribuido com sucesso')
      onAssigned()
      onClose()
    } catch {
      toast.error('Erro ao atribuir protocolo')
    } finally {
      setAssigning(false)
    }
  }

  const handleSelfAssign = () => {
    handleAssign(currentUserId)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-lg shadow-lg w-full max-w-md mx-4 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold">Assumir protocolo</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Protocol info */}
          <div className="text-sm space-y-1">
            <p className="text-muted-foreground">
              Protocolo: <span className="font-mono font-medium text-foreground">{protocol.number}</span>
            </p>
            {protocol.contactName && (
              <p className="text-muted-foreground">
                Contato: <span className="text-foreground">{protocol.contactName}</span>
              </p>
            )}
          </div>

          {/* Escalation reason */}
          {protocol.escalationReason && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800/30">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">Motivo da escalacao</p>
                <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-0.5">
                  {protocol.escalationReason}
                </p>
              </div>
            </div>
          )}

          {/* Self-assign button */}
          <Button
            className="w-full gap-2"
            disabled={assigning}
            onClick={handleSelfAssign}
          >
            {assigning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4" />
            )}
            Assumir eu mesmo
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-muted-foreground">ou atribuir a outro operador</span>
            </div>
          </div>

          {/* Operator select */}
          <div className="space-y-2">
            <Label>Operador</Label>
            {loadingUsers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando operadores...
              </div>
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm',
                  'shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                )}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === 'ADMIN' ? 'Admin' : 'Operador'})
                    {u.id === currentUserId ? ' - Eu' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Mode select */}
          <div className="space-y-2">
            <Label>Modo de atendimento</Label>
            <select
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm',
                'shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              )}
            >
              <option value="MODE_A">Modo A - Responder via IA</option>
              <option value="MODE_B">Modo B - Direto ao cliente</option>
            </select>
          </div>

          {/* Assign to selected */}
          <Button
            variant="outline"
            className="w-full"
            disabled={assigning || !selectedUserId || selectedUserId === currentUserId}
            onClick={() => handleAssign()}
          >
            {assigning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Atribuir ao operador selecionado'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
