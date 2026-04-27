# Backend Contract Draft

## Purpose

백엔드 협의를 위한 프론트 기준 초안입니다. 아직 실제 API 구현은 보류 상태이며, 이 문서는 권한, 프로젝트 단계, 주요 엔티티, API 후보, 미확정 질문을 맞추기 위한 기준 자료입니다.

## Current Frontend Assumptions

- 프론트는 현재 mock 데이터와 localStorage를 사용합니다.
- 서버 상태 전환, API route 추가, DB 스키마 확정은 아직 하지 않았습니다.
- 권한과 단계 모델은 프론트 코드에 선반영되어 있습니다.
  - `src/lib/permissions.ts`
  - `src/lib/project-stages.ts`
  - `src/lib/project-actions.ts`
  - `src/types/domain.ts`

## Roles

역할은 포함 관계입니다.

```text
general < project_manager < she_manager
```

| Role                | Label           | Permissions                                                                      |
| ------------------- | --------------- | -------------------------------------------------------------------------------- |
| `general`         | 일반 사용자     | 본인이 participant인 프로젝트 조회, 증빙자료 업로드, 보완 증빙 업로드            |
| `project_manager` | 프로젝트 담당자 | 일반 사용자 권한 포함, 프로젝트 상태 확인, 유효성 검증, 보고서 요청, 보고서 검토 |
| `she_manager`     | SHE 담당자      | 프로젝트 담당자 권한 포함, 조치 요청, 최종 보고서 확정                           |

## Project Access Rule

현재 기준:

- 일반 사용자는 `participants`에 포함된 프로젝트만 조회 및 업로드 가능
- 프로젝트 담당자는 `manager`가 본인인 프로젝트만 조회 및 처리 가능
- SHE 담당자는 모든 프로젝트 조회 및 처리 가능
- 권한은 포함 관계이므로 상위 역할은 하위 역할 권한을 포함

## Project Stages

| Index | Stage ID              | Label            |
| ----: | --------------------- | ---------------- |
|     0 | `registered`        | 프로젝트 등록    |
|     1 | `evidence_upload`   | 서류/증빙 업로드 |
|     2 | `validation`        | 유효성 검증      |
|     3 | `she_review`        | SHE 검토         |
|     4 | `action_request`    | 현장 조치 요청   |
|     5 | `supplement_upload` | 보완 업로드      |
|     6 | `report_draft`      | 보고서 초안 생성 |
|     7 | `report_review`     | 사용자 수정      |
|     8 | `finalized`         | 최종 보고서 확정 |

프론트는 `stageId`를 기준값으로 보고, `stageIndex`는 표시용 호환 필드로만 사용하려고 합니다.

## Stage Actions

| Stage                                     | Available Action | Minimum Role        |
| ----------------------------------------- | ---------------- | ------------------- |
| `registered`, `evidence_upload`       | 증빙자료 업로드  | `general`         |
| `validation`                            | 유효성 검증      | `project_manager` |
| `she_review`, `action_request`        | 조치 요청 등록   | `she_manager`     |
| `action_request`, `supplement_upload` | 보완 증빙 업로드 | `general`         |
| `report_draft`                          | 보고서 요청      | `project_manager` |
| `report_draft`, `report_review`       | 보고서 검토      | `project_manager` |
| `report_review`                         | 최종 보고서 확정 | `she_manager`     |

## Core Entities

### User

```ts
interface User {
  id: string;
  name: string;
  role: 'general' | 'project_manager' | 'she_manager';
}
```

### Project

```ts
interface Project {
  id: string;
  contractNumber: string;
  name: string;
  manager: string;
  participants: string[];
  period: string;
  stageId: ProjectStageId;
  status:
    | 'upload_pending'
    | 'under_review'
    | 'action_required'
    | 'supplement_uploaded'
    | 'drafting_report'
    | 'completed';
  hasUploads: boolean;
  hasActionRequest: boolean;
  reportReady: boolean;
  recentActivity: string;
}
```

### Evidence

`kind`는 증빙 파일의 대분류입니다.

| Kind                | Label                            | Meaning                                                       |
| ------------------- | -------------------------------- | ------------------------------------------------------------- |
| `usage_statement` | 사용내역서                       | 최초 기준 문서. 9개 폴더로 분류하지 않고 프로젝트 단위로 관리 |
| `receipt`         | 영수증                           | 지출 증빙. 사용내역서의 항목/금액과 매칭됨                    |
| `site_photo`      | 현장사진                         | 필요한 항목에만 제출. 제출 시 설명 텍스트 필요                |
| `tax_invoice`     | 세금내역서 + 제3자사실관계확인서 | 세금 관련 증빙과 제3자 확인 자료를 함께 관리하는 묶음         |

```ts
interface EvidenceFile {
  id: string;
  projectId: string;
  name: string;
  kind: 'receipt' | 'site_photo' | 'usage_statement' | 'tax_invoice';
  description?: string;
  amount?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  categoryIds?: number[]; // usage_statement는 사용하지 않음
}
```

`usage_statement`는 프로젝트 기준 문서이므로 9개 비용 항목 폴더에 배치하지 않습니다. `receipt`, `site_photo`, `tax_invoice`만 `categoryIds`로 폴더 분류합니다.

### Evidence Upload Flow

초기 제출은 순서가 있습니다.

