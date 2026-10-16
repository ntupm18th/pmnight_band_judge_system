// 從 XLSX／CSV 匯入表演名單（與網頁「表演管理 → 匯入」使用同一套解析邏輯）
// 用法：node scripts/import-performances.ts <檔案> [--sheet=工作表名稱] [--write] [--emulator]
// 預設只預覽；加上 --write 才會寫入。資料庫已有表演時拒絕寫入，避免重複。
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { parsePerformanceRows } from '../src/lib/importParse.ts';
// @ts-ignore — 純 JS 模組
import { db, positional } from './_admin.mjs';
import { FieldValue } from 'firebase-admin/firestore';

const file = positional[0];
const sheetArg = process.argv.find((a) => a.startsWith('--sheet='))?.slice('--sheet='.length);
const write = process.argv.includes('--write');
if (!file) {
  console.error('用法：node scripts/import-performances.ts <檔案> [--sheet=工作表名稱] [--write] [--emulator]');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(file));
const sheetName = sheetArg ?? wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
if (!ws) {
  console.error(`找不到工作表「${sheetName}」。可用：${wb.SheetNames.join('、')}`);
  process.exit(1);
}
const { rows, warnings, errors } = parsePerformanceRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }));

console.log(`工作表：${sheetName}`);
for (const day of [1, 2]) {
  const list = rows.filter((r) => r.day === day);
  if (!list.length) continue;
  const v = list.filter((r) => r.category === 'vocal').length;
  console.log(`第 ${day} 天（${list[0].dateLabel}）：${list.length} 組（主唱 ${v}、樂團 ${list.length - v}）`);
}
warnings.forEach((w) => console.log(`⚠ ${w}`));
errors.forEach((e) => console.log(`✗ ${e}`));
if (errors.length) process.exit(1);

if (!write) {
  console.log('\n（預覽模式，未寫入。確認無誤後加上 --write）');
  process.exit(0);
}

const existing = await db.collection('performances').limit(1).get();
if (!existing.empty) {
  console.error('資料庫已經有表演資料，為避免重複不會寫入。請改用網頁上的表演管理。');
  process.exit(1);
}
const batch = db.batch();
for (const r of rows) {
  batch.set(db.collection('performances').doc(), {
    day: r.day,
    order: r.order,
    startTime: r.startTime,
    bandName: r.bandName,
    song: r.song,
    category: r.category,
    active: true,
    deleted: false,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'import-script',
  });
}
await batch.commit();
console.log(`已寫入 ${rows.length} 組表演`);
process.exit(0);
