import type { CSSProperties } from 'react';
import type { MonthlyUsageStatementSummary } from '../../lib/project-data';
import { C } from '../../lib/theme';
import Modal from '../../components/ui/Modal';

interface UsageStatementMonthCreateModalProps {
  open: boolean;
  year: string;
  month: string;
  error: string;
  onYearChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onClose: () => void;
  onAdd: () => void;
}

interface UsageStatementMonthDeleteModalProps {
  target: MonthlyUsageStatementSummary | null;
  deleting: boolean;
  error: string;
  onClose: () => void;
  onDelete: () => void;
}

const monthCreateInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 44,
  border: `1px solid ${C.g200}`,
  borderRadius: 10,
  padding: '0 13px',
  background: C.white,
  color: C.g800,
  fontFamily: 'inherit',
  fontSize: 16,
  fontWeight: 800,
  outline: 'none',
};

const monthCreateButtonStyle: CSSProperties = {
  height: 40,
  borderRadius: 999,
  padding: '0 18px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
};

export function UsageStatementMonthCreateModal({
  open,
  year,
  month,
  error,
  onYearChange,
  onMonthChange,
  onClose,
  onAdd,
}: UsageStatementMonthCreateModalProps) {
  return (
    <Modal open={open} onClose={onClose} zIndex={970} maxWidth={390}>
      <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 16, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 22px 18px' }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: C.g800, marginBottom: 6 }}>사용내역서 월 추가</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.g400, lineHeight: 1.55, marginBottom: 18 }}>추가할 사용내역서의 연도와 월을 입력해 주세요.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.g600 }}>연도</span>
              <input
                value={year}
                onChange={(event) => onYearChange(event.target.value)}
                inputMode="numeric"
                placeholder="2026"
                style={monthCreateInputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.g600 }}>월</span>
              <input
                value={month}
                onChange={(event) => onMonthChange(event.target.value)}
                inputMode="numeric"
                placeholder="04"
                style={monthCreateInputStyle}
              />
            </label>
          </div>
          {error && <div style={{ marginTop: 10, borderRadius: 8, background: C.dangerBg, color: C.danger, padding: '9px 10px', fontSize: 13, fontWeight: 800 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px 18px', borderTop: `1px solid ${C.g100}`, background: '#FAFBFA' }}>
          <button type="button" onClick={onClose} style={{ ...monthCreateButtonStyle, border: `1px solid ${C.g200}`, background: C.white, color: C.g600 }}>취소</button>
          <button type="button" onClick={onAdd} style={{ ...monthCreateButtonStyle, border: 'none', minWidth: 74, background: C.primary, color: C.white }}>추가</button>
        </div>
      </div>
    </Modal>
  );
}

export function UsageStatementMonthDeleteModal({
  target,
  deleting,
  error,
  onClose,
  onDelete,
}: UsageStatementMonthDeleteModalProps) {
  return (
    <Modal open={Boolean(target)} onClose={onClose} zIndex={980} maxWidth={440}>
      <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: 22 }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: C.g800, marginBottom: 8 }}>사용내역서 월 삭제</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.g600, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          {`${target?.label || ''} 사용내역서를 삭제하시겠습니까?\n해당 월의 사용내역서와 증빙 서류가 제거됩니다.`}
        </div>
        {error && <div style={{ marginTop: 12, borderRadius: 10, background: C.dangerBg, color: C.danger, padding: '10px 12px', fontSize: 13, fontWeight: 800, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} disabled={deleting} style={{ height: 38, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: deleting ? C.g400 : C.g600, padding: '0 15px', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: deleting ? 'not-allowed' : 'pointer' }}>취소</button>
          <button type="button" onClick={onDelete} disabled={deleting} style={{ height: 38, border: 'none', borderRadius: 999, background: deleting ? C.g200 : C.danger, color: C.white, padding: '0 16px', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: deleting ? 'wait' : 'pointer' }}>{deleting ? '삭제 중' : '삭제'}</button>
        </div>
      </div>
    </Modal>
  );
}
