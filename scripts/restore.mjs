// 從備份還原（覆寫同 ID 的文件，不會刪除備份中沒有的文件）
// 用法：npm run restore -- backups/xxx.json --emulator      ← 建議先還原到 Emulator 驗證
//       npm run restore -- backups/xxx.json --confirm-production
import { readFileSync } from 'node:fs';
import { Timestamp } from 'firebase-admin/firestore';
import { db, positional, useEmulator } from './_admin.mjs';

const file = positional[0];
if (!file) {
  console.error('用法：npm run restore -- <備份檔> (--emulator | --confirm-production)');
  process.exit(1);
}
if (!useEmulator && !process.argv.includes('--confirm-production')) {
  console.error('要還原到正式資料庫必須加上 --confirm-production');
  process.exit(1);
}

function decode(v) {
  if (v && typeof v === 'object' && '__timestamp' in v) return Timestamp.fromMillis(v.__timestamp);
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  return v;
}

const data = JSON.parse(readFileSync(file, 'utf8'));
for (const [name, docs] of Object.entries(data.collections)) {
  const entries = Object.entries(docs);
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [id, d] of entries.slice(i, i + 400)) batch.set(db.collection(name).doc(id), decode(d));
    await batch.commit();
  }
  console.log(`${name}: 還原 ${entries.length} 筆`);
}
console.log(`完成（備份時間 ${data.exportedAt}）`);
process.exit(0);
