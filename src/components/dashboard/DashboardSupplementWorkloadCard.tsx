import Card from '../ui/Card';
import { C } from '../../lib/theme';

interface DashboardSupplementWorkloadCardProps {
  monthKey: string;
  workloads: ReadonlyArray<readonly [string, { actionRequired: number; projectCount: number }]>;
}

const dashboardAnalysisCardHeight = 258;

const dashboardPanelStyle = {
  borderRadius: 'var(--ui-radius-card)',
  border: `1px solid ${C.g200}`,
  boxShadow: 'var(--ui-shadow-card)',
  background: C.white,
};

const dashboardPanelHeaderStyle = {
  minHeight: 28,
  flexShrink: 0,
  margin: '0 0 14px',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  minWidth: 0,
  borderBottom: 'none',
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  background: 'transparent',
} as const;

export default function DashboardSupplementWorkloadCard({ monthKey, workloads }: DashboardSupplementWorkloadCardProps) {
  return (
    <Card style={{ ...dashboardPanelStyle, padding: '14px 16px', height: dashboardAnalysisCardHeight, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ ...dashboardPanelHeaderStyle, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.g800 }}>담당자별 보완 진행 현황</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.primary }}>{monthKey.replace('-', '년 ')}월</div>
      </div>
      <div style={{ display: 'grid', gap: 10, flex: '1 1 auto', minHeight: 0, overflowY: 'auto', paddingRight: 6, scrollbarGutter: 'stable', overscrollBehavior: 'contain' }}>
        {workloads.length === 0 && (
          <div style={{ minHeight: 128, display: 'grid', placeItems: 'center', borderTop: `1px solid ${C.g100}`, color: C.g400, fontSize: 13, fontWeight: 600 }}>
            진행 중인 보완 요청이 없습니다.
          </div>
        )}
        {workloads.map(([managerName, workload]) => (
          <div key={managerName} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${C.g100}` }}>
            <div style={{ width: 34, height: 34, borderRadius: 999, background: C.primary, color: C.white, display: 'grid', placeItems: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{managerName}</div>
              <div style={{ marginTop: 3, fontSize: 11, fontWeight: 600, color: C.g400 }}>보완 요청 진행 중</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.g800 }}>{workload.actionRequired}건</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
