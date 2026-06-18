import { useState } from 'react';
import type { MonthlyUsageStatementSummary } from '../../lib/project-data';
import {
  getNextMonthKey,
  parseProjectPeriodMonthRange,
  pendingMonthSummary,
  readPendingUsageMonths,
  writePendingUsageMonths,
} from './project-detail-utils';

interface UseUsageStatementMonthsInput {
  projectId: string;
  projectPeriod: string;
  latestMonth?: string;
  hasMonth: (month: string) => boolean;
  onMonthAdded: (month: string, statementSummary: MonthlyUsageStatementSummary) => void;
}

export default function useUsageStatementMonths({
  projectId,
  projectPeriod,
  latestMonth,
  hasMonth,
  onMonthAdded,
}: UseUsageStatementMonthsInput) {
  const [monthCreateModalOpen, setMonthCreateModalOpen] = useState(false);
  const [newMonthYear, setNewMonthYear] = useState(String(new Date().getFullYear()));
  const [newMonthNo, setNewMonthNo] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [newMonthError, setNewMonthError] = useState('');

  const openMonthCreateModal = () => {
    const nextMonth = getNextMonthKey(latestMonth);
    setNewMonthYear(nextMonth.slice(0, 4));
    setNewMonthNo(nextMonth.slice(5, 7));
    setNewMonthError('');
    setMonthCreateModalOpen(true);
  };

  const updateNewMonthYear = (value: string) => {
    setNewMonthYear(value.replace(/\D/g, '').slice(0, 4));
    setNewMonthError('');
  };

  const updateNewMonthNo = (value: string) => {
    setNewMonthNo(value.replace(/\D/g, '').slice(0, 2));
    setNewMonthError('');
  };

  const closeMonthCreateModal = () => {
    setMonthCreateModalOpen(false);
  };

  const addUsageMonth = () => {
    const year = Number(newMonthYear);
    const monthNo = Number(newMonthNo);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(monthNo) || monthNo < 1 || monthNo > 12) {
      setNewMonthError('연도와 월을 올바르게 입력해 주세요.');
      return;
    }
    const month = `${year}-${String(monthNo).padStart(2, '0')}`;
    if (hasMonth(month)) {
      setNewMonthError('이미 추가된 월입니다.');
      return;
    }
    const { startMonth, endMonth } = parseProjectPeriodMonthRange(projectPeriod);
    if (startMonth && endMonth && (month < startMonth || month > endMonth)) {
      setNewMonthError(`프로젝트 기간(${startMonth} ~ ${endMonth})에 맞지 않는 월입니다.`);
      return;
    }
    const statementSummary = pendingMonthSummary(month);
    writePendingUsageMonths(projectId, [...readPendingUsageMonths(projectId), month]);
    onMonthAdded(month, statementSummary);
    setMonthCreateModalOpen(false);
  };

  return {
    monthCreateModalOpen,
    newMonthYear,
    newMonthNo,
    newMonthError,
    setNewMonthError,
    openMonthCreateModal,
    closeMonthCreateModal,
    addUsageMonth,
    updateNewMonthYear,
    updateNewMonthNo,
  };
}
