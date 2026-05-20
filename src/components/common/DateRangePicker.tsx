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
  const label = start && end
    ? `${formatDatePart(start)} - ${formatDatePart(end)}`
    : start
      ? `${formatDatePart(start)} -`
      : placeholder;
  const cells = useMemo(() => buildCalendarCells(month), [month]);

  useEffect(() => {
    setMounted(true);
  }, []);

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
            <div style={{ border: `1px solid ${C.g100}`, borderRadius: 10, padding: '7px 9px', color: C.g800, fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
            <button type="button" onClick={() => { onChange('', ''); setOpen(false); }} style={{ height: 28, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '0 8px', fontFamily: 'inherit', fontSize: 10, fontWeight: 900, cursor: 'pointer' }}>초기화</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 10 }}>
            <input aria-label="시작일" type="date" value={start} onChange={(event) => { onChange(event.target.value, end); if (event.target.value) setMonth(new Date(`${event.target.value}T00:00:00`)); }} style={{ height: 30, minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 8, padding: '0 8px', color: C.g800, fontSize: 10, fontWeight: 800 }} />
            <input aria-label="종료일" type="date" value={end} onChange={(event) => { onChange(start, event.target.value); if (event.target.value) setMonth(new Date(`${event.target.value}T00:00:00`)); }} style={{ height: 30, minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 8, padding: '0 8px', color: C.g800, fontSize: 10, fontWeight: 800 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="이전 달" style={{ width: 24, height: 24, border: 'none', borderRadius: 999, background: 'transparent', color: '#1683F2', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>‹</button>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>{month.getFullYear()}년 {month.getMonth() + 1}월</div>
            <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="다음 달" style={{ width: 24, height: 24, border: 'none', borderRadius: 999, background: 'transparent', color: '#1683F2', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>›</button>
          </div>
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
        </div>
      ), document.body)}
    </div>
  );
}
