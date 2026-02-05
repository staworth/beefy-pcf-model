import { useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const formatCompact = (value) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const formatMonthLabel = (monthIndex) => {
  const startYear = 2026;
  const startMonth = 4;
  const absoluteMonth = startMonth - 1 + monthIndex;
  const year = startYear + Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;
  const yy = String(year).slice(-2);
  return `${yy}-${month}`;
};

const downloadBlob = (blob, filename) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const svgToPng = async (svgElement, filename, background = "#111111") => {
  const bbox = svgElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(bbox.width));
  const height = Math.max(1, Math.floor(bbox.height));
  const cloned = svgElement.cloneNode(true);
  cloned.setAttribute("width", width);
  cloned.setAttribute("height", height);
  const svgData = new XMLSerializer().serializeToString(cloned);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) downloadBlob(blob, filename);
          resolve();
        });
      } else {
        resolve();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
};

function NumberControl({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  inputFormatter,
  inputParser,
  inputMode = "numeric",
}) {
  const displayValue =
    inputFormatter && Number.isFinite(value) ? inputFormatter(value) : value;
  return (
    <div className="control">
      <div className="control__label">{label}</div>
      <div className="control__inputs">
        <input
          className="control__range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className="control__field">
          <input
            className="control__number"
            type="text"
            inputMode={inputMode}
            value={displayValue}
            onChange={(event) => {
              const raw = event.target.value;
              const nextValue = inputParser
                ? inputParser(raw)
                : Number(raw.replace(/[^\d.-]/g, ""));
              if (Number.isNaN(nextValue)) {
                return;
              }
              onChange(nextValue);
            }}
          />
          {suffix ? <span className="control__suffix">{suffix}</span> : null}
        </div>
      </div>
    </div>
  );
}

function buildModel({
  timescaleMonths,
  premiumValue,
  purchaseCadenceDays,
  policyDurationDays,
  bootstrapFunding,
  premiumCostPct,
}) {
  const totalDays = Math.round(timescaleMonths * 30);
  const purchaseDays = [];
  for (let day = purchaseCadenceDays; day <= totalDays; day += purchaseCadenceDays) {
    if (day >= 0) {
      purchaseDays.push(day);
    }
  }

  const data = [];
  let cumulativePremiums = 0;
  let rollingPremiums = 0;
  const activePurchases = [];
  const premiumCost = premiumCostPct / 100;

  for (let day = 0; day <= totalDays; day += 1) {
    const isPurchaseDay = purchaseDays.includes(day);
    const bootstrapPurchase = day === 0 ? bootstrapFunding : 0;
    const purchase = isPurchaseDay ? premiumValue : 0;
    const totalPurchase = purchase + bootstrapPurchase;
    if (totalPurchase > 0) {
      cumulativePremiums += totalPurchase;
      rollingPremiums += totalPurchase;
      activePurchases.push({ day, amount: totalPurchase });
    }

    while (
      activePurchases.length > 0 &&
      day - activePurchases[0].day >= policyDurationDays
    ) {
      const expired = activePurchases.shift();
      rollingPremiums -= expired.amount;
    }

    const coverage = premiumCost > 0 ? rollingPremiums / premiumCost : 0;

    data.push({
      day,
      purchase: totalPurchase,
      cumulativePremiums,
      coverage,
    });
  }

  return data;
}

