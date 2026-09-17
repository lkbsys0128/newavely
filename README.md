# Newavely

- 새 레이아웃과 통일된 폰트는 유지하되 색상은 디자인 변경 전 `globals.css`의 기존 라이트/다크 팔레트를 사용합니다. 바닐라/제이드 등 실험 팔레트는 적용하지 않습니다.

- 대시보드/공통 메뉴 디자인 시안은 `src/app/editorial.css`로 범위를 분리합니다. 개발 서버의 `/design-preview`는 샘플 데이터만 사용하며 production에서는 404입니다. 권한별 메뉴/데이터 접근은 기존 정책을 유지합니다.
- 전체 폰트 굵기와 선택 상태는 `src/app/autumn-theme.css`의 공통 토큰을 사용하며 색상은 `globals.css`에서 상속합니다. 로고는 기존 파란 `public/newave-icon.png`를 색상 필터 없이 사용합니다. `/design-preview?view=members`에서 멤버 화면을 확인할 수 있으며 `attendance`, `calendar`, `groups`, `new-family`도 지원합니다.

## 출석 기간 통계

- 상세 출석 통계는 기본으로 전체 기간을 표시하며 시작일/종료일을 포함하는 범위로 조회합니다. 최근 4주/12주는 마지막 출석 이벤트 날짜 기준이며, 기간 직접 지정도 지원합니다.
- 라인 그래프는 청년 출석(예배 또는 순모임, 날짜별 중복 제외)과 총 출석(청년 + 교역자/팀장 이상 예배 출석 + 방문자/새가족)을 함께 표시합니다. 날짜 선택 시 추가 인원 내역도 표시합니다. 교역자/팀장 이상은 실제 예배 출석 기록을 사용하며 기존 수기 clergy/team 값은 다시 더하지 않습니다. 명단과 공동체 리더에 중복 포함된 사람도 한 번만 계산합니다.
- 특정 순 필터에서는 선택 순 출석만 표시하고 공동체 추가 인원을 임의로 순에 배분하지 않습니다. 이벤트 종류 선택은 누적 통계에 적용하며 그래프는 예배 또는 순모임 출석자 집계를 유지합니다.
- 기간과 순 필터는 그래프, 누적 출석률, 순별 비교, 결석 확인에 함께 적용됩니다. 날짜 선택으로 정확한 인원을 확인할 수 있습니다. 공통 그래프는 서버 집계만 전달하고 기존 개인 정보 권한은 유지합니다.
- 추가 DB migration이나 환경 변수는 없습니다.

## 오늘의 기도회

### 찬양 원문 링크 검색

