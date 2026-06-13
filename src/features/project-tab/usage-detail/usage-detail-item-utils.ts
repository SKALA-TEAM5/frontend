import { calculateUsageLineAmount, parseUsageNumber, type UsageLineItem } from '../../../lib/evidence-utils';
import type { CreateUsageStatementItemResponse } from '../../../lib/archive-api';
import type { AddUsageItemDraft, ClassiRejectedNotice, ClassificationMoveNotice } from './usage-statement-detail-types';
import { getCategoryCodeDisplayName, getCategoryDisplayName } from './usage-detail-todo-utils';

type ClassiResult = NonNullable<CreateUsageStatementItemResponse['results']>[number];

export const validateAddUsageItemDraft = (draft: AddUsageItemDraft, usageStatementId?: number) => {
  const name = draft.name.trim();
  const quantity = parseUsageNumber(draft.quantity);
  const unitPrice = parseUsageNumber(draft.unitPrice);
  const amount = calculateUsageLineAmount(quantity, unitPrice);

  if (!name) return { error: '사용내역을 입력해 주세요.' } as const;
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: '수량을 입력해 주세요.' } as const;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { error: '단가를 입력해 주세요.' } as const;
  if (!Number.isFinite(amount) || amount <= 0) return { error: '수량과 단가를 확인해 주세요.' } as const;
  if (!draft.date) return { error: '사용일자를 입력해 주세요.' } as const;
  if (!usageStatementId) return { error: '사용내역서 ID가 없어 세부항목을 추가할 수 없습니다.' } as const;

  return {
    value: {
      name,
      quantity,
      unitPrice,
      amount,
      usedOn: draft.date,
      unit: draft.unit.trim() || undefined,
      usageStatementId,
    },
  } as const;
};

export const isRejectedClassiStatus = (status?: string | null) =>
  ['inappropriate', 'invalid', 'rejected', 'fail', 'failed', '부적절', '부적정'].includes(String(status || '').trim().toLowerCase());

export const findRejectedClassiResult = (result: CreateUsageStatementItemResponse) => (
  (result.results || []).find((item) => item.isAppropriate === false || isRejectedClassiStatus(item.status))
);

export const buildClassiRejectedNotice = ({
  result,
  fallbackName,
  selectedCategoryId,
  fallbackCategoryId,
}: {
  result: ClassiResult;
  fallbackName: string;
  selectedCategoryId: number;
  fallbackCategoryId: number;
}): ClassiRejectedNotice => ({
  itemName: result.itemName || fallbackName,
  fromCategoryName: getCategoryCodeDisplayName(result.originalCategoryCode, selectedCategoryId) || getCategoryDisplayName(selectedCategoryId),
  toCategoryName: getCategoryCodeDisplayName(result.finalCategoryCode, fallbackCategoryId) || getCategoryDisplayName(fallbackCategoryId),
  reason: result.reason || 'classi 에이전트가 입력한 세부항목을 현재 카테고리에 적재하기 부적절하다고 판단했습니다.',
});

export const buildClassificationMoveNotices = ({
  result,
  itemName,
  selectedCategoryId,
  fallbackCategoryId,
  addedItem,
}: {
  result: CreateUsageStatementItemResponse;
  itemName: string;
  selectedCategoryId: number;
  fallbackCategoryId: number;
  addedItem?: UsageLineItem;
}): ClassificationMoveNotice[] => {
  const classiChanges = result.changes || [];
  return (classiChanges.length > 0 ? classiChanges : [{
    itemName,
    fromCategoryName: getCategoryDisplayName(selectedCategoryId),
    toCategoryName: getCategoryDisplayName(addedItem?.categoryId || fallbackCategoryId),
  }]).map((change, index) => {
    const fromCategoryName = change.fromCategoryName || getCategoryDisplayName(selectedCategoryId);
    const toCategoryName = change.toCategoryName || getCategoryDisplayName(addedItem?.categoryId || fallbackCategoryId);
    const categoryChanged = result.categoryChanged || fromCategoryName !== toCategoryName;
    return {
      id: `${change.itemName}-${index}`,
      itemName: change.itemName || itemName,
      fromCategoryName,
      toCategoryName,
      categoryChanged,
      reason: categoryChanged
        ? '입력한 항목명을 기준으로 classi 에이전트가 더 적합한 카테고리를 선택했습니다.'
        : 'classi 에이전트가 입력한 세부항목의 카테고리를 확인하고 현재 분류를 확정했습니다.',
    };
  });
};
