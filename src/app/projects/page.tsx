'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import ProjectInfoEditorModal from '../../components/project/ProjectInfoEditorModal';
import { AppFrame, ProjectSortControl } from '../../components/common';
import PeriodFilter from '../../components/common/PeriodFilter';
import { type BackendUserProfile } from '../../lib/auth-api';
import { C } from '../../lib/theme';
import { getSheFilterOptionsFromProjects, STATUS_META, type NewProjectInput, type ProjectSummary } from '../../lib/project-data';
import { createProject, listProjectManagerCandidates, listProjects, replaceProjectAssignees } from '../../lib/project-api';
import { ROLE_LABELS } from '../../lib/permissions';
import { useCurrentUser } from '../../lib/dev-user';
import { getVisibleProjects, type PeriodMode, type ProjectSortField, type SortDirection } from '../../lib/project-list';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 2,
  border: `1px solid ${C.g200}`,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  lineHeight: '20px',
  color: C.g800,
  background: '#FBFDFC',
};

const sortBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  margin: '-6px 0 14px',
};

const LOCAL_USAGE_STATEMENT_PREFIX = 'iveri-mvp-usage-statement:';

const initialCreateForm: NewProjectInput = {
  contractNumber: '',
  constructionName: '',
  constructionCompany: '',
  representative: '',
  client: '',
  constructionAmount: '',
  appropriatedAmount: '',
  manager: '',
  startDate: '',
  endDate: '',
  location: '',
};

const createRequiredFields: Array<keyof NewProjectInput> = [
  'contractNumber',
  'constructionName',
  'constructionCompany',
  'representative',
  'client',
  'constructionAmount',
  'appropriatedAmount',
  'manager',
  'startDate',
  'endDate',
  'location',
];

export default function ProjectsPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<NewProjectInput>(initialCreateForm);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [managerCandidates, setManagerCandidates] = useState<BackendUserProfile[]>([]);
  const filterOptions = useMemo(() => getSheFilterOptionsFromProjects(projects), [projects]);
  const [projectName, setProjectName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [period, setPeriod] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [manager, setManager] = useState(filterOptions.managers[0] || '전체');
  const [status, setStatus] = useState(filterOptions.statuses[0] || '전체');
  const [sortBy, setSortBy] = useState<ProjectSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const loadProjects = useCallback(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    listProjects({ size: 10 })
      .then((items) => {
        if (!alive) return;
        const mergedItems = items.map((project) => {
          if (typeof window === 'undefined') return project;
          try {
            const raw = window.localStorage.getItem(`${LOCAL_USAGE_STATEMENT_PREFIX}${project.id}`);
            if (!raw) return project;
            const parsed = JSON.parse(raw) as { workflowStatus?: ProjectSummary['status']; actionRequestDetails?: ProjectSummary['actionRequestDetails'] };
            if (!parsed.workflowStatus) return project;
            return {
              ...project,
              status: parsed.workflowStatus,
              hasActionRequest: parsed.workflowStatus === 'supplement_required' || parsed.workflowStatus === 'supplement_uploaded',
              actionRequestDetails: parsed.workflowStatus === 'supplement_required' || parsed.workflowStatus === 'supplement_uploaded' ? parsed.actionRequestDetails : undefined,
              reportReady: parsed.workflowStatus === 'approved' || parsed.workflowStatus === 'supplement_required' || parsed.workflowStatus === 'supplement_uploaded',
            };
          } catch {
            return project;
          }
        });
        setProjects(mergedItems);
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

  useEffect(() => {
    return loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    listProjectManagerCandidates()
      .then(setManagerCandidates)
      .catch(() => setManagerCandidates([]));
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

  const updateCreateField = (key: keyof NewProjectInput, value: string) => {
    setCreateForm((current) => ({ ...current, [key]: value }));
    setCreateError('');
  };

  const closeCreateModal = () => {
    if (creating) return;
    setCreateModalOpen(false);
    setCreateForm(initialCreateForm);
    setCreateError('');
  };

  const submitCreateProject = async () => {
    const missing = createRequiredFields.find((key) => !createForm[key].trim());
    if (missing) {
      setCreateError('필수 정보를 모두 입력해 주세요.');
      return;
    }
    if (new Date(createForm.startDate).getTime() > new Date(createForm.endDate).getTime()) {
      setCreateError('공사 시작일은 마감일보다 늦을 수 없습니다.');
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      const project = await createProject(createForm);
      const selectedManager = managerCandidates.find((candidate) => candidate.realName === createForm.manager);
      if (selectedManager) {
        await replaceProjectAssignees(project.id, [selectedManager.id]);
      }
      setCreateModalOpen(false);
      setCreateForm(initialCreateForm);
      loadProjects();
      router.push(`/projects/${project.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '프로젝트 등록에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const createProjectModal = (
    <ProjectInfoEditorModal
      open={createModalOpen}
      mode="create"
      title="새 프로젝트 등록"
      subtitle="프로젝트 기본 정보를 등록한 뒤 상세 화면에서 사용내역서와 증빙을 업로드합니다."
      draft={createForm}
      error={createError}
      saving={creating}
      managerOptions={managerCandidates.map((candidate) => candidate.realName)}
      saveLabel="등록"
      onClose={closeCreateModal}
      onSave={submitCreateProject}
      onChange={(patch) => {
        Object.entries(patch).forEach(([key, value]) => {
          updateCreateField(key as keyof NewProjectInput, String(value || ''));
        });
      }}
    />
  );

  return (
    <AppFrame
      title={user.role === 'project_manager' ? '담당 프로젝트 목록' : '전체 프로젝트 목록'}
      description={`${ROLE_LABELS[user.role]} 권한으로 조회 가능한 프로젝트입니다.`}
      actions={user.role !== 'project_manager' ? <Button size="sm" onClick={() => setCreateModalOpen(true)} style={{ boxShadow: 'none' }}>새 프로젝트 등록</Button> : undefined}
    >
      <Card style={{ padding: '16px 18px', marginBottom: 14 }}>
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
          <Card key={project.id} style={{ padding: '16px 18px' }}>
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
                  <div data-ui="projects.7" style={{ color: C.g800, fontSize: 18, fontWeight: 900 }}>{project.constructionName}</div>
                  <span style={{ fontSize: 12, fontWeight: 900, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, border: `1px solid ${STATUS_META[project.status].color}`, borderRadius: 999, padding: '3px 8px', lineHeight: '16px', whiteSpace: 'nowrap' }}>
                    {STATUS_META[project.status].label}
                  </span>
                  {project.uncheckedMatchedFileCount > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 900, color: C.primary, background: C.bg, border: `1px solid ${C.primary}`, borderRadius: 999, padding: '3px 8px', lineHeight: '16px', whiteSpace: 'nowrap' }}>
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
      {createProjectModal}
    </AppFrame>
  );
}
