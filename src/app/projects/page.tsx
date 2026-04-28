'use client';

import { useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { AppFrame, ProjectStageStepper } from '../../components/common';
import { C } from '../../lib/theme';
import { getAccessibleProjects, getSheFilterOptions, STATUS_META, type ProjectSummary } from '../../lib/project-data';
import { ROLE_LABELS, can } from '../../lib/permissions';
import { useCurrentUser } from '../../lib/dev-user';

type SortOption = 'name' | 'recent' | 'progress';

const SORT_LABELS: Record<SortOption, string> = {
  name: '사전순',
  recent: '최근순',
  progress: '진행 현황순',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '12px 12px',
  borderRadius: 12,
  border: `1px solid ${C.g200}`,
  fontFamily: 'inherit',
  fontSize: 14,
  color: C.g800,
  background: C.white,
};

const sortBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  margin: '-6px 0 14px',
};

const sortButtonStyle = (active: boolean): React.CSSProperties => ({
  border: 'none',
  padding: 0,
  background: 'transparent',
  color: active ? C.primary : C.g600,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: active ? 900 : 800,
  cursor: 'pointer',
});

const parsePeriodDate = (period: string) => {
  const [, end = ''] = period.split('~').map((value) => value.trim());
  const fallback = period.split('~')[0]?.trim() || '';
  const time = new Date((end || fallback).replace(/\//g, '-')).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const progressValue = (project: ProjectSummary) => Number.parseInt(project.progressRate, 10) || 0;

const sortProjects = (projects: ProjectSummary[], sortBy: SortOption) => {
  const nextProjects = [...projects];
  if (sortBy === 'name') {
    return nextProjects.sort((a, b) => a.constructionName.localeCompare(b.constructionName, 'ko-KR'));
  }
  if (sortBy === 'recent') {
    return nextProjects.sort((a, b) => parsePeriodDate(b.period) - parsePeriodDate(a.period));
  }
  return nextProjects.sort((a, b) => b.stageIndex - a.stageIndex || progressValue(b) - progressValue(a));
};

export default function ProjectsPage() {
  const { user } = useCurrentUser();
  const projects = getAccessibleProjects(user);
  const filterOptions = getSheFilterOptions(user);
  const canRequestAction = can(user, 'requestAction');
  const [keyword, setKeyword] = useState('');
  const [period, setPeriod] = useState('');
  const [manager, setManager] = useState(filterOptions.managers[0] || '전체');
  const [status, setStatus] = useState(filterOptions.statuses[0] || '전체');
  const [sortBy, setSortBy] = useState<SortOption>('name');

  const visibleProjects = useMemo(() => {
    const keywordText = keyword.trim().toLowerCase();
    const periodText = period.trim().toLowerCase();
    const filteredProjects = projects.filter((project) => {
      const matchesKeyword =
        !keywordText ||
        `${project.name} ${project.constructionName} ${project.contractNumber}`.toLowerCase().includes(keywordText);
      const matchesPeriod = !periodText || project.period.toLowerCase().includes(periodText);
      const matchesManager = !canRequestAction || manager === filterOptions.managers[0] || project.manager === manager;
      const matchesStatus = !canRequestAction || status === filterOptions.statuses[0] || STATUS_META[project.status].label === status;
      return matchesKeyword && matchesPeriod && matchesManager && matchesStatus;
    });

    return sortProjects(filteredProjects, sortBy);
  }, [canRequestAction, filterOptions.managers, filterOptions.statuses, keyword, manager, period, projects, sortBy, status]);

  return (
    <AppFrame
      title={user.role === 'project_manager' ? '담당 프로젝트 목록' : '전체 프로젝트 목록'}
      description={`${ROLE_LABELS[user.role]} 권한으로 조회 가능한 프로젝트입니다.`}
    >
      <Card style={{ padding: '18px 20px', marginBottom: 18 }}>
        <div
          data-ui="app-projects-page.search-grid"
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'end',
            flexWrap: 'nowrap',
          }}
        >
          <div style={{ flex: '0 0 260px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.g400, marginBottom: 6 }}>프로젝트명 / 계약번호</div>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="프로젝트명을 검색하세요" style={inputStyle} />
          </div>
          <div style={{ flex: '0 0 170px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.g400, marginBottom: 6 }}>기간</div>
            <input value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="2026-04 ~ 2026-06" style={inputStyle} />
          </div>
          {canRequestAction && (
            <>
              <div style={{ flex: '0 0 155px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.g400, marginBottom: 6 }}>프로젝트 관리자</div>
                <select value={manager} onChange={(event) => setManager(event.target.value)} style={inputStyle}>
                  {filterOptions.managers.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div style={{ flex: '0 0 135px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.g400, marginBottom: 6 }}>상태</div>
                <select value={status} onChange={(event) => setStatus(event.target.value)} style={inputStyle}>
                  {filterOptions.statuses.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            </>
          )}
          <div style={{ flex: '0 0 76px' }}>
            <Button size="xs" style={{ height: 38, width: '100%' }}>조회</Button>
          </div>
        </div>
      </Card>

      <div data-ui="app-projects-page.sort-buttons" style={sortBarStyle}>
        {(Object.keys(SORT_LABELS) as SortOption[]).map((item, index, items) => (
          <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <button type="button" onClick={() => setSortBy(item)} style={sortButtonStyle(sortBy === item)}>
              {SORT_LABELS[item]}
            </button>
            {index < items.length - 1 && <span style={{ color: C.g200, fontSize: 14, fontWeight: 800 }}>|</span>}
          </span>
        ))}
      </div>

      <div data-ui="app-projects-page.project-list" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {visibleProjects.map((project) => (
          <Card key={project.id} style={{ padding: '18px 20px' }}>
            <div
              data-ui="app-projects-page.project-list-card"
              role="button"
              tabIndex={0}
              onClick={() => { window.location.href = `/projects/${project.id}`; }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  window.location.href = `/projects/${project.id}`;
                }
              }}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 18, alignItems: 'start', cursor: 'pointer', outline: 'none' }}
            >
              <div data-ui="app-projects-page.project-list-main" style={{ minWidth: 0 }}>
                <div data-ui="app-projects-page.project-list-title-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div data-ui="app-projects-page.project-list-title" style={{ color: C.g800, fontSize: 20, fontWeight: 900 }}>{project.constructionName}</div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '4px 10px' }}>
                    {STATUS_META[project.status].label}
                  </span>
                </div>
                <div data-ui="app-projects-page.project-list-meta" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
                  {[
                    ['프로젝트 번호', project.contractNumber],
                    ['관리자', project.manager],
                    ['공사기간', project.period],
                    ['공정률', project.progressRate],
                  ].map(([label, value]) => (
                    <div key={label} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.g400, fontWeight: 800, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 14, color: C.g800, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                    </div>
                  ))}
                </div>
                <ProjectStageStepper currentStage={project.stageIndex} compact />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </AppFrame>
  );
}
