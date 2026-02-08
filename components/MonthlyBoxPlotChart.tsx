import React, { useMemo, useState } from 'react';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { AppSettings } from '../types';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';

interface DailyData {
    date: string;
    maxTemp: number | null;
    minTemp: number | null;
}

interface Props {
    data: DailyData[];
    settings: AppSettings;
}

interface MonthlyStats {
    month: string;
    monthIndex: number;
    min: number;
    max: number;
    mean: number;
    p15: number;
    p85: number;
    count: number;
}

export const MonthlyBoxPlotChart: React.FC<Props> = ({ data, settings }) => {
    const [mode, setMode] = useState<'max' | 'min'>('max');
    const t = (key: string) => getTranslation(key, settings.language);

    const processedData = useMemo(() => {
        const months: Record<number, number[]> = {};
        
        // Initialize months
        for (let i = 0; i < 12; i++) {
            months[i] = [];
        }

        data.forEach(d => {
            if (!d.date) return;
            const date = new Date(d.date);
            const m = date.getMonth();
            const val = mode === 'max' ? d.maxTemp : d.minTemp;
            
            if (val !== null && val !== undefined && !isNaN(val)) {
                months[m].push(val);
            }
        });

        const stats: MonthlyStats[] = [];
        const monthNames = settings.language === 'nl' 
            ? ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
            : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let i = 0; i < 12; i++) {
            const values = months[i].sort((a, b) => a - b);
            if (values.length === 0) {
                stats.push({
                    month: monthNames[i],
                    monthIndex: i,
                    min: 0, max: 0, mean: 0, p15: 0, p85: 0, count: 0
                });
                continue;
            }

            const min = values[0];
            const max = values[values.length - 1];
            const sum = values.reduce((a, b) => a + b, 0);
            const mean = sum / values.length;
            
            const quantile = (arr: number[], q: number) => {
                const pos = (arr.length - 1) * q;
                const base = Math.floor(pos);
                const rest = pos - base;
                if (arr[base + 1] !== undefined) {
                    return arr[base] + rest * (arr[base + 1] - arr[base]);
                } else {
                    return arr[base];
                }
            };

            stats.push({
                month: monthNames[i],
                monthIndex: i,
                min,
                max,
                mean,
                p15: quantile(values, 0.15),
                p85: quantile(values, 0.85),
                count: values.length
            });
        }

        return stats;
    }, [data, mode, settings.language]);

    // Calculate domain for Y-axis (multiples of 5)
    const domain = useMemo(() => {
        let min = Infinity;
        let max = -Infinity;
        
        processedData.forEach(d => {
            if (d.count > 0) {
                if (d.min < min) min = d.min;
                if (d.max > max) max = d.max;
            }
        });

        if (min === Infinity) return [0, 30];

        // Round to nearest 5
        const niceMin = Math.floor(min / 5) * 5 - 5;
        const niceMax = Math.ceil(max / 5) * 5 + 5;
        
        return [niceMin, niceMax];
    }, [processedData]);

    const ticks = useMemo(() => {
        const [min, max] = domain;
        const result = [];
        for (let i = min; i <= max; i += 5) {
            result.push(i);
        }
        return result;
    }, [domain]);

    const CustomShape = (props: any) => {
        const { x, y, width, height, payload } = props;
        const { min, max, mean, p15, p85, count } = payload;
        
        if (count === 0) return null;

        const scaleY = (val: number) => {
            const { yAxis } = props;
            if (yAxis && yAxis.scale) {
                return yAxis.scale(val);
            }
            const bg = props.background as { y?: number; height?: number } | undefined;
            const chartY = typeof bg?.y === 'number' ? bg.y : 0;
            const chartHeight = typeof bg?.height === 'number' ? bg.height : 0;
            const [minDomain, maxDomain] = domain;
            if (maxDomain === minDomain || chartHeight === 0) return chartY;
            const ratio = (val - minDomain) / (maxDomain - minDomain);
            return chartY + chartHeight - ratio * chartHeight;
        };

        const yMin = scaleY(min);
        const yMax = scaleY(max);
        const yMean = scaleY(mean);
        const yP15 = scaleY(p15);
        const yP85 = scaleY(p85);
        
        const center = x + width / 2;
        const boxWidth = width * 0.6;
        
        // Colors
        const boxColor = mode === 'max' ? '#ef4444' : '#3b82f6';
        const boxStroke = mode === 'max' ? '#b91c1c' : '#1d4ed8';
        const lineColor = "var(--text-main)";

        return (
            <g>
                {/* Range Line (Whisker) - Min to Max */}
                <line x1={center} y1={yMin} x2={center} y2={yMax} stroke={lineColor} strokeWidth={1} opacity={0.5} />
                
                {/* Caps */}
                <line x1={center - boxWidth/4} y1={yMin} x2={center + boxWidth/4} y2={yMin} stroke={lineColor} strokeWidth={1} opacity={0.5} />
                <line x1={center - boxWidth/4} y1={yMax} x2={center + boxWidth/4} y2={yMax} stroke={lineColor} strokeWidth={1} opacity={0.5} />

                {/* Box (70% range - P15 to P85) */}
                <rect 
                    x={center - boxWidth/2} 
                    y={yP85} 
                    width={boxWidth} 
                    height={Math.max(1, Math.abs(yP15 - yP85))} 
                    fill={boxColor} 
                    opacity={0.8}
                    stroke={boxStroke}
                    strokeWidth={1}
                    rx={2}
                />

                {/* Mean Dot */}
                <circle cx={center} cy={yMean} r={3} fill="var(--text-main)" stroke="var(--bg-card)" strokeWidth={1} />
            </g>
        );
    };

    return (
        <div className="w-full bg-bg-card rounded-2xl p-6 border border-border-color">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
                    <Icon name="bar_chart" className="text-accent-primary" />
                    {t('records.monthly_distribution_title') || 'Maandoverzicht'}
                </h3>
                
                <div className="flex bg-bg-page rounded-lg p-1 border border-border-color">
                    <button
                        onClick={() => setMode('max')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                            mode === 'max' 
                                ? 'bg-red-500 text-white shadow-sm' 
                                : 'text-text-muted hover:text-text-main'
                        }`}
                    >
                        {t('records.max_temp') || 'Max Temp'}
                    </button>
                    <button
                        onClick={() => setMode('min')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                            mode === 'min' 
                                ? 'bg-blue-500 text-white shadow-sm' 
                                : 'text-text-muted hover:text-text-main'
                        }`}
                    >
                        {t('records.min_temp') || 'Min Temp'}
                    </button>
                </div>
            </div>

            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={processedData} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.2)" />
                        
                        {/* 5-degree lines */}
                        {ticks.map(tick => (
                            <ReferenceLine 
                                key={tick} 
                                y={tick} 
                                stroke="rgba(128,128,128,0.1)" 
                                strokeWidth={1} 
                            />
                        ))}

                        <XAxis 
                            dataKey="month" 
                            stroke="var(--text-muted)" 
                            tick={{ fontSize: 12 }} 
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                        />
                        <YAxis 
                            domain={domain} 
                            ticks={ticks}
                            stroke="var(--text-muted)" 
                            tick={{ fontSize: 10 }} 
                            axisLine={false}
                            tickLine={false}
                            width={30}
                        />
                        
                        <Tooltip 
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const d = payload[0].payload as MonthlyStats;
                                    return (
                                        <div className="bg-bg-card border border-border-color p-3 rounded-xl shadow-xl text-xs">
                                            <p className="font-bold text-sm mb-2 text-text-main">{d.month}</p>
                                            <div className="space-y-1">
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-text-muted">{t('historical.max') || 'Hoogste'}:</span>
                                                    <span className="font-mono font-bold">{d.max.toFixed(1)}°</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-text-muted">{t('records.average') || 'Gemiddelde'}:</span>
                                                    <span className="font-mono font-bold text-black dark:text-white">{d.mean.toFixed(1)}°</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-text-muted">{t('historical.min') || 'Laagste'}:</span>
                                                    <span className="font-mono font-bold">{d.min.toFixed(1)}°</span>
                                                </div>
                                                <div className="pt-2 mt-2 border-t border-border-color/50">
                                                    <span className="text-[10px] text-text-muted block mb-1">{t('records.seventy_percent_range') || '70% Range (P15-P85)'}</span>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="font-mono text-[10px]">{d.p15.toFixed(1)}°</span>
                                                        <span className="text-text-muted">-</span>
                                                        <span className="font-mono text-[10px]">{d.p85.toFixed(1)}°</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />

                        {/* We use a Bar to drive the CustomShape. We bind it to 'max' just to have a valid Y, 
                            but the shape uses the whole payload. */}
                        <Bar 
                            dataKey="max" 
                            shape={<CustomShape />} 
                            isAnimationActive={false}
                            background={{ fill: 'transparent' }}
                        />

                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 justify-center text-xs text-text-muted">
                <div className="flex items-center gap-2">
                    <div className="w-0.5 h-4 bg-text-main/50 relative">
                        <div className="absolute top-0 -left-1 w-2 h-px bg-text-main/50"></div>
                        <div className="absolute bottom-0 -left-1 w-2 h-px bg-text-main/50"></div>
                    </div>
                    <span>{t('records.min_max_range') || 'Min/Max Range'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-sm ${mode === 'max' ? 'bg-red-500' : 'bg-blue-500'} opacity-70`}></div>
                    <span>{t('records.seventy_percent_range') || '70% Range (P15-P85)'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-black border border-white dark:bg-white dark:border-black"></div>
                    <span>{t('records.average') || 'Gemiddelde'}</span>
                </div>
            </div>
        </div>
    );
};
