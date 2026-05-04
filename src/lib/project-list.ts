import { PROJECT_STATUS_META, type ProjectSummary } from './project-data';

export type SortOption = 'name' | 'recent' | 'progress';
export type PeriodMode = 'all' | '1m' | '3m' | '6m' | 'custom';

export const SORT_LABELS: Record<SortOption, string> = {
  name: '사전순',
  recent: '최근순',
  progress: '진행 현황순',
};

interface ProjectFilterOptions {
  keyword?: string;
  projectName?: string;
  contractNumber?: string;
  period?: string;
  periodMode?: PeriodMode;
  manager?: string;
  status?: string;
  allManagerLabel?: string;
  allStatusLabel?: string;
  includeManagerStatus?: boolean;
}

const parsePeriodDate = (period: string) => {
  const [, end = ''] = period.split('~').map((value) => value.trim());
  const fallback = period.split('~')[0]?.trim() || '';
  const time = new Date((end || fallback).replace(/\//g, '-')).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const parseProjectPeriodRange = (period: string) => {
  const [start = '', end = ''] = period.split('~').map((value) => value.trim().replace(/\//g, '-'));
  const startTime = new Date(start).getTime();
  const endTime = new Date((end || start)).getTime();

  return {
    startTime: Number.isNaN(startTime) ? 0 : startTime,
    endTime: Number.isNaN(endTime) ? 0 : endTime,
  };
};

const periodModeToMonths = (mode: PeriodMode) => {
  if (mode === '1m') return 1;
  if (mode === '3m') return 3;
  if (mode === '6m') return 6;
  return 0;
};

const matchesRecentPeriod = (project: ProjectSummary, mode: PeriodMode) => {
  const months = periodModeToMonths(mode);
  if (!months) return true;

  const today = new Date(new Date().toDateString());
  const from = new Date(today);
  from.setMonth(from.getMonth() - months);
  const { startTime, endTime } = parseProjectPeriodRange(project.period);

  if (!startTime || !endTime) return false;
  return startTime <= today.getTime() && endTime >= from.getTime();
};

const progressValue = (project: ProjectSummary) => Number.parseInt(project.progressRate, 10) || 0;

export const sortProjects = (projects: ProjectSummary[], sortBy: SortOption) => {
  const nextProjects = [...projects];
  if (sortBy === 'name') {
    return nextProjects.sort((a, b) => a.constructionName.localeCompare(b.constructionName, 'ko-KR'));
  }
  if (sortBy === 'recent') {
    return nextProjects.sort((a, b) => parsePeriodDate(b.period) - parsePeriodDate(a.period));
  }
  return nextProjects.sort((a, b) => progressValue(b) - progressValue(a));
};

export const filterProjects = (projects: ProjectSummary[], options: ProjectFilterOptions) => {
  const keywordText = (options.keyword || '').trim().toLowerCase();
  const projectNameText = (options.projectName || '').trim().toLowerCase();
  const contractNumberText = (options.contractNumber || '').trim().toLowerCase();
  const periodText = (options.period || '').trim().toLowerCase();
  const periodMode = options.periodMode || 'custom';
  const includeManagerStatus = options.includeManagerStatus ?? true;
  const allManagerLabel = options.allManagerLabel || '전체';
  const allStatusLabel = options.allStatusLabel || '전체';

  return projects.filter((project) => {
    const matchesKeyword =
      !keywordText ||
      `${project.name} ${project.constructionName} ${project.contractNumber}`.toLowerCase().includes(keywordText);
    const matchesProjectName =
      !projectNameText ||
      `${project.name} ${project.constructionName}`.toLowerCase().includes(projectNameText);
    const matchesContractNumber =
      !contractNumberText ||
      project.contractNumber.toLowerCase().includes(contractNumberText);
    const matchesPeriod =
      periodMode === 'custom'
        ? !periodText || project.period.toLowerCase().includes(periodText)
        : matchesRecentPeriod(project, periodMode);
    const matchesManager =
      !includeManagerStatus || !options.manager || options.manager === allManagerLabel || project.manager === options.manager;
    const matchesStatus =
      !includeManagerStatus ||
      !options.status ||
      options.status === allStatusLabel ||
      PROJECT_STATUS_META[project.projectStatusCode].label === options.status;

    return matchesKeyword && matchesProjectName && matchesContractNumber && matchesPeriod && matchesManager && matchesStatus;
  });
};

export const getVisibleProjects = (
  projects: ProjectSummary[],
  filters: ProjectFilterOptions,
  sortBy: SortOption,
) => sortProjects(filterProjects(projects, filters), sortBy);
