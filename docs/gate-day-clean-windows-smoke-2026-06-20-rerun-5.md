# Gate Day Clean Windows Smoke - 2026-06-20 Rerun 5

This records the fifth fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-5-2026-06-21.md`,
`evidence/command-log-rerun-5.txt`,
`evidence/service-account-diagnostic-rerun-5.json`, and
`evidence/cleanup-rerun-5.txt`. This repo doc is the sanitized, durable
summary.

Status: **failed at the required pre-service diagnostic**.

## Artifact Set

- Clean install artifact:
  `bellfield-v0.0.1-gateday.20260621.9.zip`
  - version: `0.0.1-gateday.20260621.9`
  - release date: `2026-06-21`
  - source commit: `a90d3d3`
  - SHA256:
    `402E3E6E48D1552559B83C9D1BDAAE7E523FB0F6B0E8AB4A18D24FC0A58EFE47`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260621.10.zip`
  - version: `0.0.1-gateday.20260621.10`
  - release date: `2026-06-21`
  - source commit: `a90d3d3`
  - SHA256:
    `8AF20D211C7B7684D5011BBC853BBBC5EAB3237E74E4974D83E4657CE9814DEE`
- Valid license: `bellfield-license.json`
- Expired-window license: `bellfield-license-EXPIRED.json`

## Scratch Machine Baseline

- Machine: `NONNA`
- OS: Microsoft Windows 11 Home `10.0.26200`, build `26200`, 64-bit
- PowerShell in diagnostic: Windows PowerShell `5.1.26100.8115`
- Operator state: Codex was not elevated; human approved UAC for the elevated
  diagnostic and cleanup commands
- Network: Wi-Fi `192.168.50.131`
- USB drive letter on the scratch machine: `D:`
- `C:\BellField` was absent before extraction
- No disallowed developer tooling was found on `PATH` for:
  `node`, `git`, `psql`, `pnpm`, `npm`, `yarn`, `bun`, `docker`, or `code`
- Required USB files were present, including `START-HERE.txt`, runbooks,
  active artifacts, licenses, hash list, and private relay config

## What Passed

Run #5 confirmed the rebuilt `.9` and `.10` artifacts were present and
extractable, but it did not reach service installation or product runtime
validation.

- Active artifact hashes matched `SHA256SUMS.txt`.
- The old `.7`/`.8` active artifacts and failed-run payload directories were no
  longer used as active inputs.
- Artifact `.9` extracted to `C:\BellField` using Windows built-in `tar.exe`.
- Required release paths existed after extraction:
  - `C:\BellField\release`
  - `release\postgres\bin`
  - `release\postgres\lib`
  - `release\postgres\share`
  - `release\postgres\bin\vcruntime140.dll`
  - `release\postgres\bin\vcruntime140_1.dll`
  - `release\postgres\bin\msvcp140.dll`
  - `release\tools\winsw\WinSW-x64.exe`
- The elevated diagnostic installed its temporary service and enabled
  `sc.exe sidtype bellfield-postgres unrestricted`.
- The primary virtual-account SCM configuration succeeded without a password:

  ```text
  sc.exe config bellfield-postgres obj= "NT SERVICE\bellfield-postgres"
  [SC] ChangeServiceConfig SUCCESS
  ```

- `Win32_Service.StartName` read back as
  `NT SERVICE\bellfield-postgres`.
- The temporary service started successfully.
- The probe process reported its user as
  `nt service\bellfield-postgres` with SID
  `S-1-5-80-4194814784-1159710727-623202374-3290837714-3346611570`.
- The probe wrote successfully to a directory ACL'd only for the service
  identity plus Administrators/SYSTEM:

  ```json
  {
    "serviceSidPresent": false,
    "aclWriteSucceeded": true,
    "aclWriteError": null
  }
  ```

- Diagnostic cleanup uninstalled the temporary service and reported
  `artifactsRemoved: true`.
- Closeout cleanup removed `C:\BellField` and `C:\ProgramData\BellField`.
- Cleanup verification found no remaining `bellfield-*` Windows services.

## What Failed

The required pre-service diagnostic returned exit code 1 and stopped Gate 1
before `write-server-config.mjs`, PostgreSQL provisioning, migrations, license
placement, service rendering, or service installation.

The final diagnostic result was:

```json
{
  "result": "failed",
  "recommendedAccount": null,
  "error": "Cannot bind argument to parameter 'Arguments' because it is an empty string."
}
```

The only recorded candidate test was `virtualAccountNoPassword`:

```json
{
  "account": "NT SERVICE\\bellfield-postgres",
  "passwordMode": "omit",
  "scConfig": {
    "exitCode": 0,
    "output": "[SC] ChangeServiceConfig SUCCESS"
  },
  "startName": "NT SERVICE\\bellfield-postgres",
  "startNameMatches": true,
  "startSucceeded": true,
  "serviceStateAfterStart": "Running",
  "probeOutputFound": true,
  "passed": false
}
```

The diagnostic marked that candidate failed because it computed
`serviceSidPresent` only from `whoami /groups`, and this Windows 11 Home build
did not list `NT SERVICE\bellfield-postgres` as a group. It did, however, show
the service virtual account as the process user and the SID-only ACL write
succeeded.

After that candidate was marked failed, the script moved into the
`virtualAccountEmptyPasswordCompatibility` branch. That branch appends an
empty string to the `sc.exe config` argument array. PowerShell rejected the
empty string before `sc.exe` ran:

```text
Cannot bind argument to parameter 'Arguments' because it is an empty string.
```

Because the script threw there, it did not record the compatibility test, did
not test `LocalService`, and never produced a `recommendedAccount`.

