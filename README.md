# Newavely

Newavely는 교회 공동체 운영을 위한 웹앱입니다. 현재 목표는 순모임/멤버 관리, 출석 체크, 멤버별 정보 관리, 역할 기반 권한 관리, Google 소셜 로그인을 안정적으로 제공하는 것입니다.

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
    members/[id]/page.tsx 멤버 상세, 커스텀 필드 값 관리
    groups/page.tsx       순모임 현황
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
  003_audit_logs.sql      감사 로그 테이블, 기록 함수, RLS policy
  004_audit_log_retention.sql 감사 로그 보관 정책 comment와 created_at index
  005_attendance_excuse_period.sql 출석 사유 기간 컬럼과 인덱스
  006_care_followups.sql 돌봄 팔로업 테이블, 인덱스, RLS policy
  007_member_link_requests.sql 첫 로그인 교적 연결 요청 테이블
  008_secure_first_login_onboarding.sql 첫 로그인 보안 정책 강화
  009_cleanup_stale_member_link_requests.sql 오래된 연결 요청 정리
  010_admin_member_delete_policy.sql 관리자 멤버 영구 삭제 정책
  011_member_link_request_admin_policy.sql 연결 요청 관리자 처리 정책
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
3. `db/003_audit_logs.sql`
4. `db/004_audit_log_retention.sql`
5. `db/005_attendance_excuse_period.sql`
6. `db/006_care_followups.sql`
7. `db/007_member_link_requests.sql`
8. `db/008_secure_first_login_onboarding.sql`
9. `db/009_cleanup_stale_member_link_requests.sql`
10. `db/010_admin_member_delete_policy.sql`
11. `db/011_member_link_request_admin_policy.sql`
12. `db/012_owner_role.sql`
13. `db/013_owner_role_policies.sql`

주요 테이블:

- `groups`: 순모임과 리더
- `members`: 멤버 프로필, Supabase Auth 연결, 역할, 상태, 순모임, 커스텀 정보
- `attendance_events`: 출석 이벤트 날짜와 제목
- `attendance_records`: 이벤트별 멤버 출석 상태
- `care_followups`: 멤버별 돌봄/연락 팔로업 기록
- `member_link_requests`: 첫 로그인 계정과 기존 교적 멤버 연결 승인 요청
- `member_custom_field_definitions`: 멤버별 커스텀 필드 정의
- `audit_logs`: 멤버/순모임/출석 변경에 대한 append-only 감사 로그

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

- `owner`: 최고 관리자. 관리자 지정/회수, 영구 삭제 같은 최상위 작업 권한
- `admin`: 운영 관리자. 멤버/순모임/출석/권한/감사 관리 권한
- `leader`: 멤버/출석 관리 권한
- `staff`: 순장. 본인이 리드하는 순 멤버는 상세 열람, 다른 순은 이름 중심 열람
- `member`: 기본 접근 권한

권한은 두 레이어에서 적용됩니다.

- Supabase Row Level Security policies
- Next.js server actions 내부의 app-level permission check

멤버 추가, 출석 체크 같은 데이터 변경은 `src/app/actions.ts`에서 처리합니다.

## 멤버 상세와 커스텀 필드

멤버 목록에서 `열기`를 누르면 `/members/[id]` 상세 페이지로 이동합니다.

상세 페이지에서 관리하는 정보:

- 기본 정보: 이름, 이메일, 연락처, 순모임, 역할, 상태, 주소, 세례/등록, 돌봄 메모
- 커스텀 필드 값: `members.custom_fields` JSONB에 저장
- 커스텀 필드 정의: `member_custom_field_definitions`에 저장

커스텀 필드 정의는 최고 관리자 또는 관리자만 추가할 수 있습니다. 필드 타입은 `text`, `number`, `date`, `boolean`을 사용합니다.

민감 정보로 표시된 필드는 `sensitive:read` 권한이 있는 역할만 볼 수 있습니다.

## 돌봄 팔로업

멤버 상세 페이지에서 돌봄 팔로업을 추가하고 상태를 관리합니다.

팔로업 상태:

- `필요`: 아직 연락이나 조치가 필요한 상태
- `연락 완료`: 연락이 완료된 상태
- `기도 요청`: 기도 제목 또는 영적 돌봄이 필요한 상태
- `해결`: 팔로업이 마무리된 상태

