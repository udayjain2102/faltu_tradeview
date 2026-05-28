// Vercel serverless function — proxies Yahoo Finance with crumb authentication.
// Yahoo requires a session cookie + crumb token for server-side requests.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Module-level cache — survives warm Vercel instances (TTL 1 hour)
let _crumb = null;

async function getYahooCrumb() {
  if (_crumb && Date.now() - _crumb.at < 3_600_000) return _crumb;

  // Warm up a Yahoo Finance session to collect cookies
  const page = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const rawCookies = page.headers.getSetCookie?.() ?? [page.headers.get('set-cookie') ?? ''];
  const cookie = rawCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');

  // Fetch crumb using those cookies
  const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookie },
  });
  const crumb = (await cr.text()).trim();
  if (!crumb || crumb.startsWith('<')) throw new Error('crumb fetch failed — Yahoo blocked the request');

  _crumb = { crumb, cookie, at: Date.now() };
  return _crumb;
}

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target || !target.startsWith('https://query1.finance.yahoo.com/')) {
    return res.status(400).json({ error: 'invalid url' });
  }

  try {
    const { crumb, cookie } = await getYahooCrumb();
    const url = `${target}&crumb=${encodeURIComponent(crumb)}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Cookie': cookie,
        'Accept': 'application/json,*/*',
        'Referer': 'https://finance.yahoo.com/',
      },
    });
    const body = await r.text();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
    return res.status(r.status).send(body);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
