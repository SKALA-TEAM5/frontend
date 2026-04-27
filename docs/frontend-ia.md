# Frontend IA

## Goal

- 업로드 중심 구조에서 프로젝트 중심 구조로 전환
- 로그인 직후 대시보드에서 현재 상태와 다음 액션을 먼저 인지
- 프로젝트 상세 내부에서 업로드, 검토, 조치, 보고서, 이력을 탭으로 관리

## Final Routes

- `/dashboard`
- `/projects`
- `/projects/[projectId]`
- `/projects/[projectId]?tab=overview`
- `/projects/[projectId]?tab=upload`
- `/projects/[projectId]?tab=validation`
- `/projects/[projectId]?tab=actions`
- `/projects/[projectId]?tab=report`
- `/projects/[projectId]?tab=archive`

## Screen Roles

### Dashboard

- 내 프로젝트 요약
- 상태별 카운트
- 오늘 해야 할 일
- 최근 활동 로그

### Projects

- 프로젝트 목록
- 상태, 관리자, 기간 필터
- SHE 담당자 기준 확장 조회

### Project Detail

- 개요
- 증빙 업로드
- 유효성 검증
- 조치 요청/보완
- 보고서
- 아카이브

## Evidence Upload Flow

초기 업로드는 사용내역서를 먼저 프로젝트에 제출한 뒤 나머지 증빙을 9개 폴더 기준으로 추가 제출하는 흐름이다.

1. 사용내역서
2. 영수증
3. 현장사진: 필요한 항목에만 제출
4. 세금내역서 + 제3자사실관계확인서

모든 자료는 이후에도 추가 제출할 수 있다.

사용내역서는 비용 항목 폴더로 분리하지 않고 프로젝트 기준 문서로 관리한다. 아카이브는 `9개 폴더 통합 보기`, `자료유형별 보기`, `사용내역서 보기`로 나뉜다.

## Permissions

역할은 포함 관계입니다.

```text
general < project_manager < she_manager
```

### General User

- `participants`에 포함된 프로젝트만 조회
- 증빙자료 업로드
- 보완 증빙 업로드

### Project Manager

- 일반 사용자 권한 포함
- `manager`가 본인인 프로젝트 조회 및 처리
- 프로젝트 상태 확인
- 유효성 검증
- 보고서 요청 및 검토

### SHE Manager

- 프로젝트 담당자 권한 포함
- 모든 프로젝트 조회 및 처리
- 조치 요청
- 최종 보고서 확정

백엔드 협의용 상세 초안은 `docs/backend-contract-draft.md`를 기준으로 한다.

## Current Mapping

- `/dashboard`: 메인 진입
- `/projects`: 프로젝트 목록
- `/projects/[projectId]`: 프로젝트 상세
- `/projects/[projectId]?tab=upload`: 증빙 업로드
- `/projects/[projectId]?tab=validation`: 유효성 검증
- `/projects/[projectId]?tab=actions`: 조치 요청/보완
- `/projects/[projectId]?tab=report`: 보고서
- `/projects/[projectId]?tab=archive`: 아카이브

## Implementation Status And Next Work

현재는 백엔드 API 연동 전 단계이므로 서버 상태 전환, 실제 저장, 실제 PDF 생성은 보류한다. 지금은 화면 흐름, 권한 기준, 상태 모델 mock, 백엔드 협의 문서를 먼저 맞춘다.

### Completed

- 권한 모델 반영
  - `general < project_manager < she_manager`
  - 일반 사용자는 `participants` 기준 프로젝트 접근
  - 프로젝트 담당자는 `manager` 기준 프로젝트 접근
  - SHE 담당자는 전체 프로젝트 접근
- 프로젝트 단계 모델 반영
  - 8단계 `ProjectStageStepper`
  - 마지막 단계 뒤 연결선 제거
  - 등록 → 업로드 → 현장사진 검증 → 유효성 검증 → SHE 검토 → 조치 요청 → 보완/재검증 → 보고서 생성
- 백엔드 협의 문서 작성
  - 권한, 프로젝트 단계, 핵심 엔티티, API 후보, 증빙 흐름 초안
- 프로젝트 상세 탭 구조 정리
  - `overview`, `upload`, `archive`, `validation`, `actions`, `report`
  - 기존 `history` id를 `archive`로 변경
  - 아카이브 탭을 증빙 업로드 오른쪽으로 이동
- 아카이브 화면 정리
  - 아카이브 컴포넌트 분리
  - 9개 폴더명 확정
  - 보기 방식: 9개 폴더 통합 보기 / 자료유형별 보기 / 사용내역서 보기
  - 사용내역서는 폴더 분류가 아니라 프로젝트 단위 문서로 변경
  - 폴더 이미지, 파일 미리보기 위치, 삭제 버튼 충돌 수정
