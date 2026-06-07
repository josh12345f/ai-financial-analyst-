# WORLD MARKET WATCHER

A deployed-ready AI market intelligence web terminal inspired by World Monitor and Bloomberg-style institutional dashboards.

## What It Includes

- Next.js full-screen web terminal
- Server-side API connectors for live market, news, macro, government, crypto, SEC, Congress, Federal Register, GDELT, World Bank, Census, and BLS data
- AI assistant endpoint using OpenAI when `OPENAI_API_KEY` exists
- Watchlist, predictions, DCF-style valuation panel, live news feed, risk monitor, source attribution, and missing-key status panel
- Dark dense command-center UI
- No committed API keys and no fake hard-coded market/news/event data

## Deploy On Vercel

1. Import this GitHub repo into Vercel.
2. Framework: Next.js.
3. Root directory: repo root.
4. Build command: `npm run build`.
5. Install command: `npm install`.
6. Add the environment variables from `.env.example` in Vercel Project Settings.
7. Deploy.

The live app calls internal `/api/*` routes. Secret provider keys stay server-side.

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Important Security Rule

Do not commit `.env` or `.env.local`. Put real API keys in Vercel Environment Variables only.
