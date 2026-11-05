#!/usr/bin/env bash
# Applies every migration (except *_cron.sql, Supabase-only) to a fresh local Postgres and runs the assertions.
# Usage: PGHOST=/tmp PGPORT=5499 PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=j_test_$$
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql -v ON_ERROR_STOP=1 -q -d "$DB" -c "create extension if not exists pgcrypto" -f tests/auth_stub.sql >/dev/null
for f in migrations/*.sql; do
  case "$f" in *_cron.sql) continue;; esac
  echo "  applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null
done
psql -v ON_ERROR_STOP=1 -tA -d "$DB" -f tests/assertions.sql 2>&1 | grep -v "^NOTICE" | tail -1
