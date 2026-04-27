'use client';
import Link from 'next/link';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { AppFrame, ProjectStageStepper } from '../../components/common';
import { C } from '../../lib/theme';
import { CURRENT_USER, getAccessibleProjects, getDashboardCounts, STATUS_META } from '../../lib/project-data';
import { getPrimaryProjectAction } from '../../lib/project-actions';
export default function DashboardPage() {
    const projects = getAccessibleProjects(CURRENT_USER);
    const dashboardCounts = getDashboardCounts(CURRENT_USER);
    return (<AppFrame title="프로젝트 대시보드" description="내가 담당한 프로젝트 현황과 지금 처리해야 할 작업을 먼저 확인할 수 있도록 구성했습니다." actions={<Button size="sm" onClick={() => { window.location.href = '/projects'; }}>프로젝트 전체 보기</Button>}>
      <div data-ui="app-dashboard-page.div-1" style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18, marginBottom: 18 }}>
        <Card style={{ padding: '22px 24px' }}>
          <div data-ui="app-dashboard-page.div-2" style={{ fontSize: 13, fontWeight: 800, color: C.g400, marginBottom: 10 }}>환영합니다</div>
          <div data-ui="app-dashboard-page.div-3" style={{ fontSize: 28, fontWeight: 900, color: C.g800, lineHeight: 1.25 }}>{CURRENT_USER.name}님, 오늘 확인할 프로젝트가 있습니다.</div>
          <div data-ui="app-dashboard-page.div-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 18 }}>
            {[
            { label: '내 프로젝트', value: dashboardCounts.myProjects, color: C.primary, bg: C.bg },
            { label: '조치 요청', value: dashboardCounts.actionRequired, color: C.danger, bg: C.dangerBg },
            { label: '검토 중', value: dashboardCounts.reviewing, color: C.ok, bg: '#F4FBF6' },
            { label: '보고서 작성 중', value: dashboardCounts.reportDrafting, color: '#7B4CE2', bg: '#F5F0FF' },
        ].map((item) => (<div data-ui="app-dashboard-page.div-5" key={item.label} style={{ borderRadius: 16, padding: '16px 14px', background: item.bg }}>
                <div data-ui="app-dashboard-page.div-6" style={{ fontSize: 11, color: C.g400, fontWeight: 700 }}>{item.label}</div>
                <div data-ui="app-dashboard-page.div-7" style={{ fontSize: 26, fontWeight: 900, color: item.color, marginTop: 6 }}>{item.value}</div>
              </div>))}
          </div>
        </Card>
        <Card style={{ padding: '22px 24px' }}>
          <div data-ui="app-dashboard-page.div-8" style={{ fontSize: 13, fontWeight: 800, color: C.g400, marginBottom: 12 }}>오늘 해야 할 일</div>
          <div data-ui="app-dashboard-page.div-9" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.filter((project) => project.status === 'action_required' || project.status === 'drafting_report').map((project) => (<Link key={project.id} href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
                <div data-ui="app-dashboard-page.div-10" style={{ padding: '13px 14px', borderRadius: 14, border: `1px solid ${C.g200}`, background: C.white }}>
                  <div data-ui="app-dashboard-page.div-11" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div data-ui="app-dashboard-page.div-12" style={{ fontSize: 13, fontWeight: 800, color: C.g800 }}>{project.name}</div>
                    <span data-ui="app-dashboard-page.span-1" style={{ fontSize: 10, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '3px 8px' }}>
                      {STATUS_META[project.status].label}
                    </span>
                  </div>
                  <div data-ui="app-dashboard-page.div-13" style={{ fontSize: 12, color: C.g600, marginTop: 6 }}>{getPrimaryProjectAction(CURRENT_USER, project).label}</div>
                </div>
              </Link>))}
          </div>
        </Card>
      </div>

      <div data-ui="app-dashboard-page.div-14" style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr', gap: 18 }}>
        <Card style={{ padding: '22px 24px' }}>
          <div data-ui="app-dashboard-page.div-15" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div data-ui="app-dashboard-page.div-16" style={{ fontSize: 14, fontWeight: 800, color: C.g800 }}>내 프로젝트 현황</div>
            <Link href="/projects" style={{ fontSize: 12, fontWeight: 700, color: C.primary, textDecoration: 'none' }}>전체 목록</Link>
          </div>
          <div data-ui="app-dashboard-page.div-17" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {projects.map((project) => (<Link key={project.id} href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
                <div data-ui="app-dashboard-page.div-18" style={{ border: `1px solid ${C.g200}`, borderRadius: 18, padding: '16px 18px', background: C.white }}>
                  <div data-ui="app-dashboard-page.div-19" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <div data-ui="app-dashboard-page.div-20">
                      <div data-ui="app-dashboard-page.div-21" style={{ fontSize: 15, fontWeight: 800, color: C.g800 }}>{project.name}</div>
                      <div data-ui="app-dashboard-page.div-22" style={{ fontSize: 12, color: C.g400, marginTop: 4 }}>{project.manager} · {project.period}</div>
                    </div>
                    <span data-ui="app-dashboard-page.span-2" style={{ fontSize: 10, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                      {STATUS_META[project.status].label}
                    </span>
                  </div>
                  <ProjectStageStepper currentStage={project.stageIndex} compact/>
                  <div data-ui="app-dashboard-page.div-23" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                    <div data-ui="app-dashboard-page.div-24">
                      <div data-ui="app-dashboard-page.div-25" style={{ fontSize: 11, fontWeight: 700, color: C.g400 }}>최근 현황</div>
                      <div data-ui="app-dashboard-page.div-26" style={{ fontSize: 12, color: C.g600, marginTop: 4, lineHeight: 1.6 }}>{project.recentActivity}</div>
                    </div>
                    <div data-ui="app-dashboard-page.div-27">
                      <div data-ui="app-dashboard-page.div-28" style={{ fontSize: 11, fontWeight: 700, color: C.g400 }}>다음 액션</div>
                      <div data-ui="app-dashboard-page.div-29" style={{ fontSize: 12, color: C.primary, marginTop: 4, lineHeight: 1.6, fontWeight: 700 }}>{getPrimaryProjectAction(CURRENT_USER, project).label}</div>
                    </div>
                  </div>
                </div>
              </Link>))}
          </div>
        </Card>

        <Card style={{ padding: '22px 24px' }}>
          <div data-ui="app-dashboard-page.div-30" style={{ fontSize: 14, fontWeight: 800, color: C.g800, marginBottom: 12 }}>최근 활동</div>
          <div data-ui="app-dashboard-page.div-31" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
            '2026-04-23 10:14 · 김현장 · 개인보호구 항목 영수증 업로드',
            '2026-04-23 10:26 · 시스템 · 안전시설물 설치 폴더로 자동 분류',
            '2026-04-23 11:02 · SHE 담당자 · 현장사진 보완 요청 등록',
            '2026-04-23 11:40 · 박공무 · 보고서 초안 수정',
        ].map((log) => (<div data-ui="app-dashboard-page.div-32" key={log} style={{ padding: '10px 12px', borderRadius: 12, background: C.white, border: `1px solid ${C.g200}`, fontSize: 12, color: C.g600, lineHeight: 1.6 }}>
                {log}
              </div>))}
          </div>
        </Card>
      </div>
    </AppFrame>);
}
