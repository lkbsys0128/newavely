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
- Environment Variables: 아래 Supabase 값 추가

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

Supabase Dashboard에서 Google provider를 켜고, SQL Editor에서 아래 순서대로 실행하면 운영 데이터 저장을 시작할 수 있습니다.

1. `db/schema.sql`
2. `db/002_app_data_policies.sql`
