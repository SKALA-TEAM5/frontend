'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AppFrame } from '../../components/common';
import Card from '../../components/ui/Card';
import { C } from '../../lib/theme';
import { listUsageRecords, type UsageRecordScope, type UsageRecordSummary } from '../../lib/usage-records-api';

const SCOPES: Array<{ key: UsageRecordScope; label: string; description: string }> = [
  { key: 'user', label: '사용자별', description: '사용자 단위 토큰 사용량과 비용' },
  { key: 'project', label: '프로젝트별', description: '프로젝트 단위 AI 사용 비용' },
  { key: 'agent', label: '에이전트별', description: 'OCR, 매칭, 법령 검증 등 에이전트별 사용량' },
  { key: 'month', label: '월별', description: '월 단위 사용량 추이' },
  { key: 'date', label: '일별', description: '일 단위 사용량 추이' },
];

const currency = (value: number) => `₩ ${Math.round(value).toLocaleString('ko-KR')}`;
const formatTokens = (value: number) => value.toLocaleString('ko-KR');

const getInitialParam = (key: 'year' | 'month') => {
  if (typeof window === 'undefined') return '';
  const value = new URLSearchParams(window.location.search).get(key);
  return value || '';
};

export default function UsageRecordsPage() {
  const now = new Date();
  const [scope, setScope] = useState<UsageRecordScope>('user');
  const [year, setYear] = useState(() => getInitialParam('year') || String(new Date().getFullYear()));
  const [month, setMonth] = useState(() => {
    const initialMonth = getInitialParam('month');
    return initialMonth ? initialMonth.padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
  });
  const [rowsByScope, setRowsByScope] = useState<Record<UsageRecordScope, UsageRecordSummary[]>>({
    user: [],
    project: [],
    agent: [],
    month: [],
    date: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!year || !month) return () => {
      alive = false;
    };
    setLoading(true);
    Promise.all(SCOPES.map((item) => listUsageRecords(item.key, { year, month }).catch(() => [])))
      .then((results) => {
        if (!alive) return;
        setRowsByScope({
          user: results[0] || [],
          project: results[1] || [],
          agent: results[2] || [],
          month: results[3] || [],
          date: results[4] || [],
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [month, year]);

  const activeRows = rowsByScope[scope];
  const totals = useMemo(() => activeRows.reduce((summary, row) => ({
    tokens: summary.tokens + row.tokens,
    calls: summary.calls + row.calls,
    cost: summary.cost + row.cost,
  }), { tokens: 0, calls: 0, cost: 0 }), [activeRows]);
  const activeScope = SCOPES.find((item) => item.key === scope) || SCOPES[0];

  const pageStyle: CSSProperties = {
    width: 'min(1280px, calc(100vw - 80px))',
    margin: '0 auto',
    display: 'grid',
    gap: 18,
  };

  const compactButtonStyle = (active: boolean): CSSProperties => ({
    height: 34,
    border: `1px solid ${active ? C.primary : C.g200}`,
    borderRadius: 999,
    background: active ? C.primary : C.white,
    color: active ? C.white : C.g600,
    padding: '0 14px',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <AppFrame title="AI 사용량" mainClassName="dashboard-main">
      <div style={pageStyle}>
        <section style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, paddingTop: 10 }}>
          <div>
            <h1 style={{ margin: '6px 0 0', fontSize: 28, lineHeight: 1.2, fontWeight: 800, color: C.g800 }}>AI 토큰 사용량</h1>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, fontWeight: 700, color: C.g500 }}>
              사용자, 프로젝트, 에이전트, 월, 일 기준으로 집계된 토큰 사용량과 비용을 확인합니다.
            </p>
          </div>
          <Link href="/dashboard" style={{ height: 38, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '0 16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 13, fontWeight: 800 }}>
            대시보드로 돌아가기
          </Link>
        </section>

        <Card style={{ padding: 18, borderRadius: 14, display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {SCOPES.map((item) => (
                <button key={item.key} type="button" onClick={() => setScope(item.key)} style={compactButtonStyle(scope === item.key)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <select aria-label="사용량 조회 연도" value={year} onChange={(event) => setYear(event.target.value)} style={{ height: 36, width: 92, border: `1px solid ${C.g200}`, borderRadius: 10, background: C.white, color: C.g800, fontSize: 13, fontWeight: 800, padding: '0 10px' }}>
                {Array.from({ length: 5 }, (_, index) => String(now.getFullYear() - index)).map((option) => (
                  <option key={option} value={option}>{option}년</option>
                ))}
              </select>
              <select aria-label="사용량 조회 월" value={month} onChange={(event) => setMonth(event.target.value)} style={{ height: 36, width: 76, border: `1px solid ${C.g200}`, borderRadius: 10, background: C.white, color: C.g800, fontSize: 13, fontWeight: 800, padding: '0 10px' }}>
                {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((option) => (
                  <option key={option} value={option}>{Number(option)}월</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            {[
              { label: '총 사용 금액', value: currency(totals.cost), tone: C.primary },
              { label: '총 토큰', value: formatTokens(totals.tokens), tone: '#4269D0FF' },
              { label: '호출 수', value: `${totals.calls.toLocaleString('ko-KR')}회`, tone: '#EFB118FF' },
            ].map((item) => (
              <div key={item.label} style={{ border: `1px solid ${C.g100}`, borderRadius: 12, background: 'color-mix(in srgb, var(--c-bg) 30%, #fff)', padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.g500 }}>{item.label}</div>
                <div style={{ marginTop: 8, fontSize: 24, lineHeight: 1.15, fontWeight: 800, color: item.tone }}>{item.value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 0, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${C.g100}` }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.g800 }}>{activeScope.label} 사용량</div>
              <div style={{ marginTop: 5, fontSize: 12, fontWeight: 700, color: C.g500 }}>{activeScope.description}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.g500 }}>{year}년 {Number(month)}월</div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'color-mix(in srgb, var(--c-bg) 42%, #fff)' }}>
                  {['항목', '토큰', '호출 수', '사용 금액'].map((label) => (
                    <th key={label} style={{ padding: '13px 18px', textAlign: label === '항목' ? 'left' : 'right', fontSize: 12, fontWeight: 900, color: C.g600, borderBottom: `1px solid ${C.g100}` }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} style={{ padding: '56px 18px', textAlign: 'center', color: C.g400, fontSize: 13, fontWeight: 800 }}>
                      사용량을 불러오는 중입니다.
                    </td>
                  </tr>
                )}
                {!loading && activeRows.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '56px 18px', textAlign: 'center', color: C.g400, fontSize: 13, fontWeight: 800 }}>
                      표시할 사용량 데이터가 없습니다.
                    </td>
                  </tr>
                )}
                {!loading && activeRows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${C.g100}` }}>
                    <td style={{ padding: '15px 18px', fontSize: 14, fontWeight: 800, color: C.g800 }}>{row.label}</td>
                    <td style={{ padding: '15px 18px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: C.g600 }}>{formatTokens(row.tokens)}</td>
                    <td style={{ padding: '15px 18px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: C.g600 }}>{row.calls.toLocaleString('ko-KR')}회</td>
                    <td style={{ padding: '15px 18px', textAlign: 'right', fontSize: 15, fontWeight: 900, color: C.primary }}>{currency(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppFrame>
  );
}
