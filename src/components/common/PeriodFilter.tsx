import type { CSSProperties } from 'react';
import { C } from '../../lib/theme';
import type { PeriodMode } from '../../lib/project-list';

interface PeriodFilterProps {
  mode: PeriodMode;
  value: string;
  onModeChange: (mode: PeriodMode) => void;
  onValueChange: (value: string) => void;
  inputStyle: CSSProperties;
}

const options: Array<{ mode: Exclude<PeriodMode, 'all'>; label: string }> = [
  { mode: '1m', label: '1개월' },
  { mode: '3m', label: '3개월' },
  { mode: '6m', label: '6개월' },
  { mode: 'custom', label: '직접입력' },
];

export default function PeriodFilter({ mode, value, onModeChange, onValueChange, inputStyle }: PeriodFilterProps) {
  const updateMode = (nextMode: Exclude<PeriodMode, 'all'>) => {
    const toggledMode: PeriodMode = mode === nextMode ? 'all' : nextMode;
    onModeChange(toggledMode);
    if (nextMode !== 'custom') {
      onValueChange('');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: mode === 'custom' ? 'max-content minmax(150px, 220px)' : 'max-content', alignItems: 'center', gap: 10, width: 'fit-content', maxWidth: '100%' }}>
      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
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
                fontSize: 13,
                fontWeight: 900,
                height: 38,
                padding: '0 12px',
                whiteSpace: 'nowrap',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {mode === 'custom' && (
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="2026-04 또는 2026/04/23"
          style={{ ...inputStyle, width: '100%' }}
        />
      )}
    </div>
  );
}
