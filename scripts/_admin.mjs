// 管理腳本共用：連線到正式 Firebase 或本機 Emulator
//
// 正式環境：把 Service Account 金鑰放在 secrets/service-account.json（已被 .gitignore 排除），
//           或用 GOOGLE_APPLICATION_CREDENTIALS 指定路徑。
// Emulator：加上 --emulator 參數。
import { existsSync, readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const USERNAME_DOMAIN = 'pmnight.local';
export const usernameToEmail = (u) => `${u.trim().toLowerCase()}@${USERNAME_DOMAIN}`;

const args = process.argv.slice(2);
export const useEmulator = args.includes('--emulator');
export const positional = args.filter((a) => !a.startsWith('--'));

function init() {
  if (useEmulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
    return initializeApp({ projectId: 'demo-pmnight' });
  }
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? 'secrets/service-account.json';
  if (!existsSync(keyPath)) {
    console.error(`找不到 Service Account 金鑰：${keyPath}`);
    console.error('請到 Firebase Console → 專案設定 → 服務帳戶 → 產生新的私密金鑰，存到 secrets/service-account.json');
    process.exit(1);
  }
  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  return initializeApp({ credential: cert(key), projectId: key.project_id });
}

const app = init();
export const adminAuth = getAuth(app);
export const db = getFirestore(app);
