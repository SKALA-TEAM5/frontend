'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import ProjectInfoEditorModal from '../../components/project/ProjectInfoEditorModal';
import { AppFrame, DateRangePicker } from '../../components/common';
import { type BackendUserProfile } from '../../lib/auth-api';
import { C } from '../../lib/theme';
import { USAGE_WORKFLOW_STATUS, getSheFilterOptionsFromProjects, normalizeUsageWorkflowStatus, type NewProjectInput, type ProjectSummary } from '../../lib/project-data';
import { createProject, deleteProject, listProjectManagerCandidates, listProjects, replaceProjectAssignees } from '../../lib/project-api';
import { ROLE_LABELS } from '../../lib/permissions';
import { useCurrentUser } from '../../lib/dev-user';
import { getVisibleProjects, type PeriodMode } from '../../lib/project-list';

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

const hasSupplementRequiredMonth = (project: ProjectSummary) => project.hasActionRequest;

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
            const parsed = JSON.parse(raw) as { workflowStatus?: string; actionRequestDetails?: ProjectSummary['actionRequestDetails'] };
            if (!parsed.workflowStatus) return project;
            const workflowStatus = normalizeUsageWorkflowStatus(parsed.workflowStatus);
            if (!workflowStatus) return project;
            return {
              ...project,
              hasActionRequest: workflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED,
              actionRequestDetails: workflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED ? parsed.actionRequestDetails : undefined,
              reportReady: workflowStatus === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED || workflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED,
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
    }, 'name', 'asc');
  }, [contractNumber, filterOptions.managers, filterOptions.statuses, manager, period, periodMode, projectName, projects, status]);

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
      <Card style={{ padding: '18px 20px', borderRadius: 14, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.g800 }}>
            {user.role === 'project_manager' ? '담당 프로젝트 현황' : '전체 프로젝트 현황'}
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>전체 {visibleProjects.length}건</div>
        </div>

        <div data-ui="projects.1" style={{ display: 'grid', gridTemplateColumns: 'minmax(145px, 1.1fr) minmax(110px, .85fr) minmax(105px, .78fr) minmax(105px, .78fr) minmax(190px, 1.25fr)', gap: 8, marginBottom: 24 }}>
          <input aria-label="프로젝트명" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="프로젝트 검색" style={inputStyle} />
          <input aria-label="계약번호" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} placeholder="계약번호" style={inputStyle} />
          <select aria-label="관리자" value={manager} onChange={(event) => setManager(event.target.value)} style={inputStyle}>
            {filterOptions.managers.map((item) => <option key={item} value={item}>{item === filterOptions.managers[0] ? '관리자' : item}</option>)}
          </select>
          <select aria-label="상태" value={status} onChange={(event) => setStatus(event.target.value)} style={inputStyle}>
            {filterOptions.statuses.map((item) => <option key={item} value={item}>{item === filterOptions.statuses[0] ? '상태' : item}</option>)}
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
        </div>

          <div data-ui="projects.card-grid" className="projects-card-grid" style={{ minHeight: 320 }}>
            {loading && <div style={{ gridColumn: '1 / -1', minHeight: 160, display: 'grid', placeItems: 'center', border: `1px solid ${C.g100}`, borderRadius: 12, color: C.g400, fontSize: 13, fontWeight: 900 }}>프로젝트 목록을 불러오는 중입니다.</div>}
            {!loading && loadError && <div style={{ gridColumn: '1 / -1', minHeight: 160, display: 'grid', placeItems: 'center', border: `1px solid ${C.g100}`, borderRadius: 12, color: C.danger, fontSize: 13, fontWeight: 900 }}>{loadError}</div>}
            {!loading && !loadError && visibleProjects.length === 0 && <div style={{ gridColumn: '1 / -1', minHeight: 160, display: 'grid', placeItems: 'center', border: `1px solid ${C.g100}`, borderRadius: 12, color: C.g400, fontSize: 13, fontWeight: 900 }}>조회된 프로젝트가 없습니다.</div>}
            {!loading && !loadError && visibleProjects.map((project) => {
              const progress = Math.min(100, Math.max(0, Number.parseInt(project.progressRate, 10) || 0));
              const safetyBudgetUsage = Number.parseFloat(String(project.usageRate).replace(/[^\d.]/g, '')) || 0.1;
              const hasSupplement = hasSupplementRequiredMonth(project);
              return (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    router.push(`/projects/${project.id}`);
                  }}
                  style={{ position: 'relative', minHeight: 218, padding: 16, border: `1px solid ${hasSupplement ? '#EFAEB7' : C.g200}`, borderRadius: 14, background: hasSupplement ? '#FFF5F6' : C.white, boxShadow: '0 12px 28px rgba(31,55,43,.08)', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14 }}
                >
                  {hasSupplement && <span aria-hidden="true" style={{ position: 'absolute', top: 16, right: 16, width: 9, height: 9, borderRadius: 999, background: C.danger, boxShadow: '0 0 0 4px rgba(229,57,53,.13)' }} />}
                  <div style={{ minWidth: 0, paddingRight: hasSupplement ? 16 : 0 }}>
                    <div title={project.constructionName} style={{ fontSize: 16, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.constructionName}</div>
                    <div style={{ marginTop: 5, fontSize: 12, fontWeight: 800, color: C.g600 }}>{project.contractNumber}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ border: `1px solid ${C.g200}`, borderRadius: 10, padding: '10px 11px', background: 'transparent' }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: C.g600 }}>담당자</div>
                      <div title={project.manager} style={{ marginTop: 5, fontSize: 13, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.manager}</div>
                    </div>
                    <div style={{ border: `1px solid ${C.g200}`, borderRadius: 10, padding: '10px 11px', background: 'transparent' }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: C.g600 }}>공사 기간</div>
                      <div title={project.period || '-'} style={{ marginTop: 5, fontSize: 13, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.period || '-'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, fontSize: 12, fontWeight: 900, color: C.g600 }}>
                        <span>공정률</span>
                        <span style={{ color: C.g800 }}>{progress}%</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: '#E8EEEB', overflow: 'hidden' }}>
                        <div style={{ width: `${progress}%`, height: '100%', background: progress >= 70 ? C.primary : progress >= 30 ? '#2F73B7' : '#C9545E' }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, fontSize: 12, fontWeight: 900, color: C.g600 }}>
                        <span>안전관리비 사용률</span>
                        <span style={{ color: C.g800 }}>{safetyBudgetUsage}%</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: '#E8EEEB', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(2, Math.min(100, safetyBudgetUsage))}%`, height: '100%', background: safetyBudgetUsage >= 80 ? '#C9545E' : safetyBudgetUsage >= 50 ? '#F0A22E' : C.primary }} />
                      </div>
                    </div>
                  </div>
                  {user.role !== 'project_manager' && (
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
                      style={{ alignSelf: 'flex-end', marginTop: 'auto', border: `1px solid #FFCDD2`, borderRadius: 999, background: C.dangerBg, color: C.danger, height: 30, padding: '0 12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, cursor: 'pointer', boxSizing: 'border-box' }}
                    >
                      삭제
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, color: C.g600, fontSize: 12, fontWeight: 800 }}>
          <span>전체 {projects.length}건</span>
        </div>
      </Card>
      {createProjectModal}
      {deleteProjectModal}
    </AppFrame>
  );
}
