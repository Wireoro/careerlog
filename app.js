/*
  app.js — CareerLog main application logic.
  Credentials come from config.js (which reads .env) — never hardcoded here.
*/

import { SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY } from './config.js';

// ── State ────────────────────────────────────────────────
const USER_ID = 'demo_user'; // replace when you add real auth

let selectedCategory = 'win';
let selectedImpact   = 3;
let tags             = [];

const IMPACT_LABELS = {
  1: 'Minor mention',
  2: 'Noteworthy',
  3: 'Medium impact',
  4: 'High impact',
  5: 'Career-defining'
};

// ── DOM Ready ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setDefaultDate();
  bindNavTabs();
  bindCategoryButtons();
  bindImpactDots();
  bindTagInput();
  document.getElementById('submit-btn').addEventListener('click', submitEntry);
});

// ── Navigation ────────────────────────────────────────────
function bindNavTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tab).classList.add('active');
      if (tab === 'entries') loadEntries();
      if (tab === 'insights') loadInsights();
    });
  });
}

// ── Form controls ─────────────────────────────────────────
function setDefaultDate() {
  document.getElementById('entry-date').value = new Date().toISOString().split('T')[0];
}

function bindCategoryButtons() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedCategory = btn.dataset.cat;
    });
  });
}

function bindImpactDots() {
  document.querySelectorAll('.impact-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      selectedImpact = parseInt(dot.dataset.val, 10);
      document.querySelectorAll('.impact-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      document.getElementById('impact-label').textContent = IMPACT_LABELS[selectedImpact];
    });
  });
}

// ── Tags ──────────────────────────────────────────────────
function bindTagInput() {
  const container = document.getElementById('tags-container');
  const input     = document.getElementById('tag-input');

  container.addEventListener('click', () => input.focus());

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.trim().toLowerCase().replace(/,/g, '');
      if (val && !tags.includes(val)) {
        tags.push(val);
        renderTags();
      }
      input.value = '';
    }
    if (e.key === 'Backspace' && input.value === '' && tags.length) {
      tags.pop();
      renderTags();
    }
  });
}

