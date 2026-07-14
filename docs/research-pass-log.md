# Research Pass Log

A registry of every competitive/observation research pass run against
BellField, so passes are attributable and **never confused between agents**
(e.g., Claude vs. Codex). This log records who ran what, when, and where the
prompts live. It is an index, not a findings doc.

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

Passes missing attribution are marked **pre-convention** below rather than
guessed.

## Agent Lanes (disambiguation)

- **Claude (Claude Code)** — competitive comparison and research passes, code
  audits, implementation. This log's convention originates with Claude's
  2026-07-14 pass.
- **Codex** — clean-machine gate-day install/restore/update operation from a
  prepared USB, under [codex-install-test-operator-rules.md](./codex-install-test-operator-rules.md).
  Its evidence lives in the `gate-day-clean-windows-smoke-*.md` family. Codex
  has not authored comparison/research passes to date.

## Passes

| Date       | Doc                                                                                      | Pass type                                                               | Operator agent / model                                                                                         | Prompts recorded                  |
| ---------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 2026-06-08 | [fsm-comparison-servicetitan-2026-06.md](./fsm-comparison-servicetitan-2026-06.md)       | Scored rubric comparison                                                | Pre-convention — operator identity not recorded in the doc                                                     | No                                |
| 2026-06-10 | [fsm-comparison-servicetitan-2026-06-10.md](./fsm-comparison-servicetitan-2026-06-10.md) | Scored rubric comparison                                                | Pre-convention — operator identity not recorded in the doc                                                     | No                                |
| 2026-06-12 | [fsm-comparison-servicetitan-2026-06-12.md](./fsm-comparison-servicetitan-2026-06-12.md) | Scored rubric comparison (live ST tenant walk)                          | Pre-convention — operator identity not recorded in the doc; method text indicates a Chrome-assisted AI session | No                                |
| 2026-07-14 | [fsm-gap-analysis-2026-07-14.md](./fsm-gap-analysis-2026-07-14.md)                       | Gap analysis + design self-audit (accounting, inventory, workflows, UX) | **Claude** (Claude Code), model `claude-fable-5` (Claude Fable 5)                                              | Yes — Appendices A & B of the doc |
