import { kindToEvidenceCode } from '../../../lib/archive-api';
import type { VisionValidationResult } from '../../../lib/agent-api';
import type { UsageLineItem } from '../../../lib/evidence-utils';
import type { ArchiveSeed, EvidenceCategory, EvidenceFile, FolderEvidenceCategory } from '../../../types/domain';
import type { UsageDetailTodoItem } from './usage-statement-detail-types';
import { toNounPhraseDetail } from './usage-detail-todo-utils';

export const getUsageDetailFiles = (
  seed: ArchiveSeed,
  kind: FolderEvidenceCategory,
  catId: number,
  usageItemId?: string,
) => {
  if (usageItemId) return seed.categories?.[catId]?.[usageItemId]?.[kind] || [];
  return Object.values(seed.categories?.[catId] || {}).flatMap((line) => line[kind] || []);
};

export const findUsageDetailFile = (
  seed: ArchiveSeed,
  kind: FolderEvidenceCategory,
  catId: number,
  fileId: string,
  usageItemId?: string,
) => getUsageDetailFiles(seed, kind, catId, usageItemId).find((file) => file.id === fileId);

export const renameUsageDetailFileInArchive = (
  seed: ArchiveSeed,
  {
    kind,
    catId,
    fileId,
    nextName,
    usageItemId,
  }: {
    kind: FolderEvidenceCategory;
    catId: number;
    fileId: string;
    nextName: string;
    usageItemId?: string;
  },
): ArchiveSeed => {
  const sourceFile = findUsageDetailFile(seed, kind, catId, fileId, usageItemId);
  const shouldRename = (file: EvidenceFile) => file.id === fileId || (Boolean(sourceFile?.fileId) && file.fileId === sourceFile?.fileId);

  return {
    ...seed,
    usage_statement: seed.usage_statement.map((file) => shouldRename(file) ? { ...file, name: nextName } : file),
    categories: Object.fromEntries(Object.entries(seed.categories || {}).map(([nextCatId, lineMap]) => [
      nextCatId,
      Object.fromEntries(Object.entries(lineMap).map(([nextUsageItemId, kindMap]) => [
        nextUsageItemId,
        Object.fromEntries(Object.entries(kindMap).map(([nextKind, files]) => [
          nextKind,
          (files || []).map((file) => shouldRename(file) ? { ...file, name: nextName } : file),
        ])),
      ])),
    ])) as ArchiveSeed['categories'],
  };
};

export const removeUsageDetailFileFromArchive = (
  seed: ArchiveSeed,
  {
    kind,
    catId,
    fileId,
    usageItemId,
  }: {
    kind: FolderEvidenceCategory;
    catId: number;
    fileId: string;
    usageItemId?: string;
  },
): ArchiveSeed => {
  const next: ArchiveSeed = { ...seed, categories: { ...seed.categories } };
  const lineMap = { ...(next.categories[catId] || {}) };
  const usageItemIds = usageItemId ? [usageItemId] : Object.keys(lineMap);
  usageItemIds.forEach((lineId) => {
    lineMap[lineId] = {
      ...(lineMap[lineId] || {}),
      [kind]: (lineMap[lineId]?.[kind] || []).filter((file) => file.id !== fileId),
    };
  });
  next.categories[catId] = lineMap;
  return next;
};

export const moveUsageDetailFileInArchive = (
  seed: ArchiveSeed,
  {
    fromKind,
    fromCatId,
    fromUsageItemId,
    toKind,
    toCatId,
    targetUsageItemId,
    fileEntry,
    movedLinkId,
    evidenceTypeCode,
  }: {
    fromKind: FolderEvidenceCategory;
    fromCatId: number;
    fromUsageItemId: string;
    toKind: FolderEvidenceCategory;
    toCatId: number;
    targetUsageItemId: string;
    fileEntry: EvidenceFile;
    movedLinkId?: EvidenceFile['linkId'];
    evidenceTypeCode?: EvidenceFile['evidenceTypeCode'];
  },
): ArchiveSeed => {
  const nextKind: EvidenceCategory = toKind;
  const movedFile: EvidenceFile = {
    ...fileEntry,
    id: movedLinkId ? `evidence-link-${movedLinkId}` : fileEntry.id,
    linkId: movedLinkId,
    kind: nextKind,
    evidenceTypeCode: kindToEvidenceCode(toKind, evidenceTypeCode),
    categoryIds: [toCatId],
  };
  const next: ArchiveSeed = { ...seed, categories: { ...seed.categories } };
  next.categories[fromCatId] = { ...(next.categories[fromCatId] || {}) };
  next.categories[toCatId] = { ...(next.categories[toCatId] || {}) };
  next.categories[fromCatId][fromUsageItemId] = {
    ...(next.categories[fromCatId][fromUsageItemId] || {}),
    [fromKind]: (next.categories[fromCatId][fromUsageItemId]?.[fromKind] || []).filter((file) => file.id !== fileEntry.id),
  };
  next.categories[toCatId][targetUsageItemId] = {
    ...(next.categories[toCatId][targetUsageItemId] || {}),
    [toKind]: [...(next.categories[toCatId][targetUsageItemId]?.[toKind] || []), { ...movedFile, usageItemIds: [targetUsageItemId] }],
  };
  return next;
};

