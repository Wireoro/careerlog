/*
  scoring.js — CareerLog scoring engine
  Calculates a 300–850 career score from journal entries and mood data.
  Loaded as a private file by the server, not exposed as a public API.
  Import in server.js: const { calculateScore } = require('./scoring');
*/

// ── Pillar weights ────────────────────────────────────────
const WEIGHTS = {
  consistency:    0.25,
  impactQuality:  0.25,
  categoryMix:    0.20,
  selfAwareness:  0.15,
  entryDepth:     0.15,
};

// ── Max raw points per pillar (maps to 0–110 contribution each) ──
const PILLAR_CAP = 550;
const BASE_SCORE = 300;
const MAX_SCORE  = 850;

// ── Helpers ───────────────────────────────────────────────
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function mapToContribution(rawPoints, weight) {
  const capped = clamp(rawPoints, 0, PILLAR_CAP);
  return (capped / PILLAR_CAP) * (MAX_SCORE - BASE_SCORE) * weight;
}

function wordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function containsNumber(text) {
  return /\d/.test(text || '');
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return monday.toISOString().split('T')[0];
}

// ── Pillar 1: Consistency ─────────────────────────────────
function scoreConsistency(entries) {
  if (!entries.length) return 0;

  // Group entries by week
  const weeks = {};
  entries.forEach(e => {
    const wk = getWeekKey(e.entry_date);
    weeks[wk] = (weeks[wk] || 0) + 1;
  });

  const weekKeys  = Object.keys(weeks).sort();
  const totalWeeks = weekKeys.length;
  let raw = 0;

  // Points per active week
  weekKeys.forEach(wk => {
    raw += 15; // base per week logged
    if (weeks[wk] >= 3) raw += 10; // 3+ entries in a week
    if (weeks[wk] >= 5) raw += 15; // 5+ entries in a week
  });

  // Streak bonuses — count consecutive active weeks
  let currentStreak = 1;
  let maxStreak     = 1;
  for (let i = 1; i < weekKeys.length; i++) {
    const prev = new Date(weekKeys[i - 1]);
    const curr = new Date(weekKeys[i]);
    const diff = (curr - prev) / (7 * 24 * 60 * 60 * 1000);
    if (diff <= 1.5) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  if (maxStreak >= 4)  raw += 20;  // 4-week streak
  if (maxStreak >= 8)  raw += 30;  // 8-week streak
  if (maxStreak >= 12) raw += 50;  // 12-week streak

  // Penalty: gaps (weeks with no entry between first and last)
  if (weekKeys.length >= 2) {
    const firstWeek = new Date(weekKeys[0]);
    const lastWeek  = new Date(weekKeys[weekKeys.length - 1]);
    const spanWeeks = Math.round((lastWeek - firstWeek) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const missedWeeks = spanWeeks - totalWeeks;
    raw -= missedWeeks * 10;
  }

  return Math.max(raw, 0);
}

// ── Pillar 2: Impact quality ──────────────────────────────
function scoreImpactQuality(entries) {
  let raw = 0;
  entries.forEach(e => {
    const impact = e.impact_level || 0;
    if (impact === 5) raw += 30;
    else if (impact === 4) raw += 18;
    else if (impact === 3) raw += 8;
    else if (impact <= 2 && impact > 0) raw += 3;

    // Bonus for quantified entries
    if (containsNumber(e.content)) raw += 5;
  });
  return Math.max(raw, 0);
}

// ── Pillar 3: Category mix ────────────────────────────────
function scoreCategoryMix(entries) {
  const ALL_CATS = ['win', 'metric', 'feedback', 'decision', 'lesson', 'challenge'];
  const usedCats = new Set(entries.map(e => e.category).filter(Boolean));
  let raw = 0;

  const count = usedCats.size;
  if (count >= 2) raw += 10;
  if (count >= 3) raw += 15;
  if (count >= 4) raw += 20;
  if (count >= 5) raw += 25;
  if (count === 6) raw += 30; // all categories used

  // Bonus for reflective categories
  if (usedCats.has('feedback')) raw += 10;
  if (usedCats.has('lesson'))   raw += 10;
  if (usedCats.has('decision')) raw += 8;

  // Penalty for single-category
  if (count === 1 && entries.length >= 5) raw -= 10;

  return Math.max(raw, 0);
}

// ── Pillar 4: Self-awareness (mood) ──────────────────────
function scoreSelfAwareness(moodRows) {
  if (!moodRows || !moodRows.length) return 0;
  let raw = 0;

  // Points per mood entry
  moodRows.forEach(r => {
    raw += 12; // base per week logged
    if (r.primary_emotion) raw += 8;
    if (r.highlight && r.highlight.trim()) raw += 3;
    if (r.lowlight && r.lowlight.trim())   raw += 2;
    if (r.highlight && r.lowlight)         raw += 5; // both filled
  });

  // Streak bonus for consecutive mood weeks
  const sortedWeeks = moodRows
    .map(r => r.week_of)
    .sort();

  let streak = 1, maxStreak = 1;
  for (let i = 1; i < sortedWeeks.length; i++) {
    const prev = new Date(sortedWeeks[i - 1]);
    const curr = new Date(sortedWeeks[i]);
    const diff = (curr - prev) / (7 * 24 * 60 * 60 * 1000);
    if (diff <= 1.5) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 1;
  }
  if (maxStreak >= 4)  raw += 20;
  if (maxStreak >= 8)  raw += 40;

  // Penalty: long gap since last mood entry
  if (moodRows.length > 0) {
    const lastMood = new Date(sortedWeeks[sortedWeeks.length - 1]);
    const daysSince = (Date.now() - lastMood) / (24 * 60 * 60 * 1000);
    if (daysSince > 30) raw -= 15;
    if (daysSince > 60) raw -= 15;
  }

  return Math.max(raw, 0);
}

// ── Pillar 5: Entry depth ─────────────────────────────────
function scoreEntryDepth(entries) {
  let raw = 0;
  entries.forEach(e => {
    const words = wordCount(e.content);
    if (words >= 200)     raw += 15;
    else if (words >= 100) raw += 8;
    else if (words >= 50)  raw += 4;
    else if (words < 30)   raw -= 5; // penalty for very short entries

    const tagCount = (e.tags || []).length;
    if (tagCount >= 3) raw += 5;
    else if (tagCount >= 1) raw += 2;
  });
  return Math.max(raw, 0);
}

// ── Main: calculate full career score ─────────────────────
function calculateScore(entries, moodRows) {
  const pillars = {
    consistency:   scoreConsistency(entries),
    impactQuality: scoreImpactQuality(entries),
    categoryMix:   scoreCategoryMix(entries),
    selfAwareness: scoreSelfAwareness(moodRows),
    entryDepth:    scoreEntryDepth(entries),
  };

  const contribution = {};
  let total = BASE_SCORE;

  Object.entries(pillars).forEach(([key, raw]) => {
    const contrib = mapToContribution(raw, WEIGHTS[key]);
    contribution[key] = Math.round(contrib);
    total += contrib;
  });

  const finalScore = Math.round(clamp(total, BASE_SCORE, MAX_SCORE));

  return {
    score:        finalScore,
    tier:         getTier(finalScore),
    pillars:      pillars,
    contribution: contribution,
    breakdown: {
      consistency:   { raw: pillars.consistency,   weight: WEIGHTS.consistency,   contribution: contribution.consistency   },
      impactQuality: { raw: pillars.impactQuality, weight: WEIGHTS.impactQuality, contribution: contribution.impactQuality },
      categoryMix:   { raw: pillars.categoryMix,   weight: WEIGHTS.categoryMix,   contribution: contribution.categoryMix   },
      selfAwareness: { raw: pillars.selfAwareness, weight: WEIGHTS.selfAwareness, contribution: contribution.selfAwareness },
      entryDepth:    { raw: pillars.entryDepth,    weight: WEIGHTS.entryDepth,    contribution: contribution.entryDepth    },
    },
  };
}

// ── Tier lookup ───────────────────────────────────────────
function getTier(score) {
  if (score >= 800) return { label: 'Elite track record', grade: 'A+', color: '#185FA5' };
  if (score >= 700) return { label: 'Exceptional',        grade: 'A',  color: '#3B6D11' };
  if (score >= 600) return { label: 'Strong',             grade: 'B',  color: '#6B8F71' };
  if (score >= 500) return { label: 'Building',           grade: 'C',  color: '#C4A46C' };
  if (score >= 400) return { label: 'Developing',         grade: 'D',  color: '#C4654A' };
  return               { label: 'Just started',          grade: '—',  color: '#A09688' };
}

module.exports = { calculateScore, getTier, WEIGHTS };
