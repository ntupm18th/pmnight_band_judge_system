import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useOnline } from '../hooks/useOnline';
import { errorMessage } from '../lib/errors';
import { isTrustedDevice } from '../lib/firebase';

export function LoginPage() {
  const { login } = useAuth();
  const online = useOnline();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [trusted, setTrusted] = useState(isTrustedDevice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password, trusted);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 p-6" aria-describedby={error ? 'login-error' : undefined}>
        <div>
          <h1 className="text-xl font-semibold">流唱之夜一驗評分系統</h1>
          <p className="mt-1 text-sm text-zinc-500">請以評審或管理員帳號登入</p>
        </div>

        <div>
          <label htmlFor="username" className="label">帳號</label>
          <input
            id="username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="password" className="label">密碼</label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" checked={trusted} onChange={(e) => setTrusted(e.target.checked)} />
          <span>
            信任此裝置
            <span className="block text-xs text-zinc-500">保持登入，並在斷線時保留資料。公用或借來的裝置請勿勾選。</span>
          </span>
        </label>

        {error && (
          <p id="login-error" role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        {!online && <p className="text-sm text-amber-700 dark:text-amber-300">目前沒有網路連線，無法登入。</p>}

        <button type="submit" className="btn-primary w-full" disabled={busy || !online}>
          {busy ? '登入中…' : '登入'}
        </button>
      </form>
    </div>
  );
}
