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

Ubuntu 24.04 runner에서 `postgresql-client-17`을 설치하고 `/usr/lib/postgresql/17/bin`을 우선 사용합니다. Supabase PostgreSQL 17과 이전 `pg_dump` 16의 버전 불일치를 방지합니다. 서버 major 버전이 올라가면 클라이언트 버전도 함께 검토해야 합니다.

업로드 전에 두 덤프가 비어 있지 않은지, `pg_restore --list`로 custom dump를 읽을 수 있는지 확인합니다. 암호화 결과를 스트림으로 복호화해 원본과 비교하며 평문 복호화 파일은 만들지 않습니다. 이 검사는 실제 DB 복구 테스트를 대신하지 않습니다.

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

## 복구 런북

### 1. 복구 범위와 시점 결정

- 담당자와 승인자를 지정하고 사고 발생 시각, 마지막 정상 상태, 복구할 데이터 범위를 기록합니다.
- 단일 항목 실수라면 앱의 복구 기능 또는 테스트 DB에서 추출한 해당 레코드 복구를 우선 검토합니다. 전체 DB 복원은 이후 정상 변경까지 잃을 수 있습니다.
- 주 1회 백업이므로 정상 실행 시에도 최대 약 7일의 변경이 빠질 수 있습니다. 실패가 이어졌다면 실제 손실 범위는 마지막 성공 백업부터입니다. 30일 artifact 만료 전에 별도 암호화 보관이 필요합니다.
- 운영 복구 전 쓰기 요청, cron, 새가족 동기화 등 외부 쓰기를 중단할 계획과 실패 시 되돌릴 계획을 승인받습니다. 현재 앱에 자동 유지보수 잠금이 있다고 가정하지 않습니다.
- **이 문서의 예시 명령은 격리된 테스트 대상용입니다. 운영 DB에 그대로 실행하지 않습니다.**

### 2. 백업 선택과 다운로드

1. GitHub 저장소의 **Actions > Database Backup**에서 성공한 실행을 선택합니다. 단순히 가장 최신 실행을 고르지 말고 사고 이전 시점인지 확인합니다.
2. 실행 브랜치, 커밋, 실행 시간(UTC), artifact 이름과 만료일을 기록합니다. 정기 실행은 기본 브랜치 workflow를 사용하므로 수정 PR의 수동 실행 성공과 정기 실행 적용은 구분합니다.
3. **Artifacts > `newavely-db-backup-...-encrypted`**를 다운로드합니다. GitHub가 제공한 ZIP을 풀면 `.tar.gz.gpg` 파일이 나옵니다. ZIP 자체가 DB 덤프는 아닙니다.
4. `BACKUP_GPG_PASSPHRASE`를 비밀번호 관리자에서 확인합니다. GitHub Secret은 저장된 값을 다시 보여주지 않습니다. 비밀번호를 바꿔도 옛 백업의 암호는 바뀌지 않으므로 백업별 암호 버전을 보관합니다.

암호화 파일을 보관할 때 SHA-256도 기록합니다. 이 해시는 이후 파일 변조/손상 비교용이며 최초 파일의 진위를 보장하지는 않습니다.

```bash
shasum -a 256 /absolute/path/backup.tar.gz.gpg
```

### 3. 격리된 작업 공간에서 복호화

암호화된 디스크의 로컬 작업 공간을 사용하며 Git 저장소, 공유 폴더, 자동 클라우드 동기화 폴더는 피합니다. PostgreSQL 17의 `pg_restore`, `psql`, GnuPG가 필요합니다. 아래 명령은 같은 터미널 세션에서 순서대로 실행합니다.

```bash
umask 077
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/newavely-restore.XXXXXX")"
chmod 700 "$WORK_DIR"
pg_restore --version
gpg --output "$WORK_DIR/backup.tar.gz" --decrypt /absolute/path/backup.tar.gz.gpg
```

암호는 GPG 프롬프트에 입력합니다. 명령행 인자, 채팅, 로그에 붙여넣지 않습니다. GPG가 실패하면 생성된 불완전 파일을 사용하지 말고 중단합니다.

```bash
tar -tzf "$WORK_DIR/backup.tar.gz"
```

목록에 예상한 단일 `newavely-db-backup-.../` 디렉터리와 `schema.sql`, `full.dump`, `manifest.txt`만 있는지 확인합니다. 절대 경로, `..`, 예상하지 않은 파일은 중단 사유입니다. 확인 후 압축을 풉니다.

```bash
tar -xzf "$WORK_DIR/backup.tar.gz" -C "$WORK_DIR"
BACKUP_DIR="$WORK_DIR/newavely-db-backup-YYYY-MM-DDTHH-MM-SSZ"
test -s "$BACKUP_DIR/full.dump"
cat "$BACKUP_DIR/manifest.txt"
pg_restore --list "$BACKUP_DIR/full.dump" > "$WORK_DIR/archive-list.txt"
```

