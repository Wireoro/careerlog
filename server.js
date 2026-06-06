const express  = require('express');
const fetch    = require('node-fetch');
const cors     = require('cors');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Claude API proxy ──────────────────────────────────────
app.post('/api/insights', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set. Add it in Render → Environment tab.' });
  }

  try {
    console.log('Calling Claude API...');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:     'You are a career coach AI. Respond ONLY with a valid JSON object, no markdown backticks, no preamble.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    const responseText = await response.text();
    console.log('Claude response status:', response.status);

    if (!response.ok) {
      console.error('Claude API error:', responseText);
      return res.status(response.status).json({ error: responseText });
    }

    const data   = JSON.parse(responseText);
    const text   = data.content.map(c => c.text || '').join('');
    const clean  = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    console.log('Insights generated successfully');
    res.json(parsed);

  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Serve frontend ────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('CareerLog running on port ' + PORT);
  console.log('ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);
});