출석 페이지의 `미확인 연속 결석` 목록에서 멤버 상세로 이동해 바로 팔로업을 남길 수 있습니다.

## 감사 로그

앱의 주요 변경 작업은 `audit_logs`에 기록됩니다.

기록 대상:

- 멤버 생성/수정/비활성화/다시 활성화
- 순모임 생성/수정
- 출석 상태 변경

감사 로그는 append-only 방식으로 운영합니다.

- 앱에서 감사 로그 수정/삭제 기능을 만들지 않습니다.
- DB RLS policy도 admin read만 허용합니다.
- 쓰기는 `record_audit_log` security definer function을 통해서만 수행합니다.

관리자는 `/audit`에서 최근 감사 로그를 확인할 수 있습니다.

### 감사 로그 보관 정책

기본 운영 정책은 **최근 12개월 감사 로그를 검색 가능한 상태로 보관**하는 것입니다.

현재는 별도 압축/아카이브 기능을 구현하지 않습니다. Supabase/Postgres는 큰 JSONB 값을 내부적으로 압축할 수 있고, 지금 규모에서는 직접 gzip/decompress 계층을 만드는 것보다 조회 가능성과 단순함을 유지하는 편이 더 안전합니다.

용량 최적화 원칙:

- 감사 로그에는 변경 추적에 필요한 최소 데이터만 기록합니다.
- 최근 조회와 향후 정리 작업을 위해 `audit_logs.created_at` index를 유지합니다.
- 오래된 로그는 바로 삭제하기보다 archive/export 정책을 먼저 정한 뒤 처리합니다.

추후 TODO:

- `/audit`에 날짜 범위, 작업 종류, actor 필터 추가
- Vercel Cron 또는 Supabase scheduled job으로 12개월 초과 로그 archive/delete 자동화
- archive 대상은 `audit_log_archives` 테이블 또는 Supabase Storage JSON export 중 선택
- 민감 정보가 감사 로그에 과도하게 남지 않도록 before/after payload masking 정책 검토
- 실제 운영 데이터 증가량을 보고 보관 기간을 12개월, 24개월, 36개월 중 재검토

## 배포

Vercel이 GitHub repository와 연결되어 있습니다.

- Pull Request 생성/업데이트: Vercel Preview 배포
- `main`에 merge: Production 배포
- Production domain: `newavely.com`

Vercel에 필요한 환경 변수:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_NAME`

자세한 배포 설정은 `DEPLOYMENT.md`를 참고합니다.

### Google Sheet 교적부 내보내기

관리자는 `/members`에서 `Google Sheet로 내보내기` 버튼을 눌러 현재 활성 교적부를 Google Spreadsheet에 덮어쓸 수 있습니다.

설정 순서:

1. Google Cloud에서 Google Sheets API를 활성화합니다.
2. Service Account를 만들고 JSON key를 발급합니다.
3. 대상 Google Spreadsheet를 service account 이메일에 `편집자`로 공유합니다.
4. Vercel 환경 변수에 `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_NAME`을 추가합니다.

내보내기 범위:

- 비활성 멤버는 제외합니다.
- 기본 교적 정보와 custom fields를 내보냅니다.
- `google_account_email`, `onboarding_status` 같은 내부 필드는 제외합니다.
- `member_custom_field_definitions.is_sensitive = true`로 표시된 custom field는 제외합니다.

주의: 이 기능은 Google Sheet 내용을 현재 앱 데이터로 덮어씁니다. Sheet에서 직접 수정한 값은 다음 내보내기 때 사라질 수 있으므로 Newavely를 원본 데이터로 봅니다.

## 백업

운영 DB는 GitHub Actions로 주 1회 암호화 백업을 생성합니다.

- Workflow: `.github/workflows/database-backup.yml`
- Schedule: 매주 월요일 11:00 UTC
- Artifact: GPG로 암호화된 `schema.sql` + `full.dump`
- Required GitHub Secrets: `SUPABASE_DB_URL`, `BACKUP_GPG_PASSPHRASE`

자세한 설정, 수동 실행, 복구 테스트 방법은 `docs/database-backups.md`를 참고합니다.

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
