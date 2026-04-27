'use client';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { AppFrame, ProjectStageStepper } from '../../components/common';
import { C } from '../../lib/theme';
import { getAccessibleProjects, getSheFilterOptions, STATUS_META } from '../../lib/project-data';
import { ROLE_LABELS, can } from '../../lib/permissions';
import { useCurrentUser } from '../../lib/dev-user';
export default function ProjectsPage() {
    const { user } = useCurrentUser();
    const projects = getAccessibleProjects(user);
    const filterOptions = getSheFilterOptions(user);
    const canRequestAction = can(user, 'requestAction');
    return (<AppFrame title={user.role === 'project_manager' ? '담당 프로젝트 목록' : '전체 프로젝트 목록'} description={`${ROLE_LABELS[user.role]} 권한으로 조회 가능한 프로젝트입니다.`} actions={<Button size="sm" onClick={() => { window.location.href = '/dashboard'; }}>대시보드로 이동</Button>}>
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

      <div data-ui="app-projects-page.project-list" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {projects.map((project) => (<Card key={project.id} style={{ padding: '18px 20px' }}>
            <div data-ui="app-projects-page.project-list-card" role="button" tabIndex={0} onClick={() => { window.location.href = `/projects/${project.id}`; }} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    window.location.href = `/projects/${project.id}`;
                }
            }} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 18, alignItems: 'start', cursor: 'pointer', outline: 'none' }}>
              <div data-ui="app-projects-page.project-list-main" style={{ minWidth: 0 }}>
                <div data-ui="app-projects-page.project-list-title-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div data-ui="app-projects-page.project-list-title" style={{ color: C.g800, fontSize: 18, fontWeight: 900 }}>{project.constructionName}</div>
                  <span data-ui="app-projects-page.span-1" style={{ fontSize: 10, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '4px 10px' }}>
                    {STATUS_META[project.status].label}
                  </span>
                </div>
                <div data-ui="app-projects-page.project-list-meta" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
                  {[
                    ['프로젝트 번호', project.contractNumber],
                    ['관리자', project.manager],
                    ['공사기간', project.period],
                    ['공정률', project.progressRate],
                  ].map(([label, value]) => (<div data-ui="app-projects-page.project-list-meta-item" key={label} style={{ minWidth: 0 }}>
                      <div data-ui="app-projects-page.project-list-meta-label" style={{ fontSize: 11, color: C.g400, fontWeight: 800, marginBottom: 4 }}>{label}</div>
                      <div data-ui="app-projects-page.project-list-meta-value" style={{ fontSize: 12, color: C.g800, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                    </div>))}
                </div>
                <ProjectStageStepper currentStage={project.stageIndex} compact/>
              </div>
            </div>
          </Card>))}
      </div>
    </AppFrame>);
}
