// 建立第一位管理員（之後的帳號可在網頁「帳號」頁新增）
// 用法：npm run create-admin -- <帳號> <密碼> [顯示名稱] [--emulator]
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db, positional, usernameToEmail } from './_admin.mjs';

const [username, password, displayName] = positional;
if (!username || !password || password.length < 6 || !/^[a-z0-9._-]{2,32}$/.test(username)) {
  console.error('用法：npm run create-admin -- <帳號> <密碼(至少6字元)> [顯示名稱] [--emulator]');
  console.error('帳號限英文小寫、數字與 . _ -，2–32 字元');
  process.exit(1);
}

const email = usernameToEmail(username);
let user;
try {
  user = await adminAuth.getUserByEmail(email);
  await adminAuth.updateUser(user.uid, { password });
  console.log(`帳號已存在，已更新密碼：${username}`);
} catch (e) {
  if (e.code !== 'auth/user-not-found') throw e;
  user = await adminAuth.createUser({ email, password });
  console.log(`已建立登入帳號：${username}`);
}

const ref = db.doc(`users/${user.uid}`);
const existing = await ref.get();
await ref.set({
  username,
  displayName: displayName ?? existing.data()?.displayName ?? username,
  isAdmin: true,
  isJudge: existing.data()?.isJudge ?? true,
  active: true,
  createdAt: existing.data()?.createdAt ?? FieldValue.serverTimestamp(),
});
console.log(`已設定為管理員（uid: ${user.uid}）`);
process.exit(0);
