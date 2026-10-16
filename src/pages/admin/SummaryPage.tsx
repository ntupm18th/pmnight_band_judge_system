import { useMemo, useState } from 'react';
import { useAdminData } from '../../admin/AdminData';
import { exportResults } from '../../admin/exportXlsx';
import { ScoreEditDialog } from '../../admin/ScoreEditDialog';
import { DAY_LABELS } from '../../lib/days';
import { errorMessage } from '../../lib/errors';
import { CATEGORY_LABEL, RUBRICS, rubricItems, totalOf } from '../../lib/rubric';
import { formatAverage, isValidScore } from '../../lib/stats';
import type { Category, Day, Performance, Score } from '../../lib/types';

type View = 'summary' | 'detail';
type SortKey = 'order' | 'average' | 'validCount';

const th = 'sticky top-0 z-10 bg-zinc-100 px-2 py-2 text-left font-medium whitespace-nowrap text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
const td = 'px-2 py-1.5 whitespace-nowrap';

export function SummaryPage() {
  const { performances, scores, users, usersById, stats, error } = useAdminData();
  const [view, setView] = useState<View>('summary');
  const [day, setDay] = useState<'all' | Day>('all');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('order');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [editing, setEditing] = useState<Score | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!performances) return [];
    const list = performances.filter(
      (p) =>
        (day === 'all' || p.day === day) &&
        (category === 'all' || p.category === category) &&
        (!q || p.bandName.toLowerCase().includes(q) || p.song.toLowerCase().includes(q) || String(p.order) === q) &&
        (!onlyIssues || stats.get(p.id)!.anomalies.length > 0),
    );
    if (sort === 'average') {
      list.sort((a, b) => (stats.get(b.id)!.average ?? -1) - (stats.get(a.id)!.average ?? -1));
    } else if (sort === 'validCount') {
      list.sort((a, b) => stats.get(a.id)!.validCount - stats.get(b.id)!.validCount);
    }
    return list;
  }, [performances, day, category, q, onlyIssues, sort, stats]);

  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!performances || !scores || !users) return <p className="text-zinc-500">載入中…</p>;

  const scoresByPerf = new Map<string, Score[]>();
  for (const s of scores) {
    const l = scoresByPerf.get(s.performanceId);
    if (l) l.push(s);
    else scoresByPerf.set(s.performanceId, [s]);
  }
  const active = performances.filter((p) => p.active);
  const withResult = active.filter((p) => stats.get(p.id)!.validCount > 0).length;

  async function doExport() {
    setExporting(true);
    setExportError(null);
    try {
      await exportResults(performances!, scores!, stats, usersById);
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="檢視模式" className="flex rounded-lg border border-zinc-300 p-0.5 text-sm dark:border-zinc-700">
          {(['summary', 'detail'] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 ${view === v ? 'bg-accent font-semibold text-accent-ink' : 'text-zinc-600 dark:text-zinc-300'}`}
            >
              {v === 'summary' ? '摘要總表' : '詳細總表'}
            </button>
          ))}
        </div>
        <select className="input w-auto" aria-label="日期" value={day} onChange={(e) => setDay(e.target.value === 'all' ? 'all' : (Number(e.target.value) as Day))}>
          <option value="all">兩天</option>
          <option value="1">第 1 天 {DAY_LABELS[1]}</option>
          <option value="2">第 2 天 {DAY_LABELS[2]}</option>
        </select>
        <select className="input w-auto" aria-label="組別" value={category} onChange={(e) => setCategory(e.target.value as 'all' | Category)}>
          <option value="all">全部組別</option>
          <option value="vocal">{CATEGORY_LABEL.vocal}</option>
          <option value="band">{CATEGORY_LABEL.band}</option>
        </select>
        <select className="input w-auto" aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="order">依日期與順序</option>
          <option value="average">依平均（高到低）</option>
          <option value="validCount">依有效評分數（少到多）</option>
        </select>
        <input type="search" className="input w-48" placeholder="搜尋報名人／曲目／順序" aria-label="搜尋" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
          只看有提醒的
        </label>
        <span className="ml-auto text-sm text-zinc-500">
          已有成績 {withResult} / {active.length} 組
        </span>
        <button className="btn-secondary" onClick={doExport} disabled={exporting}>
          {exporting ? '匯出中…' : '匯出 XLSX'}
        </button>
      </div>
      {exportError && <p role="alert" className="text-sm text-red-600">匯出失敗：{exportError}</p>}

      {view === 'summary' ? (
        <SummaryTable performances={filtered} scoresByPerf={scoresByPerf} />
      ) : (
        <DetailTables performances={filtered} scoresByPerf={scoresByPerf} category={category} onEdit={setEditing} />
      )}

      {editing && <ScoreEditDialog score={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SummaryTable({ performances, scoresByPerf }: { performances: Performance[]; scoresByPerf: Map<string, Score[]> }) {
  const { stats, usersById } = useAdminData();
  return (
    <div className="card max-h-[calc(100dvh-12rem)] overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>日</th>
            <th className={th}>順序</th>
            <th className={th}>時間</th>
            <th className={th}>報名人</th>
            <th className={th}>曲目</th>
            <th className={th}>組別</th>
            <th className={`${th} text-right`}>有效評分</th>
            <th className={`${th} text-right`}>平均</th>
            <th className={`${th} text-right`}>組內排名</th>
            <th className={th}>評分狀態</th>
            <th className={th}>提醒</th>
          </tr>
        </thead>
        <tbody>
          {performances.length === 0 && (
            <tr><td colSpan={11} className="p-4 text-zinc-500">沒有符合條件的表演</td></tr>
          )}
          {performances.map((p) => {
            const st = stats.get(p.id)!;
            const list = scoresByPerf.get(p.id) ?? [];
            const noShowJudges = list.filter((s) => s.noShow).map((s) => usersById.get(s.judgeUid)?.displayName ?? '?');
            return (
              <tr key={p.id} className={`border-t border-zinc-100 dark:border-zinc-800 ${p.active ? '' : 'opacity-50'}`}>
                <td className={td}>{p.day}</td>
                <td className={`${td} num`}>{p.order}</td>
                <td className={`${td} num text-zinc-500`}>{p.startTime}</td>
                <td className={`${td} max-w-56 truncate`} title={p.bandName}>{p.bandName}</td>
                <td className={`${td} max-w-48 truncate text-zinc-600 dark:text-zinc-400`} title={p.song}>{p.song}</td>
                <td className={td}>{CATEGORY_LABEL[p.category]}</td>
                <td className={`${td} text-right num`}>{st.validCount}</td>
                <td className={`${td} text-right num ${st.average === null ? 'text-zinc-400' : 'font-semibold'}`}>{formatAverage(st.average)}</td>
                <td className={`${td} text-right num`}>{st.rank ?? '—'}</td>
                <td className={`${td} text-xs`}>
                  完成 {st.submittedCount}・草稿 {st.draftCount}
                </td>
                <td className={`${td} text-xs`}>
                  {!p.active && <span className="badge mr-1 bg-zinc-200 dark:bg-zinc-700">已停用</span>}
                  {noShowJudges.length > 0 && (
                    <span className="badge mr-1 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" title={noShowJudges.join('、')}>
                      不上場 ×{noShowJudges.length}（{noShowJudges.join('、')}）
                    </span>
                  )}
                  {st.anomalies.filter((a) => !a.includes('不上場')).map((a) => (
                    <span key={a} className="badge mr-1 bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">{a}</span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailTables({
  performances,
  scoresByPerf,
  category,
  onEdit,
}: {
  performances: Performance[];
  scoresByPerf: Map<string, Score[]>;
  category: 'all' | Category;
  onEdit: (s: Score) => void;
}) {
  const cats: Category[] = category === 'all' ? ['vocal', 'band'] : [category];
  return (
    <div className="space-y-4">
      {cats.map((c) => (
        <DetailTable key={c} category={c} performances={performances.filter((p) => p.category === c)} scoresByPerf={scoresByPerf} onEdit={onEdit} />
      ))}
    </div>
  );
}

function DetailTable({
  category,
  performances,
  scoresByPerf,
  onEdit,
}: {
  category: Category;
  performances: Performance[];
  scoresByPerf: Map<string, Score[]>;
  onEdit: (s: Score) => void;
}) {
  const { stats, usersById } = useAdminData();
  const items = rubricItems(category);
  const sections = RUBRICS[category].sections;
  const name = (uid: string) => usersById.get(uid)?.displayName ?? uid.slice(0, 6);

  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-zinc-200 px-3 py-2 font-semibold dark:border-zinc-800">
        {CATEGORY_LABEL[category]}明細 <span className="text-sm font-normal text-zinc-500">（點評分列可修改，需填寫原因）</span>
      </h2>
      <div className="max-h-[calc(100dvh-14rem)] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            {sections.some((s) => s.title) && (
              <tr>
                <th className={th} colSpan={4}></th>
                {sections.map((s) => (
                  <th key={s.title} className={`${th} text-center`} colSpan={s.items.length}>{s.title}</th>
                ))}
                <th className={th} colSpan={3}></th>
              </tr>
            )}
            <tr>
              <th className={th}>日・序</th>
              <th className={th}>報名人／評審</th>
              <th className={th}>狀態</th>
              <th className={th}>不上場</th>
              {items.map((i) => (
                <th key={i.key} className={`${th} text-right`}>{i.label.split(' ')[0]}<span className="font-normal text-zinc-400">/{i.max}</span></th>
              ))}
              <th className={`${th} text-right`}>總分</th>
              <th className={th}>備註</th>
              <th className={th}>最後修改</th>
            </tr>
          </thead>
          {performances.length === 0 && (
            <tbody><tr><td colSpan={items.length + 7} className="p-4 text-zinc-500">沒有符合條件的表演</td></tr></tbody>
          )}
          {performances.map((p) => {
            const st = stats.get(p.id)!;
            const list = (scoresByPerf.get(p.id) ?? []).slice().sort((a, b) => name(a.judgeUid).localeCompare(name(b.judgeUid)));
            return (
              <tbody key={p.id} className="border-t-2 border-zinc-200 dark:border-zinc-700">
                <tr className={`bg-zinc-50 dark:bg-zinc-900/60 ${p.active ? '' : 'opacity-50'}`}>
                  <td className={`${td} font-medium num`}>{p.day}-{p.order}</td>
                  <td className={`${td} font-medium`} colSpan={3}>
                    {p.bandName} <span className="font-normal text-zinc-500">{p.song}</span>
                  </td>
                  <td className={`${td} text-right text-xs text-zinc-500`} colSpan={items.length}>
                    有效評分 {st.validCount} 份
                  </td>
                  <td className={`${td} text-right font-semibold num`}>
                    {st.average === null ? <span className="text-xs font-normal text-zinc-400">尚無有效成績</span> : st.average.toFixed(3)}
                  </td>
                  <td className={td} colSpan={2}>{st.rank !== null && <span className="text-xs">排名 {st.rank}</span>}</td>
                </tr>
                {list.length === 0 && (
                  <tr><td></td><td colSpan={items.length + 6} className={`${td} text-xs text-zinc-400`}>尚無評審評分</td></tr>
                )}
                {list.map((s) => {
                  const valid = isValidScore(p, s);
                  return (
                    <tr
                      key={s.id}
                      tabIndex={0}
                      onClick={() => onEdit(s)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onEdit(s))}
                      className="cursor-pointer border-t border-zinc-100 hover:bg-indigo-50 focus:bg-indigo-50 dark:border-zinc-800 dark:hover:bg-indigo-950/40 dark:focus:bg-indigo-950/40"
                      aria-label={`修改 ${name(s.judgeUid)} 對 ${p.bandName} 的評分`}
                    >
                      <td className={td}></td>
                      <td className={`${td} pl-4`}>{name(s.judgeUid)}</td>
                      <td className={td}>
                        {s.status === 'submitted' ? (
                          <span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">完成</span>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">草稿</span>
                        )}
                        {s.lastAuditId && <span className="badge ml-1 bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200" title="管理員修改過">改</span>}
                      </td>
                      <td className={td}>{s.noShow && <span className="badge bg-zinc-200 dark:bg-zinc-700">不上場</span>}</td>
                      {items.map((i) => (
                        <td key={i.key} className={`${td} text-right num`}>{s.items[i.key] ?? <span className="text-zinc-400">—</span>}</td>
                      ))}
                      <td className={`${td} text-right font-medium num ${valid ? '' : 'text-zinc-400 line-through decoration-zinc-400/60'}`} title={valid ? '計入平均' : '不計入平均'}>
                        {totalOf(s.category, s.items)}
                      </td>
                      <td className={`${td} max-w-64 truncate text-xs text-zinc-600 dark:text-zinc-400`} title={s.note}>{s.note}</td>
                      <td className={`${td} text-xs text-zinc-500`}>{s.updatedAt?.toDate?.().toLocaleTimeString('zh-TW', { hour12: false }) ?? '…'}</td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}
