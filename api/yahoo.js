// Vercel serverless function: proxies Yahoo Finance chart API to bypass CORS.
// Frontend calls /api/yahoo?url=<encoded Yahoo URL>.
export default async function handler(req, res) {
  const target = req.query.url;
  if (!target || !target.startsWith('https://query1.finance.yahoo.com/')) {
    return res.status(400).json({ error: 'invalid url' });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };

  // Retry once on 429 (rate-limit) with a short back-off
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 600));
      const r = await fetch(target, { headers });
      if (r.status === 429 && attempt === 0) continue;
      const body = await r.text();
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
      return res.status(r.status).send(body);
    } catch (e) {
      if (attempt === 0) continue;
      return res.status(502).json({ error: e.message });
    }
  }
}
