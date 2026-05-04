# Backend API Request List

현재 프론트엔드 코드 기준으로 필요한 API 요청 목록입니다. 사용자 역할은 `project_manager`(프로젝트 담당자), `she_manager`(SHE 담당자)만 사용합니다.

<table>
  <colgroup>
    <col style="width: 150px;" />
    <col style="width: 120px;" />
    <col style="width: 76px;" />
    <col style="min-width: 340px; width: 340px;" />
    <col style="width: 300px;" />
    <col style="width: 300px;" />
    <col style="width: 240px;" />
  </colgroup>
  <thead>
    <tr>
      <th>기능명</th>
      <th>담당자</th>
      <th>Method</th>
      <th>URI</th>
      <th>Request 주요값<br>(예시 값 혹은 형식 표시)</th>
      <th>Response 주요값<br>(예시 값 혹은 형식 표시)</th>
      <th>설명</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>로그인</td>
      <td>공통</td>
      <td><code>POST</code></td>
      <td><code>/auth/login</code></td>
      <td><code>email: "pm@example.com"</code><br><code>password: "password"</code></td>
      <td><code>accessToken</code><br><code>user: { id, name, role }</code></td>
      <td>사용자 인증</td>
    </tr>
    <tr>
      <td>회원가입</td>
      <td>공통</td>
      <td><code>POST</code></td>
      <td><code>/auth/signup</code></td>
      <td><code>name</code>, <code>email</code>, <code>password</code><br><code>role: "project_manager" | "she_manager"</code></td>
      <td><code>user: { id, name, role }</code></td>
      <td>신규 사용자 등록</td>
    </tr>
    <tr>
      <td>현재 사용자 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/me</code></td>
      <td>없음</td>
      <td><code>user: { id, name, role }</code></td>
      <td>사이드바 사용자 정보와 권한 분기</td>
    </tr>
    <tr>
      <td>SHE 대시보드 조회</td>
      <td>SHE 담당자</td>
      <td><code>GET</code></td>
      <td><code>/dashboard/she</code></td>
      <td><code>status</code>, <code>managerId</code><br><code>periodFrom: "2024-01-01"</code><br><code>periodTo: "2024-12-31"</code></td>
      <td><code>summary</code><br><code>todoItems</code><br><code>recentActivities</code><br><code>pendingActionRequests</code><br><code>projects</code></td>
      <td>SHE 담당자 로그인 후 첫 화면 데이터</td>
    </tr>
    <tr>
      <td>대시보드 위젯 설정 조회</td>
      <td>SHE 담당자</td>
      <td><code>GET</code></td>
      <td><code>/users/me/dashboard-preferences</code></td>
      <td>없음</td>
      <td><code>visibleWidgetIds: string[]</code><br><code>widgetLayout: string[]</code></td>
      <td>현재 localStorage 위젯 설정의 서버 저장용 조회</td>
    </tr>
    <tr>
      <td>대시보드 위젯 설정 저장</td>
      <td>SHE 담당자</td>
      <td><code>PUT</code></td>
      <td><code>/users/me/dashboard-preferences</code></td>
      <td><code>visibleWidgetIds: string[]</code><br><code>widgetLayout: string[]</code></td>
      <td><code>visibleWidgetIds</code><br><code>widgetLayout</code></td>
      <td>대시보드 위젯 표시/배치 설정 저장</td>
    </tr>
    <tr>
      <td>프로젝트 목록 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects</code></td>
      <td><code>q</code>, <code>status</code>, <code>managerId</code><br><code>periodFrom</code>, <code>periodTo</code><br><code>uploadStatus</code>, <code>actionStatus</code>, <code>reportStatus</code><br><code>sort</code>, <code>page</code>, <code>pageSize</code></td>
      <td><code>projects: ProjectSummary[]</code><br><code>total</code><br><code>filters</code></td>
      <td>프로젝트 담당자는 본인 담당 프로젝트, SHE 담당자는 전체 프로젝트 조회</td>
    </tr>
    <tr>
      <td>프로젝트 상세 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}</code></td>
      <td><code>projectId: "2024-0042"</code></td>
      <td><code>project</code><br><code>stages</code><br><code>permissions</code><br><code>actionRequestDetails</code></td>
      <td>프로젝트 상단 단계, 상세 정보, 개요 탭 데이터 조회</td>
    </tr>
    <tr>
      <td>프로젝트 단계 변경</td>
      <td>공통</td>
      <td><code>PATCH</code></td>
      <td><code>/projects/{projectId}/stage</code></td>
      <td><code>stageId: "validation"</code><br><code>reason</code></td>
      <td><code>project</code><br><code>statusHistory</code></td>
      <td>업로드/검증/보고서 흐름에 따른 단계 변경</td>
    </tr>
    <tr>
      <td>월별 사용내역서 목록 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/usage-statements</code></td>
      <td><code>projectId</code></td>
      <td><code>statements: [{ id, month, sourceFileName, revisionNo, currentAmount, cumulativeAmount, evidenceCount, issueCount }]</code></td>
      <td>프로젝트 기준 사용내역서 목록 조회</td>
    </tr>
    <tr>
      <td>사용내역서 세부 항목 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/usage-statements/{statementId}/line-items</code></td>
      <td><code>projectId</code><br><code>statementId</code></td>
      <td><code>lineItems: [{ id, categoryId, name, amount }]</code></td>
      <td>아카이브 계층 구조의 세부 집행 항목 조회</td>
    </tr>
    <tr>
      <td>증빙 파일 목록 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/evidence</code></td>
      <td><code>kind</code>, <code>categoryId</code>, <code>usageItemId</code></td>
      <td><code>usageStatements</code><br><code>categories</code><br><code>files</code></td>
      <td>증빙 업로드/아카이브 파일 목록 조회</td>
    </tr>
    <tr>
      <td>증빙 파일 업로드</td>
      <td>프로젝트 담당자</td>
      <td><code>POST</code></td>
      <td><code>/projects/{projectId}/evidence</code></td>
      <td><code>files: File[]</code><br><code>kind: "usage_statement" | "receipt" | "site_photo" | "tax_invoice" | "other_document"</code><br><code>categoryIds: string[]</code><br><code>usageItemIds: string[]</code><br><code>description</code></td>
      <td><code>uploadedFiles</code><br><code>archive</code><br><code>activityLog</code></td>
      <td>사용내역서, 영수증, 현장사진, 세금내역서, 기타 서류 업로드</td>
    </tr>
    <tr>
      <td>증빙 파일 수정</td>
      <td>프로젝트 담당자</td>
      <td><code>PATCH</code></td>
      <td><code>/projects/{projectId}/evidence/{evidenceId}</code></td>
      <td><code>kind</code>, <code>categoryIds</code>, <code>usageItemIds</code><br><code>description</code></td>
      <td><code>file</code><br><code>archive</code></td>
      <td>파일 분류 이동, 설명 수정, 세부 항목 연결 변경</td>
    </tr>
    <tr>
      <td>증빙 파일 삭제</td>
      <td>프로젝트 담당자</td>
      <td><code>DELETE</code></td>
      <td><code>/projects/{projectId}/evidence/{evidenceId}</code></td>
      <td><code>projectId</code><br><code>evidenceId</code></td>
      <td><code>deletedId</code><br><code>archive</code></td>
      <td>업로드된 증빙 파일 삭제</td>
    </tr>
    <tr>
      <td>증빙 미리보기 URL 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/evidence/{evidenceId}/preview</code></td>
      <td><code>projectId</code><br><code>evidenceId</code></td>
      <td><code>previewUrl</code><br><code>expiresAt</code></td>
      <td>이미지/PDF 미리보기 URL 조회</td>
    </tr>
    <tr>
      <td>유효성 검증 실행</td>
      <td>프로젝트 담당자</td>
      <td><code>POST</code></td>
      <td><code>/projects/{projectId}/validations</code></td>
      <td><code>usageStatementId</code><br><code>rerun: boolean</code></td>
      <td><code>validationId</code><br><code>status: "running"</code></td>
      <td>OCR/비전/법령 검증 실행</td>
    </tr>
    <tr>
      <td>유효성 검증 진행 상태 조회</td>
      <td>프로젝트 담당자</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/validations/{validationId}</code></td>
      <td><code>projectId</code><br><code>validationId</code></td>
      <td><code>validationId</code><br><code>status</code><br><code>progress</code><br><code>steps</code></td>
      <td>검증 진행률과 단계 조회</td>
    </tr>
    <tr>
      <td>최신 유효성 검증 결과 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/validations/latest</code></td>
      <td><code>projectId</code></td>
      <td><code>id</code><br><code>checkedAt</code><br><code>usageStatementFile</code><br><code>lawAgent</code><br><code>categories</code></td>
      <td>유효성 검증 탭 대시보드 결과 조회</td>
    </tr>
    <tr>
      <td>유효성 검증 결과 확정</td>
      <td>SHE 담당자</td>
      <td><code>POST</code></td>
      <td><code>/projects/{projectId}/validations/{validationId}/confirm</code></td>
      <td><code>decision: "confirm" | "request_action"</code><br><code>comment</code></td>
      <td><code>validationId</code><br><code>project</code><br><code>statusHistory</code></td>
      <td>검증 결과 확정 또는 조치 요청 단계 전환</td>
    </tr>
    <tr>
      <td>조치 요청 목록 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/action-requests</code></td>
      <td><code>projectId</code></td>
      <td><code>actionRequests: [{ id, title, status, requestedBy, assignee, dueDate, reason }]</code></td>
      <td>프로젝트별 조치 요청 목록 조회</td>
    </tr>
    <tr>
      <td>조치 요청 등록</td>
      <td>SHE 담당자</td>
      <td><code>POST</code></td>
      <td><code>/projects/{projectId}/action-requests</code></td>
      <td><code>title</code><br><code>reason</code><br><code>assigneeId</code><br><code>dueDate</code><br><code>relatedValidationId</code><br><code>relatedEvidenceIds</code><br><code>recommendedFiles</code></td>
      <td><code>actionRequest</code><br><code>project</code><br><code>notification</code></td>
      <td>SHE 담당자가 보완 요청 등록</td>
    </tr>
    <tr>
      <td>조치 요청 상태 변경</td>
      <td>공통</td>
      <td><code>PATCH</code></td>
      <td><code>/projects/{projectId}/action-requests/{requestId}</code></td>
      <td><code>status</code><br><code>assigneeId</code><br><code>dueDate</code><br><code>reason</code></td>
      <td><code>actionRequest</code><br><code>project</code></td>
      <td>조치 요청 완료/미완료/보완 업로드 상태 변경</td>
    </tr>
    <tr>
      <td>내 알림 목록 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/users/me/notifications</code></td>
      <td>없음</td>
      <td><code>notifications: [{ id, projectId, title, message, createdAt, readAt }]</code></td>
      <td>조치 요청 알림 조회</td>
    </tr>
    <tr>
      <td>알림 읽음 처리</td>
      <td>공통</td>
      <td><code>PATCH</code></td>
      <td><code>/users/me/notifications/{notificationId}/read</code></td>
      <td><code>notificationId</code></td>
      <td><code>notification</code></td>
      <td>알림 읽음 처리</td>
    </tr>
    <tr>
      <td>보고서 초안 생성</td>
      <td>프로젝트 담당자</td>
      <td><code>POST</code></td>
      <td><code>/projects/{projectId}/reports</code></td>
      <td><code>validationId</code></td>
      <td><code>reportId</code><br><code>status: "drafting"</code></td>
      <td>검증 결과 기반 AI 보고서 초안 생성</td>
    </tr>
    <tr>
      <td>최신 보고서 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/reports/latest</code></td>
      <td><code>projectId</code></td>
      <td><code>report</code><br><code>draftText</code><br><code>reviewComments</code></td>
      <td>보고서 탭에서 초안/저장본 조회</td>
    </tr>
    <tr>
      <td>보고서 임시저장</td>
      <td>프로젝트 담당자</td>
      <td><code>PATCH</code></td>
      <td><code>/projects/{projectId}/reports/{reportId}</code></td>
      <td><code>draftText</code><br><code>status: "drafting" | "saved"</code></td>
      <td><code>report</code><br><code>version</code></td>
      <td>보고서 편집 후 저장</td>
    </tr>
    <tr>
      <td>보고서 최종 확정</td>
      <td>SHE 담당자</td>
      <td><code>POST</code></td>
      <td><code>/projects/{projectId}/reports/{reportId}/finalize</code></td>
      <td><code>comment</code></td>
      <td><code>report</code><br><code>project</code><br><code>statusHistory</code></td>
      <td>SHE 담당자 최종 확정</td>
    </tr>
    <tr>
      <td>보고서 PDF 다운로드</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/reports/{reportId}/pdf</code></td>
      <td><code>projectId</code><br><code>reportId</code></td>
      <td><code>application/pdf</code></td>
      <td>보고서 PDF 추출</td>
    </tr>
    <tr>
      <td>프로젝트 최근 이력 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/activity</code></td>
      <td><code>date: "2026-05-04"</code><br><code>limit: 20</code></td>
      <td><code>activities: [{ id, actorName, action, targetType, createdAt }]</code></td>
      <td>우측 최근 이력 카드 데이터 조회</td>
    </tr>
    <tr>
      <td>프로젝트 상태 변경 이력 조회</td>
      <td>공통</td>
      <td><code>GET</code></td>
      <td><code>/projects/{projectId}/status-history</code></td>
      <td><code>projectId</code></td>
      <td><code>history: [{ id, fromStatus, toStatus, actorName, createdAt, reason }]</code></td>
      <td>단계/상태 변경 이력 조회</td>
    </tr>
  </tbody>
</table>

권한 기준은 프로젝트 담당자는 `manager`가 본인인 프로젝트만 조회/처리하고, SHE 담당자는 모든 프로젝트 조회와 조치 요청 및 최종 확정을 수행하는 방식입니다.
