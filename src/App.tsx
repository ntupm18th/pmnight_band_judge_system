import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { FullPageMessage } from './components/FullPageMessage';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/admin/UsersPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { AdminDataProvider } from './admin/AdminData';
import { SummaryPage } from './pages/admin/SummaryPage';
import { PerformancesPage } from './pages/admin/PerformancesPage';
import { AuditPage } from './pages/admin/AuditPage';
import { JudgePage } from './pages/judge/JudgePage';

function Routed() {
  const { loading, user, profile, profileProblem, mode, logout } = useAuth();

  if (loading) return <FullPageMessage title="載入中…" />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (!profile) {
    return (
      <FullPageMessage title="無法使用此帳號" detail={profileProblem ?? ''}>
        <button className="btn-secondary" onClick={() => logout(true)}>
          登出
        </button>
      </FullPageMessage>
    );
  }

  const home = mode === 'admin' ? '/admin/summary' : '/judge';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/judge" element={<JudgePage />} />
        <Route path="/judge/:performanceId" element={<JudgePage />} />
        {profile.isAdmin && (
          <Route element={<AdminDataProvider />}>
            <Route path="/admin/summary" element={<SummaryPage />} />
            <Route path="/admin/performances" element={<PerformancesPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/audit" element={<AuditPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </Route>
        )}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routed />
      </AuthProvider>
    </HashRouter>
  );
}
