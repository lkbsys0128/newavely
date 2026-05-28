# 데이터베이스 백업 운영 가이드

Newavely 운영 데이터에는 교적, 출석, 돌봄 기록처럼 민감한 정보가 포함됩니다. 백업은 반드시 암호화된 상태로만 외부에 보관합니다.

## 자동 백업

`.github/workflows/database-backup.yml`이 매주 월요일 11:00 UTC, 시애틀 기준 월요일 새벽 시간대에 실행됩니다.

백업 산출물:

- `schema.sql`: 현재 DB schema-only dump
- `full.dump`: `pg_dump --format custom`으로 생성한 전체 DB snapshot
- `manifest.txt`: 생성 시간과 복구 명령 힌트

위 파일들은 `tar.gz`로 묶은 뒤 GPG AES256 대칭키 방식으로 암호화됩니다. GitHub Actions artifact에는 `.tar.gz.gpg` 파일만 업로드되며, 평문 백업 파일은 workflow 안에서 삭제됩니다.

Artifact 보관 기간은 기본 30일입니다. 장기 보관이 필요하면 encrypted artifact를 내려받아 별도 안전한 저장소에 보관합니다.

## GitHub Secrets

Repository Settings > Secrets and variables > Actions에 아래 secrets를 추가해야 합니다.

```txt
SUPABASE_DB_URL
BACKUP_GPG_PASSPHRASE
```

`SUPABASE_DB_URL`은 Supabase Dashboard에서 확인한 Postgres connection string입니다. 비밀번호가 포함되므로 GitHub Secret에만 저장하고 코드, README, 이슈, PR comment에 노출하지 않습니다.

권장 형식:

```txt
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[HOST]:5432/postgres?sslmode=require
```

Supabase에서 direct connection과 pooler connection이 모두 보이면, 백업에는 가능하면 direct connection을 우선 사용합니다. 네트워크 정책이나 플랜 제한으로 direct connection이 안 되면 session pooler connection을 사용합니다.

`BACKUP_GPG_PASSPHRASE`는 복구할 때도 필요합니다. 1Password 같은 password manager에 별도로 보관합니다.

## 수동 실행

GitHub Actions > Database Backup > Run workflow에서 언제든지 수동 실행할 수 있습니다.

첫 설정 후에는 반드시 한 번 수동 실행해서 artifact가 생성되는지 확인합니다.

## 복구 테스트

백업은 생성보다 복구 테스트가 더 중요합니다. 최소 분기 1회는 빈 로컬/테스트 Postgres에 복구 테스트를 진행합니다.

암호화 해제:

```bash
gpg --decrypt newavely-db-backup-YYYY-MM-DDTHH-MM-SSZ.tar.gz.gpg > backup.tar.gz
tar -xzf backup.tar.gz
```

전체 snapshot 복구 예시:

```bash
pg_restore \
  --dbname "$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  newavely-db-backup-YYYY-MM-DDTHH-MM-SSZ/full.dump
```

Schema만 확인:

```bash
psql --dbname "$DATABASE_URL" --file newavely-db-backup-YYYY-MM-DDTHH-MM-SSZ/schema.sql
```

## 운영 원칙

- 평문 백업 파일을 GitHub artifact, Slack, 이메일, 로컬 Downloads 폴더에 오래 두지 않습니다.
- 복구 테스트 후 평문 파일은 삭제합니다.
- 백업 암호와 Supabase DB 비밀번호는 같은 값을 쓰지 않습니다.
- 누가 백업을 다운로드했고 어디에 장기 보관했는지 운영 메모를 남깁니다.
- 스키마 변경이 큰 PR을 merge하기 전에는 수동 백업을 한 번 실행합니다.

## 추후 개선 TODO

- Supabase Storage 또는 별도 object storage에 장기 encrypted backup 보관
- 월 1회 복구 테스트 결과를 GitHub Issue 또는 운영 문서에 기록
- 백업 성공/실패 알림을 이메일 또는 Slack/Discord로 전송
- Production DB와 별도 staging DB를 만든 뒤 restore rehearsal 자동화
