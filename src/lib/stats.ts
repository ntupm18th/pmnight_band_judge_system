import { isComplete, totalOf } from './rubric';
import type { Category, Performance, Score } from './types';

export type InvalidReason = 'category-mismatch' | 'incomplete';

/** 這份評分是否計入平均：已完成、未標記不上場、資料有效、表演未停用 */
export function isValidScore(perf: Performance, s: Score): boolean {
  return (
    perf.active &&
    !perf.deleted &&
    s.status === 'submitted' &&
    !s.noShow &&
    invalidReason(perf, s) === null
  );
}

export function invalidReason(perf: Performance, s: Score): InvalidReason | null {
  if (s.category !== perf.category) return 'category-mismatch';
  if (s.status === 'submitted' && !isComplete(s.category, s.items)) return 'incomplete';
  return null;
}

export interface PerformanceStats {
  performanceId: string;
  submittedCount: number;
  draftCount: number;
  noShowCount: number;
  validCount: number;
  /** 有效評分總分加總 */
  validSum: number;
  /** null 代表尚無有效成績 */
  average: number | null;
  /** 同類別內排名；無有效成績或已停用為 null */
  rank: number | null;
  anomalies: string[];
}

export function computeStats(performances: Performance[], scores: Score[]): Map<string, PerformanceStats> {
  const byPerf = new Map<string, Score[]>();
  for (const s of scores) {
    const list = byPerf.get(s.performanceId);
    if (list) list.push(s);
    else byPerf.set(s.performanceId, [s]);
  }

  const result = new Map<string, PerformanceStats>();
  for (const p of performances) {
    const list = byPerf.get(p.id) ?? [];
    let validCount = 0;
    let validSum = 0;
    const anomalies: string[] = [];
    for (const s of list) {
      if (isValidScore(p, s)) {
        validCount++;
        validSum += totalOf(s.category, s.items);
      }
      const reason = invalidReason(p, s);
      if (reason === 'category-mismatch') anomalies.push('評分類別與表演類別不符');
      if (reason === 'incomplete') anomalies.push('完成評分但有項目未填');
    }
    const noShowCount = list.filter((s) => s.noShow).length;
    if (noShowCount > 0) anomalies.push(`${noShowCount} 位評審標記不上場`);
    result.set(p.id, {
      performanceId: p.id,
      submittedCount: list.filter((s) => s.status === 'submitted').length,
      draftCount: list.filter((s) => s.status === 'draft').length,
      noShowCount,
      validCount,
      validSum,
      average: validCount > 0 ? validSum / validCount : null,
      rank: null,
      anomalies,
    });
  }

  for (const category of ['vocal', 'band'] as Category[]) {
    assignRanks(
      performances
        .filter((p) => p.category === category && p.active && !p.deleted)
        .map((p) => result.get(p.id)!)
        .filter((st) => st.validCount > 0),
    );
  }
  return result;
}

/** 標準競賽排名（1, 1, 3）；以分數交叉相乘比較，避免浮點誤差造成同分判斷錯誤 */
function assignRanks(list: PerformanceStats[]) {
  const cmp = (a: PerformanceStats, b: PerformanceStats) =>
    b.validSum * a.validCount - a.validSum * b.validCount;
  list.sort(cmp);
  list.forEach((st, i) => {
    st.rank = i > 0 && cmp(list[i - 1], st) === 0 ? list[i - 1].rank : i + 1;
  });
}

export function formatAverage(avg: number | null): string {
  return avg === null ? '尚無有效成績' : avg.toFixed(3);
}
