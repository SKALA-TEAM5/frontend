import CenterModal from '../../components/ui/CenterModal';
import InlineLoader from '../../components/ui/InlineLoader';
import Modal from '../../components/ui/Modal';
import { C } from '../../lib/theme';
import type { ClassificationMoveNotice, UsageUploadStage } from './project-detail-types';

interface UsageStatementUploadModalsProps {
  ocrFailureReason: string;
  duplicateUsageMonthWarning: string;
  usageUploadFailureMessage: string;
  usageUploadStage: UsageUploadStage;
  classificationMoveNotices: ClassificationMoveNotice[];
  uploadCompleteConfirmOpen: boolean;
  activeSupplementTodoCount: number;
  uploadCompleteSubmitting: boolean;
  onClearOcrFailureReason: () => void;
  onClearDuplicateUsageMonthWarning: () => void;
  onClearUsageUploadFailureMessage: () => void;
  onClearClassificationMoveNotices: () => void;
  onCloseUploadCompleteConfirm: () => void;
  onConfirmUploadComplete: () => void;
}

export default function UsageStatementUploadModals({
  ocrFailureReason,
  duplicateUsageMonthWarning,
  usageUploadFailureMessage,
  usageUploadStage,
  classificationMoveNotices,
  uploadCompleteConfirmOpen,
  activeSupplementTodoCount,
  uploadCompleteSubmitting,
  onClearOcrFailureReason,
  onClearDuplicateUsageMonthWarning,
  onClearUsageUploadFailureMessage,
  onClearClassificationMoveNotices,
  onCloseUploadCompleteConfirm,
  onConfirmUploadComplete,
}: UsageStatementUploadModalsProps) {
  return (
    <>
      <CenterModal open={Boolean(ocrFailureReason)} title="사용내역서 OCR 실패" body={<div>
        <div style={{ marginBottom: 8 }}>사용내역서를 다시 업로드해주세요.</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.g100, padding: '10px 12px', color: C.g800 }}>{ocrFailureReason}</div>
      </div>} actionLabel="확인" onAction={onClearOcrFailureReason} />
      <CenterModal open={Boolean(duplicateUsageMonthWarning)} title="이미 존재하는 사용내역서" body={<div>
        <div style={{ marginBottom: 8 }}>업로드한 파일의 세부항목 사용일자가 이미 등록된 월에 해당합니다.</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.g100, padding: '10px 12px', color: C.g800, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{duplicateUsageMonthWarning}</div>
      </div>} actionLabel="확인" onAction={onClearDuplicateUsageMonthWarning} />
      <CenterModal open={Boolean(usageUploadFailureMessage)} title="사용내역서 처리 실패" body={<div>
        <div style={{ marginBottom: 8 }}>파일 업로드 후 분석 단계에서 문제가 발생했습니다.</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.g100, padding: '10px 12px', color: C.g800, lineHeight: 1.6 }}>{usageUploadFailureMessage}</div>
      </div>} actionLabel="확인" onAction={onClearUsageUploadFailureMessage} />
      <Modal open={usageUploadStage === 'classifying'} onClose={() => {}} zIndex={1200} maxWidth={520}>
        <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.18)', padding: 20 }}>
          <style>{'.usage-upload-loader [data-ui="card.1"]{margin-top:0!important;}.usage-upload-loader [data-ui="inline-loader.4"]{white-space:nowrap;}'}</style>
          <div className="usage-upload-loader">
            <InlineLoader title="사용내역서를 분석하고 있어요" body="완료될 때까지 다른 작업을 할 수 없습니다." />
          </div>
        </div>
      </Modal>
      <CenterModal open={classificationMoveNotices.length > 0} title="세부항목 분류 변경" body={<div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto', marginLeft: -36, width: 'calc(100% + 36px)' }}>
          {classificationMoveNotices.map((notice) => (
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
      </div>} actionLabel="확인" onAction={onClearClassificationMoveNotices} />
      <Modal open={uploadCompleteConfirmOpen} onClose={onCloseUploadCompleteConfirm} zIndex={930} maxWidth={420}>
        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.g200}`, boxShadow: '0 22px 52px rgba(31,47,39,.18)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 22px 17px', borderBottom: `1px solid ${C.g100}` }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.g800, lineHeight: 1.35, marginBottom: 8 }}>미완료 보완 TODO가 있습니다</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.g600, lineHeight: 1.65, whiteSpace: 'pre-line' }}>
              {`미완료 보완 TODO ${activeSupplementTodoCount}건이 남아 있습니다.\n그래도 업로드 완료 처리할까요?`}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px 18px', background: '#FAFBFA' }}>
            <button type="button" onClick={onCloseUploadCompleteConfirm} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
            <button type="button" onClick={onConfirmUploadComplete} disabled={uploadCompleteSubmitting} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: C.primary, color: C.white, fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: uploadCompleteSubmitting ? 'wait' : 'pointer', opacity: uploadCompleteSubmitting ? 0.72 : 1 }}>업로드 완료</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
