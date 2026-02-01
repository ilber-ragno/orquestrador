import { useState, useEffect, useCallback, useRef } from 'react'
import { useInstance } from '@/context/instance-context'
import { useAuth } from '@/context/auth-context'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  MessageSquare,
  Loader2,
  ArrowLeft,
  RefreshCw,
  User,
  Bot,
  MessagesSquare,
  Mic,
  Image,
  FileText,
  Film,
  Sticker,
  Play,
  Pause,
  Lock,
  StickyNote,
  UserCheck,
  ShieldAlert,
  Check,
  X,
} from 'lucide-react'
import { ProtocolBar } from '@/components/chat/protocol-bar'
import { AttendantPanel } from '@/components/chat/attendant-panel'
import { AssignModal } from '@/components/chat/assign-modal'
import { CloseModal } from '@/components/chat/close-modal'
import { useProtocolStream } from '@/hooks/use-protocol-stream'

interface SessionEntry {
  key: string
  sessionId: string
  updatedAt: number
  chatType: string
  lastChannel: string
  origin?: { label?: string; from?: string; provider?: string; surface?: string; chatType?: string }
  deliveryContext?: { channel?: string; to?: string; accountId?: string }
}

interface ContactProfile {
  displayName: string | null
  profilePicUrl: string | null
  phone: string | null
}

interface ChatMessage {
  type: string
  id: string
  timestamp: string
  role?: string
  content?: any
  mediaType?: string
  mediaPath?: string
  mediaDuration?: string
  transcript?: string
}

const channelIcons: Record<string, string> = {
  whatsapp: '📱',
  telegram: '✈️',
  discord: '🎮',
  slack: '💬',
  webchat: '🌐',
  cli: '⌨️',
}

function getChannelIcon(channel: string) {
  return channelIcons[channel?.toLowerCase()] || '💬'
}

function getContactId(session: SessionEntry): string {
  return session.origin?.from || session.deliveryContext?.to || session.key.split(':').pop() || ''
}

function getContactLabel(session: SessionEntry, contacts?: Record<string, ContactProfile>): string {
  const contactId = getContactId(session)
  // Priority: cached displayName > origin.label > from > key
  const cached = contacts?.[contactId]
  if (cached?.displayName) return cached.displayName
  if (session.origin?.label) return session.origin.label
  if (session.origin?.from) return formatPhone(session.origin.from)
  if (session.deliveryContext?.to) return formatPhone(session.deliveryContext.to)
  return session.key.split(':').pop() || 'Desconhecido'
}

function formatPhone(phone: string): string {
  // Format Brazilian phones: +5511987654321 → +55 11 98765-4321
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`
  }
  if (cleaned.length === 12 && cleaned.startsWith('55')) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`
  }
  return phone
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function getMessageText(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n')
  }
  return ''
}

