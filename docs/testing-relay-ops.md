# Testing Relay Operations

This document is the operator map for the current relay at
`https://relay.bellfield.app`. It is intentionally named as a **testing
relay** document: the host is useful for development, smoke tests, and early
pilot proof, but it is not the permanent BellField relay architecture.

Use [release-operator-route.md](./release-operator-route.md) for the separate
sold-release publishing route.

## Current Test Host

- Hostname: `bellfieldtest`
- LAN address: `192.168.50.243/24`
- OS: Ubuntu Server 24.04 LTS on the Triton 500 Ubuntu disk
- Operator account: `rob`
- App path on host: `/home/rob/bellfield/deploy/relay`
- Public route: Cloudflare Tunnel for `relay.bellfield.app` to container
  service `relay:3201`
- Local debug route on host: `http://127.0.0.1:3201/health`

The Windows disk on the same laptop remains gate-day scratch-machine territory.
Rebooting into Windows takes the test relay down; that is acceptable while it
is a testing relay, and unacceptable for the eventual permanent relay.

## Credential Inventory

Do not commit secret values. These paths are documented so future operators know
where to look.

On this Windows PC:

- SSH operator private key:
  `C:\Users\rober\.ssh\bellfield-relay-operator`
- SSH operator public key:
  `C:\Users\rober\.ssh\bellfield-relay-operator.pub`
- BellField license signing key folder:
  `C:\Users\rober\Documents\API Keys\BellField\license-v1`
- BellField release signing key folder:
  `C:\Users\rober\Documents\API Keys\BellField\release-v1`
- Test-relay Unraid SMB backup credential:
  `C:\Users\rober\Documents\API Keys\BellField\relay-test\unraid-bellfieldrelay-smb.txt`

On the test relay host:

- Relay environment and provider secrets:
  `/home/rob/bellfield/deploy/relay/relay-host.env`
- Authorized SSH key file:
  `/home/rob/.ssh/authorized_keys`
- Unraid SMB mount credential, root-only:
  `/etc/bellfield/unraid-bellfield-backups.smbcredentials`
- Current backup target, mounted from Unraid:
  `/mnt/bellfield-backups/relay`
- Historical on-box backup directory, kept only as local fallback evidence:
  `/home/rob/relay-backups`

The repo ignores common local operator secret filenames, including
`deploy/relay/relay-host.env`, relay token text files, the local Resend key
filename, and accidental copies of the private SSH operator key.

## Safe Test-Relay Deploy

Run this only after local changes are committed and pushed.

```powershell
ssh -i "$env:USERPROFILE\.ssh\bellfield-relay-operator" rob@192.168.50.243 `
  "cd /home/rob/bellfield/deploy/relay && ./backup-relay-db.sh /mnt/bellfield-backups/relay"

ssh -i "$env:USERPROFILE\.ssh\bellfield-relay-operator" rob@192.168.50.243 `
  "git -C /home/rob/bellfield pull --ff-only"

ssh -i "$env:USERPROFILE\.ssh\bellfield-relay-operator" rob@192.168.50.243 `
  "cd /home/rob/bellfield/deploy/relay && docker compose --env-file relay-host.env up -d --build"

curl.exe -fsS https://relay.bellfield.app/health
```

Expected health response contains `"status":"ok"`.

## Host Hardening Baseline

For this testing relay, the acceptable baseline is:

- SSH key login works from the owner dev PC.
- SSH password auth is disabled.
- Firewall default incoming policy is deny.
- SSH is allowed only from the LAN (`192.168.50.0/24`).
- Docker services use `restart: unless-stopped`.
- Nightly relay DB backups run through a persistent systemd timer.
- Backup files are private by default (`umask 077`).

`rob` currently has broad passwordless sudo and Docker-group access. That is a
test-host convenience, not a permanent-host standard. A permanent relay should
use a narrower operator account and documented break-glass path.

## Hardening Readback

Verified on 2026-06-13 UTC:

- `sshd -T` reports `passwordauthentication no` and
  `authenticationmethods publickey`.
- A fresh key-based SSH connection from the owner dev PC succeeds.
- A password-only SSH attempt fails with `Permission denied (publickey)`.
- UFW is active with default incoming `deny`, outgoing `allow`, and one SSH
  rule: `192.168.50.0/24 -> 22/tcp`.
- `bellfield-relay-backup.timer` is enabled and active.
- The backup service was started manually once against the off-box target and
  wrote `/mnt/bellfield-backups/relay/bellfield-relay-20260613T044857Z.dump`
  successfully.
- The backup target is now the Unraid share
  `//192.168.50.78/bellfield-backups`, mounted at
  `/mnt/bellfield-backups`.
- Existing historical backup dumps under `/home/rob/relay-backups` are mode
  600 and are not the active target.

## Persistent Backup Timer

The systemd templates live under `deploy/relay/systemd/`. On the test host the
environment file is:

```bash
sudo mkdir -p /etc/bellfield
sudo tee /etc/bellfield/relay-backup.env >/dev/null <<'EOF'
BELLFIELD_RELAY_DIR=/home/rob/bellfield/deploy/relay
BELLFIELD_RELAY_BACKUP_TARGET=/mnt/bellfield-backups/relay
EOF
sudo chmod 600 /etc/bellfield/relay-backup.env
```

Then install and enable:

```bash
sudo cp /home/rob/bellfield/deploy/relay/systemd/bellfield-relay-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bellfield-relay-backup.timer
systemctl list-timers bellfield-relay-backup.timer
```

The active off-box destination is the Unraid share
`//192.168.50.78/bellfield-backups`, mounted on the relay host at
`/mnt/bellfield-backups`. The persistent mount line in `/etc/fstab` is:

```fstab
//192.168.50.78/bellfield-backups /mnt/bellfield-backups cifs credentials=/etc/bellfield/unraid-bellfield-backups.smbcredentials,vers=3.0,iocharset=utf8,uid=1000,gid=1000,file_mode=0600,dir_mode=0700,noserverino,nofail,x-systemd.automount,x-systemd.idle-timeout=60 0 0
```

The Unraid share is SMB-exported as private. The dedicated Unraid user is
`bellfieldrelay`, with read/write access only to `bellfield-backups`; the
password is stored only in the Windows credential inventory file listed above
and in the relay host's root-only CIFS credential file.

Manual readback commands:

```bash
sudo cat /etc/bellfield/relay-backup.env
grep -n "bellfield-backups" /etc/fstab
findmnt /mnt/bellfield-backups -o SOURCE,TARGET,FSTYPE,OPTIONS --noheadings
sudo systemctl start bellfield-relay-backup.service
find /mnt/bellfield-backups/relay -maxdepth 1 -type f -printf "%f %s bytes\n" | sort
```
