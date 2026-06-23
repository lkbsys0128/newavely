# Newavely Agent Guide

이 문서는 Newavely 개발용 AI agent가 작업을 시작할 때 반드시 읽어야 하는 프로젝트 컨텍스트입니다. 목적은 매번 같은 배경지식, 권한 모델, 개발 흐름, 안전 기준을 공유한 상태에서 일하게 하는 것입니다.

## 프로젝트 한 줄 요약

Newavely는 Community Church of Seattle · Newave 공동체 운영을 위한 내부 관리 웹앱입니다. 멤버/순/출석/권한/새가족/피드백/링크/감사 로그를 관리하며, Supabase Auth와 Postgres를 사용하고 Vercel에 배포합니다.

## 핵심 원칙

- 기존 멤버 roster와 새가족 신청 roster는 분리해서 관리합니다.
- 권한과 개인정보는 기능보다 우선입니다.
- 관리자 화면에서 보이는 통계/공통 수치는 역할에 따라 달라지면 안 됩니다. 단, raw 개인 정보 노출 범위는 역할별로 제한할 수 있습니다.
- aggregate count를 맞추기 위해 raw 데이터를 넓게 노출하지 않습니다. 필요한 경우 서버 전용 service-role query로 count만 계산합니다.
- 새 로그인 사용자는 자동으로 관리자/리더가 되면 안 됩니다. 기본은 `member`이며, 교적 연결은 관리자 승인 흐름을 거칩니다.
- 삭제/복구/권한 변경/출석 변경/새가족 전환 같은 control-plane 작업은 감사 로그 대상입니다.
- UI는 모바일을 항상 고려합니다. 특히 modal, 메뉴, 출석 체크 화면은 모바일에서 실제 조작 가능해야 합니다.

## 기술 스택

- Next.js App Router
- React Server Components + Server Actions
- TypeScript
- Supabase Auth, Postgres, Row Level Security
- Vercel Git Integration, Preview/Production deployments
- Google Sheets API for roster export and new-family intake sync

## 자주 보는 파일

- `src/app/actions.ts`: server actions. 데이터 변경, 감사 로그, 권한 체크가 모여 있습니다.
- `src/lib/app-page-data.ts`: 로그인 사용자 기준 공통 데이터 로더. 페이지별로 필요한 데이터만 가져오도록 유지합니다.
- `src/lib/supabase/data.ts`: Supabase read query 모음. ambiguous embed 관계는 반드시 명시합니다.
- `src/lib/rbac.ts`: 역할과 permission 정의.
- `src/lib/role-policy.ts`: 역할 변경/삭제 가능 여부.
- `src/lib/member-visibility.ts`: 역할별 멤버 visibility.
- `src/lib/supabase/service-role.ts`: 서버/cron/service-role client. 절대 client component에서 import하지 않습니다.
- `src/components/dashboard.tsx`: 여러 페이지의 주요 UI 컴포넌트가 모여 있습니다. 크기가 크므로 수정은 좁게 합니다.
- `src/app/globals.css`: 전역 스타일, responsive/dark mode 스타일.
- `db/schema.sql`: 전체 초기 스키마.
- `db/0xx_*.sql`: 운영 DB에 순차 적용하는 migration.
- `test/*.test.mjs`: 권한, visibility, Supabase query, UI 구조 회귀 테스트.

## 주요 라우트

- `/`: 대시보드
- `/profile`: 내 프로필
- `/members`: 멤버 관리
- `/members/[id]`: 멤버 상세
- `/new-family`: 새가족 신청 roster
- `/groups`: 순 관리
- `/attendance`: 출석 체크/통계
- `/links`: 중요 링크
- `/feedback`: 관리자 피드백 창구
- `/permissions`: 권한/계정 연결 요청/복구
- `/audit`: 감사 로그

## 역할 모델

역할은 `src/lib/rbac.ts`의 `roles`가 기준입니다.

- `owner`: 최고 관리자. owner 관련 변경과 최상위 관리 권한.
- `admin`: 운영 관리자. 대부분의 운영/권한/감사 관리.
- `leader`: 리더. 멤버/출석/순 운영 권한.
- `staff`: 순장. 이름은 순장이지만 권한은 현재 leader와 동일하게 유지합니다.
- `welcome`: 웰컴팀. 일반 멤버 기본 접근 + 새가족 read/write 권한. 멤버/출석/권한 관리는 할 수 없습니다.
- `member`: 일반 멤버. 본인 프로필, 본인 출석 history/stat, 기본 dashboard 정보 중심.

중요한 기대값:

- 새 Google 로그인은 항상 `member`로 시작합니다.
- `owner` 변경은 `owner`만 할 수 있어야 합니다.
- `staff`와 `leader` 권한은 동등해야 합니다.
- `welcome`은 새가족 페이지를 읽고 수정할 수 있지만 `members:write`, `attendance:write`, `roles:manage`는 없어야 합니다.
- 멤버 삭제는 최소 leader/staff 이상이며, 자기보다 낮은 권한의 멤버만 삭제 가능해야 합니다.

## 공통 통계와 권한 페이지 숫자