## Diagnosis

Run #5 moved the proof line again. It did **not** prove the install path is
ready, but it did strongly suggest the preferred virtual account path works
better than the diagnostic currently admits.

Evidence in favor of `NT SERVICE\bellfield-postgres` on this machine:

- Windows SCM accepted the account with no `password=` argument.
- `StartName` read back exactly as `NT SERVICE\bellfield-postgres`.
- The service started.
- The running process user was `nt service\bellfield-postgres`.
- A write to a SID-only ACL path succeeded.
- Cleanup removed the temporary service and diagnostic artifacts.

Evidence against the current diagnostic implementation:

- It treats absence of the service-specific SID in `whoami /groups` as a hard
  failure even when `whoami /user` is the service virtual account itself.
- It does not appear to normalize the virtual-account proof separately from
  the `LocalService` fallback proof. For the preferred virtual account, the
  service SID can be the user SID; for `LocalService`, the service-specific SID
  has to be proven as an added service SID/group or by the SID-only ACL write.
- Its empty-password compatibility branch is not safe in Windows PowerShell
  because the mandatory `[string[]]$Arguments` parameter rejects an empty string
  before `sc.exe` can receive it.

This failure is therefore different from run #4. Run #4 proved WinSW XML was
not enough to set the installed SCM account. Run #5 proved SCM can set the
virtual account on the scratch machine, but the diagnostic's pass/fail logic
and compatibility branch need repair before another artifact can honestly claim
the service-account blocker is closed.

## Operator Hiccups And Complaints

| Category           | Severity | Step                              | What happened                                                                                                                                                      | Follow-up                                                                                                                                                              |
| ------------------ | -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| runbook-ambiguity  | minor    | Diagnostic command                | `START-HERE.txt` said the diagnostic should clean up its temporary service, while `install-runbook.md` showed the example with `-KeepArtifacts`.                   | Make cleanup the default gate command. Document `-KeepArtifacts` only as a diagnostic/forensics option when an operator intentionally wants residue for inspection.    |
| elevation-friction | minor    | Elevated diagnostic capture       | Codex was not elevated. The operator had to launch an elevated PowerShell through UAC and still capture JSON back to the USB evidence file.                        | Add a copyable non-elevated wrapper command for `Start-Process -Verb RunAs` that writes stdout/stderr to the evidence path and preserves the elevated exit code.       |
| diagnostic-bug     | blocking | Empty-password compatibility test | The script appended `""` to `Invoke-ScCommand -Arguments`; PowerShell rejected the empty string before `sc.exe` could run.                                         | Do not pass empty string arguments through a mandatory `[string[]]` parameter, or explicitly allow empty strings and prove the resulting `sc.exe` behavior in the log. |
| proof-model        | blocking | Service SID check                 | `whoami /user` showed the service virtual account and SID-only ACL write succeeded, but `serviceSidPresent=false` because `whoami /groups` lacked the service SID. | Split virtual-account proof from `LocalService` proof. For the virtual account, accept matching user SID/name plus ACL write; for fallback, require service SID proof. |
| evidence-hygiene   | minor    | Evidence template status          | The top of the USB evidence file still said `Status: not started`; the true failed status was recorded later in appended closeout notes.                           | Update the active evidence checklist/status in place during the run, then append detailed notes below it.                                                              |
| gate-discipline    | good     | Stop decision                     | The run stopped before manually working around the diagnostic failure.                                                                                             | Keep this discipline. A manual service-account edit or patched release file would be diagnostic only, not a clean Gate 1 pass.                                         |

## Recommended Fix

Fix the packaged diagnostic before rebuilding artifacts:

1. For `virtualAccountNoPassword`, treat the preferred virtual account as
   proven when all of these hold:
   - `sc.exe config ... obj= "NT SERVICE\bellfield-postgres"` succeeds with no
     `password=` argument.
   - `Win32_Service.StartName` reads back as
     `NT SERVICE\bellfield-postgres` or the exact normalized equivalent.
   - The service starts.
   - The probe's `whoami /user` name or SID matches the expected service
     virtual account.
   - The SID-only ACL write succeeds.
2. Keep `whoami /groups` service-SID proof as a separate signal, especially for
   `LocalService`, but do not make the preferred virtual-account path fail only
   because this Windows build does not list the service SID as a group.
3. Fix or remove the empty-password compatibility branch. The primary path
   should stay no-password; any compatibility branch must not crash the whole
   diagnostic before fallback testing.
4. Keep production install strict: `install-windows-services.ps1` should still
   configure the SCM account, read back `StartName`, enable the service SID,
   apply ACLs, and fail before `Start-Service` if the installed account is
   wrong.
5. Clarify the runbook command: default diagnostic runs should clean up. Use
   `-KeepArtifacts` only for an explicitly diagnostic residue-preserving run.
6. Rebuild `.11`/`.12` or the next active artifact pair after the diagnostic
   fix, refresh USB hashes, and rerun Gate 1 from a cleaned scratch machine.

Do not treat artifact `.9` as a passed install artifact. The product install
was stopped before config, provisioning, migration, service registration,
first-owner setup, reboot survival, backup/restore, update, or relay gates.

## Result

Gate 1 remains open. Rerun #5 proved:

- the `.9`/`.10` artifact hashes and extraction path were sound;
- the packaged elevated diagnostic ran on Windows 11 Home;
- Windows SCM accepted `NT SERVICE\bellfield-postgres` with no password;
- the service process ran as that virtual account;
- SID-only ACL write succeeded;
- diagnostic cleanup and scratch-machine cleanup completed.

Gates 2 through 5 were not reached.
