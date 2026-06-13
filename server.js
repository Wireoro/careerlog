const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── /api/insights — proxies Claude, key never exposed to browser ──
app.post('/api/insights', async (req, res) => {
  const { entries } = req.body;

  if (!entries || !entries.length) {
    return res.status(400).json({ error: 'No entries provided' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in Render environment variables.' });
  }

  // Build a structured prompt from the user's entries
  const entryList = entries.map((e, i) =>
    `Entry ${i + 1}:
Category: ${e.category}
Date: ${e.entry_date}
Title: ${e.title}
Content: ${e.content}
Impact: ${e.impact_level}/5
Tags: ${(e.tags || []).join(', ') || 'none'}`
  ).join('\n\n---\n\n');

  const prompt = `You are a professional career coach reviewing a professional's career journal entries. 
Analyse the entries below and return a JSON object with this exact structure — no markdown, no backticks, just raw JSON:

{
  "career_summary": "2-3 sentence professional summary of this person's recent career activity and trajectory",
  "key_wins": ["win 1 as a punchy bullet", "win 2", "win 3"],
  "top_skills": ["skill 1", "skill 2", "skill 3", "skill 4"],
  "promotion_case": "A compelling 3-4 sentence case for why this person deserves a promotion or raise, written in third person using specifics from their entries",
  "star_stories": [
    {
      "title": "Story title",
      "situation": "What was happening",
      "task": "What they needed to do",
      "action": "What they did",
      "result": "What the outcome was"
    }
  ],
  "linkedin_update": "A professional LinkedIn post (2-3 paragraphs) highlighting their recent work without being too salesy. First person voice.",
  "growth_areas": "One honest, constructive observation about a pattern or opportunity for growth",
  "next_focus": "The single most important thing they should focus on in the next 30 days based on their entries"
}

Here are the journal entries:

${entryList}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system:     'You are a professional career coach AI. Always respond with raw valid JSON only. No markdown, no backticks, no explanation before or after.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude error:', err);
      return res.status(response.status).json({ error: 'Claude API error: ' + err });
    }

    const data   = await response.json();
    const text   = data.content.map(c => c.text || '').join('');
    const clean  = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);

  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/entry-insight — summarise a single entry on save ──
app.post('/api/entry-insight', async (req, res) => {
  const { entry } = req.body;
  if (!entry) return res.status(400).json({ error: 'No entry provided' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const prompt = `A professional just logged this career journal entry:
Category: ${entry.category}
Title: ${entry.title}
Content: ${entry.content}
Impact: ${entry.impact_level}/5

Return raw JSON only:
{
  "summary": "One polished sentence summarising what happened and why it matters professionally",
  "interview_story": "2-3 sentence STAR format story ready to use in an interview (Situation, Action, Result)",
  "promotion_bullet": "One bullet point for a promotion packet — start with a strong action verb, include a metric if possible"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 500,
        system:     'You are a career coach AI. Always respond with raw valid JSON only.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    const data   = await response.json();
    const text   = data.content.map(c => c.text || '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    res.json(parsed);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fallback ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('CareerLog running on port ' + PORT);
  console.log('Anthropic key set:', !!process.env.ANTHROPIC_API_KEY);
});
