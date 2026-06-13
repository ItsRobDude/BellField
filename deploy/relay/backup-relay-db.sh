#!/usr/bin/env bash
# Nightly relay database dump (the relay DB is the billing ledger — relay
# plan §11 requires an off-box copy). Run from cron on the relay host, e.g.:
#   15 2 * * * /home/bellfield/bellfield/deploy/relay/backup-relay-db.sh /mnt/offbox/relay-backups
# Point the target at storage that does not live on this machine (NFS/SMB
# mount, rclone'd bucket, or scp in a wrapper script).
set -euo pipefail
umask 077

target_dir="${1:?usage: backup-relay-db.sh <target-dir>}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$target_dir"

script_dir="$(dirname "$0")"
docker compose -f "$script_dir/compose.yaml" --env-file "$script_dir/relay-host.env" \
  exec -T relay-postgres \
  pg_dump -U relay -d bellfield_relay --format=custom \
  > "$target_dir/bellfield-relay-$stamp.dump"

# Keep the most recent 14 dumps.
ls -1t "$target_dir"/bellfield-relay-*.dump | tail -n +15 | xargs -r rm --

echo "relay backup written: $target_dir/bellfield-relay-$stamp.dump"
