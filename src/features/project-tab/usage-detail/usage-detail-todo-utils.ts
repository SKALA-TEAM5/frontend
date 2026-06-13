import { CATS, type UsageLineItem } from '../../../lib/evidence-utils';
import type { OrchestratorTodo } from '../../../lib/agent-api';
import type { FolderEvidenceCategory } from '../../../types/domain';
import type { UsageDetailTodoItem } from './usage-statement-detail-types';

// Constants

export const GENERIC_USAGE_ITEM_CONTEXT = '사용내역서 세부 항목';

export const EVIDENCE_KIND_LABELS: Record<FolderEvidenceCategory, string> = {
  receipt: '영수증',
  site_photo: '현장사진',
  tax_invoice: '세금계산서',
  other_document: '기타 자료',
};

const EVIDENCE_DOCUMENT_NAME_LABELS: Record<string, string> = {
  receipt: '영수증',
  receipts: '영수증',
  payment_receipt: '결제 영수증',
  card_receipt: '카드 영수증',
  cash_receipt: '현금영수증',
  transaction_statement: '거래명세서',
  statement_of_transaction: '거래명세서',
  purchase_detail: '구매내역서',
  purchase_details: '구매내역서',
  bank_transfer_confirmation: '계좌이체 확인증',
  account_transfer_confirmation: '계좌이체 확인증',
  transfer_confirmation: '이체확인증',
  transfer_confirm: '이체확인증',
  deposit_confirmation: '입금확인증',
  invoice: '계산서',
  tax_invoice: '세금계산서',
  electronic_tax_invoice: '전자세금계산서',
  third_party_lookup: '제3자발급사실조회서',
  third_party_issue_lookup: '제3자발급사실조회서',
  site_photo: '현장사진',
  site_photos: '현장사진',
  field_photo: '현장사진',
  item_photo: '물품 사진',
  item_photos: '물품 사진',
  work_photo: '작업사진',
  installation_photo: '설치 사진',
  before_after_photo: '설치 전후 비교 사진',
  wearing_photo: '착용 확인 사진',
  safety_equipment_photo: '보호구 착용 사진',
  safety_facility_photo: '안전시설 설치 사진',
  attendance_list: '참석자 명단',
  attendee_list: '참석자 명단',
  edu_attendance: '교육 참석자 명단',
  education_attendance: '교육 참석자 명단',
  training_completion_certificate: '교육 이수증',
  education_completion_certificate: '교육 이수증',
  training_material: '교육자료',
  education_material: '교육자료',
  appointment_report: '선임 신고서',
  certificate: '확인서',
  confirmation_document: '확인서',
  contract: '계약서',
  quotation: '견적서',
  estimate: '견적서',
  delivery_note: '납품서',
  delivery_statement: '납품서',
  purchase_order: '발주서',
  work_log: '업무일지',
  daily_report: '작업일지',
  inspection_report: '점검표',
  checklist: '점검표',
  supply_ledger: '지급대장',
  inventory_ledger: '재고대장',
  payroll: '임금대장',
  pay_stub: '급여명세서',
  wage_statement: '임금명세서',
  salary_statement: '급여명세서',
  employment_contract: '근로계약서',
  worker_roster: '근로자 명부',
  consultant_report: '컨설팅 보고서',
  tech_guidance_contract: '기술지도 계약서',
  technical_guidance_report: '기술지도 보고서',
  tech_guidance_report: '기술지도 보고서',
  tech_guidance_photo: '기술지도 사진',
  tech_guidance_계약서: '기술지도 계약서',
  risk_assessment_report: '위험성평가 보고서',
  measurement_report: '측정 결과서',
  test_report: '검사 성적서',
  other_document: '보완 서류',
  other_documents: '보완 서류',
  misc_document: '보완 서류',
};

const EVIDENCE_NAME_SPLIT_PATTERN = /\s*(?:,|\/|·| 및 |와 |과 |\n)\s*/;

// Evidence text normalization

export const normalizeEvidenceNameKey = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/[^\p{L}\p{N}]+/gu, '_')
  .replace(/^_+|_+$/g, '')
  .toLowerCase();

const EVIDENCE_DOCUMENT_MATCHERS = Object.entries(EVIDENCE_DOCUMENT_NAME_LABELS)
  .sort(([left], [right]) => right.length - left.length)
  .map(([key, label]) => ({
    key,
    label,
    pattern: new RegExp(`(^|[^A-Za-z0-9])${key.split('_').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[_\\s-]*')}([^A-Za-z0-9]|$)`, 'gi'),
  }));

