'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '../../components/ui/Card';
import { AppFrame, ProjectStageStepper } from '../../components/common';
import PeriodFilter from '../../components/common/PeriodFilter';
import { C } from '../../lib/theme';
import { getAccessibleProjects, getMonthlyUsageStatements, getSheFilterOptions, STATUS_META } from '../../lib/project-data';
import { ROLE_LABELS } from '../../lib/permissions';
import { useCurrentUser } from '../../lib/dev-user';
import { getVisibleProjects, SORT_LABELS, type PeriodMode, type SortOption } from '../../lib/project-list';

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

export default function ProjectsPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const projects = getAccessibleProjects(user);
  const filterOptions = getSheFilterOptions(user);
  const [projectName, setProjectName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [period, setPeriod] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [manager, setManager] = useState(filterOptions.managers[0] || '전체');
  const [status, setStatus] = useState(filterOptions.statuses[0] || '전체');
  const [sortBy, setSortBy] = useState<SortOption>('name');

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
    }, sortBy);
  }, [contractNumber, filterOptions.managers, filterOptions.statuses, manager, period, periodMode, projectName, projects, sortBy, status]);
  const getLatestMonthLabel = (projectId: string) => {
    const statements = getMonthlyUsageStatements(projectId);
    return statements[statements.length - 1]?.label || '';
  };

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
          <div>
            <PeriodFilter mode={periodMode} value={period} onModeChange={setPeriodMode} onValueChange={setPeriod} inputStyle={inputStyle} />
          </div>
        </div>
      </Card>

      <div data-ui="projects.2" style={sortBarStyle}>
        {(Object.keys(SORT_LABELS) as SortOption[]).map((item, index, items) => (
          <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <button type="button" onClick={() => setSortBy(item)} style={sortButtonStyle(sortBy === item)}>
              {SORT_LABELS[item]}
            </button>
            {index < items.length - 1 && <span style={{ color: C.g200, fontSize: 14, fontWeight: 800 }}>|</span>}
          </span>
        ))}
      </div>

      <div data-ui="projects.3" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  <span style={{ fontSize: 12, fontWeight: 900, color: C.primary, background: C.bg, border: `1px solid ${C.g200}`, borderRadius: 999, padding: '4px 9px', whiteSpace: 'nowrap' }}>
                    {getLatestMonthLabel(project.id)}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '4px 10px' }}>
                    {STATUS_META[project.status].label}
                  </span>
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
                <ProjectStageStepper currentStage={project.stageIndex} compact />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </AppFrame>
  );
}
