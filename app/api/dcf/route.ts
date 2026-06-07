import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SourceState = "ok" | "missing_key" | "unavailable" | "error";

type DcfLookup = {
  symbol: string;
  companyName: string | null;
  price: number | null;
  source: string | null;
  status: "ready" | "unavailable";
  sources: Record<string, SourceState>;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = sanitizeSymbol(url.searchParams.get("symbol") || "");
  const sources: Record<string, SourceState> = {};

  if (!symbol) {
    return NextResponse.json({
      symbol: "",
      companyName: null,
      price: null,
      source: null,
      status: "unavailable",
      sources
    } satisfies DcfLookup);
  }

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY;

  const [quote, overview] = await Promise.all([
    configured(finnhubKey)
      ? fetchJson<Record<string, number>>(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(finnhubKey!)}`)
      : Promise.resolve(null),
    configured(alphaKey)
      ? fetchJson<Record<string, string>>(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(alphaKey!)}`)
      : Promise.resolve(null)
  ]);

  sources.Finnhub = configured(finnhubKey) ? quote?.c ? "ok" : "unavailable" : "missing_key";
  sources["Alpha Vantage"] = configured(alphaKey) ? overview?.Name ? "ok" : "unavailable" : "missing_key";

  const price = number(quote?.c);
  const companyName = text(overview?.Name) || null;

  return NextResponse.json({
    symbol,
    companyName,
    price,
    source: price == null ? null : "Finnhub",
    status: price == null && !companyName ? "unavailable" : "ready",
    sources
  } satisfies DcfLookup);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store"
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function sanitizeSymbol(value: string) {
  const symbol = value.trim().toUpperCase();
  return /^[A-Z0-9.-]{1,15}$/.test(symbol) ? symbol : "";
}

function configured(value: string | undefined) {
  return Boolean(value && !value.startsWith("<") && !value.toLowerCase().includes("your "));
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
