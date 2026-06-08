"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SourceState = "ok" | "missing_key" | "unavailable" | "error";
type Severity = "INFO" | "WATCH" | "ALERT" | "CRITICAL";
type NewsRow = { title: string; source: string; url: string; category: string; severity: Severity; publishedAt: string; summary?: string };
type FinancialYear = {
  fiscalYear: string;
  fiscalDate: string;
  revenue: number | null;
  revenueGrowth: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  ebitda: number | null;
  ebit: number | null;
  ebitMargin: number | null;
  netIncome: number | null;
  incomeBeforeTax: number | null;
  taxes: number | null;
  taxRate: number | null;
  interestExpense: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  fcfMargin: number | null;
  cash: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  workingCapital: number | null;
  shares: number | null;
};
type WaccDetail = {
  riskFreeRate: number | null;
  beta: number | null;
  equityRiskPremium: number;
  costOfEquity: number | null;
  preTaxCostOfDebt: number | null;
  afterTaxCostOfDebt: number | null;
  taxRate: number | null;
  equityValue: number | null;
  debtValue: number | null;
  equityWeight: number | null;
  debtWeight: number | null;
  wacc: number | null;
};
type Scenario = {
  name: "Base Case" | "Growth Case" | "No-Growth / Downside Case";
  probability: number;
  revenueGrowth: number | null;
  fcfMargin: number | null;
  wacc: number | null;
  terminalGrowthRate: number | null;
  exitMultiple: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  intrinsicValuePerShare: number | null;
  upsideDownsidePercent: number | null;
  terminalValuePercent: number | null;
  impliedEvEbitda: number | null;
  impliedPe: number | null;
  bullCase: string;
  bearCase: string;
  baseCase: string;
};
type ForecastRow = { scenario: string; year: number; revenue: number | null; freeCashFlow: number | null; presentValueFcf: number | null };
type SensitivityRow = { wacc: number; values: Array<{ terminalGrowthRate: number; valuePerShare: number | null }> };
type Prediction = { label: string; prediction: string; probability: number; timeHorizon: string; evidence: string[]; watchItems: string[] };
type DcfResponse = {
  symbol: string;
  companyName: string | null;
  price: number | null;
  source: string | null;
  status: "ready" | "unavailable";
  sources: Record<string, SourceState>;
  generatedAt: string;
  profile: {
    sector: string | null;
    industry: string | null;
    description: string | null;
    marketCap: number | null;
    analystTargetPrice: number | null;
    beta: number | null;
    peRatio: number | null;
    profitMargin: number | null;
    revenueTtm: number | null;
    cik: string | null;
  };
  metrics: {
    revenue: number | null;
    grossMargin: number | null;
    ebitda: number | null;
    ebit: number | null;
    taxes: number | null;
    operatingCashFlow: number | null;
    capex: number | null;
    freeCashFlow: number | null;
    fcfMargin: number | null;
    workingCapital: number | null;
    cash: number | null;
    totalDebt: number | null;
    netDebt: number | null;
    shares: number | null;
    revenueGrowthTrend: number | null;
  };
  wacc: WaccDetail;
  historical: FinancialYear[];
  scenarios: Scenario[];
  forecasts: ForecastRow[];
  sensitivity: { waccValues: number[]; terminalGrowthValues: number[]; rows: SensitivityRow[] };
  predictions: Prediction[];
  research: {
    valuationSummary: string;
    investmentMemo: string;
    businessSummary: string;
    newsSummary: string;
    filingSummary: string;
    macroSummary: string;
    catalysts: string[];
    risks: string[];
    whatToVerify: string[];
    confidence: number;
    sourcesUsed: string[];
  };
  evidence: { news: NewsRow[]; filings: NewsRow[] };
  sourceLinks: Array<{ label: string; url: string }>;
};

type MetricRow = { label: string; value: string; source?: string };

const quickSymbols = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "XOM", "AMD"];
const unavailable = "Unavailable";

