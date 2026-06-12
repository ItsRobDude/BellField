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

## Phase 0 — Prep on the dev PC (before touching the laptop)

- [ ] Two USB sticks (8GB+), or one reused between acts:
  - Windows 11 installer — Microsoft Media Creation Tool
  - Ubuntu Server 24.04 LTS — write the ISO with Rufus or balenaEtcher
- [ ] Confirm nothing on the laptop needs saving (both disks get wiped).
- [ ] Optional but smart while the bottom panel is off someday: battery
      swelling check. A healthy battery is the relay's free built-in UPS.

## Phase 1 — One BIOS visit (F2 at the Predator logo)

- [ ] **Storage mode: if the two NVMe drives are in RAID 0, break the array
      and set the controller to AHCI/non-RAID.** Some PT515-51 units shipped
      striped; Ubuntu needs the disks individually, and changing this after
      Windows is installed breaks its boot. If the drives already show as two
      separate 1TB disks, change nothing.
- [ ] Leave Secure Boot **on** (Windows 11 wants it; Ubuntu 24.04 supports it).
- [ ] Note F12 is the one-time boot menu — it is how you pick Windows vs
      Ubuntu later, and how you boot the USB now.
- [ ] If a "power on after AC loss" or wake-on-AC option exists, enable it
      (relay duty); many laptops lack it — the battery covers short outages.

## Phase 2 — Act 1: Windows 11 on disk 1 (the scratch machine)

1. Boot the Windows USB (F12). Custom install → delete every partition on
   **one** disk → install there. (Both disks are being repurposed, so disk
   mix-ups at this stage are harmless — whichever disk Windows lands on is
   "disk 1" from now on.)
2. **Local account, no Microsoft account** (it's a scratch machine):
   at the account screen press `Shift+F10` and run `start ms-cxh:localonly`
   (older builds: `oobe\bypassnro` then reboot and choose "I don't have
   internet").
3. Let Windows Update run to completion now, so gate day isn't fighting it.
4. Install **nothing else**. No Node, no Git, no editors — the entire value
   of this machine is that it's a stranger's PC. Edge is the browser a
   stranger would have; use it.
5. Settings → System → Power: set lid-close action to **Do nothing** (plugged
   in), so the machine can sit closed on a shelf between uses.
6. Note the machine name and LAN IP in the gate-day evidence notes.

**Stop here.** Gate day itself runs from
[gate-day-checklist.md](./gate-day-checklist.md) — artifacts, licenses, and
runbooks all come prepared from the dev machine on a USB stick.

## Phase 3 — Act 2: Ubuntu Server 24.04 on disk 2 (the relay host)

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

## Phase 4 — Relay stack deployment (scripted; not hand-typed)

Owned by the relay deployment work, not this page: a Dockerfile and compose
file for `apps/relay` + Postgres 16 + cloudflared (to be added to the repo),
the Cloudflare Tunnel (created via API; the tunnel token is the only secret
pasted on the box besides the relay env), `BELLFIELD_RELAY_RESEND_API_KEY`
from the dedicated BellField Resend account, the Resend webhook (created only
once `relay.bellfield.app` resolves; its signing secret goes into the relay
env), the nightly off-box `pg_dump`, and the external uptime monitor on
`/health`. The pilot shop + relay token are then issued with the relay-admin
CLI and the end-to-end send is smoked from a real install.

Prerequisites already satisfied (2026-06-11): `bellfield.app` is a verified
sending domain in the dedicated BellField Resend account; DNS is on
Cloudflare with API access.
