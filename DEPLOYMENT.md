# Vercel Git CI/CD Setup

이 프로젝트는 현재 정적 HTML/CSS/JS 앱이므로 Vercel에 바로 배포할 수 있습니다.

## 1. GitHub 저장소

저장소: `https://github.com/lkbsys0128/newavehub`

## 2. Vercel 프로젝트 설정

Vercel Dashboard에서 GitHub 저장소를 Import합니다.

- Application Preset: `Other`
- Root Directory: `./`
- Build Command: 비움
- Output Directory: 비움
- Install Command: 비움
- Environment Variables: 현재는 없음

## 3. 자동 배포 흐름

- `main` 브랜치에 push: 프로덕션 배포
- Pull Request 생성/업데이트: 프리뷰 배포
- Vercel이 GitHub commit을 감지해서 자동으로 빌드와 배포를 실행

GitHub Actions용 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secret은 현재 필요하지 않습니다.

## 4. 다음 제품 개발 단계

Google 로그인, DB, 권한 처리를 붙이면 Vercel 환경 변수에 OAuth와 DB 접속 정보를 추가합니다.
