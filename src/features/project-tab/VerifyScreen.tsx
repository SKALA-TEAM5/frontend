import { useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { C } from '../../lib/theme';
import { REPORT_DATA, fmt } from '../../lib/mock-data';
interface VerifyScreenProps {
    contractName: string;
    initialTab?: VerifyTab;
    initialStatus?: VerifyStatus;
}
type VerifyStatus = 'idle' | 'loading' | 'done';
type VerifyTab = 'dashboard' | 'report';
type ReportGenerationStatus = 'idle' | 'generating' | 'done';
type ReportWorkflowStatus = 'editing' | 'saved';
const VerifyScreen = ({ contractName, initialTab = 'dashboard', initialStatus = 'idle' }: VerifyScreenProps) => {
    const [status, setStatus] = useState<VerifyStatus>(initialStatus);
    const [progress, setProgress] = useState(0);
    const [stepsDone, setStepsDone] = useState<string[]>([]);
    const [reportStatus, setReportStatus] = useState<ReportGenerationStatus>('idle');
    const [reportProgress, setReportProgress] = useState(0);
    const [reportWorkflowStatus, setReportWorkflowStatus] = useState<ReportWorkflowStatus>('editing');
    const [reportDraft, setReportDraft] = useState('본 보고서는 제출된 사용내역서, 영수증, 현장사진, 세금내역서 및 제3자사실관계확인서를 기준으로 산업안전보건관리비 사용 적정성을 검토한 초안입니다.\n\n부적정 항목과 조건부 인정 항목은 보완 조치 후 최종 제출 여부를 판단해야 합니다.');
    const [savedAt, setSavedAt] = useState('');
    const activeTab: VerifyTab = initialTab;
    const STEPS = ['사용내역서 OCR 분석 중...', '영수증 항목 매칭 중...', '세금내역서와 제3자사실관계확인서 확인 중...', '법령 기준 적정성 판단 중...', '최종 정산 금액 계산 중...'];
    const REPORT_STEPS = ['검증 결과 요약 구성', '부적정 항목 사유 정리', '보고서 초안 생성', 'PDF 출력 준비'];
    const handleVerify = () => {
        setStatus('loading');
        setProgress(0);
        setStepsDone([]);
        let p = 0;
        let si = 0;
        const iv = setInterval(() => {
            p += Math.random() * 13 + 5;
            if (p >= ((si + 1) * 100) / STEPS.length && si < STEPS.length) {
                setStepsDone((prev) => [...prev, STEPS[si]]);
                si += 1;
            }
            if (p >= 100) {
                clearInterval(iv);
                setStatus('done');
            }
            setProgress(Math.min(p, 100));
        }, 340);
    };
    const handleReportGenerate = () => {
        setReportStatus('generating');
        setReportProgress(0);
        let p = 0;
        const iv = setInterval(() => {
            p += Math.random() * 18 + 9;
            if (p >= 100) {
                clearInterval(iv);
                setReportStatus('done');
                setReportWorkflowStatus('editing');
                setSavedAt('');
            }
            setReportProgress(Math.min(p, 100));
        }, 300);
    };
    const handleSaveDraft = () => {
        setReportWorkflowStatus('saved');
        setSavedAt(new Date().toLocaleString('ko-KR'));
    };
    const okItems = REPORT_DATA.filter((r) => r.status === 'ok');
    const warnItems = REPORT_DATA.filter((r) => r.status === 'warn');
    const errorItems = REPORT_DATA.filter((r) => r.status === 'error');
    const totalUsed = REPORT_DATA.reduce((a, r) => a + r.used, 0);
    const totalTax = REPORT_DATA.reduce((a, r) => a + r.tax, 0);
    const totalSettled = REPORT_DATA.reduce((a, r) => a + r.settled, 0);
    const settleRate = Math.round((totalSettled / totalUsed) * 100);
    const highRiskCount = warnItems.length + errorItems.length;
    const riskScore = 62;
    const issueTypeData = [{ label: '증빙 불일치', count: 2, color: C.danger }, { label: '현장사진 미흡', count: 1, color: C.warn }, { label: '한도 초과 집행', count: 1, color: C.primary }];
    const reportWorkflowMeta = {
        editing: { label: '초안 편집 가능', color: C.warn, bg: C.warnBg, description: '생성된 초안을 바로 편집할 수 있습니다. 수정 후 저장해 주세요.' },
        saved: { label: '저장됨', color: C.ok, bg: '#F4FBF6', description: savedAt ? `마지막 저장: ${savedAt} · 저장 후에도 계속 편집할 수 있습니다.` : '저장된 초안입니다.' },
    }[reportWorkflowStatus];
    const canEditReport = reportStatus === 'done';
    const auditSignals = [
        { title: '본사 사용비 한도 초과', detail: '허용 한도 20% 대비 25.4% 집행으로 반환 조치 가능성이 있습니다.', tone: 'error' },
        { title: '개인보호구 금액 불일치', detail: '사용내역서와 영수증 금액 차이 220,000원이 확인되었습니다.', tone: 'error' },
        { title: '안전시설물 현장사진 보완 필요', detail: '일부 품목은 사진 제출 후 조건부 인정이 가능합니다.', tone: 'warn' },
    ];
    const content = (<>
        <div data-ui="features-project-tab-verify-screen.div-1" className="screen-enter">
          {activeTab === 'dashboard' && <div data-ui="features-project-tab-verify-screen.validation-run-area" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 28 }}>
            <img data-ui="features-project-tab-verify-screen.img-1" src="/uploads/character.png" alt="캐릭터" style={{ width: 88, height: 'auto', flexShrink: 0, objectFit: 'contain' }}/>
            <div data-ui="features-project-tab-verify-screen.div-3" style={{ flex: 1 }}>
              <div data-ui="features-project-tab-verify-screen.div-4" className="speech-bubble">
                <div data-ui="features-project-tab-verify-screen.div-5" style={{ fontSize: 16, fontWeight: 700, color: C.g800, lineHeight: 1.6 }}>증빙 유효성을 사전에 검증해 보세요!</div>
                <div data-ui="features-project-tab-verify-screen.div-6" style={{ fontSize: 13, fontWeight: 400, color: C.g400, marginTop: 4 }}>산업안전보건법 및 관련 고시를 기준으로 AI가 판단합니다</div>
              </div>
            </div>
            <Button size="lg" onClick={handleVerify} disabled={status === 'loading'} style={{ flexShrink: 0, alignSelf: 'center' }}>{status === 'loading' ? '분석 중...' : status === 'done' ? '재검증하기' : '검증하기'}</Button>
          </div>}
          {activeTab === 'dashboard' && status === 'loading' && <Card style={{ marginBottom: 20 }}><div data-ui="features-project-tab-verify-screen.div-7" style={{ fontSize: 13, fontWeight: 600, color: C.g600, marginBottom: 12 }}>AI가 9개 항목을 분석하고 있어요...</div><div data-ui="features-project-tab-verify-screen.div-8" style={{ height: 9, background: C.g100, borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}><div data-ui="features-project-tab-verify-screen.div-9" style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg,${C.primary},${C.light})`, borderRadius: 99, transition: 'width .3s' }}/></div><div data-ui="features-project-tab-verify-screen.div-10" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{stepsDone.map((s, i) => <div data-ui="features-project-tab-verify-screen.div-11" key={i} style={{ fontSize: 12, color: C.mid, display: 'flex', gap: 6 }}><span data-ui="features-project-tab-verify-screen.span-1" style={{ color: C.ok }}>✓</span>{s}</div>)}</div></Card>}
          {activeTab === 'dashboard' && status === 'idle' && <div data-ui="features-project-tab-verify-screen.div-12" style={{ padding: '48px 32px', borderRadius: 18, border: `2px dashed ${C.g200}`, textAlign: 'center', background: C.white }}><div data-ui="features-project-tab-verify-screen.div-13" style={{ fontSize: 32, marginBottom: 12 }}>📋</div><div data-ui="features-project-tab-verify-screen.div-14" style={{ fontSize: 16, fontWeight: 700, color: C.g600, marginBottom: 6 }}>검증 준비 완료</div><div data-ui="features-project-tab-verify-screen.div-15" style={{ fontSize: 13, color: C.g400 }}>위 '검증하기' 버튼을 눌러 분석을 시작하세요</div></div>}
          {activeTab === 'report' && <Card style={{ padding: '18px 20px', marginBottom: 18 }}>
            <div data-ui="features-project-tab-verify-screen.report-generation-area" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'center' }}>
              <div data-ui="features-project-tab-verify-screen.report-generation-copy" style={{ minWidth: 0 }}>
                <div data-ui="features-project-tab-verify-screen.report-generation-title" style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>보고서 생성</div>
                <div data-ui="features-project-tab-verify-screen.report-generation-description" style={{ fontSize: 12, color: C.g400, marginTop: 5, lineHeight: 1.6 }}>검증 결과와 보완 사유를 기준으로 감사 제출용 보고서 초안을 생성합니다.</div>
              </div>
              <div data-ui="features-project-tab-verify-screen.report-generation-actions" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Button size="lg" onClick={handleReportGenerate} disabled={reportStatus === 'generating'}>{reportStatus === 'generating' ? '생성 중...' : reportStatus === 'done' ? '다시 생성하기' : '보고서 생성하기'}</Button>
                <Button size="lg" variant="outline" onClick={() => alert('PDF 보고서 추출 중입니다...')}>PDF 추출</Button>
              </div>
            </div>
            {reportStatus === 'generating' && <div data-ui="features-project-tab-verify-screen.report-generation-progress" style={{ marginTop: 16 }}>
              <div data-ui="features-project-tab-verify-screen.report-generation-progress-track" style={{ height: 9, background: C.g100, borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}><div data-ui="features-project-tab-verify-screen.report-generation-progress-bar" style={{ height: '100%', width: `${reportProgress}%`, background: `linear-gradient(90deg,${C.primary},${C.light})`, borderRadius: 99, transition: 'width .3s' }}/></div>
              <div data-ui="features-project-tab-verify-screen.report-generation-steps" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{REPORT_STEPS.map((step, index) => <span data-ui="features-project-tab-verify-screen.report-generation-step" key={step} style={{ fontSize: 11, fontWeight: 800, color: reportProgress >= ((index + 1) * 100) / REPORT_STEPS.length ? C.primary : C.g400, background: C.g100, borderRadius: 999, padding: '5px 9px' }}>{step}</span>)}</div>
            </div>}
            {reportStatus === 'done' && <div data-ui="features-project-tab-verify-screen.report-generation-done" style={{ marginTop: 14, padding: '10px 12px', borderRadius: 12, background: C.bg, border: `1px solid ${C.light}`, fontSize: 12, color: C.primary, fontWeight: 800 }}>보고서 초안 생성이 완료되었습니다. 아래 보고서 내용을 검토할 수 있습니다.</div>}
          </Card>}
          {((activeTab === 'dashboard' && status === 'done') || (activeTab === 'report' && reportStatus === 'done')) && <div data-ui="features-project-tab-verify-screen.div-16" className="screen-enter">
            {activeTab === 'dashboard' && <>
              <div data-ui="features-project-tab-verify-screen.div-18" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
                {[{ label: '총 집행액', value: fmt(totalUsed), sub: '사용내역서 기준', color: C.primary, bg: C.soft }, { label: '정산 가능액', value: fmt(totalSettled), sub: `정산률 ${settleRate}%`, color: C.ok, bg: '#F4FBF6' }, { label: '공제 세액', value: fmt(totalTax), sub: '세금 제외 금액', color: C.g600, bg: C.g100 }, { label: '리스크 항목', value: `${highRiskCount}건`, sub: '즉시 확인 필요', color: C.danger, bg: C.dangerBg }].map((card, i) => <Card key={i} style={{ padding: '18px 18px 16px', background: card.bg }}><div data-ui="features-project-tab-verify-screen.div-19" style={{ fontSize: 12, fontWeight: 800, color: C.g400, marginBottom: 10 }}>{card.label}</div><div data-ui="features-project-tab-verify-screen.div-20" style={{ fontSize: 26, fontWeight: 900, color: card.color, lineHeight: 1.1 }}>{card.value}</div><div data-ui="features-project-tab-verify-screen.div-21" style={{ fontSize: 11, color: C.g600, marginTop: 8 }}>{card.sub}</div></Card>)}
              </div>
              <div data-ui="features-project-tab-verify-screen.div-22" style={{ display: 'grid', gridTemplateColumns: '1.4fr .9fr', gap: 12, marginBottom: 18 }}>
                <Card style={{ padding: '18px 20px' }}>
                  <div data-ui="features-project-tab-verify-screen.div-23" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}><div data-ui="features-project-tab-verify-screen.div-24"><div data-ui="features-project-tab-verify-screen.div-25" style={{ fontSize: 13, fontWeight: 800, color: C.g800 }}>집행 현황 모니터링</div><div data-ui="features-project-tab-verify-screen.div-26" style={{ fontSize: 11, color: C.g400, marginTop: 3 }}>항목별 집행액 대비 정산 가능액 현황</div></div><div data-ui="features-project-tab-verify-screen.div-27" style={{ fontSize: 12, fontWeight: 700, color: C.primary, background: C.soft, padding: '6px 10px', borderRadius: 99 }}>총 {REPORT_DATA.length}개 항목</div></div>
                  <div data-ui="features-project-tab-verify-screen.div-28" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {REPORT_DATA.map((item) => {
                    const ratio = Math.max(8, Math.round((item.settled / item.used) * 100)) || 0;
                    return <div data-ui="features-project-tab-verify-screen.div-29" key={item.id} style={{ display: 'grid', gridTemplateColumns: '132px 1fr 74px', gap: 12, alignItems: 'center' }}><div data-ui="features-project-tab-verify-screen.div-30" style={{ fontSize: 12, fontWeight: 700, color: C.g800 }}>{item.cat}</div><div data-ui="features-project-tab-verify-screen.div-31" style={{ height: 10, borderRadius: 99, background: C.g100, overflow: 'hidden' }}><div data-ui="features-project-tab-verify-screen.div-32" style={{ height: '100%', width: `${Math.min(ratio, 100)}%`, background: item.status === 'error' ? C.danger : item.status === 'warn' ? C.warn : C.primary, borderRadius: 99 }}/></div><div data-ui="features-project-tab-verify-screen.div-33" style={{ fontSize: 12, fontWeight: 800, color: item.status === 'error' ? C.danger : item.status === 'warn' ? C.warn : C.ok, textAlign: 'right' }}>{item.status === 'error' ? '불가' : `${ratio}%`}</div></div>;
                })}
                  </div>
                </Card>
                <Card style={{ padding: '18px 20px' }}>
                  <div data-ui="features-project-tab-verify-screen.div-34" style={{ fontSize: 13, fontWeight: 800, color: C.g800, marginBottom: 12 }}>감사 지적 가능성 예측</div>
                  <div data-ui="features-project-tab-verify-screen.div-35" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}><div data-ui="features-project-tab-verify-screen.div-36" style={{ width: 90, height: 90, borderRadius: '50%', background: `conic-gradient(${C.warn} 0 ${riskScore}%, ${C.g100} ${riskScore}% 100%)`, display: 'grid', placeItems: 'center' }}><div data-ui="features-project-tab-verify-screen.div-37" style={{ width: 62, height: 62, borderRadius: '50%', background: C.white, display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 900, color: C.warn }}>{riskScore}%</div></div><div data-ui="features-project-tab-verify-screen.div-38"><div data-ui="features-project-tab-verify-screen.div-39" style={{ fontSize: 14, fontWeight: 800, color: C.g800 }}>중간 이상</div><div data-ui="features-project-tab-verify-screen.div-40" style={{ fontSize: 12, color: C.g400, marginTop: 4, lineHeight: 1.6 }}>보완 전 제출 시 감사 지적 가능성이 상대적으로 높습니다.</div></div></div>
                  <div data-ui="features-project-tab-verify-screen.div-41" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{auditSignals.map((signal, i) => <div data-ui="features-project-tab-verify-screen.div-42" key={i} style={{ padding: '10px 12px', borderRadius: 12, background: signal.tone === 'error' ? C.dangerBg : C.warnBg, border: `1px solid ${signal.tone === 'error' ? '#FFCDD2' : '#FFE082'}` }}><div data-ui="features-project-tab-verify-screen.div-43" style={{ fontSize: 12, fontWeight: 800, color: C.g800 }}>{signal.title}</div><div data-ui="features-project-tab-verify-screen.div-44" style={{ fontSize: 11, color: C.g600, marginTop: 4, lineHeight: 1.6 }}>{signal.detail}</div></div>)}</div>
                </Card>
              </div>
              <div data-ui="features-project-tab-verify-screen.div-45" style={{ display: 'grid', gridTemplateColumns: '.95fr 1.05fr', gap: 12, marginBottom: 20 }}>
                <Card style={{ padding: '18px 20px' }}><div data-ui="features-project-tab-verify-screen.div-46" style={{ fontSize: 13, fontWeight: 800, color: C.g800, marginBottom: 12 }}>부적정 항목 유형 분석</div><div data-ui="features-project-tab-verify-screen.div-47" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{issueTypeData.map((item) => <div data-ui="features-project-tab-verify-screen.div-48" key={item.label} style={{ display: 'grid', gridTemplateColumns: '104px 1fr 34px', gap: 10, alignItems: 'center' }}><div data-ui="features-project-tab-verify-screen.div-49" style={{ fontSize: 12, fontWeight: 700, color: C.g600 }}>{item.label}</div><div data-ui="features-project-tab-verify-screen.div-50" style={{ height: 12, borderRadius: 99, background: C.g100, overflow: 'hidden' }}><div data-ui="features-project-tab-verify-screen.div-51" style={{ height: '100%', width: `${item.count * 25}%`, background: item.color, borderRadius: 99 }}/></div><div data-ui="features-project-tab-verify-screen.div-52" style={{ fontSize: 12, fontWeight: 800, color: item.color, textAlign: 'right' }}>{item.count}</div></div>)}</div></Card>
                <Card style={{ padding: '18px 20px' }}><div data-ui="features-project-tab-verify-screen.div-53" style={{ fontSize: 13, fontWeight: 800, color: C.g800, marginBottom: 12 }}>운영자 확인 포인트</div><div data-ui="features-project-tab-verify-screen.div-54" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{[{ label: '부적정', count: errorItems.length, color: C.danger, bg: C.dangerBg, border: '#FFCDD2' }, { label: '조건부 인정', count: warnItems.length, color: C.warn, bg: C.warnBg, border: '#FFE082' }, { label: '적정', count: okItems.length, color: C.ok, bg: C.soft, border: C.light }, { label: '보완 필요 금액', count: fmt(errorItems.reduce((a, r) => a + r.used, 0)), color: C.primary, bg: C.g100, border: C.g200 }].map((c, i) => <div data-ui="features-project-tab-verify-screen.div-55" key={i} style={{ padding: '12px 14px', borderRadius: 12, background: c.bg, border: `1px solid ${c.border}` }}><div data-ui="features-project-tab-verify-screen.div-56" style={{ fontSize: 11, color: c.color, fontWeight: 700 }}>{c.label}</div><div data-ui="features-project-tab-verify-screen.div-57" style={{ fontSize: 22, fontWeight: 900, color: c.color, marginTop: 4 }}>{c.count}</div></div>)}</div></Card>
              </div>
            </>}
            {activeTab === 'report' && <>
              {reportStatus === 'done' && <Card style={{ padding: '18px 20px', marginBottom: 18 }}>
                <div data-ui="features-project-tab-verify-screen.report-workflow-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <div data-ui="features-project-tab-verify-screen.report-workflow-title-group" style={{ minWidth: 0 }}>
                    <div data-ui="features-project-tab-verify-screen.report-workflow-title" style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>보고서 편집/확정</div>
                    <div data-ui="features-project-tab-verify-screen.report-workflow-status" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '6px 10px', borderRadius: 999, background: reportWorkflowMeta.bg, color: reportWorkflowMeta.color, fontSize: 11, fontWeight: 900 }}>
                      {reportWorkflowMeta.label}
                    </div>
                    <div data-ui="features-project-tab-verify-screen.report-workflow-description" style={{ fontSize: 12, color: C.g400, marginTop: 8, lineHeight: 1.55 }}>{reportWorkflowMeta.description}</div>
                  </div>
                  <div data-ui="features-project-tab-verify-screen.report-workflow-actions" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {canEditReport && <Button size="sm" variant="outline" onClick={handleSaveDraft}>저장</Button>}
                  </div>
                </div>
                <textarea data-ui="features-project-tab-verify-screen.report-draft-editor" value={reportDraft} onChange={(e) => setReportDraft(e.target.value)} readOnly={!canEditReport} style={{ width: '100%', minHeight: 156, resize: 'vertical', border: `1px solid ${canEditReport ? C.light : C.g200}`, borderRadius: 12, padding: '12px 14px', fontFamily: 'inherit', fontSize: 13, color: C.g800, lineHeight: 1.7, background: canEditReport ? C.white : C.g100, outline: 'none' }}/>
              </Card>}
              <div data-ui="features-project-tab-verify-screen.div-58" style={{ display: 'flex', gap: 12, marginBottom: 20 }}>{[{ label: '부적정', count: errorItems.length, color: C.danger, bg: C.dangerBg, border: '#FFCDD2' }, { label: '조건부 인정', count: warnItems.length, color: C.warn, bg: C.warnBg, border: '#FFE082' }, { label: '적정', count: okItems.length, color: C.ok, bg: C.soft, border: C.light }].map((c, i) => <div data-ui="features-project-tab-verify-screen.div-59" key={i} style={{ padding: '12px 18px', borderRadius: 12, background: c.bg, border: `1px solid ${c.border}` }}><div data-ui="features-project-tab-verify-screen.div-60" style={{ fontSize: 11, color: c.color, fontWeight: 700 }}>{c.label}</div><div data-ui="features-project-tab-verify-screen.div-61" style={{ fontSize: 24, fontWeight: 900, color: c.color }}>{c.count}<span data-ui="features-project-tab-verify-screen.span-2" style={{ fontSize: 12, fontWeight: 400, color: C.g400, marginLeft: 3 }}>항목</span></div></div>)}<div data-ui="features-project-tab-verify-screen.div-62" style={{ marginLeft: 'auto', padding: '12px 22px', borderRadius: 12, background: C.primary }}><div data-ui="features-project-tab-verify-screen.div-63" style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', fontWeight: 700 }}>총 정산 가능 금액</div><div data-ui="features-project-tab-verify-screen.div-64" style={{ fontSize: 20, fontWeight: 900, color: 'white' }}>{fmt(totalSettled)}</div></div></div>
              <Card style={{ padding: 0 }}>
                <div data-ui="features-project-tab-verify-screen.div-65" style={{ padding: '18px 24px', borderBottom: `1px solid ${C.g100}` }}><div data-ui="features-project-tab-verify-screen.div-66" style={{ fontSize: 15, fontWeight: 800, color: C.g800, marginBottom: 1 }}>적정성 검토 결과 리포트</div><div data-ui="features-project-tab-verify-screen.div-67" style={{ fontSize: 11, color: C.g400 }}>계약명: {contractName} · 검증일: 2025년 4월 22일 · 기준: 산업안전보건법, 산업안전보건관리비 고시</div></div>
                <div data-ui="features-project-tab-verify-screen.div-68" style={{ overflowX: 'auto' }}><table data-ui="features-project-tab-verify-screen.table-1"><thead data-ui="features-project-tab-verify-screen.thead-1"><tr data-ui="features-project-tab-verify-screen.tr-1"><th data-ui="features-project-tab-verify-screen.th-1">항목</th><th data-ui="features-project-tab-verify-screen.th-2" style={{ textAlign: 'right' }}>사용액</th><th data-ui="features-project-tab-verify-screen.th-3" style={{ textAlign: 'right' }}>공제 세액</th><th data-ui="features-project-tab-verify-screen.th-4" style={{ textAlign: 'right' }}>정산 가능액</th><th data-ui="features-project-tab-verify-screen.th-5" style={{ textAlign: 'center' }}>결과</th></tr></thead><tbody data-ui="features-project-tab-verify-screen.tbody-1">{REPORT_DATA.map((r) => <tr data-ui="features-project-tab-verify-screen.tr-2" key={r.id}><td data-ui="features-project-tab-verify-screen.td-1" style={{ fontWeight: 600, color: C.g800 }}>{r.cat}</td><td data-ui="features-project-tab-verify-screen.td-2" style={{ textAlign: 'right' }}>{fmt(r.used)}</td><td data-ui="features-project-tab-verify-screen.td-3" style={{ textAlign: 'right', color: C.g400 }}>{r.tax > 0 ? `-${fmt(r.tax)}` : '—'}</td><td data-ui="features-project-tab-verify-screen.td-4" style={{ textAlign: 'right', fontWeight: 700, color: r.status === 'error' ? C.danger : r.status === 'warn' ? C.warn : C.ok }}>{r.settled > 0 ? fmt(r.settled) : '인정 불가'}</td><td data-ui="features-project-tab-verify-screen.td-5" style={{ textAlign: 'center' }}><span data-ui="features-project-tab-verify-screen.span-3" style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: r.status === 'error' ? C.dangerBg : r.status === 'warn' ? C.warnBg : C.bg, color: r.status === 'error' ? C.danger : r.status === 'warn' ? C.warn : C.ok }}>{r.status === 'error' ? '부적정' : r.status === 'warn' ? '조건부' : '적정'}</span></td></tr>)}<tr data-ui="features-project-tab-verify-screen.tr-3" style={{ borderTop: `2px solid ${C.g200}` }}><td data-ui="features-project-tab-verify-screen.td-6" style={{ fontWeight: 800, color: C.g800 }}>합계</td><td data-ui="features-project-tab-verify-screen.td-7" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(REPORT_DATA.reduce((a, r) => a + r.used, 0))}</td><td data-ui="features-project-tab-verify-screen.td-8" style={{ textAlign: 'right', fontWeight: 700, color: C.g400 }}>-{fmt(REPORT_DATA.reduce((a, r) => a + r.tax, 0))}</td><td data-ui="features-project-tab-verify-screen.td-9" style={{ textAlign: 'right', fontWeight: 900, color: C.primary, fontSize: 14 }}>{fmt(totalSettled)}</td><td data-ui="features-project-tab-verify-screen.td-10"/></tr></tbody></table></div>
                <div data-ui="features-project-tab-verify-screen.div-69" style={{ padding: '20px 24px', borderTop: `1px solid ${C.g100}` }}><div data-ui="features-project-tab-verify-screen.div-70" style={{ fontSize: 13, fontWeight: 800, color: C.g800, marginBottom: 12 }}>부적정 · 주의 항목 세부 사유</div>{[...errorItems, ...warnItems].map((r, i) => <div data-ui="features-project-tab-verify-screen.div-71" key={i} style={{ marginBottom: 10, padding: '14px 16px', borderRadius: 12, background: r.status === 'error' ? C.dangerBg : C.warnBg, border: `1px solid ${r.status === 'error' ? '#FFCDD2' : '#FFE082'}` }}><div data-ui="features-project-tab-verify-screen.div-72" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}><span data-ui="features-project-tab-verify-screen.span-4" style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: r.status === 'error' ? C.danger : C.warn, color: 'white' }}>{r.status === 'error' ? '부적정' : '주의'}</span><span data-ui="features-project-tab-verify-screen.span-5" style={{ fontSize: 13, fontWeight: 700, color: C.g800 }}>{r.cat}</span></div><div data-ui="features-project-tab-verify-screen.div-73" style={{ fontSize: 12, color: C.g800, lineHeight: 1.7 }}>{r.note}</div></div>)}</div>
              </Card>
            </>}
          </div>}
        </div>
    </>);
    return <div data-ui="features-project-tab-verify-screen.div-75" style={{ background: C.soft }}>{content}</div>;
};
export default VerifyScreen;
