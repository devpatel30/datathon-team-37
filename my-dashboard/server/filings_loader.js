/**
 * Loads and processes SEC 10-K filing data from teammate's analysis
 * This data is used to calculate real sentiment scores instead of generated values
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Mapping of trading symbols to filing data
const filingsData = new Map();
const regulationsData = [];

/**
 * Load SEC 10-K filings data from CSV
 * Each filing contains: risk_level, top_3_risk_factors, competitive_advantage, key_rivals, major_investments_acquisitions
 */
function loadFilingsData() {
  return new Promise((resolve, reject) => {
    const filingsPath = path.join(__dirname, '../../sample_data/structured_data/filings_structured.csv');
    
    if (!fs.existsSync(filingsPath)) {
      console.warn('[filings] CSV not found at', filingsPath);
      resolve();
      return;
    }

    fs.createReadStream(filingsPath)
      .pipe(csv())
      .on('data', (row) => {
        const symbol = row.trading_symbol?.trim().toUpperCase();
        if (symbol) {
          filingsData.set(symbol, {
            company_name: row.company_name,
            risk_level: row.risk_level,
            top_3_risk_factors: parseJSON(row.top_3_risk_factors),
            key_rivals: parseJSON(row.key_rivals),
            competitive_advantage: row.competitive_advantage,
            major_investments: parseJSON(row.major_investments_acquisitions),
            revenue: parseFloat(row.revenue) || 0,
            net_income: parseFloat(row.net_income) || 0,
            eps: parseFloat(row.eps) || 0,
            pe_ratio: parseFloat(row.pe_ratio) || 0,
            confidence_score: parseFloat(row.confidence_score) || 0.5,
            primary_sector: row.primary_sector,
            key_partners: parseJSON(row.key_partners),
            capital_expenditure: parseFloat(row.capital_expenditure) || 0,
            operating_cash_flow: parseFloat(row.operating_cash_flow) || 0
          });
        }
      })
      .on('end', () => {
        console.log(`[filings] Loaded ${filingsData.size} companies from SEC filings`);
        console.log(`[filings] Symbols: ${Array.from(filingsData.keys()).join(', ')}`);
        resolve();
      })
      .on('error', (err) => {
        console.error('[filings] Error loading CSV:', err);
        reject(err);
      });
  });
}

/**
 * Load regulatory data
 */
function loadRegulationsData() {
  return new Promise((resolve, reject) => {
    const regsPath = path.join(__dirname, '../../sample_data/structured_data/regulations_structured.csv');
    
    if (!fs.existsSync(regsPath)) {
      console.warn('[regulations] CSV not found at', regsPath);
      resolve();
      return;
    }

    fs.createReadStream(regsPath)
      .pipe(csv())
      .on('data', (row) => {
        const impactedCompanies = parseJSON(row.companies_that_could_be_impacted) || [];
        regulationsData.push({
          law_name: row.law_name,
          country_region: row.country_region,
          primary_subject: row.primary_subject,
          affected_sectors: parseJSON(row.affected_sectors) || [],
          severity: row.potential_impact_severity,
          impacted_companies: impactedCompanies,
          compliance_deadline: row.compliance_deadline,
          estimated_cost: row.estimated_compliance_cost
        });
      })
      .on('end', () => {
        console.log(`[regulations] Loaded ${regulationsData.length} regulations`);
        resolve();
      })
      .on('error', (err) => {
        console.error('[regulations] Error loading CSV:', err);
        reject(err);
      });
  });
}

/**
 * Parse JSON string safely
 */
