# Shared Agent Tooling

BellField's reusable workflows and checks live in this repository. Humans and
CLI-capable assistants use the same commands; no hosted service, API key, or MCP
server is needed for these tools.

## Gate Day Skills

Choose the workflow that matches the requested work:

| Skill                        | Shared procedure                                     | Purpose                                                                              |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `gate-review`                | [Review](./agent-workflows/gate-review.md)           | Inspect saved evidence and explain what ran, failed, or remains unproven.            |
| `bellfield-gate-repair`      | [Repair](./agent-workflows/gate-repair.md)           | Reproduce and correct an authorized Gate Day defect with a focused regression check. |
| `bellfield-gate-preparation` | [Preparation](./agent-workflows/gate-preparation.md) | Prepare and verify release artifacts and USB media when that work is requested.      |

The procedures own the instructions. Thin `SKILL.md` entrypoints in
`.agents/skills/` serve Codex; `.claude/skills/` serves Claude Code. Grok can discover
the same skills through its compatible agent/Claude skill discovery. The entrypoints refer to the same procedures
and do not contain separate copies of the workflow. Do not install a second copy
under `.grok/skills/` merely to expose the same skills again.

Open a new agent session after adding skills if its current skill catalog is
already loaded. Grok's `grok inspect --json` can show discovered skills; inspect
only skill names and origins when sharing that output, since the broader
configuration can contain private settings. Other clients can read the linked
procedures directly and invoke the commands below.

Review, repair, and preparation are distinct scopes, not mandatory approval
round trips. Follow the user's existing authorization. A review-only request does
not authorize code changes, publishing, service operations, or writing USB media.
An explicit combined request can proceed through its authorized stages.

## Documentation Checks

```powershell
pnpm check:docs
pnpm --silent check:docs -- --json
```

The checker validates local Markdown destinations and anchors, and checks package
script examples in designated current documentation. It does not fetch remote
links, execute examples, or determine whether a product claim is factually current.
Historical reports retain their original commands; they are evidence of those
runs, not current execution recipes.

The current command-document list is in
[the command checker](../tools/docs/commands.mjs). Other Markdown files can opt
in with `<!-- bellfield-docs:check-commands -->`. Unsupported command syntax is
reported as not checked. Script-name checks do not validate every argument or
environment prerequisite. Use `--silent` when consuming JSON through pnpm to
avoid package-runner output around the result.

Run this after changing navigation, headings, package scripts, or skill references.
CI runs the same check. A failure should be resolved in the owning document or
command; do not weaken the checker simply to preserve a stale reference.

## Saved Evidence Inspection

```powershell
pnpm evidence:review -- --root <evidence-directory>
pnpm --silent evidence:review -- --root <evidence-directory> --json
```

Supply a specific evidence directory, such as one dated validation packet or a
Gate Day evidence directory. The inspector reads supported smoke JSON and
Gate Day/updater JSONL and reports each observed run separately. It does not run
the checks again, write into the packet, contact services, or repair evidence.

Use the report to locate the first observed failure, missing terminal events or
referenced sidecars, skipped checks, and timing gaps. Follow the cited source
files to investigate. Facts and missing evidence are not a root-cause diagnosis.
An updater rejection may be the expected result of an expired-window test.
Gate coverage lists observed and unobserved runner modes for Gates 1-4; absence
means only that the mode was not observed in this packet. Manual/external Gate 5
evidence is not assessed by this parser.

Source commits and artifact identity are reported only when present. Missing
metadata stays unknown. A smoke that passed its selected checks while skipping
runtime boot remains that narrower result. Neither a successful inspection nor
a historical passing run qualifies the current release or closes a hardware gate.

The inspector emits selected summary fields and redacts known secret forms. It
does not print raw command lines, stdout/stderr, arbitrary payloads, or sidecar
contents. Keep raw packets private and review summaries before sharing them.
Symlinks and paths outside the supplied packet are not followed. Bounded reads
report incomplete coverage when limits are reached; narrow the input directory
or inspect oversized source files separately instead of treating a partial
inspection as complete. Defaults are 250 JSON/JSONL files, 2 MiB per file, 16 MiB
total, 2,000 directory entries, depth 12, and 10,000 records. The JSON report
includes these limits and any coverage gaps. Unknown formats are counted as
unsupported, not treated as passing evidence.

Exit codes:

- `0`: supported records were reviewed without detected failures or integrity
  issues. Skipped work, unobserved gates, and unknown provenance can remain;
  this is not a release-readiness verdict.
- `1`: observed evidence needs attention, such as a failed or incomplete run.
- `2`: invalid usage or a filesystem read error prevented inspection.

## Maintenance

Run `pnpm test:tools` after changing these scripts. Their regression tests use
disposable fixtures; they do not need a running BellField database or services.
Keep helper logic independent of the assistant. If another interface is later
needed, adapt these commands instead of implementing a second evidence parser.

The [validation playbook](./validation-playbook.md) owns validation policy. The
[Gate Day checklist](./gate-day-checklist.md), [USB preflight
checklist](./release-usb-preflight-checklist.md), and current install/restore
runbooks retain authority over their operational procedures.
