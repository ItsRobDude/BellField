# Triton 500 Setup (Gate-Day Scratch Machine + Relay Host)

The Acer Predator Triton 500 (PT515-51, 2×1TB NVMe, 64GB) is the dual-purpose
BellField machine:

- **Disk 1 — Windows 11**: the permanent clean-machine scratch environment for
  [gate-day-checklist.md](./gate-day-checklist.md) and future re-validations.
- **Disk 2 — Ubuntu Server 24.04**: the pilot relay host (D7) — Docker running
  relay + Postgres + cloudflared behind a Cloudflare Tunnel, lid closed.

Order matters: **Windows first, Ubuntu second** (Ubuntu's bootloader will
detect and chain Windows; the reverse order lets Windows stomp the boot
entry). Everything on this page is owner-hands-on-hardware work; the relay
stack deployment that follows it is scripted/remote work.

---

## Phase 0 — Check the disk layout (1 minute, inside current Windows)

Before anything: `Win+X` → **Disk Management**. Expected: **two separate
~954GB disks**. If instead one ~1.9TB disk appears, the drives are striped in
RAID 0 — that array must be broken in BIOS (destroys everything, forces the
USB install path for Windows too); stop and handle that first. Two separate
disks means the easy path below applies and the BIOS barely matters.

Also confirm nothing on the laptop needs saving — both disks get wiped.

## Phase 1 — Act 1: factory-reset the existing Windows 11 (no USB needed)

The built-in reset produces exactly the clean stranger's PC the gate needs:

1. Settings → System → Recovery → **Reset this PC** → **Remove everything**.
2. Choose **Local reinstall** (fall back to Cloud download if it fails),
   **"Only the drive where Windows is installed"** if asked, and **"Just
   remove files"** (the slow secure-wipe is for selling the machine).
3. After reset, Windows runs first-time setup again. **Local account, no
   Microsoft account**: at the account screen press `Shift+F10` and run
   `start ms-cxh:localonly` (older builds: `oobe\bypassnro`, reboot, then
   "I don't have internet").
4. Let Windows Update run to completion now, so gate day isn't fighting it.
   OEM/Acer preloads may reinstall themselves — that's fine; a stranger's PC
   has those too.
5. Install **nothing else**. No Node, no Git, no editors — the entire value
   of this machine is that it's a stranger's PC. Edge is the browser a
   stranger would have; use it.
6. Settings → System → Power: set lid-close action to **Do nothing** (plugged
   in), so the machine can sit closed on a shelf between uses.
7. Note the machine name and LAN IP in the gate-day evidence notes.

Activation: the digital license is tied to the hardware; reset (and even a
later clean USB install) re-activates automatically.

## Phase 1b — Booting install media on a locked-down Acer BIOS

Only Ubuntu needs a USB stick (Ubuntu Server 24.04 ISO via Rufus). Two ways
to boot it, in order of preference:

- **No BIOS at all:** in Windows, Settings → System → Recovery → **Advanced
  startup → Restart now** → **Use a device** → pick the USB. This works even
  when the BIOS hides everything.
- **BIOS route (F2 at the Predator logo):** Acer disables the F12 boot menu
  by default — enable **F12 Boot Menu** under the Main tab. If options are
  greyed out, set a **Supervisor Password** under Security first (Acer hides
  settings until one exists) — write it down; losing it bricks BIOS access.

Leave Secure Boot **on** (Windows wants it; Ubuntu 24.04 supports it). If a
"power on after AC loss" option exists anywhere, enable it for relay duty;
most laptops lack it and the battery covers short outages.

**Stop here.** Gate day itself runs from
[gate-day-checklist.md](./gate-day-checklist.md) — artifacts, licenses, and
runbooks all come prepared from the dev machine on a USB stick.

## Phase 2 — Act 2: Ubuntu Server 24.04 on disk 2 (the relay host)

Do this after gate day if possible (gate day wants exclusive use of the
machine; the relay wants to never be rebooted casually once live).

1. Boot the Ubuntu Server USB (F12). In **Guided storage**, choose **the
   other disk** — the one without Windows. Do not touch disk 1. Skip LVM
   encryption (the box must boot unattended after power loss).
2. Check **Install OpenSSH server** during setup. Create user `bellfield`.
3. First-boot configuration (wired Ethernet plugged in):

   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y unattended-upgrades
   # Lid closed, keep running:
   sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
   sudo systemctl restart systemd-logind
   # The relay needs zero GPU; keep the RTX asleep:
   echo 'blacklist nouveau' | sudo tee /etc/modprobe.d/blacklist-nouveau.conf
   sudo update-initramfs -u
   # Docker Engine + compose plugin (official convenience script):
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker bellfield
   ```

4. Give the box a DHCP reservation on the router (stable LAN IP for SSH).
5. Reboot once, lid closed, and confirm it stays up and SSH-able.

GRUB's os-prober will list Windows in its boot menu; the BIOS F12 menu also
switches disks. Default boot should be Ubuntu — relay duty is the resting
state; Windows is the occasional gate-day guest.

## Phase 3 — Relay stack deployment (scripted; not hand-typed)

The deployment artifacts live in the repo under [deploy/relay/](../deploy/relay/):
`compose.yaml` (relay + pinned Postgres 16.6 + pinned cloudflared, built from
`apps/relay/Dockerfile`), `relay-host.env.example` (every secret the box
needs), and `backup-relay-db.sh` (nightly off-box `pg_dump` for cron). The
image build and containerized boot were verified locally on 2026-06-11.

On the relay host:

```bash
git clone https://github.com/ItsRobDude/BellField.git ~/bellfield
cd ~/bellfield/deploy/relay
cp relay-host.env.example relay-host.env   # fill in every CHANGE_ME
docker compose up -d --build
curl http://127.0.0.1:3201/health           # expect status ok
```

Then, in order: confirm `https://relay.bellfield.app/health` answers through
the tunnel; create the Resend webhook pointing at
`https://relay.bellfield.app/webhooks/resend` and put its signing secret in
`relay-host.env` (restart the relay container); add the backup script to
cron with an off-box target; point an external uptime monitor at the health
URL; issue the pilot shop + relay token with the relay-admin CLI
(`docker compose exec relay node dist/apps/relay/src/cli/relay-admin.js ...`)
and smoke an end-to-end estimate send from a real install.

Prerequisites already satisfied (2026-06-11): `bellfield.app` is a verified
sending domain in the dedicated BellField Resend account; DNS is on
Cloudflare with API access.
