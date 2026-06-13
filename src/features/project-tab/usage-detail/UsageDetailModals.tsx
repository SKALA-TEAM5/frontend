import CenterModal from '../../../components/ui/CenterModal';
import InlineLoader from '../../../components/ui/InlineLoader';
import Modal from '../../../components/ui/Modal';
import { C } from '../../../lib/theme';
import type { UsageLineItem } from '../../../lib/evidence-utils';
import type { AddUsageItemDraft, ClassiRejectedNotice, ClassificationMoveNotice } from './usage-statement-detail-types';

interface UsageStatementAddItemModalProps {
  open: boolean;
  draft: AddUsageItemDraft;
  error: string;
  onChange: (patch: Partial<AddUsageItemDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function UsageStatementAddItemModal({
  open,
  draft,
  error,
  onChange,
  onClose,
  onSubmit,
}: UsageStatementAddItemModalProps) {
  return (
    <Modal open={open} onClose={onClose} zIndex={960} maxWidth={520}>
      <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: '24px 24px 20px' }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: C.g800, marginBottom: 8 }}>세부 항목 추가</div>
        <div style={{ fontSize: 14, color: C.g600, lineHeight: 1.6, marginBottom: 16 }}>
          입력한 항목은 classi 에이전트가 9개 항목 기준으로 분류합니다.
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.g600 }}>사용내역</span>
            <input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} autoFocus style={inputStyle} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.g600 }}>사용일자</span>
              <input type="date" value={draft.date} onChange={(event) => onChange({ date: event.target.value })} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.g600 }}>단위</span>
              <input value={draft.unit} onChange={(event) => onChange({ unit: event.target.value })} style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.g600 }}>수량</span>
              <input value={draft.quantity} onChange={(event) => onChange({ quantity: event.target.value })} inputMode="decimal" style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.g600 }}>단가</span>
              <input value={draft.unitPrice} onChange={(event) => onChange({ unitPrice: event.target.value })} inputMode="numeric" style={inputStyle} />
            </label>
          </div>
        </div>
        {error && <div style={{ marginTop: 12, color: C.danger, fontSize: 13, fontWeight: 800 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
          <button type="button" onClick={onSubmit} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: C.primary, color: C.white, fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>완료</button>
        </div>
      </div>
    </Modal>
  );
}

interface UsageStatementClassiModalsProps {
  running: boolean;
  rejectedNotice: ClassiRejectedNotice | null;
  classificationMoveNotices: ClassificationMoveNotice[];
  onDismissRejected: () => void;
  onDismissClassification: () => void;
}

export function UsageStatementClassiModals({
  running,
  rejectedNotice,
  classificationMoveNotices,
  onDismissRejected,
  onDismissClassification,
}: UsageStatementClassiModalsProps) {
  return (
    <>
      <Modal open={running} onClose={() => {}} zIndex={1200} maxWidth={560}>
        <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.18)', padding: 24 }}>
          <InlineLoader title="classi 에이전트 실행 중" body="세부 항목의 9개 항목 분류를 확인하고 있습니다." />
        </div>
      </Modal>
      <CenterModal open={Boolean(rejectedNotice)} title="세부항목 미반영" body={rejectedNotice && <RejectedNoticeCard notice={rejectedNotice} />} actionLabel="확인" onAction={onDismissRejected} />
      <CenterModal open={classificationMoveNotices.length > 0} title="세부항목 분류 결과" maxWidth={380} body={<ClassificationNoticeList notices={classificationMoveNotices} />} actionLabel="확인" onAction={onDismissClassification} />
    </>
  );
}

interface UsageStatementDeleteModalsProps {
  fileDeleteOpen: boolean;
  usageItemDeleteTarget: UsageLineItem | null;
  onCloseFileDelete: () => void;
  onConfirmFileDelete: () => void;
  onCloseUsageItemDelete: () => void;
  onConfirmUsageItemDelete: () => void;
}

export function UsageStatementDeleteModals({
  fileDeleteOpen,
  usageItemDeleteTarget,
  onCloseFileDelete,
  onConfirmFileDelete,
  onCloseUsageItemDelete,
  onConfirmUsageItemDelete,
}: UsageStatementDeleteModalsProps) {
  return (
    <>
      <ConfirmDeleteModal
        open={fileDeleteOpen}
        title="파일 삭제"
        message="이 파일을 삭제하시겠습니까?"
        onClose={onCloseFileDelete}
        onConfirm={onConfirmFileDelete}
      />
      <ConfirmDeleteModal
        open={Boolean(usageItemDeleteTarget)}
        title="세부 항목 삭제"
        message={usageItemDeleteTarget?.name ? `"${usageItemDeleteTarget.name}" 항목을 삭제하시겠습니까?` : '이 세부 항목을 삭제하시겠습니까?'}
        onClose={onCloseUsageItemDelete}
        onConfirm={onConfirmUsageItemDelete}
      />
    </>
  );
}

const inputStyle = {
  height: 42,
  minWidth: 0,
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid ${C.g200}`,
  borderRadius: 6,
  background: C.white,
  color: C.g800,
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 700,
  padding: '0 12px',
  outline: 'none',
} as const;

function RejectedNoticeCard({ notice }: { notice: ClassiRejectedNotice }) {
  return (
    <div>
      <div style={{ marginBottom: 10, fontSize: 14, color: C.g600, lineHeight: 1.6 }}>
        classi 에이전트가 입력한 세부항목을 부적절로 판단해 화면에 추가하지 않았습니다.
      </div>
      <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, padding: '10px 12px' }}>
        <div title={notice.itemName} style={{ fontSize: 14, fontWeight: 800, color: C.g800, marginBottom: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{notice.itemName}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 8 }}>
          <span title={notice.fromCategoryName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 8, padding: '6px 9px', background: C.g100, color: C.g600, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{notice.fromCategoryName}</span>
          <span style={{ color: C.danger, fontWeight: 800 }}>×</span>
          <span title={notice.toCategoryName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, border: '1px solid #FFCDD2', borderRadius: 8, padding: '6px 9px', background: C.dangerBg, color: C.danger, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{notice.toCategoryName}</span>
        </div>
        <div style={{ marginTop: 7, fontSize: 12, color: C.g600, lineHeight: 1.5 }}>{notice.reason}</div>
      </div>
    </div>
  );
}

function ClassificationNoticeList({ notices }: { notices: ClassificationMoveNotice[] }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'grid', gap: 8, width: '100%', maxHeight: 280, overflowY: 'auto' }}>
        {notices.map((notice) => (
          <div key={notice.id} style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, padding: '10px 12px' }}>
            <div title={notice.itemName} style={{ fontSize: 14, fontWeight: 800, color: C.g800, marginBottom: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{notice.itemName}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 8 }}>
              <span title={notice.fromCategoryName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 8, padding: '6px 9px', background: C.g100, color: C.g600, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{notice.fromCategoryName}</span>
              <span style={{ color: C.primary, fontWeight: 800 }}>→</span>
              <span title={notice.toCategoryName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, border: `1px solid ${C.light}`, borderRadius: 8, padding: '6px 9px', background: C.bg, color: C.primary, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{notice.toCategoryName}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  open,
  title,
  message,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} zIndex={940} maxWidth={420}>
      <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: '24px 24px 20px' }}>
        <div style={{ fontSize: 21, fontWeight: 800, color: C.g800, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: C.g600, lineHeight: 1.6, marginBottom: 18 }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
          <button type="button" onClick={onConfirm} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: C.primary, color: C.white, fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>삭제</button>
        </div>
      </div>
    </Modal>
  );
}
