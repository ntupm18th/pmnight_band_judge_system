import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

const VOCAL_EMPTY = { pitch: null, rhythm: null, expression: null };
const VOCAL_FULL = { pitch: 35, rhythm: 25, expression: 28 };
const BAND_FULL = { vPitch: 12, vRhythm: 13, vExpression: 14, iAccuracy: 20, iRhythm: 18, iTone: 9 };

function user(username: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    username,
    displayName: username,
    isAdmin: false,
    isJudge: true,
    active: true,
    createdAt: Timestamp.now(),
    ...extra,
  };
}

function perf(extra: Partial<Record<string, unknown>> = {}) {
  return {
    day: 1,
    order: 1,
    startTime: '18:00',
    bandName: '測試團',
    song: '測試歌',
    category: 'vocal',
    active: true,
    deleted: false,
    updatedAt: Timestamp.now(),
    updatedBy: 'admin1',
    ...extra,
  };
}

function score(uid: string, performanceId: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    performanceId,
    judgeUid: uid,
    category: 'vocal',
    items: VOCAL_EMPTY,
    status: 'draft',
    noShow: false,
    note: '',
    rev: 1,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    deviceId: 'dev-1',
    lastAuditId: null,
    ...extra,
  };
}

function db(uid: string | null): Firestore {
  const ctx = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
  return ctx.firestore() as unknown as Firestore;
}

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, path), data);
  });
}

async function setLocked(locked: boolean) {
  await seed('config/settings', { scoringLocked: locked, updatedBy: 'admin1', updatedAt: Timestamp.now() });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-pmnight-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/admin1', user('admin1', { isAdmin: true, isJudge: false }));
  await seed('users/judge1', user('judge1'));
  await seed('users/judge2', user('judge2'));
  await seed('users/judge3', user('judge3', { active: false }));
  await seed('performances/pV', perf());
  await seed('performances/pB', perf({ category: 'band', order: 2 }));
  await seed('performances/pOff', perf({ active: false, order: 3 }));
  await setLocked(false);
});

describe('users', () => {
  it('評審只能讀自己的使用者資料', async () => {
    await assertSucceeds(getDoc(doc(db('judge1'), 'users/judge1')));
    await assertFails(getDoc(doc(db('judge1'), 'users/judge2')));
  });

  it('未登入或沒有 users 文件的人無法讀取任何資料', async () => {
    await assertFails(getDoc(doc(db(null), 'performances/pV')));
    await assertFails(getDoc(doc(db('stranger'), 'performances/pV')));
  });

  it('評審不能提升自己的權限', async () => {
    await assertFails(updateDoc(doc(db('judge1'), 'users/judge1'), { isAdmin: true }));
  });

  it('管理員可以新增帳號，欄位格式錯誤則拒絕', async () => {
    await assertSucceeds(setDoc(doc(db('admin1'), 'users/new1'), user('new1')));
    await assertFails(setDoc(doc(db('admin1'), 'users/new2'), { ...user('new2'), role: 'god' }));
    await assertFails(setDoc(doc(db('admin1'), 'users/new3'), user('Bad Name!')));
  });

  it('管理員可以停用評審，但不能停用自己或拔掉自己的管理員權限', async () => {
    await assertSucceeds(updateDoc(doc(db('admin1'), 'users/judge1'), { active: false }));
    await assertFails(updateDoc(doc(db('admin1'), 'users/admin1'), { active: false }));
    await assertFails(updateDoc(doc(db('admin1'), 'users/admin1'), { isAdmin: false }));
    await assertSucceeds(updateDoc(doc(db('admin1'), 'users/admin1'), { isJudge: true }));
  });

  it('帳號名稱不可修改、使用者不可刪除', async () => {
    await assertFails(updateDoc(doc(db('admin1'), 'users/judge1'), { username: 'other' }));
    await assertFails(deleteDoc(doc(db('admin1'), 'users/judge1')));
  });
});

