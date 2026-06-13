import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import { C } from '../../lib/theme';

interface UsageStatementInfoTableProps {
  rows: ReadonlyArray<ReadonlyArray<string>>;
  scrollStyle: CSSProperties;
  gridStyle: CSSProperties;
}

export default function UsageStatementInfoTable({ rows, scrollStyle, gridStyle }: UsageStatementInfoTableProps) {
  return (
    <div className="thin-x-scroll" style={scrollStyle}>
      <div data-ui="project-detail.16" style={{ ...gridStyle, border: `1px solid ${C.g200}`, borderRadius: 12, overflow: 'hidden', fontSize: 14 }}>
        {rows.map(([labelA, valueA, labelB, valueB, labelC, valueC]) => (
          <Fragment key={`${labelA}-${labelB}`}>
            <div data-ui="project-detail.17" style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 800, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>{labelA}</div>
            <div data-ui="project-detail.18" title={valueA} style={{ gridColumn: labelB ? undefined : 'span 3', padding: '9px 11px', color: C.g800, fontWeight: 700, borderRight: labelB ? `1px solid ${C.g200}` : 'none', borderBottom: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueA}</div>
            {labelB && (
              <>
                {labelC ? (
                  <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '125px minmax(0, 1fr) 125px minmax(0, 1fr)', borderBottom: `1px solid ${C.g200}` }}>
                    {[
                      [labelB, valueB || ''],
                      [labelC, valueC || ''],
                    ].map(([label, value], index) => (
                      <Fragment key={label}>
                        <div style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 800, borderRight: `1px solid ${C.g200}` }}>{label}</div>
                        <div title={value} style={{ padding: '9px 11px', color: C.g800, fontWeight: 700, borderRight: index === 0 ? `1px solid ${C.g200}` : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <>
                    <div style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 800, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>{labelB}</div>
                    <div title={valueB} style={{ padding: '9px 11px', color: C.g800, fontWeight: 700, borderBottom: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueB}</div>
                  </>
                )}
              </>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
