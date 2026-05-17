'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import ProjectInfoEditorModal from '../../components/project/ProjectInfoEditorModal';
import { AppFrame, ProjectSortControl } from '../../components/common';
import PeriodFilter from '../../components/common/PeriodFilter';
import { type BackendUserProfile } from '../../lib/auth-api';
import { C } from '../../lib/theme';
import { getSheFilterOptionsFromProjects, normalizeProjectStatus, STATUS_META, type NewProjectInput, type ProjectSummary } from '../../lib/project-data';
import { createProject, deleteProject, listProjectManagerCandidates, listProjects, replaceProjectAssignees } from '../../lib/project-api';
import { ROLE_LABELS } from '../../lib/permissions';
import { useCurrentUser } from '../../lib/dev-user';
import { getVisibleProjects, type PeriodMode, type ProjectSortField, type SortDirection } from '../../lib/project-list';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 8,
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
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
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
            const workflowStatus = normalizeProjectStatus(parsed.workflowStatus);
            return {
              ...project,
              status: workflowStatus,
              hasActionRequest: workflowStatus === 'supplement_required',
              actionRequestDetails: workflowStatus === 'supplement_required' ? parsed.actionRequestDetails : undefined,
              reportReady: workflowStatus === 'review_completed' || workflowStatus === 'supplement_required',
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

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError('');
  };

  const confirmDeleteProject = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteProject(deleteTarget.id);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(`${LOCAL_USAGE_STATEMENT_PREFIX}${deleteTarget.id}`);
      }
      setDeleteTarget(null);
      loadProjects();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '프로젝트 삭제에 실패했습니다.');
    } finally {
      setDeleting(false);
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

  const deleteProjectModal = (
    <Modal open={Boolean(deleteTarget)} onClose={closeDeleteModal} zIndex={980} maxWidth={480}>
      <div style={{ background: C.white, borderRadius: 6, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(31,55,43,.14)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 22px 12px' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 7 }}>프로젝트 삭제</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.65 }}>
            {deleteTarget?.constructionName || deleteTarget?.name} 프로젝트를 완전히 삭제합니다. 삭제 후에는 프로젝트 목록과 상세 화면에서 더 이상 확인할 수 없습니다.
          </div>
        </div>
        <div style={{ padding: '16px 22px 18px' }}>
          {deleteError && <div style={{ border: `1px solid #FFCDD2`, borderRadius: 6, background: C.dangerBg, color: C.danger, padding: '10px 12px', fontSize: 13, fontWeight: 900, lineHeight: 1.5, marginBottom: 14 }}>{deleteError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={closeDeleteModal} disabled={deleting} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.45 : 1 }}>취소</button>
            <button type="button" onClick={confirmDeleteProject} disabled={deleting} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: deleting ? C.g200 : C.danger, color: deleting ? C.g400 : C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: deleting ? 'wait' : 'pointer' }}>{deleting ? '삭제 중' : '삭제'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );

  return (
    <AppFrame
      title={user.role === 'project_manager' ? '담당 프로젝트 목록' : '전체 프로젝트 목록'}
      description={`${ROLE_LABELS[user.role]} 권한으로 조회 가능한 프로젝트입니다.`}
      actions={user.role !== 'project_manager' ? <Button size="sm" onClick={() => setCreateModalOpen(true)} style={{ boxShadow: 'none' }}>새 프로젝트 등록</Button> : undefined}
    >
      <Card style={{ padding: '16px 18px', marginBottom: 14, borderRadius: 14 }}>
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
        {loading && <Card style={{ padding: 24, borderRadius: 14, textAlign: 'center', color: C.g400, fontWeight: 900 }}>프로젝트 목록을 불러오는 중입니다.</Card>}
        {!loading && loadError && <Card style={{ padding: 24, borderRadius: 14, textAlign: 'center', color: C.danger, fontWeight: 900 }}>{loadError}</Card>}
        {!loading && !loadError && visibleProjects.length === 0 && <Card style={{ padding: 24, borderRadius: 14, textAlign: 'center', color: C.g400, fontWeight: 900 }}>조회된 프로젝트가 없습니다.</Card>}
        {visibleProjects.map((project) => (
          <Card key={project.id} style={{ padding: '16px 18px', borderRadius: 14 }}>
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
                  {user.role !== 'project_manager' && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteError('');
                        setDeleteTarget(project);
                      }}
                      style={{ marginLeft: 'auto', border: `1px solid #FFCDD2`, borderRadius: 999, background: C.dangerBg, color: C.danger, height: 30, padding: '0 12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: 'none' }}
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div data-ui="projects.8" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
                  {[
                    ['프로젝트 번호', project.contractNumber],
                    ['관리자', project.manager],
                    ['공사기간', project.period],
                    ['공정률', project.progressRate],
                  ].map(([label, value]) => (
                    <div key={label} style={{ minWidth: 0, borderRadius: 10, background: '#FBFDFC', padding: '10px 12px' }}>
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
      {deleteProjectModal}
    </AppFrame>
  );
}
