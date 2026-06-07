# IntelliQ Platform

**Universal performance intelligence system** — AI-driven decision-making assessments, proactive coaching alerts, and member wellbeing monitoring across schools, sports teams, workplaces, military units, healthcare, and government.

## What it does

**For coaches & admins (Platform)**
- Write a plain-language brief → AI drafts a scenario → you review and approve → member receives it
- Proactive alerts: IntelliQ watches for score drift, silent wellness drops, and unanswered flags *before* they become crises
- Coach debrief after every scenario: what the member's responses reveal, what to watch for, specific actions
- Rich media support: attach film (Hudl/YouTube), PDFs, Word docs, spreadsheets, images to any scenario
- Full org hierarchy — you define the structure, IntelliQ watches all levels including the admin

**For members (Member App)**
- Receive scenarios assigned by coach, complete them via conversational AI chat
- Daily check-in (mood + note)
- See your own IntelliQ scores and dimension breakdown

## Architecture

```
IntelliQ Engine (server.js)  ←  Claude API (Anthropic)
        ↓
Platform (index.html)        ←  Coach / Admin dashboard
Member App (member/)         ←  Timmy's interface
```

## Running locally

```bash
# 1. Install dependencies
npm install

# 2. Set your API key
cp .env.example .env
# edit .env and add your ANTHROPIC_API_KEY

# 3. Start the server
node server.js

# Platform  → http://localhost:3000
# Member App → http://localhost:3000/member/
```

## Deploying to Render

1. Push this repo to GitHub
2. Connect repo on [render.com](https://render.com) → New Web Service
3. Add environment variable: `ANTHROPIC_API_KEY` = your key
4. Deploy — Render reads `render.yaml` automatically

## Tech stack

- **Backend:** Node.js + Express + Anthropic SDK
- **Frontend:** Vanilla JS (no framework) — intentionally lightweight
- **AI:** Claude (Haiku) via Anthropic API
- **Rich media:** JSZip (docx/pptx), SheetJS (xlsx), native Claude multimodal (images/PDF)

---

*Built on the IntelliQ Engine — the intelligence layer that powers Platform, the Member App, and future products.*
