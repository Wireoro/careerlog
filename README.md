# CareerLog

A journaling app for working professionals. Log your wins daily — get your promotion case automatically.

## Stack

- **Frontend** — plain HTML, CSS, JS (no framework)
- **Backend** — [Supabase](https://supabase.com) (PostgreSQL)
- **AI** — [Anthropic Claude](https://anthropic.com) (insights generation)
- **Hosting** — Netlify or Vercel (recommended)

---

## Local development

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/careerlog.git
cd careerlog
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your real values:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Generate the local env bridge

```bash
node generate-env.js
```

This creates `env.js` (gitignored) which makes your `.env` values available to the browser.

### 4. Start a local server

Using VS Code Live Server, or:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

Open `http://localhost:8080`.

> **Do not** open `index.html` by double-clicking — the browser blocks API calls from `file://` URLs.

---

## Deployment (Netlify)

1. Push your repo to GitHub (`.env` and `env.js` are gitignored — safe to push)
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
3. Set build settings:
   - Build command: *(leave empty)*
   - Publish directory: `.`
4. Go to **Site settings → Environment variables** and add:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY`
5. Deploy — Netlify injects the env vars at build time via a `_headers` or build plugin

> For Netlify specifically, install the [Netlify CLI](https://docs.netlify.com/cli/get-started/) to inject env vars automatically: `netlify dev`

## Deployment (Vercel)

Same as Netlify — push to GitHub, import project, add env vars in the Vercel dashboard.

---

## Database

Tables are managed in [Supabase](https://supabase.com):

| Table | Purpose |
|---|---|
| `journal_entries` | Every journal entry a user writes |
| `entry_insights` | AI-generated insights linked to each entry |

To view your data: Supabase dashboard → Table Editor.

---

## Project structure

```
careerlog/
├── index.html          — app shell
├── .env                — secrets (gitignored)
├── .env.example        — template, safe to commit
├── .gitignore
├── generate-env.js     — local dev helper
├── README.md
└── src/
    ├── app.js          — all application logic
    ├── config.js       — reads env vars, exports them
    └── style.css       — all styles
```

## Roadmap

- [ ] User authentication (Supabase Auth)
- [ ] Promotion packet PDF export
- [ ] LinkedIn post generator
- [ ] Review cycle prep (filter by date range)
- [ ] Mobile app (PWA)
