# Frontend

산업안전보건관리비 사용내역서와 증빙자료를 월 단위로 검토하는 Next.js 프론트엔드입니다.

## Docker / 배포 가이드

프론트엔드는 Next.js standalone Docker 이미지로 빌드합니다.
Kubernetes manifest는 `SKALA-TEAM5/deploy` 레포에서 중앙 관리합니다.

## 환경 설정 원칙

- 로컬 개발은 `.env.local`을 사용합니다. 이 파일은 커밋하지 않습니다.
- 배포 환경의 API 주소는 GitHub Actions의 Docker build arg로 주입합니다.
- `main`에 머지되면 운영 배포가 진행되므로, 통합 확인은 `develop`에서 먼저 진행합니다.

로컬 개발용 예시는 `.env.example`을 복사해서 사용합니다.

```bash
cp .env.example .env.local
```

### 로컬 실행

```bash
npm install
npm run dev
```

```text
http://localhost:3000
```

### Docker 실행

```bash
docker build \
  -f DockerFile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 \
  -t team5-frontend:standalone .
docker run --rm -p 3000:3000 team5-frontend:standalone
```

### 이미지 Push

EKS 워커 노드는 `linux/amd64` 환경이므로 Mac에서 빌드할 때 platform을 명시해야 합니다.

```bash
docker login <REGISTRY_HOST> -u '<REGISTRY_USERNAME>'
```

```bash
docker buildx build \
  --platform linux/amd64 \
  -f DockerFile \
  -t <REGISTRY_HOST>/<PROJECT_NAME>/team5-frontend:latest \
  --push .
```

### Kubernetes 배포

Kubernetes manifest는 이 레포에서 관리하지 않습니다.
배포 정의는 `SKALA-TEAM5/deploy` 레포의 `k8s/frontend`를 기준으로 합니다.

Private registry 접근용 secret은 namespace에 한 번만 생성합니다.

```bash
kubectl create secret docker-registry team5-harbor-secret \
  --namespace=<NAMESPACE> \
  --docker-server=<REGISTRY_HOST> \
  --docker-username='<REGISTRY_USERNAME>' \
  --docker-password='<REGISTRY_PASSWORD>' \
  --dry-run=client \
  -o yaml | kubectl apply -f -
```

```bash
kubectl rollout status deployment/team5-frontend -n <NAMESPACE>
kubectl get pods,svc,deploy -n <NAMESPACE> -l app=team5-frontend
```

### Kubernetes 접속

현재 Service는 `ClusterIP`이므로 외부 공개 전에는 port-forward로 접속합니다.

```bash
kubectl port-forward svc/team5-frontend 3000:3000 -n <NAMESPACE>
```

```text
http://localhost:3000
```

### 문제 확인

`ImagePullBackOff`가 발생하면 원인을 먼저 확인합니다.

```bash
kubectl describe pod <POD_NAME> -n <NAMESPACE>
```

`no match for platform in manifest`가 보이면 `linux/amd64` 이미지로 다시 push한 뒤 재시작합니다.

```bash
kubectl rollout restart deployment/team5-frontend -n <NAMESPACE>
```

## 요구 환경

- Node.js 20 이상
- npm 10 이상

## 설치

```bash
npm install
```

## 개발 서버

```bash
npm run dev
```

기본 주소는 `http://localhost:3000`입니다.

## 검증

```bash
npm run typecheck
```

## 빌드와 실행

```bash
npm run build
npm run start
```

## 현재 화면 구조

- `/` 로그인 화면입니다. 로그인 후 역할에 따라 사용자 관리, 대시보드 또는 프로젝트 목록으로 이동합니다.
- `/dashboard` SHE 담당자용 대시보드입니다. 담당 프로젝트 KPI, 보완 요청 현황, AI 사용량 요약, 프로젝트 목록을 보여줍니다.
- `/projects` 프로젝트 목록입니다. 프로젝트명, 계약번호, 담당자, 기간, 상태 필터를 제공하고 새 프로젝트 등록을 모달로 처리합니다.
- `/projects/[projectId]` 프로젝트 상세 화면입니다. 월별 사용내역서를 선택한 뒤 사용내역서, 세부 내역, 유효성 검증, 보고서 탭을 사용합니다.
- `/usage-records` AI 토큰 사용량/비용 화면입니다. 사용자별, 프로젝트별, 에이전트별, 월별, 일별 집계를 조회합니다.
- `/admin/users` 시스템 관리자용 사용자 관리 화면입니다.
- `/api/report-docx` 편집된 보고서 초안을 DOCX로 변환하는 Next.js route handler입니다.

## 주요 기능