function cleanUserText(text: string): string {
  // User messages from WhatsApp: "System: ...\n\n[WhatsApp ...] [openclaw] actual message"
  const match = text.match(/\[openclaw\]\s*(.+?)(?:\n\[message_id:.*\])?$/s)
  if (match) return match[1].trim()
  // Remove queued wrapper
  const queuedMatch = text.match(/Queued #\d+\n\[WhatsApp[^\]]*\]\s*\[openclaw\]\s*(.+?)(?:\n\[message_id:.*\])?$/s)
  if (queuedMatch) return queuedMatch[1].trim()
  return text
}

function cleanAssistantText(text: string): string {
  // Remove MEDIA: lines already handled by mediaType
  let cleaned = text.replace(/^MEDIA:.+$/gm, '').trim()
  // Remove duration+MEDIA lines
  cleaned = cleaned.replace(/^\d{2}:\d{2}\s*\n?MEDIA:.+$/gm, '').trim()
  return cleaned
}

const mediaIcons: Record<string, typeof Mic> = {
  audio: Mic,
  image: Image,
  video: Film,
  document: FileText,
  sticker: Sticker,
}

function formatTime(ts: string | number): string {
  const d = new Date(typeof ts === 'number' ? ts : ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 86400000 * 7) {
    return d.toLocaleDateString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function AudioPlayer({ msg, isUser, instanceId }: { msg: ChatMessage; isUser: boolean; instanceId: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(msg.mediaDuration || '')
  const [error, setError] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const audioUrl = blobUrl

  // Fetch audio as blob via authenticated API
  const loadAudio = useCallback(async () => {
    if (!msg.mediaPath || blobUrl || loading) return
    setLoading(true)
    try {
      const resp = await api.get(`/instances/${instanceId}/chat/audio`, {
        params: { path: msg.mediaPath },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(resp.data)
      setBlobUrl(url)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [instanceId, msg.mediaPath, blobUrl, loading])

  const togglePlay = async () => {
    if (error) return
    if (!blobUrl) {
      await loadAudio()
      // Audio will start playing once blobUrl is set and element loads
      return
    }
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(() => setError(true))
    }
  }

  // Auto-play when blob loads for the first time
  useEffect(() => {
    if (blobUrl && audioRef.current && !playing) {
      audioRef.current.play().catch(() => setError(true))
    }
  }, [blobUrl])

  const formatDur = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-1.5">
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setProgress(0) }}
          onTimeUpdate={() => {
            if (audioRef.current && audioRef.current.duration) {
              setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100)
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current && audioRef.current.duration && isFinite(audioRef.current.duration)) {
              setDuration(formatDur(audioRef.current.duration))
            }
          }}
          onError={() => setError(true)}
        />
      )}
      <div className={cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-lg min-w-[200px]',
        isUser ? 'bg-primary-foreground/10' : 'bg-background/60'
      )}>
        <button
          onClick={togglePlay}
          disabled={error || loading}
          className={cn(
            'h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors',
            isUser ? 'bg-primary-foreground/20 hover:bg-primary-foreground/30' : 'bg-primary/10 hover:bg-primary/20',
            (error) && 'opacity-40 cursor-not-allowed'
          )}
        >
          {loading
            ? <Loader2 className={cn('h-4 w-4 animate-spin', isUser ? 'text-primary-foreground' : 'text-primary')} />
            : playing
              ? <Pause className={cn('h-4 w-4', isUser ? 'text-primary-foreground' : 'text-primary')} />
              : <Play className={cn('h-4 w-4 ml-0.5', isUser ? 'text-primary-foreground' : 'text-primary')} />
          }
        </button>
        <div className="flex-1 min-w-0">
          <div
            className="h-1.5 flex-1 rounded-full bg-current opacity-20 cursor-pointer relative"
            onClick={(e) => {
              if (!audioRef.current || !audioRef.current.duration) return
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              audioRef.current.currentTime = pct * audioRef.current.duration
            }}
          >
            <div
              className="h-full rounded-full bg-current opacity-70 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className={cn(
              'text-[10px]',
              isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
            )}>
              {error ? 'Indisponível' : 'Mensagem de voz'}
            </span>
            {duration && (
              <span className={cn(
                'text-[10px] font-mono',
                isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
              )}>
                {duration}
              </span>
            )}
          </div>
        </div>
      </div>
      {msg.transcript && (
        <p className={cn(
          'text-xs italic px-1',
          isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
        )}>
          {msg.transcript}
        </p>
      )}
    </div>
  )
}

