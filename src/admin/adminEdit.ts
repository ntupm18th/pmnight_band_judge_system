import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { contentOf, type ScoreContent } from '../hooks/useMyScores';
import { deviceId } from '../lib/device';
import { getDb } from '../lib/firebase';
import type { Score } from '../lib/types';

/**
 * 管理員修改評審的評分：評分與稽核紀錄在同一個批次寫入，
 * 資料庫規則會檢查稽核紀錄的修改前／後內容與實際修改一致。
 */
export async function adminEditScore(adminUid: string, score: Score, next: ScoreContent, reason: string) {
  const db = getDb();
  const auditRef = doc(collection(db, 'auditLogs'));
  const batch = writeBatch(db);
  batch.set(doc(db, 'scores', score.id), {
    performanceId: score.performanceId,
    judgeUid: score.judgeUid,
    category: score.category,
    ...next,
    rev: score.rev + 1,
    updatedAt: serverTimestamp(),
    updatedBy: adminUid,
    deviceId: deviceId(),
    lastAuditId: auditRef.id,
  });
  batch.set(auditRef, {
    actorUid: adminUid,
    scoreId: score.id,
    judgeUid: score.judgeUid,
    performanceId: score.performanceId,
    before: contentOf(score),
    after: next,
    reason: reason.trim(),
    at: serverTimestamp(),
  });
  await batch.commit();
}
