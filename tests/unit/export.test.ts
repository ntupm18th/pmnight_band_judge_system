import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildWorkbook } from '../../src/admin/exportXlsx';
import { computeStats } from '../../src/lib/stats';
import type { Performance, Score, UserProfile } from '../../src/lib/types';

const perfs: Performance[] = [
  { id: 'v1', day: 1, order: 1, startTime: '18:00', bandName: '主唱甲', song: '歌A', category: 'vocal', active: true, deleted: false },
  { id: 'b1', day: 1, order: 2, startTime: '18:03', bandName: '樂團乙', song: '歌B', category: 'band', active: true, deleted: false },
  { id: 'v2', day: 2, order: 1, startTime: '18:00', bandName: '主唱丙', song: '歌C', category: 'vocal', active: true, deleted: false },
];
const base = { rev: 1, updatedAt: null, deviceId: '', lastAuditId: null, note: '', noShow: false };
const scores: Score[] = [
  { ...base, id: 'v1_j1', performanceId: 'v1', judgeUid: 'j1', updatedBy: 'j1', category: 'vocal', status: 'submitted', items: { pitch: 35, rhythm: 25, expression: 28 }, note: '很好' },
  { ...base, id: 'v1_j2', performanceId: 'v1', judgeUid: 'j2', updatedBy: 'j2', category: 'vocal', status: 'submitted', items: { pitch: 30, rhythm: 20, expression: 20 } },
  { ...base, id: 'b1_j1', performanceId: 'b1', judgeUid: 'j1', updatedBy: 'j1', category: 'band', status: 'draft', items: { vPitch: 10, vRhythm: null, vExpression: null, iAccuracy: null, iRhythm: null, iTone: null } },
];
const users = new Map<string, UserProfile>([
  ['j1', { uid: 'j1', username: 'j1', displayName: '評審一', isAdmin: false, isJudge: true, active: true, createdAt: null }],
  ['j2', { uid: 'j2', username: 'j2', displayName: '評審二', isAdmin: false, isJudge: true, active: true, createdAt: null }],
]);

describe('buildWorkbook', () => {
  const wb = buildWorkbook(XLSX, perfs, scores, computeStats(perfs, scores), users, [
    { at: null, actorUid: 'j1', judgeUid: 'j2', performanceId: 'v1', before: {}, after: {}, reason: '更正' },
  ]);
  const sheet = (n: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[n]);

  it('包含所有工作表', () => {
    expect(wb.SheetNames).toEqual(['摘要', '主唱組排名', '樂團組排名', '主唱組明細', '樂團組明細', '稽核紀錄']);
  });

  it('摘要的平均與「尚無有效成績」', () => {
    const rows = sheet('摘要');
    expect(rows).toHaveLength(3);
    expect(rows[0]['平均']).toBe(79); // (88 + 70) / 2
    expect(rows[0]['組內排名']).toBe(1);
    expect(rows[1]['平均']).toBe('尚無有效成績');
    expect(rows[0]['評審備註']).toBe('評審一：很好');
    expect(sheet('主唱組排名')[0]['評審備註']).toBe('評審一：很好');
  });

  it('明細包含每位評審各項分數、總分與備註', () => {
    const rows = sheet('主唱組明細');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ 評審: '評審一', '音準 Pitch': 35, 總分: 88, 計入平均: '是', 備註: '很好' });
    const band = sheet('樂團組明細');
    expect(band[0]).toMatchObject({ 狀態: '草稿', 'Vocal 音準 Pitch': 10, 計入平均: '否' });
  });

  it('稽核紀錄', () => {
    expect(sheet('稽核紀錄')[0]).toMatchObject({ 操作者: '評審一', 評審: '評審二', 原因: '更正' });
  });
});