function MediaBubble({ msg, isUser, instanceId }: { msg: ChatMessage; isUser: boolean; instanceId: string }) {
  const MediaIcon = mediaIcons[msg.mediaType || ''] || FileText

  if (msg.mediaType === 'audio') {
    return <AudioPlayer msg={msg} isUser={isUser} instanceId={instanceId} />
  }

  if (msg.mediaType === 'image') {
    return (
      <div className="space-y-1">
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          isUser ? 'bg-primary-foreground/10' : 'bg-background/60'
        )}>
          <Image className={cn('h-5 w-5', isUser ? 'text-primary-foreground/70' : 'text-muted-foreground')} />
          <span className={cn('text-xs', isUser ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
            Imagem
          </span>
        </div>
      </div>
    )
  }

  // Generic media placeholder (video, document, sticker)
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-lg',
      isUser ? 'bg-primary-foreground/10' : 'bg-background/60'
    )}>
      <MediaIcon className={cn('h-5 w-5', isUser ? 'text-primary-foreground/70' : 'text-muted-foreground')} />
      <span className={cn('text-xs capitalize', isUser ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
        {msg.mediaType === 'document' ? 'Documento' :
         msg.mediaType === 'video' ? 'Vídeo' :
         msg.mediaType === 'sticker' ? 'Figurinha' :
         msg.mediaType}
      </span>
    </div>
  )
}

