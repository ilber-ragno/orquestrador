import { useEffect, useRef, useCallback } from 'react'

interface ProtocolStreamEvent {
  type: 'connected' | 'escalation' | 'status_change' | 'new_message' | 'audit'
  protocol?: {
    id: string
    number: string
    status: string
    mode: string
    sessionId: string
    contactName?: string
    assignedUser?: { id: string; name: string } | null
    escalationReason?: string
  }
  protocolId?: string
  sessionId?: string
  message?: {
    id: string
    type: string
    content: string
    userName: string
    createdAt: string
  }
  action?: string
  details?: any
}

interface UseProtocolStreamOptions {
  instanceId: string | null
  enabled?: boolean
  onEvent?: (event: ProtocolStreamEvent) => void
}

export function useProtocolStream({ instanceId, enabled = true, onEvent }: UseProtocolStreamOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    if (!instanceId || !enabled) return

    const token = localStorage.getItem('accessToken')
    if (!token) return

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    // EventSource doesn't support custom headers, so we pass token as query param
    const url = `/api/instances/${instanceId}/protocols/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)

    es.onmessage = (event) => {
      try {
        const data: ProtocolStreamEvent = JSON.parse(event.data)
        onEventRef.current?.(data)
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      // Reconnect after 5 seconds on error
      es.close()
      eventSourceRef.current = null
      setTimeout(connect, 5000)
    }

    eventSourceRef.current = es
  }, [instanceId, enabled])

  useEffect(() => {
    connect()
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [connect])
}
