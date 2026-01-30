import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/auth-context'
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/connections" element={<ConnectionsPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/diagnostics" element={<DiagnosticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
