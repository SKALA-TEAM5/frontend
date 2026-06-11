'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import ProjectInfoEditorModal from '../../components/project/ProjectInfoEditorModal';
import { AppFrame, DateRangePicker } from '../../components/common';
import { type BackendUserProfile } from '../../lib/auth-api';
import { C } from '../../lib/theme';
import { PROJECT_LIFECYCLE_STATUS_META, PROJECT_STATUS, USAGE_WORKFLOW_STATUS, PROJECT_STATUS_CODE, getProjectLifecycleStatus, getProjectSheManagers, getSheFilterOptionsFromProjects, normalizeUsageWorkflowStatus, type NewProjectInput, type ProjectStatus, type ProjectSummary } from '../../lib/project-data';
import { createProject, deleteProject, listProjectManagerCandidates, listProjects, replaceProjectAssignees, updateProject } from '../../lib/project-api';
import { ROLE_LABELS } from '../../lib/permissions';
import { useCurrentUser } from '../../lib/dev-user';
import { getVisibleProjects, type PeriodMode } from '../../lib/project-list';
import { listUsageStatementArchives } from '../../lib/archive-api';

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
  background: C.white,
};

const hiddenCheckboxStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
};

const legalReviewFilterStyle = (active: boolean): React.CSSProperties => ({
  height: 38,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '0 10px',
  borderRadius: 8,
  border: `1px solid ${active ? C.light : C.g200}`,
  background: active ? '#F4FBF6' : C.white,
  color: active ? C.primary : C.g800,
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 900,
  cursor: 'pointer',
  boxShadow: active ? 'inset 0 0 0 1px rgba(24, 111, 67, .06)' : 'none',
  transition: 'background .16s ease, border-color .16s ease, color .16s ease',
  whiteSpace: 'nowrap',
});

const legalReviewCheckStyle = (active: boolean): React.CSSProperties => ({
  width: 18,
  height: 18,
  flex: '0 0 auto',
  borderRadius: 5,
  border: `1px solid ${active ? C.primary : C.g400}`,
  background: active ? C.primary : '#FAFBFA',
  color: C.white,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 900,
  lineHeight: 1,
});

const supplementRequestBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  height: 22,
  padding: '0 8px',
  borderRadius: 999,
  border: `1px solid #EFAEB7`,
  background: '#FFF4F5',
  color: C.danger,
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

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

const hasSupplementRequiredMonth = (project: ProjectSummary) => project.hasActionRequest;

const isLegalReviewWorkflow = (status?: string | null) => {
  const normalized = normalizeUsageWorkflowStatus(status);
  return normalized === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED || normalized === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED;
};

const hydrateProjectLegalReviewFilter = async (project: ProjectSummary): Promise<ProjectSummary> => {
  if (project.hasActionRequest || isLegalReviewWorkflow(project.latestUsageStatementStatusCode)) {
    return { ...project, hasLegalReviewNeededMonth: true };
  }
  try {
    const archives = await listUsageStatementArchives(project.id);
    const reviewNeededArchive = archives.find((archive) => isLegalReviewWorkflow(archive.workflowStatus));
    if (!reviewNeededArchive) {
      return { ...project, hasLegalReviewNeededMonth: false };
    }
    const workflowStatus = normalizeUsageWorkflowStatus(reviewNeededArchive.workflowStatus);
    return {
      ...project,
      hasLegalReviewNeededMonth: true,
      hasActionRequest: project.hasActionRequest || workflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED,
      latestUsageStatementStatusCode: project.latestUsageStatementStatusCode || workflowStatus || null,
    };
  } catch {
    return project;
  }
};

const projectAccordionSections: ProjectStatus[] = [
  PROJECT_STATUS.IN_PROGRESS,
  PROJECT_STATUS.OPEN,
  PROJECT_STATUS.CLOSED,
];

function ProjectsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [closeTarget, setCloseTarget] = useState<ProjectSummary | null>(null);
  const [closeError, setCloseError] = useState('');
  const [closingProjectId, setClosingProjectId] = useState('');
  const [managerCandidates, setManagerCandidates] = useState<BackendUserProfile[]>([]);
  const filterOptions = useMemo(() => getSheFilterOptionsFromProjects(projects), [projects]);
  const [projectName, setProjectName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [period, setPeriod] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [manager, setManager] = useState(filterOptions.managers[0] || '전체');
  const [status, setStatus] = useState<string>(filterOptions.statuses[0] || '전체');
  const legalReviewNeededChecked = status === '법령 검증 필요';
  const requestedStatus = searchParams.get('status') || '';
  const [openSections, setOpenSections] = useState<Record<ProjectStatus, boolean>>({
    [PROJECT_STATUS.OPEN]: false,
    [PROJECT_STATUS.IN_PROGRESS]: true,
    [PROJECT_STATUS.CLOSED]: false,
  });

  const loadProjects = useCallback(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    listProjects({ size: 10 })
      .then((items) => Promise.all(items.map(hydrateProjectLegalReviewFilter)))
      .then((items) => {
        if (!alive) return;
        setProjects(items);
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
    const refresh = () => {
      loadProjects();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [loadProjects]);

  useEffect(() => {
    listProjectManagerCandidates()
      .then(setManagerCandidates)
      .catch(() => setManagerCandidates([]));
  }, []);
  useEffect(() => {
    if (!requestedStatus)
      return;
    if (!(filterOptions.statuses as readonly string[]).includes(requestedStatus))
      return;
    setStatus(requestedStatus);
  }, [filterOptions.statuses, requestedStatus]);

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
    }, 'name', 'asc');
  }, [contractNumber, filterOptions.managers, filterOptions.statuses, manager, period, periodMode, projectName, projects, status]);
  const groupedVisibleProjects = useMemo(() => {
    return projectAccordionSections.reduce<Record<ProjectStatus, ProjectSummary[]>>((groups, section) => ({
      ...groups,
      [section]: visibleProjects.filter((project) => getProjectLifecycleStatus(project) === section),
    }), {
      [PROJECT_STATUS.OPEN]: [],
      [PROJECT_STATUS.IN_PROGRESS]: [],
      [PROJECT_STATUS.CLOSED]: [],
    });
  }, [visibleProjects]);

  const toggleSection = (section: ProjectStatus) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const closeCloseModal = () => {
    if (closingProjectId) return;
    setCloseTarget(null);
    setCloseError('');
  };

  const confirmCloseProject = async () => {
    if (!closeTarget || closingProjectId) return;
    setClosingProjectId(closeTarget.id);
    setCloseError('');
    try {
      const savedProject = await updateProject(closeTarget.id, { projectStatusCode: PROJECT_STATUS_CODE.COMPLETED });
      setProjects((current) => current.map((item) => item.id === closeTarget.id
        ? {
            ...item,
            ...savedProject,
            projectStatusCode: PROJECT_STATUS_CODE.COMPLETED,
            status: savedProject.status,
          }
        : item));
      setCloseTarget(null);
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : '프로젝트 종료 처리에 실패했습니다.');
    } finally {
      setClosingProjectId('');
    }
  };

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

  const renderProjectCard = (project: ProjectSummary) => {
    const progress = Math.min(100, Math.max(0, Number.parseInt(project.progressRate, 10) || 0));
    const safetyBudgetUsage = Number.parseFloat(String(project.usageRate).replace(/[^\d.]/g, '')) || 0.1;
    const hasSupplement = hasSupplementRequiredMonth(project);
    const projectClosed = project.projectStatusCode === PROJECT_STATUS_CODE.COMPLETED;
    const currentUserId = Number(user.id);
    const isAssignedSheManager = user.role === 'she_manager'
      && (
        (Number.isFinite(currentUserId) && Boolean(project.sheManagerUserIds?.includes(currentUserId)))
        || getProjectSheManagers(project).includes(user.name)
      );
    const canManageProjectRecord = user.role === 'system_admin' || isAssignedSheManager;
    return (
      <div
        key={project.id}
        className={`interactive-card${hasSupplement ? ' interactive-card--supplement' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/projects/${project.id}`)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          router.push(`/projects/${project.id}`);
        }}
        style={{ position: 'relative', minHeight: 198, padding: 14, border: `1px solid ${hasSupplement ? '#EFAEB7' : C.g200}`, borderRadius: 'var(--ui-radius-card)', background: hasSupplement ? '#FFFBFC' : C.white, boxShadow: 'var(--ui-shadow-card)', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div title={project.constructionName} style={{ minWidth: 0, fontSize: 16, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.constructionName}</div>
            {hasSupplement && <span style={supplementRequestBadgeStyle}>보완 요청</span>}
          </div>
          <div style={{ marginTop: 5, fontSize: 12, fontWeight: 800, color: C.g600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.contractNumber}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ border: `1px solid ${C.g200}`, borderRadius: 'var(--ui-radius-control)', padding: '9px 10px', background: 'transparent' }}>
            <div style={{ fontSize: 11, fontWeight: 750, color: C.g600 }}>담당자</div>
            <div title={project.manager} style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.manager}</div>
          </div>
          <div style={{ border: `1px solid ${C.g200}`, borderRadius: 'var(--ui-radius-control)', padding: '9px 10px', background: 'transparent' }}>
            <div style={{ fontSize: 11, fontWeight: 750, color: C.g600 }}>공사 기간</div>
            <div title={project.period || '-'} style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.period || '-'}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 9 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5, fontSize: 12, fontWeight: 900, color: C.g600 }}>
              <span>공정률</span>
              <span style={{ color: C.g800 }}>{progress}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: '#E8EEEB', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: progress >= 70 ? C.primary : progress >= 30 ? '#2F73B7' : '#C9545E' }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5, fontSize: 12, fontWeight: 900, color: C.g600 }}>
              <span>안전관리비 사용률</span>
              <span style={{ color: C.g800 }}>{safetyBudgetUsage}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: '#E8EEEB', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(2, Math.min(100, safetyBudgetUsage))}%`, height: '100%', background: safetyBudgetUsage >= 80 ? '#C9545E' : safetyBudgetUsage >= 50 ? '#F0A22E' : C.primary }} />
            </div>
          </div>
        </div>
        {canManageProjectRecord && (
          <div style={{ alignSelf: 'flex-end', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              role="button"
              tabIndex={projectClosed ? -1 : 0}
              aria-disabled={projectClosed || closingProjectId === project.id}
              onClick={(event) => {
                event.stopPropagation();
                if (projectClosed || closingProjectId === project.id) return;
                setCloseError('');
                setCloseTarget(project);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                if (projectClosed || closingProjectId === project.id) return;
                setCloseError('');
                setCloseTarget(project);
              }}
              style={{ border: `1px solid ${projectClosed ? C.g200 : C.ok}`, borderRadius: 999, background: projectClosed ? C.g100 : '#F4FBF6', color: projectClosed ? C.g400 : C.ok, height: 28, padding: '0 11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, cursor: projectClosed || closingProjectId === project.id ? 'not-allowed' : 'pointer', boxSizing: 'border-box', opacity: closingProjectId === project.id ? .65 : 1 }}
            >
              {closingProjectId === project.id ? '완료 처리 중' : projectClosed ? '완료됨' : '프로젝트 완료'}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                setDeleteError('');
                setDeleteTarget(project);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                setDeleteError('');
                setDeleteTarget(project);
              }}
              style={{ border: `1px solid #FFCDD2`, borderRadius: 999, background: C.dangerBg, color: C.danger, height: 28, padding: '0 11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, cursor: 'pointer', boxSizing: 'border-box' }}
            >
              삭제
            </span>
          </div>
        )}
      </div>
    );
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

  const closeProjectModal = (
    <Modal open={Boolean(closeTarget)} onClose={closeCloseModal} zIndex={975} maxWidth={480}>
      <div style={{ background: C.white, borderRadius: 6, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(31,55,43,.14)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 22px 12px' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 7 }}>프로젝트 종료</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.65 }}>
            {closeTarget?.constructionName || closeTarget?.name} 프로젝트를 완료됨 상태로 변경합니다. <br/> 완료 후에는 전체 프로젝트 목록에서 완료됨으로 표시됩니다.
          </div>
        </div>
        <div style={{ padding: '16px 22px 18px' }}>
          {closeError && <div style={{ border: `1px solid #FFCDD2`, borderRadius: 6, background: C.dangerBg, color: C.danger, padding: '10px 12px', fontSize: 13, fontWeight: 900, lineHeight: 1.5, marginBottom: 14 }}>{closeError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={closeCloseModal} disabled={Boolean(closingProjectId)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: closingProjectId ? 'not-allowed' : 'pointer', opacity: closingProjectId ? 0.45 : 1 }}>취소</button>
            <button type="button" onClick={confirmCloseProject} disabled={Boolean(closingProjectId)} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: closingProjectId ? C.g200 : C.ok, color: closingProjectId ? C.g400 : C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: closingProjectId ? 'wait' : 'pointer' }}>{closingProjectId ? '완료 처리 중' : '완료 처리'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );

  const deleteProjectModal = (
    <Modal open={Boolean(deleteTarget)} onClose={closeDeleteModal} zIndex={980} maxWidth={480}>
      <div style={{ background: C.white, borderRadius: 6, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(31,55,43,.14)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 22px 12px' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 7 }}>프로젝트 삭제</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.65 }}>
            {deleteTarget?.constructionName || deleteTarget?.name} 프로젝트를 완전히 삭제합니다. <br/> 삭제 후에는 프로젝트 목록과 상세 화면에서 더 이상 확인할 수 없습니다.
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
      <Card style={{ padding: '18px 20px', borderRadius: 14, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.g800 }}>
            {user.role === 'project_manager' ? '담당 프로젝트 현황' : '전체 프로젝트 현황'}
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>전체 {visibleProjects.length}건</div>
        </div>

        <div data-ui="projects.1" style={{ display: 'grid', gridTemplateColumns: 'minmax(145px, 1.1fr) minmax(110px, .85fr) minmax(105px, .78fr) minmax(190px, 1.25fr) max-content', gap: 8, marginBottom: 24 }}>
          <input aria-label="프로젝트명" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="프로젝트 검색" style={inputStyle} />
          <input aria-label="계약번호" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} placeholder="계약번호" style={inputStyle} />
          <select aria-label="담당자" value={manager} onChange={(event) => setManager(event.target.value)} style={inputStyle}>
            {filterOptions.managers.map((item) => <option key={item} value={item}>{item === filterOptions.managers[0] ? '담당자' : item}</option>)}
          </select>
          <DateRangePicker
            start={periodMode === 'custom' ? period.split('~')[0] || '' : ''}
            end={periodMode === 'custom' ? period.split('~')[1] || '' : ''}
            onChange={(start, end) => {
              setPeriodMode(start || end ? 'custom' : 'all');
              setPeriod(`${start}~${end}`);
            }}
            buttonStyle={inputStyle}
          />
          <label style={legalReviewFilterStyle(legalReviewNeededChecked)}>
            <input
              type="checkbox"
              checked={legalReviewNeededChecked}
              onChange={(event) => setStatus(event.target.checked ? '법령 검증 필요' : (filterOptions.statuses[0] || '전체'))}
              style={hiddenCheckboxStyle}
            />
            <span aria-hidden="true" style={legalReviewCheckStyle(legalReviewNeededChecked)}>{legalReviewNeededChecked ? '✓' : ''}</span>
            <span>법령 검증 필요</span>
          </label>
        </div>

        <div style={{ display: 'grid', gap: 10, alignItems: 'start' }}>
          {loading && <div style={{ minHeight: 160, display: 'grid', placeItems: 'center', border: `1px solid ${C.g100}`, borderRadius: 12, color: C.g400, fontSize: 13, fontWeight: 900 }}>프로젝트 목록을 불러오는 중입니다.</div>}
          {!loading && loadError && <div style={{ minHeight: 160, display: 'grid', placeItems: 'center', border: `1px solid ${C.g100}`, borderRadius: 12, color: C.danger, fontSize: 13, fontWeight: 900 }}>{loadError}</div>}
          {!loading && !loadError && visibleProjects.length === 0 && <div style={{ minHeight: 160, display: 'grid', placeItems: 'center', border: `1px solid ${C.g100}`, borderRadius: 12, color: C.g400, fontSize: 13, fontWeight: 900 }}>조회된 프로젝트가 없습니다.</div>}
          {!loading && !loadError && visibleProjects.length > 0 && projectAccordionSections.map((section) => {
            const sectionProjects = groupedVisibleProjects[section];
            const sectionMeta = PROJECT_LIFECYCLE_STATUS_META[section];
            const open = openSections[section];
            return (
              <section key={section} style={{ border: `1px solid ${open ? C.light : C.g200}`, borderRadius: 'var(--ui-radius-card)', background: C.white, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleSection(section)}
                  aria-expanded={open}
                  style={{ width: '100%', height: 48, border: 'none', background: open ? 'color-mix(in srgb, var(--c-bg) 72%, #fff)' : C.white, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span aria-hidden="true" style={{ color: sectionMeta.color, fontSize: 15, fontWeight: 900, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .16s ease' }}>›</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: open ? C.primary : C.g800 }}>{sectionMeta.label}</span>
                    <span style={{ height: 22, minWidth: 28, border: `1px solid ${open ? C.light : C.g200}`, borderRadius: 999, padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: open ? C.primary : C.g600, background: open ? C.white : 'transparent', fontSize: 12, fontWeight: 900 }}>{sectionProjects.length}건</span>
                  </span>
                  <span style={{ color: open ? C.primary : C.g500, fontSize: 12, fontWeight: 900 }}>{open ? '접기' : '펼치기'}</span>
                </button>
                {open && (
                  <div style={{ borderTop: `1px solid ${C.g100}`, padding: 12 }}>
                    {sectionProjects.length > 0 ? (
                      <div data-ui={`projects.card-grid.${section}`} className="projects-card-grid">
                        {sectionProjects.map(renderProjectCard)}
                      </div>
                    ) : (
                      <div style={{ minHeight: 92, display: 'grid', placeItems: 'center', border: `1px dashed ${C.g200}`, borderRadius: 10, color: C.g400, fontSize: 13, fontWeight: 900 }}>
                        표시할 프로젝트가 없습니다.
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, color: C.g600, fontSize: 12, fontWeight: 800 }}>
          <span>전체 {projects.length}건</span>
        </div>
      </Card>
      {createProjectModal}
      {closeProjectModal}
      {deleteProjectModal}
    </AppFrame>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsPageContent />
    </Suspense>
  );
}
