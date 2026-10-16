import type { Category, Items } from './types';

export interface RubricItem {
  key: string;
  label: string;
  max: number;
}

export interface RubricSection {
  title: string | null;
  items: RubricItem[];
}

export interface Rubric {
  label: string;
  sections: RubricSection[];
}

// 必須與 firestore.rules 中的 vocalItemsOk / bandItemsOk 保持一致
export const RUBRICS: Record<Category, Rubric> = {
  vocal: {
    label: '主唱組',
    sections: [
      {
        title: null,
        items: [
          { key: 'pitch', label: '音準 Pitch', max: 40 },
          { key: 'rhythm', label: '節奏 Rhythm', max: 30 },
          { key: 'expression', label: '表現 Expression', max: 30 },
        ],
      },
    ],
  },
  band: {
    label: '樂團組',
    sections: [
      {
        title: 'Vocal',
        items: [
          { key: 'vPitch', label: '音準 Pitch', max: 15 },
          { key: 'vRhythm', label: '節奏 Rhythm', max: 15 },
          { key: 'vExpression', label: '表現 Expression', max: 15 },
        ],
      },
      {
        title: 'Instrument',
        items: [
          { key: 'iAccuracy', label: '準確度 Accuracy', max: 25 },
          { key: 'iRhythm', label: '節奏 Rhythm', max: 20 },
          { key: 'iTone', label: '音色 Tone', max: 10 },
        ],
      },
    ],
  },
};

export const CATEGORY_LABEL: Record<Category, string> = {
  vocal: RUBRICS.vocal.label,
  band: RUBRICS.band.label,
};

export function rubricItems(category: Category): RubricItem[] {
  return RUBRICS[category].sections.flatMap((s) => s.items);
}

export function emptyItems(category: Category): Items {
  return Object.fromEntries(rubricItems(category).map((i) => [i.key, null]));
}

export function isComplete(category: Category, items: Items): boolean {
  return rubricItems(category).every((i) => {
    const v = items[i.key];
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= i.max;
  });
}

/** 已填項目加總；未填視為 0（僅供即時顯示） */
export function totalOf(category: Category, items: Items): number {
  return rubricItems(category).reduce((sum, i) => sum + (items[i.key] ?? 0), 0);
}

export function filledCount(category: Category, items: Items): number {
  return rubricItems(category).filter((i) => items[i.key] != null).length;
}
