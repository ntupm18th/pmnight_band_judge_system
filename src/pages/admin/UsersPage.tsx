import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { errorMessage } from '../../lib/errors';
import { USERNAME_PATTERN, createAuthAccount, getDb } from '../../lib/firebase';
import type { UserProfile } from '../../lib/types';

export function UsersPage() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        collection(getDb(), 'users'),
        (snap) => {
          const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
          list.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.username.localeCompare(b.username));
          setUsers(list);
        },
        (e) => setLoadError(errorMessage(e)),
      ),
    [],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="card overflow-hidden">
        <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold dark:border-zinc-800">
          帳號列表 {users && <span className="text-sm font-normal text-zinc-500">（{users.length}）</span>}
        </h2>
        {loadError && <p role="alert" className="p-4 text-sm text-red-600">{loadError}</p>}
        {!users && !loadError && <p className="p-4 text-sm text-zinc-500">載入中…</p>}
        {users && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900/60">
                <tr>
                  <th className="px-4 py-2 font-medium">帳號</th>
                  <th className="px-4 py-2 font-medium">顯示名稱</th>
                  <th className="px-4 py-2 text-center font-medium">管理員</th>
                  <th className="px-4 py-2 text-center font-medium">評審</th>
                  <th className="px-4 py-2 text-center font-medium">啟用</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow key={u.uid} user={u} isSelf={u.uid === me?.uid} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800">
          忘記密碼：由管理員在電腦上執行 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm run reset-password -- 帳號 新密碼</code>。
          帳號不能刪除，不再使用時請取消「啟用」。你自己那一列的「管理員」「啟用」是灰色的，因為系統不允許拔掉自己的權限，避免沒有人能管理系統。
        </p>
      </section>

      <CreateUserForm />
    </div>
  );
}

function UserRow({ user, isSelf }: { user: UserProfile; isSelf: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(user.displayName);
  useEffect(() => setName(user.displayName), [user.displayName]);

  async function patch(data: Partial<Pick<UserProfile, 'displayName' | 'isAdmin' | 'isJudge' | 'active'>>) {
    setError(null);
    try {
      await updateDoc(doc(getDb(), 'users', user.uid), data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function saveName() {
    const v = name.trim();
    if (!v) setName(user.displayName);
    else if (v !== user.displayName) patch({ displayName: v });
  }

  const toggle = (field: 'isAdmin' | 'isJudge' | 'active', disabled = false) => (
    <td className="px-4 py-2 text-center">
      <input
        type="checkbox"
        className="size-4"
        aria-label={`${user.username} ${field === 'isAdmin' ? '管理員' : field === 'isJudge' ? '評審' : '啟用'}`}
        checked={user[field]}
        disabled={disabled}
        title={disabled ? '不能修改自己的這項權限' : undefined}
        onChange={(e) => patch({ [field]: e.target.checked })}
      />
    </td>
  );

  return (
    <>
      <tr className={`border-t border-zinc-100 dark:border-zinc-800 ${user.active ? '' : 'opacity-50'}`}>
        <td className="px-4 py-2 font-mono">
          {user.username}
          {isSelf && <span className="ml-1 text-xs text-zinc-500">（你）</span>}
        </td>
        <td className="px-4 py-1">
          <input
            className="input min-h-8"
            value={name}
            maxLength={40}
            aria-label={`${user.username} 顯示名稱`}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </td>
        {/* 不能拔掉自己的管理員權限或停用自己 */}
        {toggle('isAdmin', isSelf)}
        {toggle('isJudge')}
        {toggle('active', isSelf)}
      </tr>
      {error && (
        <tr>
          <td colSpan={5} role="alert" className="px-4 pb-2 text-xs text-red-600">{error}</td>
        </tr>
      )}
    </>
  );
}

function CreateUserForm() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isJudge, setIsJudge] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const normalized = username.trim().toLowerCase();
  const usernameValid = USERNAME_PATTERN.test(normalized);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usernameValid) return;
    setBusy(true);
    setMessage(null);
    try {
      const uid = await createAuthAccount(normalized, password);
      await setDoc(doc(getDb(), 'users', uid), {
        username: normalized,
        displayName: displayName.trim() || normalized,
        isAdmin,
        isJudge,
        active: true,
        createdAt: serverTimestamp(),
      });
      setMessage({ ok: true, text: `已建立帳號 ${normalized}` });
      setUsername('');
      setDisplayName('');
      setPassword('');
      setIsAdmin(false);
      setIsJudge(true);
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card h-fit space-y-3 p-4">
      <h2 className="font-semibold">新增帳號</h2>
      <div>
        <label htmlFor="new-username" className="label">帳號</label>
        <input
          id="new-username"
          className="input font-mono"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={username !== '' && !usernameValid}
          aria-describedby="new-username-hint"
        />
        <p id="new-username-hint" className={`mt-1 text-xs ${username && !usernameValid ? 'text-red-600' : 'text-zinc-500'}`}>
          2–32 字元，限英文小寫、數字與 . _ -
        </p>
      </div>
      <div>
        <label htmlFor="new-display" className="label">顯示名稱</label>
        <input id="new-display" className="input" maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例如：王老師" />
      </div>
      <div>
        <label htmlFor="new-password" className="label">初始密碼</label>
        <input id="new-password" className="input" type="text" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="mt-1 text-xs text-zinc-500">至少 6 個字元，建立後請私下交給本人</p>
      </div>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4" checked={isJudge} onChange={(e) => setIsJudge(e.target.checked)} /> 評審
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> 管理員
        </label>
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy || !usernameValid || password.length < 6}>
        {busy ? '建立中…' : '建立帳號'}
      </button>
    </form>
  );
}
