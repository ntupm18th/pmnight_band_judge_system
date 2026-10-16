import type { Timestamp } from 'firebase/firestore';

export type Category = 'vocal' | 'band';
export type Day = 1 | 2;
export type ScoreStatus = 'draft' | 'submitted';
/** 未填寫為 null */
export type Items = Record<string, number | null>;

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  isJudge: boolean;
  active: boolean;
  createdAt: Timestamp | null;
}

export interface Performance {
  id: string;
  day: Day;
  order: number;
  /** 預定開始時間，例如 "18:00"；可為空字串 */
  startTime: string;
  bandName: string;
  song: string;
  category: Category;
  active: boolean;
  deleted: boolean;
}

export interface Score {
  id: string;
  performanceId: string;
  judgeUid: string;
  category: Category;
  items: Items;
  status: ScoreStatus;
  noShow: boolean;
  note: string;
  rev: number;
  updatedAt: Timestamp | null;
  updatedBy: string;
  deviceId: string;
  lastAuditId: string | null;
}

export interface Settings {
  scoringLocked: boolean;
}
