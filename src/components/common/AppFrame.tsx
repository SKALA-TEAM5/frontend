'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { addActionNotification, markActionNotificationRead, updateActionNotificationStatus, type ActionNotification } from '../../lib/action-notifications';
import { useActionNotifications } from '../../lib/use-action-notifications';
import { APP_THEMES, C, type AppThemeId, useAppTheme } from '../../lib/theme';
import { ChevronIcon } from '../ui';
import { ROLE_LABELS } from '../../lib/permissions';
import { type DevUserRole, useCurrentUser } from '../../lib/dev-user';
import { ACTION_REQUEST_STATUS_META, ACTION_REQUEST_STATUS_STEPS, getAccessibleProjects, type ActionRequestStatusCode } from '../../lib/project-data';
interface AppFrameProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    mainClassName?: string;
    children: React.ReactNode;
}
export default function AppFrame({ title, description, actions, mainClassName, children }: AppFrameProps) {
    const { user, role, setCurrentRole } = useCurrentUser();
    const [projectsOpen, setProjectsOpen] = useState(true);
    const [activeUtilityView, setActiveUtilityView] = useState<'notifications' | null>(null);
    const [notificationQuery, setNotificationQuery] = useState('');
    const [notificationProjectFilter, setNotificationProjectFilter] = useState('all');
    const [notificationPeriodFilter, setNotificationPeriodFilter] = useState('all');
    const [notificationStatusFilter, setNotificationStatusFilter] = useState<ActionRequestStatusCode | 'active'>('active');
    const [toastVisible, setToastVisible] = useState(true);
    const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
    const { themeId, setThemeId } = useAppTheme();
    const router = useRouter();
    const pathname = usePathname();
    const sidebarProjects = getAccessibleProjects(user);
    const { notifications, visibleNotifications: roleNotifications, unreadNotifications } = useActionNotifications(user);
    const handleRoleChange = (nextRole: DevUserRole) => {
        setCurrentRole(nextRole);
        setActiveUtilityView(null);
        router.push(nextRole === 'project_manager' ? '/projects' : '/dashboard');
    };
    const navItems = user.role === 'she_manager'
        ? [{ href: '/dashboard', label: '대시보드' }, { href: '/projects', label: '전체 프로젝트' }]
        : [{ href: '/projects', label: '담당 프로젝트' }];
    const hasCompletionNotification = (notification: ActionNotification) => notifications.some((item) => item.recipientRole === 'she_manager' && item.projectId === notification.projectId && item.categoryName === notification.categoryName && item.title === `${notification.categoryName} 조치 완료`);
    const getNotificationStatusCode = (notification: ActionNotification, completionSent = false): ActionRequestStatusCode => {
        if (notification.statusCode) return notification.statusCode;
        if (completionSent || notification.recipientRole === 'she_manager') return 'resolved';
        return 'open';
    };
    const isActiveNotification = (notification: ActionNotification) => getNotificationStatusCode(notification, hasCompletionNotification(notification)) !== 'closed';
    const activeRoleNotifications = roleNotifications.filter(isActiveNotification);
    const latestUnreadNotification = unreadNotifications.find(isActiveNotification);
    const sidebarNotificationCount = activeRoleNotifications.length;
    const notificationProjectOptions = Array.from(new Set(roleNotifications.map((notification) => notification.projectName))).filter(Boolean);
    const notificationPeriodStart = (() => {
        const now = Date.now();
        if (notificationPeriodFilter === 'today') return now - 24 * 60 * 60 * 1000;
        if (notificationPeriodFilter === '7d') return now - 7 * 24 * 60 * 60 * 1000;
        if (notificationPeriodFilter === '30d') return now - 30 * 24 * 60 * 60 * 1000;
        return 0;
    })();
    const filteredNotifications = roleNotifications.filter((notification) => {
        const completionSent = hasCompletionNotification(notification);
        const statusCode = getNotificationStatusCode(notification, completionSent);
        const query = notificationQuery.trim().toLowerCase();
        const matchesQuery = !query || [notification.projectName, notification.categoryName, notification.title, notification.message, notification.senderName].some((value) => value.toLowerCase().includes(query));
        const matchesProject = notificationProjectFilter === 'all' || notification.projectName === notificationProjectFilter;
        const matchesPeriod = notificationPeriodFilter === 'all' || (notification.createdAtMs || 0) >= notificationPeriodStart;
        const matchesStatus = notificationStatusFilter === 'active' ? statusCode !== 'closed' : statusCode === notificationStatusFilter;
        return matchesQuery && matchesProject && matchesPeriod && matchesStatus;
    });
    const openProject = (notification: ActionNotification, tab?: 'upload' | 'validation') => {
        if (!notification.projectId) return;
        const statusCode = getNotificationStatusCode(notification, hasCompletionNotification(notification));
        if (tab === 'upload' && statusCode === 'open') updateActionNotificationStatus(notification.id, 'in_progress');
        markActionNotificationRead(notification.id);
        setActiveUtilityView(null);
        router.push(`/projects/${notification.projectId}${tab ? `?tab=${tab}` : ''}`);
    };
    const sendCompletionNotification = (notification: ActionNotification) => {
        if (!notification.projectId) return;
        addActionNotification({
            projectId: notification.projectId,
            projectName: notification.projectName,
            categoryName: notification.categoryName,
            title: `${notification.categoryName} 조치 완료`,
            message: `${notification.projectName} 담당자가 ${notification.categoryName} 조치를 완료했습니다. 보완 자료를 확인한 뒤 유효성 검증을 다시 수행해 주세요.`,
            requestedFiles: [],
            senderName: user.name,
            recipientRole: 'she_manager',
            statusCode: 'resolved',
        });
        updateActionNotificationStatus(notification.id, 'resolved');
        markActionNotificationRead(notification.id);
    };
    useEffect(() => {
        setToastVisible(true);
    }, [latestUnreadNotification?.id]);
    useEffect(() => {
        setToastVisible(true);
    }, [role]);
    const goBack = () => {
        if (window.history.length > 1) {
            router.back();
            return;
        }
        router.push(user.role === 'project_manager' ? '/projects' : '/dashboard');
    };
    const isRoleHome =
        (user.role === 'she_manager' && pathname === '/dashboard') ||
        (user.role === 'project_manager' && pathname === '/projects');
    const hasHeaderContent = Boolean(description || actions);
    const frameStyle = {
        minHeight: '100vh',
        background: C.soft,
        '--app-left-offset': leftSidebarOpen ? '220px' : '28px',
    } as React.CSSProperties;
    const renderNotificationCenter = () => (
        <div className="screen-enter">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, color: C.g800 }}>알림 내역</div>
              <div style={{ fontSize: 13, color: C.g400, marginTop: 5 }}>{user.role === 'she_manager' ? '프로젝트 담당자가 보낸 조치 완료 알림을 확인하고 재검증할 수 있습니다.' : 'SHE 담당자가 보낸 조치 요청 알림을 확인하고 조치할 수 있습니다.'}</div>
            </div>
            <button type="button" onClick={() => setActiveUtilityView(null)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '8px 12px', background: C.white, color: C.g600, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>이전 화면으로 돌아가기</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input value={notificationQuery} onChange={(event) => setNotificationQuery(event.target.value)} placeholder="알림 내용, 항목, 담당자 검색" style={{ flex: '1 1 260px', minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 12, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: C.g800, background: C.white, outline: 'none' }} />
            <select value={notificationProjectFilter} onChange={(event) => setNotificationProjectFilter(event.target.value)} style={{ flex: '0 1 180px', minWidth: 140, border: `1px solid ${C.g200}`, borderRadius: 12, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: C.g800, background: C.white }}>
              <option value="all">전체 프로젝트</option>
              {notificationProjectOptions.map((projectName) => <option key={projectName} value={projectName}>{projectName}</option>)}
            </select>
            <select value={notificationPeriodFilter} onChange={(event) => setNotificationPeriodFilter(event.target.value)} style={{ flex: '0 1 150px', minWidth: 130, border: `1px solid ${C.g200}`, borderRadius: 12, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: C.g800, background: C.white }}>
              <option value="all">전체 기간</option>
              <option value="today">최근 24시간</option>
              <option value="7d">최근 7일</option>
              <option value="30d">최근 30일</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, maxWidth: '100%' }}>
            <button type="button" onClick={() => setNotificationStatusFilter('active')} style={{ border: `1px solid ${notificationStatusFilter === 'active' ? C.primary : C.g200}`, borderRadius: 999, padding: '7px 12px', background: notificationStatusFilter === 'active' ? C.bg : C.white, color: notificationStatusFilter === 'active' ? C.primary : C.g600, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              기본
            </button>
            <div role="tablist" aria-label="알림 단계 필터" style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '1 1 360px', minWidth: 0, borderBottom: `1px solid ${C.g200}`, overflowX: 'auto' }}>
              {ACTION_REQUEST_STATUS_STEPS.map((statusCode) => {
                const active = notificationStatusFilter === statusCode;
                const meta = ACTION_REQUEST_STATUS_META[statusCode];
                return (
                  <button key={statusCode} type="button" role="tab" aria-selected={active} onClick={() => setNotificationStatusFilter(statusCode)} style={{ border: 'none', borderBottom: `2px solid ${active ? meta.color : 'transparent'}`, background: 'transparent', color: active ? meta.color : C.g600, padding: '8px 12px 9px', fontSize: 12, fontWeight: active ? 900 : 800, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: C.g800 }}>검색 결과</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.g400 }}>{filteredNotifications.length}건</div>
            </div>
            {filteredNotifications.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: C.g400, fontSize: 13, fontWeight: 800 }}>조건에 맞는 알림이 없습니다.</div>}
            {filteredNotifications.map((notification) => {
              const completionSent = hasCompletionNotification(notification);
              const actionStatusCode = getNotificationStatusCode(notification, completionSent);
              const actionStatusMeta = ACTION_REQUEST_STATUS_META[actionStatusCode];
              const actionStatusIndex = ACTION_REQUEST_STATUS_STEPS.indexOf(actionStatusCode);
              return <div key={notification.id} style={{ padding: '15px 16px', borderBottom: `1px solid ${C.g100}`, background: notification.read ? C.white : '#FCFEFD' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
                <button type="button" onClick={() => openProject(notification)} disabled={!notification.projectId} style={{ minWidth: 0, border: 'none', padding: 0, background: 'transparent', textAlign: 'left', fontFamily: 'inherit', cursor: notification.projectId ? 'pointer' : 'default' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: C.g800 }}>{notification.categoryName}</div>
                  <div style={{ fontSize: 12, color: C.g400, marginTop: 3 }}>{notification.projectName} · {notification.senderName} · {notification.createdAt}</div>
                </button>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ borderRadius: 999, padding: '4px 8px', background: actionStatusMeta.bg, color: actionStatusMeta.color, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>{actionStatusMeta.label}</span>
                  <span style={{ borderRadius: 999, padding: '4px 8px', background: notification.read ? C.g100 : C.bg, color: notification.read ? C.g400 : C.primary, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>{notification.read ? '확인됨' : '미확인'}</span>
                </div>
              </div>
              <button type="button" onClick={() => openProject(notification)} disabled={!notification.projectId} style={{ display: 'block', width: '100%', border: 'none', padding: 0, background: 'transparent', textAlign: 'left', fontFamily: 'inherit', cursor: notification.projectId ? 'pointer' : 'default' }}>
                <div style={{ fontSize: 13, color: C.g800, lineHeight: 1.6 }}>{notification.message}</div>
              </button>
              {notification.requestedFiles.length > 0 && <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.5, marginTop: 6 }}>요청 자료: {notification.requestedFiles.join(', ')}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ACTION_REQUEST_STATUS_STEPS.length}, minmax(0, 1fr))`, gap: 8, marginTop: 10 }}>
                {ACTION_REQUEST_STATUS_STEPS.map((statusCode, index) => {
                  const meta = ACTION_REQUEST_STATUS_META[statusCode];
                  const active = index === actionStatusIndex;
                  const done = index < actionStatusIndex;
                  return (
                    <div key={statusCode} style={{ minWidth: 0 }}>
                      <div style={{ height: 5, borderRadius: 99, background: active || done ? meta.color : C.g100, marginBottom: 6 }} />
                      <div style={{ fontSize: 11, fontWeight: active ? 900 : 800, color: active ? meta.color : done ? C.g600 : C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {meta.label}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: 11 }}>
                <button type="button" onClick={() => markActionNotificationRead(notification.id)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '7px 10px', background: C.white, color: C.g600, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>확인</button>
                {user.role === 'she_manager' ? (
                  <button type="button" onClick={() => openProject(notification, 'validation')} disabled={!notification.projectId} style={{ border: 'none', borderRadius: 999, padding: '7px 10px', background: C.primary, color: C.white, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: notification.projectId ? 'pointer' : 'not-allowed', opacity: notification.projectId ? 1 : 0.45 }}>유효성 검증</button>
                ) : (
                  <>
                    <button type="button" onClick={() => openProject(notification, 'upload')} disabled={!notification.projectId || actionStatusCode === 'closed'} style={{ border: `1px solid ${C.primary}`, borderRadius: 999, padding: '7px 10px', background: C.white, color: C.primary, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: notification.projectId && actionStatusCode !== 'closed' ? 'pointer' : 'not-allowed', opacity: notification.projectId && actionStatusCode !== 'closed' ? 1 : 0.45 }}>조치하기</button>
                    <button type="button" onClick={() => sendCompletionNotification(notification)} disabled={!notification.projectId || completionSent} style={{ border: 'none', borderRadius: 999, padding: '7px 10px', background: completionSent ? C.g200 : C.primary, color: completionSent ? C.g400 : C.white, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: !notification.projectId || completionSent ? 'not-allowed' : 'pointer', opacity: notification.projectId ? 1 : 0.45 }}>{completionSent ? '완료 알림 전송됨' : '조치 완료 알림'}</button>
                  </>
                )}
              </div>
            </div>;
            })}
          </div>
        </div>
    );
    return (<div data-ui="app-frame.1" style={frameStyle}>
      <button type="button" aria-label={leftSidebarOpen ? '좌측 사이드바 닫기' : '좌측 사이드바 열기'} onClick={() => setLeftSidebarOpen((open) => !open)} className="app-sidebar-toggle" style={{ left: leftSidebarOpen ? 205 : 10 }}>
        <ChevronIcon direction={leftSidebarOpen ? 'left' : 'right'} size={17} color={C.primary}/>
      </button>
      <aside data-ui="app-frame.2" className={leftSidebarOpen ? 'app-sidebar' : 'app-sidebar app-sidebar-closed'}>
        <div data-ui="app-frame.3" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <img data-ui="app-frame.4" src="/uploads/character.png" alt="산안비 검증" style={{ width: 38, height: 38, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}/>
          <div data-ui="app-frame.5" style={{ minWidth: 0 }}>
            <div data-ui="app-frame.6" style={{ fontSize: 17, fontWeight: 900, color: C.primary, whiteSpace: 'nowrap' }}>산안비 검증</div>
            <div data-ui="app-frame.7" style={{ fontSize: 13, color: C.g400, fontWeight: 700, whiteSpace: 'nowrap' }}>프로젝트 운영</div>
          </div>
        </div>

        <nav data-ui="app-frame.8" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 30 }}>
          {navItems.map((item) => {
            const active = activeUtilityView === null && pathname === item.href;
            return (<Link key={item.href} href={item.href} onClick={() => setActiveUtilityView(null)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 12, textDecoration: 'none', color: active ? C.primary : C.g600, background: active ? C.bg : 'transparent', fontSize: 15, fontWeight: 900 }}>
              <span data-ui="app-frame.9" style={{ width: 7, height: 7, borderRadius: 99, background: active ? C.primary : C.g200, flexShrink: 0 }}/>
              {item.label}
            </Link>);
        })}
        </nav>

        <div data-ui="side-notifications" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setActiveUtilityView('notifications')} style={{ width: '100%', border: 'none', borderRadius: 12, background: activeUtilityView === 'notifications' ? C.bg : 'transparent', color: activeUtilityView === 'notifications' ? C.primary : C.g600, cursor: 'pointer', fontFamily: 'inherit', padding: '11px 12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 9, fontSize: 15, fontWeight: 900 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: activeUtilityView === 'notifications' ? C.primary : C.g200, flexShrink: 0 }}/>
              알림
            </span>
            <span style={{ minWidth: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: sidebarNotificationCount ? C.primary : C.g100, color: sidebarNotificationCount ? C.white : C.g400, fontSize: 11, fontWeight: 900 }}>{sidebarNotificationCount}</span>
          </button>
        </div>

        <div data-ui="side-projects" style={{ marginTop: 8 }}>
          <Link href="/projects/new" onClick={() => setActiveUtilityView(null)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 12, textDecoration: 'none', color: activeUtilityView === null && pathname === '/projects/new' ? C.primary : C.g600, background: activeUtilityView === null && pathname === '/projects/new' ? C.bg : 'transparent', fontSize: 15, fontWeight: 900, marginBottom: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: activeUtilityView === null && pathname === '/projects/new' ? C.primary : C.g200, flexShrink: 0 }}/>
            새 프로젝트
          </Link>
          <button type="button" onClick={() => setProjectsOpen((open) => !open)} style={{ width: '100%', border: 'none', background: 'transparent', color: C.g800, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 900 }}>프로젝트 목록</span>
            <span aria-hidden="true" style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.g400, lineHeight: 1 }}>
              <ChevronIcon direction={projectsOpen ? 'up' : 'down'} size={16} />
            </span>
          </button>
          {projectsOpen && (<div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
            {sidebarProjects.map((project) => {
              const href = `/projects/${project.id}`;
              const active = pathname === href;
              return (<Link key={project.id} href={href} title={project.name} onClick={() => setActiveUtilityView(null)} style={{ display: 'block', textDecoration: 'none', borderRadius: 10, padding: '8px 10px', background: active ? C.bg : 'transparent', color: active ? C.primary : C.g600, fontSize: 14, fontWeight: active ? 900 : 800, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {project.constructionName}
              </Link>);
            })}
          </div>)}
        </div>

        <div data-ui="app-frame.10" style={{ display: 'none' }}>
          <div data-ui="app-frame.11" style={{ fontSize: 12, fontWeight: 900, color: C.g400, marginBottom: 5 }}>현재 화면</div>
          <div data-ui="app-frame.12" style={{ fontSize: 15, fontWeight: 900, color: C.g800, lineHeight: 1.35 }}>{title}</div>
        </div>

        <div data-ui="app-frame.13" style={{ marginTop: 'auto', borderTop: `1px solid ${C.g200}`, paddingTop: 16 }}>
          <div data-ui="side-theme" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {(Object.keys(APP_THEMES) as AppThemeId[]).map((item) => {
                const active = themeId === item;
                const palette = APP_THEMES[item];
                return (
                  <button
                    key={item}
                    type="button"
                    aria-label={`${palette.label} 테마`}
                    title={`${palette.label} 테마`}
                    onClick={() => setThemeId(item)}
                    style={{
                      width: 24,
                      height: 24,
                      border: `2px solid ${active ? C.primary : C.g200}`,
                      borderRadius: 999,
                      background: palette.primary,
                      boxShadow: active ? `0 0 0 3px ${C.bg}` : 'none',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </div>
          <select data-ui="app-frame.14" value={role} onChange={(event) => handleRoleChange(event.target.value as DevUserRole)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 10, padding: '9px 10px', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, color: C.g600, background: C.white, cursor: 'pointer', marginBottom: 12 }}>
            <option value="project_manager">프로젝트 담당자</option>
            <option value="she_manager">SHE 관리자</option>
          </select>
          <div data-ui="app-frame.15" style={{ padding: 12, borderRadius: 14, background: C.bg, border: `1px solid ${C.g200}` }}>
            <div data-ui="app-frame.16" style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>{user.name}</div>
            <div data-ui="app-frame.17" style={{ fontSize: 13, color: C.g400, fontWeight: 800, marginTop: 3 }}>{ROLE_LABELS[user.role]}</div>
          </div>
        </div>
      </aside>

      <main data-ui="app-frame.18" className={mainClassName ? `app-main ${mainClassName}` : 'app-main'}>
        {activeUtilityView === null && hasHeaderContent && <div data-ui="app-frame.19" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
          <div data-ui="app-frame.20" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {description && <div data-ui="app-frame.21" style={{ fontSize: 14, color: C.g400, fontWeight: 700 }}>{description}</div>}
          </div>
          {actions && <div data-ui="app-frame.22" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
        </div>}
        {activeUtilityView === 'notifications' ? renderNotificationCenter() : children}
      </main>
      {latestUnreadNotification && toastVisible && <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 1200, width: 440, maxWidth: 'calc(100vw - 48px)', background: C.white, border: `1px solid ${C.g200}`, borderRadius: 16, boxShadow: '0 18px 44px rgba(0,0,0,.18)', padding: '20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.g800 }}>{user.role === 'she_manager' ? '프로젝트 조치 완료' : 'SHE 담당자 조치 요청'}</div>
          <button type="button" onClick={() => setToastVisible(false)} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 14, color: C.g600, lineHeight: 1.65 }}>{latestUnreadNotification.message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setActiveUtilityView('notifications')} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 13px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>알림 탭 보기</button>
          <button type="button" onClick={() => {
              if (user.role === 'project_manager' && getNotificationStatusCode(latestUnreadNotification, hasCompletionNotification(latestUnreadNotification)) === 'open') {
                  updateActionNotificationStatus(latestUnreadNotification.id, 'in_progress');
              }
              markActionNotificationRead(latestUnreadNotification.id);
              setActiveUtilityView(null);
              if (latestUnreadNotification.projectId) router.push(`/projects/${latestUnreadNotification.projectId}?tab=${user.role === 'she_manager' ? 'validation' : 'upload'}`);
          }} style={{ border: `1px solid ${C.primary}`, borderRadius: 999, padding: '9px 13px', background: C.white, color: C.primary, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: latestUnreadNotification.projectId ? 'pointer' : 'not-allowed', opacity: latestUnreadNotification.projectId ? 1 : 0.45 }}>{user.role === 'she_manager' ? '유효성 검증' : '조치하기'}</button>
          <button type="button" onClick={() => markActionNotificationRead(latestUnreadNotification.id)} style={{ border: 'none', borderRadius: 999, padding: '9px 13px', background: C.primary, color: C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>확인</button>
        </div>
      </div>}
    </div>);
}
