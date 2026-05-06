# 산안비 검증 프론트엔드

산업안전보건관리비 정산 프로젝트를 관리하기 위한 Next.js 기반 프론트엔드입니다. SHE 담당자와 프로젝트 담당자의 역할별 업무 흐름, 증빙 업로드, 아카이브 관리, 유효성 검증, 보고서 생성, 조치 요청 알림을 목업 데이터 기반으로 구현합니다.

## 요구 환경

- Node.js 20 이상
- npm 10 이상

## 설치

```bash
npm install
```

## 개발 서버 실행

```bash
npm run dev
```

기본 주소는 `http://localhost:3000`입니다.

## 검증

```bash
npx tsc --noEmit
```

## 프로덕션 빌드

```bash
npm run build
```

## 프로덕션 서버 실행

```bash
npm run start
```

## 로그인

로그인/회원가입은 백엔드 인증 API를 사용합니다.

회원가입 완료 후에는 자동 로그인하지 않고 로그인 화면으로 돌아갑니다.

## 주요 기능

- 역할 기반 사이드바와 프로젝트 접근 제어
- SHE 담당자 대시보드
  - 프로젝트 현황, 오늘 할 일, 조치 요청, 리스크, 업로드 누락, 미확인 알림 위젯
  - 위젯 표시/숨김 및 위치 편집
- 프로젝트 상세
  - 사용내역서 페이지 보기
  - 증빙 업로드
  - 아카이브
  - 유효성 검증 및 보고서 작성은 SHE 담당자에게만 노출
- 아카이브
  - `9개 항목 > 사용내역서 세부 내용 > 자료 형식 > 파일` 구조
  - 파일 이동 모달
  - 누락 자료 업로드
  - 문제 파일/누락 자료 표시
  - 파일 미리보기 툴팁
- 유효성 검증 대시보드
  - 9개 항목별 적정/조건부/부적정 판정
  - 금액 인정률 도넛 그래프
  - 고위험 항목, 판정 분포, 증빙 이슈 위젯
  - 선택 항목 상세 판단, 법령 근거, 제출 증빙 아코디언
- 알림
  - SHE 담당자가 프로젝트 담당자에게 조치 요청 알림 전송
  - 프로젝트 담당자가 조치 완료 알림을 SHE 담당자에게 전송
  - 역할/수신자 기준 알림 필터링
  - 사이드바 알림 탭, 하단 토스트, 알림 내역 검색
- 보고서
  - 보고서 생성 버튼을 눌렀을 때만 초안 생성 시작
  - 생성 후 편집/저장 및 PDF 추출 안내 모달

## 역할별 권한

| 기능 | SHE 담당자 | 프로젝트 담당자 |
|---|---:|---:|
| 전체 프로젝트 조회 | 가능 | 불가 |
| 담당 프로젝트 조회 | 가능 | 가능 |
| 증빙 업로드 | 가능 | 가능 |
| 아카이브 조회/정리 | 가능 | 가능 |
| 유효성 검증 실행/재검증 | 가능 | 불가 |
| 보고서 생성/편집/검토 | 가능 | 불가 |
| 조치 요청 알림 발송 | 가능 | 불가 |
| 조치 완료 알림 발송 | 알림 수신 | 가능 |

## 데이터 저장 방식

현재 백엔드 API 연동 전 단계입니다. 프로젝트, 증빙, 검증 결과는 프론트엔드 목업 데이터와 브라우저 `localStorage`를 사용합니다.

- 개발 사용자 역할: `sananbee.dev.role`
- 프로젝트별 아카이브 상태: `sananbee.workflow.archiveSeed.*`
- 매칭 완료 상태: `sananbee.workflow.matchReady.*`
- 조치 요청/완료 알림: `sananbee.action.notifications`
- 대시보드 위젯 설정: `she.dashboard.visibleWidgets`, `she.dashboard.widgetLayout`

## 주요 디렉터리

```text
src/app
  page.tsx                    로그인
  signup/page.tsx             회원가입
  dashboard/page.tsx          SHE 담당자 대시보드
  projects/page.tsx           프로젝트 목록
  projects/[projectId]/page.tsx 프로젝트 상세

src/components
  common/AppFrame.tsx         공통 레이아웃, 사이드바, 알림 탭/토스트
  ui                          공통 UI 컴포넌트

src/features
  dashboard                   대시보드 위젯 레이아웃
  project-tab                 업로드, 아카이브, SHE 유효성 검증, SHE 보고서 화면

src/lib
  api-client.ts               백엔드 API fetch 클라이언트
  auth-api.ts                 인증 API
  project-api.ts              프로젝트 API
  evidence-utils.ts           증빙 분류 및 아카이브 정규화 유틸
  permissions.ts              역할/권한 정의
  action-notifications.ts     알림 저장/읽음 처리
  use-action-notifications.ts 알림 구독 hook
  workflow-storage.ts         프로젝트별 localStorage 저장소
```

## 참고

이 프로젝트는 현재 UI/UX 프로토타입 단계입니다. 실서비스 연동 시에는 인증, 프로젝트 권한, 파일 업로드, OCR 결과, 법령 agent 검증 결과, 알림 저장소를 백엔드 API로 대체해야 합니다.