describe('performances', () => {
  it('評審可以讀取，不能寫入', async () => {
    await assertSucceeds(getDoc(doc(db('judge1'), 'performances/pV')));
    await assertFails(updateDoc(doc(db('judge1'), 'performances/pV'), { bandName: 'x' }));
  });

  it('停用的評審無法讀取', async () => {
    await assertFails(getDoc(doc(db('judge3'), 'performances/pV')));
  });

  it('管理員可以新增與修改，格式錯誤或硬刪除會被拒絕', async () => {
    const admin = db('admin1');
    const valid = { ...perf(), updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(admin, 'performances/pNew'), valid));
    await assertFails(setDoc(doc(admin, 'performances/pBad'), { ...valid, category: 'rap' }));
    await assertFails(setDoc(doc(admin, 'performances/pBad2'), { ...valid, day: 3 }));
    await assertFails(setDoc(doc(admin, 'performances/pBad3'), { ...valid, updatedBy: 'judge1' }));
    await assertFails(deleteDoc(doc(admin, 'performances/pV')));
  });
});

describe('scores：評審寫入', () => {
  it('可以建立自己的草稿（未填項目為 null）', async () => {
    await assertSucceeds(setDoc(doc(db('judge1'), 'scores/pV_judge1'), score('judge1', 'pV')));
  });

  it('文件 ID 錯誤或替別人評分會被拒絕', async () => {
    await assertFails(setDoc(doc(db('judge1'), 'scores/pV_judge2'), score('judge2', 'pV')));
    await assertFails(setDoc(doc(db('judge1'), 'scores/pV_judge2'), score('judge1', 'pV')));
    await assertFails(setDoc(doc(db('judge1'), 'scores/random'), score('judge1', 'pV')));
  });

  it('分數必須是範圍內的整數', async () => {
    const d = db('judge1');
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { items: { ...VOCAL_EMPTY, pitch: 41 } })));
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { items: { ...VOCAL_EMPTY, pitch: -1 } })));
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { items: { ...VOCAL_EMPTY, pitch: 3.5 } })));
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { items: { ...VOCAL_EMPTY, pitch: '30' } })));
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { items: { ...VOCAL_EMPTY, pitch: 40 } })));
  });

  it('完成評分時每一項都必須填寫', async () => {
    const d = db('judge1');
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', {
      status: 'submitted', items: { ...VOCAL_FULL, expression: null },
    })));
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { status: 'submitted', items: VOCAL_FULL })));
  });

  it('樂團組使用樂團評分項目，類別必須與表演一致', async () => {
    const d = db('judge1');
    await assertFails(setDoc(doc(d, 'scores/pB_judge1'), score('judge1', 'pB', { items: VOCAL_FULL })));
    await assertFails(setDoc(doc(d, 'scores/pB_judge1'), score('judge1', 'pB', { items: BAND_FULL })));
    await assertFails(setDoc(doc(d, 'scores/pB_judge1'), score('judge1', 'pB', {
      category: 'band', items: { ...BAND_FULL, iTone: 11 },
    })));
    await assertSucceeds(setDoc(doc(d, 'scores/pB_judge1'), score('judge1', 'pB', { category: 'band', items: BAND_FULL })));
  });

  it('停用的表演不能評分；停用的評審不能評分；沒有 users 文件的人不能評分', async () => {
    await assertFails(setDoc(doc(db('judge1'), 'scores/pOff_judge1'), score('judge1', 'pOff')));
    await assertFails(setDoc(doc(db('judge3'), 'scores/pV_judge3'), score('judge3', 'pV')));
    await assertFails(setDoc(doc(db('stranger'), 'scores/pV_stranger'), score('stranger', 'pV')));
  });

  it('updatedAt 必須是伺服器時間、updatedBy 必須是本人', async () => {
    const d = db('judge1');
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { updatedAt: Timestamp.now() })));
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { updatedBy: 'admin1' })));
  });

  it('修改時 rev 必須 +1，舊版本寫入會被拒絕（防止多裝置互相覆蓋）', async () => {
    const d = db('judge1');
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV')));
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { rev: 2, note: '裝置 A' })));
    // 裝置 B 仍以為目前是 rev 1
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { rev: 2, note: '裝置 B' })));
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { rev: 5 })));
  });

  it('已完成的評分可以修改，但不能退回草稿', async () => {
    const d = db('judge1');
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { status: 'submitted', items: VOCAL_FULL })));
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', {
      status: 'submitted', items: { ...VOCAL_FULL, pitch: 30 }, rev: 2,
    })));
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { status: 'draft', items: VOCAL_FULL, rev: 3 })));
  });

  it('可以標記不上場並保留分數', async () => {
    const d = db('judge1');
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { status: 'submitted', items: VOCAL_FULL })));
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', {
      status: 'submitted', items: VOCAL_FULL, noShow: true, rev: 2,
    })));
  });

  it('評審不能刪除評分，也不能自行寫入 lastAuditId', async () => {
    const d = db('judge1');
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV')));
    await assertFails(deleteDoc(doc(d, 'scores/pV_judge1')));
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { rev: 2, lastAuditId: 'fake' })));
  });

  it('不能改動評分的表演、評審或類別', async () => {
    const d = db('judge1');
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV')));
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pB', { rev: 2 })));
  });
});

