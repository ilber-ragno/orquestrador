import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Shield, UserCheck, AlertTriangle } from 'lucide-react'

interface ProtocolBarProps {
  protocol: {
    id: string
    number: string
    status: string
    mode: string
    contactName?: string
    assignedUser?: { id: string; name: string } | null
    escalationReason?: string
  }
  currentUserId: string
  currentUserRole: string
  onAssign: () => void
  onClose: () => void
}

const statusLabels: Record<string, string> = {
  ACTIVE: 'Ativo',
  ESCALATED: 'Escalado',
  ASSIGNED: 'Atribuido',
  IN_PROGRESS: 'Em atendimento',
  PENDING_CLOSURE: 'Encerrando',
  CLOSED: 'Encerrado',
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  ESCALATED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  ASSIGNED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PENDING_CLOSURE: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
  CLOSED: 'bg-gray-100 text-gray-500 dark:bg-gray-800/30 dark:text-gray-500',
}

const modeLabels: Record<string, string> = {
  AI_ONLY: 'IA',
  MODE_A: 'Modo A (via IA)',
  MODE_B: 'Modo B (direto)',
}

const modeIcons: Record<string, string> = {
  AI_ONLY: '\u{1F916}',
  MODE_A: '\u{1F4AC}',
  MODE_B: '\u{1F464}',
}

export function ProtocolBar({
  protocol,
  currentUserId,
  currentUserRole,
  onAssign,
  onClose,
}: ProtocolBarProps) {
  const isEscalated = protocol.status === 'ESCALATED'
  const isInProgress = protocol.status === 'IN_PROGRESS'
  const isAssigned = protocol.status === 'ASSIGNED'
  const isClosed = protocol.status === 'CLOSED'
  const canAssign = isEscalated && (currentUserRole === 'ADMIN' || currentUserRole === 'OPERATOR')
  const canClose = (isInProgress || isAssigned) && protocol.assignedUser?.id === currentUserId

  return (
    <div
      className={cn(
        'px-4 py-2 border-b border-border flex flex-wrap items-center gap-3 text-sm',
        isEscalated && 'bg-yellow-50 dark:bg-yellow-950/20'
      )}
    >
      {/* Protocolo */}
      <div className="flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-xs font-medium">{protocol.number}</span>
      </div>

      {/* Status badge */}
      <span
        className={cn(
          'text-[10px] font-medium px-2 py-0.5 rounded-full',
          statusColors[protocol.status] || 'bg-gray-100 text-gray-500'
        )}
      >
        {statusLabels[protocol.status] || protocol.status}
      </span>

      {/* Mode */}
      <span className="text-xs text-muted-foreground">
        {modeIcons[protocol.mode] || ''} {modeLabels[protocol.mode] || protocol.mode}
      </span>

      {/* Assigned user */}
      {protocol.assignedUser && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <UserCheck className="h-3 w-3" />
          <span>{protocol.assignedUser.name}</span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      {canAssign && (
        <Button size="sm" variant="default" className="gap-1.5 h-7 text-xs" onClick={onAssign}>
          <UserCheck className="h-3 w-3" />
          Assumir
        </Button>
      )}

      {canClose && !isClosed && (
        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={onClose}>
          Encerrar
        </Button>
      )}

      {/* Escalation reason */}
      {isEscalated && protocol.escalationReason && (
        <div className="w-full flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{protocol.escalationReason}</span>
        </div>
      )}
    </div>
  )
}
