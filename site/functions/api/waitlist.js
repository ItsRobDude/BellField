// Cloudflare Pages Function: POST /api/waitlist
// Stores founding-shop waitlist signups in the WAITLIST KV namespace.
// Key = normalized email (idempotent re-signups), value = signup metadata.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RATE_LIMIT_PREFIX = '__rate__:waitlist';
const RATE_LIMIT_MAX_PER_HOUR = 5;
const RATE_LIMIT_TTL_SECONDS = 2 * 60 * 60;

export async function onRequestPost(context) {
  if (!context.env?.WAITLIST) {
    return json({ error: 'Waitlist is temporarily unavailable.' }, 503);
  }

  const rateLimit = await checkRateLimit(context);
  if (!rateLimit.allowed) {
    return json({ error: 'Too many signup attempts. Try again later.' }, 429);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return json({ error: 'Enter a valid email address.' }, 400);
  }

  const existing = await context.env.WAITLIST.get(email);
  if (existing === null) {
    await context.env.WAITLIST.put(
      email,
      JSON.stringify({
        signedUpAt: new Date().toISOString(),
        userAgent: context.request.headers.get('user-agent') ?? null,
        country: context.request.cf?.country ?? null
      })
    );
  }

  // Idempotent: re-signups succeed quietly, no enumeration signal.
  return json({ ok: true }, 200);
}

export async function onRequest(context) {
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }
  return json({ error: 'Method not allowed.' }, 405);
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function checkRateLimit(context) {
  const ipAddress =
    context.request.headers.get('cf-connecting-ip') ??
    context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  const ipHash = await sha256Hex(ipAddress);
  const key = `${RATE_LIMIT_PREFIX}:${hour}:${ipHash}`;
  const rawCount = await context.env.WAITLIST.get(key);
  const count = Number.parseInt(rawCount ?? '0', 10);
  if (Number.isFinite(count) && count >= RATE_LIMIT_MAX_PER_HOUR) {
    return { allowed: false };
  }
  await context.env.WAITLIST.put(key, String(Number.isFinite(count) ? count + 1 : 1), {
    expirationTtl: RATE_LIMIT_TTL_SECONDS
  });
  return { allowed: true };
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
