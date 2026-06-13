import { C } from '../../lib/theme';
import {
  STATUS_META,
  USAGE_WORKFLOW_STATUS,
  type MonthlyUsageStatementSummary,
  type UsageWorkflowStatus,
} from '../../lib/project-data';

interface UsageStatementMonthGridArchive {
  workflowStatus?: UsageWorkflowStatus;
  overviewRows?: ReadonlyArray<ReadonlyArray<string>>;
}

interface UsageStatementMonthGridProps {
  monthlyStatements: MonthlyUsageStatementSummary[];
  usageStatementsByMonth: Record<string, UsageStatementMonthGridArchive>;
  cardShadow: string;
  onSelectMonth: (month: string) => void;
  onCreateMonth: () => void;
  onRequestDelete: (statement: MonthlyUsageStatementSummary) => void;
}

export default function UsageStatementMonthGrid({
  monthlyStatements,
  usageStatementsByMonth,
  cardShadow,
  onSelectMonth,
  onCreateMonth,
  onRequestDelete,
}: UsageStatementMonthGridProps) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: C.g800 }}>월별 사용내역서</div>
          <div style={{ marginTop: 5, fontSize: 14, fontWeight: 700, color: C.g400 }}>확인할 월을 선택하거나 새 월을 추가해 주세요.</div>
        </div>
        <div style={{ height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${C.g200}`, background: C.bg, color: C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>
          {monthlyStatements.length}개월
        </div>
      </div>
      <div style={{ border: `1px solid ${C.g200}`, borderRadius: 'var(--ui-radius-card)', background: C.white, padding: 18, boxShadow: cardShadow }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {monthlyStatements.map((statement) => {
            const uploaded = Boolean(statement.sourceFileName && statement.sourceFileName !== '-');
            const archiveData = usageStatementsByMonth[statement.month];
            const hasSupplementRequest = archiveData?.workflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED;
            const workflowStatus = archiveData?.workflowStatus || (uploaded ? USAGE_WORKFLOW_STATUS.DRAFT : undefined);
            const workflowMeta = workflowStatus ? STATUS_META[workflowStatus] : undefined;
            const totalAmount = archiveData?.overviewRows?.find(([label]) => label === '계')?.[3] || statement.cumulativeAmount || '0';

            return (
              <button
                key={statement.month}
                type="button"
                onClick={() => onSelectMonth(statement.month)}
                className={`interactive-card${hasSupplementRequest ? ' interactive-card--supplement' : ''}`}
                style={{ position: 'relative', border: `1px solid ${hasSupplementRequest ? '#FFB7BC' : uploaded ? C.light : C.g200}`, borderRadius: 'var(--ui-radius-card)', background: hasSupplementRequest ? '#FFF6F7' : uploaded ? 'color-mix(in srgb, var(--c-bg) 42%, #fff)' : C.white, padding: '17px 16px', minHeight: 142, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, boxShadow: hasSupplementRequest ? '0 10px 22px rgba(229, 57, 53, .10)' : 'var(--ui-shadow-card)' }}
              >
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${statement.label} 삭제`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRequestDelete(statement);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    onRequestDelete(statement);
                  }}
                  style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 999, border: `1px solid ${hasSupplementRequest ? '#FFCDD2' : C.g200}`, background: C.white, color: hasSupplementRequest ? C.danger : C.g400, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, lineHeight: 1, cursor: 'pointer' }}
                >
                  ×
                </span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 28 }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: hasSupplementRequest ? C.danger : C.g800 }}>{statement.label}</div>
                  </div>
                  <div style={{ marginTop: 9, minHeight: 19, display: 'flex', alignItems: 'center' }}>
                    {workflowMeta && (
                      <span style={{ color: workflowMeta.color, fontSize: 13, fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                        {workflowMeta.label}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${hasSupplementRequest ? '#FFE1E4' : C.g100}`, paddingTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'end', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.g400 }}>누계</div>
                    <div title={`${totalAmount}원`} style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: hasSupplementRequest ? C.danger : uploaded ? C.primary : C.g600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{totalAmount}원</div>
                  </div>
                  <div style={{ height: 28, padding: '0 10px', borderRadius: 999, border: `1px solid ${hasSupplementRequest ? '#FFCDD2' : C.light}`, background: C.white, color: hasSupplementRequest ? C.danger : C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>보기</div>
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onCreateMonth}
            className="interactive-card"
            style={{ border: `1px dashed ${C.light}`, borderRadius: 'var(--ui-radius-card)', background: 'color-mix(in srgb, var(--c-bg) 28%, #fff)', minHeight: 142, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center', color: C.primary, boxShadow: 'var(--ui-shadow-card)' }}
          >
            <span aria-hidden="true" style={{ position: 'relative', width: 40, height: 40, borderRadius: 999, border: `1px solid ${C.primary}`, background: C.white, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ position: 'absolute', width: 16, height: 2, borderRadius: 999, background: C.primary }} />
              <span style={{ position: 'absolute', width: 2, height: 16, borderRadius: 999, background: C.primary }} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
