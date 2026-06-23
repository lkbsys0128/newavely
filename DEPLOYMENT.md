# Vercel Git CI/CD Setup

이 프로젝트는 Next.js 앱이며 Vercel Git Integration으로 자동 배포됩니다.

## 1. GitHub 저장소

저장소: `https://github.com/lkbsys0128/newavely`

## 2. Vercel 프로젝트 설정

Vercel Dashboard에서 GitHub 저장소를 Import합니다.

- Application Preset: `Next.js`
- Root Directory: `./`
- Build Command: 기본값
- Output Directory: 기본값
- Install Command: 기본값
- Environment Variables: 아래 Supabase, Google Sheets 값 추가

## 3. 자동 배포 흐름

- `main` 브랜치에 push: 프로덕션 배포
- Pull Request 생성/업데이트: 프리뷰 배포
- Vercel이 GitHub commit을 감지해서 자동으로 빌드와 배포를 실행

GitHub Actions용 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secret은 현재 필요하지 않습니다.

## 4. 다음 제품 개발 단계

현재 앱은 Next.js 기반으로 전환되어 Supabase Google 로그인, Supabase Postgres DB schema, 역할 기반 권한 구조를 사용합니다.

필요한 Vercel 환경 변수:

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

Google Sheets 값은 `/members`의 `Google Sheet로 내보내기` 버튼에 필요합니다. `GOOGLE_PRIVATE_KEY`는 service account JSON key의 `private_key` 값을 그대로 넣되, Vercel에서는 줄바꿈이 `\n`으로 들어가도 앱에서 처리합니다.

새가족 Google Form 동기화는 `NEW_FAMILY_SHEET_ID`, 필요하면 `NEW_FAMILY_SHEET_NAME`을 사용합니다. `SUPABASE_SERVICE_ROLE_KEY`는 Vercel Cron, 새가족 동기화, 권한 페이지 공통 카운트처럼 서버에서만 필요한 작업에 사용하며 브라우저에 노출하면 안 됩니다.

Supabase Dashboard에서 Google provider를 켜고, SQL Editor에서 아래 순서대로 실행하면 운영 데이터 저장을 시작할 수 있습니다.

1. `db/schema.sql`
2. `db/002_app_data_policies.sql`
3. `db/003_audit_logs.sql`

운영 DB는 README의 migration 순서를 기준으로 최신 `db/0xx_*.sql`까지 적용합니다. 최근 권한/새가족 관련 migration은 `030`, `031`, `032`입니다.
