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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/connections" element={<ConnectionsPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/diagnostics" element={<DiagnosticsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
