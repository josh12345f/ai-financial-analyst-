# Free API Key Checklist

Add these in Vercel Project Settings > Environment Variables. Do not put real keys in GitHub.

## Already Supported

- `OPENAI_API_KEY` - OpenAI Platform. Needed for hosted AI assistant answers.
- `ALPHA_VANTAGE_API_KEY` - Alpha Vantage free tier. Market quotes.
- `FINNHUB_API_KEY` - Finnhub free tier. Quotes and market news.
- `NEWS_API_KEY` - NewsAPI free developer tier. Business/live news.
- `WORLD_NEWS_API_KEY` - World News API. Additional headlines.
- `FRED_API_KEY` - FRED. Economic indicators.
- `BLS_API_KEY` - BLS. Labor/inflation connector status and expansion.
- `CONGRESS_API_KEY` - Congress.gov. Bills and legislation.
- `CENSUS_API_KEY` - Census. Macro/real estate expansion.
- `COINGECKO_API_KEY` - Optional. Current app can use public CoinGecko endpoints without a key.
- `SEC_USER_AGENT` - Required descriptive SEC EDGAR user agent. Example: `WorldMarketWatcher/1.0 your-email@example.com`.

## Optional / Expansion

- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`
- `BINANCE_API_KEY`, `BINANCE_SECRET_KEY`
- `HUD_API_KEY`
- `ACLED_API_KEY`
- `NASA_FIRMS_API_KEY`
- `OPENSKY_USERNAME`, `OPENSKY_PASSWORD`
- `AISSTREAM_API_KEY`
- `BIS_BASE_URL`, `IMF_BASE_URL`, `UCDP_BASE_URL`

## Vercel Setup

1. Open your Vercel project.
2. Go to Settings > Environment Variables.
3. Add each key for Production, Preview, and Development if you want all environments working.
4. Redeploy after adding or changing keys.

Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. This app intentionally does not use public secret variables.
