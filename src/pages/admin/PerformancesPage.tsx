import { collection, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { useAdminData } from '../../admin/AdminData';
import { useAuth } from '../../auth/AuthContext';
import { DAY_LABELS } from '../../lib/days';
import { errorMessage } from '../../lib/errors';
import { getDb } from '../../lib/firebase';
import { parsePerformanceRows, type ParseResult } from '../../lib/importParse';
import { CATEGORY_LABEL } from '../../lib/rubric';
import type { Category, Day, Performance } from '../../lib/types';

type Editable = Pick<Performance, 'order' | 'startTime' | 'bandName' | 'song' | 'category' | 'active' | 'deleted' | 'day'>;

function useWriter() {
  const { profile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  async function patch(id: string, data: Partial<Editable>) {
    setError(null);
    try {
      await updateDoc(doc(getDb(), 'performances', id), { ...data, updatedAt: serverTimestamp(), updatedBy: profile!.uid });
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return { patch, error, setError, uid: profile!.uid };
}

export function PerformancesPage() {
  const { allPerformances, scores, error } = useAdminData();
  const [day, setDay] = useState<Day>(1);
  const [showDeleted, setShowDeleted] = useState(false);
  const writer = useWriter();

  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!allPerformances || !scores) return <p className="text-zinc-500">載入中…</p>;

  const scoreCount = new Map<string, number>();
  for (const s of scores) scoreCount.set(s.performanceId, (scoreCount.get(s.performanceId) ?? 0) + 1);
  const list = allPerformances.filter((p) => p.day === day && !p.deleted);
  const deleted = allPerformances.filter((p) => p.deleted);

  async function move(index: number, delta: number) {
    const a = list[index];
    const b = list[index + delta];
    if (!a || !b) return;
    const batch = writeBatch(getDb());
    const meta = { updatedAt: serverTimestamp(), updatedBy: writer.uid };
    // 順序相同時也要能交換
    const [oa, ob] = a.order === b.order ? [b.order + delta, a.order] : [b.order, a.order];
    batch.update(doc(getDb(), 'performances', a.id), { order: oa, ...meta });
    batch.update(doc(getDb(), 'performances', b.id), { order: ob, ...meta });
    try {
      await batch.commit();
    } catch (e) {
      writer.setError(errorMessage(e));
    }
  }

  async function renumber() {
    const batch = writeBatch(getDb());
    let n = 0;
    list.forEach((p, i) => {
      if (p.order !== i + 1) {
        batch.update(doc(getDb(), 'performances', p.id), { order: i + 1, updatedAt: serverTimestamp(), updatedBy: writer.uid });
        n++;
      }
    });
    if (!n) return;
    try {
      await batch.commit();
    } catch (e) {
      writer.setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="活動日期" className="flex rounded-lg border border-zinc-300 p-0.5 text-sm dark:border-zinc-700">
          {([1, 2] as Day[]).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={day === d}
              onClick={() => setDay(d)}
              className={`rounded-md px-3 py-1.5 ${day === d ? 'bg-accent font-semibold text-accent-ink' : 'text-zinc-600 dark:text-zinc-300'}`}
            >
              第 {d} 天 {DAY_LABELS[d]}（{allPerformances.filter((p) => p.day === d && !p.deleted).length}）
            </button>
          ))}
        </div>
        <button className="btn-secondary" onClick={renumber} title="依目前排列重新編為 1、2、3…">
          重新編號
        </button>
        <span className="text-xs text-zinc-500">調整順序或改名不會影響已輸入的評分（評分綁定在表演的固定 ID 上）。</span>
      </div>
      {writer.error && <p role="alert" className="text-sm text-red-600">{writer.error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <tr>
              <th className="px-2 py-2 font-medium">順序</th>
              <th className="px-2 py-2 font-medium">時間</th>
              <th className="px-2 py-2 font-medium">報名人／團名</th>
              <th className="px-2 py-2 font-medium">曲目</th>
              <th className="px-2 py-2 font-medium">組別</th>
              <th className="px-2 py-2 text-center font-medium">評分數</th>
              <th className="px-2 py-2 text-center font-medium">啟用</th>
              <th className="px-2 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-zinc-500">這一天還沒有表演</td></tr>
            )}
            {list.map((p, i) => (
              <PerformanceRow
                key={p.id}
                perf={p}
                scoreCount={scoreCount.get(p.id) ?? 0}
                onPatch={(d) => writer.patch(p.id, d)}
                onUp={i > 0 ? () => move(i, -1) : undefined}
                onDown={i < list.length - 1 ? () => move(i, 1) : undefined}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AddPerformanceForm day={day} nextOrder={(list.at(-1)?.order ?? 0) + 1} />
        <ImportPanel />
      </div>

      <section className="card p-4">
        <button className="text-sm font-medium" onClick={() => setShowDeleted((v) => !v)} aria-expanded={showDeleted}>
          {showDeleted ? '▾' : '▸'} 已刪除的表演（{deleted.length}）
        </button>
        {showDeleted && (
          <ul className="mt-2 space-y-1 text-sm">
            {deleted.length === 0 && <li className="text-zinc-500">沒有</li>}
            {deleted.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="text-zinc-500">第 {p.day} 天 #{p.order}</span> {p.bandName}
                <span className="text-xs text-zinc-500">（評分 {scoreCount.get(p.id) ?? 0} 份，已保留）</span>
                <button className="btn-ghost min-h-8 text-indigo-700 dark:text-indigo-300" onClick={() => writer.patch(p.id, { deleted: false })}>還原</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PerformanceRow({
  perf,
  scoreCount,
  onPatch,
  onUp,
  onDown,
}: {
  perf: Performance;
  scoreCount: number;
  onPatch: (d: Partial<Editable>) => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cell = 'px-2 py-1';

  return (
    <tr className={`border-t border-zinc-100 dark:border-zinc-800 ${perf.active ? '' : 'opacity-60'}`}>
      <td className={cell}>
        <InlineInput className="w-16 num" type="number" value={String(perf.order)} label="順序"
          onSave={(v) => Number.isInteger(Number(v)) && Number(v) >= 0 && onPatch({ order: Number(v) })} />
      </td>
      <td className={cell}>
        <InlineInput className="w-20 num" value={perf.startTime} label="時間" onSave={(v) => onPatch({ startTime: v.slice(0, 20) })} />
      </td>
      <td className={cell}>
        <InlineInput className="min-w-56" value={perf.bandName} label="報名人" onSave={(v) => v.trim() && onPatch({ bandName: v.trim().slice(0, 100) })} />
      </td>
      <td className={cell}>
        <InlineInput className="min-w-44" value={perf.song} label="曲目" onSave={(v) => onPatch({ song: v.trim().slice(0, 200) })} />
      </td>
      <td className={cell}>
        <select
          className="input min-h-8 w-auto"
          aria-label={`${perf.bandName} 組別`}
          value={perf.category}
          disabled={scoreCount > 0}
          title={scoreCount > 0 ? '已有評分，不能更改組別' : undefined}
          onChange={(e) => onPatch({ category: e.target.value as Category })}
        >
          <option value="vocal">{CATEGORY_LABEL.vocal}</option>
          <option value="band">{CATEGORY_LABEL.band}</option>
        </select>
      </td>
      <td className={`${cell} text-center num`}>{scoreCount}</td>
      <td className={`${cell} text-center`}>
        <input type="checkbox" className="size-4" aria-label={`${perf.bandName} 啟用`} checked={perf.active} onChange={(e) => onPatch({ active: e.target.checked })} />
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        <button className="btn-ghost min-h-8 px-2" onClick={onUp} disabled={!onUp} aria-label="上移">↑</button>
        <button className="btn-ghost min-h-8 px-2" onClick={onDown} disabled={!onDown} aria-label="下移">↓</button>
        <select className="input ml-1 min-h-8 w-auto" aria-label="移到另一天" value={perf.day} onChange={(e) => onPatch({ day: Number(e.target.value) as Day })}>
          <option value={1}>第1天</option>
          <option value={2}>第2天</option>
        </select>
        {confirmDelete ? (
          <span className="ml-1">
            <button className="btn-danger min-h-8 px-2" onClick={() => onPatch({ deleted: true })}>確定刪除</button>
            <button className="btn-ghost min-h-8 px-2" onClick={() => setConfirmDelete(false)}>取消</button>
          </span>
        ) : (
          <button className="btn-ghost ml-1 min-h-8 px-2 text-red-600" onClick={() => setConfirmDelete(true)}>刪除</button>
        )}
      </td>
    </tr>
  );
}

function InlineInput({ value, onSave, label, className = '', type = 'text' }: { value: string; onSave: (v: string) => void; label: string; className?: string; type?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      type={type}
      className={`input min-h-8 ${className}`}
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setV(value);
      }}
    />
  );
}

function AddPerformanceForm({ day, nextOrder }: { day: Day; nextOrder: number }) {
  const { profile } = useAuth();
  const [bandName, setBandName] = useState('');
  const [song, setSong] = useState('');
  const [startTime, setStartTime] = useState('');
  const [category, setCategory] = useState<Category>('vocal');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const ref = doc(collection(getDb(), 'performances'));
      const batch = writeBatch(getDb());
      batch.set(ref, {
        day, order: nextOrder, startTime: startTime.trim(), bandName: bandName.trim(), song: song.trim(), category,
        active: true, deleted: false, updatedAt: serverTimestamp(), updatedBy: profile!.uid,
      });
      await batch.commit();
      setMsg({ ok: true, text: `已新增到第 ${day} 天第 ${nextOrder} 組` });
      setBandName('');
      setSong('');
      setStartTime('');
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <h2 className="font-semibold">新增表演到第 {day} 天</h2>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <input className="input" placeholder="報名人／團名" aria-label="報名人" required maxLength={100} value={bandName} onChange={(e) => setBandName(e.target.value)} />
        <input className="input" placeholder="時間" aria-label="時間" maxLength={20} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </div>
      <div className="grid grid-cols-[1fr_8rem] gap-2">
        <input className="input" placeholder="曲目" aria-label="曲目" maxLength={200} value={song} onChange={(e) => setSong(e.target.value)} />
        <select className="input" aria-label="組別" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          <option value="vocal">{CATEGORY_LABEL.vocal}</option>
          <option value="band">{CATEGORY_LABEL.band}</option>
        </select>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}
      <button className="btn-primary" disabled={busy || !bandName.trim()}>{busy ? '新增中…' : `新增為第 ${nextOrder} 組`}</button>
    </form>
  );
}

function ImportPanel() {
  const { profile } = useAuth();
  const { allPerformances } = useAdminData();
  const [file, setFile] = useState<{ name: string; sheets: string[]; data: ArrayBuffer } | null>(null);
  const [sheet, setSheet] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function parse(data: ArrayBuffer, sheetName: string) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(data);
    const ws = wb.Sheets[sheetName];
    setResult(parsePerformanceRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })));
  }

  async function onFile(f: File | undefined) {
    setMsg(null);
    setResult(null);
    if (!f) return setFile(null);
    try {
      const XLSX = await import('xlsx');
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data);
      setFile({ name: f.name, sheets: wb.SheetNames, data });
      setSheet(wb.SheetNames[0]);
      await parse(data, wb.SheetNames[0]);
    } catch (e) {
      setMsg({ ok: false, text: `無法讀取檔案：${errorMessage(e)}` });
    }
  }

  const existingKeys = new Set((allPerformances ?? []).filter((p) => !p.deleted).map((p) => `${p.day}|${p.bandName}|${p.song}`));
  const fresh = result?.rows.filter((r) => !existingKeys.has(`${r.day}|${r.bandName}|${r.song}`)) ?? [];
  const dupCount = (result?.rows.length ?? 0) - fresh.length;

  async function doImport() {
    if (!fresh.length) return;
    setBusy(true);
    setMsg(null);
    try {
      // 附加在各天現有表演之後
      const base: Record<number, number> = { 1: 0, 2: 0 };
      for (const p of allPerformances ?? []) if (!p.deleted) base[p.day] = Math.max(base[p.day], p.order);
      const hasExisting = (d: number) => base[d] > 0;
      for (let i = 0; i < fresh.length; i += 400) {
        const batch = writeBatch(getDb());
        for (const r of fresh.slice(i, i + 400)) {
          batch.set(doc(collection(getDb(), 'performances')), {
            day: r.day,
            order: hasExisting(r.day) ? base[r.day] + r.order : r.order,
            startTime: r.startTime,
            bandName: r.bandName,
            song: r.song,
            category: r.category,
            active: true,
            deleted: false,
            updatedAt: serverTimestamp(),
            updatedBy: profile!.uid,
          });
        }
        await batch.commit();
      }
      setMsg({ ok: true, text: `已匯入 ${fresh.length} 組${dupCount ? `，略過 ${dupCount} 組重複` : ''}` });
      setResult(null);
      setFile(null);
    } catch (e) {
      setMsg({ ok: false, text: `匯入失敗：${errorMessage(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">匯入 CSV／XLSX</h2>
      <p className="text-xs text-zinc-500">
        需要「組別」與「報名人／團名」欄位；可辨識「順序、日期、開始、曲目」。「緩衝」列會略過，第一個日期為第 1 天。已存在的相同表演（同一天、同名、同曲目）不會重複匯入。
      </p>
      <input type="file" accept=".xlsx,.xls,.csv" className="block w-full text-sm" aria-label="選擇檔案" onChange={(e) => onFile(e.target.files?.[0])} />
      {file && file.sheets.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          工作表
          <select className="input w-auto" value={sheet} onChange={(e) => { setSheet(e.target.value); parse(file.data, e.target.value); }}>
            {file.sheets.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      )}
      {result && (
        <div className="space-y-2 text-sm">
          {([1, 2] as Day[]).map((d) => {
            const rows = result.rows.filter((r) => r.day === d);
            if (!rows.length) return null;
            const v = rows.filter((r) => r.category === 'vocal').length;
            return (
              <p key={d}>第 {d} 天（{rows[0].dateLabel}）：{rows.length} 組（主唱 {v}、樂團 {rows.length - v}）</p>
            );
          })}
          {result.warnings.map((w) => <p key={w} className="text-amber-700 dark:text-amber-300">⚠ {w}</p>)}
          {result.errors.map((e) => <p key={e} className="text-red-600">✕ {e}</p>)}
          {dupCount > 0 && <p className="text-zinc-500">其中 {dupCount} 組已存在，將略過。</p>}
          <button className="btn-primary" onClick={doImport} disabled={busy || result.errors.length > 0 || fresh.length === 0}>
            {busy ? '匯入中…' : `匯入 ${fresh.length} 組`}
          </button>
        </div>
      )}
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}
    </section>
  );
}
