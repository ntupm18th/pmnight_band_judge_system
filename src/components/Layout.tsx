import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, type Mode } from '../auth/AuthContext';
import { useOnline } from '../hooks/useOnline';
import { useTheme } from '../hooks/useTheme';

const ADMIN_NAV = [
  { to: '/admin/summary', label: '成績總表' },
  { to: '/admin/performances', label: '表演管理' },
  { to: '/admin/users', label: '帳號' },
  { to: '/admin/audit', label: '稽核紀錄' },
  { to: '/admin/settings', label: '設定' },
];

const THEME_LABEL = { system: '跟隨系統', light: '淺色', dark: '深色' } as const;

export function Layout() {
  const { profile, mode, setMode, settings, logout } = useAuth();
  const online = useOnline();
  const { pref, cycle } = useTheme();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  function switchMode(m: Mode) {
    setMode(m);
    navigate(m === 'admin' ? '/admin/summary' : '/judge');
  }

  async function doLogout(force: boolean) {
    setLoggingOut(true);
    const ok = await logout(force);
    if (!ok) {
      setConfirmLogout(true);
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-2 px-4 py-2">
          <span className="mr-auto font-semibold">流唱之夜評分</span>

          {!online && <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">離線</span>}
          {settings.scoringLocked && (
            <span className="badge bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">評分已鎖定</span>
          )}

          {profile?.isAdmin && (
            <div role="group" aria-label="介面模式" className="flex rounded-lg border border-zinc-300 p-0.5 text-sm dark:border-zinc-700">
              {(['admin', 'judge'] as Mode[]).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => switchMode(m)}
                  className={`rounded-md px-3 py-1 ${mode === m ? 'bg-indigo-600 text-white' : 'text-zinc-600 dark:text-zinc-300'}`}
                >
                  {m === 'admin' ? '管理' : '評審'}
                </button>
              ))}
            </div>
          )}

          <button className="btn-ghost" onClick={cycle} aria-label={`主題：${THEME_LABEL[pref]}，點擊切換`}>
            {pref === 'dark' ? '🌙' : pref === 'light' ? '☀️' : '🖥️'}
          </button>
          <span className="hidden text-sm text-zinc-500 sm:inline">{profile?.displayName}</span>
          <button className="btn-ghost" onClick={() => doLogout(false)} disabled={loggingOut}>
            登出
          </button>
        </div>

        {mode === 'admin' && (
          <nav className="mx-auto flex max-w-screen-2xl gap-1 overflow-x-auto px-4 pb-2" aria-label="管理功能">
            {ADMIN_NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-4">
        <Outlet />
      </main>

      {confirmLogout && (
        <div role="dialog" aria-modal="true" aria-labelledby="logout-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-sm p-5">
            <h2 id="logout-title" className="font-semibold">還有資料尚未同步</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              目前有評分還沒送到伺服器。現在登出，這些變更會遺失。建議先恢復網路，等同步完成再登出。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmLogout(false)} autoFocus>
                取消
              </button>
              <button className="btn-danger" onClick={() => doLogout(true)}>
                仍要登出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