- 유효성 검증/보고서 분리
  - 유효성 검증 탭은 검증하기/재검증하기와 대시보드만 표시
  - 보고서 탭은 보고서 생성 기능과 보고서 화면만 표시
  - 보고서 생성 전에는 보고서 본문 숨김
  - 보고서 생성 후 초안 편집 가능
  - 저장 후에도 계속 편집 가능
  - PDF 추출 버튼은 항상 활성화
- 최근 이력 카드 위치 조정
  - 프로젝트 상세 메인 오른쪽 사이드 영역으로 이동
  - 날짜 필터와 최근 이력 목록 유지
- 파일/문서 정리
  - 불필요한 옛 문서와 레거시 파일 제거
  - 남은 파일 역할을 본 문서에 정리

### Changed From Original Plan

- `프로젝트 상세 - 이력`은 별도 탭이 아니라 `아카이브` 탭과 오른쪽 `최근 이력` 카드로 분리한다.

  - 아카이브: 증빙 파일 관리
  - 최근 이력 카드: 주요 활동 요약
  - 행위 로그형 전체 이력 화면은 후순위로 둔다.
- `보고서 최종 확정`은 현재 보고서 화면 흐름에서 제거했다.

  - 최종 확정 권한은 SHE 담당자에게 있지만, 실제 확정은 서버 상태/API와 묶어서 구현한다.
- `사용내역서`는 9개 폴더 안에 들어가지 않는다.

  - 프로젝트 기준 문서로 관리하고 별도 보기에서 표시한다.
- `API 연동`, `localStorage 중심 상태를 서버 상태로 전환`, `실제 검증 상태 저장`은 백엔드 협의 후 진행한다.After Backend/API Agreement
- API 연동
- localStorage 중심 상태를 서버 상태로 전환
- 실제 검증 상태 저장
- 프로젝트 단계와 검증 결과 연동
- 재검증 이력 저장
- 조치 요청/보완 상태 저장
- 보고서 초안/저장/버전/PDF 상태 저장
- 테스트/QA 체크 추가

## File Map

이 섹션은 `node_modules`, `.next` 같은 외부 의존성/빌드 산출물을 제외한 프로젝트 파일의 역할을 정리한다.

### App Routes

| File                                      | Role                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/app/layout.tsx`                    | Next App Router의 루트 레이아웃. 전역 CSS와 HTML 골격을 연결한다.                             |
| `src/app/page.tsx`                      | 루트(`/`) 진입 시 대시보드로 리다이렉트한다.                                                |
| `src/app/dashboard/page.tsx`            | 프로젝트 대시보드 화면. 권한 범위 내 프로젝트, 상태 카운트, 오늘 할 일, 최근 활동을 보여준다. |
| `src/app/projects/page.tsx`             | 프로젝트 목록 화면. 접근 가능한 프로젝트 목록과 검색/필터 UI를 제공한다.                      |
| `src/app/projects/[projectId]/page.tsx` | 프로젝트 상세 화면. 개요, 업로드, 검증, 조치, 보고서, 이력 탭을 권한에 따라 노출한다.         |

### Common Components

| File                                              | Role                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/components/common/AppFrame.tsx`            | 프로젝트 운영 화면의 공통 프레임. 상단 헤더, 네비게이션, 사용자 역할 표시를 담당한다.               |
| `src/components/common/ProjectStageStepper.tsx` | 프로젝트 단계 진행 상태를 시각화하는 stepper 컴포넌트.`project-stages.ts`의 단계 정의를 사용한다. |
| `src/components/common/index.ts`                | common 컴포넌트 barrel export 파일. import 경로를 짧게 유지한다.                                    |

### UI Components

| File                                   | Role                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `src/components/ui/Button.tsx`       | 공통 버튼 컴포넌트. variant, size, disabled 상태를 제공한다.              |
| `src/components/ui/Card.tsx`         | 공통 카드 컨테이너. 화면 섹션과 정보 블록을 감싼다.                       |
| `src/components/ui/Modal.tsx`        | 범용 모달 컴포넌트.                                                       |
| `src/components/ui/CenterModal.tsx`  | 중앙 확인/완료 모달. 업로드 후 매칭 완료 안내 등에 사용된다.              |
| `src/components/ui/InlineLoader.tsx` | 화면 안에서 진행 중 상태를 보여주는 로더. 분류/검증 준비 상태에 사용된다. |
| `src/components/ui/FileThumb.tsx`    | 증빙 파일 썸네일 표시 컴포넌트. 이미지 preview 또는 기본 SVG를 보여준다.  |
| `src/components/ui/index.ts`         | UI 컴포넌트 barrel export 파일.                                           |

### Feature Modules

