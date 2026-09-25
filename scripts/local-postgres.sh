#!/usr/bin/env bash
# Provision a throwaway local PostgreSQL for scripts/durable-restart-check.js.
#
# WHY THIS EXISTS. The durable-restart check is the only thing in this repository that exercises the
# persistence layer at all — every suite in the truth layer runs with DB_OPTIONAL=1, which is an
# in-memory store, so "nothing survives a restart" is the one failure a hermetic suite is
# structurally unable to see. The check was written for that, and then was not run, and the handoff
# recorded the whole layer as externally gated.
#
# Part of the reason is that it did not run out of the box: the documented command asks for SSL,
# a local server refuses, and the first boot never answers. PostgreSQL 16 is installed in the
# standard container image, so this is a few lines away rather than a live database away.
#
# WHAT IT IS NOT. A local PostgreSQL in this container has no network partition, no connection
# ceiling, no cold start, no pooler and no managed-service failure modes. It is not Neon, it is not
# Render, and it says nothing about the deployed build. It proves the persistence code in this
# commit writes to a real database and reads it back after the process is killed. Report it as that.
#
# Usage:  bash scripts/local-postgres.sh          # start (idempotent)
#         bash scripts/local-postgres.sh stop     # stop and delete the data directory
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
PGDATA=${PGDATA:-/var/tmp/pgdata}
PGPORT=${PGPORT:-55432}
DBNAME=intelliq

if [ ! -d "$PGBIN" ]; then
  echo "No PostgreSQL 16 server at $PGBIN. Install postgresql-16, or use a real database." >&2
  exit 1
fi

if [ "${1:-start}" = "stop" ]; then
  su postgres -c "PATH=$PGBIN:\$PATH pg_ctl -D $PGDATA stop" >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
  echo "stopped, and $PGDATA removed"
  exit 0
fi

# initdb refuses to run as root, which is what this container is, so the cluster is owned by the
# postgres account the package already creates.
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"; chmod 700 "$PGDATA"
  su postgres -c "PATH=$PGBIN:\$PATH initdb -D $PGDATA -U postgres --auth=trust" >/var/tmp/initdb.log 2>&1
fi

if ! "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
  su postgres -c "PATH=$PGBIN:\$PATH pg_ctl -D $PGDATA -o '-h 127.0.0.1 -p $PGPORT' -l /var/tmp/pg.log start" >/dev/null 2>&1
  for _ in $(seq 1 30); do
    "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

"$PGBIN/pg_isready" -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 || { tail -20 /var/tmp/pg.log >&2; exit 1; }
"$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DBNAME'" | grep -q 1 \
  || "$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U postgres -q -c "CREATE DATABASE $DBNAME"

cat <<EOF
PostgreSQL 16 ready on 127.0.0.1:$PGPORT (database: $DBNAME)

  PG_SSL_DISABLE=1 DATABASE_URL=postgres://postgres@127.0.0.1:$PGPORT/$DBNAME \\
    node scripts/durable-restart-check.js

Stop and remove it with: bash scripts/local-postgres.sh stop
EOF