export const translateEvidenceDocumentName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const key = normalizeEvidenceNameKey(trimmed);
  if (EVIDENCE_DOCUMENT_NAME_LABELS[key]) return EVIDENCE_DOCUMENT_NAME_LABELS[key];
  const translated = EVIDENCE_DOCUMENT_MATCHERS.reduce((next, matcher) => next.replace(matcher.pattern, (_match, prefix, suffix) => `${prefix}${matcher.label}${suffix}`), trimmed);
  return translated
    .replace(/\b(?:missing|required|requirement|evidence|document|documents|file|files|upload|needed|need|proof)\b/gi, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const translateEvidenceText = (value?: string) => {
  const text = (value || '').trim();
  if (!text) return '';
  return EVIDENCE_DOCUMENT_MATCHERS.reduce((next, matcher) => next.replace(matcher.pattern, (_match, prefix, suffix) => `${prefix}${matcher.label}${suffix}`), text)
    .replace(/\bmissing\s*(?:evidence|documents?|files?)?\b/gi, '누락 증빙')
    .replace(/\brequired\s*(?:evidence|documents?|files?)?\b/gi, '필수 증빙')
    .replace(/\b(?:evidence|document|documents|file|files)\b/gi, '증빙')
    .replace(/\b(?:upload|needed|need)\b/gi, '필요')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const cleanEvidenceTodoText = (value: string) => value
  .replace(/^(?:필수\s*)?증빙\s*누락\s*[:：]\s*/u, '')
  .replace(/^증빙\s*매칭\s*검토\s*필요\s*[:：]\s*/u, '')
  .replace(/^매칭\s*검토\s*필요\s*\d+\s*건\s*$/u, '')
  .replace(/^필수\s*증빙\s*누락\s*항목\s*\d+\s*건\s*$/u, '')
  .replace(/^현장사진\s*\d+\s*건\s*중\s*\d+\s*건\s*보완\s*필요\s*$/u, '')
  .replace(/^위치\s*확인\s*필요$/u, '')
  .replace(/^.*?문제가\s*있습니다[.,]?\s*/u, '')
  .replace(/^.*?부족\s*문제가\s*있습니다[.,]?\s*/u, '')
  .replace(/^.*?부족\s*문제.*?[.,]?\s*/u, '')
  .replace(/(?:자료|서류|증빙)?(?:를|을)?\s*(?:추가\s*)?제출(?:해)?\s*주세요\.?$/u, '')
  .replace(/\s*추가$/u, '')
  .replace(/(?:자료|서류|증빙)\s*$/u, '')
  .trim();

const extractEvidenceDocumentNames = (value: string, fallbackKind?: FolderEvidenceCategory) => {
  const source = value || '';
  const normalizedSource = normalizeEvidenceNameKey(source);
  const names = EVIDENCE_DOCUMENT_MATCHERS
    .filter((matcher) => normalizedSource.includes(matcher.key))
    .map((matcher) => matcher.label)
    .filter((label) => label !== '보완 서류');
  const translatedCleaned = cleanEvidenceTodoText(translateEvidenceText(source));
  const splitNames = translatedCleaned
    .split(EVIDENCE_NAME_SPLIT_PATTERN)
    .map((name) => cleanEvidenceTodoText(name)
      .replace(/^(?:누락|필수|필요|증빙)\s*/u, '')
      .replace(/\s*(?:업로드|제출|필요|누락|미흡|확인|보완|있음)$/u, '')
      .trim())
    .filter((name) => name && /[가-힣]/.test(name) && name.length <= 24 && !/문제|사유|항목|세부|사용내역|보완 사항|증빙\s*누락|매칭\s*검토|위치\s*확인/.test(name));
  const extractedNames = Array.from(new Set([...names, ...splitNames].filter(Boolean)));
  if (extractedNames.length) return extractedNames;
  const fallbackName = fallbackKind && fallbackKind !== 'other_document' ? EVIDENCE_KIND_LABELS[fallbackKind] : '';
  return fallbackName ? [fallbackName] : [];
};

const stripTodoContextPrefix = (value: string, context?: string | null) => {
  const text = value.trim();
  const prefix = (context || '').trim();
  if (!prefix || !text.startsWith(prefix)) return text;
  return text.slice(prefix.length).replace(/^[\s:：·∙-]+/u, '').trim() || text;
};

export const translateTodoDisplayText = (value: string, context?: string | null) => {
  const withoutContext = stripTodoContextPrefix(value, context);
  return translateEvidenceText(withoutContext)
    .replace(/\b[a-z][a-z0-9_-]*\b/gi, (match) => translateEvidenceDocumentName(match) || match)
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const toNounPhraseDetail = (value?: string) => {
  const text = (value || '').trim();
  if (!text) return '';
  return text
    .replace(/\s*(?:자료|서류|증빙)?(?:를|을)?\s*(?:추가\s*)?제출(?:해)?\s*주세요\.?$/u, ' 제출 필요')
    .replace(/\s*(?:삭제|제거|교체)(?:해)?\s*주세요\.?$/u, ' 삭제 필요')
    .replace(/\s*부적합합니다\.?$/u, ' 부적합')
    .replace(/\s*적합합니다\.?$/u, ' 적합')
    .replace(/\s*있습니다\.?$/u, ' 있음')
    .replace(/\s*없습니다\.?$/u, ' 없음')
    .replace(/\s*어렵습니다\.?$/u, ' 어려움')
    .replace(/\s*필요합니다\.?$/u, ' 필요')
    .replace(/\s*바랍니다\.?$/u, ' 필요')
    .replace(/[.。]$/u, '')
    .trim();
};

// TODO title and lookup helpers

const getTodoDocumentTitle = (reason: string, kind: FolderEvidenceCategory) => {
  const names = extractEvidenceDocumentNames(reason, kind);
  if (names.length) return names.join(', ');
  return kind === 'other_document' ? '보완 서류' : EVIDENCE_KIND_LABELS[kind];
};

const getUploadTodoTitle = (value: string, context?: string | null) => {
  const translated = translateTodoDisplayText(value, context)
    .replace(/^.+?필수\s*증빙\s*누락\s*[:：]?\s*/u, '')
    .replace(/^(?:필수\s*)?증빙\s*누락\s*[:：]?\s*/u, '')
    .replace(/^필수\s*증빙\s*[:：]?\s*/u, '')
    .replace(/\s*(?:업로드|제출)?\s*필요$/u, '')
    .trim();
  return `${translated || '보완 서류'} 업로드 필요`;
};

const getBackendTodoDisplayTitle = (todo: OrchestratorTodo) => {
  const reason = translateTodoDisplayText(todo.reason || '보완 사항 확인 필요', todo.usageStatementItemName);
  if (todo.agentTypeCode !== 'legal') return getUploadTodoTitle(reason, todo.usageStatementItemName);
  const legalReason = reason.replace(/^법령\s*검토\s*(?:필요|결과)\s*[:：]?\s*/u, '').trim() || reason;
  return `법령 검토 결과 ${legalReason}`;
};

export const normalizeTodoIdText = (value: string) => value.replace(/\s+/g, '').toLowerCase();
export const normalizeTodoLookupText = (value: string) => normalizeTodoIdText(value)
  .replace(/[·.,:;()[\]{}'"“”‘’~\-_/]/g, '');

export const inferEvidenceKindFromText = (value: string): FolderEvidenceCategory => {
  const normalized = normalizeEvidenceNameKey(value);
  if (/영수증|결제|거래명세|카드|입금|계좌|송금/.test(value) || /(receipt|transaction_statement|bank_transfer|account_transfer|deposit_confirmation|payment)/.test(normalized)) return 'receipt';
  if (/사진|현장|착용|설치\s*전후|설치\s*상세/.test(value) || /(photo|site_photo|field_photo|wearing_photo|installation_photo|safety_equipment)/.test(normalized)) return 'site_photo';
  if (/세금|계산서|전자세금/.test(value) || /(tax_invoice|electronic_tax_invoice|invoice)/.test(normalized)) return 'tax_invoice';
  return 'other_document';
};

const getCategoryFromBackendTodo = (todo: OrchestratorTodo) => {
  const codeMatch = String(todo.categoryCode || '').match(/^CAT_(\d+)$/i);
  if (codeMatch) {
    const categoryId = Number(codeMatch[1]);
    const category = CATS.find((cat) => cat.id === categoryId);
    if (category) return category;
  }
  const normalizedCategoryName = normalizeTodoLookupText(todo.categoryName || '');
  if (!normalizedCategoryName) return undefined;
  return CATS.find((cat) => [cat.label, cat.short]
    .map(normalizeTodoLookupText)
    .filter(Boolean)
    .some((label) => label === normalizedCategoryName || normalizedCategoryName.includes(label)));
};

const getCategoryIdFromTodoCode = (value?: string | null) => {
  const match = String(value || '').match(/\d+/);
  if (!match) return undefined;
  const categoryId = Number(match[0]);
  return Number.isFinite(categoryId) ? categoryId : undefined;
};

export const getCategoryDisplayName = (categoryId: number) => CATS.find((cat) => cat.id === categoryId)?.short || `${categoryId}번 항목`;
export const getCategoryCodeDisplayName = (categoryCode?: string | null, fallbackCategoryId?: number) => {
  const categoryId = getCategoryIdFromTodoCode(categoryCode);
  return categoryId ? getCategoryDisplayName(categoryId) : fallbackCategoryId ? getCategoryDisplayName(fallbackCategoryId) : '';
};

export const findUsageItemFromTodoText = (value: string, usageItems: UsageLineItem[]) => {
  const normalized = normalizeTodoLookupText(value);
  if (!normalized) return undefined;
  return usageItems.find((item) => {
    const itemName = normalizeTodoLookupText(item.name);
    return Boolean(itemName && normalized.includes(itemName));
  });
};

export const findCategoryFromTodoText = (value: string) => {
  const normalized = normalizeTodoLookupText(value);
  if (!normalized) return undefined;
  return CATS.find((cat) => [cat.label, cat.short]
    .map(normalizeTodoLookupText)
    .filter(Boolean)
    .some((label) => normalized.includes(label)));
};

// TODO display and grouping

export const resolveTodoUsageItem = (todo: UsageDetailTodoItem, usageItems: UsageLineItem[]) => {
  if (todo.usageItemId) {
    const byId = usageItems.find((item) => String(item.id) === String(todo.usageItemId));
    if (byId) return byId;
  }
  if (todo.context && todo.context !== GENERIC_USAGE_ITEM_CONTEXT) {
    const byContext = usageItems.find((item) => item.name === todo.context);
    if (byContext) return byContext;
  }
  return findUsageItemFromTodoText(`${todo.title} ${todo.detail || ''} ${todo.context || ''}`, usageItems);
};

export const getTodoAgentTypeLabel = (todo: UsageDetailTodoItem) => (
  todo.backendAgentTypeCode || (todo.source === 'law' ? 'legal' : todo.source === 'vision' ? 'vision' : 'link')
);

export const getTodoGroupLocationMeta = (todo: UsageDetailTodoItem, usageItems: UsageLineItem[]) => {
  const usageItem = resolveTodoUsageItem(todo, usageItems);
  const categoryId = usageItem?.categoryId || todo.categoryId;
  const categoryName = categoryId ? getCategoryDisplayName(categoryId) : todo.backendCategoryName || '';
  const itemName = usageItem?.name || (todo.context && todo.context !== GENERIC_USAGE_ITEM_CONTEXT ? todo.context : '');
  return {
    itemName: itemName || GENERIC_USAGE_ITEM_CONTEXT,
    categoryName: categoryName || '9개 항목',
  };
};

const isLinkAgentTodo = (todo: Pick<UsageDetailTodoItem, 'backendAgentTypeCode'>) => (
  todo.backendAgentTypeCode === 'link'
);

export const getTodoDisplayTitle = (todo: UsageDetailTodoItem) => {
  const title = translateTodoDisplayText(todo.title.trim(), todo.context);
  if (todo.backendTodoId && isLinkAgentTodo(todo)) return title;
  if (todo.backendTodoId && todo.source === 'law') return title;
  if (todo.backendTodoId) return getUploadTodoTitle(title, todo.context);
  const needsActionSuffix = !/(?:업로드|제출|삭제|제거|교체|필요)$/u.test(title);
  if (!needsActionSuffix) return title;
  return `${title} ${todo.mode === 'add' ? '업로드 필요' : '삭제 필요'}`;
};

type TodoGroupMeta = {
  id: string;
  label: string;
  agentType: string;
  order: number;
};

export const buildUsageDetailTodoGroups = (todos: UsageDetailTodoItem[], usageItems: UsageLineItem[]) => {
  const getTodoGroupMeta = (todo: UsageDetailTodoItem): TodoGroupMeta => {
    const location = getTodoGroupLocationMeta(todo, usageItems);
    const agentType = getTodoAgentTypeLabel(todo);
    const locationLabel = `${location.itemName} ∙ ${location.categoryName}`;
    if (todo.backendTodoId) {
      const backendGroupKey = [
        agentType,
        todo.usageItemId || normalizeTodoIdText(location.itemName),
        todo.categoryId || normalizeTodoIdText(location.categoryName),
      ].join(':');
      return {
        id: `backend:${backendGroupKey}`,
        label: locationLabel,
        agentType,
        order: usageItems.length + (todo.categoryId || 0) / 100,
      };
    }
    const usageItem = resolveTodoUsageItem(todo, usageItems);
    if (usageItem) {
      return {
        id: `item:${agentType}:${usageItem.id}`,
        label: `${usageItem.name} ∙ ${getCategoryDisplayName(usageItem.categoryId)}`,
        agentType,
        order: usageItems.findIndex((item) => String(item.id) === String(usageItem.id)),
      };
    }
    if (todo.context && todo.context !== GENERIC_USAGE_ITEM_CONTEXT) {
      return {
        id: `context:${agentType}:${normalizeTodoIdText(todo.context)}`,
        label: locationLabel,
        agentType,
        order: usageItems.length + 1,
      };
    }
    if (todo.categoryId) {
      return {
        id: `category:${agentType}:${todo.categoryId}`,
        label: locationLabel,
        agentType,
        order: usageItems.length + todo.categoryId / 100,
      };
    }
    return {
      id: `unassigned:${agentType}`,
      label: locationLabel,
      agentType,
      order: usageItems.length + 2,
    };
  };

  return Array.from(todos.reduce((groupMap, todo) => {
    const meta = getTodoGroupMeta(todo);
    const current = groupMap.get(meta.id);
    if (current) {
      current.items.push(todo);
      return groupMap;
    }
    groupMap.set(meta.id, { ...meta, items: [todo] });
    return groupMap;
  }, new Map<string, TodoGroupMeta & { items: UsageDetailTodoItem[] }>()).values())
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, 'ko'));
};

// Backend TODO mapping

export const toOrchestratorTodos = (todo: OrchestratorTodo, usageItems: UsageLineItem[]): UsageDetailTodoItem[] => {
  const reason = todo.reason || '보완 사항 확인 필요';
  const source = todo.agentTypeCode === 'legal' ? 'law' : todo.agentTypeCode === 'vision' ? 'vision' : 'matching';
  if (todo.todoId) {
    const categoryId = getCategoryIdFromTodoCode(todo.categoryCode);
    if (todo.agentTypeCode === 'link') {
      return [{
        id: `orchestrator:${todo.todoId}:link-review`,
        backendTodoId: todo.todoId,
        backendConfirmed: Boolean(todo.confirmed),
        backendAgentTypeCode: todo.agentTypeCode,
        backendCategoryName: todo.categoryName || null,
        mode: 'add',
        source,
        kind: 'other_document',
        title: '증빙 매칭 검토 필요',
        context: todo.usageStatementItemName || '',
        categoryId,
        usageItemId: todo.usageStatementItemId == null ? undefined : String(todo.usageStatementItemId),
        detail: translateTodoDisplayText(reason, todo.usageStatementItemName),
      }];
    }
    const titleText = todo.title || '';
    const fallbackKind = todo.agentTypeCode === 'vision' ? 'site_photo' : inferEvidenceKindFromText(`${titleText} ${reason}`);
    const evidenceTypeCodes = todo.evidenceTypeCodes || [];
    const evidenceCodeNames = (todo.evidenceTypeCodes || [])
      .map((code) => translateEvidenceDocumentName(code))
      .filter(Boolean);
    const documentNames = todo.agentTypeCode === 'legal'
      ? [getBackendTodoDisplayTitle(todo)]
      : evidenceCodeNames.length > 0
        ? evidenceCodeNames
        : extractEvidenceDocumentNames(`${titleText} ${reason}`, fallbackKind);
    const titles = documentNames.length > 0 ? documentNames : [getTodoDocumentTitle(`${titleText} ${reason}`, fallbackKind)];
    return titles.map((title, index) => {
      const translatedTitle = translateEvidenceDocumentName(title) || title;
      return {
        id: `orchestrator:${todo.todoId}:${normalizeTodoIdText(translatedTitle)}:${index}`,
        backendTodoId: todo.todoId,
        backendConfirmed: Boolean(todo.confirmed),
        backendAgentTypeCode: todo.agentTypeCode,
        backendCategoryName: todo.categoryName || null,
        mode: 'add',
        source,
        kind: todo.agentTypeCode === 'vision' ? 'site_photo' : inferEvidenceKindFromText(translatedTitle || reason),
        requiredEvidenceTypeCode: evidenceTypeCodes[index] || evidenceTypeCodes[0],
        title: translatedTitle,
        context: todo.usageStatementItemName || '',
        categoryId,
        usageItemId: todo.usageStatementItemId == null ? undefined : String(todo.usageStatementItemId),
        detail: reason,
      };
    });
  }
  const usageItemById = todo.usageStatementItemId == null
    ? undefined
    : usageItems.find((item) => String(item.id) === String(todo.usageStatementItemId));
  const usageItemByName = todo.usageStatementItemName
    ? usageItems.find((item) => normalizeTodoLookupText(item.name) === normalizeTodoLookupText(todo.usageStatementItemName || ''))
    : undefined;
  const usageItem = usageItemById || usageItemByName;
  const backendCategory = getCategoryFromBackendTodo(todo);
  const titleText = todo.title || '';
  const fallbackKind = todo.agentTypeCode === 'vision' ? 'site_photo' : inferEvidenceKindFromText(reason);
  const evidenceTypeCodes = todo.evidenceTypeCodes || [];
  const evidenceCodeNames = (todo.evidenceTypeCodes || [])
    .map((code) => translateEvidenceDocumentName(code))
    .filter(Boolean);
  const documentNames = evidenceCodeNames.length > 0
    ? evidenceCodeNames
    : extractEvidenceDocumentNames(`${titleText} ${reason}`, fallbackKind);
  const linkedFileKey = todo.fileId || (todo.fileIds && todo.fileIds.length ? todo.fileIds.join('-') : 'none');
  const baseId = `orchestrator:${todo.agentTypeCode}:${todo.usageStatementItemId || 'all'}:${linkedFileKey}`;
  const titles = documentNames.length > 0 ? documentNames : [getTodoDocumentTitle(`${titleText} ${reason}`, fallbackKind)];

  return titles.map((title, index) => {
    const lookupText = `${titleText} ${reason} ${title}`;
    const inferredUsageItem = usageItem || findUsageItemFromTodoText(lookupText, usageItems);
    const inferredCategory = inferredUsageItem ? undefined : (backendCategory || findCategoryFromTodoText(lookupText));
    const kind = todo.agentTypeCode === 'vision' ? 'site_photo' : inferEvidenceKindFromText(title || reason);
    const translatedTitle = translateEvidenceDocumentName(title) || title;
    return {
      id: `${baseId}:${normalizeTodoIdText(title)}:${index}`,
      backendTodoId: todo.todoId ?? null,
      backendConfirmed: Boolean(todo.confirmed),
      backendAgentTypeCode: todo.agentTypeCode,
      backendCategoryName: todo.categoryName || null,
      mode: 'add',
      source,
      kind,
      requiredEvidenceTypeCode: evidenceTypeCodes[index] || evidenceTypeCodes[0],
      title: translatedTitle,
      context: inferredUsageItem?.name || todo.usageStatementItemName || '',
      categoryId: inferredUsageItem?.categoryId || backendCategory?.id || inferredCategory?.id,
      usageItemId: inferredUsageItem?.id,
      detail: toNounPhraseDetail(translateEvidenceText(reason)),
    };
  });
};

// Action request and classification helpers

export const extractActionRequestEvidenceNames = (message?: string) => {
  if (!message) return [];
  const sentences = message
    .split(/[.。]\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const requestSentence = [...sentences].reverse().find((sentence) => /제출|추가/.test(sentence)) || sentences.find((sentence) => /자료|서류/.test(sentence)) || message;
  const cleaned = cleanEvidenceTodoText(requestSentence);
  if (!cleaned || cleaned === message.trim()) return [];
  return Array.from(new Set(cleaned.split(EVIDENCE_NAME_SPLIT_PATTERN).map((name) => cleanEvidenceTodoText(name)).filter(Boolean)));
};

export const classifyUsageLineCategory = (name: string, fallbackCategoryId: number) => {
  const text = name.replace(/\s+/g, '').toLowerCase();
  const rules: Array<[number, RegExp]> = [
    [8, /본사|전담조직/],
    [7, /기술지도|재해예방전문지도|지도기관/],
    [6, /건강|검진|작업환경|측정|방진|질병|장해예방/],
    [5, /교육|강의|이수|훈련|교재/],
    [4, /진단|컨설팅|위험진단|안전보건진단/],
    [3, /보호구|안전모|안전화|안전벨트|장갑|마스크|조끼|개인보호/],
    [2, /안전시설|난간|비계|안전망|표지|방호|펜스|발판|가설/],
    [1, /관리자|임금|급여|인건비|보건관리|안전관리자/],
    [9, /위험성평가|평가|소요비용/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || fallbackCategoryId;
};
