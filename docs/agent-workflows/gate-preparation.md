# Gate Day preparation

Use this when the user requests a new or refreshed BellField Gate Day USB kit.
Prepare from the chosen fix set after its review/repair is complete. When the
user requests review, repair, and preparation together, complete those stages
in order without requiring a separate conversation or repeated approval.
A request merely to review results does not authorize changing the kit.

The [USB preflight checklist](../release-usb-preflight-checklist.md) owns the
complete build/packaging contract. The [install runbook](../install-runbook.md),
[Gate Day checklist](../gate-day-checklist.md), and
[release operator route](../release-operator-route.md) own current commands.
Read the applicable sections before running them; this workflow avoids copying
versioned commands or machine-specific paths into another source of truth.

## Establish source and destination

Inspect branch, exact commit, dirty state, and relevant PR/check status. Record
which source is selected for each artifact. Release assembly requires a clean,
committed source; preserve unrelated dirty work in its checkout and use a
suitable clean checkout if needed. Do not silently label a diagnostic dirty
build as the next qualification artifact.

Locate the actual staging and physical USB roots. Inspect existing layout and
space before writing. Preserve earlier run evidence, licenses, and private
configuration; do not print their contents. Discover artifact/rerun identifiers
from current evidence and the intended test, rather than reusing old labels.

## Build and validate

Follow the preflight checklist's source checks for the chosen final commit and
the current required CI checks. Run source checks once per unchanged source,
then artifact checks separately for each final ZIP. A local smoke cannot stand
in for a hosted check or clean-machine proof; record any unavailable check.

Build the active clean-install/update pair with the selected Node, complete
PostgreSQL tree, VC++ runtime, and WinSW inputs using the repository release
builder. Include dependencies before signing; post-sign copying invalidates
the manifest. Use `pnpm package:release-zip` and prove the final ZIP with
`pnpm smoke:release-zip` and `--require-gate-day-deps=true` as specified by the
checklist. Record source identity, artifact hashes, and smoke evidence per ZIP.
Credential and signing-key values stay out of generated reports and logs.

Validate the runner-first `gate1-prepare-release` and
`gate3-prepare-update-artifact` paths in disposable local roots before handing
off the kit. Raw extraction alone does not prove staged extraction, signature
verification, or the strict runner route. Do not install services or execute a
destructive scratch-machine gate merely as part of USB packaging.

## Stage and verify the physical kit

Assemble current docs, packaged tools, active artifacts, build evidence, and
fresh rerun templates. Keep historical failures separately identifiable.
Use the [checkoff template](../release-usb-preflight-checkoff-template.md).

Update START-HERE from the current checklist, including prerequisite docs,
first-owner/browser actions, and the Gate 4 expired-window refusal sequence.
Anchor artifact and license paths from the actual `$UsbRoot`. Validate it with
`pnpm usb:validate-start-here --path=<START-HERE.txt>`. A passing command validator
does not qualify later manual/device/relay steps or prove they were attempted.

Retain the normal `licenses/` and `secrets-not-included/` layout where present.
Keep private relay configuration in its designated private location. Regenerate
`SHA256SUMS.txt` after the final immutable change, excluding mutable `evidence/**`
and `private-relay-config/**` as the current preflight contract requires.
Check generated JSON for parse failures and generated docs/evidence for BOMs,
control characters, and secret exposure without echoing detected values.

Verify staging with the hash helper, then copy to the intended physical USB and
verify that physical root independently. Verify expected files remain readable
after reinsertion when the human operator can perform it. Do not equate staging
verification with physical-media verification.

When cleanup is requested or needed for space, identify exact superseded roots
and preserve durable evidence first. Remove them only after the new physical
kit verifies; never delete licenses, private configuration, or retained evidence
through a broad wildcard cleanup. Likewise stop and remove only smoke processes
and temporary paths owned by this preparation.

## Handoff

Report the source commit(s), active artifact pair and hashes, source/artifact
checks, runner preparation results, staging and physical verification, preserved
evidence, and changed next-test instructions. State ready/not-ready with any
remaining prerequisite or physical action, and distinguish kit readiness from
passed product gates. Publishing to a relay or running the clean-machine gates
requires that action to be in the user's scope; USB preparation alone does not
add it.
