'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import { AppFrame } from '../../../components/common';
import { createUser, deleteUser, listUsers, updateUser, type BackendRoleCode, type BackendUserProfile } from '../../../lib/auth-api';
import { useCurrentUser } from '../../../lib/dev-user';
import { C } from '../../../lib/theme';

const ROLE_OPTIONS: Array<{ code: BackendRoleCode; label: string }> = [
  { code: 'system_admin', label: '시스템 관리자' },
  { code: 'admin', label: 'SHE 담당자' },
  { code: 'user', label: '프로젝트 담당자' },
  { code: 'agent', label: 'Agent' },
];

const roleLabel = (roleCode: BackendRoleCode) => ROLE_OPTIONS.find((role) => role.code === roleCode)?.label || roleCode;

const roleBadgeStyle = (roleCode: BackendRoleCode): React.CSSProperties => {
  const styles: Record<BackendRoleCode, React.CSSProperties> = {
    system_admin: { background: '#FFF8DB', color: '#8A5A00', borderColor: '#F2D59B' },
    admin: { background: '#EAF4FF', color: '#2F73B7', borderColor: '#B9D8F5' },
    user: { background: C.bg, color: C.primary, borderColor: C.light },
    agent: { background: C.g100, color: C.g600, borderColor: C.g200 },
  };
  return {
    display: 'inline-flex',
    alignItems: 'center',
    border: `1px solid ${styles[roleCode].borderColor}`,
    borderRadius: 999,
    padding: '4px 9px',
    fontSize: 11,
    fontWeight: 900,
    ...styles[roleCode],
  };
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  boxSizing: 'border-box',
  border: `1px solid ${C.g200}`,
  borderRadius: 6,
  background: C.white,
  color: C.g800,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  padding: '0 11px',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

type UserDraft = {
  employeeNo: string;
  realName: string;
  password: string;
  roleCode: BackendRoleCode;
};

const emptyDraft: UserDraft = {
  employeeNo: '',
  realName: '',
  password: '',
  roleCode: 'user',
};

export default function AdminUsersPage() {
  const { user } = useCurrentUser();
  const [users, setUsers] = useState<BackendUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState<BackendRoleCode | 'all'>('all');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingUser, setEditingUser] = useState<BackendUserProfile | null>(null);
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BackendUserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadUsers = (params: { keyword?: string; roleFilter?: BackendRoleCode | 'all' } = {}) => {
    const nextKeyword = params.keyword ?? keyword;
    const nextRoleFilter = params.roleFilter ?? roleFilter;
    setLoading(true);
    setLoadError('');
    listUsers({
      roleCode: nextRoleFilter === 'all' ? undefined : nextRoleFilter,
      keyword: nextKeyword.trim() || undefined,
    })
      .then(setUsers)
      .catch((error) => setLoadError(error instanceof Error ? error.message : '사용자 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadUsers({ keyword, roleFilter });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [keyword, roleFilter]);

  const filteredUsers = useMemo(() => users.toSorted((a, b) => a.employeeNo.localeCompare(b.employeeNo)), [users]);

  const openCreateModal = () => {
    setDraft(emptyDraft);
    setEditingUser(null);
    setFormError('');
    setModalMode('create');
  };

  const openEditModal = (target: BackendUserProfile) => {
    setDraft({
      employeeNo: target.employeeNo,
      realName: target.realName,
      password: '',
      roleCode: target.roleCode,
    });
    setEditingUser(target);
    setFormError('');
    setModalMode('edit');
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode(null);
    setEditingUser(null);
    setFormError('');
  };

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const employeeNo = draft.employeeNo.trim();
    const realName = draft.realName.trim();
    const password = draft.password.trim();
    if (!employeeNo || !realName) {
      setFormError('사번과 이름을 입력해 주세요.');
      return;
    }
    if (modalMode === 'create' && password.length < 8) {
      setFormError('초기 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (modalMode === 'edit' && password && password.length < 8) {
      setFormError('변경 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (modalMode === 'create') {
        await createUser({ employeeNo, realName, password, roleCode: draft.roleCode });
      } else if (editingUser) {
        await updateUser(editingUser.id, {
          realName,
          password: password || undefined,
          roleCode: draft.roleCode,
        });
      }
      closeModal();
      loadUsers();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '사용자 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      loadUsers();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '사용자 삭제에 실패했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  if (user.role !== 'system_admin') {
    return (
      <AppFrame title="사용자 관리" description="시스템 관리자 전용 화면입니다.">
        <Card style={{ padding: 28, color: C.danger, fontSize: 14, fontWeight: 900 }}>접근 권한이 없습니다.</Card>
      </AppFrame>
    );
  }

  const userModal = (
    <Modal open={Boolean(modalMode)} onClose={closeModal} zIndex={960} maxWidth={520}>
      <form onSubmit={submitUser} style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 6, boxShadow: '0 18px 44px rgba(31,55,43,.14)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${C.g100}` }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>{modalMode === 'create' ? '사용자 생성' : '사용자 수정'}</div>
          <div style={{ marginTop: 5, fontSize: 12, fontWeight: 800, color: C.g400 }}>{modalMode === 'create' ? '새 계정의 사번, 이름, 초기 비밀번호와 역할을 입력합니다.' : `${editingUser?.employeeNo || ''} 계정 정보를 수정합니다.`}</div>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>사번</span>
            <input value={draft.employeeNo} disabled={modalMode === 'edit'} onChange={(event) => setDraft((current) => ({ ...current, employeeNo: event.target.value }))} style={{ ...inputStyle, background: modalMode === 'edit' ? C.g100 : C.white, color: modalMode === 'edit' ? C.g400 : C.g800 }} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>이름</span>
            <input value={draft.realName} onChange={(event) => setDraft((current) => ({ ...current, realName: event.target.value }))} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>{modalMode === 'create' ? '초기 비밀번호' : '비밀번호 변경'}</span>
            <input value={draft.password} type="password" placeholder={modalMode === 'edit' ? '변경하지 않으려면 비워두세요' : ''} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>역할</span>
            <select value={draft.roleCode} onChange={(event) => setDraft((current) => ({ ...current, roleCode: event.target.value as BackendRoleCode }))} style={selectStyle}>
              {ROLE_OPTIONS.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}
            </select>
          </label>
          {formError && <div style={{ border: `1px solid #FFCDD2`, borderRadius: 6, background: C.dangerBg, color: C.danger, padding: '10px 12px', fontSize: 13, fontWeight: 900 }}>{formError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={closeModal} disabled={saving} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '9px 14px', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: saving ? 'not-allowed' : 'pointer' }}>취소</button>
            <button type="submit" disabled={saving} style={{ border: 'none', borderRadius: 999, background: saving ? C.g200 : C.primary, color: saving ? C.g400 : C.white, padding: '9px 16px', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? '저장 중' : '저장'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );

  const deleteModal = (
    <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} zIndex={970} maxWidth={440}>
      <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 6, boxShadow: '0 18px 44px rgba(31,55,43,.14)', padding: 22 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 8 }}>사용자 삭제</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.6 }}>{deleteTarget?.realName} 계정을 삭제하시겠습니까?</div>
        {deleteError && <div style={{ marginTop: 12, border: `1px solid #FFCDD2`, borderRadius: 6, background: C.dangerBg, color: C.danger, padding: '10px 12px', fontSize: 13, fontWeight: 900 }}>{deleteError}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '9px 14px', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: deleting ? 'not-allowed' : 'pointer' }}>취소</button>
          <button type="button" onClick={confirmDelete} disabled={deleting} style={{ border: 'none', borderRadius: 999, background: deleting ? C.g200 : C.danger, color: deleting ? C.g400 : C.white, padding: '9px 16px', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: deleting ? 'not-allowed' : 'pointer' }}>{deleting ? '삭제 중' : '삭제'}</button>
        </div>
      </div>
    </Modal>
  );

  return (
    <AppFrame
      title="사용자 관리"
      description="시스템 계정과 역할을 관리합니다."
      actions={<Button size="sm" onClick={openCreateModal} style={{ boxShadow: 'none' }}>사용자 생성</Button>}
    >
      <Card style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 180px', gap: 10, alignItems: 'center' }}>
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="사번 또는 이름 검색" style={inputStyle} />
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as BackendRoleCode | 'all')} style={selectStyle}>
            <option value="all">전체 역할</option>
            {ROLE_OPTIONS.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}
          </select>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 170px 190px 150px', background: C.g100, borderBottom: `1px solid ${C.g200}` }}>
          {['사번', '이름', '역할', '수정일', '관리'].map((head) => <div key={head} style={{ padding: '12px 14px', fontSize: 12, fontWeight: 900, color: C.g600 }}>{head}</div>)}
        </div>
        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: C.g400, fontSize: 13, fontWeight: 900 }}>사용자 목록을 불러오는 중입니다.</div>
        ) : loadError ? (
          <div style={{ padding: 28, textAlign: 'center', color: C.danger, fontSize: 13, fontWeight: 900 }}>{loadError}</div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: C.g400, fontSize: 13, fontWeight: 900 }}>표시할 사용자가 없습니다.</div>
        ) : filteredUsers.map((item) => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 170px 190px 150px', alignItems: 'center', borderBottom: `1px solid ${C.g100}` }}>
            <div style={{ padding: '12px 14px', fontSize: 13, fontWeight: 900, color: C.g800 }}>{item.employeeNo}</div>
            <div style={{ padding: '12px 14px', fontSize: 13, fontWeight: 900, color: C.g800 }}>{item.realName}</div>
            <div style={{ padding: '12px 14px' }}>
              <span style={roleBadgeStyle(item.roleCode)}>{roleLabel(item.roleCode)}</span>
            </div>
            <div style={{ padding: '12px 14px', fontSize: 12, fontWeight: 800, color: C.g400 }}>{item.updatedAt?.slice(0, 10) || '-'}</div>
            <div style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => openEditModal(item)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, padding: '6px 10px', fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>수정</button>
              <button type="button" onClick={() => setDeleteTarget(item)} style={{ border: `1px solid #FFCDD2`, borderRadius: 999, background: C.dangerBg, color: C.danger, padding: '6px 10px', fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>삭제</button>
            </div>
          </div>
        ))}
      </Card>

      {userModal}
      {deleteModal}
    </AppFrame>
  );
}