function ContactAvatar({ picUrl, label, isGroup, channel, size = 9 }: { picUrl: string | null; label: string; isGroup?: boolean; channel?: string; size?: number }) {
  const [imgError, setImgError] = useState(false)
  const sizeClass = size === 7 ? 'h-7 w-7' : 'h-9 w-9'
  const textSize = size === 7 ? 'text-[10px]' : 'text-xs'

  if (picUrl && !imgError) {
    return (
      <img
        src={picUrl}
        alt={label}
        className={cn(sizeClass, 'rounded-full object-cover shrink-0')}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className={cn(
      sizeClass,
      'rounded-full flex items-center justify-center shrink-0 font-semibold',
      textSize,
      isGroup ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-primary/10 text-primary'
    )}>
      {isGroup ? getChannelIcon(channel || '') : getInitials(label)}
    </div>
  )
}

interface ProtocolData {
  id: string
  number: string
  status: string
  mode: string
  contactName?: string
  contactId?: string
  escalationReason?: string
  assignedTo?: string
  assignedUser?: { id: string; name: string } | null
  messages?: ProtocolMessageEntry[]
}

interface ProtocolMessageEntry {
  id: string
  type: string // INTERNAL | DIRECT | NOTE | SYSTEM
  content: string
  userId?: string
  user?: { name: string }
  createdAt: string
}

export default function ChatPage() {
  const { selectedId } = useInstance()
  const { user } = useAuth()
  const toast = useToast()
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SessionEntry | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [contacts, setContacts] = useState<Record<string, ContactProfile>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Protocol state
  const [protocol, setProtocol] = useState<ProtocolData | null>(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [protocolCounts, setProtocolCounts] = useState<{ escalated: number; mine: number }>({ escalated: 0, mine: 0 })

  // Inline approval state
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const fetchPendingApprovals = useCallback(async () => {
    if (!selectedId) return
    try {
      const { data } = await api.get(`/instances/${selectedId}/approvals/pending`)
      setPendingApprovals(data.items || [])
    } catch { /* silent */ }
  }, [selectedId])

  useEffect(() => {
    fetchPendingApprovals()
    const iv = setInterval(fetchPendingApprovals, 10_000)
    return () => clearInterval(iv)
  }, [fetchPendingApprovals])

  const handleInlineApprove = async (id: string, permanent: boolean) => {
    setApprovingId(id)
    try {
      await api.put(`/instances/${selectedId}/approvals/${id}/approve`, { permanent })
      toast.success('Acesso liberado')
      fetchPendingApprovals()
    } catch { toast.error('Erro ao liberar') }
    finally { setApprovingId(null) }
  }

  const handleInlineDeny = async (id: string) => {
    setApprovingId(id)
    try {
      await api.put(`/instances/${selectedId}/approvals/${id}/deny`, {})
      toast.success('Acesso negado')
      fetchPendingApprovals()
    } catch { toast.error('Erro ao negar') }
    finally { setApprovingId(null) }
  }

  // Fetch protocol for selected session
  const fetchProtocol = useCallback(async (sessionId: string) => {
    if (!selectedId) return
    try {
      const { data } = await api.get(`/instances/${selectedId}/protocols`, {
        params: { sessionId, limit: 1 },
      })
      const protocols = data.protocols || data.data || []
      if (protocols.length > 0) {
        const p = protocols[0]
        setProtocol({
          id: p.id,
          number: p.number,
          status: p.status,
          mode: p.mode,
          contactName: p.contactName,
          contactId: p.contactId,
          escalationReason: p.escalationReason,
          assignedTo: p.assignedTo,
          assignedUser: p.assignedUser || (p.assignee ? { id: p.assignee.id, name: p.assignee.name } : null),
          messages: p.protocolMessages || [],
        })
      } else {
        setProtocol(null)
      }
    } catch {
      setProtocol(null)
    }
  }, [selectedId])

  // Fetch protocol message timeline (internal messages)
  const fetchProtocolMessages = useCallback(async () => {
    if (!selectedId || !protocol?.id) return
    try {
      const { data } = await api.get(`/instances/${selectedId}/protocols/${protocol.id}/timeline`)
      // Extract only internal messages (from ProtocolMessage table)
      const internalMsgs = (data.timeline || data.messages || [])
        .filter((m: any) => m.source === 'internal' || m.type === 'INTERNAL' || m.type === 'DIRECT' || m.type === 'NOTE' || m.type === 'SYSTEM')
      setProtocol(prev => prev ? { ...prev, messages: internalMsgs } : null)
    } catch {
      // silent
    }
  }, [selectedId, protocol?.id])

  // Fetch protocol counts for sidebar badges
  const fetchProtocolCounts = useCallback(async () => {
    if (!selectedId) return
    try {
      const { data } = await api.get(`/instances/${selectedId}/protocols/counts`)
      setProtocolCounts({
        escalated: data.escalated || 0,
        mine: data.mine || 0,
      })
    } catch {
      // silent
    }
  }, [selectedId])

  // Refresh protocol data after actions
  const refreshProtocol = useCallback(() => {
    if (selectedSession) {
      fetchProtocol(selectedSession.sessionId)
    }
    fetchProtocolCounts()
  }, [selectedSession, fetchProtocol, fetchProtocolCounts])

  const fetchSessions = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/chat/sessions`)
      const sessionList: SessionEntry[] = data.sessions || []
      setSessions(sessionList)

      // Fetch contact profiles in batch
      const contactIds = sessionList
        .map(s => getContactId(s))
        .filter(Boolean)
        .slice(0, 50)
      if (contactIds.length > 0) {
        try {
          const { data: profileMap } = await api.post(`/instances/${selectedId}/chat/contacts/fetch`, { contactIds })
          setContacts(prev => ({ ...prev, ...profileMap }))
        } catch {
          // Fallback: try cached contacts
          try {
            const { data: cached } = await api.get(`/instances/${selectedId}/chat/contacts`)
            setContacts(prev => ({ ...prev, ...cached }))
          } catch {}
        }
      }
    } catch {
      toast.error('Erro ao carregar sessões de chat')
    }
    finally { setLoading(false) }
  }, [selectedId, toast])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const fetchMessages = useCallback(async (sessionId: string) => {
    if (!selectedId) return
    setLoadingMessages(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/chat/sessions/${sessionId}`)
      setMessages(data.messages || [])
    } catch {
      toast.error('Erro ao carregar mensagens da conversa')
    }
    finally { setLoadingMessages(false) }
  }, [selectedId, toast])

  useEffect(() => {
    if (selectedSession) {
      fetchMessages(selectedSession.sessionId)
      fetchProtocol(selectedSession.sessionId)
    } else {
      setProtocol(null)
    }
  }, [selectedSession, fetchMessages, fetchProtocol])

  // Fetch protocol counts on mount and periodically
  useEffect(() => {
    fetchProtocolCounts()
    const interval = setInterval(fetchProtocolCounts, 30_000)
    return () => clearInterval(interval)
  }, [fetchProtocolCounts])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSelectSession = (session: SessionEntry) => {
    setSelectedSession(session)
    setMessages([])
    setProtocol(null)
  }

  const handleBack = () => {
    setSelectedSession(null)
    setMessages([])
    setProtocol(null)
  }

  // SSE stream for real-time protocol updates
  const protocolRef = useRef(protocol)
  protocolRef.current = protocol
  const selectedSessionRef = useRef(selectedSession)
  selectedSessionRef.current = selectedSession

  useProtocolStream({
    instanceId: selectedId,
    enabled: !!selectedId,
    onEvent: useCallback((event: any) => {
      if (event.type === 'escalation' || event.type === 'status_change') {
        const cur = protocolRef.current
        if (cur && event.protocol && event.protocol.id === cur.id) {
          setProtocol(prev => prev ? {
            ...prev,
            status: event.protocol.status,
            mode: event.protocol.mode,
            assignedUser: event.protocol.assignedUser || null,
            escalationReason: event.protocol.escalationReason,
          } : null)
        }
        fetchProtocolCounts()
      }
      if (event.type === 'new_message') {
        const sess = selectedSessionRef.current
        if (sess && event.sessionId === sess.sessionId) {
          fetchMessages(sess.sessionId)
          fetchProtocol(sess.sessionId)
        }
      }
    }, [fetchProtocolCounts, fetchMessages, fetchProtocol]),
  })

  if (!selectedId) return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Selecione uma instancia</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedSession && (
            <Button variant="ghost" size="sm" className="sm:hidden" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Conversas</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 flex items-center gap-2">
              {selectedSession
                ? `${getChannelIcon(selectedSession.lastChannel)} ${getContactLabel(selectedSession, contacts)}`
                : `${sessions.length} conversa(s) encontrada(s)`
              }
              {!selectedSession && protocolCounts.escalated > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  {protocolCounts.escalated} escalado(s)
                </span>
              )}
              {!selectedSession && protocolCounts.mine > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {protocolCounts.mine} meu(s)
                </span>
              )}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={selectedSession ? () => fetchMessages(selectedSession.sessionId) : fetchSessions}>
          <RefreshCw className="h-3 w-3" /> Atualizar
        </Button>
      </div>

      {/* Main content: 2-panel layout */}
      <div className="flex gap-4 h-[calc(100vh-180px)]">
        {/* Sessions list */}
        <div className={cn(
          'w-full sm:w-80 sm:shrink-0 overflow-y-auto space-y-1.5',
          selectedSession ? 'hidden sm:block' : 'block'
        )}>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : sessions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <MessagesSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
              </CardContent>
            </Card>
          ) : (
            sessions.map(session => {
              const contactId = getContactId(session)
              const profile = contacts[contactId]
              const label = getContactLabel(session, contacts)
              const phone = profile?.phone || session.origin?.from || session.deliveryContext?.to
              return (
                <Card
                  key={session.sessionId}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-muted/50',
                    selectedSession?.sessionId === session.sessionId && 'ring-1 ring-primary bg-primary/5'
                  )}
                  onClick={() => handleSelectSession(session)}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <ContactAvatar
                        picUrl={profile?.profilePicUrl || null}
                        label={label}
                        isGroup={session.chatType === 'group'}
                        channel={session.lastChannel}
                        size={9}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{label}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(session.updatedAt)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">{session.lastChannel}</span>
                          {phone && profile?.displayName && (
                            <span className="text-[10px] text-muted-foreground">{formatPhone(phone)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* Messages panel */}
        <div className={cn(
          'flex-1 flex flex-col min-w-0',
          !selectedSession ? 'hidden sm:flex' : 'flex'
        )}>
          {!selectedSession ? (
            <Card className="flex-1 flex items-center justify-center">
              <CardContent className="text-center py-12">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Selecione uma conversa para ver as mensagens</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex-1 flex flex-col overflow-hidden">
              {/* Messages header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
                <Button variant="ghost" size="sm" className="hidden sm:flex" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {(() => {
                  const cId = getContactId(selectedSession)
                  const prof = contacts[cId]
                  const lbl = getContactLabel(selectedSession, contacts)
                  const ph = prof?.phone || selectedSession.origin?.from || selectedSession.deliveryContext?.to
                  return (
                    <>
                      <ContactAvatar
                        picUrl={prof?.profilePicUrl || null}
                        label={lbl}
                        isGroup={selectedSession.chatType === 'group'}
                        channel={selectedSession.lastChannel}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{lbl}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {selectedSession.lastChannel} · {selectedSession.chatType === 'group' ? 'Grupo' : 'Direto'}
                          {ph && prof?.displayName ? ` · ${formatPhone(ph)}` : ''}
                        </p>
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Protocol bar */}
              {protocol && user && (
                <ProtocolBar
                  protocol={protocol}
                  currentUserId={user.id}
                  currentUserRole={user.role}
                  onAssign={() => setAssignModalOpen(true)}
                  onClose={() => setCloseModalOpen(true)}
                />
              )}

              {/* Messages body */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {loadingMessages ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem encontrada</p>
                ) : (
                  (() => {
                    // Merge chat messages with internal protocol messages
                    const internalMsgs = (protocol?.messages || []).map((pm) => ({
                      _internal: true as const,
                      id: pm.id,
                      type: pm.type,
                      content: pm.content,
                      userName: pm.user?.name || 'Sistema',
                      timestamp: new Date(pm.createdAt).getTime(),
                    }))

                    const chatMsgs = messages.map((msg) => ({
                      _internal: false as const,
                      ...msg,
                      _ts: new Date(msg.timestamp).getTime(),
                    }))

                    // Combine and sort by timestamp
                    type MergedMsg = (typeof chatMsgs[number]) | (typeof internalMsgs[number])
                    const allMsgs: MergedMsg[] = [...chatMsgs, ...internalMsgs].sort((a, b) => {
                      const tsA = a._internal ? a.timestamp : a._ts
                      const tsB = b._internal ? b.timestamp : b._ts
                      return tsA - tsB
                    })

                    return allMsgs.map((item) => {
                      if (item._internal) {
                        // Render internal protocol message
                        const pm = item
                        const isNote = pm.type === 'NOTE'
                        const isDirect = pm.type === 'DIRECT'
                        const isSystem = pm.type === 'SYSTEM'
                        const isInternal = pm.type === 'INTERNAL'

                        if (isSystem) {
                          return (
                            <div key={`pm-${pm.id}`} className="flex justify-center">
                              <span className="text-[10px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                                {pm.content}
                              </span>
                            </div>
                          )
                        }

                        return (
                          <div key={`pm-${pm.id}`} className="flex gap-2 justify-start">
                            <div className={cn(
                              'h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-1',
                              isNote ? 'bg-gray-200 dark:bg-gray-700' : isDirect ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'
                            )}>
                              {isNote ? <StickyNote className="h-3.5 w-3.5 text-gray-500" /> :
                               isDirect ? <UserCheck className="h-3.5 w-3.5 text-blue-500" /> :
                               <Lock className="h-3.5 w-3.5 text-purple-500" />}
                            </div>
                            <div className={cn(
                              'max-w-[75%] rounded-xl px-3 py-2 text-sm rounded-bl-sm',
                              isNote ? 'bg-gray-100 dark:bg-gray-800/50 italic' :
                              isDirect ? 'bg-blue-50 dark:bg-blue-950/30' :
                              'bg-purple-50 dark:bg-purple-950/30'
                            )}>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={cn(
                                  'text-[10px] font-medium',
                                  isNote ? 'text-gray-500' : isDirect ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'
                                )}>
                                  {isNote ? 'Nota' : isDirect ? 'Atendente' : 'Interno'} · {pm.userName}
                                </span>
                              </div>
                              <p className="whitespace-pre-wrap break-words">{pm.content}</p>
                              <p className="text-[10px] mt-1 text-muted-foreground">
                                {formatTime(pm.timestamp)}
                              </p>
                            </div>
                          </div>
                        )
                      }

                      // Render regular chat message
                      const msg = item
                      const isUser = msg.role === 'user'
                      const isAssistant = msg.role === 'assistant'
                      const hasMedia = !!msg.mediaType

                      let displayText = getMessageText(msg.content)
                      if (isUser) displayText = cleanUserText(displayText)
                      if (isAssistant) displayText = cleanAssistantText(displayText)

                      if (!displayText && !hasMedia) return null

                      return (
                        <div key={msg.id} className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
                          {isAssistant && (
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                              <Bot className="h-3.5 w-3.5 text-primary" />
                            </div>
                          )}
                          <div className={cn(
                            'max-w-[75%] rounded-xl px-3 py-2 text-sm',
                            isUser
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : isAssistant
                                ? 'bg-muted rounded-bl-sm'
                                : 'bg-muted/50 text-muted-foreground text-xs italic'
                          )}>
                            {hasMedia && <MediaBubble msg={msg} isUser={isUser} instanceId={selectedId} />}
                            {displayText && (
                              <p className={cn('whitespace-pre-wrap break-words', hasMedia && 'mt-1.5')}>
                                {displayText}
                              </p>
                            )}
                            <p className={cn(
                              'text-[10px] mt-1',
                              isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
                            )}>
                              {formatTime(msg.timestamp)}
                            </p>
                          </div>
                          {isUser && selectedSession && (
                            <div className="shrink-0 mt-1">
                              <ContactAvatar
                                picUrl={contacts[getContactId(selectedSession)]?.profilePicUrl || null}
                                label={getContactLabel(selectedSession, contacts)}
                                size={7}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })
                  })()
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Inline approval cards */}
              {pendingApprovals.length > 0 && (
                <div className="border-t bg-yellow-50/50 dark:bg-yellow-950/10 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    O assistente precisa da sua aprovação
                  </div>
                  {pendingApprovals.slice(0, 3).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 bg-card rounded-lg border border-yellow-200 dark:border-yellow-800 p-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">{a.description}</span>
                        <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">{a.toolName}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                          disabled={approvingId === a.id}
                          onClick={() => handleInlineApprove(a.id, false)}
                        >
                          {approvingId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={approvingId === a.id}
                          onClick={() => handleInlineApprove(a.id, true)}
                        >
                          Sempre
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-xs text-muted-foreground"
                          disabled={approvingId === a.id}
                          onClick={() => handleInlineDeny(a.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {pendingApprovals.length > 3 && (
                    <a href="/approvals" className="text-[10px] text-yellow-600 hover:underline">
                      +{pendingApprovals.length - 3} mais...
                    </a>
                  )}
                </div>
              )}

              {/* Attendant panel - visible when user is assigned and mode is A or B */}
              {protocol && user && protocol.assignedTo === user.id &&
               (protocol.mode === 'MODE_A' || protocol.mode === 'MODE_B') &&
               protocol.status !== 'CLOSED' && (
                <AttendantPanel
                  protocol={protocol}
                  instanceId={selectedId}
                  onMessageSent={() => {
                    if (selectedSession) fetchMessages(selectedSession.sessionId)
                    refreshProtocol()
                  }}
                  onModeChange={(mode) => setProtocol(prev => prev ? { ...prev, mode } : null)}
                />
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Protocol modals */}
      {protocol && user && (
        <>
          <AssignModal
            open={assignModalOpen}
            onClose={() => setAssignModalOpen(false)}
            protocol={protocol}
            instanceId={selectedId}
            currentUserId={user.id}
            onAssigned={refreshProtocol}
          />
          <CloseModal
            open={closeModalOpen}
            onClose={() => setCloseModalOpen(false)}
            protocol={protocol}
            instanceId={selectedId}
            onClosed={refreshProtocol}
          />
        </>
      )}
    </div>
  )
}
