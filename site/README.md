# BellField Site

This folder holds the Cloudflare Pages pre-release site for `bellfield.app`.

## Waitlist KV

The waitlist function stores normalized signup email addresses as top-level keys in the
`WAITLIST` KV namespace.

Rate-limit counters intentionally share the same namespace with keys prefixed by
`__rate__:waitlist:`. They expire after two hours. Any manual export or operator script
that reads signups from `WAITLIST` must filter out that prefix.
