# Competitive Research Log

This registry identifies BellField competitive-research passes without changing product direction or implementation order. Product rules and milestone plans remain authoritative.

## Authorship rules

- Every new pass gets a unique pass ID, local date, lead identity, method, and prompt record.
- Record sub-agent task names when parallel analysis is used.
- Never infer a legacy pass's author from writing style. Use `not recorded` when provenance is absent.
- A scored snapshot remains historical after a newer pass. Do not silently rewrite its score against later product state.
- A comparison pass measures BellField; it does not authorize work from a later milestone.

## Pass registry

| Pass ID                           | Date       | Lead                                | Method                                                                                            | Artifact                                                                                       | Status                                             |
| --------------------------------- | ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `BF-COMP-ST-2026-06-LEGACY-01`    | 2026-06    | Not recorded                        | Repository and ServiceTitan comparison                                                            | [Initial June comparison](./fsm-comparison-servicetitan-2026-06.md)                            | Historical; authorship not recorded                |
| `BF-COMP-ST-2026-06-10-LEGACY-01` | 2026-06-10 | Not recorded                        | Live-tenant and repository comparison                                                             | [June 10 comparison](./fsm-comparison-servicetitan-2026-06-10.md)                              | Historical; authorship not recorded                |
| `BF-COMP-ST-2026-06-12-LEGACY-01` | 2026-06-12 | Not recorded                        | Live-tenant and repository scored comparison                                                      | [June 12 scorecard](./fsm-comparison-servicetitan-2026-06-12.md)                               | Latest scored snapshot; product state is now stale |
| `BF-COMP-ST-2026-07-14-CODEX-01`  | 2026-07-14 | OpenAI Codex, primary agent `/root` | Read-only Chrome observation, repository inspection, official sources, and three Codex sub-agents | [July 14 Codex deep-systems pass](./fsm-comparison-servicetitan-2026-07-14-codex-deep-pass.md) | Current qualitative deep pass                      |

## Naming convention

Use `BF-COMP-<COMPARATOR>-<YYYY-MM-DD>-<LEAD>-<SEQUENCE>`. Artifact filenames should include the date and lead identity when practical. `CODEX` means OpenAI Codex; it must not be relabeled as Claude, Anthropic, or an unspecified agent.
