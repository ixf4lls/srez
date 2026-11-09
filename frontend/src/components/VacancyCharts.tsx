import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ResponsePoint } from '../types';
import { number } from '../types';
import { normalizedSalaryLabel, salaryAxis } from '../analytics';
import type { SalaryPoint } from '../analytics';

const tick = { fontSize: 12, fill: 'var(--muted-foreground)' };
const tooltipStyle = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 12, maxWidth: 320, boxShadow: 'var(--shadow-md)' };
const margin = { top: 16, right: 16, bottom: 4, left: 0 };
function indexTicks(length: number) { return [...new Set([1, ...[.25, .5, .75, 1].map(f => Math.max(1, Math.ceil(length * f)))])]; }

function ResponseDot({ cx, cy, payload, onChoose, active = false }: { cx?: number; cy?: number; payload?: ResponsePoint; onChoose: (id: string) => void; active?: boolean }) {
  if (cx == null || cy == null || !payload) return null;
  return <circle cx={cx} cy={cy} r={active ? 5 : 3} fill="var(--chart-2)" stroke="var(--card)" strokeWidth={active ? 2 : 1} tabIndex={0} role="button" aria-label={`${payload.title}: ${number(payload.count)} откликов`} className="response-point" onClick={() => onChoose(payload.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(payload.id); } }} />;
}

export function ResponsePlot({ points, mean, onChoose, expanded = false }: { points: ResponsePoint[]; mean: number | null; onChoose: (id: string) => void; expanded?: boolean }) {
  const data = points.map((p, i) => ({ ...p, index: i + 1 }));
  const chart = <ResponsiveContainer width="100%" height={expanded ? 400 : 280}><LineChart data={data} margin={margin}>
    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
    <XAxis dataKey="index" ticks={indexTicks(data.length)} interval="preserveStartEnd" minTickGap={24} axisLine={{ stroke: 'var(--border)' }} tickLine={false} tick={tick} tickMargin={10} height={36} />
    <YAxis domain={[0, 'auto']} allowDecimals={false} axisLine={false} tickLine={false} tick={tick} tickMargin={10} width="auto" tickFormatter={value => number(Number(value))} />
    <Tooltip labelFormatter={(_, p) => p?.[0]?.payload?.title || ''} formatter={value => [number(Number(value)), 'Отклики']} contentStyle={tooltipStyle} itemStyle={{ color: 'var(--foreground)' }} />
    <Line type="linear" dataKey="count" stroke="var(--chart-2)" strokeWidth={1.5} isAnimationActive={false} dot={<ResponseDot onChoose={onChoose} />} activeDot={<ResponseDot active onChoose={onChoose} />} />
    {mean != null && <ReferenceLine y={mean} stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
  </LineChart></ResponsiveContainer>;
  return <div className="response-chart"><p className="chart-axis-caption">Количество откликов</p>{expanded ? <div className="expanded-bars"><div style={{ minWidth: Math.max(640, points.length * 24) }}>{chart}</div></div> : chart}<p className="chart-index-caption">Вакансии</p><p className="chart-legend-note">Пунктиром показано среднее число откликов.</p></div>;
}

export function SalaryPlot({ points, onChoose, expanded = false }: { points: SalaryPoint[]; onChoose: (id: string) => void; expanded?: boolean }) {
  const data = points.map((p, i) => ({ ...p, index: i + 1, salaryAmount: p.normalizedRange[1] }));
  const axis = salaryAxis(points.reduce((max, point) => Math.max(max, ...point.normalizedRange), 0));
  const chart = <ResponsiveContainer width="100%" height={expanded ? 400 : 280}><BarChart data={data} margin={margin}>
    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
    <XAxis dataKey="index" hide />
    <YAxis type="number" domain={axis.domain} ticks={axis.ticks} interval={0} allowDecimals={false} axisLine={false} tickLine={false} tick={tick} tickMargin={10} width="auto" tickFormatter={value => axis.formatTick(Number(value))} />
    <Tooltip labelFormatter={(_, p) => p?.[0]?.payload?.title || ''} formatter={(_, __, item) => [<span key="salary-tooltip"><strong>{normalizedSalaryLabel(item.payload as SalaryPoint)}</strong><br />{item.payload.raw}</span>, 'Зарплата']} contentStyle={tooltipStyle} itemStyle={{ color: 'var(--foreground)' }} />
    <Bar dataKey="salaryAmount" fill="var(--chart-2)" maxBarSize={32} radius={[4, 4, 0, 0]} isAnimationActive={false}>{points.map(p => <Cell key={p.id} className="chart-segment" role="button" tabIndex={0} aria-label={`${p.title}: ${normalizedSalaryLabel(p)}`} fill="var(--chart-2)" onClick={() => onChoose(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(p.id); } }} />)}</Bar>
  </BarChart></ResponsiveContainer>;
  return <div className="response-chart"><p className="chart-axis-caption">{axis.caption}</p>{expanded ? <div className="expanded-bars"><div style={{ minWidth: Math.max(640, points.length * 36) }}>{chart}</div></div> : chart}</div>;
}
