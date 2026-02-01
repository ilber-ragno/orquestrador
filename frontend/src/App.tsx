import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/auth-context'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { ErrorBoundary } from '@/components/error-boundary'
import { ProtectedRoute } from '@/components/layout/protected-route'
import { AppShell } from '@/components/layout/app-shell'
import LoginPage from '@/pages/login'
import DashboardPage from '@/pages/dashboard'
import SettingsPage from '@/pages/settings'
import ServicesPage from '@/pages/services'
import ConnectionsPage from '@/pages/connections'
import LogsPage from '@/pages/logs'
import DiagnosticsPage from '@/pages/diagnostics'
import TasksPage from '@/pages/tasks'
import PlansPage from '@/pages/plans'
import SetupPage from '@/pages/setup'
import SecurityPage from '@/pages/security'
import AgentsPage from '@/pages/agents'
import ChannelsPage from '@/pages/channels'
import AutomationsPage from '@/pages/automations'
import ChatPage from '@/pages/chat'
import OpenClawConfigPage from '@/pages/openclaw-config'
import WebhooksPage from '@/pages/webhooks'
import NodesPage from '@/pages/nodes'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <ConfirmProvider>
        <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/connections" element={<ConnectionsPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/channels" element={<ChannelsPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/automations" element={<AutomationsPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/diagnostics" element={<DiagnosticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/webhooks" element={<WebhooksPage />} />
              <Route path="/nodes" element={<NodesPage />} />
              <Route path="/openclaw-config" element={<OpenClawConfigPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
        </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
