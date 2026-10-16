import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ScoreSlider } from '../../components/ScoreSlider';
import { SyncBadge, SyncDot } from '../../components/SyncBadge';
import { contentOf, useMyScores, type ScoreContent, type SyncState } from '../../hooks/useMyScores';
import { useOnline } from '../../hooks/useOnline';
import { usePerformances } from '../../hooks/usePerformances';
import { DAY_LABELS, defaultDay } from '../../lib/days';
import { CATEGORY_LABEL, RUBRICS, emptyItems, filledCount, isComplete, rubricItems, totalOf } from '../../lib/rubric';
import type { Category, Day, Performance, Score } from '../../lib/types';

type StatusFilter = 'all' | 'todo' | 'draft' | 'done' | 'noShow';

function myStatus(score: Score | undefined): { key: Exclude<StatusFilter, 'all'>; label: string; cls: string } {
  if (score?.noShow) return { key: 'noShow', label: '不上場', cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200' };
  if (score?.status === 'submitted') return { key: 'done', label: '已完成', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' };
  if (score) return { key: 'draft', label: '草稿', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' };
  return { key: 'todo', label: '未評分', cls: 'text-zinc-500' };
}

export function JudgePage() {
  const { profile, settings } = useAuth();
  const online = useOnline();
  const { performances, error } = usePerformances();
  const my = useMyScores(profile!.uid, online, settings.scoringLocked);
  const { performanceId } = useParams();

  const current = performances?.find((p) => p.id === performanceId);

  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!performances || !my.loaded) return <p className="text-zinc-500">載入中…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
      <div className={performanceId ? 'hidden lg:block' : ''}>
        <PerformanceList performances={performances} scores={my.scores} syncStateOf={my.syncStateOf} unsynced={my.unsyncedCount} failures={my.failures.length} online={online} />
      </div>
      <div className={performanceId ? '' : 'hidden lg:block'}>
        {current ? (
          <ScoreEditor
            key={current.id}
            perf={current}
            performances={performances}
            score={my.scores.get(current.id)}
            sync={my.syncStateOf(current.id)}
            failureMessage={my.journal[`${current.id}_${profile!.uid}`]?.error}
            locked={settings.scoringLocked}
            save={my.save}
            retry={() => my.retry(current)}
            discard={() => my.discard(current)}
            scores={my.scores}
          />
        ) : performanceId ? (
          <div className="card p-6 text-sm">
            找不到這組表演，可能已被刪除。<Link className="text-indigo-700 dark:text-indigo-300 underline" to="/judge">回到清單</Link>
          </div>
        ) : (
          <div className="card hidden p-6 text-sm text-zinc-500 lg:block">從左側清單選擇一組表演開始評分。</div>
        )}
      </div>
    </div>
  );
}

// ───────── 表演清單 ─────────

const DAY_KEY = 'pm.judge.day';

function PerformanceList({
  performances,
  scores,
  syncStateOf,
  unsynced,
  failures,
  online,
}: {
  performances: Performance[];
  scores: Map<string, Score>;
  syncStateOf: (id: string) => SyncState;
  unsynced: number;
  failures: number;
  online: boolean;
}) {
  const { performanceId } = useParams();
  const [day, setDay] = useState<Day>(() => {
    try {
      const v = sessionStorage.getItem(DAY_KEY);
      if (v === '1' || v === '2') return Number(v) as Day;
    } catch {
      // ignore
    }
    return defaultDay();
  });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(DAY_KEY, String(day));
    } catch {
      // ignore
    }
  }, [day]);

  // 切換到其他天的表演時，清單跟著切換
  useEffect(() => {
    const p = performances.find((x) => x.id === performanceId);
    if (p && p.day !== day) setDay(p.day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performanceId]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [performanceId]);

  const q = search.trim().toLowerCase();
  const searching = q !== '';
  const list = performances.filter(
    (p) =>
      (searching || p.day === day) &&
      (category === 'all' || p.category === category) &&
      (status === 'all' || myStatus(scores.get(p.id)).key === status) &&
      (!searching ||
        p.bandName.toLowerCase().includes(q) ||
        p.song.toLowerCase().includes(q) ||
        String(p.order) === q),
  );
  const dayList = performances.filter((p) => p.day === day && p.active);
  const doneCount = dayList.filter((p) => scores.get(p.id)?.status === 'submitted' || scores.get(p.id)?.noShow).length;

  return (
    <section className="card flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden lg:sticky lg:top-20" aria-label="表演清單">
      <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <div role="tablist" aria-label="活動日期" className="grid grid-cols-2 gap-1 rounded-[10px] bg-zinc-100 p-1 dark:bg-zinc-950/70">
          {([1, 2] as Day[]).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={day === d && !searching}
              onClick={() => setDay(d)}
              className={`rounded-md py-1.5 text-sm font-medium transition-colors duration-150 ${day === d && !searching ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
            >
              第 {d} 天 {DAY_LABELS[d]}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="input"
          placeholder="搜尋報名人、曲目或順序（搜尋兩天）"
          aria-label="搜尋表演"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2">
          <select className="input" aria-label="組別篩選" value={category} onChange={(e) => setCategory(e.target.value as 'all' | Category)}>
            <option value="all">全部組別</option>
            <option value="vocal">{CATEGORY_LABEL.vocal}</option>
            <option value="band">{CATEGORY_LABEL.band}</option>
          </select>
          <select className="input" aria-label="狀態篩選" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="all">全部狀態</option>
            <option value="todo">未評分</option>
            <option value="draft">草稿</option>
            <option value="done">已完成</option>
            <option value="noShow">不上場</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span>第 {day} 天進度：{doneCount} / {dayList.length}</span>
          {unsynced > 0 && (
            <span className={online ? 'text-sky-600' : 'text-amber-600'}>
              {online ? `${unsynced} 筆同步中` : `${unsynced} 筆尚未同步（離線）`}
            </span>
          )}
          {failures > 0 && <span className="font-medium text-red-600">{failures} 筆同步失敗</span>}
        </div>
      </div>

      <ol className="flex-1 overflow-y-auto">
        {list.length === 0 && <li className="p-4 text-sm text-zinc-500">沒有符合條件的表演</li>}
        {list.map((p) => {
          const st = myStatus(scores.get(p.id));
          const active = p.id === performanceId;
          return (
            <li key={p.id}>
              <Link
                ref={active ? activeRef : undefined}
                to={`/judge/${p.id}`}
                aria-current={active ? 'true' : undefined}
                className={`flex items-center gap-3 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800 ${active ? 'bg-indigo-50 dark:bg-indigo-950/50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'} ${p.active ? '' : 'opacity-50'}`}
              >
                <span className={`num w-8 shrink-0 text-center text-lg font-bold ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-400'}`}>{String(p.order).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.bandName}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {searching && `第 ${p.day} 天・`}
                    {p.startTime && `${p.startTime}・`}
                    {CATEGORY_LABEL[p.category]}・{p.song || '（無曲目）'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <SyncDot state={syncStateOf(p.id)} />
                  {!p.active ? (
                    <span className="badge text-zinc-500">已停用</span>
                  ) : (
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ───────── 評分編輯 ─────────

function ScoreEditor({
  perf,
  performances,
  score,
  scores,
  sync,
  failureMessage,
  locked,
  save,
  retry,
  discard,
}: {
  perf: Performance;
  performances: Performance[];
  score: Score | undefined;
  scores: Map<string, Score>;
  sync: SyncState;
  failureMessage?: string;
  locked: boolean;
  save: (perf: Performance, patch: Partial<ScoreContent>, base?: ScoreContent) => ScoreContent;
  retry: () => void;
  discard: () => void;
}) {
  const navigate = useNavigate();
  const category = score?.category ?? perf.category;
  const initial = (): ScoreContent =>
    score ? contentOf(score) : { items: emptyItems(category), status: 'draft', noShow: false, note: '' };
  const [draft, setDraft] = useState<ScoreContent>(initial);
  // draftRef 永遠是最新內容，避免在 state updater 裡做寫入（StrictMode 會執行兩次）
  const draftRef = useRef(draft);
  const dirty = useRef(false);
  const noteTimer = useRef<number | undefined>(undefined);

  const setD = (next: ScoreContent) => {
    draftRef.current = next;
    setDraft(next);
  };

  // 其他裝置或管理員修改時，若本機沒有正在編輯的內容就跟著更新
  useEffect(() => {
    if (!dirty.current && score) setD(contentOf(score));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score?.rev]);

  const disabled = locked || !perf.active;
  const complete = isComplete(category, draft.items);
  const total = totalOf(category, draft.items);
  const items = rubricItems(category);
  const filled = filledCount(category, draft.items);

  function commit(patch: Partial<ScoreContent>) {
    if (disabled) return;
    const base = draftRef.current;
    setD({ ...base, ...patch });
    save(perf, patch, base);
    dirty.current = false;
  }

  function changeItem(key: string, v: number) {
    dirty.current = true;
    setD({ ...draftRef.current, items: { ...draftRef.current.items, [key]: v } });
  }

  function commitItem(key: string, v: number) {
    commit({ items: { ...draftRef.current.items, [key]: v } });
  }

  function changeNote(note: string) {
    dirty.current = true;
    setD({ ...draftRef.current, note });
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(flushNote, 1500);
  }

  function flushNote() {
    window.clearTimeout(noteTimer.current);
    if (!dirty.current || disabled) return;
    const d = draftRef.current;
    if (!score || d.note !== score.note) save(perf, { note: d.note }, d);
    dirty.current = false;
  }

  // 離開這組表演（例如點清單上的其他組）時，把還沒存的備註存起來
  const flushRef = useRef(flushNote);
  flushRef.current = flushNote;
  useEffect(() => () => flushRef.current(), []);

  // 上一組／下一組：依日期與順序，跳過停用的表演
  const ordered = performances.filter((p) => p.active || p.id === perf.id);
  const idx = ordered.findIndex((p) => p.id === perf.id);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx < ordered.length - 1 ? ordered[idx + 1] : null;
  const nextTodo =
    ordered.slice(idx + 1).find((p) => !scores.get(p.id) || (scores.get(p.id)!.status !== 'submitted' && !scores.get(p.id)!.noShow)) ??
    null;

  function go(p: Performance | null) {
    if (!p) return;
    flushNote();
    navigate(`/judge/${p.id}`);
  }

  return (
    <article className="space-y-3" aria-labelledby="perf-title">
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Link to="/judge" className="btn-ghost -ml-3 lg:hidden">‹ 清單</Link>
          <SyncBadge state={sync} />
        </div>
        <p className="text-sm text-zinc-500">
          第 {perf.day} 天 {DAY_LABELS[perf.day]}・第 {perf.order} 組{perf.startTime && `・${perf.startTime}`}・
          <span className={perf.category === 'band' ? 'text-violet-600 dark:text-violet-400' : 'text-sky-600 dark:text-sky-400'}>
            {CATEGORY_LABEL[perf.category]}
          </span>
        </p>
        <h1 id="perf-title" className="mt-1 text-2xl font-bold tracking-tight">{perf.bandName}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{perf.song || '（無曲目）'}</p>
      </div>

      {locked && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          評分已被管理員鎖定，目前無法修改。
        </p>
      )}
      {!perf.active && (
        <p className="rounded-lg bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-800">此表演已被管理員停用，無法評分。</p>
      )}
      {sync === 'failed' && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <p className="font-medium">{failureMessage ?? '同步失敗'}</p>
          <p className="mt-1">畫面上顯示的是伺服器目前的版本。你可以重新送出你在此裝置上的修改，或放棄它。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={retry} disabled={locked}>重新送出我的修改</button>
            <button className="btn-secondary" onClick={discard}>放棄我的修改</button>
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="sticky top-[3.25rem] z-10 -mx-4 -mt-4 mb-2 flex items-center justify-between rounded-t-[14px] border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-white/[0.07] dark:bg-zinc-900/95">
          <span className="text-sm text-zinc-500">已填 {filled} / {items.length} 項</span>
          <span className="num" aria-live="polite">
            <span className="font-sans text-sm text-zinc-500">總分 </span>
            <span className="text-4xl font-bold text-indigo-700 dark:text-indigo-400">{total}</span>
            <span className="text-zinc-500"> / 100</span>
          </span>
        </div>

        {RUBRICS[category].sections.map((section) => (
          <fieldset key={section.title ?? 'main'} className="mt-1" disabled={disabled}>
            {section.title && (
              <legend className="mt-2 text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                {section.title}（{section.items.reduce((s, i) => s + i.max, 0)} 分）
              </legend>
            )}
            {section.items.map((item) => (
              <ScoreSlider
                key={item.key}
                label={item.label}
                max={item.max}
                value={draft.items[item.key] ?? null}
                disabled={disabled}
                onChange={(v) => changeItem(item.key, v)}
                onCommit={(v) => commitItem(item.key, v)}
              />
            ))}
          </fieldset>
        ))}

        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {draft.status === 'submitted' ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              ✓ 已完成評分。之後的修改會自動儲存，並維持「已完成」狀態。
            </p>
          ) : (
            <>
              <button className="btn-primary w-full py-3 text-base" disabled={disabled || !complete} onClick={() => commit({ status: 'submitted' })}>
                完成評分
              </button>
              {!complete && <p className="mt-1.5 text-center text-xs text-zinc-500">每個項目都填寫後才能完成評分（草稿不列入平均）</p>}
            </>
          )}
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="font-medium">標記不上場</span>
            <span className="block text-xs text-zinc-500">只影響你自己的評分；已輸入的分數會保留，但不列入平均</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="size-6 shrink-0 accent-red-600"
            checked={draft.noShow}
            disabled={disabled}
            onChange={(e) => commit({ noShow: e.target.checked })}
          />
        </label>
        <div>
          <label htmlFor="note" className="label">備註（只有你和管理員看得到）</label>
          <textarea
            id="note"
            className="input min-h-24 py-2"
            maxLength={2000}
            value={draft.note}
            disabled={disabled}
            onChange={(e) => changeNote(e.target.value)}
            onBlur={flushNote}
          />
        </div>
      </div>

      <nav className="grid grid-cols-3 gap-2 pb-6" aria-label="切換表演">
        <button className="btn-secondary" disabled={!prev} onClick={() => go(prev)}>‹ 上一組</button>
        <button className="btn-secondary" disabled={!nextTodo} onClick={() => go(nextTodo)}>下個未完成</button>
        <button className="btn-primary" disabled={!next} onClick={() => go(next)}>下一組 ›</button>
      </nav>
    </article>
  );
}
