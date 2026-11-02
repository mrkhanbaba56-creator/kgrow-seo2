const buckets = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUEST_BYTES = 24_000;
const MAX_MESSAGES = 12;
const MAX_CONTENT_LENGTH = 4_000;

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function isRateLimited(key) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > 12;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (Number(req.headers['content-length'] || 0) > MAX_REQUEST_BYTES) return res.status(413).json({ error: 'Message payload is too large' });
  if (isRateLimited(getClientKey(req))) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: 'Cloud Mode is not configured' });
  const input = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = input
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CONTENT_LENGTH) }));
  if (!messages.length) return res.status(400).json({ error: 'Message required' });
  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5-mini', stream: true, temperature: 0.35, messages: [{ role: 'system', content: 'You are KGROW Nano 0.1, a concise, helpful multilingual assistant. Understand Hindi, Hinglish, and English. Match the user language. Ask clarifying questions before recommendations when important details are missing. Never claim KGROW trained the underlying model.' }, ...messages] })
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Cloud provider unavailable' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Transfer-Encoding', 'chunked');
    const reader = upstream.body.getReader(); const decoder = new TextDecoder(); const encoder = new TextEncoder(); let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try { const token = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content; if (token) res.write(encoder.encode(token)); } catch {}
      }
      if (done) break;
    }
    res.end();
  } catch { if (!res.headersSent) return res.status(500).json({ error: 'Cloud provider unavailable' }); res.end(); }
}
