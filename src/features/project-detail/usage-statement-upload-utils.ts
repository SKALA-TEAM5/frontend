import { CATS } from '../../lib/evidence-utils';
import type { ClassificationMoveNotice } from './project-detail-types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const readStringField = (source: unknown, keys: string[]) => {
  const record = asRecord(source);
  if (!record)
    return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim())
      return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
  }
  return '';
};

const readRecordField = (source: unknown, keys: string[]) => {
  const record = asRecord(source);
  if (!record)
    return null;
  for (const key of keys) {
    const value = asRecord(record[key]);
    if (value)
      return value;
  }
  return null;
};

const categoryIdFromCode = (value: string) => {
  const match = value.match(/\d+/);
  if (!match)
    return undefined;
  const categoryId = Number(match[0]);
  return Number.isFinite(categoryId) ? categoryId : undefined;
};

const categoryNameFromClassificationValue = (value: string) => {
  if (!value)
    return '';
  const categoryId = categoryIdFromCode(value);
  const category = categoryId ? CATS.find((cat) => cat.id === categoryId) : undefined;
  return (category?.short || value).replace(/\s+/g, ' ').trim();
};

export const extractClassificationMoveNotices = (workflow: unknown): ClassificationMoveNotice[] => {
  const workflowRecord = asRecord(workflow);
  const workflowResult = workflowRecord?.result;
  const resultRecord = asRecord(workflowResult);
  const classifierDetails = readRecordField(workflowResult, ['classifierDetails', 'classifier_details'])
    || readRecordField(workflow, ['classifierDetails', 'classifier_details'])
    || readRecordField(workflowResult, ['details'])
    || readRecordField(workflow, ['details']);
  const payload = readRecordField(classifierDetails, ['payload'])
    || readRecordField(workflowResult, ['payload'])
    || readRecordField(workflow, ['payload']);
  const classification = resultRecord?.classification || workflowRecord?.classification || workflow;
  const items = [
    ...asArray(payload?.changes),
    ...asArray(payload?.results),
    ...asArray(asRecord(classification)?.lineItems),
    ...asArray(asRecord(classification)?.line_items),
    ...asArray(asRecord(classification)?.items),
  ];
  const seen = new Set<string>();
  return items.flatMap((item, index) => {
    const before = readRecordField(item, ['before']);
    const after = readRecordField(item, ['after']);
    const fromCategory = readStringField(item, [
      'givenCategoryCode',
      'given_category_code',
      'originalCategoryCode',
      'original_category_code',
      'previousCategoryCode',
      'previous_category_code',
      'sourceCategoryCode',
      'source_category_code',
      'beforeCategoryCode',
      'before_category_code',
    ]) || readStringField(before, ['categoryCode', 'category_code']);
    const toCategory = readStringField(item, [
      'recommendedCategoryCode',
      'recommended_category_code',
      'classifiedCategoryCode',
      'classified_category_code',
      'targetCategoryCode',
      'target_category_code',
      'finalCategoryCode',
      'final_category_code',
      'decidedCategoryCode',
      'decided_category_code',
      'newCategoryCode',
      'new_category_code',
      'changedCategoryCode',
      'changed_category_code',
    ]) || readStringField(after, ['categoryCode', 'category_code']);
    if (!fromCategory || !toCategory || fromCategory === toCategory)
      return [];
    const id = `${readStringField(item, ['rowId', 'row_id', 'id', 'itemId', 'item_id', 'lineId', 'line_id']) || index}`;
    const dedupeKey = `${id}:${fromCategory}:${toCategory}`;
    if (seen.has(dedupeKey))
      return [];
    seen.add(dedupeKey);
    return [{
      id,
      itemName: readStringField(item, ['itemName', 'item_name', 'name', 'usageItemName', 'usage_item_name']) || '사용내역서 세부항목',
      fromCategoryName: categoryNameFromClassificationValue(fromCategory),
      toCategoryName: categoryNameFromClassificationValue(toCategory),
      reason: readStringField(item, ['reason', 'classificationReason', 'classification_reason', 'decisionReason', 'decision_reason', 'rationale']),
    }];
  });
};

export const getUsageStatementOcrFailureReason = (file: File) => {
  const fileName = file.name.toLowerCase();
  const supportedExtension = /\.pdf$/i.test(file.name);
  const supportedMime = !file.type || file.type === 'application/pdf';
  if (!supportedExtension || !supportedMime)
    return '사용내역서는 PDF 파일만 지원합니다.';
  if (file.size <= 0 || /empty|blank|null|빈|공백|추출실패/.test(fileName))
    return '사용내역서에서 필요한 값을 추출하지 못했습니다.';
  if (/date|날짜|기간오류|일자오류|날짜오류|이상/.test(fileName))
    return '문서의 작성일 또는 정산 월 정보가 올바르지 않습니다.';
  if (/blur|low|poor|quality|화질|흐림|저화질|흔들림/.test(fileName))
    return '문서 이미지의 화질이 낮아 금액과 날짜를 정확히 읽을 수 없습니다.';
  return null;
};
