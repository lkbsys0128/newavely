import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/database-backup.yml", import.meta.url), "utf8");
const rehearsal = readFileSync(new URL("../scripts/verify-backup-restore.py", import.meta.url), "utf8");

test("restore rehearsal is opt-in, downloads the artifact and always cleans up", () => {
  assert.match(workflow, /restore_test:[\s\S]*type: boolean\s+default: false/);
  assert.match(workflow, /uses: actions\/download-artifact@v4/);
  assert.match(workflow, /always\(\) && inputs.restore_test == true/);
  assert.match(workflow, /docker rm -fv newavely-restore-test/);
  assert.ok(workflow.indexOf("Upload encrypted backup artifact") < workflow.indexOf("Download uploaded encrypted backup"));
});

test("restore rehearsal never targets a remote database or exposes row errors", () => {
  assert.doesNotMatch(rehearsal, /SUPABASE_DB_URL|DATABASE_URL|postgresql:\/\//);
  assert.match(rehearsal, /"--network", "none"/);
  assert.match(rehearsal, /digest\(original\) != digest\(downloaded\)/);
  assert.match(rehearsal, /"--single-transaction", "--exit-on-error"/);
  assert.match(rehearsal, /private output withheld/);
  for (const table of ["members", "new_family_applicants", "attendance_events", "attendance_records"]) {
    assert.ok(rehearsal.includes(`"${table}"`));
  }
});

test("backup pins compatible PostgreSQL client and runner versions", () => {
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /https:\/\/apt.postgresql.org\/pub\/repos\/apt noble-pgdg main/);
  assert.match(workflow, /signed-by=\/usr\/share\/postgresql-common\/pgdg\/apt.postgresql.org.asc/);
  assert.match(workflow, /apt-get install --yes postgresql-client-17/);
  assert.match(workflow, /echo "\/usr\/lib\/postgresql\/17\/bin" >> "\$GITHUB_PATH"/);
});

test("backup verifies dump and encryption before uploading only encrypted data", () => {
  assert.match(workflow, /pg_restore --list "\$BACKUP_DIR\/full.dump" > \/dev\/null/);
  assert.match(workflow, /--decrypt "\$\{BACKUP_DIR\}\.tar\.gz\.gpg" \\\n\s+\| cmp - "\$\{BACKUP_DIR\}\.tar\.gz"/);
  assert.match(workflow, /path: \$\{\{ env.BACKUP_DIR \}\}\.tar\.gz\.gpg/);
  assert.match(workflow, /retention-days: 30/);
  assert.ok(workflow.indexOf("| cmp -") < workflow.indexOf("Upload encrypted backup artifact"));
});
