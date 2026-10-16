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
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/85 backdrop-blur-md dark:border-white/[0.07] dark:bg-zinc-950/85">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-2 px-4 py-2">
          <span className="mr-auto flex items-baseline gap-2">
            <span className="text-[17px] font-bold tracking-wide">流唱之夜</span>
            <span className="eyebrow text-zinc-500">一驗 · Scoring</span>
          </span>

          {!online && <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">離線</span>}
          {settings.scoringLocked && (
            <span className="badge bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">評分已鎖定</span>
          )}

          {profile?.isAdmin && (
            <div role="group" aria-label="介面模式" className="flex rounded-[10px] border border-zinc-300 p-0.5 text-sm dark:border-white/10">
              {(['admin', 'judge'] as Mode[]).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => switchMode(m)}
                  className={`rounded-md px-3 py-1 transition-colors duration-150 ${mode === m ? 'bg-accent font-semibold text-accent-ink' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
                >
                  {m === 'admin' ? '管理' : '評審'}
                </button>
              ))}
            </div>
          )}

          <button className="btn-ghost" onClick={cycle} aria-label={`主題：${THEME_LABEL[pref]}，點擊切換`}>
            <ThemeIcon pref={pref} />
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
                      ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-800 dark:text-indigo-300'
                      : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100'
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

function ThemeIcon({ pref }: { pref: 'system' | 'light' | 'dark' }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (pref === 'dark') return <svg {...common}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>;
  if (pref === 'light')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
