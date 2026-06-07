# Free API Sources for World Market Watcher

Do not put real keys in GitHub. Add keys in Vercel Project Settings under Environment Variables.

## Already wired with no API key

These work without an account or secret key:

- USGS Earthquake Hazards API: significant earthquakes and seismic risk map layer.
- NASA EONET: open natural events including wildfires, storms, volcanoes, dust, and floods.
- NOAA/NWS Alerts API: active U.S. weather warnings and advisories.
- Open-Meteo: no-key weather snapshots for market hubs, ports, energy corridors, and semiconductor corridors.
- ReliefWeb API: disaster and humanitarian event intelligence.
- UCDP API: conflict event data when the public endpoint is available.
- OpenSky Network API: unauthenticated aircraft state sample when public access is available.
- GDELT DOC API: global news/geopolitical event discovery.
- Federal Register API: U.S. regulation tracking.
- SEC EDGAR: filings, company submissions, and filing URLs.
- World Bank v2: global macro indicators.
- IMF DataMapper: macro growth data.
- CoinGecko public API: crypto prices, with optional demo key support.
- OpenStreetMap tiles: base map rendering.
- Public status-page APIs: OpenAI, GitHub, Cloudflare, Vercel, and Anthropic incident feeds.

## Free keys you can request for more coverage

These require you to create a free account/key yourself:

- `OPENAI_API_KEY`: AI assistant and executive summaries.
- `ALPHA_VANTAGE_API_KEY`: stocks, ETFs, commodities, fundamentals, and time series.
- `FINNHUB_API_KEY`: quotes, company news, profiles, earnings, and market feeds.
- `NEWS_API_KEY`: broader live news search.
- `WORLD_NEWS_API_KEY`: broader world news search.
- `FRED_API_KEY`: economic indicators and rates.
- `BLS_API_KEY`: labor and inflation data.
- `CONGRESS_API_KEY`: bills, laws, and legislative activity.
- `CENSUS_API_KEY`: U.S. demographic and real estate context.
- `COINGECKO_API_KEY`: higher crypto API limits.
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`: social sentiment.
- `NASA_FIRMS_API_KEY`: satellite fire detections.
- `ACLED_API_KEY`: premium conflict/event coverage if your plan grants API access.
- `AISSTREAM_API_KEY`: live maritime/AIS stream.
- `OPENSKY_USERNAME`, `OPENSKY_PASSWORD`: higher OpenSky limits if available.
- `HUD_API_KEY`: housing and real estate data if available.

## Optional free market-data providers to add next

These have free tiers but are not all wired yet:

- Polygon.io free tier: U.S. market data limits vary by plan.
- Twelve Data free tier: equities, forex, crypto, and technical indicators.
- Financial Modeling Prep free tier: company financials and ratios.
- Marketstack free tier: end-of-day equities.
- Nasdaq Data Link free datasets: macro and alternative data.
- IEX Cloud successor/free alternatives vary by availability.

## Reality check

No free API legally provides every news article, every stock tick, every ship, every aircraft, and every conflict event at full fidelity. The app therefore uses a layered approach:

1. Use no-key public data immediately.
2. Use your free keys where available.
3. Show `unavailable`, `missing_key`, or `error` instead of fake data when a provider blocks, rate limits, or has no public API.
4. Keep the browser client calling only internal server routes so secret keys never reach the frontend.