`BACKUP_DIR`의 날짜 부분은 실제 폴더명으로 바꿉니다. 오류가 없고 예상 테이블이 archive 목록에 있어야 다음 단계로 진행합니다. **목록 검사와 복호화 성공만으로 복구 가능 판정을 내리지 않습니다.**

### 4. 복구 대상 준비와 제약 확인

현재 파일은 일반 `pg_dump` 결과이지 Supabase 프로젝트 전체 이미지가 아닙니다.

- `full.dump`에는 덤프 계정이 읽은 DB 객체·데이터가 포함됩니다. `schema.sql`은 별도의 실행에서 만들어져 full dump와 정확히 같은 시점은 아닙니다. 전체 복원에는 `full.dump`만 사용하며 `schema.sql`을 먼저 적용하지 않습니다.
- `--no-owner --no-acl`로 생성하므로 소유권과 GRANT/REVOKE는 복원되지 않습니다. 전역 DB 역할·비밀번호도 별도입니다. RLS 정책이 있더라도 역할, 테이블/RPC 권한, 함수 소유자를 검증해야 합니다.
- Supabase의 `auth`/`storage` 관리 스키마, 확장, 사전 정의 역할과 함수 때문에 빈 일반 PostgreSQL에 그대로 복원하면 실패할 수 있습니다. 새 Supabase 프로젝트도 이미 관리 객체가 있으므로 무조건 전체 덤프를 덮어쓰면 안 됩니다.
- Storage 실제 파일, Vercel 환경 변수, Google OAuth·Sheets 설정, Edge Function 코드 등은 이 DB 덤프만으로 복구되지 않습니다. 프로젝트 간 이동에서는 Supabase 암호화 키 의존 데이터도 별도 확인해야 합니다.

우선 PostgreSQL 17과 필요한 확장·역할을 갖춘 **격리된 테스트 환경**을 준비합니다. 운영 데이터가 들어가므로 접근을 제한하고 이메일, 웹훅, cron 등 외부 전송을 비활성화합니다. 대상 주소가 운영 프로젝트와 다른지 두 사람이 확인합니다.

Supabase 관리 객체 충돌이 예상되면 archive 목록을 검토하고 복구 대상 객체 목록을 별도로 승인받습니다. `public`만 골라 복원하는 것은 `auth.users` 등 외부 의존성을 해결한 전체 복구가 아닙니다. 오류를 무시하거나 운영 DB의 관리 스키마를 삭제해서 통과시키지 않습니다.

### 5. 테스트 복원

아래는 **필요 의존성이 준비되고 복원 객체가 아직 없는 테스트 DB**용 예시입니다. `PGSERVICE`는 로컬 `pg_service.conf`의 테스트 전용 항목이며 운영 접속 정보와 분리합니다. DB 비밀번호는 `-W` 프롬프트로 입력합니다. 원격 연결은 서비스 설정에 `sslmode=require`를 지정합니다.

```bash
export PGSERVICE=newavely_restore_test
psql -X -W -v ON_ERROR_STOP=1 -c 'select current_database(), current_user, inet_server_addr(), version();'
```

서비스 설정의 호스트/프로젝트 ref와 위 결과가 승인한 테스트 대상인지 확인한 다음 실행합니다.

```bash
pg_restore -W \
  --dbname "service=$PGSERVICE" \
  --single-transaction \
  --exit-on-error \
  --no-owner \
  --no-acl \
  "$BACKUP_DIR/full.dump" \
  > "$WORK_DIR/restore.stdout.log" 2> "$WORK_DIR/restore.stderr.log"
```

종료 코드가 0이어야 합니다. 이 예시는 기존 객체를 지우는 `--clean`을 사용하지 않습니다. 실패하면 오류와 의존성을 검토한 뒤 새 테스트 대상에서 다시 시작합니다. `--single-transaction`은 해당 복원 명령의 DB 변경을 원자적으로 처리하지만 외부 서비스 설정을 되돌려주지는 않습니다. 복원 로그에도 개인정보가 포함될 수 있으므로 공개 이슈에 원문을 올리지 않습니다.

### 6. 복원 후 검증