export default function App() {
  const [timescaleMonths, setTimescaleMonths] = useState(24);
  const [premiumValue, setPremiumValue] = useState(50000);
  const [purchaseCadenceDays, setPurchaseCadenceDays] = useState(30);
  const [policyDurationDays, setPolicyDurationDays] = useState(90);
  const [bootstrapFunding, setBootstrapFunding] = useState(0);
  const [premiumCostPct, setPremiumCostPct] = useState(8);
  const [activeTab, setActiveTab] = useState("chart");
  const chartRef = useRef(null);

  const data = useMemo(
    () =>
      buildModel({
        timescaleMonths,
        premiumValue,
        purchaseCadenceDays,
        policyDurationDays,
        bootstrapFunding,
        premiumCostPct,
      }),
    [
      timescaleMonths,
      premiumValue,
      purchaseCadenceDays,
      policyDurationDays,
      bootstrapFunding,
      premiumCostPct,
    ]
  );

  const monthlyData = useMemo(() => {
    const months = Array.from({ length: timescaleMonths }, (_, index) => ({
      monthIndex: index,
      label: formatMonthLabel(index),
      purchases: 0,
      cumulativePremiums: 0,
      coverage: 0,
    }));

    data.forEach((point) => {
      const monthIndex = Math.floor(point.day / 30);
      const month = months[monthIndex];
      if (!month) return;
      month.purchases += point.purchase;
      month.cumulativePremiums = point.cumulativePremiums;
      month.coverage = point.coverage;
    });

    return months;
  }, [data, timescaleMonths]);

  const yMax = useMemo(() => {
    const max = data.reduce((acc, point) => {
      const localMax = Math.max(
        point.purchase || 0,
        point.cumulativePremiums || 0,
        point.coverage || 0
      );
      return Math.max(acc, localMax);
    }, 0);
    return Math.max(1, max);
  }, [data]);

  const renderPurchaseDot = (props) => {
    const { cx, cy, payload } = props;
    if (!payload || payload.purchase <= 0) return null;
    return <circle cx={cx} cy={cy} r={4} fill="#2b6b3a" />;
  };

  const readmeText = `This is a simple one-page React app that models insurance premium purchases and the resulting cumulative coverage over time. It lets you tune purchase cadence, policy duration, and premium cost to see how coverage evolves on a monthly timeline.

Built by jackgale.eth (Staworth Limited).

Model Overview
1. Premium Purchases (scatter)
   The premium paid on each purchase date.
2. Cumulative Purchases (line)
   Running total of all premium purchases to date.
3. Cumulative Coverage (area)
   The sum of non-expired premium purchases divided by the premium cost percentage.

Coverage calculation example:
- $800k of valid (non-expired) premium purchases
- 8% premium cost
- Coverage = $800k / 0.08 = $10M

Configuration Parameters
- Timescale (months): Total model duration (12–60 months).
- Premium Value: Amount for each recurring premium purchase ($1k–$500k).
- Purchase Cadence (days): Days between purchases (1–365).
- Policy Duration (days): How long each purchase remains valid (1–365).
- Bootstrap Funding: One-time day-one purchase amount (default 0).
- Premium Cost (%): Percentage applied to calculate coverage (1–30%).

License
MIT`;

  const handleDownload = async () => {
    if (activeTab === "chart") {
      const svg = chartRef.current?.querySelector("svg");
      if (!svg) return;
      await svgToPng(svg, "coverage-chart.png");
      return;
    }

    if (activeTab === "readme") {
      return;
    }

    const headers = [
      "Month",
      "Premium Purchases",
      "Cumulative Purchases",
      "Cumulative Coverage",
    ];
    const rows = monthlyData.map((month) => [
      month.label,
      month.purchases,
      month.cumulativePremiums,
      month.coverage,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.join(","))
      .join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "coverage-table.csv");
  };

  return (
    <div className="app">
      <div className="chart-panel">
        <div className="chart-panel__header">
          <div>
            <h1>Beefy DAO - Protocol Coverage Fund Model</h1>
          </div>
        </div>
        <div className="chart-panel__tabs">
          <button
            type="button"
            className={`tab ${activeTab === "chart" ? "tab--active" : ""}`}
            onClick={() => setActiveTab("chart")}
          >
            Chart
          </button>
          <button
            type="button"
            className={`tab ${activeTab === "table" ? "tab--active" : ""}`}
            onClick={() => setActiveTab("table")}
          >
            Table
          </button>
          <button
            type="button"
            className={`tab ${activeTab === "readme" ? "tab--active" : ""}`}
            onClick={() => setActiveTab("readme")}
          >
            README
          </button>
          <button type="button" className="download" onClick={handleDownload}>
            Download
          </button>
        </div>
        <div className="chart-panel__chart" ref={chartRef}>
          {activeTab === "chart" ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 10, right: 40, left: 10 }}
              >
                <CartesianGrid strokeDasharray="4 4" stroke="#2a2a2a" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(value) =>
                    formatMonthLabel(Math.floor(value / 30))
                  }
                  stroke="#94a3b8"
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="main"
                  stroke="#94a3b8"
                  tickFormatter={(value) => formatCompact(value)}
                  domain={[0, yMax * 1.1]}
                />
                <Tooltip
                  formatter={(value, name) => [formatCurrency(value), name]}
                  labelFormatter={(label) =>
                    `Day ${label} · ${formatMonthLabel(
                      Math.floor(label / 30)
                    )}`
                  }
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #1f2937",
                    borderRadius: 10,
                  }}
                />
                <Legend />
                <Area
                  yAxisId="main"
                  type="monotone"
                  dataKey="coverage"
                  name="Cumulative Coverage"
                  fill="#fb923c"
                  stroke="#f97316"
                  strokeWidth={2}
                  fillOpacity={0.2}
                />
                <Area
                  yAxisId="main"
                  type="monotone"
                  dataKey="cumulativePremiums"
                  name="Cumulative Purchases (Area)"
                  fill="#2b6b3a"
                  stroke="#2b6b3a"
                  strokeWidth={0}
                  fillOpacity={0.15}
                  legendType="none"
                />
                <Line
                  yAxisId="main"
                  type="monotone"
                  dataKey="cumulativePremiums"
                  name="Cumulative Purchases"
                  stroke="#2b6b3a"
                  strokeWidth={3}
                  dot={false}
                />
                <Scatter
                  yAxisId="main"
                  data={data}
                  dataKey="purchase"
                  name="Premium Purchases"
                  fill="#2b6b3a"
                  shape={renderPurchaseDot}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : activeTab === "table" ? (
            <div className="chart-table">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Premium Purchases</th>
                    <th>Cumulative Purchases</th>
                    <th>Cumulative Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((month) => (
                    <tr key={month.label}>
                      <td>{month.label}</td>
                      <td>{formatCurrency(month.purchases)}</td>
                      <td>{formatCurrency(month.cumulativePremiums)}</td>
                      <td>{formatCurrency(month.coverage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="chart-readme">
              <pre>{readmeText}</pre>
            </div>
          )}
        </div>
      </div>

      <section className="config">
        <div className="config__header">
          <h2>Configuration</h2>
          <p>Adjust inputs to see the coverage model update in real time.</p>
        </div>
        <div className="config__grid">
          <NumberControl
            label="Timescale"
            value={timescaleMonths}
            onChange={(value) => setTimescaleMonths(clamp(value, 12, 60))}
            min={12}
            max={60}
            step={1}
            suffix="months"
          />
          <NumberControl
            label="Premium Value"
            value={premiumValue}
            onChange={(value) => setPremiumValue(clamp(value, 1000, 500000))}
            min={1000}
            max={500000}
            step={1000}
            inputFormatter={formatCurrency}
            inputParser={(raw) =>
              Number(raw.replace(/[^\d]/g, "")) || 0
            }
          />
          <NumberControl
            label="Purchase Cadence"
            value={purchaseCadenceDays}
            onChange={(value) =>
              setPurchaseCadenceDays(clamp(value, 1, 365))
            }
            min={1}
            max={365}
            step={1}
            suffix="days"
          />
          <NumberControl
            label="Policy Duration"
            value={policyDurationDays}
            onChange={(value) => setPolicyDurationDays(clamp(value, 1, 365))}
            min={1}
            max={365}
            step={1}
            suffix="days"
          />
          <NumberControl
            label="Bootstrap Funding"
            value={bootstrapFunding}
            onChange={(value) => setBootstrapFunding(clamp(value, 0, 500000))}
            min={0}
            max={500000}
            step={1000}
            inputFormatter={formatCurrency}
            inputParser={(raw) =>
              Number(raw.replace(/[^\d]/g, "")) || 0
            }
          />
          <NumberControl
            label="Premium Cost"
            value={premiumCostPct}
            onChange={(value) => setPremiumCostPct(clamp(value, 1, 30))}
            min={1}
            max={30}
            step={0.5}
            suffix="%"
            inputMode="decimal"
            inputFormatter={(value) => Number(value).toFixed(2)}
            inputParser={(raw) => {
              const parsed = Number(raw.replace(/[^0-9.]/g, ""));
              return Number.isNaN(parsed) ? premiumCostPct : parsed;
            }}
          />
        </div>
      </section>
    </div>
  );
}
