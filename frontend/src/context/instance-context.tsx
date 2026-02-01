import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api } from '@/lib/api-client'

export interface Instance {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  containerName: string | null
  containerHost: string | null
  containerType: string | null
  configCount: number
  historyCount: number
  createdAt: string
  updatedAt: string
}

export interface InstanceStatus {
  id: string
  name: string
  slug: string
  status: string
  summary: {
    gateway: { mode: string | null; port: string | null; status: string }
    provider: { default: string | null; configured: boolean }
    whatsapp: { status: string }
    configCount: number
    lastConfigUpdate: string
  }
}

interface InstanceContextType {
  instances: Instance[]
  selectedId: string | null
  selectedInstance: Instance | null
  instanceStatus: InstanceStatus | null
  statusLoading: boolean
  selectInstance: (id: string) => void
  refreshInstances: () => Promise<void>
  refreshStatus: () => Promise<void>
}

const InstanceContext = createContext<InstanceContextType | null>(null)

export function InstanceProvider({ children }: { children: ReactNode }) {
  const [instances, setInstances] = useState<Instance[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try { return localStorage.getItem('selectedInstanceId') } catch { return null }
  })
  const [instanceStatus, setInstanceStatus] = useState<InstanceStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)

  const refreshInstances = useCallback(async () => {
    try {
      const { data } = await api.get('/instances')
      setInstances(data)
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id)
        try { localStorage.setItem('selectedInstanceId', data[0].id) } catch {}
      }
    } catch (err) {
      console.error('Failed to load instances', err)
    }
  }, [selectedId])

  const refreshStatus = useCallback(async () => {
    if (!selectedId) return
    setStatusLoading(true)
    try {
      const { data } = await api.get(`/instances/${selectedId}/status`)
      setInstanceStatus(data)
    } catch (err) {
      console.error('Failed to load instance status', err)
    } finally {
      setStatusLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    refreshInstances()
  }, [refreshInstances])

  useEffect(() => {
    if (selectedId) refreshStatus()
  }, [selectedId, refreshStatus])

  const selectedInstance = instances.find((i) => i.id === selectedId) || null

  return (
    <InstanceContext.Provider
      value={{
        instances,
        selectedId,
        selectedInstance,
        instanceStatus,
        statusLoading,
        selectInstance: (id: string) => {
          setSelectedId(id)
          try { localStorage.setItem('selectedInstanceId', id) } catch {}
        },
        refreshInstances,
        refreshStatus,
      }}
    >
      {children}
    </InstanceContext.Provider>
  )
}

export function useInstance() {
  const context = useContext(InstanceContext)
  if (!context) throw new Error('useInstance must be used within InstanceProvider')
  return context
}
