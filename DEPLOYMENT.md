# Vercel CI/CD Setup

이 프로젝트는 현재 정적 HTML/CSS/JS 앱이므로 Vercel에 바로 배포할 수 있습니다.

## 1. GitHub 저장소 만들기

```bash
git init
git add .
git commit -m "Initial church community app"
git branch -M main
git remote add origin <github-repo-url>
git push -u origin main
```

## 2. Vercel 프로젝트 연결

Vercel Dashboard에서 GitHub 저장소를 Import하거나, CLI를 사용합니다.

```bash
vercel login
vercel link
vercel pull
```

연결 후 `.vercel/project.json`에 `orgId`, `projectId`가 생깁니다.

## 3. GitHub Actions Secrets 추가

GitHub 저장소의 `Settings -> Secrets and variables -> Actions`에 아래 값을 추가합니다.

- `VERCEL_TOKEN`: Vercel Account Settings에서 발급한 토큰
- `VERCEL_ORG_ID`: `.vercel/project.json`의 `orgId`
- `VERCEL_PROJECT_ID`: `.vercel/project.json`의 `projectId`

## 4. 배포 흐름

- `main` 브랜치에 push: 프로덕션 배포
- Pull Request 생성/업데이트: 프리뷰 배포

다음 개발 단계에서 Google 로그인, DB, 권한 처리를 붙이면 Vercel 환경 변수에 OAuth와 DB 접속 정보를 추가하면 됩니다.
