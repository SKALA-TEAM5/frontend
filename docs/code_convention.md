📋 Git Convention Guide

팀 전체가 일관된 방식으로 Git을 사용하기 위한 컨벤션 가이드입니다.

⸻

✍️ 커밋 메시지 형식

type(scope): subject
body (선택)

좋은 예시

feat(auth): 소셜 로그인 기능 추가
fix(api): 회원가입 시 이메일 중복 검사 오류 수정
docs(readme): 설치 방법 업데이트
refactor(user): 유저 서비스 레이어 분리

나쁜 예시

버그 수정
fixed
WIP

⸻

🏷️ 커밋 타입

타입	설명
feat	새로운 기능 추가
fix	버그 수정
docs	문서 변경 (README, 주석 등)
style	코드 의미 변화 없는 포맷 수정
refactor	기능 변화 없는 코드 구조 개선
test	테스트 코드 추가 및 수정
perf	성능 개선
chore	빌드, 패키지 설정 등 기타 변경

⸻

📌 커밋 메시지 규칙

* 제목은 50자 이내로 작성하며, 마침표를 붙이지 않는다
* 제목은 명령형으로 작성한다 (예: “수정함” ❌ → “수정” ✅)
* 제목과 본문 사이에는 빈 줄 한 줄을 넣는다
* 본문은 무엇을, 왜 변경했는지 설명한다 (어떻게는 코드로 표현)
* 한 커밋에는 하나의 논리적 변경만 포함한다
* 영문 작성 시 첫 글자는 소문자로 시작한다

⸻

🌿 브랜치 전략 (Git Flow)

브랜치	용도
main	배포 가능한 안정적인 코드만 유지
develop	다음 배포를 위한 개발 통합 브랜치
feature/	새 기능 개발 (develop에서 분기)
fix/	버그 수정 브랜치
hotfix/	긴급 수정 (main에서 직접 분기)
release/	배포 준비 브랜치

브랜치 네이밍 예시

feature/login-page
feature/123-user-profile
fix/signup-validation
hotfix/payment-crash
release/v1.2.0

⸻

🔤 브랜치 네이밍 규칙

* 소문자와 하이픈(-) 만 사용한다 (언더스코어, 대문자 금지)
* 이슈 번호가 있으면 포함한다: feature/123-user-profile
* 간결하지만 의미가 명확하게 작성한다
* 작업 완료 후 병합된 브랜치는 삭제한다

⸻

🔀 PR (Pull Request) 규칙

PR 제목: 커밋 타입과 동일한 형식 사용

feat: 소셜 로그인 구현

PR 본문 필수 항목

* 작업 내용 요약
* 관련 이슈 번호 (예: Closes #42)
* 테스트 방법
* 스크린샷 (UI 변경 시)

코드 리뷰

* 최소 1명 이상 Approve 후 머지
* 리뷰어는 48시간 내 응답 권장