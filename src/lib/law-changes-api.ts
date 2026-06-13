import { apiFetch } from './api-client';

export interface LawChangeItem {
  lawName: string;
  articleNo: string | null;
  paragraphNo: string | null;
  itemNo: string | null;
  changeType: string;
}

export interface RecentLawChanges {
  hasChanges: boolean;
  lastRunAt: string | null;
  changedLaws: LawChangeItem[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readString = (source: Record<string, unknown>, key: string) => {
  const value = source[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const normalizeLawChangeItem = (value: unknown): LawChangeItem => {
  const source = isRecord(value) ? value : {};
  return {
    lawName: readString(source, 'lawName') || readString(source, 'law_name') || '법령',
    articleNo: readString(source, 'articleNo') || readString(source, 'article_no'),
    paragraphNo: readString(source, 'paragraphNo') || readString(source, 'paragraph_no'),
    itemNo: readString(source, 'itemNo') || readString(source, 'item_no'),
    changeType: readString(source, 'changeType') || readString(source, 'change_type') || 'updated',
  };
};

const normalizeRecentLawChanges = (value: unknown): RecentLawChanges => {
  const source = isRecord(value) ? value : {};
  const changedLaws = Array.isArray(source.changedLaws)
    ? source.changedLaws.map(normalizeLawChangeItem)
    : Array.isArray(source.changed_laws)
      ? source.changed_laws.map(normalizeLawChangeItem)
      : [];

  return {
    hasChanges: source.hasChanges === true || source.has_changes === true,
    lastRunAt: readString(source, 'lastRunAt') || readString(source, 'last_run_at'),
    changedLaws,
  };
};

export const getRecentLawChanges = async () => {
  const response = await apiFetch<unknown>('/law-changes/recent');
  return normalizeRecentLawChanges(response.data);
};
