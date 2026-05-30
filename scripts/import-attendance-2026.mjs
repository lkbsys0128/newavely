import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
const chunkDir = resolve("private/attendance_import_2026_chunks");
const isDryRun = process.argv.includes("--dry-run");

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

if (!connectionString && !isDryRun) {
  fail("DATABASE_URL 또는 SUPABASE_DB_URL 환경 변수에 Supabase DB connection string을 넣어주세요.");
}

if (!existsSync(chunkDir)) {
  fail(`출석 import chunk 폴더를 찾을 수 없습니다: ${chunkDir}`);
}

const files = readdirSync(chunkDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  fail("실행할 SQL chunk 파일이 없습니다.");
}

if (isDryRun) {
  console.log("실행 예정 SQL 파일:");
  for (const file of files) {
    console.log(`- ${file}`);
  }
  process.exit(0);
}

const psqlCheck = spawnSync("psql", ["--version"], { encoding: "utf8" });
if (psqlCheck.error) {
  fail("psql을 찾을 수 없습니다. macOS라면 `brew install libpq` 또는 Postgres.app 설치가 필요합니다.");
}

for (const file of files) {
  const filePath = resolve(chunkDir, file);
  console.log(`\n▶ ${file} 실행 중...`);

  const result = spawnSync(
    "psql",
    [connectionString, "--set", "ON_ERROR_STOP=1", "--file", filePath],
    { encoding: "utf8", stdio: "inherit" },
  );

  if (result.status !== 0) {
    fail(`${file} 실행 중 오류가 발생했습니다. 이후 파일은 실행하지 않았습니다.`);
  }
}

console.log("\n출석 데이터 import가 완료되었습니다.");
