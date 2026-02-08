import React, { useMemo, useState } from 'react';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AppSettings } from '../types';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';

interface DailyData {
    date: string;
    rain: number | null;
}

interface Props {
    data: DailyData[];
    settings: AppSettings;
}

interface MonthlyRain {
    month: string;
    monthIndex: number;
    totalRain: number;
    relativeRain: number;
}

export const MonthlyRainChart: React.FC<Props> = ({ data, settings }) => {
    const t = (key: string) => getTranslation(key, settings.language);
    const [mode, setMode] = useState<'absolute' | 'relative'>('absolute');

    const processedData = useMemo(() => {
        const months: Record<number, number> = {};
        
        // Initialize months
        for (let i = 0; i < 12; i++) {
            months[i] = 0;
        }

        data.forEach(d => {
            if (!d.date) return;
            const date = new Date(d.date);
            const m = date.getMonth();
            const val = d.rain;
            
            if (val !== null && val !== undefined && !isNaN(val)) {
                months[m] += val;
            }
        });

        // Find max rain for relative calculation
        const maxVal = Math.max(...Object.values(months), 0.1);

        const stats: MonthlyRain[] = [];
        const monthNames = settings.language === 'nl' 
            ? ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
            : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let i = 0; i < 12; i++) {
            stats.push({
                month: monthNames[i],
                monthIndex: i,
                totalRain: months[i],
                relativeRain: (months[i] / maxVal) * 100
            });
        }

        return stats;
    }, [data, settings.language]);

    // Determine max value for domain
    const maxRain = useMemo(() => {
        return Math.max(...processedData.map(d => d.totalRain), 10); // Minimum 10mm scale
    }, [processedData]);
    
    // Nice domain rounding
    const domainMax = Math.ceil(maxRain / 10) * 10;

    return (
        <div className="w-full bg-bg-card rounded-2xl p-6 border border-border-color">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
                    <Icon name="water_drop" className="text-blue-500" />
                    {t('records.monthly_rain_title') || 'Neerslag per maand'}
                </h3>
                <div className="flex bg-bg-page rounded-lg p-1 border border-border-color">
                    <button 
                        onClick={() => setMode('absolute')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${mode === 'absolute' ? 'bg-bg-card shadow-sm text-text-main' : 'text-text-muted hover:text-text-main'}`}
                    >
                        {t('records.mode_absolute') || 'Hoeveelheid'}
                    </button>
                    <button 
                        onClick={() => setMode('relative')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${mode === 'relative' ? 'bg-bg-card shadow-sm text-text-main' : 'text-text-muted hover:text-text-main'}`}
                    >
                        {t('records.mode_relative') || 'Relatief'}
                    </button>
                </div>
            </div>

            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={processedData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.2)" />
                        
                        <XAxis 
                            dataKey="month" 
                            stroke="var(--text-muted)" 
                            tick={{ fontSize: 12 }} 
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                        />
                        <YAxis 
                            domain={mode === 'absolute' ? [0, domainMax] : [0, 100]} 
                            stroke="var(--text-muted)" 
                            tick={{ fontSize: 10 }} 
                            axisLine={false}
                            tickLine={false}
                            width={40}
                            unit={mode === 'absolute' ? settings.precipUnit : '%'}
                            tickCount={mode === 'relative' ? 11 : undefined} // 0, 10, ..., 100
                        />
                        
                        {mode === 'relative' && [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(tick => (
                             <ReferenceLine key={tick} y={tick} stroke="rgba(128,128,128,0.1)" />
                        ))}

                        <Tooltip 
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const d = payload[0].payload as MonthlyRain;
                                    return (
                                        <div className="bg-bg-card border border-border-color p-3 rounded-xl shadow-xl text-xs">
                                            <p className="font-bold text-sm mb-2 text-text-main">{d.month}</p>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-text-muted">{t('records.total_rain') || 'Neerslag'}:</span>
                                                    <span className="font-mono font-bold text-blue-500">{d.totalRain.toFixed(1)} {settings.precipUnit}</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-text-muted">{t('records.mode_relative') || 'Relatief'}:</span>
                                                    <span className="font-mono font-bold text-blue-400">{d.relativeRain.toFixed(0)}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />

                        <Bar 
                            dataKey={mode === 'absolute' ? 'totalRain' : 'relativeRain'} 
                            fill="#3b82f6" 
                            radius={[4, 4, 0, 0]}
                            name={t('precipitation')}
                            isAnimationActive={false}
                        />

                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
