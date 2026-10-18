export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let key = process.env.CODE_API_KEY;
  if (!key) return res.status(500).json({ error: 'CODE_API_KEY is not configured on the server.' });
  // Normalize values pasted into Vercel (whitespace or accidental wrapping quotes).
  key = String(key).trim().replace(/^['"]|['"]$/g, '').trim();
  if (!key) return res.status(500).json({ error: 'CODE_API_KEY is empty on the server.' });

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array.' });
  }

  try {
    let response;
    let data;

    if (key.startsWith('sk-ant-')) {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
        })
      });
      data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `Anthropic HTTP ${response.status}`);
      return res.status(200).json({ text: data?.content?.map(x => x.text || '').join('') || '' });
    }

    if (key.startsWith('AIza')) {
      const model = 'gemini-2.0-flash';
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(m.content || '') }]
          }))
        })
      });
      data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
      return res.status(200).json({ text: data?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') || '' });
    }

    if (key.startsWith('sk-')) {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
        })
      });
      data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
      return res.status(200).json({ text: data?.choices?.[0]?.message?.content || '' });
    }

    // OpenAI keys use several prefixes (for example sk- and sk-proj-).
    // If the provider-specific prefix is not recognizable, treat it as OpenAI
    // rather than rejecting it, while still keeping the key server-side.
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
      })
    });
    data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
    return res.status(200).json({ text: data?.choices?.[0]?.message?.content || '' });
  } catch (err) {
    return res.status(502).json({ error: err?.message || 'AI provider request failed.' });
  }
}
