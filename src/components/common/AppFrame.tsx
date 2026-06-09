'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '../../lib/auth-api';
import { AUTH_EXPIRED_EVENT } from '../../lib/api-client';
import { useCurrentUser } from '../../lib/dev-user';
import { ROLE_LABELS } from '../../lib/permissions';
import { APP_THEMES, C, useAppTheme, type AppThemeId } from '../../lib/theme';

interface AppFrameProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  mainClassName?: string;
  children: React.ReactNode;
}

type HeaderIconName = 'dashboard' | 'projects' | 'users' | 'user';

const HeaderIcon = ({ name, color }: { name: HeaderIconName; color: string }) => {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  };
  const strokeProps = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (name === 'dashboard') {
    return (
      <svg {...common}>
        <path {...strokeProps} d="M3.5 10.5 12 4l8.5 6.5" />
        <path {...strokeProps} d="M5.5 9.5V20h13V9.5" />
        <path {...strokeProps} d="M9.5 20v-6h5v6" />
      </svg>
    );
  }
  if (name === 'projects') {
    return (
      <svg {...common}>
        <path {...strokeProps} d="M4 7.5h6l1.5 2H20v9.5H4z" />
        <path {...strokeProps} d="M4 7.5V5h5.5L11 7.5" />
      </svg>
    );
  }
  if (name === 'users') {
    return (
      <svg {...common}>
        <path {...strokeProps} d="M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path {...strokeProps} d="M2.8 20a5.7 5.7 0 0 1 11.4 0" />
        <path {...strokeProps} d="M17 9.5a2.8 2.8 0 1 0 0-5.6" />
        <path {...strokeProps} d="M16.2 14.2A4.8 4.8 0 0 1 21.2 20" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path {...strokeProps} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path {...strokeProps} d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
};

export default function AppFrame({ description, actions, mainClassName, children }: AppFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearCurrentUser } = useCurrentUser();
  const { themeId, setThemeId } = useAppTheme();
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const hasHeaderContent = Boolean(description || actions);
  const headerNavItems = user.role === 'system_admin'
    ? [{ href: '/admin/users', label: '사용자 관리', icon: 'users' as const }]
    : user.role === 'project_manager'
      ? [{ href: '/projects', label: '담당 프로젝트', icon: 'projects' as const }]
    : [
        { href: '/dashboard', label: '대시보드', icon: 'dashboard' as const },
        { href: '/projects', label: '전체 프로젝트', icon: 'projects' as const },
      ];
  const homeHref = user.role === 'system_admin' ? '/admin/users' : user.role === 'project_manager' ? '/projects' : '/dashboard';
  const isNavActive = (href: string) => pathname === href || (href === '/projects' && pathname.startsWith('/projects'));
  const headerLinkStyle = (active = false): React.CSSProperties => ({
    color: active ? C.primary : C.g600,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    padding: '8px 2px',
    borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
  });
  const themeOptions = useMemo(() => Object.entries(APP_THEMES) as Array<[AppThemeId, (typeof APP_THEMES)[AppThemeId]]>, []);
  const activeThemeGradient = APP_THEMES[themeId].gradient;

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

  useEffect(() => {
    const handleAuthExpired = () => {
      clearCurrentUser();
      setUserMenuOpen(false);
      router.replace('/');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, [clearCurrentUser, router]);

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
    <div data-ui="app-frame.1" style={{ minHeight: '100vh', background: 'transparent', '--app-left-offset': '0px' } as React.CSSProperties}>
      <header className="app-global-header">
        <Link href={homeHref} style={{ display: 'flex', alignItems: 'center', gap: 11, fontWeight: 900, color: C.g800, fontSize: 17, textDecoration: 'none' }}>
          <img src="/uploads/character.png" alt="i-veri" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <span>i-veri</span>
          <span style={{ color: C.primary, fontSize: 22 }}>WorkPlace</span>
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
                <HeaderIcon name={item.icon} color={active ? C.primary : C.g600} />
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
              style={{ ...headerLinkStyle(false), border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <HeaderIcon name="user" color={C.g600} />
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
                  width: 292,
                  borderRadius: 18,
                  border: `1px solid ${C.g200}`,
                  background: C.white,
                  boxShadow: '0 18px 42px rgba(31, 47, 39, .14)',
                  padding: 14,
                  zIndex: 980,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px 12px', position: 'relative', paddingRight: 84 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: C.primary, color: C.white, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: C.g800, lineHeight: 1.3 }}>{user.name || '사용자'}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.g400, marginTop: 3 }}>{ROLE_LABELS[user.role]}</div>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    disabled={logoutPending}
                    style={{ position: 'absolute', top: 7, right: 8, height: 28, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '0 12px', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: logoutPending ? 'not-allowed' : 'pointer', opacity: logoutPending ? .55 : 1 }}
                  >
                    {logoutPending ? '로그아웃 중' : '로그아웃'}
                  </button>
                </div>

                <div style={{ height: 1, background: C.g100, margin: '0 8px 8px' }} />

                <div style={{ padding: '8px 6px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>테마</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: C.g100, padding: 6 }}>
                      <span aria-hidden="true" style={{ width: 17, height: 17, borderRadius: 999, background: activeThemeGradient, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.4)' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px 10px' }}>
                    {themeOptions.map(([id, theme]) => {
                      const active = id === themeId;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          aria-label={`${theme.label} 테마`}
                          onClick={() => setThemeId(id)}
                          title={`${theme.label} 테마`}
                          style={{ border: 'none', background: 'transparent', padding: '2px 0', minWidth: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', justifyItems: 'center' }}
                        >
                          <span style={{ width: 42, height: 42, borderRadius: 999, background: theme.gradient, boxShadow: active ? `0 0 0 3px ${C.white}, 0 0 0 6px ${C.light}` : '0 8px 18px rgba(31,47,39,.10)', transition: 'box-shadow .18s ease, transform .18s ease', transform: active ? 'scale(1.03)' : 'none' }} />
                        </button>
                      );
                    })}
                  </div>
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
      <footer className={mainClassName ? `app-footer ${mainClassName}-footer` : 'app-footer'}>
        <div>© 2026 i-veri. All rights reserved.</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 22, minWidth: 0 }}>
          <span>이용약관</span>
          <span>개인정보처리방침</span>
          <span style={{ width: 1, height: 14, background: C.g200 }} />
          <span>v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
