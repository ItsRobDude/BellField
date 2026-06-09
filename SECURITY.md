# Security Policy

BellField is a self-hosted field-service platform. Customers run it on their own
hardware and own their own data, so security matters both in the code we ship and
in the guidance we give for running it safely.

## Supported Versions

BellField is pre-1.0 and under active development. Security fixes target the
**latest released build**. There is no long-term-support branch yet; once the
self-hosted pilot and update path exist (Milestone 11), this section will define
which builds receive security updates and for how long.

## Reporting a Vulnerability

**Please do not report security issues through public GitHub issues, pull
requests, or discussions.**

Instead, report privately by email to:

> `security@bellfield.app`

For normal product support or setup questions, use `support@bellfield.app`.
The security inbox is reserved for vulnerabilities and sensitive reports.

Please include, where possible:

- a description of the issue and its impact
- the component affected (API, office web, field app, worker, installer)
- steps to reproduce, or a proof of concept
- any relevant logs, configuration, or version/build information
- whether the issue is already public

We will acknowledge your report, work to confirm and reproduce it, and keep you
updated as we investigate. As a small team, we ask for reasonable time to
remediate before any public disclosure, and we are grateful for coordinated,
good-faith reporting.

## Scope

In scope:

- the BellField API, office web app, field mobile app, and worker
- the installer and update mechanism (once they exist)
- handling of credentials, sessions, media tokens, and customer business data

Out of scope (these are the operator's responsibility, consistent with the
self-hosted support boundary in
[docs/self-hosted-installation-strategy.md](docs/self-hosted-installation-strategy.md)):

- hardening of the customer-owned server OS, network, or physical access
- third-party dependencies' own infrastructure
- social engineering of the customer's staff

## Handling Sensitive Data in Reports

BellField stores real business records (customers, jobs, invoices, media). When
sending a report, please redact or avoid including live customer data; a minimal
reproduction is preferred over a full data export.
