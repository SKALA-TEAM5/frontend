'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppFrame } from '../../../components/common';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import { createProject, getAllProjects, type NewProjectInput, type ProjectSummary } from '../../../lib/project-data';
import { C } from '../../../lib/theme';
import { workflowStorage } from '../../../lib/workflow-storage';
import type { ArchiveSeed } from '../../../types/domain';

interface ProjectManagerAccount {
  name: string;
  employeeNumber: string;
  loginId: string;
  password: string;
}

const MANAGER_STORAGE_KEY = 'sananbee.project.managers';
const defaultManagers = ['김현장', '박공무', '이프로'];

const readManagers = () => {
  if (typeof window === 'undefined') return defaultManagers;
  try {
    const stored = JSON.parse(window.localStorage.getItem(MANAGER_STORAGE_KEY) || '[]') as ProjectManagerAccount[];
    return Array.from(new Set([...defaultManagers, ...stored.map((manager) => manager.name)]));
  } catch {
    return defaultManagers;
  }
};

const saveManagerAccount = (account: ProjectManagerAccount) => {
  const stored = JSON.parse(window.localStorage.getItem(MANAGER_STORAGE_KEY) || '[]') as ProjectManagerAccount[];
  window.localStorage.setItem(MANAGER_STORAGE_KEY, JSON.stringify([account, ...stored.filter((manager) => manager.employeeNumber !== account.employeeNumber)]));
};

const makePassword = (employeeNumber: string) => `Sanbee!${employeeNumber.replace(/\D/g, '').slice(-4) || '0000'}`;

const cleanExtractedValue = (value: string) =>
  value
    .replace(/\r/g, '')
    .split(/\n|,|\t/)
    [0]
    ?.replace(/\s{2,}.*/, '')
    .trim() || '';

const extractByLabels = (source: string, labels: string[]) => {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`${escaped}\\s*[:：]?\\s*([^\\n\\t,]+)`, 'i'));
    const value = match?.[1] ? cleanExtractedValue(match[1]) : '';
    if (value && value !== label) return value;
  }
  return '';
};

const normalizeDate = (value: string) => {
  const match = value.match(/(20\d{2})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
};

const inferProjectNameFromFileName = (fileName: string) => {
  const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[_-]?사용내역서.*$/, '').replace(/[_-]?산안비.*$/, '').replace(/[_-]/g, ' ').trim();
  return baseName.length >= 3 ? baseName : '';
};

const parseProjectPeriod = (period: string) => {
  const [startDate = '', endDate = ''] = period.split('~').map((date) => normalizeDate(date.trim()));
  return { startDate, endDate };
};

const projectToFormSeed = (project: ProjectSummary): Partial<NewProjectInput> => {
  const { startDate, endDate } = parseProjectPeriod(project.period);
  return {
    contractNumber: project.contractNumber,
    constructionName: project.constructionName || project.name,
    constructionCompany: project.constructionCompany,
    representative: project.representative,
    client: project.client,
    constructionAmount: project.constructionAmount.replace(/\D/g, ''),
    startDate,
    endDate,
    location: project.location,
  };
};

const parseUsageStatementInfo = async (file: File): Promise<Partial<NewProjectInput>> => {
  const fileName = file.name;
  let text = '';
  if (/\.(txt|csv)$/i.test(fileName)) {
    text = await file.text();
  }
  const source = `${fileName}\n${text}`;
  const period = extractByLabels(source, ['공사기간', '기간']);
  const periodDates = period.match(/(20\d{2}[./-]\d{1,2}[./-]\d{1,2}).*?(20\d{2}[./-]\d{1,2}[./-]\d{1,2})/);

  return {
    contractNumber: extractByLabels(source, ['프로젝트 번호', '계약번호', '공사번호']),
    constructionName: extractByLabels(source, ['공사명', '프로젝트명']) || inferProjectNameFromFileName(fileName),
    constructionCompany: extractByLabels(source, ['건설업체명', '건설업체', '시공사']),
    representative: extractByLabels(source, ['대표자', '대표자명']),
    client: extractByLabels(source, ['발주자', '발주처']),
    constructionAmount: extractByLabels(source, ['공사금액', '계약금액']).replace(/\D/g, ''),
    startDate: periodDates ? normalizeDate(periodDates[1]) : normalizeDate(extractByLabels(source, ['공사 시작일', '착공일', '시작일'])),
    endDate: periodDates ? normalizeDate(periodDates[2]) : normalizeDate(extractByLabels(source, ['공사 마감일', '준공일', '종료일'])),
    location: extractByLabels(source, ['소재지', '현장 소재지', '주소']),
  };
};

