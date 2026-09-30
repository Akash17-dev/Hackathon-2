# Campaign Desk

Multi-platform marketing content agent for a hackathon. One product brief becomes separate drafts for LinkedIn, Instagram, Facebook, and YouTube. You can edit each draft, then simulate approve-and-publish. Nothing is posted to a real social account.

## What it does

- Takes a product name, target audience, campaign objective, key benefits, and tone.
- Writes platform-specific copy, hashtags or tags, a call to action, and an image or video prompt.
- Lets a person review and edit before publish.
- Saves campaign history in MongoDB.

Copy is requested from Gemini, then Grok. If both are missing or fail, a built-in generator still fills all four platforms.

## Stack

- Next.js 15 (App Router), React 19, TypeScript
- MongoDB Atlas
- Deployed on Vercel

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000.

Fill `.env` from the variable list below. `.env` is gitignored.

## Environment variables

Set these in `.env` locally and in Vercel under Project Settings → Environment Variables. Do not prefix them with `NEXT_PUBLIC_`.

| Name | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | yes | Atlas connection string |
| `MONGODB_DB` | no | Defaults to `hackathon` |
| `GEMINI_API_KEY` | no | Used first for copy |
| `GEMINI_MODEL` | no | Defaults to `gemini-2.5-flash` |
| `XAI_API_KEY` | no | Grok, used if Gemini fails |
| `XAI_MODEL` | no | Defaults to `grok-3` |

In Atlas → Network Access, allow `0.0.0.0/0` so Vercel can connect.

## Deploy

Import the repo into Vercel and choose the Next.js preset. Add the environment variables, then deploy. On Vercel, campaigns are stored only in MongoDB.