- 찬양 행에서 곡명을 검색하고 후보를 선택하면 입력한 검색어가 찬양 제목에 자동 입력되고 원문 URL도 첨부됩니다. 검색 결과 페이지의 긴 제목은 복사하지 않습니다. 제목은 이후 직접 수정할 수 있고 링크 제거 시에도 유지됩니다. 검색 결과는 관련 페이지 후보이며 곡 일치나 가사 수록을 보증하지 않으므로 미리보기로 확인합니다. 가사 본문은 수집하지 않습니다.
- SerpApi의 Google 검색 API를 사용합니다 (Google 공식 API가 아닌 별도 업체). https://serpapi.com 에 가입한 뒤 대시보드의 API Key를 확인합니다. API 문서: https://serpapi.com/search-api
- 발급 키를 Vercel의 서버 전용 `SERPAPI_API_KEY`로 설정합니다. Production에 필요하며 Preview에서도 검색 테스트를 하려면 Preview에도 설정합니다. `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. 설정 후 재배포합니다. 기존 Brave/Naver 키는 더 이상 사용하지 않습니다.
- 검색 버튼 1회당 Google 엔진을 한국어/한국 지역으로 1회 조회합니다. 일반 검색 결과를 중복 제거 후 최대 6개 표시합니다. 제목은 텍스트로만 렌더링하고 가사/검색 메타데이터는 반환하지 않습니다. 제공처는 키를 URL 파라미터로 요구하므로 요청 URL을 로그에 남기지 않습니다. 실제 한국 찬양 검색 품질은 발급 키로 검증해야 합니다.
- `db/041_prayer_meetings.sql` 다음에 `db/042_prayer_source_links.sql`을 실행합니다. 기존 순서는 유지하고 선택적 `sourceUrl`을 허용합니다. 활성 멤버만 검색하며 DB에서 멤버당 분당 20회로 제한합니다. 제공처 계정에서도 사용량 한도를 설정하세요.
- API 키 미설정 시 안내 메시지를 표시하며 기존 순서 편집은 가능합니다. 공개 방문자는 첨부된 링크만 볼 수 있고 검색 API는 호출할 수 없습니다.

### 기본 기능

- `/prayer`는 로그인 없이 최신 **기도회 날짜**의 순서 하나만 공개합니다. 익명 사용자는 이벤트 ID를 알아도 과거 목록이나 상세를 조회할 수 없습니다.
- 등록된 활성 멤버는 모든 역할에서 기도회 생성/수정과 지난 목록 조회가 가능합니다. 계정 연결 전 사용자와 비활성 멤버는 공개 읽기만 가능합니다.
- 날짜당 한 이벤트만 저장하며, 항목/내용 행 추가·삭제·드래그 정렬을 지원합니다. 이동 손잡이는 터치와 키보드로도 조작 가능합니다. 항목은 기도/찬양/묵상·나눔/직접 입력에서 선택하며 기존 자유 입력은 보존됩니다. 지난 목록은 생성 최신순으로 20개씩 표시합니다.
- 저장 즉시 최신 날짜의 순서가 공개되므로 개인정보나 민감한 기도 제목을 입력하지 않습니다. 미래 날짜를 저장하면 그 날짜가 최신 공개 기도회가 됩니다.
- 동시 수정은 버전 검사로 덮어쓰기를 방지하고, 생성/수정을 감사 로그에 기록합니다.
- 기존 migration 적용 후 Supabase SQL Editor에서 `db/041_prayer_meetings.sql`을 실행하고 배포합니다. 신규 환경은 `db/schema.sql`을 사용합니다. 추가 환경 변수는 없습니다.
- 공개 조회는 인자가 없는 `get_latest_prayer_meeting` RPC만 사용합니다. 테이블의 익명 접근과 직접 쓰기는 허용하지 않으며, 저장은 `save_prayer_meeting` RPC로만 수행합니다.
- SQL 권한 회귀 테스트: **빈 임시 PostgreSQL DB에서만** `psql -v ON_ERROR_STOP=1 -f test/sql/prayer-meetings.sql`을 실행합니다. 테스트는 fixture와 migration을 트랜잭션으로 검증한 뒤 롤백합니다. 운영 DB에서 실행하지 않습니다.

### 순 멤버 일괄 배정

- Supabase SQL Editor에서 `db/040_bulk_group_assignment.sql`을 실행한 뒤 배포합니다.
- 관리자/최고관리자는 순 상세의 **멤버 일괄 배정**에서 순장 포함 멤버를 선택해 다른 순 또는 미배정으로 옮길 수 있습니다.
- 멤버 이동과 원본 순장 지정 해제는 하나의 DB 트랜잭션입니다. 대상 순의 순장, 개인 역할, 출석 기록은 유지됩니다. 원본 순은 자동 삭제하지 않습니다.
- 이동 직전 명단이 바뀌었거나 일부 멤버의 수정 권한이 없으면 전체 이동을 취소합니다.

Newavely는 교회 공동체 운영을 위한 웹앱입니다. 현재 목표는 순/멤버 관리, 출석 체크, 멤버별 정보 관리, 역할 기반 권한 관리, Google 소셜 로그인을 안정적으로 제공하는 것입니다.

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
    groups/page.tsx       순 현황
    attendance/page.tsx   출석 체크
    new-family/page.tsx   새가족 Google Form 신청 roster
    permissions/page.tsx  역할/권한 매트릭스
    auth/callback/        Supabase OAuth callback route
    actions.ts            멤버 추가, 출석 체크 등 server actions
  components/
    dashboard.tsx         페이지별 주요 UI 섹션
    app-page-gate.tsx     공통 setup/auth/error 처리
  lib/
    app-page-data.ts      로그인된 사용자의 공통 앱 데이터 로더
    new-family-sync.ts    새가족 Google Sheet 읽기와 upsert 동기화
    rbac.ts               앱 역할/권한 정의
    role-policy.ts        역할 변경/삭제 가능 여부
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
  026_public_dashboard_data.sql 모든 역할에서 동일한 공통 dashboard 통계용 RPC
  027_new_family_applicants.sql 새가족 신청 roster
  032_public_permission_role_counts.sql 권한 페이지 공통 역할별 카운트 RPC
  037_assistant_role.sql 부순장 역할, 출석 권한, RLS policy
test/
  rbac.test.mjs             역할별 권한 정의 테스트
  role-policy.test.mjs      역할 변경/삭제 정책 테스트
  member-visibility.test.mjs 역할별 멤버 visibility 테스트
  supabase-queries.test.mjs Supabase relationship embed와 운영 흐름 회귀 테스트
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

Google Sheet 동기화와 Vercel Cron을 사용할 때는 아래 서버 환경 변수도 필요합니다.

```txt
GOOGLE_SERVICE_ACCOUNT_EMAIL=google-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
CRON_SECRET=random-long-secret
NEW_FAMILY_SHEET_ID=1T-DD9i7lBoFqK6qHXKSKeEgs-FOsq24c8dWzwLWFGrg
NEW_FAMILY_SHEET_NAME=Form Responses 1
```

`NEW_FAMILY_SHEET_ID`는 기본값이 코드에 들어 있지만 운영에서는 Vercel 환경 변수로 명시하는 것을 권장합니다. `NEW_FAMILY_SHEET_NAME`을 비워두면 스프레드시트의 첫 번째 탭을 읽습니다.

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
14. `db/014_delete_role_policies.sql`
15. `db/015_attendance_observability.sql`
16. `db/016_clear_attendance_import_notes.sql`
17. `db/017_member_english_names.sql`
18. `db/018_deleted_auth_user_blocks.sql`
19. `db/019_deleted_auth_restore_requests.sql`
20. `db/020_backfill_2026_05_31_attendance_types.sql`
21. `db/021_important_links.sql`
22. `db/022_member_status_messages.sql`
23. `db/023_staff_leader_parity.sql`
24. `db/024_admin_feedback_messages.sql`
25. `db/025_self_service_member_profile.sql`
26. `db/026_public_dashboard_data.sql`
27. `db/027_new_family_applicants.sql`
28. `db/028_new_family_status_flow.sql`
29. `db/029_new_family_expected_group.sql`
30. `db/030_welcome_team_role.sql`
31. `db/031_welcome_team_new_family_policies.sql`
32. `db/032_public_permission_role_counts.sql`
33. `db/033_test_account_stats_exclusion.sql`
34. `db/034_attendance_extra_counts.sql`
35. `db/035_community_leader_attendance_roles.sql`
36. `db/036_public_dashboard_community_leader_role.sql`
37. `db/037_assistant_role.sql`

주요 테이블:

- `groups`: 순과 리더
- `members`: 멤버 프로필, Supabase Auth 연결, 역할, 상태, 순, 커스텀 정보. 한국 이름은 `name`, 영어 이름은 `custom_fields.english_name`에 분리 저장하고 화면에서는 함께 표기합니다. 테스트 계정은 `custom_fields.test_account = true`로 표시합니다.
- `attendance_events`: 출석 이벤트 날짜와 제목
- `attendance_records`: 이벤트별 멤버 출석 상태
- `attendance_extra_counts`: 날짜별 교역자/팀장 이상/방문자/새가족 추가 출석 집계
- `care_followups`: 멤버별 돌봄/연락 팔로업 기록
- `member_link_requests`: 첫 로그인 계정과 기존 교적 멤버 연결 승인 요청
- `member_custom_field_definitions`: 멤버별 커스텀 필드 정의
- `important_links`: 공동체 공식 홈페이지/소셜/신청 링크 등 중요 사이트 모음
- `member_status_messages`: 멤버별 짧은 상태 메시지/오늘의 한마디
- `new_family_applicants`: Google Form으로 들어온 새가족 신청 roster. 기존 멤버 roster와 분리해서 관리하고, 수료/등록 시 `members`로 전환합니다.
- `audit_logs`: 멤버/순/출석 변경에 대한 append-only 감사 로그

공통 통계:

- 일반 멤버/순장/관리자 등 모든 역할에서 대시보드와 권한 페이지의 **통계 숫자**는 같은 기준으로 보여야 합니다.
- raw 개인 정보는 역할별 visibility에 따라 제한할 수 있지만, aggregate count는 역할에 따라 달라지면 안 됩니다.
- 테스트 계정은 roster/관리 화면에는 남기되 모든 공통 통계와 권한 페이지 역할별 숫자에서 제외합니다.
- 출석 페이지와 출석 통계에서는 운영용 `공동체 리더` 순을 제외합니다.
- 권한 페이지의 역할별 숫자는 `SUPABASE_SERVICE_ROLE_KEY`를 사용하는 서버 전용 service-role query로 계산합니다. `db/032_public_permission_role_counts.sql`의 RPC는 fallback입니다.

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

### 2026 출석 CSV import

연간 출석부 CSV를 Supabase 출석 DB로 넣을 때는 `private/import_2026_attendance_history.sql` 또는 `private/attendance_import_2026_chunks/`를 사용합니다. `private/` 폴더는 `.gitignore`에 포함되어 있으므로 민감한 교적/출석 데이터는 GitHub에 올라가지 않습니다.

import 방식:

- `2026 연간 출석 현황.csv`에서 실제 집계가 있는 주차만 import합니다. 현재 생성된 스크립트는 `2026-05-24`까지 포함합니다.
- 각 날짜마다 `주일 예배`, `순모임` 두 개의 `attendance_events`를 만듭니다.
- 각 멤버의 TRUE/FALSE는 `attendance_records.status`의 `present`/`absent`로 변환합니다.
- 멤버는 이름 기준으로 기존 `members`와 연결합니다. 괄호 안 영어 이름과 공백은 비교에서 제외합니다.
- CSV에는 있지만 앱 교적에 없는 이름은 마지막 검증 쿼리에서 따로 보여줍니다.

출석 관찰용 DB view:

- `attendance_event_group_summary`: 날짜/이벤트/순별 출석률
- `attendance_monthly_summary`: 월별 이벤트 출석률
- `attendance_member_yearly_summary`: 멤버별 연간 예배/순모임 출석률

운영 DB에 적용할 때는 먼저 `db/015_attendance_observability.sql`을 실행합니다.

그 다음 둘 중 하나를 선택합니다.

- 터미널 자동 실행: Supabase DB connection string을 `DATABASE_URL`에 넣고 `npm run import:attendance:2026`을 실행합니다.
- SQL Editor 수동 실행: `private/attendance_import_2026_chunks/` 안의 SQL 파일을 숫자 순서대로 실행합니다.

자동 실행 전에 순서만 확인하려면 `npm run import:attendance:2026 -- --dry-run`을 실행합니다.

CSV import 후 출석 사유에 `Imported from 2026 annual attendance CSV`가 남아 있으면 `db/016_clear_attendance_import_notes.sql`을 한 번 실행합니다.

## 인증과 권한

로그인은 Supabase Auth의 Google OAuth를 사용합니다.

앱 역할은 `src/lib/rbac.ts`에 정의되어 있습니다.

- `owner`: 최고 관리자. 관리자 지정/회수, 영구 삭제 같은 최상위 작업 권한
- `admin`: 운영 관리자. 멤버/순/출석/권한/감사 관리 권한
- `leader`: 멤버/출석 관리 권한
- `staff`: 순장. 본인이 리드하는 순 멤버의 상세 정보 수정과 출석 체크 가능. 다른 순은 제한된 정보만 열람
- `assistant`: 부순장. 본인 순 출석 체크와 출석 사유 입력만 가능. 멤버 정보 수정, 출석 이벤트 생성, 권한 관리는 불가
- `welcome`: 웰컴팀. 일반 멤버 기본 접근 + 새가족 페이지 read/write + 출석 페이지 총 출석 입력 권한. 멤버 출석 체크는 할 수 없습니다.
- `member`: 기본 접근 권한

부순장 운영 규칙:

- 순장 이상(`owner`, `admin`, `leader`, `staff`)만 일반 멤버를 부순장으로 지정하거나 부순장을 일반 멤버로 되돌릴 수 있습니다.
- 순장(`staff`)은 본인이 리드하는 순 안에서만 부순장을 지정할 수 있습니다.
- 부순장은 출석 페이지에서 본인 순 멤버의 주일 예배/순모임 출석 상태와 사유만 변경할 수 있습니다.
- 부순장은 멤버 정보, 순 정보, 권한, 새가족, 링크, 출석 이벤트 생성/삭제를 변경할 수 없습니다.

권한은 두 레이어에서 적용됩니다.

- Supabase Row Level Security policies
- Next.js server actions 내부의 app-level permission check

멤버 추가, 출석 체크 같은 데이터 변경은 `src/app/actions.ts`에서 처리합니다.

권한 관련 테스트:

- `test/rbac.test.mjs`: 역할별 permission 정의와 `hasPermission` 판정
- `test/role-policy.test.mjs`: 역할 변경/삭제 정책
- `test/member-visibility.test.mjs`: 역할별 멤버 visibility와 공통 roster 기준
- `test/supabase-queries.test.mjs`: RLS/RPC/query 구조 회귀 테스트

권한이나 visibility를 바꾸면 위 테스트를 함께 업데이트하고 `npm test`, `npm run typecheck`, `npm run build`를 확인합니다.

## 새가족 Google Sheet 동기화

`/new-family`의 동기화는 Google Form 응답 Sheet를 읽어 `new_family_applicants`에 upsert합니다. 기준 키는 `source_key`입니다.

동기화 때 Sheet 값으로 갱신되는 항목:

- 이름
- 이메일
- 전화번호
- 원본 관심/예정 순 값
- Sheet 메모
- `source_data`
- `last_synced_at`, `updated_at`

앱에서 관리자가 바꾸고 동기화해도 유지되는 항목:

- `status`: 새 신청, 연락 완료, 1주차, 2주차, 3주차/수료예정, 수료/등록, 보관
- `expected_group`: 앱에서 지정한 예정 순
- `converted_member_id`
- `converted_at`

주의: 현재 `memo`는 Sheet 메모와 앱 수정 메모가 같은 컬럼입니다. 운영 메모를 Sheet 값과 분리해야 하면 추후 `admin_memo` 같은 별도 컬럼으로 나누는 것이 안전합니다.

## 멤버 상세와 커스텀 필드

멤버 목록에서 `열기`를 누르면 `/members/[id]` 상세 페이지로 이동합니다.

상세 페이지에서 관리하는 정보:

- 기본 정보: 이름, 이메일, 연락처, 순, 역할, 상태, 주소, 세례/등록, 돌봄 메모
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
- 순 생성/수정
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
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_NAME`
- `NEW_FAMILY_SHEET_ID`
- `NEW_FAMILY_SHEET_NAME`

자세한 배포 설정은 `DEPLOYMENT.md`를 참고합니다.

### 주일 출석 이벤트 자동 생성

Production에서는 Vercel Cron이 매주 일요일 `18:00 UTC`에 `/api/cron/ensure-sunday-attendance`를 호출합니다. 이 작업은 시애틀 기준 가장 최근 주일 날짜에 `주일 예배`와 `순모임` 출석 이벤트가 모두 있는지 확인하고, 없으면 자동으로 만듭니다.

- `CRON_SECRET`: Cron route 보호용 임의의 긴 문자열입니다.
- `SUPABASE_SERVICE_ROLE_KEY`: 서버 자동화가 RLS에 막히지 않고 출석 이벤트를 만들기 위한 Supabase service role key입니다. 브라우저에 노출되면 안 됩니다.
- 누락된 주일을 수동 보정해야 하면 관리자만 Vercel 로그/route 호출 환경에서 `?date=YYYY-MM-DD` 형식으로 특정 날짜를 지정할 수 있습니다.

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
