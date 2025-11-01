import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const sampleData = [
  { date: "2023-11", price: 10.5 },
  { date: "2023-12", price: 7.0 },
  { date: "2024-01", price: 5.5 },
  { date: "2024-02", price: 4.2 },
  { date: "2024-03", price: 3.8 },
  { date: "2024-04", price: 6.2 },
  { date: "2024-05", price: 4.8 },
  { date: "2024-06", price: 4.3 },
  { date: "2024-07", price: 4.1 },
  { date: "2024-08", price: 3.9 },
  { date: "2024-09", price: 4.0 },
  { date: "2024-10", price: 4.2 },
];

function FinancialDashboard() {
  const [search, setSearch] = useState("AMC");

  return (
    <div className="p-8 space-y-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold">Financial Analysis</h1>
      <p className="text-gray-500">Real-time market insights and analysis</p>

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Enter company name..."
          className="max-w-sm"
        />
        <Button>Search</Button>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Chiffre d'affaires (Revenue)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">$4.49B</p>
            <p className="mt-[5px] text-sm text-neutral-500">0.0%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Market Sentiment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl text-green-600 font-semibold">72.0%</p>
            <p className="text-sm text-gray-500">Positive</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Free Cash Flow (FCF)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 items-">
            <p className="text-2xl font-semibold">-$181.61M</p>
            <p className="text-sm text-gray-500">FCF Margin: -4.0%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Level</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-red-600">Very High</p>
            <p className="mt-[5px] text-sm text-gray-500">Beta: 0.60</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart and Company Info Section */}
      <div className="space-y-6">
        {/* Chart Section */}
        <Card>
          <CardHeader>
            <CardTitle>Stock Price Movement of {search}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={sampleData}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Key Metrics and Public Sentiment Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Market Sentiment Card */}
          <Card>
            <CardHeader>
              <CardTitle>Market Sentiment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Overall Sentiment */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Market Direction</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Positive</span>
                    <span className="font-medium text-green-600">72%</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full">
                    <div className="bg-green-500 h-2 rounded-full w-[72%]" />
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Other</span>
                    <span className="font-medium text-neutral-600">28%</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full">
                    <div className="bg-neutral-500 h-2 rounded-full w-[28%]" />
                  </div>
                </div>
              </div>

              {/* Source Analysis */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Source Analysis</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Analysts</h4>
                    <p className="text-lg font-semibold text-green-600">82%</p>
                    <p className="text-xs text-gray-500">Strong Buy</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">News</h4>
                    <p className="text-lg font-semibold text-green-600">75%</p>
                    <p className="text-xs text-gray-500">Positive</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Social</h4>
                    <p className="text-lg font-semibold text-yellow-600">65%</p>
                    <p className="text-xs text-gray-500">Moderate</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Forums</h4>
                    <p className="text-lg font-semibold text-green-600">78%</p>
                    <p className="text-xs text-gray-500">Bullish</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Key Metrics Card */}
          <Card>
            <CardHeader>
              <CardTitle>Key Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Fundamental Metrics */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Fundamental</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">P/E Ratio</h4>
                    <p className="text-lg font-semibold">15.2x</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Beta</h4>
                    <p className="text-lg font-semibold">0.60</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Margin</h4>
                    <p className="text-lg font-semibold">18.3%</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Rating</h4>
                    <p className="text-lg font-semibold">BBB+</p>
                  </div>
                </div>
              </div>

              {/* Technical Metrics */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Technical</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">RSI (14d)</h4>
                    <p className="text-lg font-semibold text-green-600">65.2</p>
                    <p className="text-xs text-gray-500">Strong Momentum</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">MACD</h4>
                    <p className="text-lg font-semibold text-green-600">+0.42</p>
                    <p className="text-xs text-gray-500">Bullish Signal</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Volume Ratio</h4>
                    <p className="text-lg font-semibold text-blue-600">1.85x</p>
                    <p className="text-xs text-gray-500">Above Average</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Volatility</h4>
                    <p className="text-lg font-semibold text-yellow-600">32.5%</p>
                    <p className="text-xs text-gray-500">30d Average</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Market Position and Investment Portfolio */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Market Position Card */}
          <Card>
            <CardHeader>
              <CardTitle>Market Position</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">Main Rivals</h4>
                <div className="mt-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Netflix</p>
                    <span className="text-xs text-red-500">Direct Competitor</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Cinemark</p>
                    <span className="text-xs text-yellow-500">Regional Rival</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Cineworld</p>
                    <span className="text-xs text-yellow-500">International Rival</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Strategic Partners</h4>
                <div className="mt-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Disney</p>
                    <span className="text-xs text-green-500">Content Distribution</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">IMAX</p>
                    <span className="text-xs text-blue-500">Technology Partner</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Investment Portfolio Card */}
          <Card>
            <CardHeader>
              <CardTitle>Investment Portfolio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">Major Investments</h4>
                <div className="mt-2 space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm font-medium">Digital Projection Technology</p>
                      <span className="text-xs font-medium text-green-500">15% Stake</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full">
                      <div className="bg-green-500 h-2 rounded-full w-[15%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm font-medium">Streaming Platform</p>
                      <span className="text-xs font-medium text-blue-500">8% Stake</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full">
                      <div className="bg-blue-500 h-2 rounded-full w-[8%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm font-medium">VR Entertainment</p>
                      <span className="text-xs font-medium text-purple-500">5% Stake</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full">
                      <div className="bg-purple-500 h-2 rounded-full w-[5%]" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-2">
                <h4 className="text-sm font-medium text-gray-500">Investment Strategy</h4>
                <p className="text-xs text-gray-600 mt-1">
                  Focused on next-gen entertainment technology and digital transformation initiatives
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}

export default FinancialDashboard