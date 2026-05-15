import type { CSSProperties } from 'react';
import { C } from '../../lib/theme';
import type { PeriodMode } from '../../lib/project-list';

interface PeriodFilterProps {
  mode: PeriodMode;
  value: string;
  onModeChange: (mode: PeriodMode) => void;
  onValueChange: (value: string) => void;
  inputStyle: CSSProperties;
  compact?: boolean;
}

const options: Array<{ mode: Exclude<PeriodMode, 'all'>; label: string }> = [
  { mode: '1m', label: '1개월' },
  { mode: '3m', label: '3개월' },
  { mode: '6m', label: '6개월' },
];

export default function PeriodFilter({ mode, value, onModeChange, onValueChange, inputStyle, compact = false }: PeriodFilterProps) {
  const updateMode = (nextMode: Exclude<PeriodMode, 'all'>) => {
    const toggledMode: PeriodMode = mode === nextMode ? 'all' : nextMode;
    onModeChange(toggledMode);
    onValueChange('');
  };
  const [startDate = '', endDate = ''] = value.split('~').map((item) => item.trim());
  const updateDateRange = (nextStartDate: string, nextEndDate: string) => {
    onModeChange(nextStartDate || nextEndDate ? 'custom' : 'all');
    onValueChange(nextStartDate || nextEndDate ? `${nextStartDate}~${nextEndDate}` : '');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: compact ? 'max-content minmax(0, 220px)' : 'max-content minmax(280px, 360px)', alignItems: 'center', gap: compact ? 6 : 10, width: 'fit-content', maxWidth: '100%' }}>
      <div style={{ display: 'inline-flex', gap: compact ? 4 : 6, flexWrap: 'wrap' }}>
        {options.map((option) => {
          const active = mode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => updateMode(option.mode)}
              style={{
                border: `1px solid ${active ? C.light : C.g200}`,
                borderRadius: 999,
                background: active ? C.bg : C.white,
                color: active ? C.primary : C.g600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: compact ? 11 : 13,
                fontWeight: 900,
                height: compact ? 30 : 38,
                padding: compact ? '0 9px' : '0 12px',
                whiteSpace: 'nowrap',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: compact ? 4 : 6, minWidth: 0 }}>
        <input
          type="date"
          aria-label="조회 시작일"
          value={startDate}
          onChange={(event) => updateDateRange(event.target.value, endDate)}
          style={{ ...inputStyle, width: '100%' }}
        />
        <span style={{ color: C.g400, fontSize: compact ? 11 : 13, fontWeight: 900 }}>~</span>
        <input
          type="date"
          aria-label="조회 종료일"
          value={endDate}
          onChange={(event) => updateDateRange(startDate, event.target.value)}
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>
    </div>
  );
}
