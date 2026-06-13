const express  = require('express');
const fetch    = require('node-fetch');
const path     = require('path');
const fs       = require('fs');
const { calculateScore } = require('./scoring'); // private scoring engine
const app      = express();
const PORT     = process.env.PORT || 3000;

app.use(express.json());

// Serve static files from public/ or root
const publicPath = path.join(__dirname, 'public');
const staticDir  = fs.existsSync(publicPath) ? publicPath : __dirname;
app.use(express.static(staticDir));
console.log('Serving static files from:', staticDir);
console.log('Anthropic key set:', !!process.env.ANTHROPIC_API_KEY);

// ── /api/score — private scoring engine ──────────────────
// Calculates score, saves it to Supabase, returns result.
app.post('/api/score', async (req, res) => {
  const { entries, moodRows, userId } = req.body;
  if (!entries) return res.status(400).json({ error: 'No entries provided' });

  try {
    const result = calculateScore(entries || [], moodRows || []);
    const uid    = userId || 'demo_user';

    // Save score to Supabase career_scores table
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const bd = result.breakdown;
      const payload = {
        user_id:          uid,
        score:            result.score,
        tier_label:       result.tier.label,
        tier_grade:       result.tier.grade,
        tier_color:       result.tier.color,
        consistency_raw:  bd.consistency.raw,
        impact_raw:       bd.impactQuality.raw,
        category_raw:     bd.categoryMix.raw,
        awareness_raw:    bd.selfAwareness.raw,
        depth_raw:        bd.entryDepth.raw,
        consistency_pts:  bd.consistency.contribution,
        impact_pts:       bd.impactQuality.contribution,
        category_pts:     bd.categoryMix.contribution,
        awareness_pts:    bd.selfAwareness.contribution,
        depth_pts:        bd.entryDepth.contribution,
        entry_bonus:      result.entryBonus || 0,
        entries_count:    entries.length,
        mood_count:       (moodRows || []).length,
        updated_at:       new Date().toISOString(),
      };

      await fetch(supabaseUrl + '/rest/v1/career_scores', {
        method:  'POST',
        headers: {
          'apikey':        supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(payload),
      }).catch(err => console.error('Failed to save score to Supabase:', err.message));

      console.log('Score saved to Supabase:', result.score, 'for user:', uid);
    }

    res.json(result);
  } catch (err) {
    console.error('Scoring error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/score/load — load saved score from Supabase ────
app.get('/api/score/load', async (req, res) => {
  const userId      = req.query.userId || 'demo_user';
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials not set' });
  }

  try {
    const r = await fetch(
      supabaseUrl + '/rest/v1/career_scores?user_id=eq.' + userId + '&limit=1',
      { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    const rows = await r.json();
    if (!rows || rows.length === 0) return res.json(null);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── /api/insights — Claude AI career analysis ─────────────
app.post('/api/insights', async (req, res) => {
  const { entries } = req.body;
  if (!entries || !entries.length) return res.status(400).json({ error: 'No entries provided' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in Render environment variables.' });

  const entryList = entries.map((e, i) =>
    `Entry ${i + 1}:\nCategory: ${e.category}\nDate: ${e.entry_date}\nTitle: ${e.title}\nContent: ${e.content}\nImpact: ${e.impact_level}/5\nTags: ${(e.tags || []).join(', ') || 'none'}`
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
  "linkedin_update": "A professional LinkedIn post (2-3 paragraphs) highlighting their recent work. First person voice.",
  "growth_areas": "One honest, constructive observation about a pattern or opportunity for growth",
  "next_focus": "The single most important thing they should focus on in the next 30 days based on their entries"
}

Here are the journal entries:

${entryList}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system:     'You are a professional career coach AI. Always respond with raw valid JSON only. No markdown, no backticks, no explanation.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error('Claude error:', err);
      return res.status(response.status).json({ error: err });
    }
    const data   = await response.json();
    const text   = data.content.map(c => c.text || '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    res.json(parsed);
  } catch (err) {
    console.error('Insights error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/career-ladder — cached + AI career ladder ──────
app.post('/api/career-ladder', async (req, res) => {
  const { jobTitle, forceRefresh } = req.body;
  if (!jobTitle) return res.status(400).json({ error: 'No job title provided' });

  const apiKey      = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  // Normalise the key: lowercase, trim, collapse spaces
  const lookupKey = jobTitle.toLowerCase().trim().replace(/\s+/g, ' ');

  // ── Step 1: Check cache ──────────────────────────────────
  if (supabaseUrl && supabaseKey && !forceRefresh) {
    try {
      const cacheRes = await fetch(
        supabaseUrl + '/rest/v1/career_ladders?lookup_key=eq.' + encodeURIComponent(lookupKey) + '&limit=1',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
      );
      const rows = await cacheRes.json();

      if (rows && rows.length > 0) {
        console.log('Cache HIT for:', lookupKey, '— served', rows[0].times_served, 'times');

        // Increment times_served counter
        fetch(supabaseUrl + '/rest/v1/career_ladders?lookup_key=eq.' + encodeURIComponent(lookupKey), {
          method:  'PATCH',
          headers: {
            'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ times_served: rows[0].times_served + 1, updated_at: new Date().toISOString() }),
        }).catch(() => {});

        return res.json({ ...rows[0].ladder_data, cached: true, times_served: rows[0].times_served });
      }

      console.log('Cache MISS for:', lookupKey, '— calling Claude');
    } catch (cacheErr) {
      console.error('Cache check failed:', cacheErr.message, '— falling through to Claude');
    }
  }

  // ── Step 2: Call Claude ──────────────────────────────────
  const prompt = `A professional works as: "${jobTitle}"

Infer their full career ladder. Return ONLY raw JSON, no markdown:

{
  "profession": "Clean profession name",
  "industry": "Industry sector",
  "current_level": "Exact level name that matches their job title most closely",
  "description": "1-2 sentence description of this profession and typical career arc",
  "tracks": [
    {
      "name": "Track name (e.g. Individual Contributor, Management, Clinical, Technical)",
      "description": "What this track focuses on",
      "levels": [
        {
          "title": "Job title",
          "rank": 1,
          "years_typical": "0-2",
          "is_current": false,
          "is_entry": true,
          "description": "What this person does day to day",
          "key_skills": ["skill1", "skill2", "skill3"],
          "promotion_criteria": "What it takes to reach the next level"
        }
      ]
    }
  ],
  "insights": [
    "One key insight about progression in this field",
    "One common mistake people make at this career stage",
    "One tip for accelerating advancement"
  ]
}

Rules:
- Include ALL levels from entry to top (typically 6-10 levels per track)
- Most professions have 1-2 tracks (IC vs management, clinical vs admin, etc.)
- Set is_current: true for the level matching their job title
- years_typical should reflect real-world timelines
- Be specific to their actual profession and industry
- If it is a niche title, infer the most likely profession`;

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
        max_tokens: 3000,
        system:     'You are a career development expert with deep knowledge of career ladders across all industries. Always respond with raw valid JSON only. No markdown, no backticks.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data   = await response.json();
    const text   = data.content.map(c => c.text || '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    // ── Step 3: Save to cache ────────────────────────────────
    if (supabaseUrl && supabaseKey) {
      fetch(supabaseUrl + '/rest/v1/career_ladders', {
        method:  'POST',
        headers: {
          'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          lookup_key:  lookupKey,
          job_title:   jobTitle,
          profession:  parsed.profession,
          industry:    parsed.industry,
          ladder_data: parsed,
          times_served: 1,
        }),
      })
      .then(() => console.log('Cached ladder for:', lookupKey))
      .catch(err => console.error('Failed to cache ladder:', err.message));
    }

    res.json({ ...parsed, cached: false });

  } catch (err) {
    console.error('Career ladder error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Fallback — always serve index.html ───────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html not found. Place it in the public/ folder or repo root.');
  }
});

app.listen(PORT, () => {
  console.log('CareerLog running on port ' + PORT);
  console.log('Anthropic key set:  ', !!process.env.ANTHROPIC_API_KEY);
  console.log('Supabase URL set:   ', !!process.env.SUPABASE_URL);
  console.log('Supabase key set:   ', !!process.env.SUPABASE_ANON_KEY);
  console.log('index.html found:   ', fs.existsSync(path.join(staticDir, 'index.html')));
});
