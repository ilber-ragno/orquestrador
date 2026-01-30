import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Topbar } from './topbar'
import { Sidebar } from './sidebar'
import { InstanceProvider, useInstance } from '@/context/instance-context'

function AppShellInner() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { instances, selectedId, selectInstance } = useInstance()

  return (
    <div className="min-h-screen bg-background">
      <Topbar
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        instances={instances}
        selectedInstance={selectedId}
        onSelectInstance={selectInstance}
      />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="lg:pl-60 pt-4">
        <div className="max-w-7xl mx-auto px-4 pb-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export function AppShell() {
  return (
    <InstanceProvider>
      <AppShellInner />
    </InstanceProvider>
  )
}