function renderTags() {
  const container = document.getElementById('tags-container');
  const input     = document.getElementById('tag-input');
  container.innerHTML = '';
  tags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${tag}<button aria-label="Remove ${tag}" onclick="removeTag('${tag}')">×</button>`;
    container.appendChild(pill);
  });
  container.appendChild(input);
  input.focus();
}

window.removeTag = function(tag) {
  tags = tags.filter(t => t !== tag);
  renderTags();
};

// ── Supabase client ───────────────────────────────────────
async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        options.method === 'POST' ? 'return=representation' : 'return=minimal',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Claude API client ─────────────────────────────────────
async function callClaude(userPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-ipc': 'true',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system:     'You are a career coach AI. Respond ONLY with a valid JSON object, no markdown backticks, no preamble.',
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data  = await res.json();
  const text  = data.content.map(c => c.text || '').join('');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ── Submit entry ──────────────────────────────────────────
async function submitEntry() {
  const title   = document.getElementById('entry-title').value.trim();
  const content = document.getElementById('entry-content').value.trim();
  const date    = document.getElementById('entry-date').value;

  if (!title)   return showToast('Please add a title');
  if (!content) return showToast('Please add some content');

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  show('write-loading');
  document.getElementById('write-result').innerHTML = '';

  try {
    // 1. Save entry to Supabase
    const [entry] = await sbFetch('journal_entries', {
      method: 'POST',
      body: JSON.stringify({
        user_id: USER_ID, category: selectedCategory,
        title, content, impact_level: selectedImpact, tags, entry_date: date,
      }),
    });

    // 2. Generate AI insights
    const aiPrompt = `A professional just logged this career journal entry:
Category: ${selectedCategory}
Title: ${title}
Content: ${content}
Impact level: ${selectedImpact}/5

Return ONLY a JSON object:
{
  "summary": "Polished 1-sentence summary of what happened and why it matters",
  "interview_story": "A STAR-format story (2-3 sentences): Situation → Action → Result",
  "promotion_bullet": "One bullet for a promotion packet — strong action verb, include metric if present",
  "skill_tags": ["skill1", "skill2", "skill3"],
  "pattern": "Brief observation about what this reveals about their career trajectory"
}`;

    const insights = await callClaude(aiPrompt);

    // 3. Save insights back to Supabase
    for (const type of ['summary', 'interview_story', 'promotion_bullet', 'pattern']) {
      if (insights[type]) {
        await sbFetch('entry_insights', {
          method: 'POST',
          body: JSON.stringify({
            entry_id: entry.id, user_id: USER_ID,
            insight_type: type, content: insights[type],
          }),
        });
      }
    }

    hide('write-loading');
    renderWriteResult(insights);

    // Reset form
    document.getElementById('entry-title').value   = '';
    document.getElementById('entry-content').value = '';
    tags = []; renderTags();
    showToast('Entry saved with AI insights!');

  } catch (err) {
    hide('write-loading');
    showToast('Error: ' + err.message);
    console.error(err);
  }

  btn.disabled = false;
}

function renderWriteResult(insights) {
  const skillPills = (insights.skill_tags || [])
    .map(s => `<span class="skill-pill">${s}</span>`).join('');

  document.getElementById('write-result').innerHTML = `
    <div class="result-banner">
      <p class="result-saved">Entry saved ✓</p>
      <p class="result-summary">${insights.summary || ''}</p>
      ${insights.interview_story ? `
        <div class="insight-card">
          <div class="insight-label">Interview story — STAR</div>
          <div class="insight-body">${insights.interview_story}</div>
        </div>` : ''}
      ${insights.promotion_bullet ? `
        <div class="insight-card">
          <div class="insight-label">Promotion packet bullet</div>
          <div class="insight-body insight-mono">${insights.promotion_bullet}</div>
        </div>` : ''}
      ${skillPills ? `<div class="skill-pills">${skillPills}</div>` : ''}
    </div>`;
}

// ── Load entries ──────────────────────────────────────────
async function loadEntries() {
  const listEl  = document.getElementById('entries-list');
  const statsEl = document.getElementById('entries-stats');

  statsEl.style.display = 'none';
  listEl.innerHTML = '';
  show('entries-loading');

  try {
    const entries = await sbFetch(
      `journal_entries?user_id=eq.${USER_ID}&order=entry_date.desc&limit=50`,
      { headers: { Prefer: 'return=representation' } }
    );
    hide('entries-loading');

    if (!entries || entries.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><i class="ti ti-notebook"></i>No entries yet — write your first one!</div>`;
      return;
    }

    const avgImpact = entries.reduce((s, e) => s + (e.impact_level || 0), 0) / entries.length;
    const catCounts = {};
    entries.forEach(e => { catCounts[e.category] = (catCounts[e.category] || 0) + 1; });
    const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
    const wins   = entries.filter(e => e.category === 'win').length;

    statsEl.innerHTML = `
      <div class="stat"><span class="stat-val">${entries.length}</span><span class="stat-label sans">Total entries</span></div>
      <div class="stat"><span class="stat-val">${wins}</span><span class="stat-label sans">Wins logged</span></div>
      <div class="stat"><span class="stat-val">${avgImpact.toFixed(1)}</span><span class="stat-label sans">Avg. impact</span></div>
      <div class="stat"><span class="stat-val" style="font-size:16px;padding-top:4px">${topCat ? topCat[0] : '—'}</span><span class="stat-label sans">Top category</span></div>`;
    statsEl.style.display = 'flex';

    entries.forEach(e => {
      const CAT_COLORS = {
        win:       { color: 'var(--cat-win)',       bg: 'var(--cat-win-bg)'       },
        metric:    { color: 'var(--cat-metric)',    bg: 'var(--cat-metric-bg)'    },
        feedback:  { color: 'var(--cat-feedback)',  bg: 'var(--cat-feedback-bg)'  },
        decision:  { color: 'var(--cat-decision)',  bg: 'var(--cat-decision-bg)'  },
        lesson:    { color: 'var(--cat-lesson)',    bg: 'var(--cat-lesson-bg)'    },
        challenge: { color: 'var(--cat-challenge)', bg: 'var(--cat-challenge-bg)' },
      };
      const snippet = e.content.length > 160 ? e.content.slice(0, 160) + '…' : e.content;
      const tagLine = e.tags && e.tags.length ? ' · ' + e.tags.join(', ') : '';
      const card    = document.createElement('div');
      card.className  = 'entry-card';
      card.dataset.cat = e.category;
      card.innerHTML = `
        <div class="entry-top">
          <div class="entry-title">${e.title}</div>
          <span class="badge badge-${e.category}">${e.category}</span>
        </div>
        <div class="entry-snippet sans">${snippet}</div>
        <div class="entry-meta">${e.entry_date} · Impact ${e.impact_level}/5${tagLine}</div>`;
      listEl.appendChild(card);
    });

  } catch (err) {
    hide('entries-loading');
    listEl.innerHTML = `<div class="empty-state">Error loading entries: ${err.message}</div>`;
  }
}

