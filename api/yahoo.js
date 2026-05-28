// Vercel serverless function — proxies Yahoo Finance chart API.
// Flow: try direct request → on 401/429 fetch crumb+cookie → retry with auth.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BASE_HEADERS = {
  'User-Agent': UA,
  'Accept': 'application/json,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
};

// Module-level crumb cache (survives warm instances)
let _crumb = null;

async function fetchCrumb() {
  if (_crumb && Date.now() - _crumb.at < 3_600_000) return _crumb;

  // Try crumb endpoint directly — works when the IP isn't blocked
  let cookie = '';
  let crumb = '';

  const direct = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: BASE_HEADERS,
  });
  if (direct.ok) {
    const text = (await direct.text()).trim();
    if (text && !text.startsWith('<') && !text.startsWith('{')) crumb = text;
  }

  // If direct crumb failed, warm up a session via finance.yahoo.com first
  if (!crumb) {
    const page = await fetch('https://finance.yahoo.com/', {
      headers: { ...BASE_HEADERS, Accept: 'text/html,*/*' },
      redirect: 'follow',
    });
    const raw = page.headers.getSetCookie?.() ?? [page.headers.get('set-cookie') ?? ''];
    cookie = raw.map(c => c.split(';')[0]).filter(Boolean).join('; ');

    const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...BASE_HEADERS, Cookie: cookie },
    });
    const text = (await cr.text()).trim();
    if (text && !text.startsWith('<') && !text.startsWith('{')) crumb = text;
  }

  if (!crumb) throw new Error('Yahoo crumb unavailable — cannot authenticate');
  console.log('[yahoo] crumb refreshed');
  _crumb = { crumb, cookie, at: Date.now() };
  return _crumb;
}

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target || !target.startsWith('https://query1.finance.yahoo.com/')) {
    return res.status(400).json({ error: 'invalid url' });
  }

  const send = async (url, extraHeaders = {}) => {
    const r = await fetch(url, { headers: { ...BASE_HEADERS, ...extraHeaders } });
    return r;
  };

  try {
    // Attempt 1: direct (no crumb) — fast path, works when not rate-limited
    let r = await send(target);

    if (r.status === 401 || r.status === 429 || r.status === 404) {
      // Attempt 2: with crumb + cookie
      const { crumb, cookie } = await fetchCrumb();
      const authedUrl = `${target}&crumb=${encodeURIComponent(crumb)}`;
      r = await send(authedUrl, { Cookie: cookie });

      if (r.status === 401 || r.status === 404) {
        // Crumb was stale — bust cache and try once more
        _crumb = null;
        const fresh = await fetchCrumb();
        const retryUrl = `${target}&crumb=${encodeURIComponent(fresh.crumb)}`;
        r = await send(retryUrl, { Cookie: fresh.cookie });
      }
    }

    const body = await r.text();
    console.log(`[yahoo] ${r.status} ${target.split('?')[0]}`);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
    return res.status(r.status).send(body);
  } catch (e) {
    console.error('[yahoo] error:', e.message);
    return res.status(502).json({ error: e.message });
  }
}
