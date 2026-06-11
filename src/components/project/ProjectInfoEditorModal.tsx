'use client';

import Modal from '../ui/Modal';
import DateRangePicker from '../common/DateRangePicker';
import { C } from '../../lib/theme';

export interface ProjectInfoEditorDraft {
  contractNumber: string;
  constructionName: string;
  constructionCompany: string;
  representative: string;
  client: string;
  constructionAmount: string;
  appropriatedAmount: string;
  startDate: string;
  endDate: string;
  location: string;
  manager?: string;
  assigneeUserIds?: number[];
  sheAssigneeUserIds?: number[];
  progressRate?: string;
  usageRate?: string;
  uploadedAt?: string;
  documentWrittenDate?: string;
}

export interface ProjectAssigneeOption {
  userId: number;
  realName: string;
  employeeNo?: string;
}

interface ProjectInfoEditorModalProps {
  open: boolean;
  mode: 'create' | 'usage';
  title: string;
  subtitle: string;
  draft: ProjectInfoEditorDraft;
  error?: string;
  saving?: boolean;
  managerOptions?: string[];
  assigneeOptions?: ProjectAssigneeOption[];
  sheAssigneeOptions?: ProjectAssigneeOption[];
  saveLabel?: string;
  showStatementDates?: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (patch: Partial<ProjectInfoEditorDraft>) => void;
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 6,
  border: `1px solid ${C.g200}`,
  background: '#FBFDFC',
  color: C.g800,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: C.g400,
  marginBottom: 7,
};

const readOnlyStyle: React.CSSProperties = {
  ...fieldStyle,
  background: C.g100,
  color: C.g400,
  cursor: 'default',
};

const onlyDigits = (value: string) => value.replace(/[^\d]/g, '');

const formatAmountInput = (value?: string) => {
  const digits = onlyDigits(value || '');
  return digits ? Number(digits).toLocaleString('ko-KR') : '';
};

