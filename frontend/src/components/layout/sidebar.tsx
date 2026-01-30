import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Compass,
  Link2,
  CreditCard,
  Server,
  ScrollText,
  ListTodo,
  ShieldCheck,
  Stethoscope,
  Settings,
} from 'lucide-react'

const menuItems = [
  { label: 'Visão Geral', icon: LayoutDashboard, path: '/', enabled: true },
  { label: 'Setup Guiado', icon: Compass, path: '/setup', enabled: false },
  { label: 'Conexões', icon: Link2, path: '/connections', enabled: true },
  { label: 'Planos e Limites', icon: CreditCard, path: '/plans', enabled: false },
  { label: 'Serviços', icon: Server, path: '/services', enabled: true },
  { label: 'Logs e Auditoria', icon: ScrollText, path: '/logs', enabled: true },
  { label: 'Tarefas', icon: ListTodo, path: '/tasks', enabled: false },
  { label: 'Segurança', icon: ShieldCheck, path: '/security', enabled: false },
  { label: 'Diagnóstico', icon: Stethoscope, path: '/diagnostics', enabled: true },
  { label: 'Configurações', icon: Settings, path: '/settings', enabled: true },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          'fixed top-14 left-0 bottom-0 w-60 bg-sidebar border-r border-sidebar-border z-40 transition-transform duration-200',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <nav className="p-3 space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.enabled ? item.path : '#'}
              onClick={(e) => {
                if (!item.enabled) e.preventDefault()
                else onClose()
              }}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  item.enabled
                    ? isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                    : 'text-muted-foreground/40 cursor-not-allowed',
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {!item.enabled && (
                <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Em breve</span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