describe('scores：讀取隔離', () => {
  beforeEach(async () => {
    await seed('scores/pV_judge1', { ...score('judge1', 'pV'), updatedAt: Timestamp.now() });
    await seed('scores/pV_judge2', { ...score('judge2', 'pV'), updatedAt: Timestamp.now() });
  });

  it('評審只能讀自己的評分', async () => {
    await assertSucceeds(getDoc(doc(db('judge1'), 'scores/pV_judge1')));
    await assertFails(getDoc(doc(db('judge1'), 'scores/pV_judge2')));
    // 讀取自己尚未建立的評分也允許（回傳不存在）
    await assertSucceeds(getDoc(doc(db('judge1'), 'scores/pB_judge1')));
  });

  it('評審只能用 judgeUid == 自己 的條件查詢', async () => {
    const d = db('judge1');
    const mine = await assertSucceeds(getDocs(query(collection(d, 'scores'), where('judgeUid', '==', 'judge1'))));
    expect(mine.size).toBe(1);
    await assertFails(getDocs(collection(d, 'scores')));
    await assertFails(getDocs(query(collection(d, 'scores'), where('performanceId', '==', 'pV'))));
  });

  it('管理員可以讀取全部評分', async () => {
    const all = await assertSucceeds(getDocs(collection(db('admin1'), 'scores')));
    expect(all.size).toBe(2);
  });
});

describe('全域鎖定', () => {
  it('鎖定時評審不能新增或修改評分，解鎖後恢復', async () => {
    const d = db('judge1');
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV')));
    await setLocked(true);
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { rev: 2 })));
    await assertFails(setDoc(doc(d, 'scores/pB_judge1'), score('judge1', 'pB', { category: 'band', items: BAND_FULL })));
    await setLocked(false);
    await assertSucceeds(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', { rev: 2 })));
  });

  it('只有管理員可以切換鎖定', async () => {
    const data = (uid: string) => ({ scoringLocked: true, updatedBy: uid, updatedAt: serverTimestamp() });
    await assertFails(setDoc(doc(db('judge1'), 'config/settings'), data('judge1')));
    await assertSucceeds(setDoc(doc(db('admin1'), 'config/settings'), data('admin1')));
    await assertSucceeds(getDoc(doc(db('judge1'), 'config/settings')));
  });
});

