import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ResponsePoint } from '../types';
import { number } from '../types';
import type { SalaryPoint } from '../analytics';

const tooltipStyle = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 12, maxWidth: 320, boxShadow: 'var(--shadow-md)' };
const tick = { fontSize: 11, fill: 'var(--muted-foreground)' };

function ResponseDot({ cx, cy, payload, onChoose, active = false }: { cx?: number; cy?: number; payload?: ResponsePoint; onChoose: (id: string) => void; active?: boolean }) {
  if (cx == null || cy == null || !payload) return null;
  return <circle cx={cx} cy={cy} r={active ? 5 : 3} fill="var(--chart-2)" stroke="var(--card)" strokeWidth={active ? 2 : 1} tabIndex={0} role="button" aria-label={`${payload.title}: ${number(payload.count)} откликов`} className="response-point" onClick={() => onChoose(payload.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(payload.id); } }} />;
}

export function ResponsePlot({ points, mean, onChoose, expanded = false }: { points: ResponsePoint[]; mean: number | null; onChoose: (id: string) => void; expanded?: boolean }) {
  const data = points.map((p, i) => ({ ...p, index: i + 1 }));
  const chart = <ResponsiveContainer width="100%" height={expanded ? 370 : 240}><LineChart data={data} margin={{ top: 25, right: 8, bottom: 8, left: -12 }}>
    <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--border)" /><XAxis dataKey="index" axisLine={false} tickLine={false} tick={tick} minTickGap={25} /><YAxis axisLine={false} tickLine={false} tick={tick} width={48} />
    <Tooltip labelFormatter={(_, p) => p?.[0]?.payload?.title || ''} formatter={v => [number(Number(v)), 'Откликов']} contentStyle={tooltipStyle} itemStyle={{ color: 'var(--foreground)' }} />
    <Line type="linear" dataKey="count" stroke="var(--chart-2)" strokeWidth={1.5} isAnimationActive={false} dot={<ResponseDot onChoose={onChoose} />} activeDot={<ResponseDot active onChoose={onChoose} />} />
    {mean != null && <ReferenceLine y={mean} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: `Среднее ${number(mean)}`, position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 11 }} />}
  </LineChart></ResponsiveContainer>;
  return expanded ? <div className="expanded-bars"><div style={{ minWidth: Math.max(680, points.length * 26) }}>{chart}</div></div> : <div className="response-chart">{chart}</div>;
}

export function SalaryPlot({ points, onChoose, expanded = false }: { points: SalaryPoint[]; onChoose: (id: string) => void; expanded?: boolean }) {
  const data = points.map((p, i) => ({ ...p, index: i + 1 }));
  const chart = <ResponsiveContainer width="100%" height={expanded ? 370 : 240}><BarChart data={data} margin={{ top: 20, right: 8, bottom: 8, left: -6 }}>
    <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--border)" /><XAxis dataKey="index" axisLine={false} tickLine={false} tick={tick} minTickGap={25} /><YAxis axisLine={false} tickLine={false} tick={tick} width={60} tickFormatter={n => Math.abs(Number(n)) >= 1000 ? `${number(Number(n) / 1000)} т.` : number(Number(n))} />
    <Tooltip labelFormatter={(_, p) => p?.[0]?.payload?.title || ''} formatter={(_, __, p) => [p.payload.raw, 'Зарплата']} contentStyle={tooltipStyle} itemStyle={{ color: 'var(--foreground)' }} />
    <Bar dataKey="range" fill="var(--chart-2)" maxBarSize={30} radius={[4, 4, 0, 0]} isAnimationActive={false}>
      {points.map(p => <Cell key={p.id} className="chart-segment" role="button" tabIndex={0} aria-label={`${p.title}: ${p.raw}`} fill="var(--chart-2)" onClick={() => onChoose(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(p.id); } }} />)}
    </Bar>
  </BarChart></ResponsiveContainer>;
  return expanded ? <div className="expanded-bars"><div style={{ minWidth: Math.max(680, points.length * 40) }}>{chart}</div></div> : <div className="response-chart">{chart}</div>;
}
