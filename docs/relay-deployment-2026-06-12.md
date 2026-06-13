# Testing Relay Deployment — 2026-06-12

The BellField delivery relay went live on 2026-06-12 at
`https://relay.bellfield.app`, completing the D7 pilot hosting decision and
the deployment half of Phase 5. This document is the dated evidence record for
the current **testing relay**. It is not the permanent relay-hosting route.
Operator procedures and credential locations live in
[testing-relay-ops.md](./testing-relay-ops.md); release publishing lives in
[release-operator-route.md](./release-operator-route.md).

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
- Backup script run once successfully (custom-format `pg_dump`, ~20KB). It was
  later moved from cron/on-box storage to the persistent systemd timer and the
  Unraid off-box target recorded below.

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

## Operational items

- **External uptime monitor** on the health URL (requires an owner account
  at the monitoring service).
- **DHCP reservation** for the host's LAN address.
- **SSH/firewall hardening**: completed 2026-06-13 UTC. Remote SSH is key-only
  (`PasswordAuthentication no`, `AuthenticationMethods publickey`), UFW denies
  incoming by default, and SSH is allowed only from `192.168.50.0/24`. The
  console password remains a local break-glass path for this testing host.
- **Backup scheduling hardening**: completed 2026-06-13 UTC. Cron was replaced
  with `bellfield-relay-backup.timer` (`Persistent=true`) and existing dump
  files were tightened to mode 600.
- **Off-box backups**: completed 2026-06-13 UTC. Unraid share
  `//192.168.50.78/bellfield-backups` is mounted on the relay host at
  `/mnt/bellfield-backups`; the active target is
  `/mnt/bellfield-backups/relay`. The first verified off-box dump was
  `bellfield-relay-20260613T044857Z.dump` (25,142 bytes). Credential
  locations and readback commands live in
  [testing-relay-ops.md](./testing-relay-ops.md).
- **Laptop-as-server hardening** (decided 2026-06-12: this host stays until
  the first paying customer has acceptance links live — no VPS pre-revenue):
  verify lid-close/sleep is fully disabled; run a deliberate power-loss
  reboot test proving Docker and both containers return unattended; prefer
  ethernet over Wi-Fi if the port reaches.
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
