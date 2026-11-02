"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const NAVY = "#243f6d";

export function MonthlyChart({ data, label }: { data: Array<{ month: string; n: number }>; label: string }) {
  return (
    <div role="img" aria-label={label} className="h-56">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="n" name={label} fill={NAVY} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusDonut({ data, label }: { data: Array<{ name: string; value: number; color: string }>; label: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div role="img" aria-label={`${label}: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}`} className="h-56">
      {total === 0 ? <p className="pt-20 text-center text-sm text-slate-500">—</p> : (
        <ResponsiveContainer>
          <PieChart>
            <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function HBarChart({ data, label }: { data: Array<{ name: string; n: number }>; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ height: Math.max(120, data.length * 38) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="n" fill={NAVY} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
