const express  = require('express');
const fetch    = require('node-fetch');
const path     = require('path');
const fs       = require('fs');
const { calculateScore } = require('./scoring');
const app      = express();
const PORT     = process.env.PORT || 3000;

app.use(express.json());

const publicPath = path.join(__dirname, 'public');
const staticDir  = fs.existsSync(publicPath) ? publicPath : __dirname;
app.use(express.static(staticDir));

console.log('Serving from:', staticDir);
console.log('Anthropic key:', !!process.env.ANTHROPIC_API_KEY);
console.log('Supabase URL:', !!process.env.SUPABASE_URL);

// ── Auth helper — verify Supabase JWT from request ────────
async function getUserId(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.replace('Bearer ', '');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const r = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + token }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u.id || null;
  } catch { return null; }
}

// ── /api/score ────────────────────────────────────────────
app.post('/api/score', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { entries, moodRows } = req.body;
  if (!entries) return res.status(400).json({ error: 'No entries provided' });

  try {
    const result = calculateScore(entries || [], moodRows || []);
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const bd = result.breakdown;
      fetch(supabaseUrl + '/rest/v1/career_scores', {
        method: 'POST',
        headers: {
          'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          user_id: userId, score: result.score,
          tier_label: result.tier.label, tier_grade: result.tier.grade, tier_color: result.tier.color,
          consistency_raw: bd.consistency.raw, impact_raw: bd.impactQuality.raw,
          category_raw: bd.categoryMix.raw, awareness_raw: bd.selfAwareness.raw, depth_raw: bd.entryDepth.raw,
          consistency_pts: bd.consistency.contribution, impact_pts: bd.impactQuality.contribution,
          category_pts: bd.categoryMix.contribution, awareness_pts: bd.selfAwareness.contribution,
          depth_pts: bd.entryDepth.contribution,
          entry_bonus: result.entryBonus || 0,
          entries_count: entries.length, mood_count: (moodRows || []).length,
          updated_at: new Date().toISOString(),
        }),
      }).catch(e => console.error('Score save error:', e.message));
    }
    res.json(result);
  } catch (err) {
    console.error('Scoring error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/score/load ───────────────────────────────────────
app.get('/api/score/load', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  try {
    const r = await fetch(
      supabaseUrl + '/rest/v1/career_scores?user_id=eq.' + userId + '&limit=1',
      { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    const rows = await r.json();
    res.json(rows && rows.length > 0 ? rows[0] : null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── /api/insights ─────────────────────────────────────────
app.post('/api/insights', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { entries } = req.body;
  if (!entries || !entries.length) return res.status(400).json({ error: 'No entries provided' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const entryList = entries.map((e, i) =>
    `Entry ${i+1}:\nCategory: ${e.category}\nDate: ${e.entry_date}\nTitle: ${e.title}\nContent: ${e.content}\nImpact: ${e.impact_level}/5\nTags: ${(e.tags||[]).join(', ')||'none'}`
  ).join('\n\n---\n\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 2000,
        system: 'You are a professional career coach AI. Always respond with raw valid JSON only.',
        messages: [{ role: 'user', content: `Analyse these career journal entries and return raw JSON only:\n\n${entryList}\n\n{"career_summary":"...","key_wins":["..."],"top_skills":["..."],"promotion_case":"...","star_stories":[{"title":"...","situation":"...","task":"...","action":"...","result":"..."}],"linkedin_update":"...","growth_areas":"...","next_focus":"..."}` }],
      }),
    });
    const data = await response.json();
    const text = data.content.map(c => c.text||'').join('');
    res.json(JSON.parse(text.replace(/```json|```/g,'').trim()));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── /api/career-ladder ────────────────────────────────────
app.post('/api/career-ladder', async (req, res) => {
  const { jobTitle, forceRefresh } = req.body;
  if (!jobTitle) return res.status(400).json({ error: 'No job title provided' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const lookupKey = jobTitle.toLowerCase().trim().replace(/\s+/g,' ');

  if (supabaseUrl && supabaseKey && !forceRefresh) {
    try {
      const r = await fetch(supabaseUrl + '/rest/v1/career_ladders?lookup_key=eq.' + encodeURIComponent(lookupKey) + '&limit=1',
        { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } });
      const rows = await r.json();
      if (rows && rows.length > 0) {
        console.log('Ladder cache HIT:', lookupKey);
        fetch(supabaseUrl + '/rest/v1/career_ladders?lookup_key=eq.' + encodeURIComponent(lookupKey), {
          method: 'PATCH',
          headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ times_served: rows[0].times_served + 1 }),
        }).catch(()=>{});
        return res.json({ ...rows[0].ladder_data, cached: true });
      }
    } catch (e) { console.error('Cache check failed:', e.message); }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 3000,
        system: 'You are a career development expert. Always respond with raw valid JSON only. No markdown.',
        messages: [{ role: 'user', content: `Career ladder for: "${jobTitle}"\n\nReturn raw JSON:\n{"profession":"...","industry":"...","current_level":"...","description":"...","tracks":[{"name":"...","description":"...","levels":[{"title":"...","rank":1,"years_typical":"0-2","is_current":false,"is_entry":true,"description":"...","key_skills":["..."],"promotion_criteria":"..."}]}],"insights":["...","...","..."]}` }],
      }),
    });
    const data = await response.json();
    const text = data.content.map(c => c.text||'').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
    if (supabaseUrl && supabaseKey) {
      fetch(supabaseUrl + '/rest/v1/career_ladders', {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ lookup_key: lookupKey, job_title: jobTitle, profession: parsed.profession, industry: parsed.industry, ladder_data: parsed, times_served: 1 }),
      }).catch(()=>{});
    }
    res.json({ ...parsed, cached: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Fallback ──────────────────────────────────────────────
app.get('*', (req, res) => {
  const f = path.join(staticDir, 'index.html');
  fs.existsSync(f) ? res.sendFile(f) : res.status(404).send('index.html not found');
});

app.listen(PORT, () => {
  console.log('CareerLog on port', PORT);
  console.log('index.html:', fs.existsSync(path.join(staticDir, 'index.html')));
});
