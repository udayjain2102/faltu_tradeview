// Vercel serverless function: proxies Yahoo Finance chart API to bypass CORS.
// Frontend calls /api/yahoo?url=<encoded Yahoo URL>.
export default async function handler(req, res) {
  const target = req.query.url;
  if (!target || !target.startsWith('https://query1.finance.yahoo.com/')) {
    return res.status(400).json({ error: 'invalid url' });
  }
  try {
    const r = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const body = await r.text();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