const initialForm: NewProjectInput = {
  contractNumber: '',
  constructionName: '',
  constructionCompany: '',
  representative: '',
  client: '',
  constructionAmount: '',
  manager: '',
  startDate: '',
  endDate: '',
  location: '',
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  height: 42,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 12,
  border: `1px solid ${C.g200}`,
  background: C.white,
  color: C.g800,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 800,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 900,
  color: C.g600,
  marginBottom: 7,
};

const requiredFields: Array<keyof NewProjectInput> = [
  'contractNumber',
  'constructionName',
  'constructionCompany',
  'representative',
  'client',
  'constructionAmount',
  'manager',
  'startDate',
  'endDate',
  'location',
];

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState<NewProjectInput>(initialForm);
  const [managers, setManagers] = useState(defaultManagers);
  const [managerModalOpen, setManagerModalOpen] = useState(false);
  const [managerDraft, setManagerDraft] = useState({ name: '', employeeNumber: '' });
  const [createdManager, setCreatedManager] = useState<ProjectManagerAccount | null>(null);
  const [usageStatementFile, setUsageStatementFile] = useState<File | null>(null);
  const [usageStatementParseMessage, setUsageStatementParseMessage] = useState('');
  const [projectImportOpen, setProjectImportOpen] = useState(false);
  const [projectImportQuery, setProjectImportQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setManagers(readManagers());
  }, []);

  const updateField = (key: keyof NewProjectInput, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const updateAmount = (value: string) => {
    updateField('constructionAmount', value.replace(/\D/g, ''));
  };

  const importedProjectResults = getAllProjects().filter((project) => {
    const query = projectImportQuery.trim().toLowerCase();
    if (!query) return true;
    return `${project.contractNumber} ${project.constructionName} ${project.name}`.toLowerCase().includes(query);
  });

  const resetForm = () => {
    setForm(initialForm);
    setUsageStatementFile(null);
    setUsageStatementParseMessage('');
    setError('');
  };

  const handleUsageStatementFile = async (file: File | null) => {
    setUsageStatementFile(file);
    setUsageStatementParseMessage('');
    if (!file) return;

    const parsed = await parseUsageStatementInfo(file);
    const filledKeys = Object.entries(parsed).filter(([, value]) => Boolean(value?.trim()));
    setForm((current) => {
      const next = { ...current };
      filledKeys.forEach(([key, value]) => {
        const typedKey = key as keyof NewProjectInput;
        if (!next[typedKey] && value) next[typedKey] = value;
      });
      return next;
    });
    setUsageStatementParseMessage(
      filledKeys.length
        ? `사용내역서에서 기본 정보 ${filledKeys.length}개를 자동 입력했습니다.`
        : '파일을 첨부했습니다. 자동 입력할 기본 정보는 찾지 못했습니다.',
    );
  };

  const importProjectInfo = (project: ProjectSummary) => {
    const seed = projectToFormSeed(project);
    const filledKeys = Object.entries(seed).filter(([, value]) => Boolean(value?.trim()));
    setForm((current) => {
      const next = { ...current };
      filledKeys.forEach(([key, value]) => {
        const typedKey = key as keyof NewProjectInput;
        if (!next[typedKey] && value) next[typedKey] = value;
      });
      return next;
    });
    setProjectImportOpen(false);
    setProjectImportQuery('');
    setError('');
  };

  const createManager = () => {
    const name = managerDraft.name.trim();
    const employeeNumber = managerDraft.employeeNumber.trim().toUpperCase();
    if (!name || !employeeNumber) {
      setError('담당자 이름과 사번을 입력해 주세요.');
      return;
    }
    const account: ProjectManagerAccount = {
      name,
      employeeNumber,
      loginId: `PM${employeeNumber.replace(/[^A-Z0-9]/g, '')}`,
      password: makePassword(employeeNumber),
    };
    saveManagerAccount(account);
    setManagers((current) => Array.from(new Set([account.name, ...current])));
    updateField('manager', account.name);
    setCreatedManager(account);
    setError('');
  };

  const copyAccount = async () => {
    if (!createdManager) return;
    await navigator.clipboard.writeText(`아이디: ${createdManager.loginId}\n비밀번호: ${createdManager.password}`);
  };

  const submit = () => {
    const missing = requiredFields.find((key) => !form[key].trim());
    if (missing) {
      setError('필수 정보를 모두 입력해 주세요.');
      return;
    }
    if (new Date(form.startDate).getTime() > new Date(form.endDate).getTime()) {
      setError('공사 시작일은 마감일보다 늦을 수 없습니다.');
      return;
    }

    const project = createProject({ ...form, usageStatementFileName: usageStatementFile?.name });
    if (usageStatementFile) {
      const archiveSeed: ArchiveSeed = {
        usage_statement: [{
          id: `usage-${Date.now()}`,
          name: usageStatementFile.name,
          kind: 'usage_statement',
          uploadedAt: new Date().toISOString().slice(0, 10),
          uploadedBy: form.manager,
          categoryIds: [],
        }],
        categories: {},
      };
      workflowStorage.setArchiveSeed(project.id, archiveSeed);
      workflowStorage.setMatchReady(project.id, true);
    }
    router.push(`/projects/${project.id}`);
  };

  return (
    <AppFrame title="새 프로젝트 등록" description="산안비 정산을 진행할 프로젝트 기본 정보를 등록합니다.">
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <Card style={{ padding: '22px 24px', width: '100%', maxWidth: 940 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.g800 }}>새 프로젝트</div>
            <div style={{ fontSize: 13, color: C.g400, marginTop: 5 }}>등록 후 프로젝트 상세 화면에서 사용내역서와 증빙을 업로드할 수 있습니다.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button size="sm" variant="outline" onClick={() => setProjectImportOpen(true)}>불러오기</Button>
            <Button size="sm" variant="outline" onClick={() => router.push('/projects')}>목록으로</Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          <div>
            <label style={labelStyle}>프로젝트 번호</label>
            <input value={form.contractNumber} onChange={(event) => updateField('contractNumber', event.target.value)} placeholder="예: 2026-0001" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>공사명</label>
            <input value={form.constructionName} onChange={(event) => updateField('constructionName', event.target.value)} placeholder="예: 성수 업무시설 증축공사" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>건설업체</label>
            <input value={form.constructionCompany} onChange={(event) => updateField('constructionCompany', event.target.value)} placeholder="건설업체명" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>대표자</label>
            <input value={form.representative} onChange={(event) => updateField('representative', event.target.value)} placeholder="대표자명" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>발주자</label>
            <input value={form.client} onChange={(event) => updateField('client', event.target.value)} placeholder="발주자명" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>프로젝트 담당자</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              <select value={form.manager} onChange={(event) => {
                if (event.target.value === '__new__') {
                  setManagerModalOpen(true);
                  return;
                }
                updateField('manager', event.target.value);
              }} style={fieldStyle}>
                <option value="">담당자를 직접 선택해 주세요</option>
                {managers.map((manager) => <option key={manager} value={manager}>{manager}</option>)}
                <option value="__new__">새 담당자 추가하기</option>
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>공사금액</label>
            <input inputMode="numeric" value={form.constructionAmount} onChange={(event) => updateAmount(event.target.value)} placeholder="예: 12000000000" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>소재지</label>
            <input value={form.location} onChange={(event) => updateField('location', event.target.value)} placeholder="현장 소재지" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>공사 시작일</label>
            <input type="date" value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>공사 마감일</label>
            <input type="date" value={form.endDate} onChange={(event) => updateField('endDate', event.target.value)} style={fieldStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>사용내역서 업로드</label>
            <label style={{ minHeight: 58, border: `1px dashed ${C.light}`, borderRadius: 14, background: C.bg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 14px', cursor: 'pointer', fontSize: 13, fontWeight: 900 }}>
              <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{usageStatementFile ? usageStatementFile.name : '사용내역서 파일을 선택해 주세요'}</span>
              <span style={{ flexShrink: 0 }}>파일 선택</span>
              <input type="file" accept=".pdf,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg" onChange={(event) => void handleUsageStatementFile(event.target.files?.[0] || null)} style={{ display: 'none' }} />
            </label>
            {usageStatementParseMessage && <div style={{ fontSize: 12, color: C.g600, fontWeight: 800, marginTop: 7 }}>{usageStatementParseMessage}</div>}
          </div>
        </div>

        {error && <div style={{ marginTop: 14, fontSize: 13, fontWeight: 900, color: C.danger }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
          <Button size="md" variant="outline" onClick={resetForm}>초기화</Button>
          <Button size="md" onClick={submit}>프로젝트 등록</Button>
        </div>
      </Card>
      </div>
      <Modal open={managerModalOpen} onClose={() => setManagerModalOpen(false)} maxWidth={520}>
        <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 6 }}>새 담당자 생성</div>
          <div style={{ fontSize: 13, color: C.g400, lineHeight: 1.5, marginBottom: 16 }}>담당자 이름과 사번을 입력하면 프로젝트 담당자 로그인 계정이 생성됩니다.</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={labelStyle}>담당자 이름</label>
              <input value={managerDraft.name} onChange={(event) => setManagerDraft((current) => ({ ...current, name: event.target.value }))} placeholder="예: 최현장" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>사번</label>
              <input value={managerDraft.employeeNumber} onChange={(event) => setManagerDraft((current) => ({ ...current, employeeNumber: event.target.value }))} placeholder="예: 240015" style={fieldStyle} />
            </div>
          </div>
          {createdManager && (
            <div style={{ marginTop: 16, borderRadius: 14, border: `1px solid ${C.g200}`, background: C.g100, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.g600, marginBottom: 8 }}>생성된 로그인 정보</div>
              <div style={{ fontSize: 14, color: C.g800, fontWeight: 900, lineHeight: 1.7 }}>아이디: {createdManager.loginId}<br />비밀번호: {createdManager.password}</div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button size="sm" variant="outline" onClick={() => setManagerModalOpen(false)}>닫기</Button>
            {createdManager && <Button size="sm" variant="outline" onClick={copyAccount}>계정 정보 복사</Button>}
            <Button size="sm" onClick={createManager}>담당자 생성</Button>
          </div>
        </div>
      </Modal>
      <Modal open={projectImportOpen} onClose={() => setProjectImportOpen(false)} maxWidth={640}>
        <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 6 }}>프로젝트 정보 불러오기</div>
          <div style={{ fontSize: 13, color: C.g400, lineHeight: 1.5, marginBottom: 16 }}>계약번호 또는 공사명으로 조회한 뒤 선택하면 비어 있는 기본 정보만 자동 입력됩니다. 프로젝트 담당자는 직접 선택해야 합니다.</div>
          <input value={projectImportQuery} onChange={(event) => setProjectImportQuery(event.target.value)} placeholder="계약번호 또는 공사명 검색" style={{ ...fieldStyle, marginBottom: 12 }} />
          <div style={{ maxHeight: 330, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {importedProjectResults.map((project) => (
              <button key={project.id} type="button" onClick={() => importProjectInfo(project)} style={{ border: `1px solid ${C.g200}`, borderRadius: 14, background: C.white, padding: '13px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.constructionName}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.g400, marginTop: 5 }}>{project.contractNumber} · {project.constructionCompany}</div>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 900, color: C.primary }}>선택</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 10, fontSize: 12, color: C.g600, fontWeight: 800 }}>
                  <span>발주자 {project.client}</span>
                  <span>공사기간 {project.period}</span>
                  <span>소재지 {project.location}</span>
                </div>
              </button>
            ))}
            {!importedProjectResults.length && (
              <div style={{ border: `1px solid ${C.g200}`, borderRadius: 14, padding: 18, color: C.g400, fontSize: 13, fontWeight: 900, textAlign: 'center' }}>조회된 프로젝트가 없습니다.</div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <Button size="sm" variant="outline" onClick={() => setProjectImportOpen(false)}>닫기</Button>
          </div>
        </div>
      </Modal>
    </AppFrame>
  );
}
