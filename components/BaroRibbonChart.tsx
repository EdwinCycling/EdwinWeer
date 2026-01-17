import React, { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { AppSettings } from '../types';

interface Props {
  data: {
    dates: string[];
    maxTemps: (number | null)[];
    minTemps: (number | null)[];
  };
  settings: AppSettings;
  onPointClick: (date: string) => void;
}

export const BaroRibbonChart: React.FC<Props> = ({ data, settings, onPointClick }) => {
    
    const processedData = useMemo(() => {
        const result = [];
        for (let i = 0; i < data.dates.length; i++) {
            if (data.maxTemps[i] !== null && data.minTemps[i] !== null) {
                const max = data.maxTemps[i] as number;
                const min = data.minTemps[i] as number;
                result.push({
                    date: data.dates[i],
                    max,
                    min,
                    range: [min, max],
                    rawDate: new Date(data.dates[i]).getTime()
                });
            }
        }
        return result;
    }, [data]);

    const yearDomain = useMemo(() => {
        if (processedData.length === 0) return [0, 0];
        const year = new Date(processedData[0].date).getFullYear();
        return [
            new Date(year, 0, 1).getTime(),
            new Date(year, 11, 31, 23, 59, 59).getTime()
        ];
    }, [processedData]);

    const monthTicks = useMemo(() => {
        if (processedData.length === 0) return [];
        const year = new Date(processedData[0].date).getFullYear();
        const ticks = [];
        for (let m = 0; m < 12; m++) {
            ticks.push(new Date(year, m, 1).getTime());
        }
        return ticks;
    }, [processedData]);

    const top5Hot = useMemo(() => {
        return [...processedData]
            .sort((a, b) => b.max - a.max)
            .slice(0, 5)
            .map((item, index) => ({ ...item, rank: index + 1, type: 'hot' }));
    }, [processedData]);

    const top5Cold = useMemo(() => {
        return [...processedData]
            .sort((a, b) => a.min - b.min)
            .slice(0, 5)
            .map((item, index) => ({ ...item, rank: index + 1, type: 'cold' }));
    }, [processedData]);

    const chartData = useMemo(() => {
         const hotDates = new Map(top5Hot.map(p => [p.date, p.rank]));
         const coldDates = new Map(top5Cold.map(p => [p.date, p.rank]));
 
         return processedData.map(item => ({
             ...item,
             hotHighlight: hotDates.has(item.date) ? item.max : null,
             coldHighlight: coldDates.has(item.date) ? item.min : null,
             hotRank: hotDates.get(item.date),
             coldRank: coldDates.get(item.date)
         }));
     }, [processedData, top5Hot, top5Cold]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const dateObj = new Date(payload[0]?.payload?.date || label);
            const formattedDate = dateObj.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' });

            return (
                <div className="bg-bg-card p-3 rounded-lg border border-border-color shadow-xl z-50">
                    <p className="font-bold mb-2 text-text-main">{formattedDate}</p>
                    {payload.map((p: any, i: number) => {
                        if (p.dataKey === 'range') return null;
                        
                        if (p.dataKey === 'hotHighlight') {
                             return <div key={i} className="text-red-600 font-bold mb-1">🔥 #{p.payload.hotRank} Warmste dag ({p.value}°)</div>;
                        }
                        if (p.dataKey === 'coldHighlight') {
                             return <div key={i} className="text-blue-600 font-bold mb-1">❄️ #{p.payload.coldRank} Koudste nacht ({p.value}°)</div>;
                        }

                        if (p.dataKey === 'max') return <div key={i} className="text-red-500 text-sm">Max: {p.value}°</div>;
                        if (p.dataKey === 'min') return <div key={i} className="text-blue-500 text-sm">Min: {p.value}°</div>;
                        
                        return null;
                    })}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full h-[400px] flex flex-col items-center bg-bg-card rounded-2xl p-4 border border-border-color mt-6">
            <h3 className="text-lg font-bold text-text-main mb-4">Baro Ribbon (Jaarverloop)</h3>
            <div className="w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} stroke="var(--text-muted)" />
                        
                        {/* Month Vertical Lines */}
                        {monthTicks.map(tick => (
                            <ReferenceLine key={tick} x={tick} stroke="var(--text-muted)" strokeWidth={1} opacity={0.2} />
                        ))}

                        {/* 0 Degree Line */}
                        <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={2} opacity={0.5} />

                        <XAxis 
                            dataKey="rawDate" 
                            scale="time" 
                            type="number" 
                            domain={yearDomain} 
                            ticks={monthTicks}
                            tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString('nl-NL', { month: 'short' })}
                            stroke="var(--text-muted)"
                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                            padding={{ left: 0, right: 0 }}
                        />
                        <YAxis 
                            stroke="var(--text-muted)" 
                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                        
                        {/* Ribbon */}
                        <Area 
                            type="monotone" 
                            dataKey="range" 
                            stroke="none" 
                            fill="#3b82f6" 
                            fillOpacity={0.15} 
                            isAnimationActive={false}
                        />

                        {/* Lines */}
                        <Line type="monotone" dataKey="max" stroke="#ef4444" strokeWidth={1} dot={false} name="Max" isAnimationActive={false} />
                        <Line type="monotone" dataKey="min" stroke="#3b82f6" strokeWidth={1} dot={false} name="Min" isAnimationActive={false} />

                        {/* Scatter Points (Highlights) */}
                        <Scatter 
                            dataKey="hotHighlight" 
                            fill="#ef4444" 
                            stroke="#ffffff"
                            strokeWidth={2}
                            name="Warmste dagen"
                            shape="circle"
                            isAnimationActive={false}
                            onClick={(p) => {
                                if (p && p.date) onPointClick(p.date);
                            }}
                            cursor="pointer"
                            size={250}
                        />
                        <Scatter 
                            dataKey="coldHighlight" 
                            fill="#3b82f6" 
                            stroke="#ffffff"
                            strokeWidth={2}
                            name="Koudste nachten"
                            shape="circle"
                            isAnimationActive={false}
                            onClick={(p) => {
                                if (p && p.date) onPointClick(p.date);
                            }}
                            cursor="pointer"
                            size={250}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <p className="text-xs text-text-muted mt-2">
                Klik op de <span className="text-red-500 font-bold">rode</span> of <span className="text-blue-500 font-bold">blauwe</span> stippen om naar de historie van die dag te gaan.
            </p>
        </div>
    );
};

