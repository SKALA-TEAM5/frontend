'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { markActionNotificationRead, type ActionNotification, type NotificationType } from '../../lib/action-notifications';
import { useActionNotifications } from '../../lib/use-action-notifications';
import { C } from '../../lib/theme';
import { ChevronIcon } from '../ui';
import { ROLE_LABELS } from '../../lib/permissions';
import { useCurrentUser } from '../../lib/dev-user';
import { type ActionRequestStatusCode, type ProjectSummary } from '../../lib/project-data';
import { logout } from '../../lib/auth-api';
import { listProjects } from '../../lib/project-api';
interface AppFrameProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    mainClassName?: string;
    children: React.ReactNode;
}
export default function AppFrame({ title, description, actions, mainClassName, children }: AppFrameProps) {
    const { user, clearCurrentUser } = useCurrentUser();
    const [projectsOpen, setProjectsOpen] = useState(true);
    const [toastVisible, setToastVisible] = useState(true);
    const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
    const [sidebarProjects, setSidebarProjects] = useState<ProjectSummary[]>([]);
    const router = useRouter();
    const pathname = usePathname();
    const { visibleNotifications: roleNotifications, unreadNotifications } = useActionNotifications(user);
    useEffect(() => {
        let alive = true;
        listProjects({ size: 10 })
            .then((projects) => {
                if (alive) setSidebarProjects(projects);
            })
            .catch(() => {
                if (alive) setSidebarProjects([]);
            });
        return () => {
            alive = false;
        };
    }, [pathname, user.id]);
    const handleLogout = async () => {
        try {
            await logout();
        } finally {
            clearCurrentUser();
            router.replace('/');
        }
    };
    const navItems = user.role === 'she_manager'
        ? [{ href: '/dashboard', label: '대시보드' }, { href: '/projects', label: '전체 프로젝트' }]
        : [{ href: '/projects', label: '담당 프로젝트' }];
    const dashboardNavItem = navItems.find((item) => item.href === '/dashboard');
    const projectsNavItem = navItems.find((item) => item.href === '/projects');
    const notificationTypeMeta: Record<NotificationType, { label: string; color: string; bg: string }> = {
        action_request: { label: '조치 알림', color: C.danger, bg: C.dangerBg },
        new_upload: { label: '새 업로드 알림', color: C.primary, bg: C.bg },
    };
    const getNotificationType = (notification: ActionNotification): NotificationType => notification.type || (notification.recipientRole === 'she_manager' ? 'new_upload' : 'action_request');
    const getNotificationStatusCode = (notification: ActionNotification): ActionRequestStatusCode => {
        if (getNotificationType(notification) === 'new_upload') return 'open';
        if (notification.statusCode) return notification.statusCode;
        return 'open';
    };
    const isActiveNotification = (notification: ActionNotification) => getNotificationType(notification) === 'new_upload' ? !notification.read : getNotificationStatusCode(notification) !== 'closed';
    const activeRoleNotifications = roleNotifications.filter(isActiveNotification);
    const latestUnreadNotification = unreadNotifications.find(isActiveNotification);
    const sidebarNotificationCount = activeRoleNotifications.length;
    const primarySidebarProject = sidebarProjects[0];
    const managedProjectSummary = primarySidebarProject
        ? `${primarySidebarProject.constructionName}${sidebarProjects.length > 1 ? ` 외 ${sidebarProjects.length - 1}건 관리` : ' 관리'}`
        : '관리 프로젝트 없음';
    useEffect(() => {
        setToastVisible(true);
    }, [latestUnreadNotification?.id]);
    useEffect(() => {
        setToastVisible(true);
    }, [user.role]);
    const hasHeaderContent = Boolean(description || actions);
    const frameStyle = {
        minHeight: '100vh',
        background: C.soft,
        '--app-left-offset': leftSidebarOpen ? '220px' : '28px',
    } as React.CSSProperties;
    return (<div data-ui="app-frame.1" style={frameStyle}>
      <header className="app-global-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontWeight: 900, color: C.g800, fontSize: 17 }}>
          <img src="/uploads/character.png" alt="i-veri" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <span>i-veri</span>
          <span style={{ color: '#2F73B7', fontSize: 22 }}>WorkPlace</span>
        </div>
        <div style={{ display: 'flex', gap: 24, color: C.g400, fontSize: 13, fontWeight: 900, alignItems: 'center' }}>
          <Link href="/notifications" style={{ color: 'inherit', textDecoration: 'none' }}>알림센터</Link>
          <span>사용자</span>
        </div>
      </header>
      <button type="button" aria-label={leftSidebarOpen ? '좌측 사이드바 닫기' : '좌측 사이드바 열기'} onClick={() => setLeftSidebarOpen((open) => !open)} className="app-sidebar-toggle" style={{ left: leftSidebarOpen ? 205 : 10 }}>
        <ChevronIcon direction={leftSidebarOpen ? 'left' : 'right'} size={17} color={C.primary}/>
      </button>
      <aside data-ui="app-frame.2" className={leftSidebarOpen ? 'app-sidebar' : 'app-sidebar app-sidebar-closed'}>
        <nav data-ui="app-frame.8" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {dashboardNavItem && (
            <Link key={dashboardNavItem.href} href={dashboardNavItem.href} style={{ display: 'grid', gridTemplateColumns: '4px minmax(0,1fr)', alignItems: 'center', gap: 12, minHeight: 38, padding: '0 12px 0 4px', borderRadius: 6, textDecoration: 'none', color: pathname === dashboardNavItem.href ? C.primary : C.g600, background: pathname === dashboardNavItem.href ? C.bg : 'transparent', fontSize: 13, fontWeight: 900 }}>
              <span aria-hidden="true" style={{ width: 4, height: 20, borderRadius: 999, background: pathname === dashboardNavItem.href ? C.primary : 'transparent' }} />
              <span>{dashboardNavItem.label}</span>
            </Link>
          )}
          <Link href="/notifications" style={{ width: '100%', border: 'none', borderRadius: 6, background: pathname === '/notifications' ? C.bg : 'transparent', color: pathname === '/notifications' ? C.primary : C.g600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 38, padding: '0 12px 0 4px', display: 'grid', gridTemplateColumns: '4px minmax(0,1fr) auto', alignItems: 'center', gap: 12, fontSize: 13, fontWeight: 900, textDecoration: 'none' }}>
            <span aria-hidden="true" style={{ width: 4, height: 20, borderRadius: 999, background: pathname === '/notifications' ? C.primary : 'transparent' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              알림
            </span>
            <span style={{ minWidth: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: C.g200, color: C.primary, fontSize: 11, fontWeight: 900 }}>{sidebarNotificationCount}</span>
          </Link>
          <Link href="/projects/new" style={{ display: 'grid', gridTemplateColumns: '4px minmax(0,1fr)', alignItems: 'center', gap: 12, minHeight: 38, padding: '0 12px 0 4px', borderRadius: 6, textDecoration: 'none', color: pathname === '/projects/new' ? C.primary : C.g600, background: pathname === '/projects/new' ? C.bg : 'transparent', fontSize: 13, fontWeight: 900 }}>
            <span aria-hidden="true" style={{ width: 4, height: 20, borderRadius: 999, background: pathname === '/projects/new' ? C.primary : 'transparent' }} />
            <span>새 프로젝트</span>
          </Link>
          {projectsNavItem && (
            <div key={projectsNavItem.href}>
              <div style={{ display: 'grid', gridTemplateColumns: '4px minmax(0,1fr) 34px', alignItems: 'center', gap: 12, background: pathname === projectsNavItem.href ? C.bg : 'transparent', borderRadius: 6, paddingLeft: 4 }}>
                <span aria-hidden="true" style={{ width: 4, height: 20, borderRadius: 999, background: pathname === projectsNavItem.href ? C.primary : 'transparent' }} />
                <Link href={projectsNavItem.href} style={{ minHeight: 38, display: 'flex', alignItems: 'center', minWidth: 0, textDecoration: 'none', color: pathname === projectsNavItem.href ? C.primary : C.g600, fontSize: 13, fontWeight: 900 }}>
                  {projectsNavItem.label}
                </Link>
                <button type="button" aria-label={projectsOpen ? '프로젝트 목록 접기' : '프로젝트 목록 펼치기'} onClick={() => setProjectsOpen((open) => !open)} style={{ width: 34, height: 38, border: 'none', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: pathname === projectsNavItem.href ? C.primary : C.g400, cursor: 'pointer' }}>
                  <ChevronIcon direction={projectsOpen ? 'up' : 'down'} size={16} />
                </button>
              </div>
              {projectsOpen && (<div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 5, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                {sidebarProjects.map((project) => {
                  const href = `/projects/${project.id}`;
                  const projectActive = pathname === href;
                  return (<Link key={project.id} href={href} title={project.name} style={{ display: 'grid', gridTemplateColumns: '3px minmax(0,1fr)', alignItems: 'center', gap: 12, textDecoration: 'none', borderRadius: 6, padding: '8px 9px 8px 4px', background: projectActive ? C.bg : 'transparent', color: projectActive ? C.primary : C.g600, fontSize: 13, fontWeight: projectActive ? 900 : 800, lineHeight: 1.35 }}>
                    <span aria-hidden="true" style={{ width: 3, height: 18, borderRadius: 999, background: projectActive ? C.primary : 'transparent' }} />
                    <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.constructionName}</span>
                  </Link>);
                })}
              </div>)}
            </div>
          )}
        </nav>

        <div data-ui="app-frame.10" style={{ display: 'none' }}>
          <div data-ui="app-frame.11" style={{ fontSize: 12, fontWeight: 900, color: C.g400, marginBottom: 5 }}>현재 화면</div>
          <div data-ui="app-frame.12" style={{ fontSize: 15, fontWeight: 900, color: C.g800, lineHeight: 1.35 }}>{title}</div>
        </div>

        <div data-ui="app-frame.13" style={{ marginTop: 'auto', borderTop: `1px solid ${C.g200}`, paddingTop: 16 }}>
          <div data-ui="app-frame.15" style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr)', gap: 10, alignItems: 'center', padding: 10, border: `1px solid ${C.g200}`, borderRadius: 6, background: C.bg, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', color: C.white, fontSize: 14, fontWeight: 900, background: `linear-gradient(135deg, ${C.primary}, #94D49B)` }}>
              {user.name.slice(0, 1)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div data-ui="app-frame.16" style={{ fontSize: 13, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name} {ROLE_LABELS[user.role]}</div>
              <div data-ui="app-frame.17" style={{ marginTop: 2, color: C.g400, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{managedProjectSummary}</div>
            </div>
          </div>
          <button data-ui="app-frame.14" type="button" onClick={handleLogout} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, color: C.g600, background: C.white, cursor: 'pointer', boxShadow: '0 7px 16px rgba(31, 55, 43, .08)' }}>
            로그아웃
          </button>
        </div>
      </aside>

      <main data-ui="app-frame.18" className={mainClassName ? `app-main ${mainClassName}` : 'app-main'}>
        {hasHeaderContent && <div data-ui="app-frame.19" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
          <div data-ui="app-frame.20" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {description && <div data-ui="app-frame.21" style={{ fontSize: 14, color: C.g400, fontWeight: 700 }}>{description}</div>}
          </div>
          {actions && <div data-ui="app-frame.22" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
        </div>}
        {children}
      </main>
      {latestUnreadNotification && toastVisible && <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 1200, width: 440, maxWidth: 'calc(100vw - 48px)', background: C.white, border: `1px solid ${C.g200}`, borderRadius: 16, boxShadow: '0 18px 44px rgba(0,0,0,.18)', padding: '20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.g800 }}>{user.role === 'she_manager' ? notificationTypeMeta[getNotificationType(latestUnreadNotification)].label : 'SHE 담당자 조치 요청'}</div>
          <button type="button" onClick={() => setToastVisible(false)} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 14, color: C.g600, lineHeight: 1.65 }}>{latestUnreadNotification.message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => router.push('/notifications')} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 7px 16px rgba(31, 55, 43, .08)' }}>알림 페이지 보기</button>
          <button type="button" onClick={() => {
              markActionNotificationRead(latestUnreadNotification.id);
              if (latestUnreadNotification.projectId) {
                const targetTab = user.role === 'she_manager' && getNotificationType(latestUnreadNotification) !== 'new_upload' ? 'validation' : 'archive';
                router.push(`/projects/${latestUnreadNotification.projectId}?tab=${targetTab}`);
              }
          }} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: latestUnreadNotification.projectId ? 'pointer' : 'not-allowed', opacity: latestUnreadNotification.projectId ? 1 : 0.45, boxShadow: '0 7px 16px rgba(31, 55, 43, .08)' }}>{user.role === 'she_manager' ? getNotificationType(latestUnreadNotification) === 'new_upload' ? '확인하기' : '유효성 검증' : '조치하기'}</button>
          <button type="button" onClick={() => markActionNotificationRead(latestUnreadNotification.id)} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: C.primary, color: C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 10px 22px rgba(27, 94, 59, .24)' }}>읽음</button>
        </div>
      </div>}
    </div>);
}
