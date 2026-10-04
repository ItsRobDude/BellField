# BellField Site

This folder holds the Cloudflare Pages pre-release site for `bellfield.app`.

## Source and Configuration

- [public/index.html](./public/index.html): page copy, styling, and the waitlist form.
- [public/img](./public/img): curated product screenshots.
- [public/robots.txt](./public/robots.txt) and [public/sitemap.xml](./public/sitemap.xml): crawl routes.
- [functions/api/waitlist.js](./functions/api/waitlist.js): `POST /api/waitlist`; validates an
  email, stores an idempotent signup, and limits requests per IP/hour.
- [wrangler.toml](./wrangler.toml): Pages project `bellfield-site`, output directory `public`,
  and the required `WAITLIST` KV binding. The namespace id identifies a resource, not a credential.

[Positioning and pricing](../docs/positioning-and-pricing.md) controls marketing claims.
[The original copy draft](../docs/prerelease-site-draft.md) is background and owner-markup context.
Repository files establish the implementation; the Pages dashboard and deployment record establish
which revision is actually live. This guide does not claim a new production deployment.

## Local Preview

Use the repo's Node/pnpm baseline from [developer setup](../docs/dev-setup.md). There is no
site build step or package dependency to install into this workspace. From the repo root:

```powershell
Set-Location site
corepack pnpm dlx wrangler@4 pages dev public --port 8788
```

`dlx` obtains the Wrangler CLI outside the workspace dependency graph. Record its exact version
in deployment evidence when publishing. The local server reads `wrangler.toml`, runs the Pages
Function, and uses local KV state under ignored `.wrangler/`; local preview does not require
Cloudflare login. Stop it with Ctrl+C. See Cloudflare's
[local development](https://developers.cloudflare.com/pages/functions/local-development/) and
[KV bindings](https://developers.cloudflare.com/pages/functions/bindings/) documentation.

Open `http://localhost:8788` and check the screenshot, layout at desktop/mobile widths, and
waitlist success/error display. Use synthetic addresses for local signup tests. Check that:

- a valid signup returns HTTP 200 and `{ "ok": true }`;
- the same normalized address succeeds without replacing its original signup metadata;
- an invalid address returns 400 and a GET to the endpoint returns 405;
- repeated requests from the same IP/hour reach 429 after five attempts (invalid attempts count).

The binding is required: a missing `WAITLIST` produces 503. Keep local verification separate from
any hosted test that would write to a real waitlist.

## Deployment Procedure

For an authorized publication, first check the existing `bellfield-site` project in Cloudflare:
confirm the account, configured production branch, custom domain, and production/preview KV
bindings. Reconcile those settings with `wrangler.toml`; do not create a replacement project or
namespace just because the current account cannot see it. Preview tests need a separate test KV
namespace if they must not write to the real waitlist.

From `site`, authenticate the operator and inspect the accessible projects:

```powershell
corepack pnpm dlx wrangler@4 login
corepack pnpm dlx wrangler@4 pages project list
```

Deploy an approved revision to a preview branch after verifying `site-review` is not the
project's production branch and its bindings are appropriate:

```powershell
corepack pnpm dlx wrangler@4 pages deploy public --project-name bellfield-site --branch site-review
```

For production, use that same deployment command with `--branch` set to the project's verified
production branch. Run from `site` so Wrangler includes `functions/` as well as static assets.
See [Pages deployment commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/)
and [configuration behavior](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

Record the source commit, exact CLI version, environment/branch, returned deployment URL/id,
and verification outcome. Check the returned URL and intended custom domain, static assets,
and an approved test signup against the intended KV namespace. A rendered static page alone
does not prove the waitlist Function works. Store evidence under ignored
`artifacts/validation/<timestamp>/site/`, without exporting signup addresses into Git.

## Waitlist KV

The waitlist function stores normalized signup email addresses as top-level keys in the
`WAITLIST` KV namespace.

Rate-limit counters intentionally share the same namespace with keys prefixed by
`__rate__:waitlist:`. They expire after two hours. Any manual export or operator script
that reads signups from `WAITLIST` must filter out that prefix.
