import type { MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import Card from '../ui/Card';
import type { DashboardAiUsageResponse } from '../../lib/dashboard-api';
import { C } from '../../lib/theme';

type AiUsageView = 'user' | 'project';

type AiUsageCostRow = {
  user: string;
  role: string;
  tokens: number;
  calls: number;
  cost: number;
};

interface DashboardAiUsageCardProps {
  usage: DashboardAiUsageResponse | null;
  loading: boolean;
  year: string;
  month: string;
  view: AiUsageView;
  onViewChange: (view: AiUsageView) => void;
  onTooltipShow: (event: ReactMouseEvent, title: string, body: string) => void;
  onTooltipMove: (event: ReactMouseEvent) => void;
  onTooltipHide: () => void;
}

const AI_USAGE_TOP_LIMIT = 8;
const AI_USAGE_COST_COLORS = [
  '#4269D0FF',
  '#EFB118FF',
  '#FF725CFF',
  '#6CC5B0FF',
  '#3CA951FF',
  '#FF8AB7FF',
  '#A463F2FF',
  '#97BBF5FF',
] as const;

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

const formatUsd = (value: number | string) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const roleCodeToDashboardLabel = (roleCode: string) => {
  if (roleCode === 'user') return '프로젝트 담당자';
  if (roleCode === 'system_admin') return '시스템 관리자';
  return 'SHE 담당자';
};

const getAiUsageTooltipTitle = (row: AiUsageCostRow) => row.role ? `${row.user} · ${row.role}` : row.user;

export default function DashboardAiUsageCard({
  usage,
  loading,
  year,
  month,
  view,
  onViewChange,
  onTooltipShow,
  onTooltipMove,
  onTooltipHide,
}: DashboardAiUsageCardProps) {
  const byUser = Array.isArray(usage?.byUser) ? usage.byUser : [];
  const byProject = Array.isArray(usage?.byProject) ? usage.byProject : [];
  const rows: readonly AiUsageCostRow[] = usage
    ? (view === 'user'
      ? byUser.slice(0, AI_USAGE_TOP_LIMIT).map((row) => ({
        user: row.userName,
        role: roleCodeToDashboardLabel(row.roleCode),
        tokens: Number(row.totalTokens || 0),
        calls: Number(row.callCount || 0),
        cost: Number(row.costUsd || 0),
      }))
      : byProject.slice(0, AI_USAGE_TOP_LIMIT).map((row) => ({
        user: row.projectName,
        role: '',
        tokens: Number(row.totalTokens || 0),
        calls: Number(row.callCount || 0),
        cost: Number(row.costUsd || 0),
      })))
    : [];
  const totalCost = Number(usage?.total?.totalCostUsd || 0);
  const totalTokens = Number(usage?.total?.totalTokens || 0);
  const totalCalls = Number(usage?.total?.totalCalls || 0);
  const donutRadius = 42;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let donutOffset = 0;
  const donutSegments = rows.map((row, index) => {
    const dash = totalCost > 0 ? (row.cost / totalCost) * donutCircumference : 0;
    const segment = {
      key: row.user,
      row,
      color: AI_USAGE_COST_COLORS[index % AI_USAGE_COST_COLORS.length],
      dash,
      offset: donutOffset,
    };
    donutOffset += dash;
    return segment;
  });

  return (
    <Card style={{ ...dashboardPanelStyle, padding: '14px 16px', height: dashboardAnalysisCardHeight, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ ...dashboardPanelHeaderStyle, marginBottom: 10 }}>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.g800, whiteSpace: 'nowrap' }}>AI 사용 금액</div>
          <div style={{ color: C.g500, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', minWidth: 0 }}>
            {`${year}년 ${Number(month)}월 기준`}
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div role="group" aria-label="AI 사용 금액 기준" style={{ display: 'inline-flex', alignItems: 'center', height: 30, padding: 2, border: `1px solid ${C.g200}`, borderRadius: 999, background: '#F7F8F7', flexShrink: 0, maxWidth: '100%' }}>
            {[
              { key: 'user' as const, label: '사용자별' },
              { key: 'project' as const, label: '프로젝트별' },
            ].map((option) => {
              const active = view === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onViewChange(option.key)}
                  style={{ height: 24, border: 'none', borderRadius: 999, background: active ? C.white : 'transparent', color: active ? C.primary : C.g600, padding: '0 8px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', boxShadow: active ? '0 1px 4px rgba(31,55,43,.08)' : 'none' }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <Link href={`/usage-records?year=${year}&month=${month}`} style={{ color: C.primary, fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>전체 보기 〉</Link>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 190px) minmax(0, 1fr)', gap: 8, flex: '1 1 auto', minHeight: 0, minWidth: 0 }}>
        <div style={{ width: '100%', aspectRatio: '1 / 1', justifySelf: 'start', alignSelf: 'center', boxSizing: 'border-box', border: `1px solid ${C.g100}`, borderRadius: 10, padding: '12px 14px', background: 'color-mix(in srgb, var(--c-bg) 34%, #fff)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.g600 }}>전체 사용 금액</div>
            <div style={{ display: 'grid', placeItems: 'center', marginTop: 6 }}>
              <div style={{ position: 'relative', width: 112, height: 112 }}>
                <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
                  <circle cx="56" cy="56" r={donutRadius} fill="none" stroke="color-mix(in srgb, var(--c-line) 76%, transparent)" strokeWidth="14" />
                  {donutSegments.map((segment) => (
                    <circle
                      key={segment.key}
                      cx="56"
                      cy="56"
                      r={donutRadius}
                      fill="none"
                      stroke={segment.color}
                      strokeWidth="14"
                      strokeLinecap="butt"
                      strokeDasharray={`${segment.dash} ${donutCircumference}`}
                      strokeDashoffset={-segment.offset}
                      onMouseEnter={(event) => onTooltipShow(event, getAiUsageTooltipTitle(segment.row), `${formatUsd(segment.row.cost)} · ${segment.row.calls}회`)}
                      onMouseMove={onTooltipMove}
                      onMouseLeave={onTooltipHide}
                      style={{ cursor: 'default' }}
                    />
                  ))}
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
                  <div>
                    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 13, fontWeight: 700, color: C.g800, lineHeight: 1 }}>
                      <span>{formatUsd(totalCost)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.g400 }}>총 토큰</div>
              <div style={{ marginTop: 2, fontSize: 13, fontWeight: 600, color: C.g800 }}>{totalTokens.toLocaleString('ko-KR')}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.g400 }}>호출 수</div>
              <div style={{ marginTop: 2, fontSize: 13, fontWeight: 600, color: C.g800 }}>{totalCalls.toLocaleString('ko-KR')}회</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 0, minHeight: 0, overflowY: 'auto', paddingRight: 5, scrollbarGutter: 'stable' }}>
          {loading && (
            <div style={{ minHeight: 120, display: 'grid', placeItems: 'center', borderTop: `1px solid ${C.g100}`, color: C.g400, fontSize: 13, fontWeight: 600 }}>
              사용량을 불러오는 중입니다.
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div style={{ minHeight: 120, display: 'grid', placeItems: 'center', borderTop: `1px solid ${C.g100}`, color: C.g400, fontSize: 13, fontWeight: 600 }}>
              표시할 AI 사용량이 없습니다.
            </div>
          )}
          {!loading && rows.map((row) => (
            <div key={row.user} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center', borderTop: `1px solid ${C.g100}`, padding: '10px 10px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.user}</span>
                  {row.role && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: C.g500 }}>{row.role}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 3, fontSize: 11, fontWeight: 600, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>{row.tokens.toLocaleString('ko-KR')} tokens</span>
                  <span style={{ whiteSpace: 'nowrap' }}>· {row.calls}회</span>
                </div>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 2, fontSize: 15, fontWeight: 600, color: C.g800, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <span>{formatUsd(row.cost)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