// ── Load insights ─────────────────────────────────────────
async function loadInsights() {
  const el = document.getElementById('insights-content');
  el.innerHTML = '';
  show('insights-loading');

  try {
    const entries = await sbFetch(
      `journal_entries?user_id=eq.${USER_ID}&order=entry_date.desc&limit=20`,
      { headers: { Prefer: 'return=representation' } }
    );
    hide('insights-loading');

    if (!entries || entries.length === 0) {
      el.innerHTML = `<div class="empty-state"><i class="ti ti-sparkles"></i>Write at least one entry to generate career insights.</div>`;
      return;
    }

    const summary = entries.slice(0, 10)
      .map(e => `- [${e.category}] ${e.title}: ${e.content.slice(0, 120)}`).join('\n');

    const data = await callClaude(`A professional has ${entries.length} career journal entries. Recent ones:
${summary}

Analyze their career trajectory. Return ONLY this JSON:
{
  "career_narrative": "2-3 sentences describing their career trajectory",
  "top_strengths": ["strength 1", "strength 2", "strength 3"],
  "promotion_case": "2-3 sentence promotion case using their wins and metrics",
  "interview_stories": ["Story headline 1 based on entries", "Story headline 2 based on entries"],
  "growth_areas": "One honest observation about a pattern or growth area",
  "next_30_days": "One specific action they should log or pursue in the next 30 days"
}`);

    const strengthPills = (data.top_strengths || [])
      .map(s => `<span class="skill-pill">${s}</span>`).join('');
    const storyItems = (data.interview_stories || [])
      .map(s => `<div style="padding:7px 0;border-bottom:1px solid #EDE8E0;font-size:14px;color:#2C2520">→ ${s}</div>`).join('');

    el.innerHTML = `
      <p class="insights-header mono">${entries.length} entries analysed</p>
      ${data.career_narrative ? `<div class="insight-card"><div class="insight-label">Your career story</div><div class="insight-body">${data.career_narrative}</div></div>` : ''}
      ${strengthPills ? `<div class="insight-card"><div class="insight-label">Top strengths</div><div class="skill-pills">${strengthPills}</div></div>` : ''}
      ${data.promotion_case ? `<div class="insight-card"><div class="insight-label">Promotion case</div><div class="insight-body">${data.promotion_case}</div></div>` : ''}
      ${storyItems ? `<div class="insight-card"><div class="insight-label">Interview story bank</div>${storyItems}</div>` : ''}
      ${data.growth_areas ? `<div class="insight-card"><div class="insight-label">Pattern to notice</div><div class="insight-body">${data.growth_areas}</div></div>` : ''}
      ${data.next_30_days ? `<div class="insight-card highlight"><div class="insight-label" style="color:#C4654A;border-bottom-color:rgba(196,101,74,0.2)">Next 30 days</div><div class="insight-body" style="font-style:italic">${data.next_30_days}</div></div>` : ''}`;

  } catch (err) {
    hide('insights-loading');
    el.innerHTML = `<div class="empty-state">Error loading insights: ${err.message}</div>`;
    console.error(err);
  }
}

// ── Utilities ─────────────────────────────────────────────
function show(id) { document.getElementById(id).style.display = 'flex'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
