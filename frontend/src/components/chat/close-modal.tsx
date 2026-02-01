import { useState } from 'react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Loader2, X } from 'lucide-react'

interface CloseModalProps {
  open: boolean
  onClose: () => void
  protocol: { id: string; number: string }
  instanceId: string
  onClosed: () => void
}

const reasonOptions = [
  { value: 'resolved', label: 'Resolvido' },
  { value: 'transferred', label: 'Transferido' },
  { value: 'no_response', label: 'Sem resposta' },
  { value: 'spam', label: 'Spam' },
  { value: 'duplicate', label: 'Duplicado' },
  { value: 'other', label: 'Outro' },
]

export function CloseModal({
  open,
  onClose,
  protocol,
  instanceId,
  onClosed,
}: CloseModalProps) {
  const toast = useToast()
  const [reason, setReason] = useState('resolved')
  const [result, setResult] = useState('')
  const [sendSurvey, setSendSurvey] = useState(false)
  const [closing, setClosing] = useState(false)

  const handleSubmit = async () => {
    if (!result.trim()) {
      toast.warning('Informe o resultado do atendimento')
      return
    }
    if (closing) return
    setClosing(true)
    try {
      await api.post(`/instances/${instanceId}/protocols/${protocol.id}/close`, {
        reason,
        result: result.trim(),
        sendSurvey,
      })
      toast.success('Protocolo encerrado com sucesso')
      onClosed()
      onClose()
    } catch {
      toast.error('Erro ao encerrar protocolo')
    } finally {
      setClosing(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-lg shadow-lg w-full max-w-md mx-4 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold">Encerrar protocolo</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Protocol number */}
          <p className="text-sm text-muted-foreground">
            Protocolo: <span className="font-mono font-medium text-foreground">{protocol.number}</span>
          </p>

          {/* Reason select */}
          <div className="space-y-2">
            <Label>Motivo do encerramento</Label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm',
                'shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              )}
            >
              {reasonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Result textarea */}
          <div className="space-y-2">
            <Label>Resultado do atendimento *</Label>
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="Descreva o resultado do atendimento..."
              rows={3}
              className={cn(
                'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              )}
            />
          </div>

          {/* Survey checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sendSurvey}
              onChange={(e) => setSendSurvey(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span className="text-sm">Enviar pesquisa de satisfacao ao cliente</span>
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={closing}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={closing || !result.trim()}
              onClick={handleSubmit}
              className="gap-1.5"
            >
              {closing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Encerrar protocolo
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
