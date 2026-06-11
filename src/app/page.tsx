'use client';

import { FormEvent, KeyboardEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '../components/ui/Button';
import { C } from '../lib/theme';
import { useCurrentUser } from '../lib/dev-user';
import { login, toAppRole } from '../lib/auth-api';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 46,
  border: `1px solid ${C.g200}`,
  borderRadius: 12,
  padding: '0 14px',
  background: C.white,
  color: C.g800,
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 800,
  outline: 'none',
};

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentRole } = useCurrentUser();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await login(employeeNumber.trim(), password);
      const role = toAppRole(result.user.roleCode);
      setError('');
      setCurrentRole(role, {
        id: String(result.user.id),
        name: result.user.realName,
      });
      router.replace(role === 'system_admin' ? '/admin/users' : role === 'she_manager' ? '/dashboard' : '/projects');
    } catch (error) {
      setError(error instanceof Error ? error.message : '사번 또는 비밀번호를 확인해 주세요.');
      return;
    }
  };

  const submitLoginOnEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  return (
    <main data-ui="login.1" className="login-page">
      <section className="login-shell" aria-label="로그인">
        <div className="login-card">
          <div data-ui="login.2" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <img src="/uploads/character.png" alt="veri" style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: C.primary, lineHeight: 1.1 }}>i-veri</div>
                <div style={{ fontSize: 15, fontWeight: 850, color: C.g500, marginTop: 6 }}>로그인</div>
              </div>
            </div>
          </div>

          <form data-ui="login.3" onSubmit={submitLogin} onKeyDown={submitLoginOnEnter} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <input
                aria-label="사번"
                value={employeeNumber}
                onChange={(event) => setEmployeeNumber(event.target.value)}
                placeholder="사번"
                autoComplete="username"
                style={inputStyle}
              />
            </label>
            <label>
              <input
                aria-label="비밀번호"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호"
                type="password"
                autoComplete="current-password"
                style={inputStyle}
              />
            </label>
            {error && <div data-ui="login.4" style={{ border: `1px solid #F2B8B5`, borderRadius: 12, background: C.dangerBg, padding: '10px 12px', fontSize: 13, color: C.danger, fontWeight: 850 }}>{error}</div>}
            <Button type="submit" full size="lg" style={{ height: 50, marginTop: 4, fontSize: 15 }}>
              로그인
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
