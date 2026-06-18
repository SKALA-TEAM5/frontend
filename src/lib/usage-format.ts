import { parseUsageNumber } from './evidence-utils';

export const formatMonthLabel = (month: string) => {
  const [year, monthNo] = month.split('-');
  return `${year}년 ${Number(monthNo)}월`;
};

export const normalizeMonthKey = (month?: string | null, fallback = '') => {
  if (!month)
    return fallback;
  const match = month.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : month;
};

export const toMonthKeyFromDate = (value?: string | null) => {
  const match = value?.trim().replace(/\//g, '-').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
};

export const parseProjectPeriodMonthRange = (period: string) => {
  const [startDate = '', endDate = ''] = period.split('~').map((value) => value.trim());
  return {
    startMonth: toMonthKeyFromDate(startDate),
    endMonth: toMonthKeyFromDate(endDate),
  };
};

export const isMonthInProjectPeriod = (month: string, period: string) => {
  const monthKey = normalizeMonthKey(month);
  const { startMonth, endMonth } = parseProjectPeriodMonthRange(period);
  if (!monthKey || !startMonth || !endMonth)
    return true;
  return monthKey >= startMonth && monthKey <= endMonth;
};

export const formatProjectPeriodMonthRange = (period: string) => {
  const { startMonth, endMonth } = parseProjectPeriodMonthRange(period);
  return startMonth && endMonth ? `${formatMonthLabel(startMonth)} ~ ${formatMonthLabel(endMonth)}` : period;
};

export const outOfProjectPeriodMessage = (month: string, period: string) =>
  `${formatMonthLabel(month)} 사용내역서는 프로젝트 공사기간(${formatProjectPeriodMonthRange(period)})에 포함되지 않아 업로드할 수 없습니다.`;

export const parseProjectPeriod = (period: string) => {
  const [startDate = '', endDate = ''] = period.split('~').map((value) => value.trim().replace(/\//g, '-'));
  return { startDate, endDate };
};

export const parseCurrencyValue = (value?: string | number | null) => {
  const numeric = Number(String(value || '').replace(/[^\d]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
};

export const calculateUsageRateText = (accumulatedAmount?: string | number | null, plannedAmount?: string | number | null) => {
  const used = parseCurrencyValue(accumulatedAmount);
  const planned = parseCurrencyValue(plannedAmount);
  if (planned <= 0)
    return '0%';
  const rate = Math.round((used / planned) * 1000) / 10;
  return `${rate}%`;
};

export const formatProgressRateText = (value?: string | number | null) => {
  if (value == null || value === '')
    return '0%';
  const numeric = Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(numeric))
    return String(value).endsWith('%') ? String(value) : `${value}%`;
  return `${Math.round(numeric * 10) / 10}%`;
};

export const formatMoney = (value?: number | string | null) => {
  if (value == null || value === '') return '-';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('ko-KR') : String(value);
};

export const toUsageAmount = (value?: number | string | null) => {
  const numeric = parseUsageNumber(value);
  return Number.isFinite(numeric) ? numeric : 0;
};