describe('管理員改分與稽核紀錄', () => {
  beforeEach(async () => {
    await seed('scores/pV_judge1', {
      ...score('judge1', 'pV', { status: 'submitted', items: VOCAL_FULL, note: '原備註' }),
      updatedAt: Timestamp.now(),
    });
  });

  const before = { items: VOCAL_FULL, status: 'submitted', noShow: false, note: '原備註' };
  const newItems = { ...VOCAL_FULL, pitch: 20 };
  const after = { ...before, items: newItems };

  function adminEdit(auditId: string, auditOverrides: Record<string, unknown> = {}, scoreOverrides: Record<string, unknown> = {}) {
    const d = db('admin1');
    const batch = writeBatch(d);
    batch.set(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', {
      status: 'submitted', items: newItems, note: '原備註', rev: 2, updatedBy: 'admin1', lastAuditId: auditId,
      ...scoreOverrides,
    }));
    batch.set(doc(d, `auditLogs/${auditId}`), {
      actorUid: 'admin1', scoreId: 'pV_judge1', judgeUid: 'judge1', performanceId: 'pV',
      before, after, reason: '評審口頭更正', at: serverTimestamp(),
      ...auditOverrides,
    });
    return batch.commit();
  }

  it('沒有稽核紀錄的改分會被拒絕', async () => {
    const d = db('admin1');
    await assertFails(setDoc(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', {
      status: 'submitted', items: newItems, rev: 2, updatedBy: 'admin1', lastAuditId: 'a1',
    })));
  });

  it('改分與稽核紀錄同一批次寫入時成功', async () => {
    await assertSucceeds(adminEdit('a1'));
  });

  it('稽核紀錄內容與實際修改不符時拒絕', async () => {
    await assertFails(adminEdit('a1', { before: { ...before, items: newItems } }));
    await assertFails(adminEdit('a1', { after: before }));
    await assertFails(adminEdit('a1', { reason: ' ' }));
    await assertFails(adminEdit('a1', { actorUid: 'judge1' }));
  });

  it('稽核紀錄 ID 不能重複使用', async () => {
    await assertSucceeds(adminEdit('a1'));
    const d = db('admin1');
    const batch = writeBatch(d);
    batch.set(doc(d, 'scores/pV_judge1'), score('judge1', 'pV', {
      status: 'submitted', items: VOCAL_FULL, note: '原備註', rev: 3, updatedBy: 'admin1', lastAuditId: 'a1',
    }));
    await assertFails(batch.commit());
  });

  it('鎖定時管理員仍可改分（需留稽核）', async () => {
    await setLocked(true);
    await assertSucceeds(adminEdit('a1'));
  });

  it('管理員也可以修改備註', async () => {
    await assertSucceeds(adminEdit('a1', { after: { ...before, note: '新備註' } }, { items: VOCAL_FULL, note: '新備註' }));
  });

  it('稽核紀錄不能修改或刪除，評審無法讀取', async () => {
    await assertSucceeds(adminEdit('a1'));
    await assertFails(updateDoc(doc(db('admin1'), 'auditLogs/a1'), { reason: '竄改' }));
    await assertFails(deleteDoc(doc(db('admin1'), 'auditLogs/a1')));
    await assertFails(getDoc(doc(db('judge1'), 'auditLogs/a1')));
    await assertSucceeds(getDoc(doc(db('admin1'), 'auditLogs/a1')));
  });

  it('評審不能寫稽核紀錄', async () => {
    const d = db('judge1');
    await assertFails(setDoc(doc(d, 'auditLogs/x'), {
      actorUid: 'judge1', scoreId: 'pV_judge1', judgeUid: 'judge1', performanceId: 'pV',
      before, after, reason: '自己改', at: serverTimestamp(),
    }));
  });
});

describe('管理員兼任評審', () => {
  it('管理員可以替自己評分（不需稽核）', async () => {
    await assertSucceeds(setDoc(doc(db('admin1'), 'scores/pV_admin1'), score('admin1', 'pV')));
  });
});
