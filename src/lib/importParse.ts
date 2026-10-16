// 表演名單解析：網頁匯入與 scripts/import-performances.ts 共用。
// 此檔案只能有 type import，Node 才能直接執行（type stripping）。
import type { Category, Day } from './types';

export interface ParsedPerformance {
  day: Day;
  /** 當天的演出順序（依表格由上而下重新編號，從 1 開始） */
  order: number;
  startTime: string;
  bandName: string;
  song: string;
  category: Category;
  /** 原始表格上的順序欄位，僅供比對 */
  sheetOrder: string;
  dateLabel: string;
  /** 原始表格列號（1 起算），方便回報問題 */
  rowNumber: number;
}

export interface ParseResult {
  rows: ParsedPerformance[];
  warnings: string[];
  errors: string[];
}

type Cell = string | number | boolean | null | undefined;

const HEADER_ALIASES: Record<string, string[]> = {
  order: ['順序', '序號', '編號'],
  date: ['日期', '活動日期', '天'],
  start: ['開始', '開始時間', '時間'],
  category: ['組別', '類別', '表演類別'],
  name: ['報名人', '團名', '表演者', '名稱'],
  song: ['曲目', '歌曲', '歌名'],
};

function cellText(v: Cell): string {
  return v == null ? '' : String(v).trim();
}

/** Excel 時間（一天的比例）或 "18:00" 字串 → "HH:MM" */
export function formatTime(v: Cell): string {
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const minutes = Math.round(v * 1440);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  return cellText(v).slice(0, 20);
}

export function parseCategory(v: string): Category | null {
  if (/主唱|人聲|vocal/i.test(v)) return 'vocal';
  if (/樂團|band/i.test(v)) return 'band';
  return null;
}

function findHeader(rows: Cell[][]): { index: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cols: Record<string, number> = {};
    rows[i].forEach((c, j) => {
      const t = cellText(c);
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        if (cols[key] === undefined && aliases.some((a) => t.startsWith(a))) cols[key] = j;
      }
    });
    if (cols.category !== undefined && cols.name !== undefined) return { index: i, cols };
  }
  return null;
}

/**
 * rows 為工作表的二維陣列（SheetJS sheet_to_json(ws, { header: 1 })）。
 * 「緩衝」與沒有表演者的列會略過；日期欄空白時沿用上一列（合併儲存格）。
 */
export function parsePerformanceRows(rows: Cell[][]): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const header = findHeader(rows);
  if (!header) {
    return { rows: [], warnings, errors: ['找不到標題列：至少需要「組別」與「報名人／團名」欄位'] };
  }
  const { cols } = header;
  if (cols.date === undefined) warnings.push('沒有「日期」欄位，全部視為第 1 天');
  if (cols.song === undefined) warnings.push('沒有「曲目」欄位');

  const dateOrder: string[] = [];
  const perDayCount: Record<number, number> = { 1: 0, 2: 0 };
  const lastOffset: Record<number, number> = { 1: 0, 2: 0 };
  const result: ParsedPerformance[] = [];
  let currentDate = '';

  for (let i = header.index + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rowNumber = i + 1;
    const date = cols.date !== undefined ? cellText(r[cols.date]) : '';
    if (date) currentDate = date;
    const name = cellText(r[cols.name]);
    const categoryText = cellText(r[cols.category]);
    if (!name || categoryText === '緩衝') continue;

    const category = parseCategory(categoryText);
    if (!category) {
      errors.push(`第 ${rowNumber} 列：無法辨識組別「${categoryText}」（${name}）`);
      continue;
    }

    const dateLabel = currentDate || '第 1 天';
    if (!dateOrder.includes(dateLabel)) dateOrder.push(dateLabel);
    const dayIndex = dateOrder.indexOf(dateLabel) + 1;
    if (dayIndex > 2) {
      errors.push(`第 ${rowNumber} 列：出現第三個日期「${dateLabel}」，系統只支援兩天`);
      continue;
    }
    const day = dayIndex as Day;
    perDayCount[day]++;

    // 原表順序與重新編號不同時，只在差距改變的地方提醒一次，避免一個空號洗版
    const sheetOrder = cols.order !== undefined ? cellText(r[cols.order]) : '';
    if (cols.order !== undefined) {
      const offset = sheetOrder === '' ? NaN : Number(sheetOrder) - perDayCount[day];
      const prev = lastOffset[day];
      if (sheetOrder === '') {
        warnings.push(`${dateLabel} 第 ${perDayCount[day]} 組（第 ${rowNumber} 列，${name}）在原表沒有順序編號`);
      } else if (offset !== (Number.isNaN(prev) ? 0 : prev) && offset !== 0) {
        warnings.push(`${dateLabel} 從原表第 ${sheetOrder} 號（${name}）開始，系統編號為 ${perDayCount[day]}（相差 ${-offset}）`);
      } else if (offset === 0 && prev !== 0 && !Number.isNaN(prev)) {
        warnings.push(`${dateLabel} 從原表第 ${sheetOrder} 號（${name}）開始，編號恢復一致`);
      }
      lastOffset[day] = Number.isNaN(offset) ? (prev ?? 0) : offset;
    }

    result.push({
      day,
      order: perDayCount[day],
      startTime: cols.start !== undefined ? formatTime(r[cols.start] as Cell) : '',
      bandName: name.slice(0, 100),
      song: cols.song !== undefined ? cellText(r[cols.song]).slice(0, 200) : '',
      category,
      sheetOrder,
      dateLabel,
      rowNumber,
    });
  }

  if (result.length === 0 && errors.length === 0) errors.push('沒有找到任何表演資料');
  return { rows: result, warnings, errors };
}
