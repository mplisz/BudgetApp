// ============================================================
// File: src/components/panels/analyticsComponents/MonthlyTrendChart.tsx
// Line chart: income / transfers / expenses / savings / balance per month.
// ============================================================

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export interface MonthlyDataPoint {
  month:     string;   // "YYYY-MM"
  income:    number;
  transfers: number;
  expenses:  number;
  savings:   number;
  balance:   number;
}

interface MonthlyTrendChartProps {
  data: MonthlyDataPoint[];
}

export function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
        Brak danych w wybranym zakresie.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 12, right: 20, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="month" stroke="#475569" fontSize={11} />
        <YAxis stroke="#475569" fontSize={11} />
        <Tooltip
          contentStyle={{ background: "#0d1424", border: "1px solid #1e293b", borderRadius: 8 }}
          labelStyle={{ color: "#e2e8f0" }}
          formatter={(v: unknown) => {
            const num = typeof v === "number" ? v : Number(v) || 0;
            return `${num.toLocaleString("pl-PL")} zł`;
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="income"    name="Wpływy"        stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="transfers" name="Transfery"     stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="expenses"  name="Wydatki"       stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="savings"   name="Oszczędności"  stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="balance"   name="Saldo"         stroke="#e2e8f0" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 4" />
      </LineChart>
    </ResponsiveContainer>
  );
}
