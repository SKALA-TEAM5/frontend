'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../lib/theme';

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDatePart = (value: string) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${Number(year)} . ${Number(month)} . ${Number(day)} .`;
};

const parseDateRangeText = (value: string) => {
  const numbers = value.match(/\d+/g) || [];
  if (numbers.length < 3) return { start: '', end: '' };
  const toDateValue = (offset: number) => {
    const year = Number(numbers[offset]);
    const month = Number(numbers[offset + 1]);
    const day = Number(numbers[offset + 2]);
    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  return {
    start: toDateValue(0),
    end: numbers.length >= 6 ? toDateValue(3) : '',
  };
};

const buildCalendarCells = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      date,
      value: toDateInputValue(date),
      currentMonth: date.getMonth() === month,
    };
  });
};

const yearPickerScrollStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 6,
  maxHeight: 188,
  overflowY: 'auto',
  padding: '2px 1px 2px 0',
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
};

interface DateRangePickerProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  buttonStyle?: CSSProperties;
  popupAlign?: 'left' | 'right';
  placeholder?: string;
  ariaLabel?: string;
}

export default function DateRangePicker({
  start,
  end,
  onChange,
  buttonStyle,
  popupAlign = 'right',
  placeholder = '기간 선택',
  ariaLabel = '기간 설정',
}: DateRangePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const [month, setMonth] = useState(() => start ? new Date(`${start}T00:00:00`) : new Date());
  const [rangeText, setRangeText] = useState('');
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const label = start && end
    ? `${formatDatePart(start)} - ${formatDatePart(end)}`
    : start
      ? `${formatDatePart(start)} -`
      : placeholder;
  const cells = useMemo(() => buildCalendarCells(month), [month]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setRangeText(label);
  }, [label, open]);

  useLayoutEffect(() => {
    if (!open || !mounted || !rootRef.current) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const popupWidth = 252;
      const popupHeight = popupRef.current?.offsetHeight || 374;
      const viewportPadding = 12;
      const preferredLeft = popupAlign === 'left' ? rect.left : rect.right - popupWidth;
      const left = Math.min(Math.max(viewportPadding, preferredLeft), window.innerWidth - popupWidth - viewportPadding);
      const belowTop = rect.bottom + 8;
      const aboveTop = rect.top - popupHeight - 8;
      const top = belowTop + popupHeight > window.innerHeight - viewportPadding && aboveTop > viewportPadding
        ? aboveTop
        : Math.min(belowTop, window.innerHeight - popupHeight - viewportPadding);
      setPopupStyle({ position: 'fixed', top: Math.max(viewportPadding, top), left, zIndex: 1200 });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [mounted, open, popupAlign]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (popupRef.current?.contains(event.target as Node)) return;
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

  const selectDay = (value: string) => {
    if (!start || end || new Date(value).getTime() < new Date(start).getTime()) {
      onChange(value, '');
      return;
    }
    onChange(start, value);
  };

  const applyRangeText = () => {
    const parsed = parseDateRangeText(rangeText);
    if (!parsed.start) {
      setRangeText(label);
      return;
    }
    onChange(parsed.start, parsed.end);
    setMonth(new Date(`${parsed.start}T00:00:00`));
  };

  const yearOptions = useMemo(() => {
    const currentYear = month.getFullYear();
    const startYear = currentYear - 12;
    return Array.from({ length: 25 }, (_, index) => startYear + index);
  }, [month]);

  return (
    <div ref={rootRef} style={{ position: 'relative', minWidth: 0 }}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((current) => !current);
          if (start) setMonth(new Date(`${start}T00:00:00`));
        }}
        style={{
          width: '100%',
          height: 38,
          border: `1px solid ${C.g200}`,
          borderRadius: 8,
          background: C.white,
          color: start ? C.g800 : C.g400,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 800,
          textAlign: 'left',
          ...buttonStyle,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.g600} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {open && mounted && createPortal((
        <div ref={popupRef} style={{ ...popupStyle, width: 252, borderRadius: 14, border: `1px solid ${C.g100}`, background: C.white, boxShadow: '0 18px 38px rgba(31,47,39,.14)', padding: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              aria-label="기간 직접 입력"
              value={rangeText}
              onChange={(event) => setRangeText(event.target.value)}
              onBlur={applyRangeText}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                applyRangeText();
              }}
              placeholder="2026. 6. 4. - 2026. 6. 19."
              style={{ width: '100%', height: 34, minWidth: 0, border: `1px solid ${C.g100}`, borderRadius: 10, padding: '0 10px', color: C.g800, background: C.white, fontFamily: 'inherit', fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }}
            />
            <button type="button" onClick={() => { onChange('', ''); setRangeText(placeholder); setYearPickerOpen(false); }} style={{ height: 32, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '0 9px', fontFamily: 'inherit', fontSize: 10, fontWeight: 900, cursor: 'pointer' }}>초기화</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="이전 달" style={{ width: 24, height: 24, border: 'none', borderRadius: 999, background: 'transparent', color: '#1683F2', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>‹</button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => setYearPickerOpen((current) => !current)}
                aria-expanded={yearPickerOpen}
                aria-label="연도 선택"
                style={{
                  height: 30,
                  border: `1px solid ${yearPickerOpen ? C.light : C.g200}`,
                  borderRadius: 9,
                  background: yearPickerOpen ? C.bg : C.white,
                  color: yearPickerOpen ? C.primary : C.g800,
                  padding: '0 10px',
                  fontFamily: 'inherit',
                  fontSize: 15,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: yearPickerOpen ? `0 0 0 3px color-mix(in srgb, ${C.bg} 70%, transparent)` : 'none',
                }}
              >
                {month.getFullYear()}년
              </button>
              <span style={{ fontSize: 15, fontWeight: 900, color: C.g800, lineHeight: 1 }}>{month.getMonth() + 1}월</span>
            </div>
            <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="다음 달" style={{ width: 24, height: 24, border: 'none', borderRadius: 999, background: 'transparent', color: '#1683F2', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>›</button>
          </div>
          {yearPickerOpen ? (
            <div className="date-range-year-grid" style={yearPickerScrollStyle}>
              {yearOptions.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => {
                    setMonth((current) => new Date(year, current.getMonth(), 1));
                    setYearPickerOpen(false);
                  }}
                  style={{ height: 30, border: `1px solid ${year === month.getFullYear() ? C.light : C.g100}`, borderRadius: 8, background: year === month.getFullYear() ? C.bg : C.white, color: year === month.getFullYear() ? C.primary : C.g800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 900 }}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => <div key={day} style={{ height: 20, display: 'grid', placeItems: 'center', color: C.g400, fontSize: 10, fontWeight: 900 }}>{day}</div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                {cells.map((cell) => {
                  const startTime = start ? new Date(`${start}T00:00:00`).getTime() : 0;
                  const endTime = end ? new Date(`${end}T00:00:00`).getTime() : 0;
                  const cellTime = cell.date.getTime();
                  const selectedStart = cell.value === start;
                  const selectedEnd = cell.value === end;
                  const inRange = Boolean(startTime && endTime && cellTime >= startTime && cellTime <= endTime);
                  return (
                    <button
                      key={cell.value}
                      type="button"
                      onClick={() => selectDay(cell.value)}
                      style={{ height: 27, border: 'none', borderRadius: selectedStart || selectedEnd ? 999 : 8, background: selectedStart || selectedEnd ? '#1683F2' : inRange ? '#DCEBFF' : 'transparent', color: selectedStart || selectedEnd ? C.white : cell.currentMonth ? C.g800 : '#9AA19D', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: selectedStart || selectedEnd ? 900 : 800 }}
                    >
                      {cell.date.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ), document.body)}
    </div>
  );
}
