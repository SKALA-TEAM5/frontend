import type { RecentLawChanges } from '../../lib/law-changes-api';
import { C } from '../../lib/theme';

interface LawChangeNoticeModalProps {
  notice: RecentLawChanges | null;
  onClose: () => void;
}

const formatLawChangeDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatLawArticle = (law: { articleNo: string | null; paragraphNo: string | null; itemNo: string | null }) => {
  const parts = [
    law.articleNo ? `제${law.articleNo}조` : '',
    law.paragraphNo ? `제${law.paragraphNo}항` : '',
    law.itemNo ? `제${law.itemNo}호` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : '-';
};

const getLawChangeTypeLabel = (type: string) => ({
  created: '신설',
  added: '신설',
  updated: '개정',
  modified: '개정',
  deleted: '삭제',
  removed: '삭제',
}[type.toLowerCase()] || type);

export default function LawChangeNoticeModal({ notice, onClose }: LawChangeNoticeModalProps) {
  if (!notice) return null;
  const hasChanges = notice.hasChanges;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="law-change-notice-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(14, 28, 22, .34)',
      }}
    >
      <div style={{ width: 'min(400px, 100%)', maxHeight: 'min(680px, calc(100vh - 48px))', borderRadius: 16, border: `1px solid ${C.g200}`, background: C.white, boxShadow: '0 24px 72px rgba(14,28,22,.28)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${C.g100}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div id="law-change-notice-title" style={{ fontSize: 20, fontWeight: 800, color: C.g800 }}>법령 개정 알림</div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: C.g500, lineHeight: 1.5 }}>
              {hasChanges ? '최근 법령 변경 내용이 감지되었습니다.' : '최근 점검에서 법령 변경사항이 없습니다.'}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: C.primary, lineHeight: 1.45 }}>
              마지막 점검 {formatLawChangeDate(notice.lastRunAt)}
            </div>
          </div>
          <button type="button" aria-label="법령 개정 알림 닫기" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${C.g200}`, background: C.white, color: C.g600, fontFamily: 'inherit', fontSize: 18, fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>
        <div style={{ padding: '16px 22px 20px', overflowY: 'auto' }}>
          {hasChanges ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {notice.changedLaws.map((law, index) => (
                <div key={`${law.lawName}-${law.articleNo || index}-${law.paragraphNo || ''}-${law.itemNo || ''}`} style={{ border: `1px solid ${C.g200}`, borderRadius: 10, background: C.white, padding: '12px 14px', display: 'grid', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0, fontSize: 15, fontWeight: 800, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{law.lawName}</div>
                    <span style={{ flexShrink: 0, border: `1px solid ${C.light}`, borderRadius: 999, background: C.bg, color: C.primary, padding: '4px 8px', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>
                      {getLawChangeTypeLabel(law.changeType)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.g500 }}>{formatLawArticle(law)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ border: `1px solid ${C.g200}`, borderRadius: 10, background: '#F8FBFC', padding: '18px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.g800 }}>변경 없음</div>
              <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: C.g500, lineHeight: 1.55 }}>
                최근 법령 점검이 완료되었고, 새로 감지된 변경사항은 없습니다.
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 22px 18px', borderTop: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ height: 36, border: 'none', borderRadius: 999, background: C.primary, color: C.white, padding: '0 18px', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: `0 10px 22px ${C.primaryShadow}` }}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
