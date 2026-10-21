"""Restore only inside a network-isolated, disposable Docker container.

Never accepts a database URL and never prints plaintext dumps or database errors.
"""
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import time


def run(args, *, data=None):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        # Server error details can include private row values. Only expose known dependency names.
        error = result.stderr.decode("utf-8", errors="replace")
        dependency = re.search(r'extension "([a-zA-Z0-9_]+)" is not available|role "([a-zA-Z0-9_]+)" does not exist', error)
        if dependency:
            print("Missing restore dependency: " + next(value for value in dependency.groups() if value), flush=True)
        raise RuntimeError(f"{args[0]} failed (exit {result.returncode}); private output withheld")
    return result.stdout


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").digest()


def main():
    os.umask(0o077)
    root = Path(os.environ["RUNNER_TEMP"]) / "backup-rehearsal"
    root.mkdir(mode=0o700)
    name = os.environ["BACKUP_DIR"]
    if not re.fullmatch(r"newavely-db-backup-[0-9TZ-]+", name):
        raise RuntimeError("Invalid backup directory")
    original = Path(f"{name}.tar.gz.gpg")
    downloaded = root.parent / "backup-rehearsal-download" / original.name
    if digest(original) != digest(downloaded):
        raise RuntimeError("Downloaded artifact differs from uploaded file")
    print("PASS: downloaded encrypted artifact matches original SHA-256", flush=True)
    archive = root / "backup.tar.gz"
    run(["gpg", "--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0",
         "--output", str(archive), "--decrypt", str(downloaded)],
        data=(os.environ.pop("BACKUP_GPG_PASSPHRASE") + "\n").encode())
    expected = {f"{name}/{file}" for file in ("schema.sql", "full.dump", "manifest.txt")}
    with tarfile.open(archive, "r:gz") as tar:
        files = [item for item in tar.getmembers() if item.isfile()]
        if {item.name for item in files} != expected or len(files) != 3:
            raise RuntimeError("Unexpected archive contents")
        if any(not item.isfile() and not (item.isdir() and item.name.rstrip("/") == name) for item in tar.getmembers()):
            raise RuntimeError("Unsafe archive entry")
        for item in files:
            with tar.extractfile(item) as source, (root / Path(item.name).name).open("wb") as target:
                shutil.copyfileobj(source, target)
    dump = root / "full.dump"
    run(["pg_restore", "--list", str(dump)])
    print("PASS: downloaded artifact decrypts, extracts and contains a readable dump", flush=True)

    run(["docker", "run", "--detach", "--name", "newavely-restore-test", "--network", "none",
         "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-bookworm"])
    for _ in range(60):
        ready = subprocess.run(["docker", "exec", "newavely-restore-test", "pg_isready", "-U", "postgres"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if ready.returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError("Isolated PostgreSQL did not start")
    roles = ["anon", "authenticated", "service_role", "supabase_auth_admin", "supabase_storage_admin",
             "supabase_admin", "authenticator", "dashboard_user"]
    bootstrap = "\n".join(f'CREATE ROLE "{role}" NOLOGIN;' for role in roles)
    run(["docker", "exec", "-i", "newavely-restore-test", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], data=bootstrap.encode())
    run(["docker", "cp", str(dump), "newavely-restore-test:/tmp/full.dump"])
    run(["docker", "exec", "newavely-restore-test", "pg_restore", "-U", "postgres", "-d", "postgres",
         "--single-transaction", "--exit-on-error", "--no-owner", "--no-acl", "/tmp/full.dump"])
    print("PASS: complete dump restored into isolated PostgreSQL", flush=True)
    for table in ("members", "new_family_applicants", "attendance_events", "attendance_records"):
        count = run(["docker", "exec", "newavely-restore-test", "psql", "-U", "postgres", "-At",
                     "-c", f'SELECT count(*) FROM public."{table}";']).decode().strip()
        if not count.isdigit():
            raise RuntimeError("Invalid restored table count")
        print(f"PASS: restored {table} is queryable ({count} rows)", flush=True)


if __name__ == "__main__":
    main()
