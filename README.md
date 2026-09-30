# Campaign Desk

A local marketing agent that turns one product brief into editable LinkedIn, Instagram, Facebook, and YouTube drafts.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000.

## Keys

Generation order:

1. `GEMINI_API_KEY` (model `GEMINI_MODEL`, default `gemini-2.5-flash`)
2. `XAI_API_KEY` for Grok (model `XAI_MODEL`, default `grok-3`)
3. Built-in studio generator if both are missing or fail

`.env` is gitignored. Do not commit keys.

Approve and publish is simulated. Campaigns are stored in MongoDB (`MONGODB_URI`, database `MONGODB_DB`). Locally, campaigns still in `data/campaigns.json` are inserted into that database when missing. On Vercel the JSON file is not used.

## Deploy on Vercel

Import this repo. Framework preset is Next.js. In Project Settings → Environment Variables, add:

| Name | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | yes | Atlas connection string |
| `MONGODB_DB` | no | Defaults to `hackathon` |
| `GEMINI_API_KEY` | no | Used first for copy |
| `GEMINI_MODEL` | no | Defaults to `gemini-2.5-flash` |
| `XAI_API_KEY` | no | Grok, used if Gemini fails |
| `XAI_MODEL` | no | Defaults to `grok-3` |

Copy the values from your local `.env`. Do not prefix them with `NEXT_PUBLIC_`. In Atlas → Network Access, allow `0.0.0.0/0` so Vercel’s changing addresses can connect.