대시보드/권한 페이지의 통계 숫자는 모든 역할에서 같은 값을 보여야 합니다.

- 멤버가 보는 dashboard metric, 권한 페이지 role count 등이 관리자와 다르면 버그로 봅니다.
- raw 멤버 상세 목록은 역할별 visibility를 유지합니다.
- 테스트 계정은 `members.custom_fields.test_account = true`로 저장하며, roster에는 보여도 모든 공통 통계와 role count에서는 제외합니다. 새 멤버 추가/교적 연결 승인/새가족 멤버 전환에서 관리자 이상만 설정할 수 있습니다.
- 출석 페이지와 출석 통계에서는 운영용 `공동체 리더` 순을 보여주지 않습니다. 관련 기준은 `src/lib/group-filters.ts`의 `getAttendanceVisibleGroups`를 사용합니다.
- 권한 페이지 역할별 카운트는 `SUPABASE_SERVICE_ROLE_KEY`를 쓰는 서버 전용 service-role query가 우선입니다.
- `db/032_public_permission_role_counts.sql`의 RPC는 fallback입니다. RLS 때문에 viewer-scoped count가 나오지 않도록 주의합니다.
- 관련 코드는 `src/lib/member-filters.ts`의 `isStatsExcludedMember`, `src/lib/app-page-data.ts`의 `buildGlobalAppStats`와 permission role count 흐름입니다.
- 관련 테스트는 `test/supabase-queries.test.mjs`, `test/member-visibility.test.mjs`, `test/rbac.test.mjs`, `test/role-policy.test.mjs`입니다.

## Supabase query 주의사항

`members`와 `groups`, `members`와 `attendance_records` 사이에는 관계가 2개 이상 있습니다. embed query는 반드시 관계명을 명시합니다.

예:

```txt
groups!members_group_id_fkey(name)
attendance_records!attendance_records_member_id_fkey(status)
care_followups!care_followups_member_id_fkey(...)
```

`PGRST201` ambiguous relationship 에러가 다시 생기지 않게 `test/supabase-queries.test.mjs`를 유지합니다.

## 새가족 기능 컨텍스트

새가족 신청은 Google Form 응답 Sheet에서 들어오며 기존 `members` roster와 분리합니다.

- DB table: `new_family_applicants`
- Migration: `db/027_new_family_applicants.sql`
- Page: `/new-family`
- Sync helper: `src/lib/new-family-sync.ts`
- Cron route: `/api/cron/sync-new-family`
- 기본 Sheet ID: `1T-DD9i7lBoFqK6qHXKSKeEgs-FOsq24c8dWzwLWFGrg`

새가족이 수료/등록되면 관리자가 “멤버로 등록” 액션을 통해 `members`에 추가합니다. 원본 Google Form 응답은 `source_data` JSONB에 보존합니다.

동기화 overwrite 기준:

- `source_key` 기준으로 upsert합니다.
- Sheet에서 다시 갱신되는 값: 이름, 이메일, 전화번호, 원본 관심/예정 순, Sheet 메모, `source_data`, sync timestamp.
- 앱에서 관리자가 바꾸고 유지되어야 하는 값: `status`, `expected_group`, `converted_member_id`, `converted_at`.
- 현재 `memo`는 Sheet 메모와 앱 메모가 같은 컬럼입니다. 운영 메모 분리가 필요하면 `admin_memo` 같은 새 컬럼을 추가하는 방향이 안전합니다.

필요 env:

