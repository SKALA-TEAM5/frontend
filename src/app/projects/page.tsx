'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '../../components/ui/Card';
import { AppFrame, ProjectSortControl } from '../../components/common';
import PeriodFilter from '../../components/common/PeriodFilter';
import { C } from '../../lib/theme';
import { getSheFilterOptionsFromProjects, PROJECT_STATUS_META, type ProjectSummary } from '../../lib/project-data';
import { listProjects } from '../../lib/project-api';
import { ROLE_LABELS } from '../../lib/permissions';
import { useCurrentUser } from '../../lib/dev-user';
import { getVisibleProjects, type PeriodMode, type ProjectSortField, type SortDirection } from '../../lib/project-list';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 42,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 12,
  border: `1px solid ${C.g200}`,
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: '20px',
  color: C.g800,
  background: C.white,
};

const sortBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  margin: '-6px 0 14px',
};

export default function ProjectsPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const filterOptions = useMemo(() => getSheFilterOptionsFromProjects(projects), [projects]);
  const [projectName, setProjectName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [period, setPeriod] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [manager, setManager] = useState(filterOptions.managers[0] || '전체');
  const [status, setStatus] = useState(filterOptions.statuses[0] || '전체');
  const [sortBy, setSortBy] = useState<ProjectSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    listProjects({ size: 10 })
      .then((items) => {
        if (alive) setProjects(items);
      })
      .catch((error) => {
        if (alive) setLoadError(error instanceof Error ? error.message : '프로젝트 목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const visibleProjects = useMemo(() => {
    return getVisibleProjects(projects, {
      projectName,
      contractNumber,
      period,
      periodMode,
      manager,
      status,
      allManagerLabel: filterOptions.managers[0],
      allStatusLabel: filterOptions.statuses[0],
      includeManagerStatus: true,
    }, sortBy, sortDirection);
  }, [contractNumber, filterOptions.managers, filterOptions.statuses, manager, period, periodMode, projectName, projects, sortBy, sortDirection, status]);

  return (
    <AppFrame
      title={user.role === 'project_manager' ? '담당 프로젝트 목록' : '전체 프로젝트 목록'}
      description={`${ROLE_LABELS[user.role]} 권한으로 조회 가능한 프로젝트입니다.`}
    >
      <Card style={{ padding: '18px 20px', marginBottom: 18 }}>
        <div
          data-ui="projects.1"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, alignItems: 'end' }}>
            <div style={{ minWidth: 0 }}>
              <input aria-label="프로젝트명" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="프로젝트명 검색" style={inputStyle} />
            </div>
            <div style={{ minWidth: 0 }}>
              <input aria-label="계약번호" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} placeholder="계약번호 검색" style={inputStyle} />
            </div>
            <div style={{ minWidth: 0 }}>
              <select aria-label="관리자" value={manager} onChange={(event) => setManager(event.target.value)} style={inputStyle}>
                {filterOptions.managers.map((item) => <option key={item} value={item}>{item === filterOptions.managers[0] ? '관리자' : item}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 0 }}>
              <select aria-label="상태" value={status} onChange={(event) => setStatus(event.target.value)} style={inputStyle}>
                {filterOptions.statuses.map((item) => <option key={item} value={item}>{item === filterOptions.statuses[0] ? '상태' : item}</option>)}
              </select>
            </div>
          </div>
        </div>
      </Card>

      <div data-ui="projects.2" style={sortBarStyle}>
        <ProjectSortControl field={sortBy} direction={sortDirection} onFieldChange={setSortBy} onDirectionChange={setSortDirection} />
        <PeriodFilter mode={periodMode} value={period} onModeChange={setPeriodMode} onValueChange={setPeriod} inputStyle={inputStyle} />
      </div>

      <div data-ui="projects.3" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading && <Card style={{ padding: 24, textAlign: 'center', color: C.g400, fontWeight: 900 }}>프로젝트 목록을 불러오는 중입니다.</Card>}
        {!loading && loadError && <Card style={{ padding: 24, textAlign: 'center', color: C.danger, fontWeight: 900 }}>{loadError}</Card>}
        {!loading && !loadError && visibleProjects.length === 0 && <Card style={{ padding: 24, textAlign: 'center', color: C.g400, fontWeight: 900 }}>조회된 프로젝트가 없습니다.</Card>}
        {visibleProjects.map((project) => (
          <Card key={project.id} style={{ padding: '18px 20px' }}>
            <div
              data-ui="projects.4"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/projects/${project.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  router.push(`/projects/${project.id}`);
                }
              }}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 18, alignItems: 'start', cursor: 'pointer', outline: 'none' }}
            >
              <div data-ui="projects.5" style={{ minWidth: 0 }}>
                <div data-ui="projects.6" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div data-ui="projects.7" style={{ color: C.g800, fontSize: 20, fontWeight: 900 }}>{project.constructionName}</div>
                  <span style={{ fontSize: 12, fontWeight: 900, color: PROJECT_STATUS_META[project.projectStatusCode].color, background: PROJECT_STATUS_META[project.projectStatusCode].bg, border: `1px solid ${C.g200}`, borderRadius: 999, padding: '3px 8px', lineHeight: '16px', whiteSpace: 'nowrap' }}>
                    {PROJECT_STATUS_META[project.projectStatusCode].label}
                  </span>
                  {project.uncheckedMatchedFileCount > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 900, color: C.primary, background: C.bg, border: `1px solid ${C.light}`, borderRadius: 999, padding: '3px 8px', lineHeight: '16px', whiteSpace: 'nowrap' }}>
                      미확인 매칭 {project.uncheckedMatchedFileCount}건
                    </span>
                  )}
                </div>
                <div data-ui="projects.8" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
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
              </div>
            </div>
          </Card>
        ))}
      </div>
    </AppFrame>
  );
}
