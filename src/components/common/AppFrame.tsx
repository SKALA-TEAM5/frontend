'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { C } from '../../lib/theme';
import { ROLE_LABELS } from '../../lib/permissions';
import { type DevUserRole, useCurrentUser } from '../../lib/dev-user';
interface AppFrameProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    mainClassName?: string;
    children: React.ReactNode;
}
export default function AppFrame({ title, description, mainClassName, children }: AppFrameProps) {
    const { user, role, setCurrentRole } = useCurrentUser();
    const router = useRouter();
    const pathname = usePathname();
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
            <div data-ui="components-common-app-frame.sidebar-brand-title" style={{ fontSize: 15, fontWeight: 900, color: C.primary, whiteSpace: 'nowrap' }}>산안비 검증</div>
            <div data-ui="components-common-app-frame.sidebar-brand-subtitle" style={{ fontSize: 11, color: C.g400, fontWeight: 700, whiteSpace: 'nowrap' }}>프로젝트 운영</div>
          </div>
        </div>

        <nav data-ui="components-common-app-frame.sidebar-nav" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 30 }}>
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (<Link key={item.href} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 12, textDecoration: 'none', color: active ? C.primary : C.g600, background: active ? C.bg : 'transparent', fontSize: 13, fontWeight: 900 }}>
              <span data-ui="components-common-app-frame.sidebar-nav-dot" style={{ width: 7, height: 7, borderRadius: 99, background: active ? C.primary : C.g200, flexShrink: 0 }}/>
              {item.label}
            </Link>);
        })}
        </nav>

        <div data-ui="components-common-app-frame.sidebar-current" style={{ marginTop: 20, padding: '14px 12px', borderRadius: 14, background: '#FCFEFD', border: `1px solid ${C.g200}` }}>
          <div data-ui="components-common-app-frame.sidebar-current-label" style={{ fontSize: 10, fontWeight: 900, color: C.g400, marginBottom: 5 }}>현재 화면</div>
          <div data-ui="components-common-app-frame.sidebar-current-title" style={{ fontSize: 13, fontWeight: 900, color: C.g800, lineHeight: 1.35 }}>{title}</div>
        </div>

        <div data-ui="components-common-app-frame.sidebar-user" style={{ marginTop: 'auto', borderTop: `1px solid ${C.g200}`, paddingTop: 16 }}>
          <select data-ui="components-common-app-frame.role-switcher" value={role} onChange={(event) => handleRoleChange(event.target.value as DevUserRole)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 10, padding: '9px 10px', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: C.g600, background: C.white, cursor: 'pointer', marginBottom: 12 }}>
            <option value="project_manager">프로젝트 담당자</option>
            <option value="she_manager">SHE 관리자</option>
          </select>
          <div data-ui="components-common-app-frame.sidebar-user-card" style={{ padding: 12, borderRadius: 14, background: C.bg, border: `1px solid ${C.g200}` }}>
            <div data-ui="components-common-app-frame.sidebar-user-name" style={{ fontSize: 13, fontWeight: 900, color: C.g800 }}>{user.name}</div>
            <div data-ui="components-common-app-frame.sidebar-user-role" style={{ fontSize: 11, color: C.g400, fontWeight: 800, marginTop: 3 }}>{ROLE_LABELS[user.role]}</div>
          </div>
        </div>
      </aside>

      <main data-ui="components-common-app-frame.main-1" className={mainClassName ? `app-main ${mainClassName}` : 'app-main'}>
        <div data-ui="components-common-app-frame.main-back-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          {!isRoleHome && <button data-ui="components-common-app-frame.back-button" type="button" onClick={goBack} style={{ border: `1px solid ${C.g200}`, borderRadius: 10, background: C.white, color: C.g800, padding: '9px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 900 }}>
            ← 뒤로 가기
          </button>}
          {description && <div data-ui="components-common-app-frame.main-description" style={{ fontSize: 12, color: C.g400, fontWeight: 700 }}>{description}</div>}
        </div>
        {children}
      </main>
    </div>);
}