- `members`, `groups`, `attendance_events`, `attendance_records`, `new_family_applicants`, `prayer_meetings`, `prayer_templates`, `audit_logs`의 건수·최근 날짜·참조 관계를 확인합니다. 정상 백업 시점의 수치와 비교하며 운영 원본이 이후 변경된 경우 현재 건수와 단순 비교하지 않습니다.
- UUID, foreign key, unique 제약, 시퀀스, 인덱스, RLS 활성 상태와 정책, RPC 정의와 실행 권한을 확인합니다.
- owner/admin/leader/staff/assistant/welcome/member 계정의 조회·변경 경계를 테스트합니다. 순장·부순장의 다른 순 출석 변경 거부, 웰컴팀의 제한된 추가 출석 변경을 포함합니다.
- 익명은 최신 기도회·공개 링크만 읽고 수정할 수 없는지, 가입 대기는 운영 페이지를 조회·수정할 수 없는지 확인합니다.
- 멤버·새가족 상세, 출석 통계, 기도회 다중 링크·템플릿, 로그인·계정 연결과 감사 로그가 정상인지 테스트합니다. 테스트 계정 제외 통계도 비교합니다.
- 접근 권한 복원을 위해 저장소의 검토된 스키마/마이그레이션을 참고합니다. 모든 migration을 무조건 재실행하거나 `GRANT ALL`로 오류를 덮지 않습니다.

테스트 DB의 쓰기 검증만 수행하고 운영 데이터로 테스트 기록을 만들지 않습니다. 복원 시간과 검증 결과를 남긴 뒤에만 운영 복구 승인 단계로 넘어갑니다.

### 7. 운영 복구와 실패 시 대응

1. 승인자에게 복구 시점, 예상 데이터 손실, 대상 프로젝트, 검증 결과, 작업 시간과 되돌리기 계획을 확인받습니다.
2. 사용자에게 변경 중단을 알리고 앱·cron·동기화·관리자 SQL 등 모든 쓰기 경로를 중단합니다. 중단 여부를 확인합니다.
3. 가능하면 현재 상태의 새 암호화 백업을 생성하고 별도로 보존합니다. 손상됐더라도 사고 이후의 정상 변경을 추출할 수 있습니다. 백업 불가 시 그 위험을 승인자에게 알립니다.
4. 검증된 별도 프로젝트로 복원 후 전환하는 방식을 우선 검토합니다. 같은 DB에 복원해야 한다면 테스트한 전용 명령/객체 목록을 승인받습니다. manifest의 `--clean` 힌트는 실행 승인이 아니며, 이 문서는 운영용 파괴적 일괄 명령을 제공하지 않습니다.
5. 새 프로젝트 전환 시 앱 URL/키, OAuth callback, service role, cron, Sheets 연동, Storage 등을 확인합니다. 오래된 앱 버전과 복구 스키마가 맞는지도 확인합니다.
6. 쓰기가 중단된 상태에서 6단계 검증을 수행하고 승인 후 재개합니다. 실패하면 쓰기를 재개하지 않고, 보존한 이전 프로젝트/백업과 검증된 되돌리기 계획을 사용합니다. 재개 후 발생한 새 쓰기를 무시한 단순 역전환은 금지합니다.
7. 복구 후 새 백업을 실행하고 다음 정기 실행도 성공했는지 확인합니다.

### 8. 정리와 기록

검증에 사용한 평문 압축 파일·덤프·로그와 임시 DB를 삭제하고 접근 권한을 회수합니다. 삭제 전 정확한 작업 경로를 확인하며 wildcard 삭제는 피합니다. SSD에서는 `shred`로 완전 삭제를 보장할 수 없으므로 처음부터 암호화 디스크와 제한된 보관 기간을 사용합니다. 암호화 원본과 필요한 복구 암호는 보존 정책에 맞춰 별도 보관합니다.

운영 기록에는 아래만 남기고 개인정보·키·비밀번호는 넣지 않습니다.

```text
사고/훈련 일시 및 담당자·승인자:
백업 run URL / 브랜치 / 커밋 / artifact / UTC 생성 시각:
암호화 파일 SHA-256 / 암호 버전 식별자(값 아님):
대상 환경 식별자 / PostgreSQL 버전:
복구 범위 / 예상 데이터 손실 / 소요 시간:
덤프·복호화 검사 / 실제 복원 / 권한·기능 검증 결과:
운영 전환 여부 / 되돌리기 계획 / 쓰기 재개 시각:
임시 데이터 삭제 확인 / 후속 조치:
```

최소 분기 1회와 큰 스키마 변경 후 복구 훈련을 수행합니다. 현재 확인된 성공 실행은 [39561918463](https://github.com/lkbsys0128/newavely/actions/runs/39561918463)이며 덤프 생성·목록 검사·암호화 왕복 비교·업로드만 검증했습니다. **실제 DB 복원 훈련은 아직 완료하지 않았습니다.**

### 참고 문서

- [PostgreSQL 17 pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html): 아카이브 검사, 트랜잭션, 오류 중단, 기존 객체 삭제 옵션.
- [Supabase 백업·복구 안내](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore): 관리형 프로젝트 이전과 별도 설정. 이 문서의 Supabase CLI 전용 dump 절차를 우리 custom-format 파일에 그대로 적용하지 않습니다.

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