export const moveUsageItemFilesToCategory = (
  seed: ArchiveSeed,
  usageItemId: string,
  fromCategoryId: number,
  toCategoryId: number,
): ArchiveSeed => {
  const next: ArchiveSeed = { ...seed, categories: { ...seed.categories } };
  const sourceLineMap = { ...(next.categories[fromCategoryId] || {}) };
  const targetLineMap = { ...(next.categories[toCategoryId] || {}) };
  const lineFiles = sourceLineMap[usageItemId] || {};
  delete sourceLineMap[usageItemId];
  targetLineMap[usageItemId] = Object.fromEntries(Object.entries(lineFiles).map(([kind, files]) => [
    kind,
    (files || []).map((file) => ({
      ...file,
      categoryIds: [toCategoryId],
      usageItemIds: [usageItemId],
    })),
  ])) as typeof targetLineMap[string];
  next.categories[fromCategoryId] = sourceLineMap;
  next.categories[toCategoryId] = targetLineMap;
  return next;
};

export const removeUsageItemFilesFromArchive = (
  seed: ArchiveSeed,
  usageItem: UsageLineItem,
): ArchiveSeed => {
  const next: ArchiveSeed = { ...seed, categories: { ...seed.categories } };
  const lineMap = { ...(next.categories[usageItem.categoryId] || {}) };
  delete lineMap[usageItem.id];
  next.categories[usageItem.categoryId] = lineMap;
  return next;
};

const buildVisionValidation = (
  file: EvidenceFile,
  usageItem: UsageLineItem | undefined,
  reason?: string,
  storedResult?: VisionValidationResult,
): NonNullable<EvidenceFile['visionValidation']> => {
  if (storedResult) {
    return {
      ...storedResult,
      itemName: usageItem?.name || storedResult.itemName,
    };
  }
  const normalizedReason = toNounPhraseDetail(reason || '');
  if (file.visionValidation && !normalizedReason) {
    return {
      ...file.visionValidation,
      itemName: usageItem?.name || file.visionValidation.itemName,
    };
  }
  const hasProblem = Boolean(normalizedReason) || /미착용|부적합|불명확|부족|fail|위험|미확인/i.test(`${file.name} ${usageItem?.name || ''}`);
  return {
    status: hasProblem ? 'unsuitable' : file.visionValidation?.status || 'suitable',
    checkedAt: file.visionValidation?.checkedAt || new Date().toISOString(),
    itemName: usageItem?.name || '현장사진',
    summary: hasProblem ? (normalizedReason || '현장사진 검증 결과 보완 필요') : file.visionValidation?.summary || '현장사진 검증 결과 적합',
    detections: file.visionValidation?.detections || [],
  };
};

export const applyVisionValidationToArchive = (
  seed: ArchiveSeed,
  {
    usageItems,
    todos,
    validationByFileId,
  }: {
    usageItems: UsageLineItem[];
    todos: UsageDetailTodoItem[];
    validationByFileId: Record<string, VisionValidationResult>;
  },
): ArchiveSeed => {
  const visionTodos = todos.filter((todo) => todo.source === 'vision');
  return {
    ...seed,
    categories: Object.fromEntries(Object.entries(seed.categories || {}).map(([catId, lineMap]) => [
      catId,
      Object.fromEntries(Object.entries(lineMap).map(([usageItemId, kindMap]) => {
        const usageItem = usageItems.find((item) => item.id === usageItemId);
        const matchingVisionTodo = visionTodos.find((todo) => {
          if (todo.usageItemId) return String(todo.usageItemId) === String(usageItemId);
          if (todo.categoryId) return String(todo.categoryId) === String(catId);
          return Boolean(usageItem && todo.context.includes(usageItem.name));
        });
        return [
          usageItemId,
          {
            ...kindMap,
            site_photo: (kindMap.site_photo || []).map((file) => {
              const storedResult = file.fileId == null ? undefined : validationByFileId[String(file.fileId)];
              return {
                ...file,
                visionValidation: buildVisionValidation(file, usageItem, matchingVisionTodo?.detail, storedResult),
              };
            }),
          },
        ];
      })),
    ])) as ArchiveSeed['categories'],
  };
};
