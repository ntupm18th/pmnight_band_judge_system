import type * as XLSXType from 'xlsx';
import { DAY_LABELS } from '../lib/days';
import { CATEGORY_LABEL, RUBRICS, isComplete, rubricItems, totalOf } from '../lib/rubric';
import type { PerformanceStats } from '../lib/stats';
import type { Category, Performance, Score, UserProfile } from '../lib/types';

function statusText(s: Score): string {
  return s.status === 'submitted' ? '完成' : '草稿';
}

function ts(v: unknown): string {
  const t = v as { toDate?: () => Date } | null;
  return t?.toDate ? t.toDate().toLocaleString('zh-TW', { hour12: false }) : '';
}

export interface AuditForExport {
  at: unknown;
  actorUid: string;
  judgeUid: string;
  performanceId: string;
  before: unknown;
  after: unknown;
  reason: string;
}

/** 建立成績活頁簿（純函式，方便測試） */
export function buildWorkbook(
  XLSX: typeof XLSXType,
  performances: Performance[],
  scores: Score[],
  stats: Map<string, PerformanceStats>,
  usersById: Map<string, UserProfile>,
  audits: AuditForExport[],
) {
  const wb = XLSX.utils.book_new();
  const judgeName = (uid: string) => usersById.get(uid)?.displayName ?? uid;

  // 摘要
  const summary = performances.map((p) => {
    const st = stats.get(p.id)!;
    return {
      日期: DAY_LABELS[p.day],
      順序: p.order,
      時間: p.startTime,
      報名人: p.bandName,
      曲目: p.song,
      組別: CATEGORY_LABEL[p.category],
      狀態: p.active ? '' : '已停用',
      有效評分數: st.validCount,
      平均: st.average === null ? '尚無有效成績' : Number(st.average.toFixed(3)),
      組內排名: st.rank ?? '',
      已完成: st.submittedCount,
      草稿: st.draftCount,
      不上場標記: st.noShowCount,
      異常: st.anomalies.join('；'),
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), '摘要');

  // 各組別排名
  for (const cat of ['vocal', 'band'] as Category[]) {
    const ranked = performances
      .filter((p) => p.category === cat && stats.get(p.id)!.rank !== null)
      .sort((a, b) => stats.get(a.id)!.rank! - stats.get(b.id)!.rank!)
      .map((p) => ({
        排名: stats.get(p.id)!.rank,
        平均: Number(stats.get(p.id)!.average!.toFixed(3)),
        有效評分數: stats.get(p.id)!.validCount,
        日期: DAY_LABELS[p.day],
        順序: p.order,
        報名人: p.bandName,
        曲目: p.song,
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ranked), `${CATEGORY_LABEL[cat]}排名`);
  }

  // 明細（每組別一張，欄位依評分項目）
  const perfById = new Map(performances.map((p) => [p.id, p]));
  for (const cat of ['vocal', 'band'] as Category[]) {
    const items = rubricItems(cat);
    const rows = scores
      .filter((s) => perfById.get(s.performanceId)?.category === cat)
      .sort((a, b) => {
        const pa = perfById.get(a.performanceId)!;
        const pb = perfById.get(b.performanceId)!;
        return pa.day - pb.day || pa.order - pb.order || judgeName(a.judgeUid).localeCompare(judgeName(b.judgeUid));
      })
      .map((s) => {
        const p = perfById.get(s.performanceId)!;
        const row: Record<string, string | number> = {
          日期: DAY_LABELS[p.day],
          順序: p.order,
          報名人: p.bandName,
          曲目: p.song,
          評審: judgeName(s.judgeUid),
          狀態: statusText(s),
          不上場: s.noShow ? '是' : '',
        };
        for (const it of items) {
          const section = RUBRICS[cat].sections.find((sec) => sec.items.includes(it))?.title;
          row[`${section ? section + ' ' : ''}${it.label}`] = s.items[it.key] ?? '';
        }
        row['總分'] = totalOf(s.category, s.items);
        row['計入平均'] = s.status === 'submitted' && !s.noShow && s.category === p.category && isComplete(s.category, s.items) && p.active ? '是' : '否';
        row['備註'] = s.note;
        row['最後修改'] = ts(s.updatedAt);
        row['管理員修改'] = s.lastAuditId ? '是' : '';
        return row;
      });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `${CATEGORY_LABEL[cat]}明細`);
  }

  // 稽核紀錄
  const auditRows = audits.map((a) => {
    const p = perfById.get(a.performanceId);
    return {
      時間: ts(a.at),
      操作者: judgeName(a.actorUid),
      評審: judgeName(a.judgeUid),
      表演: p ? `第${p.day}天 #${p.order} ${p.bandName}` : a.performanceId,
      修改前: JSON.stringify(a.before),
      修改後: JSON.stringify(a.after),
      原因: a.reason,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(auditRows), '稽核紀錄');
  return wb;
}

export async function exportResults(
  performances: Performance[],
  scores: Score[],
  stats: Map<string, PerformanceStats>,
  usersById: Map<string, UserProfile>,
) {
  const [XLSX, fs, { getDb }] = await Promise.all([import('xlsx'), import('firebase/firestore'), import('../lib/firebase')]);
  const snap = await fs.getDocs(fs.query(fs.collection(getDb(), 'auditLogs'), fs.orderBy('at', 'asc')));
  const wb = buildWorkbook(XLSX, performances, scores, stats, usersById, snap.docs.map((d) => d.data() as AuditForExport));
  const stamp = new Date().toLocaleString('sv-SE', { hour12: false }).replace(/[: ]/g, '').slice(0, 13);
  XLSX.writeFile(wb, `流唱之夜一驗成績_${stamp}.xlsx`);
}

