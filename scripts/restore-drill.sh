#!/usr/bin/env bash
# AT-12 restore drill: dump the database, restore it into a scratch database,
# reconcile subscription/invoice/payment totals and report the restore time (RTO).
# Usage: scripts/restore-drill.sh                      (local PostgreSQL client tools)
#        PG_EXEC="docker exec -i recurivo-pg" scripts/restore-drill.sh
set -euo pipefail
DB=${PGDATABASE:-recurivo}
PGU=${PGUSER:-recurivo}
TARGET="${DB}_restore_drill"
DUMP=${DUMP_FILE:-./recurivo-drill.dump}
read -r -a RUN <<< "${PG_EXEC:-}"

pg() { "${RUN[@]}" "$@"; }
totals() {
  pg psql -U "$PGU" -d "$1" -v ON_ERROR_STOP=1 -At -c "
    SELECT 'subscriptions', count(*), coalesce(sum(total), 0)::text FROM \"Subscription\"
    UNION ALL SELECT 'invoices', count(*), coalesce(sum(total), 0) || '/' || coalesce(sum(\"amountPaid\"), 0) FROM \"Invoice\"
    UNION ALL SELECT 'payments', count(*), coalesce(sum(amount), 0)::text FROM \"Payment\"
    UNION ALL SELECT 'allocations', count(*), coalesce(sum(amount), 0)::text FROM \"PaymentAllocation\"
    UNION ALL SELECT 'audit events', count(*), '-' FROM \"AuditEvent\";"
}

echo "Backing up $DB at $(date -u +%FT%TZ)"
t0=$(date +%s)
pg pg_dump -U "$PGU" -Fc "$DB" > "$DUMP"
t1=$(date +%s)
before=$(totals "$DB")

pg dropdb -U "$PGU" --if-exists "$TARGET"
pg createdb -U "$PGU" "$TARGET"
pg pg_restore -U "$PGU" -d "$TARGET" --no-owner < "$DUMP"
t2=$(date +%s)
after=$(totals "$TARGET")
pg dropdb -U "$PGU" "$TARGET"

echo "$after" | column -t -s '|'
echo "Dump: $((t1 - t0)) s, $(du -h "$DUMP" | cut -f1). Restore (RTO for this size): $((t2 - t1)) s."
if [[ "$before" == "$after" ]]; then echo "Totals reconcile."; else echo "MISMATCH"; diff <(echo "$before") <(echo "$after"); exit 1; fi