```txt
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
NEW_FAMILY_SHEET_ID
NEW_FAMILY_SHEET_NAME
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버/cron에서만 사용합니다. 클라이언트 코드에 노출하면 안 됩니다.

## Google Sheets 연동

- 멤버 roster export는 `replaceGoogleSheetValues`를 사용합니다.
- 새가족 import는 `readGoogleSheetValues`와 `syncNewFamilyApplicantsFromSheet`를 사용합니다.
- Google Sheet는 service account 이메일에 공유되어 있어야 합니다.
- private key env 값은 줄바꿈 처리에 주의합니다. 앱은 `\\n`을 실제 newline으로 변환합니다.

## Vercel Cron

Cron은 `vercel.json`의 `crons` 배열에 정의합니다.

중요:

- cron route는 반드시 `Authorization: Bearer ${CRON_SECRET}`를 확인해야 합니다.
- cron은 production deployment에서만 실행됩니다.
- Hobby plan은 cron 개수/주기에 제한이 있으니 새 cron을 추가하기 전 기존 cron 개수를 확인합니다.

## 개발 워크플로우

반드시 feature branch에서 작업합니다.

```bash
git checkout main
git pull
git checkout -b feature/short-description
```

작업 후:

```bash
npm run typecheck
npm test
npm run build
git add ...
git commit -m "Short imperative message"
git push -u origin feature/short-description
gh pr create
```

`main`에 직접 커밋하지 않습니다. Production 반영은 PR merge 후 Vercel Git integration을 통해 합니다.

## 테스트 기준

작은 변경이라도 최소 아래를 확인합니다.

```bash
npm run typecheck
npm test
```

라우트, cron, build 영향이 있는 변경이면:

```bash
npm run build
```

권한/visibility/통계 관련 변경이면 테스트를 추가하거나 기존 테스트를 업데이트합니다. 특히 모든 역할에서 공통 통계 수치가 달라지지 않는지 확인합니다.

## UI/UX 기준

- Newavely는 내부 운영 도구입니다. 예쁘지만 과장된 랜딩 페이지가 아니라 빠르고 명확한 업무 화면이어야 합니다.
- 모바일에서 메뉴는 접히고, 페이지 선택 후 닫혀야 합니다.
- modal은 모바일에서 내부 스크롤이 가능해야 합니다.
- 버튼은 hover/active feedback이 있어야 합니다.
- 출석 체크는 모바일에서 한 화면에 최대한 많이 보이고, 바로 조작 가능해야 합니다.
- 다크모드는 읽기 쉬운 contrast가 우선입니다.
- 삭제/복구 같은 위험 액션은 확인 UI와 audit log를 유지합니다.

## UI 정렬/폼 품질 기준

새 기능이나 새 UI를 만들 때 아래 기준을 반드시 먼저 확인합니다. 사용자가 반복해서 정렬 문제를 지적하지 않도록, 구현 단계에서 기본 품질로 처리합니다.

- label과 input/select/textarea가 inline으로 붙어 보이면 안 됩니다. 폼 필드는 기본적으로 label 텍스트 위, control 아래의 grid 레이아웃을 사용합니다.
- 새 폼을 만들면 기존 공통 폼 클래스(`member-form`, `management-form`, `reason-form` 등)를 우선 재사용합니다. 새 전용 폼 클래스를 만들 경우 `src/app/globals.css`의 공통 label/control/focus/dark-mode selector에도 반드시 포함합니다.
- input/select/textarea는 같은 화면 안에서 높이, padding, border, radius, focus ring이 일관되어야 합니다.
- 버튼은 필드와 붙어 있으면 안 됩니다. 최소한의 gap을 두고, primary/secondary/danger 스타일을 기존 패턴과 맞춥니다.
- 모바일에서는 폼이 한 칼럼으로 자연스럽게 내려가야 하며, label과 control이 서로 밀리거나 화면 밖으로 넘치지 않아야 합니다.
- modal 안의 폼은 중앙 정렬만이 아니라 내부 스크롤, 닫기 버튼, 바깥 클릭 닫기, 모바일 높이 제한까지 확인합니다.
- 새 UI를 만든 뒤 `rg`로 비슷한 클래스와 기존 패턴을 확인하고, 같은 문제의 UI가 다른 페이지에도 있으면 함께 고칩니다.
- 다크모드에서도 field background, border, placeholder, disabled 상태가 읽히는지 확인합니다.

## 성능 기준

- `getAppPageData`는 모든 페이지에서 모든 auxiliary data를 가져오면 안 됩니다.
- 페이지별로 필요한 데이터만 fetch합니다.
- 긴 리스트는 `content-visibility` 같은 렌더링 최적화를 유지합니다.
- 외부 font CSS import처럼 render-blocking 요청을 추가하지 않습니다.
- 큰 client component를 더 키우는 변경은 조심합니다. 가능하면 새 로직은 lib로 분리합니다.

## 데이터/보안 주의

- 실제 교적 CSV, 출석 CSV, private SQL chunk는 GitHub에 올리지 않습니다.
- service role key, Google private key, Supabase DB password는 절대 커밋하지 않습니다.
- 민감 정보 노출 범위를 넓히는 변경은 명확한 이유와 테스트가 필요합니다.
- RLS policy와 app-level permission check를 둘 다 고려합니다.

## 운영 체크리스트

DB migration을 추가하면:

- `db/0xx_*.sql` 파일 추가
- `db/schema.sql` 반영
- `README.md` migration 순서 반영
- 필요한 테스트 추가

현재 중요한 최근 migration:

- `db/030_welcome_team_role.sql`: `welcome` 역할 추가
- `db/031_welcome_team_new_family_policies.sql`: 웰컴팀 새가족 RLS
- `db/032_public_permission_role_counts.sql`: 권한 페이지 공통 role count fallback RPC
- `db/033_test_account_stats_exclusion.sql`: 테스트 계정 통계 제외와 public dashboard payload 보강

새 환경 변수를 추가하면:

- README에 추가
- Vercel Production/Preview env 설정 필요 여부 명시
- 클라이언트 노출이 필요한 값인지 `NEXT_PUBLIC_` 여부 확인

새 페이지를 추가하면:

- `src/app/.../page.tsx` 추가
- `src/components/mobile-aware-nav.tsx` 메뉴 추가 여부 판단
- `src/lib/app-page-data.ts` page kind와 page-scoped data loading 반영
- 모바일/다크모드 CSS 확인

## Agent 응답 스타일

- 사용자는 한국어를 주로 사용합니다. 기본 응답은 한국어로 합니다.
- 작업 결과는 간단히 요약하고, 테스트 결과와 PR 링크를 알려줍니다.
- 막히면 무엇이 막혔는지와 다음 선택지를 명확히 말합니다.
- 사용자 변경사항을 되돌리지 않습니다.
