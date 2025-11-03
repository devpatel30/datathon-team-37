const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { loadFilingsData, loadRegulationsData, getSentimentFromFiling, getRegulationsForCompany, getInvestmentPortfolio, filingsData } = require('./filings_loader');

const app = express();
app.use(cors());
app.use(express.json());

// Load filings and regulations data on startup
let filingsLoaded = false;
loadFilingsData().then(() => { filingsLoaded = true; }).catch(e => console.error('Error loading filings:', e));
loadRegulationsData().catch(e => console.error('Error loading regulations:', e));

// Load companies data
let companies = [];
let symbolIndex = new Map(); // SYMBOL -> company
let companiesLoadedResolve;
const companiesLoaded = new Promise((res) => { companiesLoadedResolve = res; });

fs.createReadStream(path.join(__dirname, '../../data/2025-09-26_stocks-performance.csv'))
  .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
  .on('data', (data) => {
    // Debug: log first row to see actual field values and all keys
    if (companies.length === 0) {
      console.log('[csv] First row keys:', Object.keys(data));
      console.log('[csv] First row raw:', { 
        Symbol: JSON.stringify(data.Symbol),
        CompanyName: JSON.stringify(data['Company Name']),
        Revenue: data.Revenue
      });
    }
    
    // Aggressive trim and handle any BOM, quotes, or whitespace
    let symbol = (data.Symbol || '').toString().trim();
    // Remove quotes, BOM, and whitespace
    symbol = symbol.replace(/^[\uFEFF\u200B-\u200D\uFEFF"']/g, '').replace(/["']\s*$/g, '').trim().toUpperCase();
    
    const name = (data['Company Name'] || '').toString().trim();
    const num = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    
    if (symbol.length > 0) {
      companies.push({
        symbol,
        name,
        marketCap: num(data['Market Cap'] || data.MarketCap || 0),
        revenue: num(data.Revenue || 0),
        opIncome: num(data['Op. Income'] || data.OpIncome || 0),
        netIncome: num(data['Net Income'] || data.NetIncome || 0),
        eps: num(data.EPS || 0),
        fcf: num(data.FCF || 0)
      });
    }
  })
  .on('end', () => {
    // Build fast lookup index
    symbolIndex = new Map(companies.map(c => [c.symbol, c]));
    console.log(`[server] Loaded companies: ${companies.length}`);
    console.log(`[server] First 3 symbols:`, companies.slice(0, 3).map(c => ({ symbol: c.symbol, revenue: c.revenue })));
    console.log(`[server] symbolIndex size: ${symbolIndex.size}`);
    companiesLoadedResolve();
  })
  .on('error', (err) => {
    console.error('[server] Error loading companies CSV:', err);
  });

const PORT = process.env.PORT || 3001;

// In-memory cache for historical prices to reduce API calls
const priceCache = new Map(); // symbol -> { timestamp, series }
const PRICE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Generate price series from 10-K filing financial data
function generatePriceSeriesFromFilings(symbol, filingData) {
  if (!filingData) return null;
  
  const series = [];
  const months = ['2023-11', '2023-12', '2024-01', '2024-02', '2024-03', '2024-04', 
                 '2024-05', '2024-06', '2024-07', '2024-08', '2024-09', '2024-10'];
  
  // Extract exact financial metrics from 10-K
  const revenue = filingData.revenue || 0;           // Total revenue
  const netIncome = filingData.net_income || 0;     // Profit
  const ocf = filingData.operating_cash_flow || 0;  // Cash generation
  const capex = filingData.capital_expenditure || 0; // Investments
  const eps = filingData.eps || 0;                  // Earnings per share
  
  // Calculate key financial health metrics
  const profitMargin = revenue > 0 ? (netIncome / revenue) : 0;
  const fcf = ocf - capex;  // Free Cash Flow
  const fcfMargin = revenue > 0 ? (fcf / revenue) : 0;
  
  // Base price from EPS (simplified: stock price ≈ EPS * 20-30 P/E multiple)
  // Use conservative 20x P/E for base calculation
  let basePrice = eps > 0 ? eps * 25 : (revenue / 1e8); // Fallback: price based on revenue scale
  basePrice = Math.max(basePrice, 10); // Floor at $10
  
  console.log(`[price-filing] ${symbol}: revenue=$${(revenue/1e9).toFixed(2)}B, eps=$${eps}, margin=${(profitMargin*100).toFixed(1)}%, fcf=$${(fcf/1e6).toFixed(0)}M, basePrice=$${basePrice.toFixed(2)}`);
  
  // Risk level impacts volatility
  const riskVol = {
    'Low': 0.04,
    'Medium': 0.06,
    'High': 0.10,
    'Very High': 0.15
  };
  const volatility = riskVol[filingData.risk_level] || 0.06;
  
  // Trend from profitability and cash flow
  const trend = (profitMargin * 0.6 + fcfMargin * 0.4) * 100; // Convert to percentage trend
  
  let price = basePrice;
  months.forEach((month, idx) => {
    // Month-by-month movement based on financial health
    const monthlyTrend = trend / 12; // Distribute trend across 12 months
    const seasonality = Math.sin(idx * 0.5) * volatility * 0.5; // Seasonal adjustment
    const noise = ((idx + 1) * 137) % 100 / 1000; // Deterministic but varied noise
    
    price = price * (1 + monthlyTrend / 100 + seasonality + (noise - 0.05));
    series.push({
      date: month,
      price: parseFloat(Math.max(price * 0.7, price).toFixed(2))
    });
  });
  
  return series;
}

// Generate price series based on market cap and trends (fallback)
function generatePriceSeries(marketCap, symbol = '') {
  const basePrice = marketCap / 1e9; // Convert market cap to base price
  const series = [];
  const months = ['2023-11', '2023-12', '2024-01', '2024-02', '2024-03', '2024-04', 
                 '2024-05', '2024-06', '2024-07', '2024-08', '2024-09', '2024-10'];
  
  // Use symbol-based seed for consistency
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  
  // Deterministic trend based on symbol
  const trend = ((h % 100) - 50) / 100; // -0.5 to +0.5 trend
  const volatility = 0.05 + (h % 10) / 100; // 5% to 14% volatility
  
  let price = basePrice;
  months.forEach((month, idx) => {
    // Deterministic but realistic price movement
    const monthInfluence = Math.sin(idx * 0.5 + h % 10) * volatility;
    const randomInfluence = ((h * (idx + 1)) % 100) / 1000; // Consistent per symbol+month
    price = price * (1 + trend / 12 + monthInfluence + (randomInfluence - 0.05));
    series.push({
      date: month,
      price: parseFloat(Math.max(price * 0.5, price).toFixed(2)) // Ensure realistic floor
    });
  });
  
  return series;
}

// Fetch historical prices - try filing data first, then yahoo, then synthetic
async function fetchHistoricalSeries(symbol, marketCap) {
  // Cache check
  const cached = priceCache.get(symbol);
  if (cached && (Date.now() - cached.timestamp) < PRICE_TTL_MS) {
    return { series: cached.series, source: cached.source };
  }

  // Try to fetch real data from yahoo-finance2
  try {
    const yf = require('yahoo-finance2').default;
    const now = new Date();
    const start = new Date(now);
    start.setFullYear(now.getFullYear() - 1);
    
    const options = { period1: start, period2: now, interval: '1mo' }; // Monthly data
    const rows = await yf.historical(symbol, options);
    
    if (rows && rows.length > 0) {
      const series = rows
        .map(r => ({
          date: new Date(r.date).toISOString().slice(0, 7), // YYYY-MM format
          price: Number(r.close.toFixed(2))
        }))
        .filter((v, i, a) => i === a.length - 1 || v.date !== a[i + 1].date); // Deduplicate

      if (series.length > 0) {
        priceCache.set(symbol, { timestamp: Date.now(), series, source: 'yahoo' });
        console.log(`[price] Fetched ${series.length} real data points for ${symbol} from Yahoo`);
        return { series, source: 'yahoo' };
      }
    }
  } catch (err) {
    console.warn(`[price] Real data fetch failed for ${symbol}:`, err.message || err);
  }
  
  // Try to use 10-K filing data for realistic synthetic prices
  try {
    if (filingsData && filingsData.has(symbol)) {
      const rawFiling = filingsData.get(symbol);
      const series = generatePriceSeriesFromFilings(symbol, rawFiling);
      if (series && series.length > 0) {
        priceCache.set(symbol, { timestamp: Date.now(), series, source: 'filing-data' });
        console.log(`[price] Generated series for ${symbol} from 10-K filing data`);
        return { series, source: 'filing-data' };
      }
    }
  } catch (err) {
    console.warn(`[price] Could not use filing data for ${symbol}:`, err.message || err);
  }
  
  // Fallback to synthetic data based on market cap
  const series = generatePriceSeries(marketCap, symbol);
  if (series && series.length > 0) {
    priceCache.set(symbol, { timestamp: Date.now(), series, source: 'synthetic' });
    console.log(`[price] Generated synthetic series for ${symbol}`);
  }
  return { series, source: 'synthetic' };
}

const metrics = {
  revenue: 4490000000,
  sentiment: 72,
  freeCashFlow: -181610000,
  riskLevel: 'Very High',
  peRatio: 15.2,
  beta: 0.6,
  margin: 18.3,
  rating: 'BBB+'
};

// Deterministic pseudo-random sentiment per symbol to reflect selection changes
function sentimentForSymbol(symbol = '') {
  // simple hash
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  const rand = (min, max, seedShift) => {
    const v = ((h >>> (seedShift % 24)) % 100) / 100; // 0..0.99
    return Math.round(min + v * (max - min));
  };
  const score = rand(35, 85, 3);
  // Use score as the primary bullish percentage to ensure consistency
  const bullish = score;
  const bearish = 100 - bullish;
  const analysts = rand(40, 90, 11);
  const news = rand(35, 85, 13);
  const social = rand(30, 80, 17);
  const forums = rand(30, 85, 19);
  const recommendation = score > 65 ? 'Buy' : score > 45 ? 'Hold' : 'Sell';
  const confidence = rand(60, 95, 23);
  return {
    score,
    bullish,
    bearish,
    sources: { analysts, news, social, forums },
    signal: { recommendation, confidence }
  };
}

const investments = [
  { name: 'Digital Projection Technology', stake: '15%' },
  { name: 'Streaming Platform', stake: '8%' },
  { name: 'VR Entertainment', stake: '5%' }
];

// Generate symbol-specific competitors based on hash
function generateCompetitors(symbol) {
  const competitorPools = {
    TECH: ['Microsoft', 'Google', 'Amazon', 'Meta', 'Tesla', 'Apple'],
    FINANCE: ['JPMorgan', 'Goldman Sachs', 'Morgan Stanley', 'Bank of America', 'Citigroup'],
    RETAIL: ['Walmart', 'Amazon', 'Target', 'Costco', 'Home Depot'],
    PHARMA: ['Merck', 'Pfizer', 'Johnson & Johnson', 'Eli Lilly', 'AbbVie'],
    ENERGY: ['ExxonMobil', 'Chevron', 'Saudi Aramco', 'Shell', 'BP']
  };
  
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  
  // Determine sector pool
  const sector = ['TECH', 'FINANCE', 'RETAIL', 'PHARMA', 'ENERGY'][h % 5];
  const pool = competitorPools[sector];
  
  // Pick 3 competitors with varying intensity
  const idx = h % pool.length;
  const competitors = [
    { name: pool[idx], type: 'Direct Competitor' },
    { name: pool[(idx + 1) % pool.length], type: 'Regional Rival' },
    { name: pool[(idx + 2) % pool.length], type: 'International Rival' }
  ];
  return competitors;
}

// Generate symbol-specific partners
function generatePartners(symbol) {
  const partnerPools = {
    tech: ['Google Cloud', 'AWS', 'Azure', 'Salesforce', 'Oracle'],
    finance: ['Bloomberg', 'Reuters', 'Refinitiv', 'S&P Global'],
    supply: ['DHL', 'FedEx', 'UPS', 'Maersk'],
    marketing: ['Facebook Ads', 'Google Ads', 'LinkedIn', 'Twitter']
  };
  
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  
  const types = Object.keys(partnerPools);
  const type1 = types[h % types.length];
  const type2 = types[(h + 1) % types.length];
  
  const pool1 = partnerPools[type1];
  const pool2 = partnerPools[type2];
  
  const idx1 = h % pool1.length;
  const idx2 = (h + 1) % pool2.length;
  
  return [
    { name: pool1[idx1], type: 'Technology Partner' },
    { name: pool2[idx2], type: 'Distribution Partner' }
  ];
}

// Endpoints
app.get('/api/suggestions', async (req, res) => {
  await companiesLoaded.catch(() => {});
  const query = (req.query.q || '').toLowerCase();
  console.log('[suggestions] query =', query);
  const suggestions = companies
    .filter(company => {
      const name = (company.name || '').toLowerCase();
      const symbol = (company.symbol || '').toLowerCase();
      if (!query) return false;
      return name.startsWith(query) || symbol.startsWith(query);
    })
    .slice(0, 10)
    .map(company => ({
      symbol: company.symbol,
      name: company.name
    }));
  console.log(`[suggestions] count=${suggestions.length}`);
  res.json(suggestions);
});

app.get('/api/price', async (req, res) => {
  await companiesLoaded.catch(() => {});
  const symbol = (req.query.symbol || '').toString().trim().toUpperCase();
  const company = symbolIndex.get(symbol) || companies.find(c => (c.symbol || '').toUpperCase() === symbol);

  // Return error if company not found
  if (!company) {
    console.warn(`[price] Company not found: symbol="${symbol}"`);
    res.status(404).json({ symbol, source: 'error', series: [], error: 'Company not found' });
    return;
  }

  // Get market cap for realistic price generation
  const marketCap = company.marketCap;

  // Fetch or generate price series with source
  const { series, source } = await fetchHistoricalSeries(symbol, marketCap);

  // Return with source indicating data origin
  res.json({ symbol, source, series });
});

app.get('/api/metrics', async (req, res) => {
  await companiesLoaded.catch(() => {});
  const symbol = (req.query.symbol || '').toString().trim().toUpperCase();
  const company = symbolIndex.get(symbol) || companies.find(c => (c.symbol || '').toUpperCase() === symbol);
  
  if (!company) {
    console.warn(`[metrics] Company not found: symbol="${symbol}"`);
    res.status(404).json({ source: 'error', error: 'Company not found' });
    return;
  }

  // Calculate metrics from real data (with symbol-varying values for interactivity)
  const rev = Number(company.revenue) || 0;
  const ni = Number(company.netIncome) || 0;
  const fcf = Number(company.fcf) || 0;
  const mc = Number(company.marketCap) || 0;

  // Safe P/E: only if earnings positive
  const pe = ni > 0 ? mc / ni : null;

  // Simple symbol hash to vary beta and risk
  let h = 0; const s = String(symbol || '');
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  const beta = Number((0.7 + (h % 90) / 100).toFixed(2)); // 0.70 .. 1.60

  // Compute operating/net margin
  const marginPct = rev ? ((ni / rev) * 100) : 0;

  // Risk rules using beta and profitability
  let riskLevel = 'Low';
  if (beta > 1.4 || (fcf < 0 && ni < 0)) riskLevel = 'Very High';
  else if (beta > 1.2 || ni < 0) riskLevel = 'High';
  else if (beta > 1.0) riskLevel = 'Medium';

  // Simple rating heuristic
  const rating = riskLevel === 'Low' ? 'A' : riskLevel === 'Medium' ? 'BBB+' : riskLevel === 'High' ? 'BB' : 'B-';

  // Get real competitors from 10-K filing data if available
  let competitors = generateCompetitors(symbol);
  try {
    if (filingsData && filingsData.has(symbol)) {
      const filingData = filingsData.get(symbol);
      const keyRivals = filingData.key_rivals || [];
      // Convert key rivals to competitor objects
      if (Array.isArray(keyRivals) && keyRivals.length > 0 && keyRivals[0] !== 'Not explicitly named in the document') {
        competitors = keyRivals.slice(0, 5).map((name, idx) => ({
          name: name.trim(),
          type: idx === 0 ? 'Direct Competitor' : idx === 1 ? 'Major Rival' : 'Industry Competitor'
        }));
        console.log(`[metrics] Using ${competitors.length} real competitors from 10-K filing for ${symbol}`);
      }
    }
  } catch (err) {
    console.warn(`[metrics] Could not load filing competitors for ${symbol}:`, err.message);
  }

  const data = {
    revenue: rev,
    sentiment: 72, // overall sentiment score handled by /api/sentiment
    freeCashFlow: fcf,
    riskLevel,
    peRatio: pe,
    beta,
    margin: Number(marginPct.toFixed(1)),
    rating,
    source: 'csv',
    // Technical metrics (symbol-varying)
    rsi: 30 + (h % 70), // RSI 30-100
    macd: -2 + (h % 40) / 10, // MACD -2 to +2
    volumeRatio: 1 + (h % 300) / 100, // 1x to 4x
    volatility: 15 + (h % 50), // 15% to 65%
    // Company positioning
    competitors: competitors,
    partners: generatePartners(symbol)
  };
  console.log(`[metrics] ${symbol} rev=${rev} fcf=${fcf} risk=${riskLevel} beta=${beta}`);
  res.json(data);
});

app.get('/api/sentiment', (req, res) => {
  const symbol = (req.query.symbol || '').toString().trim().toUpperCase();
  
  // Try real SEC filing data first
  const filingData = getSentimentFromFiling(symbol);
  if (filingData) {
    console.log(`[sentiment] Using SEC filing data for ${symbol}`);
    return res.json(filingData);
  }
  
  // Fall back to deterministic sentiment
  console.log(`[sentiment] Using generated sentiment for ${symbol}`);
  res.json(sentimentForSymbol(symbol));
});

app.get('/api/investments', (req, res) => {
  const symbol = (req.query.symbol || '').toString().trim().toUpperCase();
  
  // Try to get real data from SEC filings
  const realData = getInvestmentPortfolio(symbol);
  if (realData) {
    console.log(`[investments] Real data found for ${symbol}, ${realData.investments?.length || 0} investments`);
    return res.json({
      ...realData,
      source: 'sec_filing'
    });
  }
  
  // Return empty array for companies without filing data (no fallback)
  console.log(`[investments] No filing data for ${symbol}, returning empty`);
  res.json({
    symbol,
    investments: [],
    key_partnerships: [],
    top_competitors: [],
    source: 'none'
  });
});

// Get filing insights for a company (SEC 10-K analysis)
app.get('/api/filing-insights', (req, res) => {
  const symbol = (req.query.symbol || '').toString().trim().toUpperCase();
  const filingData = getSentimentFromFiling(symbol);
  
  if (!filingData) {
    return res.json({ available: false, symbol });
  }
  
  const regulations = getRegulationsForCompany(symbol, null);
  
  res.json({
    available: true,
    symbol,
    company_name: filingData.filing_data?.revenue ? symbol : null,
    risk_level: filingData.filing_data?.risk_level,
    top_risks: filingData.filing_data?.top_risks || [],
    competitive_advantage: filingData.filing_data?.competitive_advantage,
    revenue: filingData.filing_data?.revenue,
    net_income: filingData.filing_data?.net_income,
    eps: filingData.filing_data?.eps,
    applicable_regulations: regulations.map(r => ({
      name: r.law_name,
      country: r.country_region,
      severity: r.severity,
      deadline: r.compliance_deadline,
      impact_summary: r.primary_subject
    })).slice(0, 3) // Top 3 most relevant
  });
});

// Filing Summary endpoint
app.get('/api/filing-summary', async (req, res) => {
  const symbol = (req.query.symbol || '').toString().trim().toUpperCase();
  
  try {
    if (!filingsData || !filingsData.has(symbol)) {
      res.json({
        symbol,
        available: false,
        message: 'No 10-K filing data available for this company'
      });
      return;
    }
    
    const filing = filingsData.get(symbol);
    
    res.json({
      symbol,
      available: true,
      company_name: filing.company_name,
      fiscal_year_end: filing.fiscal_year_end || 'N/A',
      primary_sector: filing.primary_sector,
      risk_level: filing.risk_level,
      
      // Financial snapshot
      financial_data: {
        revenue: filing.revenue,
        net_income: filing.net_income,
        operating_cash_flow: filing.operating_cash_flow,
        capital_expenditure: filing.capital_expenditure,
        eps: filing.eps
      },
      
      // Top risk factors
      top_3_risk_factors: filing.top_3_risk_factors || [],
      
      // Competitive advantage
      competitive_advantage: filing.competitive_advantage,
      
      // Key rivals
      key_rivals: filing.key_rivals || [],
      
      // Mitigation strategies
      mitigation_suggestions: filing.mitigation_suggestions || [],
      
      // Investments & acquisitions
      major_investments: filing.major_investments || [],
      
      // Key partners
      key_partners: filing.key_partners || [],
      
      confidence_score: filing.confidence_score
    });
  } catch (err) {
    console.error('[filing-summary] Error:', err);
    res.json({
      symbol,
      available: false,
      message: 'Error loading filing data'
    });
  }
});

// Debug endpoint
app.get('/api/debug', async (req, res) => {
  res.json({
    companiesCount: companies.length,
    symbolIndexSize: symbolIndex.size,
    firstThree: companies.slice(0, 3).map(c => ({ symbol: c.symbol, name: c.name, revenue: c.revenue })),
    aapl: symbolIndex.get('AAPL') || null
  });
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

function startServer(port, attempts = 0) {
  const server = app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempts < 5) {
      const next = port + 1;
      console.warn(`[server] Port ${port} in use, trying ${next}...`);
      startServer(next, attempts + 1);
    } else {
      console.error('[server] Failed to start:', err);
      process.exit(1);
    }
  });
}

startServer(Number(PORT));
