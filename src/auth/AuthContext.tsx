import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot, waitForPendingWrites } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSettings } from '../hooks/useSettings';
import { auth, getDb, setTrustedDevice, shutdownDb, usernameToEmail } from '../lib/firebase';
import type { Settings, UserProfile } from '../lib/types';

export type Mode = 'admin' | 'judge';

interface AuthState {
  /** 尚在確認登入狀態 */
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
  /** 已登入但沒有可用的 users 文件（未設定或已停用） */
  profileProblem: string | null;
  mode: Mode;
  setMode: (m: Mode) => void;
  settings: Settings;
  login: (username: string, password: string, trusted: boolean) => Promise<void>;
  /** 回傳 false 代表仍有未同步資料，呼叫端應先提醒使用者 */
  logout: (force?: boolean) => Promise<boolean>;
}

const Ctx = createContext<AuthState | null>(null);
const MODE_KEY = 'pm.mode';

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'judge' ? 'judge' : 'admin';
  } catch {
    return 'admin';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileProblem, setProfileProblem] = useState<string | null>(null);
  const [modePref, setModePref] = useState<Mode>(readMode);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthReady(true);
      }),
    [],
  );

  useEffect(() => {
    setProfile(null);
    setProfileProblem(null);
    if (!user) {
      setProfileReady(true);
      return;
    }
    setProfileReady(false);
    return onSnapshot(
      doc(getDb(), 'users', user.uid),
      (snap) => {
        const d = snap.data();
        if (!d) {
          setProfileProblem('此帳號尚未完成設定，請聯絡管理員。');
          setProfile(null);
        } else if (d.active !== true) {
          setProfileProblem('此帳號已被停用，請聯絡管理員。');
          setProfile(null);
        } else {
          setProfileProblem(null);
          setProfile({
            uid: user.uid,
            username: d.username,
            displayName: d.displayName,
            isAdmin: d.isAdmin === true,
            isJudge: d.isJudge === true,
            active: true,
            createdAt: d.createdAt ?? null,
          });
        }
        setProfileReady(true);
      },
      (err) => {
        console.error('[profile]', err);
        setProfileProblem('無法讀取帳號資料，請確認網路後重新整理。');
        setProfileReady(true);
      },
    );
  }, [user]);

  const settings = useSettings(profile !== null);

  const setMode = useCallback((m: Mode) => {
    setModePref(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // ignore
    }
  }, []);

  const login = useCallback(async (username: string, password: string, trusted: boolean) => {
    await setTrustedDevice(trusted);
    await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
  }, []);

  const logout = useCallback(async (force = false) => {
    if (!force) {
      // 有未送出的寫入時不要直接清掉快取
      const synced = await Promise.race([
        waitForPendingWrites(getDb()).then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
      ]);
      if (!synced) return false;
    }
    await signOut(auth);
    await shutdownDb();
    // 回到首頁，避免下一位登入者停在上一位的頁面
    window.location.hash = '';
    window.location.reload();
    return true;
  }, []);

  // 非管理員永遠是評審模式
  const mode: Mode = profile?.isAdmin ? modePref : 'judge';

  const value = useMemo<AuthState>(
    () => ({
      loading: !authReady || !profileReady,
      user,
      profile,
      profileProblem,
      mode,
      setMode,
      settings,
      login,
      logout,
    }),
    [authReady, profileReady, user, profile, profileProblem, mode, setMode, settings, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
