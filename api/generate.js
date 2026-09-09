export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'POST only'});
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({error:'AI key not configured'});
  const { marketplace='Amazon', productName='', brand='', features='' } = req.body || {};
  if (!productName) return res.status(400).json({error:'Product name required'});
  const prompt = `You are Kgrow.SEO2.0, an e-commerce listing specialist. Create original, marketplace-safe SEO content for ${marketplace}. Product: ${productName}. Brand: ${brand || 'not provided'}. Confirmed features: ${features || 'none provided'}. Never invent dimensions, material, certifications, warranty, ratings, price or claims. Return JSON only with keys title, bullets (array of 5), description, keywords (array), categorySuggestion, missingInfo (array).`;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-5-mini',messages:[{role:'user',content:prompt}],response_format:{type:'json_object'}})
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({error:data?.error?.message || 'AI request failed'});
    const content = data.choices?.[0]?.message?.content || '{}';
    return res.status(200).json(JSON.parse(content));
  } catch (e) {
    return res.status(500).json({error:e.message});
  }
}
