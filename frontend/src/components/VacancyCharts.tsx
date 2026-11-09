import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, usePlotArea, useXAxisScale } from 'recharts';
import type { ResponsePoint } from '../types';
import { number } from '../types';
import { normalizedSalaryLabel, salaryAxis } from '../analytics';
import type { SalaryPoint } from '../analytics';
import { gradeColor, gradeLabel, gradeLayout } from '../chartGrades';
import type { GradeBand, GradedPoint } from '../chartGrades';

const tick = { fontSize: 12, fill: 'var(--muted-foreground)' };
const tooltipStyle = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: 12, maxWidth: 320, boxShadow: 'var(--shadow-md)' };
const margin = { top: 16, right: 16, bottom: 4, left: 0 };
const gradeAxisHeight = 44;

function GradeBands({ groups }: { groups: GradeBand[] }) {
  const area = usePlotArea();
  const scale = useXAxisScale();
  if (!area || !scale) return null;
  const y = area.y + area.height;
  return <g className="grade-axis">{groups.map(group => {
    const start = scale(group.start), end = scale(group.end);
    if (start == null || end == null) return null;
    return <g key={group.label} className="grade-band" data-grade={group.label}>
      <line className="grade-band-line" x1={start} x2={end} y1={y + 10} y2={y + 10} stroke={group.color} strokeWidth={1} />
      <text className="grade-axis-label" x={(start + end) / 2} y={y + 32} fill="var(--foreground)" fontSize={12} textAnchor="middle">{group.label}</text>
    </g>;
  })}</g>;
}

function ResponseDot({ cx, cy, payload, onChoose, active = false }: { cx?: number; cy?: number; payload?: ResponsePoint & Partial<GradedPoint<ResponsePoint>>; onChoose: (id: string) => void; active?: boolean }) {
  if (cx == null || cy == null || !payload) return null;
  const grade = payload.chartGrade || gradeLabel(payload.grade);
  return <circle cx={cx} cy={cy} r={active ? 5 : 3} fill={payload.chartColor || gradeColor(grade)} stroke="var(--card)" strokeWidth={active ? 2 : 1} tabIndex={0} role="button" data-grade={grade} data-vacancy-id={payload.id} aria-label={`${payload.title}: ${number(payload.count)} откликов; грейд ${grade}`} className="response-point" onClick={() => onChoose(payload.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(payload.id); } }} />;
}

export function ResponsePlot({ points, mean, onChoose, expanded = false }: { points: ResponsePoint[]; mean: number | null; onChoose: (id: string) => void; expanded?: boolean }) {
  const layout = gradeLayout(points, point => point.count);
  const data = layout.points.map(point => ({ ...point, [point.seriesKey]: point.count }));
  const minWidth = Math.max(expanded ? 640 : 0, layout.width * (expanded ? 2 : 1) + 96);
  const chart = <ResponsiveContainer width="100%" height={(expanded ? 400 : 280) + gradeAxisHeight}><LineChart data={data} margin={margin}>
    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
    <XAxis type="number" dataKey="chartX" scale="linear" domain={[0, layout.width]} niceTicks="none" ticks={data.map(point => point.chartX)} tick={false} tickLine={false} axisLine={false} height={gradeAxisHeight} />
    <YAxis domain={[0, 'auto']} allowDecimals={false} axisLine={false} tickLine={false} tick={tick} tickMargin={10} width="auto" tickFormatter={value => number(Number(value))} />
    <Tooltip labelFormatter={(_, p) => p?.[0]?.payload?.title || ''} formatter={value => [number(Number(value)), 'Отклики']} contentStyle={tooltipStyle} itemStyle={{ color: 'var(--foreground)' }} />
    {layout.groups.map(group => <Line key={group.label} type="linear" dataKey={group.seriesKey} name="Отклики" stroke={group.color} strokeWidth={1.5} isAnimationActive={false} dot={<ResponseDot onChoose={onChoose} />} activeDot={<ResponseDot active onChoose={onChoose} />} />)}
    {mean != null && <ReferenceLine y={mean} stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
    <GradeBands groups={layout.groups} />
  </LineChart></ResponsiveContainer>;
  return <div className="response-chart"><p className="chart-axis-caption">Количество откликов</p><div className="graded-chart-scroll" role="region" aria-label="График откликов по грейдам" tabIndex={0}><div style={{ minWidth }}>{chart}</div></div><p className="chart-legend-note">Пунктиром показано среднее число откликов.</p></div>;
}

export function SalaryPlot({ points, onChoose, expanded = false }: { points: SalaryPoint[]; onChoose: (id: string) => void; expanded?: boolean }) {
  const layout = gradeLayout(points, point => point.normalizedRange[1]);
  const data = layout.points.map(point => ({ ...point, salaryAmount: point.normalizedRange[1] }));
  const minWidth = Math.max(expanded ? 640 : 0, layout.width * (expanded ? 2 : 1) + 96);
  const axis = salaryAxis(points.reduce((max, point) => Math.max(max, ...point.normalizedRange), 0));
  const chart = <ResponsiveContainer width="100%" height={(expanded ? 400 : 280) + gradeAxisHeight}><BarChart data={data} margin={margin}>
    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
    <XAxis type="number" dataKey="chartX" scale="linear" domain={[0, layout.width]} niceTicks="none" ticks={data.map(point => point.chartX)} tick={false} tickLine={false} axisLine={false} height={gradeAxisHeight} />
    <YAxis type="number" domain={axis.domain} ticks={axis.ticks} interval={0} allowDecimals={false} axisLine={false} tickLine={false} tick={tick} tickMargin={10} width="auto" tickFormatter={value => axis.formatTick(Number(value))} />
    <Tooltip labelFormatter={(_, p) => p?.[0]?.payload?.title || ''} formatter={(_, __, item) => [<span key="salary-tooltip"><strong>{normalizedSalaryLabel(item.payload as SalaryPoint)}</strong><br />{item.payload.raw}</span>, 'Зарплата']} contentStyle={tooltipStyle} itemStyle={{ color: 'var(--foreground)' }} />
    <Bar dataKey="salaryAmount" maxBarSize={32} radius={[4, 4, 0, 0]} isAnimationActive={false}>{data.map(p => <Cell key={p.id} className="chart-segment" role="button" tabIndex={0} data-grade={p.chartGrade} data-vacancy-id={p.id} aria-label={`${p.title}: ${normalizedSalaryLabel(p)}; грейд ${p.chartGrade}`} fill={p.chartColor} onClick={() => onChoose(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(p.id); } }} />)}</Bar>
    <GradeBands groups={layout.groups} />
  </BarChart></ResponsiveContainer>;
  return <div className="response-chart"><p className="chart-axis-caption">{axis.caption}</p><div className="graded-chart-scroll" role="region" aria-label="График зарплат по грейдам" tabIndex={0}><div style={{ minWidth }}>{chart}</div></div></div>;
}
