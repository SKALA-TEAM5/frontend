import type { CSSProperties, RefObject } from 'react';
import Modal from '../../components/ui/Modal';
import { C } from '../../lib/theme';

interface ActionGuideModalProps {
  open: boolean;
  actionRequestDetails: {
    reason?: string;
    dueDate?: string;
    requestedAt: string;
    assignee: string;
  };
  monthLabel: string;
  closingMotion: { x: number; y: number; scale: number } | null;
  cardRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  usage_statement: '사용내역서',
  receipt: '영수증',
  tax_invoice: '세금계산서',
  tax_invoice_confirm: '세금계산서 확인서',
  third_party_lookup: '제3자발급사실조회서',
  transaction_statement: '거래명세서',
  site_photo: '현장사진',
  item_photo: '물품 사진',
  wearing_photo: '착용 확인 사진',
  work_photo: '작업 사진',
  appointment_report: '선임 신고서',
  pay_stub: '급여명세서',
  work_log: '업무일지',
  daily_output_log: '일일 출력일보',
  inspection_log: '점검일지',
  supply_ledger: '지급대장',
  inventory_ledger: '재고대장',
  edu_confirm: '교육 확인서',
  edu_attendance: '교육 참석자 명단',
  transfer_confirm: '이체확인증',
  health_checkup_result: '건강검진 결과서',
  health_checkup_contract: '건강검진 계약서',
  tech_guidance_contract: '기술지도 계약서',
  tech_guidance_report: '기술지도 보고서',
  tech_guidance_photo: '기술지도 사진',
  usage_statement_file: '사용내역서',
  usage_statement_doc: '사용내역서',
  other_document: '기타 자료',
};

const normalizeEvidenceTypeLabel = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return EVIDENCE_TYPE_LABELS[normalized] || value.trim();
};

const formatActionGuideReason = (reason: string) => {
  const withoutNumber = reason.trim().replace(/^\d+\.\s*/, '').trim();
  const missingMatch = withoutNumber.match(/^필수\s*증빙\s*누락\s*[:：]\s*(.+)$/u);
  if (missingMatch) {
    const documents = missingMatch[1]
      .split(/[,/·ㆍ，、]/)
      .map((item) => normalizeEvidenceTypeLabel(item))
      .filter(Boolean);
    if (documents.length > 0) return `${documents.join(', ')}가 누락되었습니다.`;
  }
  const translated = withoutNumber.replace(/\b[a-z][a-z0-9_-]*\b/gi, (match) => normalizeEvidenceTypeLabel(match));
  return /[.!?。]$/.test(translated) ? translated : `${translated}.`;
};

const parseActionGuideReasons = (reason: string) => {
  const normalized = reason
    .replace(/\r/g, '')
    .replace(/\s+(?=\d+\.\s*)/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized.map(formatActionGuideReason) : [];
};

export default function ActionGuideModal({
  open,
  actionRequestDetails,
  monthLabel,
  closingMotion,
  cardRef,
  onClose,
}: ActionGuideModalProps) {
  const actionGuideItems = parseActionGuideReasons(actionRequestDetails.reason || '');
  const actionGuideRequestedFiles: string[] = [];
  const actionGuideMeta = `${monthLabel ? `${monthLabel} · ` : ''}요청 ${actionRequestDetails.requestedAt} · 담당 ${actionRequestDetails.assignee}`;

  return (
    <Modal open={open} onClose={onClose} zIndex={960} maxWidth={680}>
      <div
        ref={cardRef}
        className={closingMotion ? 'action-guide-collapse' : undefined}
        style={{
          background: C.white,
          borderRadius: 6,
          border: `1px solid ${C.g200}`,
          boxShadow: '0 18px 44px rgba(0,0,0,.16)',
          overflow: 'hidden',
          ...(closingMotion ? {
            '--action-guide-x': `${closingMotion.x}px`,
            '--action-guide-y': `${closingMotion.y}px`,
            '--action-guide-scale': closingMotion.scale,
          } as CSSProperties : {}),
        }}
      >
        <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.danger }}>부족한 서류 안내</span>
              {actionRequestDetails.dueDate && <span style={{ fontSize: 12, fontWeight: 800, color: C.g600, background: C.g100, borderRadius: 999, padding: '4px 8px' }}>기한 {actionRequestDetails.dueDate}</span>}
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, color: C.g800, lineHeight: 1.35 }}>부족한 서류를 확인해 주세요</div>
            {actionGuideMeta && <div style={{ fontSize: 13, color: C.g400, fontWeight: 800, marginTop: 6 }}>{actionGuideMeta}</div>}
          </div>
          <button type="button" aria-label="부족한 서류 안내 닫기" onClick={onClose} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 25, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '18px 22px 20px' }}>
          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            {(actionGuideItems.length > 0 ? actionGuideItems : ['제출 자료를 다시 확인해 주세요.']).map((item, index) => (
              <div key={`${item}-${index}`} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: 8, alignItems: 'start', border: `1px solid ${C.g100}`, borderRadius: 6, background: '#FCFEFD', padding: '10px 12px' }}>
                <span style={{ width: 24, height: 24, borderRadius: 999, background: C.g100, color: C.g600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{index + 1}</span>
                <span style={{ minWidth: 0, fontSize: 14, color: C.g600, fontWeight: 700, lineHeight: 1.65 }}>{item}</span>
              </div>
            ))}
          </div>
          {actionGuideRequestedFiles.length > 0 && <div style={{ border: `1px solid ${C.g100}`, borderRadius: 6, background: '#FCFEFD', padding: '12px 14px', display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.g800 }}>요청 자료</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {actionGuideRequestedFiles.map((fileName) => <span key={fileName} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '4px 8px', fontSize: 13, fontWeight: 800 }}>{fileName}</span>)}
            </div>
          </div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>닫기</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
