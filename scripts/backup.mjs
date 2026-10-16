// 完整備份：把所有資料（含稽核紀錄）存成 backups/backup-時間.json
// 用法：npm run backup [-- --emulator]
import { mkdirSync, writeFileSync } from 'node:fs';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './_admin.mjs';

const COLLECTIONS = ['users', 'performances', 'scores', 'auditLogs', 'config'];

function encode(v) {
  if (v instanceof Timestamp) return { __timestamp: v.toMillis() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}

const out = { exportedAt: new Date().toISOString(), collections: {} };
for (const name of COLLECTIONS) {
  const snap = await db.collection(name).get();
  out.collections[name] = Object.fromEntries(snap.docs.map((d) => [d.id, encode(d.data())]));
  console.log(`${name}: ${snap.size} 筆`);
}
mkdirSync('backups', { recursive: true });
const file = `backups/backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`已備份到 ${file}`);
process.exit(0);