| File                                                       | Role                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/features/project-tab/UploadScreen.tsx`              | 증빙 업로드 탭. 사용내역서 선제출, 영수증/현장사진/세금내역서 추가 제출, 자동 분류 진입을 담당한다.     |
| `src/features/project-tab/UploadZone.tsx`                | 자료 유형별 업로드 박스. 비활성화 사유와 업로드 파일 목록을 표시한다.                                   |
| `src/features/project-tab/EvidenceModals.tsx`            | 계약 정보, 현장사진 설명, 현장사진 필요 여부 등 업로드 관련 모달 묶음.                                  |
| `src/features/project-tab/ArchiveScreen.tsx`             | 이력/아카이브 탭 컨테이너. 아카이브 상태, 파일 이동, 사용내역서 추가, 추가 업로드 모달 상태를 관리한다. |
| `src/features/project-tab/ArchiveToolbar.tsx`            | 9개 폴더 통합 보기/자료유형별 보기/사용내역서 보기 전환과 자료유형 탭을 표시한다.                       |
| `src/features/project-tab/ArchiveFolderGrid.tsx`         | 9개 증빙 폴더 그리드와 폴더 간 드래그 이동을 담당한다.                                                  |
| `src/features/project-tab/ArchiveFileRow.tsx`            | 아카이브 안의 파일 한 줄 표시, 삭제, 드래그, 미리보기 진입을 담당한다.                                  |
| `src/features/project-tab/ArchivePreview.tsx`            | 영수증/현장사진 hover 미리보기 팝업을 표시한다.                                                         |
| `src/features/project-tab/ArchiveUsageStatementView.tsx` | 프로젝트 단위 사용내역서 목록, 추가, 삭제 UI를 담당한다.                                                |
| `src/features/project-tab/VerifyScreen.tsx`              | 유효성 검증/보고서 탭에서 재사용되는 화면. 검증 진행, 결과 요약, 보고서 보기 UI를 포함한다.             |

### Lib

| File                            | Role                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `src/lib/permissions.ts`      | 권한 모델의 단일 기준. 역할 포함 관계, 권한 체크, 프로젝트 접근 규칙을 정의한다.    |
| `src/lib/project-stages.ts`   | 프로젝트 단계 정의.`stageId`, 표시명, index 변환 유틸을 제공한다.                 |
| `src/lib/project-actions.ts`  | 현재 사용자 권한과 프로젝트 단계에 따른 다음 가능 액션을 계산한다.                  |
| `src/lib/project-data.ts`     | 프로젝트 mock 데이터와 현재 사용자 mock, 접근 가능한 프로젝트 조회 유틸을 제공한다. |
| `src/lib/mock-data.ts`        | 업로드/아카이브/검증 흐름의 mock 데이터와 파일 분류 유틸을 제공한다.                |
| `src/lib/workflow-storage.ts` | localStorage 접근 유틸. 현재는 UI 보조 상태 저장에 사용된다.                        |
| `src/lib/theme.ts`            | 공통 색상 토큰. 인라인 스타일에서 사용하는 색상 기준이다.                           |

### Types

| File                    | Role                                                                              |
| ----------------------- | --------------------------------------------------------------------------------- |
| `src/types/domain.ts` | 프론트 도메인 타입 기준. 단계, 증빙, 검증, 조치 요청, 보고서, 로그 구조를 담는다. |

### Styles And Assets

| File                             | Role                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| `src/styles.css`               | 전역 CSS. 기본 스타일, 테이블, 애니메이션 등 전역 UI 규칙을 정의한다. |
| `public/uploads/character.png` | 헤더 로고/캐릭터 이미지로 사용되는 정적 이미지.                       |
| `public/uploads/character.ico` | 정적 아이콘 파일.                                                     |

### Docs

| File                               | Role                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `docs/backend-contract-draft.md` | 백엔드 협의용 핵심 문서. 권한, 단계, 엔티티, 증빙 업로드 흐름, API 후보, open question을 정리한다. |
| `docs/frontend-ia.md`            | 프론트 정보 구조와 파일 역할 정리 문서. 현재 문서다.                                               |

### Project Config And Generated Files

| File                  | Role                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `package.json`      | 프로젝트 의존성, 스크립트, 패키지 메타데이터를 정의한다.         |
| `package-lock.json` | npm 의존성 잠금 파일. 재현 가능한 설치를 위해 유지한다.          |
| `tsconfig.json`     | TypeScript 컴파일 옵션. Next/React 타입 검사 기준을 정의한다.    |
| `next.config.mjs`   | Next.js 설정 파일. 현재 프로젝트의 Next 빌드/런타임 설정 위치다. |
| `next-env.d.ts`     | Next.js가 생성/관리하는 타입 선언 파일. 직접 수정하지 않는다.    |
