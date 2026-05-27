# Frontend

산업안전보건관리비 사용내역서와 증빙자료를 월 단위로 검토하는 Next.js 프론트엔드입니다.

## Docker / Kubernetes 실행 가이드

프론트엔드는 Next.js standalone Docker 이미지로 빌드하여 Kubernetes에 배포합니다.

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
docker build -f DockerFile -t team5-frontend:standalone .
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

Private registry 접근용 secret을 한 번만 생성합니다.

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
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml
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

- `/`로그인 화면입니다. 로그인 후 역할에 따라 대시보드 또는 프로젝트 목록으로 이동합니다.
- `/dashboard`SHE 담당자용 대시보드입니다. 프로젝트 현황, KPI, 월별 보완 요청 사유, 보완 사유 분석, 담당자별 검증 요청 현황을 보여줍니다.
- `/projects`전체 프로젝트 목록입니다. 대시보드의 프로젝트 현황과 같은 표형 UI, 검색 필터, 기간 선택, 제목 행 정렬을 사용합니다. 새 프로젝트 등록은 모달로 처리합니다.
- `/projects/[projectId]`프로젝트 상세 화면입니다. 월별 사용내역서 그리드에서 월을 선택한 뒤 사용내역서, 세부 내역, 유효성 검증, 보고서 탭을 사용합니다.
- `/admin/users`
  사용자 관리 화면입니다.

## 주요 기능

- 상단 헤더 기반 내비게이션
  - 대시보드, 전체 프로젝트, 사용자 메뉴
  - 사용자 드롭다운, 로그아웃, 테마 선택
- 테마
  - 기본, Sky, Lavender, Mint 4개 테마
  - 테마에 따라 배경, 카드, 강조색, 버튼, 일부 위젯 색상 변경
  - 선택값은 `localStorage`에 저장
- 대시보드
  - 이미지 히어로 카드와 사용자 카드
  - KPI 4개 카드
  - 최근 프로젝트 현황 표
  - 프로젝트별 월별 보완 요청 사유 막대 그래프
  - 보완 요청 사유 도넛 그래프
  - 담당자별 검증 요청 현황 스크롤 카드
- 프로젝트 목록
  - 프로젝트명, 계약번호, 관리자, 상태, 공사기간 필터
  - 기간 선택 캘린더
  - 제목 행 클릭 정렬
  - 보완 요청 월이 있는 프로젝트는 빨간 점으로 표시
- 프로젝트 상세
  - 월별 사용내역서 그리드
  - 월 추가/삭제
  - 월 선택 후 뒤로가기는 월 목록으로 복귀
  - 사용내역서 기본 정보 표시 및 수정
  - 사용내역서 표는 항목/전회/금회/누계를 표시하고, 금회 금액만 수정
  - 사용내역서 세부 항목 추가/삭제 및 9개 항목 이동
  - 파일 업로드, 파일명 수정, 이동, 삭제
  - 검증 버튼으로 OCR/link agent, safety_doc_agent, vision model 순서의 로딩 UI 표시
  - 보완 TODO는 세부 내역 파일보기 영역의 증빙 종류별로 표시
  - 유효성 검증 결과는 화면 이동 후에도 유지
  - 보고서 초안 생성, 편집, 저장, DOCX 추출

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

| 기능                       | SHE 담당자 | 프로젝트 담당자 |
| -------------------------- | ---------: | --------------: |
| 대시보드 조회              |       가능 |            제한 |
| 전체 프로젝트 조회         |       가능 |            가능 |
| 프로젝트 생성/삭제         |       가능 |            불가 |
| 사용내역서 업로드/수정     |       가능 |            가능 |
| 증빙 업로드/수정/삭제      |       가능 |            가능 |
| 매칭/현장사진 검증 UI 실행 |       가능 |            가능 |
| 유효성 검증 실행           |       가능 |            불가 |
| 보완 요청                  |       가능 |            불가 |
| 보고서 생성/편집/DOCX 추출 |       가능 |            불가 |

## Agent 연동 전제

현재 agent 호출은 UI 동작 확인을 위한 구조입니다. 실제 API 연결 시 다음 흐름으로 대체하면 됩니다.

1. 사용내역서 업로드
   - OCR로 사용내역서 기본 정보와 세부 항목 추출
   - 금액의 `계`는 OCR 값을 그대로 쓰지 않고 `수량 x 단가`로 계산
   - classification agent가 세부 항목을 9개 항목 중 하나로 분류
2. 세부 내역 검증
   - OCR/link agent가 사용내역서와 증빙의 날짜, 빈값, 파일 연결 관계 확인
   - safety_doc_agent가 필수 증빙 규칙과 보완 TODO 반환
   - vision model이 현장사진 적합성 판단
3. 유효성 검증
   - legal_agent가 집행 목적, 법정 계상률, 인건비 중복계상 등 법률 리스크 판정
4. 보고서
   - report agent가 검증 결과를 기반으로 초안 생성
   - `/api/report-docx`가 편집된 초안을 DOCX로 변환

## 데이터 저장 방식

주요 브라우저 저장 키는 다음과 같습니다.

- `sananbee.dev.role`개발용 사용자 역할
- `sananbee.current.user`현재 사용자 정보
- `she.app.theme`선택한 테마
- `iveri-mvp-usage-statement:{projectId}`프로젝트별 월별 사용내역서와 검토 상태
- `iveri-mvp-archive-todos:{projectId}:{monthKey}`
  월별 보완 TODO

## 주요 디렉터리

```text
src/app
  page.tsx                         로그인
  dashboard/page.tsx               SHE 대시보드
  projects/page.tsx                전체 프로젝트 목록
  projects/[projectId]/page.tsx    프로젝트 상세
  admin/users/page.tsx             사용자 관리
  api/report-docx/route.ts         DOCX 추출 API

src/components
  common/AppFrame.tsx              공통 헤더, 사용자 메뉴, 테마 선택, footer
  common/DateRangePicker.tsx       기간 선택 캘린더
  project/ProjectInfoEditorModal.tsx 프로젝트 생성/기본 정보 수정 모달
  ui                               공통 카드, 버튼, 모달, 로더

src/features/project-tab
  ArchiveScreen.tsx                사용내역서/세부 내역 화면 컨테이너
  UsageDetailFileView.tsx          9개 항목, 세부 항목, 파일보기
  VerifyScreen.tsx                 유효성 검증
  ReportScreen.tsx                 보고서 생성/편집

src/lib
  api-client.ts                    백엔드 fetch 클라이언트
  project-api.ts                   프로젝트 API
  archive-api.ts                   사용내역서/증빙 API 변환
  project-data.ts                  프로젝트/월별 상태 타입과 메타
  project-list.ts                  목록 필터/정렬
  agent-api.ts                     agent 호출 래퍼
  agent-failure.ts                 agent 실패 메시지
  evidence-utils.ts                증빙/사용내역서 유틸
  report-draft.ts                  보고서 초안 생성
  docx-builder.ts                  DOCX 생성
  theme.ts                         색상 토큰과 테마
```

## 참고

실서비스 전환 시 인증, 권한, 파일 업로드, OCR 결과, agent 결과, 월별 상태 저장, 보고서 저장을 백엔드 API와 영구 저장소로 연결 필요
