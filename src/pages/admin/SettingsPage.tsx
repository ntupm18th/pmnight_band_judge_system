import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { errorMessage } from '../../lib/errors';
import { getDb } from '../../lib/firebase';

export function SettingsPage() {
  const { profile, settings } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = settings.scoringLocked;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await setDoc(doc(getDb(), 'config/settings'), {
        scoringLocked: !locked,
        updatedBy: profile!.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <section className="card p-5">
        <h2 className="font-semibold">全域評分鎖定</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          鎖定後，所有評審都不能新增或修改評分（離線時存下的變更也會被拒絕）。管理員仍可在總表中改分，但需填寫原因並留下稽核紀錄。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <span
            className={`badge ${locked ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'}`}
          >
            {locked ? '已鎖定' : '開放評分中'}
          </span>
          <button className={locked ? 'btn-primary' : 'btn-danger'} onClick={toggle} disabled={busy}>
            {busy ? '處理中…' : locked ? '解除鎖定' : '鎖定評分'}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}
