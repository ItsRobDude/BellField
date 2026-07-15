# Research Pass Log

The **single registry** for BellField competitive/observation research passes,
so passes are attributable and **never confused between agents** (Claude vs.
Codex vs. unrecorded legacy work). It records who ran what, when, by which
method, and where the prompts live. It is an index, not a findings doc, and it
does not change product direction or implementation order.

> Merged 2026-07-14: this file absorbed `competitive-research-log.md` (created
> the same day by the Codex pass). Its pass-ID scheme was adopted; that file is
> now a pointer stub.

## Pass IDs And Naming

Use `BF-COMP-<COMPARATOR>-<YYYY-MM-DD>-<LEAD>-<SEQUENCE>` (scheme from the
Codex 2026-07-14 pass). `CODEX` means OpenAI Codex; `CLAUDE` means Anthropic
Claude. A lead label must never be relabeled to a different agent. Artifact
filenames should include the date and, when practical, the lead identity.

## Attribution Convention (required for every future pass)

Every research/observation pass doc must open with an **Attribution** table:

| Field          | Meaning                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| Operator agent | Which AI agent ran the pass (e.g., Claude via Claude Code; Codex; human) |
| Model          | Exact model id (e.g., `claude-fable-5`)                                  |
| Date           | Pass date (absolute)                                                     |
| Requested by   | Who commissioned it                                                      |
| Pass type      | Scored rubric rerun / gap analysis / design audit / smoke, etc.          |
| Prompts        | Where the verbatim operator prompt and any subagent prompts are recorded |

## Registry Rules

- Every new pass gets a unique pass ID, local date, lead identity, method, and
  prompt record (sub-agent prompts included when parallel analysis is used).
- **Never infer a legacy pass's author** from writing style; use
  "not recorded" / pre-convention instead.
- A scored snapshot remains historical after a newer pass; do not silently
  rewrite its score against later product state.
- A comparison pass **measures BellField; it does not steer** — product rules
  and milestone plans remain authoritative
  ([positioning-and-pricing.md](./positioning-and-pricing.md)).

## Evidence Standard (owner rule, set 2026-07-14)

Competitor claims must come from **observing the real product** (a live
logged-in tenant walk, a real device, a real install) — never from marketing
pages, feature-page copy, or third-party review/pricing aggregators. If the
primary source is unavailable, the pass **stops and says so** instead of
substituting weaker evidence. Precedent: the Claude 2026-07-14 pass's first
attempt used ServiceTitan's public pages when the tenant session appeared
expired; the owner rejected it and the pass was redone the same day against
the logged-in tenant from the second machine's Chrome. Vendor help-center
workflow documentation may corroborate a tenant observation but must not be
the sole evidence for a competitive claim.

## Agent Lanes (disambiguation)

- **Claude (Claude Code, Anthropic)** — competitive comparison and research
  passes, code audits, implementation. Pass docs:
  `fsm-gap-analysis-*.md` family.
- **Codex (OpenAI)** — clean-machine gate-day install/restore/update operation
  under [codex-install-test-operator-rules.md](./codex-install-test-operator-rules.md)
  (evidence: `gate-day-clean-windows-smoke-*.md`), and, as of 2026-07-14,
  competitive research passes (`fsm-comparison-*-codex-*.md`).

## Pass Registry

| Pass ID                           | Date       | Artifact                                                                                                                 | Pass type / method                                                                                           | Lead / model                               | Prompts recorded       |
| --------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------- |
| `BF-COMP-ST-2026-06-LEGACY-01`    | 2026-06    | [fsm-comparison-servicetitan-2026-06.md](./fsm-comparison-servicetitan-2026-06.md)                                       | Scored rubric comparison                                                                                     | Not recorded (pre-convention)              | No                     |
| `BF-COMP-ST-2026-06-10-LEGACY-01` | 2026-06-10 | [fsm-comparison-servicetitan-2026-06-10.md](./fsm-comparison-servicetitan-2026-06-10.md)                                 | Scored rubric comparison (live tenant + repo)                                                                | Not recorded (pre-convention)              | No                     |
| `BF-COMP-ST-2026-06-12-LEGACY-01` | 2026-06-12 | [fsm-comparison-servicetitan-2026-06-12.md](./fsm-comparison-servicetitan-2026-06-12.md)                                 | Scored rubric comparison (live tenant walk) — **latest official score**, historical product state            | Not recorded (pre-convention)              | No                     |
| `BF-COMP-ST-2026-07-14-CODEX-01`  | 2026-07-14 | [fsm-comparison-servicetitan-2026-07-14-codex-deep-pass.md](./fsm-comparison-servicetitan-2026-07-14-codex-deep-pass.md) | Qualitative deep-systems pass (live tenant walk + repo inspection + 3 sub-agents; no rescore by design)      | **OpenAI Codex**, primary agent `/root`    | Yes — in the doc       |
| `BF-COMP-ST-2026-07-14-CLAUDE-01` | 2026-07-14 | [fsm-gap-analysis-2026-07-14.md](./fsm-gap-analysis-2026-07-14.md)                                                       | Gap analysis + design self-audit (live tenant walk + 4 code-audit subagents; indicative rescore A≈78 / B≈94) | **Claude** (Claude Code), `claude-fable-5` | Yes — Appendices A & B |

## 2026-07-14 Sibling Passes (reconciliation note)

The two 2026-07-14 passes were commissioned in parallel with mirror-image
prompts and run independently. Where their ServiceTitan tenant observations
overlap (accounting batches/export log, accounting periods, replenishment, PO
partial-receipt statuses, returns, counts), they **agree on every point** —
independent replication on the same tenant. Headline unique finds:
Claude — the invoice $0-tax inheritance bug, agreement pricing modeled but
never applied, double-submit duplicates, the bookkeeping 50-row cap, and
S/M/L reuse sizing per gap; Codex — the partial-receipt UI capturing
quantities the backend discards, historical reports joining live customer
names, permission-unaware Dispatch startup stranding, equipment custody via
mutable label text, and the hard-delete-vs-money-immutability doc conflict.
Their recommended non-goals (no GL, no payroll engine, no report builder, no
density cloning) match. Consensus priorities live in each doc; the rubric's
stale out-of-scope list both passes flagged was fixed in rubric v2.1.
