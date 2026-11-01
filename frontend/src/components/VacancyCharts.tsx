import {Bar,BarChart,CartesianGrid,Cell,Line,LineChart,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import type {ResponsePoint} from '../types';
import {number} from '../types';
import type {SalaryPoint} from '../analytics';

const tooltipStyle={borderRadius:10,border:'1px solid #e7e7ed',fontSize:12,maxWidth:360,boxShadow:'0 8px 24px #22222208'};
const tick={fontSize:10,fill:'#92929b'};

function ResponseDot({cx,cy,payload,onChoose,active=false}:{cx?:number;cy?:number;payload?:ResponsePoint;onChoose:(id:string)=>void;active?:boolean}) {
  if(cx==null||cy==null||!payload)return null;
  return <circle cx={cx} cy={cy} r={active?5:3} fill="#8870e6" stroke="white" strokeWidth={active?2:1} tabIndex={0} role="button" aria-label={`${payload.title}: ${number(payload.count)} откликов`} className="response-point" onClick={()=>onChoose(payload.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onChoose(payload.id)}}}/>;
}

export function ResponsePlot({points,mean,onChoose,expanded=false}:{points:ResponsePoint[];mean:number|null;onChoose:(id:string)=>void;expanded?:boolean}) {
  const data=points.map((p,i)=>({...p,index:i+1}));
  const chart=<ResponsiveContainer width="100%" height={expanded?370:280}><LineChart data={data} margin={{top:25,right:25,bottom:8,left:6}}>
    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#ededf1"/>
    <XAxis dataKey="index" axisLine={false} tickLine={false} tick={tick} minTickGap={25}/>
    <YAxis axisLine={false} tickLine={false} tick={tick} width={48}/>
    <Tooltip labelFormatter={(_,p)=>p?.[0]?.payload?.title||''} formatter={v=>[number(Number(v)),'Откликов']} contentStyle={tooltipStyle}/>
    <Line type="linear" dataKey="count" stroke="#8870e6" strokeWidth={1.7} isAnimationActive={false} dot={<ResponseDot onChoose={onChoose}/>} activeDot={<ResponseDot active onChoose={onChoose}/>}/>
    {mean!=null&&<ReferenceLine y={mean} stroke="#77717f" strokeDasharray="4 4" label={{value:`Среднее ${number(mean)}`,position:'insideTopRight',fill:'#837b8e',fontSize:10}}/>}
  </LineChart></ResponsiveContainer>;
  return expanded?<div className="expanded-bars"><div style={{minWidth:Math.max(680,points.length*26)}}>{chart}</div></div>:<div className="response-chart">{chart}</div>;
}

export function SalaryPlot({points,onChoose,expanded=false}:{points:SalaryPoint[];onChoose:(id:string)=>void;expanded?:boolean}) {
  const data=points.map((p,i)=>({...p,index:i+1}));
  const chart=<ResponsiveContainer width="100%" height={expanded?370:280}><BarChart data={data} margin={{top:20,right:25,bottom:8,left:12}}>
    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#ededf1"/>
    <XAxis dataKey="index" axisLine={false} tickLine={false} tick={tick} minTickGap={25}/>
    <YAxis axisLine={false} tickLine={false} tick={tick} width={60} tickFormatter={n=>Math.abs(Number(n))>=1000?`${number(Number(n)/1000)} тыс.`:number(Number(n))}/>
    <Tooltip labelFormatter={(_,p)=>p?.[0]?.payload?.title||''} formatter={(_,__,p)=>[p.payload.raw,'Зарплата']} contentStyle={tooltipStyle}/>
    <Bar dataKey="range" fill="#8870e6" maxBarSize={38} radius={[5,5,0,0]} isAnimationActive={false} onClick={p=>{if(p.id)onChoose(String(p.id))}}>
      {points.map(p=><Cell key={p.id} className="chart-segment" aria-label={`${p.title}: ${p.raw}`} fill="#a797e9"/>)}
    </Bar>
  </BarChart></ResponsiveContainer>;
  return expanded?<div className="expanded-bars"><div style={{minWidth:Math.max(680,points.length*40)}}>{chart}</div></div>:<div className="response-chart">{chart}</div>;
}