- 상단 헤더 기반 내비게이션
  - 역할별 메뉴 표시
    - 시스템 관리자: 사용자 관리, AI 사용 금액
    - SHE 담당자: 대시보드, 전체 프로젝트
    - 프로젝트 담당자: 담당 프로젝트
  - 사용자 드롭다운, 로그아웃, 테마 선택, 챗봇 플로팅 버튼
- 테마
  - 기본, Sky, Lavender, Mint 4개 테마
  - 테마에 따라 배경, 카드, 강조색, 버튼, 일부 위젯 색상 변경
  - 선택값은 `localStorage`에 저장
- 챗봇
  - 전역 AppFrame에서 제공하는 안전관리비 도우미
  - 플로팅 아이콘 위치 드래그 이동
  - 위치는 탭 단위 `sessionStorage`에 저장되며 탭을 닫으면 초기화
  - 아이콘이 화면 상단에 있으면 채팅창은 아이콘 아래에 표시
- 대시보드
  - 프로젝트 KPI와 AI 사용량 요약
  - 법령 검증 필요 필터
  - 프로젝트 현황 표
  - 보완 요청/담당자별 보완 진행 현황
- 프로젝트 목록
  - 프로젝트명, 계약번호, 담당자, 상태, 공사기간 필터
  - 기간 선택 캘린더
  - 제목 행 클릭 정렬
  - 보완 요청 월이 있는 프로젝트는 빨간 점으로 표시
  - 새 프로젝트 등록 시 프로젝트 담당자 후보는 전체 사용자 목록의 `user` 역할 계정을 기준으로 표시
- 프로젝트 상세
  - 월별 사용내역서 그리드
  - 월 추가/삭제
  - 월 선택 후 뒤로가기는 월 목록으로 복귀
  - 사용내역서 기본 정보 표시 및 수정
  - 사용내역서 PDF 업로드, OCR/classi 실행, 실패 시 업로드 파일 롤백
  - 사용내역서 세부 항목 추가/수정/삭제 및 9개 항목 이동
  - 세부 항목 수동 추가 후 classi 분류 결과 팝업 표시
  - classi가 부적절 결과를 내려주는 경우 항목을 화면에 적재하지 않고 미반영 팝업 표시
  - 증빙 파일 업로드, 파일명 수정, 이동, 삭제
  - 보호구 착용 사진은 `wearing_photo` 증빙 타입으로 등록
  - safety-doc, link, vision 결과 기반 보완 TODO 표시
  - 법령 검증 결과 표시, 승인, 보완 요청
  - 법령 원문 커스텀 툴팁
  - 보고서 초안 생성, 편집, 저장, DOCX 추출
- AI 사용량
  - 로그인 사용자에게 허용된 프로젝트 범위 기준 조회
  - 시스템 관리자는 전체 프로젝트와 전체 사용자 기준 조회
  - 사용자별, 프로젝트별, 에이전트별, 월별, 일별 집계

## 상태 체계

프로젝트 자체 상태는 단순 운영 상태입니다.

| 상태            | 의미    |
| --------------- | ------- |
| `open`        | 생성됨  |
| `in_progress` | 진행 중 |
| `closed`      | 종료    |

사용내역서 검토 상태는 월별로 관리합니다.

| 상태                    | 화면 표시   | 의미                                            |
| ----------------------- | ----------- | ----------------------------------------------- |
| `draft`               | 업로드 중   | 프로젝트 담당자가 사용내역서와 증빙을 정리 중   |
| `upload_completed`    | 업로드 완료 | 담당자가 업로드 완료를 눌러 검토 요청 가능 상태 |
| `supplement_required` | 보완 요청   | SHE 담당자가 검증 후 보완을 요청한 상태         |
| `review_completed`    | 검토 완료   | SHE 담당자가 승인한 상태                        |

월별 상태가 없으면 아직 해당 월 사용내역서를 업로드하지 않은 상태이며, 상태 뱃지를 표시하지 않습니다.

## 역할별 권한

| 기능                       | 시스템 관리자 | SHE 담당자 | 프로젝트 담당자 |
| -------------------------- | ------------: | ---------: | --------------: |
| 사용자 관리                |          가능 |        불가 |            불가 |
| 전체 AI 사용 금액 조회     |          가능 |        불가 |            불가 |
| 대시보드 조회              |          불가 |        가능 |            제한 |
| 프로젝트 목록 조회         |          제한 |        가능 |            가능 |
| 프로젝트 생성/삭제         |          불가 |        가능 |            불가 |
| 사용내역서 업로드/수정     |          불가 |        가능 |            가능 |
| 증빙 업로드/수정/삭제      |          불가 |        가능 |            가능 |
| 매칭/현장사진 검증 UI 실행 |          불가 |        가능 |            가능 |
| 유효성 검증 실행           |          불가 |        가능 |            불가 |
| 보완 요청                  |          불가 |        가능 |            불가 |
| 보고서 생성/편집/DOCX 추출 |          불가 |        가능 |            불가 |

