import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/database-backup.yml", import.meta.url), "utf8");

test("backup pins compatible PostgreSQL client and runner versions", () => {
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
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
