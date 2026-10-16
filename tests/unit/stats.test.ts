import { describe, expect, it } from 'vitest';
import { computeStats, formatAverage } from '../../src/lib/stats';
import { emptyItems, isComplete, totalOf } from '../../src/lib/rubric';
import type { Performance, Score } from '../../src/lib/types';

function perf(id: string, extra: Partial<Performance> = {}): Performance {
  return { id, day: 1, order: 1, startTime: '', bandName: id, song: '', category: 'vocal', active: true, deleted: false, ...extra };
}

function sc(performanceId: string, judgeUid: string, pitch: number, extra: Partial<Score> = {}): Score {
  return {
    id: `${performanceId}_${judgeUid}`, performanceId, judgeUid, category: 'vocal',
    items: { pitch, rhythm: 30, expression: 30 }, status: 'submitted', noShow: false, note: '',
    rev: 1, updatedAt: null, updatedBy: judgeUid, deviceId: '', lastAuditId: null, ...extra,
  };
}

describe('rubric', () => {
  it('總分為各項直接加總', () => {
    expect(totalOf('band', { vPitch: 15, vRhythm: 15, vExpression: 15, iAccuracy: 25, iRhythm: 20, iTone: 10 })).toBe(100);
  });
  it('未填項目不算完成', () => {
    expect(isComplete('vocal', emptyItems('vocal'))).toBe(false);
    expect(isComplete('vocal', { pitch: 0, rhythm: 0, expression: 0 })).toBe(true);
    expect(isComplete('vocal', { pitch: 41, rhythm: 0, expression: 0 })).toBe(false);
  });
});

describe('computeStats', () => {
  it('只納入已完成、未標記不上場的評分', () => {
    const stats = computeStats([perf('a')], [
      sc('a', 'j1', 40),
      sc('a', 'j2', 20),
      sc('a', 'j3', 0, { status: 'draft' }),
      sc('a', 'j4', 0, { noShow: true }),
    ]);
    const a = stats.get('a')!;
    expect(a.validCount).toBe(2);
    expect(a.average).toBe(90); // (100 + 80) / 2
    expect(a.noShowCount).toBe(1);
    expect(a.draftCount).toBe(1);
  });

  it('沒有有效評分時平均為 null，顯示尚無有效成績', () => {
    const a = computeStats([perf('a')], [sc('a', 'j1', 30, { noShow: true })]).get('a')!;
    expect(a.average).toBeNull();
    expect(a.rank).toBeNull();
    expect(formatAverage(a.average)).toBe('尚無有效成績');
  });

  it('類別不符的評分不計入並列為異常', () => {
    const a = computeStats([perf('a', { category: 'band' })], [sc('a', 'j1', 30)]).get('a')!;
    expect(a.validCount).toBe(0);
    expect(a.anomalies).toContain('評分類別與表演類別不符');
  });

  it('同類別內排名，同分同名次，停用表演不排名', () => {
    const perfs = [perf('a'), perf('b'), perf('c'), perf('d', { active: false }), perf('x', { category: 'band' })];
    const stats = computeStats(perfs, [
      sc('a', 'j1', 30),
      sc('b', 'j1', 40),
      sc('c', 'j1', 30),
      sc('d', 'j1', 40),
    ]);
    expect(stats.get('b')!.rank).toBe(1);
    expect(stats.get('a')!.rank).toBe(2);
    expect(stats.get('c')!.rank).toBe(2);
    expect(stats.get('d')!.rank).toBeNull();
    expect(stats.get('d')!.average).toBeNull();
    expect(stats.get('x')!.rank).toBeNull();
  });

  it('平均相同但評分人數不同時視為同分', () => {
    // a: (90+80)/2 = 85；b: (85+85+85)/3 = 85
    const stats = computeStats([perf('a'), perf('b')], [
      sc('a', 'j1', 30), sc('a', 'j2', 20),
      sc('b', 'j1', 25), sc('b', 'j2', 25), sc('b', 'j3', 25),
    ]);
    expect(stats.get('a')!.rank).toBe(1);
    expect(stats.get('b')!.rank).toBe(1);
  });

  it('平均顯示到小數第三位', () => {
    expect(formatAverage(250 / 3)).toBe('83.333');
  });
});
