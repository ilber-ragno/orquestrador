import { useAuth } from '@/context/auth-context'
import { Button } from '@/components/ui/button'
import { Bot, LogOut, Menu, ChevronDown, Moon, Sun } from 'lucide-react'
import { useState, useEffect } from 'react'

interface TopbarProps {
  onToggleSidebar: () => void
  instances: Array<{ id: string; name: string; slug: string; status: string }>
  selectedInstance: string | null
  onSelectInstance: (id: string) => void
}

export function Topbar({ onToggleSidebar, instances, selectedInstance, onSelectInstance }: TopbarProps) {
  const { user, logout } = useAuth()
  const [showInstances, setShowInstances] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return false
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const currentInstance = instances.find((i) => i.id === selectedInstance)

  return (
    <header className="h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-4 gap-3 sticky top-0 z-50">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onToggleSidebar}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm hidden sm:inline">Clawdbot</span>
      </div>

      <div className="h-4 w-px bg-border mx-1" />

      {/* Instance selector */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
          onClick={() => setShowInstances(!showInstances)}
        >
          <div className={`h-2 w-2 rounded-full ${currentInstance?.status === 'running' ? 'bg-success' : 'bg-muted-foreground'}`} />
          {currentInstance?.name || 'Selecionar instância'}
          <ChevronDown className="h-3 w-3" />
        </Button>
        {showInstances && (
          <div className="absolute top-full mt-1 left-0 w-56 bg-popover border border-border rounded-md shadow-lg py-1 z-50">
            {instances.map((inst) => (
              <button
                key={inst.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                onClick={() => { onSelectInstance(inst.id); setShowInstances(false) }}
              >
                <div className={`h-2 w-2 rounded-full ${inst.status === 'running' ? 'bg-success' : 'bg-muted-foreground'}`} />
                <span>{inst.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">{inst.slug}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Dark mode toggle */}
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDark(!dark)} title={dark ? 'Modo claro' : 'Modo escuro'}>
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      {/* User menu */}
      <div className="relative">
        <Button variant="ghost" size="sm" className="gap-2 text-xs" onClick={() => setShowUserMenu(!showUserMenu)}>
          <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <span className="hidden sm:inline">{user?.name}</span>
        </Button>
        {showUserMenu && (
          <div className="absolute top-full mt-1 right-0 w-48 bg-popover border border-border rounded-md shadow-lg py-1 z-50">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{user?.role}</p>
            </div>
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 text-destructive"
              onClick={() => { logout(); setShowUserMenu(false) }}
            >
              <LogOut className="h-3 w-3" /> Sair
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
