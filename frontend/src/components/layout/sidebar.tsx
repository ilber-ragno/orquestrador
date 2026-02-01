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
  Settings2,
  Bot,
  MessageCircle,
  MessagesSquare,
  Zap,
  Webhook,
  Smartphone,
} from 'lucide-react'

const menuItems = [
  { label: 'Painel', icon: LayoutDashboard, path: '/', enabled: true },
  { label: 'Assistente Inicial', icon: Compass, path: '/setup', enabled: true },
  { label: 'Inteligência e APIs', icon: Link2, path: '/connections', enabled: true },
  { label: 'Agents', icon: Bot, path: '/agents', enabled: true },
  { label: 'Canais', icon: MessageCircle, path: '/channels', enabled: true },
  { label: 'Conversas', icon: MessagesSquare, path: '/chat', enabled: true },
  { label: 'Planos de Uso', icon: CreditCard, path: '/plans', enabled: true },
  { label: 'Automações', icon: Zap, path: '/automations', enabled: true },
  { label: 'Webhooks', icon: Webhook, path: '/webhooks', enabled: true },
  { label: 'Dispositivos', icon: Smartphone, path: '/nodes', enabled: true },
  { label: 'Serviços Ativos', icon: Server, path: '/services', enabled: true },
  { label: 'Histórico', icon: ScrollText, path: '/logs', enabled: true },
  { label: 'Ações em Andamento', icon: ListTodo, path: '/tasks', enabled: true },
  { label: 'Usuários e Acesso', icon: ShieldCheck, path: '/security', enabled: true },
  { label: 'Verificação de Saúde', icon: Stethoscope, path: '/diagnostics', enabled: true },
  { label: 'Configurações', icon: Settings, path: '/settings', enabled: true },
  { label: 'OpenClaw', icon: Settings2, path: '/openclaw-config', enabled: true },
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
          'fixed top-14 left-0 bottom-0 w-60 bg-sidebar border-r border-sidebar-border z-50 transition-transform duration-200 overflow-y-auto',
          'lg:translate-x-0 lg:z-40',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <nav className="p-3 space-y-1 pb-8">
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
