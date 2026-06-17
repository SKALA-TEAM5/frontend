import type { KeyboardEvent } from 'react';
import { PROJECT_STATUS_CODE, getProjectSheManagers, type ProjectSummary } from '../../lib/project-data';
import type { AppUser } from '../../lib/permissions';
import { C } from '../../lib/theme';

interface ProjectCardProps {
  project: ProjectSummary;
  user: AppUser;
  closingProjectId: string;
  suspendingProjectId: string;
  openDisabled?: boolean;
  openDisabledReason?: string;
  onOpen: (project: ProjectSummary) => void;
  onSuspend: (project: ProjectSummary) => void;
  onCloseProject: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
}

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
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

const hasSupplementRequiredMonth = (project: ProjectSummary) => project.hasActionRequest;

const isActivationKey = (event: KeyboardEvent) => event.key === 'Enter' || event.key === ' ';

export default function ProjectCard({
  project,
  user,
  closingProjectId,
  suspendingProjectId,
  openDisabled = false,
  openDisabledReason,
  onOpen,
  onSuspend,
  onCloseProject,
  onDelete,
}: ProjectCardProps) {
  const progress = Math.min(100, Math.max(0, Number.parseInt(project.progressRate, 10) || 0));
  const parsedSafetyBudgetUsage = Number.parseFloat(String(project.usageRate).replace(/[^\d.]/g, ''));
  const safetyBudgetUsage = Number.isFinite(parsedSafetyBudgetUsage) ? parsedSafetyBudgetUsage : 0;
  const safetyBudgetUsageBarWidth = safetyBudgetUsage > 0 ? Math.max(2, Math.min(100, safetyBudgetUsage)) : 0;
  const hasSupplement = hasSupplementRequiredMonth(project);
  const projectSuspended = project.projectStatusCode === PROJECT_STATUS_CODE.SUSPENDED;
  const projectClosed = project.projectStatusCode === PROJECT_STATUS_CODE.COMPLETED;
  const periodText = project.period || '-';
  const [periodStart, periodEnd] = periodText.split('~');
  const sheManagerText = getProjectSheManagers(project).join(', ') || '-';
  const currentUserId = Number(user.id);
  const isAssignedSheManager = user.role === 'she_manager'
    && (
      (Number.isFinite(currentUserId) && Boolean(project.sheManagerUserIds?.includes(currentUserId)))
      || getProjectSheManagers(project).includes(user.name)
    );
  const canManageProjectRecord = isAssignedSheManager;

  const handleOpenKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (openDisabled || !isActivationKey(event)) return;
    event.preventDefault();
    onOpen(project);
  };

  const handleActionKeyDown = (event: KeyboardEvent, action: () => void) => {
    if (!isActivationKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  return (
    <div
      className={`interactive-card${hasSupplement ? ' interactive-card--supplement' : ''}`}
      role={openDisabled ? undefined : 'button'}
      tabIndex={openDisabled ? -1 : 0}
      title={openDisabled ? openDisabledReason : undefined}
      onClick={() => {
        if (openDisabled) return;
        onOpen(project);
      }}
      onKeyDown={handleOpenKeyDown}
      style={{ position: 'relative', minHeight: 198, padding: 14, border: `1px solid ${hasSupplement ? '#EFAEB7' : C.g200}`, borderRadius: 'var(--ui-radius-card)', background: hasSupplement ? '#FFFBFC' : C.white, boxShadow: 'var(--ui-shadow-card)', textAlign: 'left', fontFamily: 'inherit', cursor: openDisabled ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', gap: 12, opacity: openDisabled ? 0.86 : 1 }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div title={project.constructionName} style={{ minWidth: 0, fontSize: 17, fontWeight: 800, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.constructionName}</div>
          {hasSupplement && <span style={supplementRequestBadgeStyle}>보완 요청</span>}
        </div>
        <div style={{ marginTop: 5, fontSize: 13, fontWeight: 700, color: C.g600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.contractNumber}</div>
      </div>

      <div style={{ display: 'grid', gap: 7, minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0, 1fr)', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.g500, whiteSpace: 'nowrap' }}>프로젝트 담당자</span>
          <span title={project.manager} style={{ minWidth: 0, fontSize: 14, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.manager}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0, 1fr)', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.g500, whiteSpace: 'nowrap' }}>SHE 담당자</span>
          <span title={sheManagerText} style={{ minWidth: 0, fontSize: 14, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sheManagerText}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0, 1fr)', alignItems: 'start', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.g500, lineHeight: 1.35, whiteSpace: 'nowrap' }}>공사기간</span>
          <span title={periodText} style={{ minWidth: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.35, color: C.g800, whiteSpace: 'normal', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'keep-all' }}>
            {periodEnd ? <>{periodStart}~<wbr />{periodEnd}</> : periodText}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 9 }}>
        <div>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5, fontSize: 13, fontWeight: 800, color: C.g600 }}>
            <span>공정률</span>
            <span style={{ color: C.g800 }}>{progress}%</span>
          </div>
          <div style={{ width: '100%', height: 8, borderRadius: 999, background: '#E8EEEB', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: progress >= 70 ? C.primary : progress >= 30 ? '#2F73B7' : '#C9545E' }} />
          </div>
        </div>
        <div>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5, fontSize: 13, fontWeight: 800, color: C.g600 }}>
            <span>안전관리비 사용률</span>
            <span style={{ color: C.g800 }}>{safetyBudgetUsage}%</span>
          </div>
          <div style={{ width: '100%', height: 8, borderRadius: 999, background: '#E8EEEB', overflow: 'hidden' }}>
            <div style={{ width: `${safetyBudgetUsageBarWidth}%`, height: '100%', background: safetyBudgetUsage >= 80 ? '#C9545E' : safetyBudgetUsage >= 50 ? '#F0A22E' : C.primary }} />
          </div>
        </div>
      </div>

      {canManageProjectRecord && (
        <div style={{ alignSelf: 'flex-end', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            role="button"
            tabIndex={projectClosed ? -1 : 0}
            aria-disabled={projectClosed || suspendingProjectId === project.id}
            onClick={(event) => {
              event.stopPropagation();
              if (projectClosed || suspendingProjectId === project.id) return;
              onSuspend(project);
            }}
            onKeyDown={(event) => handleActionKeyDown(event, () => {
              if (projectClosed || suspendingProjectId === project.id) return;
              onSuspend(project);
            })}
            style={{ border: `1px solid ${projectClosed ? C.g200 : projectSuspended ? C.primary : C.g400}`, borderRadius: 999, background: projectClosed ? C.g100 : projectSuspended ? C.bg : C.white, color: projectClosed ? C.g400 : projectSuspended ? C.primary : C.g600, height: 28, padding: '0 11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, cursor: projectClosed || suspendingProjectId === project.id ? 'not-allowed' : 'pointer', boxSizing: 'border-box', opacity: suspendingProjectId === project.id ? .65 : 1 }}
          >
            {suspendingProjectId === project.id ? (projectSuspended ? '진행 처리 중' : '중단 처리 중') : projectSuspended ? '진행' : '중단'}
          </span>
          <span
            role="button"
            tabIndex={projectClosed ? -1 : 0}
            aria-disabled={projectClosed || closingProjectId === project.id}
            onClick={(event) => {
              event.stopPropagation();
              if (projectClosed || closingProjectId === project.id) return;
              onCloseProject(project);
            }}
            onKeyDown={(event) => handleActionKeyDown(event, () => {
              if (projectClosed || closingProjectId === project.id) return;
              onCloseProject(project);
            })}
            style={{ border: `1px solid ${projectClosed ? C.g200 : C.ok}`, borderRadius: 999, background: projectClosed ? C.g100 : '#F4FBF6', color: projectClosed ? C.g400 : C.ok, height: 28, padding: '0 11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, cursor: projectClosed || closingProjectId === project.id ? 'not-allowed' : 'pointer', boxSizing: 'border-box', opacity: closingProjectId === project.id ? .65 : 1 }}
          >
            {closingProjectId === project.id ? '종료 처리 중' : projectClosed ? '종료됨' : '종료'}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(project);
            }}
            onKeyDown={(event) => handleActionKeyDown(event, () => onDelete(project))}
            style={{ border: `1px solid #FFCDD2`, borderRadius: 999, background: C.dangerBg, color: C.danger, height: 28, padding: '0 11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxSizing: 'border-box' }}
          >
            삭제
          </span>
        </div>
      )}
    </div>
  );
}
