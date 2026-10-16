import { deleteApp, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore,
} from 'firebase/firestore';

const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';

export const firebaseConfig: FirebaseOptions = useEmulator
  ? { apiKey: 'demo-key', projectId: 'demo-pmnight', authDomain: 'localhost', appId: 'demo-app' }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
if (useEmulator) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

// ───────── 可信任裝置 ─────────
// 可信任裝置：登入狀態與已載入資料保存在本機（IndexedDB），可離線使用、重開瀏覽器仍在。
// 非可信任裝置：資料只在記憶體中，關閉分頁即清除。

const TRUSTED_KEY = 'pm.trustedDevice';

export function isTrustedDevice(): boolean {
  try {
    return localStorage.getItem(TRUSTED_KEY) === '1';
  } catch {
    return false;
  }
}

export async function setTrustedDevice(trusted: boolean) {
  try {
    if (trusted) localStorage.setItem(TRUSTED_KEY, '1');
    else localStorage.removeItem(TRUSTED_KEY);
  } catch {
    // 私密瀏覽等情況無法寫入 localStorage，視為非可信任裝置
  }
  await setPersistence(auth, trusted ? browserLocalPersistence : browserSessionPersistence);
}

// Firestore 延遲初始化：快取模式必須在第一次使用前決定，因此等登入後才建立。
let dbInstance: Firestore | null = null;

export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = initializeFirestore(app, {
      localCache: isTrustedDevice()
        ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
        : memoryLocalCache(),
    });
    if (useEmulator) connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
  }
  return dbInstance;
}

/** 登出時清掉本機快取，避免下一位使用者看到資料 */
export async function shutdownDb() {
  if (!dbInstance) return;
  await terminate(dbInstance);
  try {
    await clearIndexedDbPersistence(dbInstance);
  } catch {
    // 其他分頁仍在使用時無法清除，下次登入會被覆寫
  }
  dbInstance = null;
}

// ───────── 帳號名稱 ↔ Firebase Auth email ─────────
// Firebase Auth 以 email 為帳號，這裡用固定網域把自訂帳號轉成 email，使用者不會看到。

export const USERNAME_DOMAIN = 'pmnight.local';
export const USERNAME_PATTERN = /^[a-z0-9._-]{2,32}$/;

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
}

/**
 * 用獨立的 Firebase App 實例建立帳號，避免把目前登入的管理員登出。
 * 回傳新帳號的 uid；若帳號已存在且密碼正確（先前建立到一半失敗），也會回傳其 uid。
 */
export async function createAuthAccount(username: string, password: string): Promise<string> {
  const { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = await import('firebase/auth');
  const secondary = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondary);
  if (useEmulator) connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  await setPersistence(secondaryAuth, browserSessionPersistence);
  try {
    const email = usernameToEmail(username);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      return cred.user.uid;
    } catch (e) {
      if ((e as { code?: string }).code !== 'auth/email-already-in-use') throw e;
      const cred = await signInWithEmailAndPassword(secondaryAuth, email, password);
      return cred.user.uid;
    } finally {
      await signOut(secondaryAuth).catch(() => {});
    }
  } finally {
    await deleteApp(secondary);
  }
}