export default function ProjectInfoEditorModal({
  open,
  mode,
  title,
  subtitle,
  draft,
  error,
  saving,
  managerOptions = [],
  assigneeOptions = [],
  sheAssigneeOptions = [],
  saveLabel,
  showStatementDates = false,
  onClose,
  onSave,
  onChange,
}: ProjectInfoEditorModalProps) {
  const isCreate = mode === 'create';
  const selectedAssigneeUserIds = new Set(draft.assigneeUserIds || []);
  const selectedSheAssigneeUserIds = new Set(draft.sheAssigneeUserIds || []);
  const toggleAssignee = (key: 'assigneeUserIds' | 'sheAssigneeUserIds', userId: number) => {
    const selectedIds = key === 'assigneeUserIds' ? selectedAssigneeUserIds : selectedSheAssigneeUserIds;
    const currentIds = draft[key] || [];
    const next = selectedIds.has(userId)
      ? currentIds.filter((id) => id !== userId)
      : [...currentIds, userId];
    onChange({ [key]: next });
  };
  const amountInput = (key: 'constructionAmount' | 'appropriatedAmount') => (
    <input
      inputMode="numeric"
      value={formatAmountInput(draft[key])}
      onChange={(event) => onChange({ [key]: onlyDigits(event.target.value) })}
      style={fieldStyle}
    />
  );
  const constructionPeriodField = (
    <div>
      <div style={labelStyle}>공사기간</div>
      <DateRangePicker
        start={draft.startDate || ''}
        end={draft.endDate || ''}
        onChange={(startDate, endDate) => onChange({ startDate, endDate })}
        buttonStyle={fieldStyle}
        popupAlign="left"
      />
    </div>
  );
  const assigneeField = (
    label: string,
    options: ProjectAssigneeOption[],
    selectedIds: Set<number>,
    key: 'assigneeUserIds' | 'sheAssigneeUserIds',
  ) => options.length > 0 ? (
    <div style={{ gridColumn: '1 / -1' }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, border: `1px solid ${C.g200}`, borderRadius: 6, background: '#FBFDFC', padding: 10, maxHeight: 146, overflowY: 'auto' }}>
        {options.map((option) => {
          const checked = selectedIds.has(option.userId);
          return (
            <label key={option.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, border: `1px solid ${checked ? C.light : C.g100}`, borderRadius: 6, background: checked ? C.bg : C.white, padding: '8px 9px', cursor: saving ? 'not-allowed' : 'pointer' }}>
              <input type="checkbox" checked={checked} disabled={saving} onChange={() => toggleAssignee(key, option.userId)} style={{ accentColor: C.primary }} />
              <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.realName}</span>
                {option.employeeNo && <span style={{ fontSize: 11, fontWeight: 800, color: C.g400 }}>{option.employeeNo}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <Modal open={open} onClose={saving ? undefined : onClose} zIndex={965} maxWidth={820}>
      <div style={{ background: C.white, borderRadius: 6, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 15px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>{title}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.g400, marginTop: 5 }}>{subtitle}</div>
          </div>
          <button type="button" aria-label={`${title} 닫기`} onClick={onClose} disabled={saving} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 24, lineHeight: 1, opacity: saving ? 0.45 : 1 }}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            <div>
              <div style={labelStyle}>공사명</div>
              <input value={draft.constructionName || ''} onChange={(event) => onChange({ constructionName: event.target.value })} style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>프로젝트 번호</div>
              <input value={draft.contractNumber || ''} onChange={(event) => onChange({ contractNumber: event.target.value })} style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>대표자</div>
              <input value={draft.representative || ''} onChange={(event) => onChange({ representative: event.target.value })} style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>발주자</div>
              <input value={draft.client || ''} onChange={(event) => onChange({ client: event.target.value })} style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>건설업체명</div>
              <input value={draft.constructionCompany || ''} onChange={(event) => onChange({ constructionCompany: event.target.value })} style={fieldStyle} />
            </div>
            {isCreate ? (
              <div>
                <div style={labelStyle}>프로젝트 담당자</div>
                <select value={draft.manager || ''} onChange={(event) => onChange({ manager: event.target.value })} style={fieldStyle}>
                  <option value="">담당자를 선택해 주세요</option>
                  {managerOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <div style={labelStyle}>공사금액</div>
                {amountInput('constructionAmount')}
              </div>
            )}
            {isCreate ? (
              <div>
                <div style={labelStyle}>공사금액</div>
                {amountInput('constructionAmount')}
              </div>
            ) : (
              constructionPeriodField
            )}
            {isCreate ? (
              <div>
                <div style={labelStyle}>계상된 안전관리비</div>
                {amountInput('appropriatedAmount')}
              </div>
            ) : (
              <div>
                <div style={labelStyle}>소재지</div>
                <input value={draft.location || ''} onChange={(event) => onChange({ location: event.target.value })} style={fieldStyle} />
              </div>
            )}
            {isCreate ? (
              constructionPeriodField
            ) : (
              <div>
                <div style={labelStyle}>공정률</div>
                <input value={draft.progressRate || ''} onChange={(event) => onChange({ progressRate: event.target.value })} style={fieldStyle} />
              </div>
            )}
            {isCreate ? (
              <div>
                <div style={labelStyle}>소재지</div>
                <input value={draft.location || ''} onChange={(event) => onChange({ location: event.target.value })} style={fieldStyle} />
              </div>
            ) : (
              <div>
                <div style={labelStyle}>계상된 안전관리비</div>
                {amountInput('appropriatedAmount')}
              </div>
            )}
            {!isCreate && (
              <>
                {assigneeField('프로젝트 담당자', assigneeOptions, selectedAssigneeUserIds, 'assigneeUserIds')}
                {assigneeField('SHE 담당자', sheAssigneeOptions, selectedSheAssigneeUserIds, 'sheAssigneeUserIds')}
                <div>
                  <div style={labelStyle}>사용률</div>
                  <input value={draft.usageRate || '-'} readOnly style={readOnlyStyle} />
                </div>
                {showStatementDates && (
                  <>
                    <div>
                      <div style={labelStyle}>업로드일</div>
                      <input value={draft.uploadedAt || ''} readOnly style={readOnlyStyle} />
                    </div>
                    <div>
                      <div style={labelStyle}>최종수정일</div>
                      <input value={draft.documentWrittenDate || ''} readOnly style={readOnlyStyle} />
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {error && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 900, color: C.danger }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.45 : 1 }}>취소</button>
            <button type="button" onClick={onSave} disabled={saving} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: saving ? C.g200 : C.primary, color: saving ? C.g400 : C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? `${saveLabel || '저장'} 중` : (saveLabel || '저장')}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