## Agent 연동 전제

agent 호출은 Spring API를 통해 FastAPI agent/orchestrator와 연동합니다. 프론트는 각 agent API의 실행, 폴링, 결과 조회를 래핑합니다.

1. 사용내역서 업로드
   - OCR로 사용내역서 기본 정보와 세부 항목 추출
   - 금액의 `계`는 OCR 값을 그대로 쓰지 않고 `수량 x 단가`로 계산
   - classi agent가 세부 항목을 9개 항목 중 하나로 분류
2. 세부 내역 검증
   - link agent가 사용내역서와 증빙의 날짜, 빈값, 파일 연결 관계 확인
   - safety-doc agent가 필수 증빙 규칙과 보완 TODO 반환
   - vision model이 현장사진 적합성 판단
3. 유효성 검증
   - legal agent가 집행 목적, 법정 계상률, 인건비 중복계상 등 법률 리스크 판정
4. 보고서
   - report agent가 검증 결과를 기반으로 초안 생성
   - 저장된 보고서 초안은 리포트 탭 진입 시 다시 조회
   - `/api/report-docx`가 편집된 초안을 DOCX로 변환
5. AI 사용량
   - agent log와 usage record 집계를 사용자/프로젝트/agent/기간 단위로 조회

## 데이터 저장 방식

업무 데이터는 백엔드 API와 DB/파일 저장소를 기준으로 조회 및 저장합니다. 프론트의 브라우저 저장소는 UI 편의 상태만 보관합니다.

- `sananbee.dev.role`: 개발용 사용자 역할
- `sananbee.current.user`: 현재 사용자 정보
- `she.app.theme`: 선택한 테마
- `dashboard-chatbot-position`: 탭 단위 챗봇 플로팅 버튼 위치
- `i-veri:usage-detail-todos:{projectId}:{usageStatementId}` 또는 `i-veri:usage-detail-todos:{projectId}:{monthKey}`: 세부 내역 화면의 TODO 접힘/완료 편의 상태

## 주요 디렉터리

```text
src/app
  page.tsx                         로그인 및 역할별 진입 라우팅
  dashboard/page.tsx               SHE 대시보드
  projects/page.tsx                프로젝트 목록과 새 프로젝트 등록
  projects/[projectId]/page.tsx    프로젝트 상세, 월별 사용내역서, 탭 컨테이너
  usage-records/page.tsx           AI 사용량/비용 조회
  admin/users/page.tsx             시스템 관리자 사용자 관리
  api/report-docx/route.ts         DOCX 추출 route handler

src/components
  common/AppFrame.tsx              공통 헤더, 역할별 메뉴, 사용자 메뉴, 테마 선택
  common/DashboardChatbot.tsx      전역 챗봇 플로팅 UI
  common/DateRangePicker.tsx       기간 선택 캘린더
  project/ProjectInfoEditorModal.tsx 프로젝트 생성/기본 정보 수정/담당자 선택 모달
  ui                               공통 카드, 버튼, 모달, 로더

src/features/project-tab
  UsageDetailFileView.tsx          9개 항목, 세부 항목, 파일보기
  UsageStatementDetailScreen.tsx   세부 내역, 증빙, TODO, safety-doc/link/vision 실행
  VerifyScreen.tsx                 법령 유효성 검증, 승인, 보완 요청
  ReportScreen.tsx                 보고서 생성, 저장, 편집, DOCX 추출

src/lib
  api-client.ts                    백엔드 fetch 클라이언트
  auth-api.ts                      로그인, 로그아웃, 사용자 API
  project-api.ts                   프로젝트 API
  archive-api.ts                   사용내역서/증빙 API 변환
  project-data.ts                  프로젝트/월별 상태 타입과 메타
  project-list.ts                  목록 필터/정렬
  project-usage-rate.ts            사용률 계산
  dashboard-api.ts                 대시보드 API
  usage-records-api.ts             AI 사용량 API
  chatbot-api.ts                   챗봇 스트리밍 API
  agent-api.ts                     agent 호출 래퍼
  agent-failure.ts                 agent 실패 메시지
  evidence-utils.ts                증빙/사용내역서 유틸
  report-draft.ts                  보고서 초안 생성
  docx-builder.ts                  DOCX 생성
  theme.ts                         색상 토큰과 테마
```

## 참고

인증, 권한, 파일 업로드, OCR 결과, agent 결과, 월별 상태, 보고서 저장은 백엔드 API와 영구 저장소를 기준으로 처리합니다. 프론트는 API 응답을 화면 모델로 정규화하고, 실패 시 사용자 메시지와 필요한 롤백 UI를 담당합니다.