1. `usage_statement`를 먼저 프로젝트에 업로드
2. 이후 `receipt`, `site_photo`, `tax_invoice` 업로드 가능
3. `site_photo`는 필요한 항목에만 제출
4. `tax_invoice`는 세금내역서와 제3자사실관계확인서를 같은 제출 묶음으로 관리
5. 모든 자료 유형은 최초 제출 이후에도 추가 제출 가능

### Validation

```ts
interface ProjectValidationState {
  projectId: string;
  status: 'not_started' | 'running' | 'completed' | 'needs_action';
  resultIds: string[];
  confirmedAt?: string;
  confirmedBy?: string;
}
```

### Action Request

```ts
interface ProjectActionRequest {
  id: string;
  projectId: string;
  title: string;
  status: 'open' | 'supplement_uploaded' | 'resolved';
  requestedBy: string;
  assignee?: string;
  dueDate?: string;
  reason?: string;
  createdAt: string;
  resolvedAt?: string;
}
```

### Report

```ts
interface ProjectReportState {
  projectId: string;
  status: 'not_requested' | 'drafting' | 'reviewing' | 'finalized';
  version: number;
  finalizedAt?: string;
  finalizedBy?: string;
}
```

## Audit And History

상태 변경 이력과 행위 로그는 초반부터 공통 구조로 저장되어야 합니다.

### Activity Log

```ts
interface ActivityLogEntry {
  id: string;
  projectId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetType: 'project' | 'stage' | 'evidence' | 'validation' | 'action_request' | 'report';
  targetId: string;
  reason?: string;
  createdAt: string;
}
```

### Status History

```ts
interface StatusHistoryEntry {
  id: string;
  projectId: string;
  actorName: string;
  actorRole: UserRole;
  targetType: 'project' | 'stage' | 'evidence' | 'validation' | 'action_request' | 'report';
  targetId: string;
  fromStatus?: string;
  toStatus: string;
  reason?: string;
  createdAt: string;
}
```

## API Candidates

아래는 구현 요청이 아니라 협의용 후보입니다.

### User

| Method  | Path        | Purpose                 |
| ------- | ----------- | ----------------------- |
| `GET` | `/api/me` | 현재 사용자와 역할 조회 |

### Projects

| Method    | Path                                | Purpose                         |
| --------- | ----------------------------------- | ------------------------------- |
| `GET`   | `/api/projects`                   | 권한 범위 내 프로젝트 목록 조회 |
| `GET`   | `/api/projects/:projectId`        | 프로젝트 상세 조회              |
| `PATCH` | `/api/projects/:projectId/stage`  | 프로젝트 단계 변경              |
| `PATCH` | `/api/projects/:projectId/status` | 프로젝트 업무 상태 변경         |

### Evidence

| Method   | Path                                          | Purpose                 |
| -------- | --------------------------------------------- | ----------------------- |
| `GET`  | `/api/projects/:projectId/evidence`         | 프로젝트 증빙 목록 조회 |
| `POST` | `/api/projects/:projectId/evidence`         | 증빙 업로드             |
| `GET`  | `/api/projects/:projectId/evidence/history` | 업로드 이력 조회        |

### Validation

| Method   | Path                                                           | Purpose                         |
| -------- | -------------------------------------------------------------- | ------------------------------- |
| `POST` | `/api/projects/:projectId/validations`                       | 유효성 검증 실행                |
| `GET`  | `/api/projects/:projectId/validations/latest`                | 최근 검증 결과 조회             |
| `POST` | `/api/projects/:projectId/validations/:validationId/confirm` | 검증 결과 확정 여부는 협의 필요 |

### Action Requests

| Method    | Path                                                                | Purpose                   |
| --------- | ------------------------------------------------------------------- | ------------------------- |
| `GET`   | `/api/projects/:projectId/action-requests`                        | 조치 요청 목록 조회       |
| `POST`  | `/api/projects/:projectId/action-requests`                        | 조치 요청 등록            |
| `PATCH` | `/api/projects/:projectId/action-requests/:requestId`             | 담당자, 상태, 마감일 변경 |
| `POST`  | `/api/projects/:projectId/action-requests/:requestId/supplements` | 보완 자료 제출            |

### Reports

| Method    | Path                                                    | Purpose              |
| --------- | ------------------------------------------------------- | -------------------- |
| `POST`  | `/api/projects/:projectId/reports`                    | 보고서 초안 요청     |
| `GET`   | `/api/projects/:projectId/reports/latest`             | 최신 보고서 조회     |
| `PATCH` | `/api/projects/:projectId/reports/:reportId`          | 보고서 수정/임시저장 |
| `POST`  | `/api/projects/:projectId/reports/:reportId/finalize` | 최종 확정            |
| `GET`   | `/api/projects/:projectId/reports/:reportId/pdf`      | PDF 다운로드         |

### History

| Method  | Path                                        | Purpose             |
| ------- | ------------------------------------------- | ------------------- |
| `GET` | `/api/projects/:projectId/activity`       | 행위 로그 조회      |
| `GET` | `/api/projects/:projectId/status-history` | 상태 변경 이력 조회 |

## Open Questions

1. 유효성 검증은 실행과 결과 확정을 분리할 것인가
2. 조치 요청 상태는 `open`, `supplement_uploaded`, `resolved`만으로 충분한가?
3. 증빙 파일 저장소, 미리보기 URL, 원본 파일 다운로드 권한은 어떻게 관리할 것인가? 모두 가능
4. 프로젝트 단계 변경은 서버가 자동 계산할 것인가, 특정 역할이 수동 변경할 수 있는가?
