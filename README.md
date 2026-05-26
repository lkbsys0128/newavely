# Newavely

Newavely는 교회 공동체 운영을 위한 웹앱입니다. 현재 목표는 소그룹/멤버 관리, 출석 체크, 멤버별 정보 관리, 역할 기반 권한 관리, Google 소셜 로그인을 안정적으로 제공하는 것입니다.

## 기술 스택

- Next.js App Router
- React
- TypeScript
- Supabase Auth, Postgres, Row Level Security
- Vercel Git Integration 기반 Preview/Production 배포

## 프로젝트 구조

```txt
src/
  app/
    page.tsx              대시보드 overview
    members/page.tsx      멤버 목록, 상세, 멤버 추가
    groups/page.tsx       소그룹 현황
    attendance/page.tsx   출석 체크
    permissions/page.tsx  역할/권한 매트릭스
    auth/callback/        Supabase OAuth callback route
    actions.ts            멤버 추가, 출석 체크 등 server actions
  components/
    dashboard.tsx         페이지별 주요 UI 섹션
    app-page-gate.tsx     공통 setup/auth/error 처리
  lib/
    app-page-data.ts      로그인된 사용자의 공통 앱 데이터 로더
    rbac.ts               앱 역할/권한 정의
    supabase/             Supabase browser/server client와 query
    types.ts              공통 타입
db/
  schema.sql              기본 schema, indexes, RLS functions, policies
  002_app_data_policies.sql 추가 앱 데이터 policies
test/
  supabase-queries.test.mjs Supabase relationship embed 회귀 테스트
```

## 로컬 개발

의존성 설치:

```bash
npm install
```

로컬 환경 변수 파일에 아래 값을 추가합니다.

```txt
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

개발 서버 실행:

```bash
npm run dev
```

PR을 열기 전에 최소한 아래 체크를 실행합니다.

```bash
npm test
npm run typecheck
npm run build
```

## 데이터베이스

Supabase SQL Editor에서 아래 순서대로 실행합니다.

1. `db/schema.sql`
2. `db/002_app_data_policies.sql`

주요 테이블:

- `groups`: 소그룹, 리더, 목표 인원
- `members`: 멤버 프로필, Supabase Auth 연결, 역할, 상태, 소그룹, 커스텀 정보
- `attendance_events`: 출석 이벤트 날짜와 제목
- `attendance_records`: 이벤트별 멤버 출석 상태
- `member_custom_field_definitions`: 멤버별 커스텀 필드 정의

중요한 관계:

- `members.group_id -> groups.id`
- `groups.leader_member_id -> members.id`
- `attendance_records.member_id -> members.id`
- `attendance_records.checked_by_member_id -> members.id`

일부 테이블은 서로 여러 관계를 가지고 있습니다. 예를 들어 `members`와 `groups`, `members`와 `attendance_records` 사이에는 관계가 2개 이상 존재합니다. 그래서 Supabase query에서 embed를 사용할 때는 관계명을 명시해야 합니다.

예:

```txt
groups!members_group_id_fkey(name)
attendance_records!attendance_records_member_id_fkey(status)
```

이 문제가 다시 생기지 않도록 `test/supabase-queries.test.mjs`에 회귀 테스트가 있습니다. Supabase select query를 수정할 때는 이 테스트도 같이 확인해주세요.

## 인증과 권한

로그인은 Supabase Auth의 Google OAuth를 사용합니다.

앱 역할은 `src/lib/rbac.ts`에 정의되어 있습니다.

- `admin`: 전체 관리 권한
- `leader`: 멤버/출석 관리 권한
- `staff`: 운영을 위한 읽기 중심 권한
- `member`: 기본 접근 권한

권한은 두 레이어에서 적용됩니다.

- Supabase Row Level Security policies
- Next.js server actions 내부의 app-level permission check

멤버 추가, 출석 체크 같은 데이터 변경은 `src/app/actions.ts`에서 처리합니다.

## 배포

Vercel이 GitHub repository와 연결되어 있습니다.

- Pull Request 생성/업데이트: Vercel Preview 배포
- `main`에 merge: Production 배포
- Production domain: `newavely.com`

Vercel에 필요한 환경 변수:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

자세한 배포 설정은 `DEPLOYMENT.md`를 참고합니다.

## 협업 개발 규칙

모든 feature/fix 작업은 반드시 feature branch에서 진행하고 PR을 거쳐 `main`에 merge합니다.

추천 branch 이름:

```txt
feature/short-description
fix/short-description
chore/short-description
```

기본 작업 흐름:

```bash
git checkout main
git pull
git checkout -b feature/my-change
```

변경 후:

```bash
npm test
npm run typecheck
npm run build
git add .
git commit -m "Describe the change"
git push -u origin feature/my-change
```

그 다음 GitHub에서 `main`을 base로 PR을 엽니다.

`main`에 merge하기 전 필수 조건:

- Vercel Preview가 성공해야 합니다.
- 테스트와 typecheck가 통과해야 합니다.
- 최소 1명의 다른 개발자가 PR을 approve해야 합니다.
- `main`에 직접 push하지 않습니다.

## GitHub Repository 설정

`main` branch는 보호되어야 합니다. Repository owner/admin이 GitHub에서 아래 설정을 적용합니다.

1. GitHub repository의 `Settings`로 이동합니다.
2. `Rules` 또는 `Branches` 메뉴를 엽니다.
3. `main`에 대한 ruleset 또는 branch protection rule을 추가합니다.
4. `Require a pull request before merging`을 켭니다.
5. `Required approvals`를 `1`로 설정합니다.
6. `Dismiss stale pull request approvals when new commits are pushed`를 켭니다.
7. `Require status checks to pass before merging`을 켭니다.
8. PR에서 Vercel check가 한 번 나타난 뒤, 해당 Vercel check를 required status check로 선택합니다.
9. `main`에 직접 push할 수 없도록 direct push를 제한합니다.

권한 추천:

- 프로젝트 owner: repository owner/admin 유지
- 일반 협업 개발자: `Write` 권한
- repo 운영까지 맡길 개발자: 필요할 때만 `Maintain`
- `Admin` 권한은 repository 설정과 collaborator 관리까지 가능하므로 꼭 필요한 사람에게만 부여합니다.

현재 운영 원칙은 간단합니다.

```txt
feature branch -> PR -> Vercel Preview 확인 -> 다른 개발자 1명 approve -> main merge -> Production 배포
```
