import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Visualizations } from "./components/Visualizations";
import { SearchCombobox } from "./components/search-combobox";

function FinancialDashboard() {
  const ENV_API = (import.meta?.env && import.meta.env.VITE_API_BASE) || null;
  const [search, setSearch] = useState("AAPL");
  const [priceData, setPriceData] = useState([]);
  const [priceSource, setPriceSource] = useState("");
  const [metrics, setMetrics] = useState({
    revenue: 0,
    sentiment: 0,
    freeCashFlow: 0,
    riskLevel: '',
    peRatio: 0,
    beta: 0,
    margin: 0,
    rating: '',
    rsi: 0,
    macd: 0,
    volumeRatio: 0,
    volatility: 0,
    competitors: [],
    partners: []
  });
  const [sentiment, setSentiment] = useState({
    score: 0,
    bullish: 0,
    bearish: 0,
    sources: {
      analysts: 0,
      news: 0,
      social: 0,
      forums: 0
    },
    signal: {
      recommendation: '',
      confidence: 0
    }
  });
  const [investments, setInvestments] = useState({
    symbol: '',
    investments: [],
    key_partnerships: [],
    top_competitors: [],
    source: 'none'
  });
  const [filingData, setFilingData] = useState({
    available: false,
    company_name: '',
    risk_level: '',
    top_3_risk_factors: [],
    competitive_advantage: '',
    key_rivals: [],
    mitigation_suggestions: [],
    major_investments: [],
    financial_data: {}
  });
  const [isLoading, setIsLoading] = useState(false);
  const [companyExists, setCompanyExists] = useState(false);
  const lastRequested = useRef(null);
  const [apiBase, setApiBase] = useState(ENV_API || "http://localhost:3001");
  const [errorBanner, setErrorBanner] = useState("");

  // Resolve API base once on mount if not provided via env
  useEffect(() => {
    if (ENV_API) return; // respect explicit env
    let aborted = false;
    const tryPorts = async () => {
      const ports = [3001, 3002, 3003, 3004, 3005, 3006];
      for (const p of ports) {
        const url = `http://localhost:${p}/api/health`;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1000);
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (!aborted && res.ok) {
            setApiBase(`http://localhost:${p}`);
            return;
          }
        } catch (_) { /* ignore */ }
      }
    };
    tryPorts();
    return () => { aborted = true; };
  }, []);

  // Function to fetch all data for a company
  const fetchCompanyData = async (symbol) => {
    if (!symbol || symbol.trim() === '') {
      setCompanyExists(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch price data to verify company exists
      const priceRes = await fetch(`${apiBase}/api/price?symbol=${symbol}`);
      
      // Check for 404 or other errors
      if (!priceRes.ok) {
        setCompanyExists(false);
        setIsLoading(false);
        return;
      }
      
      const priceData = await priceRes.json();
      
      // Check if company exists by looking at the response
      if (!priceData || !priceData.series || priceData.series.length === 0) {
        setCompanyExists(false);
        setIsLoading(false);
        return;
      }
      
      setCompanyExists(true);
      setPriceData(priceData.series || []);
      setPriceSource(priceData.source || "");

      // Fetch metrics
      const metricsRes = await fetch(`${apiBase}/api/metrics?symbol=${symbol}`);
      const metricsData = await metricsRes.json();
      setMetrics(metricsData || {});

  // Fetch sentiment (now symbol-aware)
      const sentimentRes = await fetch(`${apiBase}/api/sentiment?symbol=${symbol}`);
      const sentimentData = await sentimentRes.json();
      setSentiment(sentimentData || {});

      // Fetch investments
      const investmentsRes = await fetch(`${apiBase}/api/investments?symbol=${symbol}`);
      const investmentsData = await investmentsRes.json();
      console.log('Investments response for', symbol, ':', investmentsData);
      // Store the raw response object, not as an array
      setInvestments(investmentsData);

      // Fetch filing summary
      const filingRes = await fetch(`${apiBase}/api/filing-summary?symbol=${symbol}`);
      const filingDataResponse = await filingRes.json();
      console.log('Filing summary for', symbol, ':', filingDataResponse);
      setFilingData(filingDataResponse);

    } catch (error) {
      console.error('Error fetching data:', error);
      setCompanyExists(false);
      setErrorBanner('Failed to fetch some data. Retrying may help.');
      setTimeout(() => setErrorBanner(""), 4000);
    } finally {
      // Keep loading visible for at least 500ms for better UX
      setTimeout(() => setIsLoading(false), 1000);
    }
  };

  // Fetch data when search changes (with debounce)
  useEffect(() => {
    // Avoid duplicate fetches when we already fetched immediately on selection
    if (lastRequested.current === search) return;

    const timer = setTimeout(() => {
      fetchCompanyData(search);
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [search]);

  return (
  <div className="dark p-8 space-y-6 bg-gray-950 min-h-screen">
    <div className="flex relative flex-row items-center mb-10">
      <div>
        <h1 className="text-white text-4xl font-bold">FinSight</h1>
        <p className="text-white">AI insights for real-world finance</p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2 ml-auto w-full max-w-md min-w-0">
        <SearchCombobox
          value={search}
          apiBase={apiBase}
          onChange={(val) => {
            const s = (val || '').trim().toUpperCase();
            setSearch(s);
            lastRequested.current = s;
            fetchCompanyData(s);
          }}
          className="flex-1 min-w-0"
        />
      </div>
    </div>
      

      {/* Error Banner */}
      {errorBanner && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white text-sm px-3 py-2 rounded shadow">
          {errorBanner}
        </div>
      )}

      {/* Show content only if company exists */}
      {!search ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">Search for a company to view insights</p>
        </div>
      ) : !companyExists && !isLoading ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">Company "{search}" not found</p>
        </div>
      ) : (
      <>

      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="dark">
          <CardHeader>
            <CardTitle>Turnover (Revenue)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-48 bg-gray-700 rounded" />
                <div className="h-4 w-32 bg-gray-800 rounded" />
              </div>
            ) : (
              <>
                <p className="text-2xl font-semibold">
                  ${(metrics.revenue / 1000000000).toFixed(2)}B
                </p>
                <p className="mt-[5px] text-sm text-neutral-300">
                  {metrics.margin}% Margin
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="dark">
          <CardHeader>
            <CardTitle>Market Sentiment</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-32 bg-gray-700 rounded" />
                <div className="h-4 w-40 bg-gray-800 rounded" />
              </div>
            ) : (
              <>
                <p className={`text-2xl font-semibold ${
                  sentiment.score > 60 ? 'text-green-600' : 
                  sentiment.score > 40 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {sentiment.score.toFixed(1)}%
                </p>
                <p className="text-sm text-gray-300">
                  {sentiment.signal.recommendation}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="dark">
          <CardHeader>
            <CardTitle>Free Cash Flow (FCF)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-40 bg-gray-700 rounded" />
                <div className="h-4 w-48 bg-gray-800 rounded" />
              </div>
            ) : (
              <>
                <p className={`text-2xl font-semibold ${metrics.freeCashFlow < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ${(metrics.freeCashFlow / 1000000).toFixed(2)}M
                </p>
                <p className="text-sm text-gray-300">
                  FCF Margin: {metrics.revenue ? ((metrics.freeCashFlow / metrics.revenue) * 100).toFixed(1) : '0.0'}%
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="dark">
          <CardHeader>
            <CardTitle>Risk Level</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-32 bg-gray-700 rounded" />
                <div className="h-4 w-24 bg-gray-800 rounded" />
              </div>
            ) : (
              <>
                <p className={`text-2xl font-semibold ${
                  metrics.riskLevel === 'Very High' ? 'text-red-600' :
                  metrics.riskLevel === 'High' ? 'text-orange-600' :
                  metrics.riskLevel === 'Medium' ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {metrics.riskLevel}
                </p>
                <p className="mt-[5px] text-sm text-gray-300">
                  Beta: {typeof metrics.beta === 'number' ? metrics.beta.toFixed(2) : (metrics.beta || '—')}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart and Company Info Section */}
      <div className="space-y-6">
        {/* Chart Section */}
        <Card className="dark">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Stock Price Movement of {search}</CardTitle>
            {priceSource && (
              <span className={`text-xs px-2 py-1 rounded border ${priceSource === 'yahoo' ? 'text-green-400 border-green-700' : 'text-yellow-300 border-yellow-700'}`}>
                Data estimated with 10K filings
              </span>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="w-full h-[350px] bg-gray-800 rounded animate-pulse flex items-center justify-center">
                <div className="text-gray-400">Loading chart...</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={350} className="mx-auto">
                <LineChart key={search} data={priceData} margin={{ left: 48, right: 40, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    stroke="#e5e7eb"
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                    height={70}
                    tick={{ fill: '#e5e7eb', angle: -45, textAnchor: 'end', dy: 5 }}
                  />
                  <YAxis
                    stroke="#e5e7eb"
                    tick={{ fill: '#e5e7eb' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={{ stroke: '#e5e7eb' }}
                    label={{ value: 'Price ($)', angle: -90, position: 'insideLeft', dx: -2, fill: '#e5e7eb', dy:25 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      borderRadius: 8,
                      padding: '0.5rem',
                      border: 'solid gray-900',
                    }}
                    itemStyle={{ color: '#ffffff' }}
                    labelStyle={{ color: '#ffffff' }}
                  />
                  <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Key Metrics and Public Sentiment Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Market Sentiment Card */}
          <Card className="dark">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Market Sentiment</CardTitle>
                {sentiment.data_source && (
                  <span className={`text-xs px-2 py-1 rounded font-medium ${
                    sentiment.data_source === 'SEC 10-K Filing' 
                      ? 'bg-blue-900 text-blue-300' 
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {sentiment.data_source === 'SEC 10-K Filing' ? '📄 SEC Filing' : '📊 Generated'}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="space-y-2">
                    <div className="h-4 w-16 bg-gray-700 rounded" />
                    <div className="h-2 w-full bg-gray-700 rounded" />
                    <div className="h-2 w-full bg-gray-700 rounded" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-20 bg-gray-700 rounded" />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="h-12 bg-gray-700 rounded" />
                      <div className="h-12 bg-gray-700 rounded" />
                      <div className="h-12 bg-gray-700 rounded" />
                      <div className="h-12 bg-gray-700 rounded" />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Overall Sentiment */}
                  <div>
                    <h3 className="text-sm font-medium small-text-card mb-3">Market Direction</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="small-text-card">Bullish</span>
                        <span className="font-medium text-green-600">{sentiment.bullish}%</span>
                      </div>
                      <div className="w-full bg-gray-400 h-2 rounded-full">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: `${sentiment.bullish}%` }} />
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span className="small-text-card">Bearish</span>
                        <span className="font-medium small-text-card">{sentiment.bearish}%</span>
                      </div>
                      <div className="w-full bg-gray-400 h-2 rounded-full">
                        <div className="bg-neutral-700 h-2 rounded-full" style={{ width: `${sentiment.bearish}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Source Analysis */}
                  <div>
                    <h3 className="text-sm font-medium small-text-card mb-3">Source Analysis</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium small-text-card">
                          {sentiment.data_source === 'SEC 10-K Filing' ? 'Risk Level' : 'Analysts'}
                        </h4>
                        <p className={`text-lg font-semibold ${
                          sentiment.sources.analysts > 60 ? 'text-green-600' : 
                          sentiment.sources.analysts > 40 ? 'text-yellow-600' : 'text-red-600'
                        }`}>{sentiment.sources.analysts}%</p>
                        <p className="text-xs small-text-card">
                          {sentiment.data_source === 'SEC 10-K Filing' ? `${sentiment.filing_data?.risk_level || 'Unknown'} Risk` : 'Analysis'}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium small-text-card">
                          {sentiment.data_source === 'SEC 10-K Filing' ? 'Competition' : 'News'}
                        </h4>
                        <p className={`text-lg font-semibold ${
                          sentiment.sources.news > 60 ? 'text-green-600' : 
                          sentiment.sources.news > 40 ? 'text-yellow-600' : 'text-red-600'
                        }`}>{sentiment.sources.news}%</p>
                        <p className="text-xs small-text-card">
                          {sentiment.data_source === 'SEC 10-K Filing' ? `${sentiment.filing_data?.competitive_advantage ? 'Strong' : 'Weak'} Position` : 'Coverage'}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium small-text-card">
                          {sentiment.data_source === 'SEC 10-K Filing' ? 'Rivals' : 'Social'}
                        </h4>
                        <p className={`text-lg font-semibold ${
                          sentiment.sources.social > 60 ? 'text-green-600' : 
                          sentiment.sources.social > 40 ? 'text-yellow-600' : 'text-red-600'
                        }`}>{sentiment.sources.social}%</p>
                        <p className="text-xs small-text-card">
                          {sentiment.data_source === 'SEC 10-K Filing' ? 'Market Activity' : 'Sentiment'}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium small-text-card">
                          {sentiment.data_source === 'SEC 10-K Filing' ? 'Momentum' : 'Forums'}
                        </h4>
                        <p className={`text-lg font-semibold ${
                          sentiment.sources.forums > 60 ? 'text-green-600' : 
                          sentiment.sources.forums > 40 ? 'text-yellow-600' : 'text-red-600'
                        }`}>{sentiment.sources.forums}%</p>
                        <p className="text-xs small-text-card">
                          {sentiment.data_source === 'SEC 10-K Filing' ? 'Investment Activity' : 'Discussion'}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Key Metrics Card */}
          <Card className="dark">
            <CardHeader>
              <CardTitle>Key Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 w-20 bg-gray-700 rounded" />
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-gray-700 rounded" />
                        <div className="h-6 w-12 bg-gray-700 rounded" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-gray-700 rounded" />
                        <div className="h-6 w-12 bg-gray-700 rounded" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-gray-700 rounded" />
                        <div className="h-6 w-12 bg-gray-700 rounded" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-gray-700 rounded" />
                        <div className="h-6 w-12 bg-gray-700 rounded" />
                      </div>
                    </div>
                  </div>
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 w-20 bg-gray-700 rounded" />
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-gray-700 rounded" />
                        <div className="h-6 w-12 bg-gray-700 rounded" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-gray-700 rounded" />
                        <div className="h-6 w-12 bg-gray-700 rounded" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-gray-700 rounded" />
                        <div className="h-6 w-12 bg-gray-700 rounded" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-gray-700 rounded" />
                        <div className="h-6 w-12 bg-gray-700 rounded" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Fundamental Metrics (dynamic) */}
                  <div>
                    <h3 className="text-sm font-medium small-text-card mb-3">Fundamental</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium small-text-card">P/E Ratio</h4>
                        <p className="text-lg font-semibold">{metrics.peRatio ? metrics.peRatio.toFixed(1) : '—'}x</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium small-text-card">Beta</h4>
                        <p className="text-lg font-semibold">{metrics.beta ?? '—'}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium small-text-card">Margin</h4>
                        <p className="text-lg font-semibold">{metrics.margin ?? '—'}%</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium small-text-card">Rating</h4>
                        <p className="text-lg font-semibold">{metrics.rating || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Technical Metrics */}
                  <div>
                    <h3 className="text-sm font-medium small-text-card mb-3">Technical</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium small-text-card">RSI (14d)</h4>
                        <p className={`text-lg font-semibold ${
                          metrics.rsi > 70 ? 'text-red-600' :
                          metrics.rsi > 50 ? 'text-green-600' : 'text-yellow-600'
                        }`}>{metrics.rsi?.toFixed(1) || '—'}</p>
                        <p className="text-xs small-text-card">
                          {metrics.rsi > 70 ? 'Overbought' : metrics.rsi > 50 ? 'Strong Momentum' : 'Weak Momentum'}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium small-text-card">MACD</h4>
                        <p className={`text-lg font-semibold ${metrics.macd > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {metrics.macd?.toFixed(2) || '—'}
                        </p>
                        <p className="text-xs small-text-card">{metrics.macd > 0 ? 'Bullish Signal' : 'Bearish Signal'}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium small-text-card">Volume Ratio</h4>
                        <p className={`text-lg font-semibold ${
                          metrics.volumeRatio > 2 ? 'text-green-600' :
                          metrics.volumeRatio > 1.5 ? 'text-blue-600' : 'text-gray-400'
                        }`}>{metrics.volumeRatio?.toFixed(2) || '—'}x</p>
                        <p className="text-xs small-text-card">
                          {metrics.volumeRatio > 2 ? 'Very High' : metrics.volumeRatio > 1.5 ? 'Above Average' : 'Normal'}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium small-text-card">Volatility</h4>
                        <p className={`text-lg font-semibold ${
                          metrics.volatility > 40 ? 'text-red-600' :
                          metrics.volatility > 25 ? 'text-yellow-600' : 'text-green-600'
                        }`}>{metrics.volatility?.toFixed(1) || '—'}%</p>
                        <p className="text-xs small-text-card">30d Average</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Market Position and Investment Portfolio */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Market Position Card */}
          <Card className="dark">
            <CardHeader className="flex flex-row justify-between">
              <CardTitle className="mt-2">Market Position</CardTitle>
              <span className="text-xs px-2 py-1 rounded border text-yellow-300 border-yellow-700">
                in progress(not precise)
              </span>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="animate-pulse space-y-4">
                  <div>
                    <div className="h-4 w-20 bg-gray-700 rounded mb-2" />
                    <div className="space-y-2">
                      <div className="h-3 w-32 bg-gray-700 rounded" />
                      <div className="h-3 w-28 bg-gray-700 rounded" />
                      <div className="h-3 w-24 bg-gray-700 rounded" />
                    </div>
                  </div>
                  <div>
                    <div className="h-4 w-24 bg-gray-700 rounded mb-2" />
                    <div className="space-y-2">
                      <div className="h-3 w-32 bg-gray-700 rounded" />
                      <div className="h-3 w-28 bg-gray-700 rounded" />
                      <div className="h-3 w-24 bg-gray-700 rounded" />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h4 className="text-sm font-medium small-text-card">Main Rivals</h4>
                    <div className="mt-1 space-y-1">
                      {(metrics.competitors || []).map((competitor, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <p className="text-sm font-medium">{competitor.name}</p>
                          <span className={`text-xs ${
                            competitor.type === 'Direct Competitor' ? 'text-red-500' : 'text-yellow-500'
                          }`}>{competitor.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium small-text-card">Strategic Partners</h4>
                    <div className="mt-1 space-y-1">
                      {(metrics.partners || []).map((partner, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <p className="text-sm font-medium">{partner.name}</p>
                          <span className={`text-xs ${idx === 0 ? 'text-green-500' : 'text-blue-500'}`}>{partner.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Investment Portfolio Card */}
          <Card className="dark">
            <CardHeader>
              <CardTitle>Investment Portfolio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium small-text-card">Major Investments</h4>
                <div className="mt-2 space-y-3">
                  {isLoading ? (
                    <div className="animate-pulse space-y-3">
                      <div className="space-y-2">
                        <div className="h-4 w-40 bg-gray-700 rounded" />
                        <div className="h-2 w-full bg-gray-700 rounded" />
                        <div className="h-3 w-32 bg-gray-700 rounded" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 w-40 bg-gray-700 rounded" />
                        <div className="h-2 w-full bg-gray-700 rounded" />
                        <div className="h-3 w-32 bg-gray-700 rounded" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 w-40 bg-gray-700 rounded" />
                        <div className="h-2 w-full bg-gray-700 rounded" />
                        <div className="h-3 w-32 bg-gray-700 rounded" />
                      </div>
                    </div>
                  ) : !investments?.investments || investments.investments.length === 0 ? (
                    // No data available
                    <p className="text-xs text-gray-400 italic">No SEC filing data available for this company</p>
                  ) : (
                    // Display investments from SEC filings
                    investments.investments.map((investment, index) => {
                      const colorClasses = [
                        { text: 'text-green-500', bg: 'bg-green-500' },
                        { text: 'text-blue-500', bg: 'bg-blue-500' },
                        { text: 'text-purple-500', bg: 'bg-purple-500' },
                        { text: 'text-yellow-500', bg: 'bg-yellow-500' },
                      ];
                      const color = colorClasses[index % colorClasses.length];
                      // Calculate percentage based on investment value if available (normalize to 5-50% range)
                      const valueNum = investment.value ? parseInt(investment.value.replace(/[^\d]/g, '')) : 0;
                      const percentage = valueNum > 0 ? Math.min(Math.max((valueNum / 100) * 5, 5), 50) : 15;
                      
                      return (
                        <div key={investment.name || index}>
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{investment.name}</p>
                              {investment.value && (
                                <p className="text-xs text-gray-400">{investment.value}</p>
                              )}
                            </div>
                            <span className={`text-xs font-medium ${color.text} ml-2`}>{percentage.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-400 h-2 rounded-full">
                            <div className={`${color.bg} h-2 rounded-full`} style={{ width: `${percentage}%` }} />
                          </div>
                          {investment.details && (
                            <p className="text-xs text-gray-500 mt-1">{investment.details}</p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filing Insights Card */}
        <div className="grid grid-cols-1 gap-4">
          <Card className="dark">
            <CardHeader>
              <CardTitle>10-K Filing Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-700 rounded" />
                    <div className="h-3 w-full bg-gray-700 rounded" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-700 rounded" />
                    <div className="h-3 w-full bg-gray-700 rounded" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-700 rounded" />
                    <div className="h-3 w-full bg-gray-700 rounded" />
                  </div>
                </div>
              ) : !filingData?.available ? (
                <p className="text-sm text-gray-400 italic">No 10-K filing data available for this company</p>
              ) : (
                <>
                  {/* Risk Factors */}
                  <div>
                    <h4 className="text-sm font-semibold text-red-400 mb-2">Top Risk Factors</h4>
                    <ul className="space-y-1">
                      {filingData.top_3_risk_factors && filingData.top_3_risk_factors.length > 0 ? (
                        filingData.top_3_risk_factors.map((risk, idx) => (
                          <li key={idx} className="text-xs text-gray-300 flex gap-2">
                            <span className="text-red-400 flex-shrink-0">•</span>
                            <span>{risk}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-xs text-gray-400">No risk factors data available</li>
                      )}
                    </ul>
                  </div>

                  {/* Competitive Advantage */}
                  <div>
                    <h4 className="text-sm font-semibold text-green-400 mb-2">Competitive Advantage</h4>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {filingData.competitive_advantage || 'No competitive advantage data available'}
                    </p>
                  </div>

                  {/* Key Rivals */}
                  {filingData.key_rivals && filingData.key_rivals.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-blue-400 mb-2">Key Rivals</h4>
                      <div className="flex flex-wrap gap-2">
                        {filingData.key_rivals.map((rival, idx) => (
                          <span key={idx} className="text-xs bg-blue-900 bg-opacity-50 text-blue-300 px-2 py-1 rounded">
                            {rival}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mitigation Suggestions */}
                  {filingData.mitigation_suggestions && filingData.mitigation_suggestions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-yellow-400 mb-2">Strategic Recommendations</h4>
                      <ol className="space-y-1">
                        {filingData.mitigation_suggestions.slice(0, 3).map((suggestion, idx) => (
                          <li key={idx} className="text-xs text-gray-300 flex gap-2">
                            <span className="text-yellow-400 flex-shrink-0">{idx + 1}.</span>
                            <span>{suggestion}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Major Investments */}
                  {filingData.major_investments && filingData.major_investments.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-purple-400 mb-2">Major Investments</h4>
                      <div className="space-y-2">
                        {filingData.major_investments.slice(0, 2).map((investment, idx) => (
                          <div key={idx} className="text-xs text-gray-300 bg-gray-800 bg-opacity-50 p-2 rounded">
                            <p className="font-medium text-purple-300">{investment.name || investment}</p>
                            {investment.details && (
                              <p className="text-gray-400 mt-1">{investment.details}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confidence Score */}
                  {filingData.confidence_score && (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                      <span className="text-xs text-gray-400">Analysis Confidence</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-700 rounded-full">
                          <div 
                            className="h-2 bg-gradient-to-r from-yellow-500 to-green-500 rounded-full" 
                            style={{ width: `${filingData.confidence_score}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-300">{filingData.confidence_score}%</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Network Visualizations */}
        <Visualizations />
      </div>
      </>
      )}

    </div>
  );
}

export default FinancialDashboard