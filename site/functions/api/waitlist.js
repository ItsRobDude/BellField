// Cloudflare Pages Function: POST /api/waitlist
// Stores founding-shop waitlist signups in the WAITLIST KV namespace.
// Key = normalized email (idempotent re-signups), value = signup metadata.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost(context) {
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
