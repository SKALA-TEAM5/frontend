'use client';
import Link from 'next/link';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { AppFrame, ProjectStageStepper } from '../../components/common';
import { C } from '../../lib/theme';
import { CURRENT_USER, getAccessibleProjects, getSheFilterOptions, STATUS_META } from '../../lib/project-data';
import { can } from '../../lib/permissions';
import { getPrimaryProjectAction } from '../../lib/project-actions';
export default function ProjectsPage() {
    const projects = getAccessibleProjects(CURRENT_USER);
    const filterOptions = getSheFilterOptions(CURRENT_USER);
    const canRequestAction = can(CURRENT_USER, 'requestAction');
    return (<AppFrame title="프로젝트 목록" description="권한이 있는 프로젝트를 조회하고, 상태/담당자/기간 기준으로 빠르게 찾을 수 있는 화면입니다." actions={<Button size="sm" onClick={() => { window.location.href = '/dashboard'; }}>대시보드로 이동</Button>}>
      <Card style={{ padding: '18px 20px', marginBottom: 18 }}>
        <div data-ui="app-projects-page.div-1" style={{ display: 'grid', gridTemplateColumns: canRequestAction ? '1.3fr .9fr .9fr .9fr 120px' : '1.2fr 1fr 1fr 120px', gap: 10, alignItems: 'end' }}>
          <div data-ui="app-projects-page.div-2">
            <div data-ui="app-projects-page.div-3" style={{ fontSize: 11, fontWeight: 700, color: C.g400, marginBottom: 6 }}>프로젝트명 / 계약번호</div>
            <input data-ui="app-projects-page.input-1" placeholder="프로젝트명을 검색하세요" style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.g200}`, fontFamily: 'inherit' }}/>
          </div>
          <div data-ui="app-projects-page.div-4">
            <div data-ui="app-projects-page.div-5" style={{ fontSize: 11, fontWeight: 700, color: C.g400, marginBottom: 6 }}>기간</div>
            <input data-ui="app-projects-page.input-2" placeholder="2026-04 ~ 2026-06" style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.g200}`, fontFamily: 'inherit' }}/>
          </div>
          {canRequestAction && (<>
              <div data-ui="app-projects-page.div-6">
                <div data-ui="app-projects-page.div-7" style={{ fontSize: 11, fontWeight: 700, color: C.g400, marginBottom: 6 }}>프로젝트 관리자</div>
                <select data-ui="app-projects-page.select-1" style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.g200}`, fontFamily: 'inherit' }}>
                  {filterOptions.managers.map((item) => <option data-ui="app-projects-page.option-1" key={item}>{item}</option>)}
                </select>
              </div>
              <div data-ui="app-projects-page.div-8">
                <div data-ui="app-projects-page.div-9" style={{ fontSize: 11, fontWeight: 700, color: C.g400, marginBottom: 6 }}>상태</div>
                <select data-ui="app-projects-page.select-2" style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.g200}`, fontFamily: 'inherit' }}>
                  {filterOptions.statuses.map((item) => <option data-ui="app-projects-page.option-2" key={item}>{item}</option>)}
                </select>
              </div>
            </>)}
          <Button size="sm">조회</Button>
        </div>
      </Card>

      <div data-ui="app-projects-page.div-10" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {projects.map((project) => (<Card key={project.id} style={{ padding: '20px 22px' }}>
            <div data-ui="app-projects-page.div-11" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 220px', gap: 20, alignItems: 'start' }}>
              <div data-ui="app-projects-page.div-12">
                <div data-ui="app-projects-page.div-13" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <Link href={`/projects/${project.id}`} style={{ textDecoration: 'none', color: C.g800, fontSize: 18, fontWeight: 900 }}>{project.name}</Link>
                  <span data-ui="app-projects-page.span-1" style={{ fontSize: 10, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '4px 10px' }}>
                    {STATUS_META[project.status].label}
                  </span>
                </div>
                <div data-ui="app-projects-page.div-14" style={{ fontSize: 12, color: C.g400, marginBottom: 12 }}>{project.contractNumber} · {project.manager} · {project.period}</div>
                <ProjectStageStepper currentStage={project.stageIndex} compact/>
              </div>
              <div data-ui="app-projects-page.div-15" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div data-ui="app-projects-page.div-16">
                  <div data-ui="app-projects-page.div-17" style={{ fontSize: 11, color: C.g400, fontWeight: 700 }}>최근 활동</div>
                  <div data-ui="app-projects-page.div-18" style={{ fontSize: 12, color: C.g600, marginTop: 6, lineHeight: 1.6 }}>{project.recentActivity}</div>
                </div>
                <div data-ui="app-projects-page.div-19">
                  <div data-ui="app-projects-page.div-20" style={{ fontSize: 11, color: C.g400, fontWeight: 700 }}>다음 액션</div>
                  <div data-ui="app-projects-page.div-21" style={{ fontSize: 12, color: C.primary, marginTop: 6, lineHeight: 1.6, fontWeight: 700 }}>{getPrimaryProjectAction(CURRENT_USER, project).label}</div>
                </div>
              </div>
              <div data-ui="app-projects-page.div-22" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Button size="sm" onClick={() => { window.location.href = `/projects/${project.id}`; }}>프로젝트 상세</Button>
                <Button size="sm" variant="outline" onClick={() => { window.location.href = `/projects/${project.id}?tab=upload`; }}>증빙 업로드</Button>
                {canRequestAction && <Button size="sm" variant="subtle">조치 요청 관리</Button>}
              </div>
            </div>
          </Card>))}
      </div>
    </AppFrame>);
}
