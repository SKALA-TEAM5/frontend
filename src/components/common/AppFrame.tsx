'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '../../lib/auth-api';
import { useCurrentUser } from '../../lib/dev-user';
import { ROLE_LABELS } from '../../lib/permissions';
import { C } from '../../lib/theme';

interface AppFrameProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  mainClassName?: string;
  children: React.ReactNode;
}

const menuButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '10px 8px',
  border: 'none',
  background: 'transparent',
  borderRadius: 14,
  color: C.g800,
  fontSize: 14,
  fontWeight: 900,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

export default function AppFrame({ description, actions, mainClassName, children }: AppFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearCurrentUser } = useCurrentUser();
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const hasHeaderContent = Boolean(description || actions);
  const headerNavItems = user.role === 'system_admin'
    ? [{ href: '/admin/users', label: '사용자 관리' }]
    : user.role === 'project_manager'
      ? [{ href: '/projects', label: '담당 프로젝트' }]
    : [
        { href: '/dashboard', label: '대시보드' },
        { href: '/projects', label: '전체 프로젝트' },
      ];
  const homeHref = user.role === 'system_admin' ? '/admin/users' : user.role === 'project_manager' ? '/projects' : '/dashboard';
  const isNavActive = (href: string) => pathname === href || (href === '/projects' && pathname.startsWith('/projects'));
  const headerLinkStyle = (active = false): React.CSSProperties => ({
    color: active ? C.primary : C.g400,
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 900,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  });
  const userInitials = useMemo(() => {
    const trimmed = user.name.trim();
    if (!trimmed) return 'U';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  }, [user.name]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (userMenuRef.current?.contains(event.target as Node)) return;
      setUserMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [userMenuOpen]);

  const handleLogout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      await logout();
    } catch {
      // Ignore logout API failure and clear the local session anyway.
    } finally {
      clearCurrentUser();
      setUserMenuOpen(false);
      setLogoutPending(false);
      router.replace('/');
    }
  };

  return (
    <div data-ui="app-frame.1" style={{ minHeight: '100vh', background: C.soft, '--app-left-offset': '0px' } as React.CSSProperties}>
      <header className="app-global-header">
        <Link href={homeHref} style={{ display: 'flex', alignItems: 'center', gap: 11, fontWeight: 900, color: C.g800, fontSize: 17, textDecoration: 'none' }}>
          <img src="/uploads/character.png" alt="i-veri" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <span>i-veri</span>
          <span style={{ color: '#2F73B7', fontSize: 22 }}>WorkPlace</span>
        </Link>

        <nav aria-label="상단 메뉴" style={{ display: 'flex', alignItems: 'center', gap: 24, minWidth: 0 }}>
          {headerNavItems.map((item) => {
            const active = isNavActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={headerLinkStyle(active)}
              >
                {item.label}
              </Link>
            );
          })}

          <div ref={userMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((current) => !current)}
              style={{ ...headerLinkStyle(false), border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              사용자
            </button>

            {userMenuOpen && (
              <div
                role="menu"
                aria-label="사용자 메뉴"
                className="screen-enter"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: 220,
                  borderRadius: 20,
                  border: `1px solid ${C.g200}`,
                  background: C.white,
                  boxShadow: '0 16px 36px rgba(18, 42, 31, .12)',
                  padding: 12,
                  zIndex: 980,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px 12px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: '#FFC928', color: C.white, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, flexShrink: 0 }}>
                    {userInitials}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: C.g800, lineHeight: 1.3 }}>{user.name || '사용자'}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.g400, marginTop: 3 }}>{ROLE_LABELS[user.role]}</div>
                  </div>
                  <div aria-hidden="true" style={{ color: C.g400, fontSize: 22, lineHeight: 1 }}>›</div>
                </div>

                <div style={{ height: 1, background: C.g100, margin: '0 8px 8px' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    disabled={logoutPending}
                    style={{ ...menuButtonStyle, cursor: logoutPending ? 'not-allowed' : 'pointer', opacity: logoutPending ? 0.45 : 1 }}
                  >
                    <span aria-hidden="true" style={{ width: 24, textAlign: 'center', fontSize: 18, lineHeight: 1 }}>↪</span>
                    <span>{logoutPending ? '로그아웃 중' : '로그아웃'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main data-ui="app-frame.18" className={mainClassName ? `app-main ${mainClassName}` : 'app-main'}>
        {hasHeaderContent && (
          <div data-ui="app-frame.19" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
            <div data-ui="app-frame.20" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {description && <div data-ui="app-frame.21" style={{ fontSize: 14, color: C.g400, fontWeight: 700 }}>{description}</div>}
            </div>
            {actions && <div data-ui="app-frame.22" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
