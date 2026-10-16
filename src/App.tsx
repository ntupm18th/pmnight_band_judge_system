import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { FullPageMessage } from './components/FullPageMessage';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/admin/UsersPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { Placeholder } from './pages/Placeholder';

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
        <Route path="/judge" element={<Placeholder title="評分" phase="第 3 階段" />} />
        {profile.isAdmin && (
          <>
            <Route path="/admin/summary" element={<Placeholder title="成績總表" phase="第 4 階段" />} />
            <Route path="/admin/performances" element={<Placeholder title="表演管理" phase="第 2 階段" />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/audit" element={<Placeholder title="稽核紀錄" phase="第 5 階段" />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </>
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
