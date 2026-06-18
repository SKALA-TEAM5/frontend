import type { UsageStatementArchiveData } from './archive-api';
import type { ProjectSummary } from './project-data';
import { parseCurrencyValue } from './usage-format';

const archiveMonthValue = (archive: UsageStatementArchiveData) => archive.statementSummary.month || '';

export const getLatestUsageStatementArchive = (archives: UsageStatementArchiveData[]) =>
  [...archives].sort((a, b) => archiveMonthValue(b).localeCompare(archiveMonthValue(a)))[0];

export const calculateProjectUsageRate = (project: ProjectSummary, archives: UsageStatementArchiveData[]) => {
  const plannedAmount = parseCurrencyValue(project.plannedAmount);
  if (plannedAmount <= 0)
    return project.usageRate;
  const latestArchive = getLatestUsageStatementArchive(archives);
  if (!latestArchive)
    return '0%';
  const usedAmount = parseCurrencyValue(latestArchive.statementSummary.cumulativeAmount);
  const rate = Math.round((usedAmount / plannedAmount) * 1000) / 10;
  return `${rate}%`;
};