function parseJSON(jsonStr) {
  try {
    if (!jsonStr) return null;
    return JSON.parse(jsonStr.replace(/'/g, '"'));
  } catch {
    return null;
  }
}

/**
 * Calculate sentiment score from SEC filing data
 * Returns score, bullish %, bearish %, and data source
 */
function getSentimentFromFiling(symbol) {
  const filing = filingsData.get(symbol);
  
  if (!filing) {
    return null;
  }

  // Convert risk level to sentiment
  const riskToBullish = {
    'Low': 75,
    'Medium': 50,
    'High': 30,
    'Very High': 15
  };

  const bullish = riskToBullish[filing.risk_level] || 50;
  const bearish = 100 - bullish;

  // Score is based on bullish percentage (0-100)
  const score = bullish;

  // Extract sentiment from risk factors if available
  const riskFactors = filing.top_3_risk_factors || [];
  const competitiveAdv = filing.competitive_advantage || '';

  // Calculate composite sources based on filing data
  const competitivePosScore = competitiveAdv ? 75 : 45;
  const rivalsScore = filing.key_rivals?.length ? 65 : 50;
  const investmentScore = filing.major_investments?.length > 0 ? 70 : 50;

  return {
    score,
    bullish,
    bearish,
    // Traditional source names for frontend compatibility
    sources: {
      analysts: bullish,  // Risk level drives analyst sentiment
      news: competitivePosScore,  // Competitive advantage = positive news
      social: rivalsScore,  // Number of competitors = market discussion
      forums: investmentScore  // Investment activity = investor interest
    },
    // Extended sources with SEC data labels
    filing_sources: {
      risk_analysis: bullish,
      competitive_position: competitivePosScore,
      competitors: rivalsScore,
      momentum: investmentScore
    },
    signal: {
      recommendation: score > 65 ? 'Buy' : score > 45 ? 'Hold' : 'Sell',
      confidence: filing.confidence_score,
      rationale: `${filing.risk_level} risk level, ${filing.key_rivals?.length || 0} competitors identified`
    },
    filing_data: {
      risk_level: filing.risk_level,
      top_risks: riskFactors.slice(0, 2),
      competitive_advantage: competitiveAdv,
      revenue: filing.revenue,
      net_income: filing.net_income,
      eps: filing.eps
    },
    data_source: 'SEC 10-K Filing'
  };
}

/**
 * Get regulations affecting a company
 */
function getRegulationsForCompany(symbol, sector) {
  return regulationsData.filter(reg => {
    const isDirectMatch = reg.impacted_companies.some(c => 
      c.toUpperCase().includes(symbol.toUpperCase())
    );
    
    const isSectorMatch = reg.affected_sectors.some(s =>
      s.toLowerCase().includes(sector?.toLowerCase())
    );

    return isDirectMatch || isSectorMatch;
  });
}

/**
 * Get investment portfolio data for a company (M&A, acquisitions, partnerships)
 */
function getInvestmentPortfolio(symbol) {
  const filing = filingsData.get(symbol);
  
  if (!filing) {
    console.log(`[getInvestmentPortfolio] No filing found for ${symbol}. Available: ${Array.from(filingsData.keys()).join(', ')}`);
    return null;
  }

  const investments = filing.major_investments || [];
  const keyPartners = filing.key_partners || [];
  const competitors = filing.key_rivals || [];

  return {
    symbol,
    company: filing.company_name,
    sector: filing.primary_sector,
    investments: investments.map(inv => {
      // Parse investment description to extract key details
      const match = inv.match(/^(.*?)(?:\s+for\s+\$?([\d,.]+(?:\s*(?:million|billion|M|B))?))?(?:\s*-\s*(.*?))?$/i);
      
      return {
        name: match ? match[1].trim() : inv,
        value: match ? match[2]?.trim() : null,
        details: match ? match[3]?.trim() : null,
        type: inv.includes('acquisition') ? 'acquisition' : 
              inv.includes('stake') ? 'stake' : 
              inv.includes('invest') ? 'investment' : 
              inv.includes('purchase') ? 'purchase' : 'other'
      };
    }),
    key_partnerships: keyPartners.filter(p => p && typeof p === 'string').slice(0, 3),
    top_competitors: competitors.filter(c => c && typeof c === 'string' && c !== 'Not explicitly named in the document').slice(0, 5),
    financial_position: {
      revenue: filing.revenue,
      net_income: filing.net_income,
      operating_cash_flow: filing.operating_cash_flow,
      capex: filing.capital_expenditure,
      eps: filing.eps,
      pe_ratio: filing.pe_ratio
    }
  };
}

module.exports = {
  loadFilingsData,
  loadRegulationsData,
  getSentimentFromFiling,
  getRegulationsForCompany,
  getInvestmentPortfolio,
  filingsData,
  regulationsData
};
