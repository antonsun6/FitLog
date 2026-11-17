"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function BodyweightChart({
  data,
  unitLabel,
}: {
  data: { date: string; weight: number }[];
  unitLabel: string;
}) {
  return (
    <div className="bodyweight-chart h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="var(--chart-grid)"
            tick={{ fill: "var(--chart-text)", fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            stroke="var(--chart-grid)"
            tick={{ fill: "var(--chart-text)", fontSize: 12 }}
            tickLine={false}
            width={48}
            domain={["auto", "auto"]}
            unit={unitLabel}
          />
          <Tooltip
            formatter={(value) => [`${value} ${unitLabel}`, "Weight"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="var(--chart-line)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--chart-line)", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
