import {Bar,BarChart,CartesianGrid,Cell,Line,LineChart,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import type {TooltipContentProps} from 'recharts';
import type {ResponsePoint} from '../types';
import {number} from '../types';
import type {SalaryPoint} from '../analytics';
import {kitColors} from '../designTokens';

const tooltipStyle={borderRadius:10,border:`1px solid ${kitColors.violet[1]}`,background:kitColors.white,fontSize:12,maxWidth:360};
const tick={fontSize:10,fill:kitColors.gray[3]};

function SalaryTooltip({active,payload}:TooltipContentProps) {
  if(!active||!payload?.length)return null;
  const item=payload[0]?.payload as SalaryPoint|undefined;
  if(!item)return null;
  const normalized=`${number(item.normalizedRange[0])}–${number(item.normalizedRange[1])} ₽`;
  return <div style={{...tooltipStyle,padding:'9px 11px'}}><strong style={{display:'block',fontSize:12,fontWeight:600,color:kitColors.ink,marginBottom:4}}>{item.title}</strong><span style={{display:'block',color:kitColors.gray[5]}}>Original salary: {item.original}</span><span style={{display:'block',color:kitColors.gray[4],marginTop:3}}>Normalized: {normalized}</span></div>;
}

function ResponseDot({cx,cy,payload,onChoose,active=false}:{cx?:number;cy?:number;payload?:ResponsePoint;onChoose:(id:string)=>void;active?:boolean}) {
  if(cx==null||cy==null||!payload)return null;
  return <circle cx={cx} cy={cy} r={active?5:3} fill={kitColors.violet[6]} stroke={kitColors.white} strokeWidth={active?2:1} tabIndex={0} role="button" aria-label={`${payload.title}: ${number(payload.count)} applications`} className="response-point" onClick={()=>onChoose(payload.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onChoose(payload.id)}}}/>;
}

export function ResponsePlot({points,mean,onChoose,expanded=false}:{points:ResponsePoint[];mean:number|null;onChoose:(id:string)=>void;expanded?:boolean}) {
  const data=points.map((p,i)=>({...p,index:i+1}));
  const chart=<ResponsiveContainer width="100%" height={expanded?370:280}><LineChart data={data} margin={{top:25,right:25,bottom:8,left:6}}>
    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={kitColors.violet[0]}/>
    <XAxis dataKey="index" axisLine={false} tickLine={false} tick={tick} minTickGap={25}/>
    <YAxis axisLine={false} tickLine={false} tick={tick} width={48}/>
    <Tooltip labelFormatter={(_,p)=>p?.[0]?.payload?.title||''} formatter={v=>[number(Number(v)),'Applications']} contentStyle={tooltipStyle}/>
    <Line type="linear" dataKey="count" stroke={kitColors.violet[6]} strokeWidth={1.7} isAnimationActive={false} dot={<ResponseDot onChoose={onChoose}/>} activeDot={<ResponseDot active onChoose={onChoose}/>}/>
    {mean!=null&&<ReferenceLine y={mean} stroke={kitColors.gray[3]} strokeDasharray="4 4" label={{value:`Average ${number(mean)}`,position:'insideTopRight',fill:kitColors.gray[5],fontSize:10}}/>}
  </LineChart></ResponsiveContainer>;
  return expanded?<div className="expanded-bars"><div style={{minWidth:Math.max(680,points.length*26)}}>{chart}</div></div>:<div className="response-chart">{chart}</div>;
}

export function SalaryPlot({points,onChoose,expanded=false}:{points:SalaryPoint[];onChoose:(id:string)=>void;expanded?:boolean}) {
  const data=points.map((p,i)=>({...p,index:i+1}));
  const chart=<ResponsiveContainer width="100%" height={expanded?370:280}><BarChart data={data} margin={{top:20,right:25,bottom:8,left:12}}>
    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={kitColors.violet[0]}/>
    <XAxis dataKey="index" axisLine={false} tickLine={false} tick={tick} minTickGap={25}/>
    <YAxis axisLine={false} tickLine={false} tick={tick} width={60} tickFormatter={n=>Math.abs(Number(n))>=1000?`${number(Number(n)/1000)}k`:number(Number(n))}/>
    <Tooltip content={SalaryTooltip} contentStyle={tooltipStyle}/>
    <Bar dataKey="normalizedFrom" stackId="salary" fill="transparent" maxBarSize={38} isAnimationActive={false} tooltipType="none" />
    <Bar dataKey="normalizedSpan" stackId="salary" fill={kitColors.violet[6]} maxBarSize={38} radius={[5,5,0,0]} isAnimationActive={false} onClick={p=>{const id=p?.payload?.id;if(id)onChoose(String(id))}}>
      {points.map(p=><Cell key={p.id} className="chart-segment" aria-label={`${p.title}: ${p.original}, ${number(p.normalizedRange[0])}–${number(p.normalizedRange[1])} ₽`} fill={kitColors.violet[6]}/>)}
    </Bar>
  </BarChart></ResponsiveContainer>;
  return expanded?<div className="expanded-bars"><div style={{minWidth:Math.max(680,points.length*40)}}>{chart}</div></div>:<div className="response-chart">{chart}</div>;
}
