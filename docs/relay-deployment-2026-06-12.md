# Relay Production Deployment — 2026-06-12

The BellField delivery relay went live on 2026-06-12 at
`https://relay.bellfield.app`, completing the D7 pilot hosting decision and
the deployment half of Phase 5. This document is the dated evidence record.

## Host

- Acer Predator Triton 500 (PT515-51), Ubuntu Server 24.04.4 LTS on NVMe
  disk 2 (Windows 11 scratch environment for gate day remains untouched on
  disk 1; GRUB default-boots Ubuntu).
- LAN `192.168.50.243` (DHCP reservation still to be set on the router),
  wired Ethernet. Operator access: SSH key only in practice
  (`bellfield-relay-operator` keypair from the owner's dev PC), passwordless
  sudo for the operator user.
- Headless posture applied: lid-switch ignored (runs closed), `nouveau`
  blacklisted (the RTX stays powered down), unattended security upgrades on,
  Docker Engine 29.5.3 from Docker's official channel.
- Intel RST → AHCI BIOS switch was required before the Ubuntu installer
  could see the NVMe drives; procedure recorded in
  [triton-500-setup.md](./triton-500-setup.md).

## Stack

`~/bellfield/deploy/relay`, run as
`docker compose --env-file relay-host.env up -d --build`:

- `relay` — built from `apps/relay/Dockerfile` at repo `main`; loopback-only
  port 3201; release-artifacts volume mounted read-only.
- `relay-postgres` — pinned `postgres:16.6`, named volume, healthchecked;
  migrations applied by the one-shot `relay-migrate` service (3 migrations).
- `cloudflared` — pinned `2025.5.0`, token-authenticated remotely-managed
  tunnel `bellfield-relay` (ingress `relay.bellfield.app → relay:3201`).
  Outbound-only; no router ports were opened.
- All long-running services `restart: unless-stopped`; the stack survives
  reboot and power loss unattended.

Secrets exist in exactly one file on the box (`relay-host.env`, mode 600):
the dedicated BellField Resend account's API key (the only provider
credential in the whole product), the relay database password, the Cloudflare
tunnel token, and the webhook signing secret.

## Verification performed

- `curl http://127.0.0.1:3201/health` on the box → `{"status":"ok"}`.
- `https://relay.bellfield.app/health` from outside through the tunnel →
  `{"status":"ok"}`.
- Resend webhook created via API (delivered/bounced/complained →
  `https://relay.bellfield.app/webhooks/resend`), signing secret installed,
  relay restarted healthy.
- Backup script run once successfully (custom-format `pg_dump`, ~20KB) and
  installed as a nightly cron (02:15).

## End-to-end production send (same day)

The first real estimate email went through the complete production path on
2026-06-12:

1. Shop `BellField Dev` created on the production relay (quota 100, update
   window 2027-06-12); relay token issued and stored in the owner's local
   secrets folder, never in any repo or database.
2. A development install was configured with only the three relay client
   values (base URL, token, server instance id) — no provider key anywhere.
3. Send-preview reported `ready` from the production entitlement endpoint
   (first authenticated call also performed the activation binding).
4. `POST /operations/estimates/:id/send` to a real Gmail recipient returned
   `status: "sent"`.
5. The relay's message record flipped to **`delivered`** within seconds —
   meaning Resend's webhook traveled back through the tunnel, passed
   signature verification, and the status pipeline applied it.

Install → tunnel → relay → provider → inbox, and the delivery receipt all
the way back: every Phase 5 mechanism verified in production with a real
email. This closes the practical core of the Phase 5 gate; the formal
gate still wants the same flow from a sold-shaped (licensed, packaged)
install, which folds into gate day.

## Open operational items

- **Off-box backups**: nightly dumps currently land on the box itself
  (`~/relay-backups`) — a stopgap. Relay plan §11 requires an off-box copy;
  re-point the cron target when the destination is chosen.
- **External uptime monitor** on the health URL (requires an owner account
  at the monitoring service).
- **DHCP reservation** for the host's LAN address.
- **Harden SSH** to key-only (`PasswordAuthentication no`) — password auth
  is still enabled and the console password is weak.
- Gate day (Windows disk) remains tracked validation debt; the relay being
  live does not block it, but reboots for gate work take the relay down —
  fine until a pilot shop depends on it.

## Setup gotchas worth remembering

- Windows `ssh-keygen` writes `.pub` files with CRLF line endings; a CRLF in
  `authorized_keys` makes sshd reject the key. Strip with
  `sed -i 's/\r$//' ~/.ssh/authorized_keys`.
- PowerShell `-N '""'` passes a literal two-character passphrase to
  ssh-keygen. Generated keys should be verified with
  `ssh-keygen -y -P "" -f <key>` before debugging the server side.
- `docker compose` variable interpolation (`${VAR:?}` in compose.yaml) reads
  the `--env-file` flag, not `env_file:` entries — every compose invocation
  against this stack needs `--env-file relay-host.env`.
