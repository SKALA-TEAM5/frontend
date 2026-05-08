'use client';

import { useEffect, useRef, useState } from 'react';
import { PROJECT_SORT_FIELD_LABELS, SORT_DIRECTION_LABELS, type ProjectSortField, type SortDirection } from '../../lib/project-list';
import { C } from '../../lib/theme';
import { ChevronIcon } from '../ui';

interface ProjectSortControlProps {
  field: ProjectSortField;
  direction: SortDirection;
  onFieldChange: (field: ProjectSortField) => void;
  onDirectionChange: (direction: SortDirection) => void;
  compact?: boolean;
}

const sortFieldOptions = Object.keys(PROJECT_SORT_FIELD_LABELS) as ProjectSortField[];
const sortDirectionOptions = Object.keys(SORT_DIRECTION_LABELS) as SortDirection[];

export default function ProjectSortControl({ field, direction, onFieldChange, onDirectionChange, compact = false }: ProjectSortControlProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        style={{
          border: `1px solid ${open ? C.light : C.g200}`,
          borderRadius: 999,
          padding: compact ? '6px 10px' : '8px 12px',
          background: open ? C.bg : C.white,
          color: C.primary,
          fontFamily: 'inherit',
          fontSize: compact ? 12 : 14,
          fontWeight: 900,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 5 : 7,
          boxShadow: open ? `0 4px 12px ${C.primaryShadow}` : '0 1px 4px rgba(0,0,0,.05)',
        }}
      >
        <span>{direction === 'asc' ? '↑' : '↓'}</span>
        <span>{PROJECT_SORT_FIELD_LABELS[field]}</span>
        <ChevronIcon direction={open ? 'up' : 'down'} size={compact ? 13 : 15} color={C.primary} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 90,
            width: 360,
            maxWidth: 'calc(100vw - 40px)',
            padding: 12,
            borderRadius: 16,
            border: `1px solid ${C.g200}`,
            background: C.white,
            boxShadow: '0 18px 44px rgba(0,0,0,.14)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
            <select
              aria-label="정렬 기준"
              value={field}
              onChange={(event) => onFieldChange(event.target.value as ProjectSortField)}
              style={{ height: 40, border: `1px solid ${C.g200}`, borderRadius: 10, padding: '0 10px', background: C.white, color: C.g800, fontSize: 14, fontWeight: 900, fontFamily: 'inherit' }}
            >
              {sortFieldOptions.map((item) => <option key={item} value={item}>{PROJECT_SORT_FIELD_LABELS[item]}</option>)}
            </select>
            <select
              aria-label="정렬 방향"
              value={direction}
              onChange={(event) => onDirectionChange(event.target.value as SortDirection)}
              style={{ height: 40, border: `1px solid ${C.g200}`, borderRadius: 10, padding: '0 10px', background: C.white, color: C.g800, fontSize: 14, fontWeight: 900, fontFamily: 'inherit' }}
            >
              {sortDirectionOptions.map((item) => <option key={item} value={item}>{SORT_DIRECTION_LABELS[item]}</option>)}
            </select>
            <button
              type="button"
              aria-label="정렬 닫기"
              onClick={() => setOpen(false)}
              style={{ width: 36, height: 36, border: 'none', borderRadius: 10, background: C.g100, color: C.g600, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              onFieldChange('name');
              onDirectionChange('asc');
            }}
            style={{ width: '100%', marginTop: 10, border: 'none', borderRadius: 10, padding: '10px 12px', background: C.g100, color: C.g600, fontFamily: 'inherit', fontSize: 14, fontWeight: 900, cursor: 'pointer', textAlign: 'left' }}
          >
            기본 정렬로 변경
          </button>
        </div>
      )}
    </div>
  );
}
