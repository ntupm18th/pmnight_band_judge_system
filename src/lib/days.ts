import type { Day } from './types';

// 活動日期（顯示用）；名單匯入時第 1 個日期為第 1 天
export const DAY_LABELS: Record<Day, string> = {
  1: '10/17（六）',
  2: '10/18（日）',
};

export function defaultDay(now = new Date()): Day {
  return now.getMonth() === 9 && now.getDate() === 18 ? 2 : 1;
}
