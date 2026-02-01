import { useState, useRef } from 'react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  Send,
  StickyNote,
  Bot,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from 'lucide-react'

interface AttendantPanelProps {
  protocol: { id: string; mode: string; status: string }
  instanceId: string
  onMessageSent: () => void
  onModeChange: (mode: string) => void
}

const modeConfig: Record<string, { label: string; placeholder: string }> = {
  MODE_A: {
    label: 'Responder a IA',
    placeholder: 'Digite a resposta para a IA encaminhar ao cliente...',
  },
  MODE_B: {
    label: 'Enviar para cliente',
    placeholder: 'Digite a mensagem diretamente para o cliente...',
  },
}

export function AttendantPanel({
  protocol,
  instanceId,
  onMessageSent,
  onModeChange,
}: AttendantPanelProps) {
  const toast = useToast()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendingNote, setSendingNote] = useState(false)
  const [togglingMode, setTogglingMode] = useState(false)
  const [returningToAI, setReturningToAI] = useState(false)

  const isModeA = protocol.mode === 'MODE_A'
  const config = modeConfig[protocol.mode] || modeConfig.MODE_A

  const handleSend = async () => {
    const text = message.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await api.post(`/instances/${instanceId}/protocols/${protocol.id}/message`, {
        content: text,
      })
      setMessage('')
      textareaRef.current?.focus()
      onMessageSent()
    } catch {
      toast.error('Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  const handleNote = async () => {
    const text = message.trim()
    if (!text || sendingNote) return
    setSendingNote(true)
    try {
      await api.post(`/instances/${instanceId}/protocols/${protocol.id}/note`, {
        content: text,
      })
      setMessage('')
      textareaRef.current?.focus()
      toast.success('Nota interna adicionada')
      onMessageSent()
    } catch {
      toast.error('Erro ao adicionar nota interna')
    } finally {
      setSendingNote(false)
    }
  }

  const handleToggleMode = async () => {
    if (togglingMode) return
    const newMode = isModeA ? 'MODE_B' : 'MODE_A'
    setTogglingMode(true)
    try {
      await api.post(`/instances/${instanceId}/protocols/${protocol.id}/mode`, {
        mode: newMode,
      })
      onModeChange(newMode)
      toast.success(`Modo alterado para ${newMode === 'MODE_A' ? 'A (via IA)' : 'B (direto)'}`)
    } catch {
      toast.error('Erro ao alterar modo')
    } finally {
      setTogglingMode(false)
    }
  }

  const handleReturnToAI = async () => {
    if (returningToAI) return
    setReturningToAI(true)
    try {
      await api.post(`/instances/${instanceId}/protocols/${protocol.id}/mode`, {
        mode: 'AI_ONLY',
      })
      onModeChange('AI_ONLY')
      toast.success('Protocolo devolvido para a IA')
    } catch {
      toast.error('Erro ao devolver para a IA')
    } finally {
      setReturningToAI(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border bg-background px-4 py-3 space-y-2.5">
      {/* Mode toggle + Return to AI */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={handleToggleMode}
          disabled={togglingMode}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {togglingMode ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isModeA ? (
            <ToggleLeft className="h-4 w-4" />
          ) : (
            <ToggleRight className="h-4 w-4 text-primary" />
          )}
          <span>
            {isModeA ? 'Modo A (via IA)' : 'Modo B (direto)'}
          </span>
        </button>

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs text-muted-foreground"
          disabled={returningToAI}
          onClick={handleReturnToAI}
        >
          {returningToAI ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Bot className="h-3 w-3" />
          )}
          Devolver para IA
        </Button>
      </div>

      {/* Textarea + Actions */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={config.placeholder}
          rows={2}
          className={cn(
            'flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm',
            'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          )}
        />
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            className="gap-1.5 h-8"
            disabled={!message.trim() || sending}
            onClick={handleSend}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{config.label}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            disabled={!message.trim() || sendingNote}
            onClick={handleNote}
          >
            {sendingNote ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <StickyNote className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">Nota interna</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
