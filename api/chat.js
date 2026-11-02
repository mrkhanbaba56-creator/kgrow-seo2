export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ error: 'Cloud Mode is not configured' });
  const input = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = input.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-12);
  if (!messages.length) return res.status(400).json({ error: 'Message required' });
  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5-mini', stream: true, temperature: 0.35, messages: [{ role: 'system', content: 'You are KGROW Nano 0.1, a concise, helpful multilingual assistant. Understand Hindi, Hinglish, and English. Match the user language. Ask clarifying questions before recommendations when important details are missing. Never claim KGROW trained the underlying model.' }, ...messages] })
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Cloud provider unavailable' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Transfer-Encoding', 'chunked');
    const reader = upstream.body.getReader(); const decoder = new TextDecoder(); const encoder = new TextEncoder();
    while (true) { const { value, done } = await reader.read(); if (done) break; const lines = decoder.decode(value, { stream: true }).split('\n'); for (const line of lines) { if (!line.startsWith('data: ') || line === 'data: [DONE]') continue; try { const token = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content; if (token) res.write(encoder.encode(token)); } catch {} } }
    res.end();
  } catch { if (!res.headersSent) return res.status(500).json({ error: 'Cloud provider unavailable' }); res.end(); }
}
