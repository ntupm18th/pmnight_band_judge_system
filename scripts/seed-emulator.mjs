// 本機 Emulator 測試資料：1 位管理員、3 位評審、數組表演
// 用法：npm run emulators（另一個終端機）→ node scripts/seed-emulator.mjs --emulator
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db, useEmulator, usernameToEmail } from './_admin.mjs';

if (!useEmulator) {
  console.error('此腳本只能用於 Emulator，請加上 --emulator');
  process.exit(1);
}

const people = [
  { username: 'admin', displayName: '管理員', isAdmin: true, isJudge: true },
  { username: 'judge1', displayName: '評審一', isAdmin: false, isJudge: true },
  { username: 'judge2', displayName: '評審二', isAdmin: false, isJudge: true },
  { username: 'judge3', displayName: '評審三', isAdmin: false, isJudge: true },
];
for (const p of people) {
  let user;
  try {
    user = await adminAuth.getUserByEmail(usernameToEmail(p.username));
  } catch {
    user = await adminAuth.createUser({ email: usernameToEmail(p.username), password: 'password' });
  }
  await db.doc(`users/${user.uid}`).set({ ...p, active: true, createdAt: FieldValue.serverTimestamp() });
}

const perfs = [
  [1, 1, '晨光合唱', '小幸運', 'vocal'],
  [1, 2, '午夜電台', '倔強', 'band'],
  [1, 3, '無伴奏研究社', '夜曲', 'vocal'],
  [1, 4, '燒聲樂團', '離開地球表面', 'band'],
  [2, 1, '和聲實驗室', '說好的幸福呢', 'vocal'],
  [2, 2, '低音大道', '突然好想你', 'band'],
];
const batch = db.batch();
for (const [day, order, bandName, song, category] of perfs) {
  batch.set(db.collection('performances').doc(), {
    day, order, bandName, song, category, active: true, deleted: false,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: 'seed',
  });
}
batch.set(db.doc('config/settings'), { scoringLocked: false, updatedBy: 'seed', updatedAt: FieldValue.serverTimestamp() });
await batch.commit();
console.log('已建立測試資料。帳號 admin / judge1 / judge2 / judge3，密碼皆為 password');
process.exit(0);
