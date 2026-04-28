'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { C } from '../../lib/theme';
import { ROLE_LABELS } from '../../lib/permissions';
import { type DevUserRole, useCurrentUser } from '../../lib/dev-user';
import { getAccessibleProjects } from '../../lib/project-data';
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
    const router = useRouter();
    const pathname = usePathname();
    const sidebarProjects = getAccessibleProjects(user);
    const handleRoleChange = (nextRole: DevUserRole) => {
        setCurrentRole(nextRole);
        window.location.href = nextRole === 'project_manager' ? '/projects' : '/dashboard';
    };
    const navItems = user.role === 'she_manager'
        ? [{ href: '/dashboard', label: '대시보드' }, { href: '/projects', label: '전체 프로젝트' }]
        : [{ href: '/projects', label: '담당 프로젝트' }];
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
    return (<div data-ui="components-common-app-frame.div-1" style={{ minHeight: '100vh', background: C.soft }}>
      <aside data-ui="components-common-app-frame.sidebar" className="app-sidebar">
        <div data-ui="components-common-app-frame.sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <img data-ui="components-common-app-frame.sidebar-brand-icon" src="/uploads/character.png" alt="산안비 검증" style={{ width: 38, height: 38, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}/>
          <div data-ui="components-common-app-frame.sidebar-brand-text" style={{ minWidth: 0 }}>
            <div data-ui="components-common-app-frame.sidebar-brand-title" style={{ fontSize: 17, fontWeight: 900, color: C.primary, whiteSpace: 'nowrap' }}>산안비 검증</div>
            <div data-ui="components-common-app-frame.sidebar-brand-subtitle" style={{ fontSize: 13, color: C.g400, fontWeight: 700, whiteSpace: 'nowrap' }}>프로젝트 운영</div>
          </div>
        </div>

        <nav data-ui="components-common-app-frame.sidebar-nav" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 30 }}>
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (<Link key={item.href} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 12, textDecoration: 'none', color: active ? C.primary : C.g600, background: active ? C.bg : 'transparent', fontSize: 15, fontWeight: 900 }}>
              <span data-ui="components-common-app-frame.sidebar-nav-dot" style={{ width: 7, height: 7, borderRadius: 99, background: active ? C.primary : C.g200, flexShrink: 0 }}/>
              {item.label}
            </Link>);
        })}
        </nav>

        <div data-ui="side-projects" style={{ marginTop: 18 }}>
          <button type="button" onClick={() => setProjectsOpen((open) => !open)} style={{ width: '100%', border: 'none', background: 'transparent', color: C.g800, cursor: 'pointer', fontFamily: 'inherit', padding: '8px 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 900 }}>프로젝트 목록</span>
            <span aria-hidden="true" style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: C.g400, lineHeight: 1 }}>
              {projectsOpen ? '⌃' : '⌄'}
            </span>
          </button>
          {projectsOpen && (<div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
            {sidebarProjects.map((project) => {
              const href = `/projects/${project.id}`;
              const active = pathname === href;
              return (<Link key={project.id} href={href} title={project.name} style={{ display: 'block', textDecoration: 'none', borderRadius: 10, padding: '8px 10px', background: active ? C.bg : 'transparent', color: active ? C.primary : C.g600, fontSize: 14, fontWeight: active ? 900 : 800, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {project.constructionName}
              </Link>);
            })}
          </div>)}
        </div>

        <div data-ui="components-common-app-frame.sidebar-current" style={{ display: 'none' }}>
          <div data-ui="components-common-app-frame.sidebar-current-label" style={{ fontSize: 12, fontWeight: 900, color: C.g400, marginBottom: 5 }}>현재 화면</div>
          <div data-ui="components-common-app-frame.sidebar-current-title" style={{ fontSize: 15, fontWeight: 900, color: C.g800, lineHeight: 1.35 }}>{title}</div>
        </div>

        <div data-ui="components-common-app-frame.sidebar-user" style={{ marginTop: 'auto', borderTop: `1px solid ${C.g200}`, paddingTop: 16 }}>
          <select data-ui="components-common-app-frame.role-switcher" value={role} onChange={(event) => handleRoleChange(event.target.value as DevUserRole)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 10, padding: '9px 10px', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, color: C.g600, background: C.white, cursor: 'pointer', marginBottom: 12 }}>
            <option value="project_manager">프로젝트 담당자</option>
            <option value="she_manager">SHE 관리자</option>
          </select>
          <div data-ui="components-common-app-frame.sidebar-user-card" style={{ padding: 12, borderRadius: 14, background: C.bg, border: `1px solid ${C.g200}` }}>
            <div data-ui="components-common-app-frame.sidebar-user-name" style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>{user.name}</div>
            <div data-ui="components-common-app-frame.sidebar-user-role" style={{ fontSize: 13, color: C.g400, fontWeight: 800, marginTop: 3 }}>{ROLE_LABELS[user.role]}</div>
          </div>
        </div>
      </aside>

      <main data-ui="components-common-app-frame.main-1" className={mainClassName ? `app-main ${mainClassName}` : 'app-main'}>
        <div data-ui="components-common-app-frame.main-back-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
          <div data-ui="components-common-app-frame.main-back-left" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {!isRoleHome && <button data-ui="components-common-app-frame.back-button" type="button" onClick={goBack} style={{ border: `1px solid ${C.g200}`, borderRadius: 10, background: C.white, color: C.g800, padding: '9px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 900 }}>
            뒤로 가기
          </button>}
          {description && <div data-ui="components-common-app-frame.main-description" style={{ fontSize: 14, color: C.g400, fontWeight: 700 }}>{description}</div>}
          </div>
          {actions && <div data-ui="components-common-app-frame.main-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
        </div>
        {children}
      </main>
    </div>);
}
