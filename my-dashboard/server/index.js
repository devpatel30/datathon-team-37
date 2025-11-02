const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Mock data
const priceSeries = [
  { date: '2023-11', price: 10.5 },
  { date: '2023-12', price: 7.0 },
  { date: '2024-01', price: 5.5 },
  { date: '2024-02', price: 4.2 },
  { date: '2024-03', price: 3.8 },
  { date: '2024-04', price: 6.2 },
  { date: '2024-05', price: 4.8 },
  { date: '2024-06', price: 4.3 },
  { date: '2024-07', price: 4.1 },
  { date: '2024-08', price: 3.9 },
  { date: '2024-09', price: 4.0 },
  { date: '2024-10', price: 4.2 }
];

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

const sentiment = {
  score: 78,
  bullish: 72,
  bearish: 28,
  sources: {
    analysts: 82,
    news: 75,
    social: 65,
    forums: 78
  },
  signal: {
    recommendation: 'Buy',
    confidence: 85
  }
};

const investments = [
  { name: 'Digital Projection Technology', stake: '15%' },
  { name: 'Streaming Platform', stake: '8%' },
  { name: 'VR Entertainment', stake: '5%' }
];

// Endpoints
app.get('/api/price', (req, res) => {
  res.json({ symbol: req.query.symbol || 'AMC', series: priceSeries });
});

app.get('/api/metrics', (req, res) => {
  res.json(metrics);
});

app.get('/api/sentiment', (req, res) => {
  res.json(sentiment);
});

app.get('/api/investments', (req, res) => {
  res.json(investments);
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
