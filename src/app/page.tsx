'use client';

import { FormEvent, KeyboardEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '../components/ui/Button';
import { C } from '../lib/theme';
import { useCurrentUser } from '../lib/dev-user';
import { login, toAppRole } from '../lib/auth-api';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 50,
  border: `1px solid ${C.g200}`,
  borderRadius: 12,
  padding: '0 15px',
  background: C.white,
  color: C.g800,
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 760,
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
          <div className="login-topline">
            <span>i-veri WorkPlace</span>
          </div>

          <div data-ui="login.2" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div className="login-brand-mark">
                <img src="/uploads/character.png" alt="veri" style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0 }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 29, fontWeight: 880, color: C.primary, lineHeight: 1.08 }}>i-veri</div>
                <div style={{ fontSize: 14, fontWeight: 760, color: C.g500, marginTop: 7 }}>로그인</div>
              </div>
            </div>
          </div>

          <div className="login-copy">
            <div>산업안전관리비 증빙 검증 시스템</div>
            <span>사번과 비밀번호를 입력해 프로젝트 검증 업무를 시작하세요.</span>
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
            <Button type="submit" full size="lg" style={{ height: 52, marginTop: 8, fontSize: 15, borderRadius: 12 }}>
              로그인
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