export function DcfResearchWorkbench({ compact = false }: { compact?: boolean }) {
  const [symbol, setSymbol] = useState("AAPL");
  const [result, setResult] = useState<DcfResponse | null>(null);
  const [activeScenario, setActiveScenario] = useState<string>("Base Case");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = cleanSymbol(params.get("symbol") || "AAPL");
    setSymbol(initial);
    void load(initial, true);
  }, []);

  async function load(nextSymbol?: string, replaceHistory = false) {
    const ticker = cleanSymbol(nextSymbol || symbol);
    if (!ticker) {
      setError("Enter a valid public ticker symbol.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dcf?symbol=${encodeURIComponent(ticker)}`, { cache: "no-store" });
      const data = (await response.json()) as DcfResponse;
      if (!response.ok) throw new Error("DCF request failed");
      setResult(data);
      setSymbol(data.symbol || ticker);
      setActiveScenario(data.scenarios?.[0]?.name || "Base Case");
      if (!compact) {
        const target = `/dcf?symbol=${encodeURIComponent(data.symbol || ticker)}`;
        if (replaceHistory) window.history.replaceState(null, "", target);
        else window.history.pushState(null, "", target);
      }
    } catch {
      setError("DCF data is unavailable right now. Check API keys and try again.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(symbol);
  }

  const selectedScenario = useMemo(() => {
    return result?.scenarios.find((scenario) => scenario.name === activeScenario) || result?.scenarios[0] || null;
  }, [activeScenario, result]);

  const sourcedInputs = useMemo<MetricRow[]>(() => {
    if (!result) return [];
    return [
      { label: "Current price", value: money(result.price), source: result.source || "Market quote" },
      { label: "Market cap", value: compactMoney(result.profile.marketCap), source: "Alpha Vantage / price" },
      { label: "Revenue", value: compactMoney(result.metrics.revenue), source: "Alpha Vantage financials" },
      { label: "Revenue trend", value: pctFraction(result.metrics.revenueGrowthTrend), source: "Annual statements" },
      { label: "Gross margin", value: pctFraction(result.metrics.grossMargin), source: "Income statement" },
      { label: "FCF margin", value: pctFraction(result.metrics.fcfMargin), source: "Cash flow statement" },
      { label: "EBITDA", value: compactMoney(result.metrics.ebitda), source: "Income statement" },
      { label: "Free cash flow", value: compactMoney(result.metrics.freeCashFlow), source: "Operating cash flow - capex" },
      { label: "Net debt", value: compactMoney(result.metrics.netDebt), source: "Balance sheet" },
      { label: "Shares outstanding", value: compactNumber(result.metrics.shares), source: "Alpha Vantage / derived" }
    ];
  }, [result]);

  return (
    <main className={`dcfTerminal ${compact ? "dcfCompact" : ""}`}>
      {!compact ? (
        <header className="dcfTopbar">
          <a className="dcfBrand" href="/">WORLD MARKET WATCHER</a>
          <span className="dcfMode">DCF RESEARCH TERMINAL</span>
          <a className="dcfLink" href="/">Global dashboard</a>
          <span className="dcfLive">LIVE SOURCED DATA</span>
        </header>
      ) : null}

      <section className="dcfHeroPanel">
        <div>
          <p className="dcfEyebrow">Ticker-driven valuation workbench</p>
          <h1>{result?.companyName || result?.symbol || "Public stock DCF analysis"}</h1>
          <p className="dcfSubcopy">
            Enter any public ticker. The model pulls company data, live quote, financial statements, SEC filings, market news, macro rates, WACC, scenarios, predictions, and source links automatically.
          </p>
        </div>
        <form className="dcfSearch" onSubmit={submit}>
          <label htmlFor="dcfTicker">Ticker</label>
          <div className="dcfSearchRow">
            <input
              id="dcfTicker"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder="AAPL"
              spellCheck={false}
            />
            <button type="submit" disabled={loading}>{loading ? "Researching" : "Run DCF"}</button>
          </div>
          <div className="dcfQuickRow">
            {quickSymbols.map((ticker) => (
              <button key={ticker} type="button" onClick={() => void load(ticker)}>{ticker}</button>
            ))}
          </div>
        </form>
      </section>

      {error ? <div className="dcfError">{error}</div> : null}
      {loading && !result ? <DcfLoading /> : null}

      {result ? (
        <>
          <section className="dcfCommandStrip">
            <Stat label="Symbol" value={result.symbol} />
            <Stat label="Price" value={money(result.price)} tone={movementTone(selectedScenario?.upsideDownsidePercent)} />
            <Stat label="Fair value" value={money(selectedScenario?.intrinsicValuePerShare ?? null)} tone={movementTone(selectedScenario?.upsideDownsidePercent)} />
            <Stat label="Upside/downside" value={pctPoint(selectedScenario?.upsideDownsidePercent ?? null)} tone={movementTone(selectedScenario?.upsideDownsidePercent)} />
            <Stat label="Confidence" value={score(result.research.confidence)} />
            <Stat label="Updated" value={shortTime(result.generatedAt)} />
          </section>

          <section className="dcfGrid dcfGridMain">
            <Panel title="Valuation Scenarios" kicker="DCF model">
              <div className="dcfScenarioGrid">
                {result.scenarios.map((scenario) => (
                  <button
                    type="button"
                    key={scenario.name}
                    className={`dcfScenario ${scenario.name === activeScenario ? "active" : ""}`}
                    onClick={() => setActiveScenario(scenario.name)}
                  >
                    <span>{scenario.name}</span>
                    <strong>{money(scenario.intrinsicValuePerShare)}</strong>
                    <small className={movementTone(scenario.upsideDownsidePercent)}>{pctPoint(scenario.upsideDownsidePercent)} vs market</small>
                    <small>Probability {probability(scenario.probability)}</small>
                  </button>
                ))}
              </div>
              {selectedScenario ? (
                <div className="dcfScenarioDetail">
                  <p>{selectedScenario.baseCase}</p>
                  <div className="dcfMiniGrid">
                    <Stat label="Revenue growth" value={pctFraction(selectedScenario.revenueGrowth)} />
                    <Stat label="FCF margin" value={pctFraction(selectedScenario.fcfMargin)} />
                    <Stat label="WACC" value={pctFraction(selectedScenario.wacc)} />
                    <Stat label="Terminal growth" value={pctFraction(selectedScenario.terminalGrowthRate)} />
                    <Stat label="Exit multiple" value={multiple(selectedScenario.exitMultiple)} />
                    <Stat label="Terminal value" value={pctFraction(selectedScenario.terminalValuePercent)} />
                  </div>
                </div>
              ) : null}
            </Panel>

            <Panel title="Auto-Sourced Inputs" kicker="No manual entry">
              <div className="dcfMetricTable">
                {sourcedInputs.map((item) => (
                  <div className="dcfMetricRow" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <em>{item.source}</em>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="WACC Engine" kicker="Macro + company risk">
              <div className="dcfWaccStack">
                <Meter label="Risk-free rate" value={result.wacc.riskFreeRate} />
                <Meter label="Cost of equity" value={result.wacc.costOfEquity} />
                <Meter label="After-tax debt" value={result.wacc.afterTaxCostOfDebt} />
                <Meter label="Tax rate" value={result.wacc.taxRate} />
                <Meter label="Final WACC" value={result.wacc.wacc} important />
              </div>
              <div className="dcfMiniGrid tight">
                <Stat label="Beta" value={numberText(result.wacc.beta, 2)} />
                <Stat label="ERP" value={pctFraction(result.wacc.equityRiskPremium)} />
                <Stat label="Equity weight" value={pctFraction(result.wacc.equityWeight)} />
                <Stat label="Debt weight" value={pctFraction(result.wacc.debtWeight)} />
              </div>
            </Panel>
          </section>

          <section className="dcfGrid dcfGridTables">
            <Panel title="Historical Financials" kicker="Annual source data">
              <div className="dcfTableWrap">
                <table className="dcfTable">
                  <thead>
                    <tr>
                      <th>Year</th><th>Revenue</th><th>Growth</th><th>EBIT</th><th>OCF</th><th>Capex</th><th>FCF</th><th>Net debt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.historical.slice(0, 6).map((row) => (
                      <tr key={`${result.symbol}-${row.fiscalYear}`}>
                        <td>{row.fiscalYear}</td>
                        <td>{compactMoney(row.revenue)}</td>
                        <td>{pctFraction(row.revenueGrowth)}</td>
                        <td>{compactMoney(row.ebit)}</td>
                        <td>{compactMoney(row.operatingCashFlow)}</td>
                        <td>{compactMoney(row.capex)}</td>
                        <td>{compactMoney(row.freeCashFlow)}</td>
                        <td>{compactMoney(row.netDebt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Forecast Build" kicker={selectedScenario?.name || "Scenario"}>
              <div className="dcfTableWrap">
                <table className="dcfTable">
                  <thead>
                    <tr><th>Year</th><th>Revenue</th><th>Free cash flow</th><th>PV of FCF</th></tr>
                  </thead>
                  <tbody>
                    {result.forecasts.filter((row) => !selectedScenario || row.scenario === selectedScenario.name).map((row) => (
                      <tr key={`${row.scenario}-${row.year}`}>
                        <td>Y{row.year}</td>
                        <td>{compactMoney(row.revenue)}</td>
                        <td>{compactMoney(row.freeCashFlow)}</td>
                        <td>{compactMoney(row.presentValueFcf)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>

          <section className="dcfGrid dcfGridResearch">
            <Panel title="Sensitivity Matrix" kicker="Value per share">
              <div className="dcfTableWrap">
                <table className="dcfTable dcfSensitivity">
                  <thead>
                    <tr>
                      <th>WACC / TG</th>
                      {result.sensitivity.terminalGrowthValues.map((value) => <th key={`tg-${value}`}>{pctFraction(value)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.sensitivity.rows.map((row) => (
                      <tr key={`wacc-${row.wacc}`}>
                        <td>{pctFraction(row.wacc)}</td>
                        {row.values.map((cell) => (
                          <td key={`${row.wacc}-${cell.terminalGrowthRate}`} className={valueHeat(cell.valuePerShare, result.price)}>{money(cell.valuePerShare)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="AI Prediction Signals" kicker="Probabilistic intelligence">
              <div className="dcfPredictions">
                {result.predictions.map((prediction, index) => (
                  <article key={`${prediction.label}-${index}`}>
                    <div>
                      <span>{prediction.label}</span>
                      <strong>{probability(prediction.probability)}</strong>
                    </div>
                    <p>{prediction.prediction}</p>
                    <small>{prediction.timeHorizon}</small>
                    <ul>
                      {prediction.evidence.slice(0, 3).map((item, itemIndex) => <li key={`${prediction.label}-evidence-${itemIndex}`}>{item}</li>)}
                    </ul>
                  </article>
                ))}
              </div>
              <p className="dcfDisclaimer">Probabilistic intelligence only. This is not financial advice.</p>
            </Panel>

            <Panel title="Research Memo" kicker="Source-backed analysis">
              <div className="dcfMemo">
                <h3>Valuation summary</h3>
                <p>{result.research.valuationSummary}</p>
                <h3>Investment memo</h3>
                <p>{result.research.investmentMemo}</p>
                <h3>Business model</h3>
                <p>{result.research.businessSummary || result.profile.description || unavailable}</p>
                <h3>Macro and filing context</h3>
                <p>{result.research.macroSummary}</p>
                <p>{result.research.filingSummary}</p>
              </div>
            </Panel>
          </section>

          <section className="dcfGrid dcfGridEvidence">
            <Panel title="Catalysts And Red Flags" kicker="What changed">
              <div className="dcfTwoLists">
                <ListBlock title="Catalysts" items={result.research.catalysts} />
                <ListBlock title="Risks" items={result.research.risks} />
                <ListBlock title="Verify manually" items={result.research.whatToVerify} />
              </div>
            </Panel>

            <Panel title="SEC Filings" kicker="EDGAR evidence">
              <EvidenceList rows={result.evidence.filings} empty="No SEC filing data returned for this ticker." />
            </Panel>

            <Panel title="Market News" kicker="Live context">
              <EvidenceList rows={result.evidence.news} empty="No ticker news returned by connected providers." />
            </Panel>

            <Panel title="Source Health" kicker="API coverage">
              <div className="dcfSources">
                {Object.entries(result.sources).map(([name, state]) => (
                  <span key={name} className={`source-${state}`}>{name}<strong>{state.replace("_", " ")}</strong></span>
                ))}
              </div>
              <div className="dcfSourceLinks">
                {result.sourceLinks.map((link, index) => (
                  <a key={`${link.label}-${index}`} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
                ))}
              </div>
            </Panel>
          </section>
        </>
      ) : null}
    </main>
  );
}

function Panel({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section className="dcfPanel">
      <header>
        <div>
          <p>{kicker}</p>
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="dcfStat">
      <span>{label}</span>
      <strong className={tone || ""}>{value}</strong>
    </div>
  );
}

function Meter({ label, value, important = false }: { label: string; value: number | null; important?: boolean }) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, value * 1000));
  return (
    <div className={`dcfMeter ${important ? "important" : ""}`}>
      <div><span>{label}</span><strong>{pctFraction(value)}</strong></div>
      <i><b style={{ width: `${width}%` }} /></i>
    </div>
  );
}

function EvidenceList({ rows, empty }: { rows: NewsRow[]; empty: string }) {
  if (!rows.length) return <p className="dcfEmpty">{empty}</p>;
  return (
    <div className="dcfEvidenceList">
      {rows.slice(0, 8).map((row, index) => (
        <a key={`${row.source}-${row.publishedAt}-${index}`} href={row.url || "#"} target="_blank" rel="noreferrer">
          <span className={`severity-${row.severity.toLowerCase()}`}>{row.severity}</span>
          <strong>{row.title}</strong>
          <small>{row.source} | {shortTime(row.publishedAt)} | {row.category}</small>
          {row.summary ? <em>{row.summary}</em> : null}
        </a>
      ))}
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {(items.length ? items : [unavailable]).slice(0, 7).map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
      </ul>
    </div>
  );
}

function DcfLoading() {
  return (
    <section className="dcfLoadingGrid">
      {Array.from({ length: 8 }).map((_, index) => <div key={`dcf-loading-${index}`} />)}
    </section>
  );
}

function cleanSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 15);
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function money(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return unavailable;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value > 100 ? 0 : 2 })}`;
}

function compactMoney(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return unavailable;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  return money(value);
}

function compactNumber(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return unavailable;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function numberText(value: number | null | undefined, digits = 1) {
  if (!isFiniteNumber(value)) return unavailable;
  return value.toFixed(digits);
}

function pctFraction(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return unavailable;
  return `${(value * 100).toFixed(1)}%`;
}

function pctPoint(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return unavailable;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function probability(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return unavailable;
  const percent = value > 1 ? value : value * 100;
  return `${percent.toFixed(0)}%`;
}

function score(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return unavailable;
  return value > 1 ? `${Math.round(value)}%` : `${Math.round(value * 100)}%`;
}

function multiple(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return unavailable;
  return `${value.toFixed(1)}x`;
}

function shortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unavailable;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function movementTone(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return "neutral";
  return value >= 0 ? "positive" : "negative";
}

function valueHeat(value: number | null, price: number | null) {
  if (!isFiniteNumber(value) || !isFiniteNumber(price) || price === 0) return "heatNeutral";
  if (value >= price * 1.2) return "heatPositive";
  if (value <= price * 0.8) return "heatNegative";
  return "heatWatch";
}
