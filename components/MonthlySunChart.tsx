import React, { useMemo, useState } from 'react';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AppSettings } from '../types';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';

interface DailyData {
    date: string;
    sun: number | null;
    sunHours: number | null;
    daylightHours: number | null;
}

interface Props {
    data: DailyData[];
    settings: AppSettings;
}

interface MonthlySun {
    month: string;
    monthIndex: number;
    totalSunHours: number;
    totalDaylightHours: number;
    relativeToMax: number;   // 0-100 based on sunniest month
    percentOfPossible: number; // 0-100 based on daylight
}

export const MonthlySunChart: React.FC<Props> = ({ data, settings }) => {
    const t = (key: string) => getTranslation(key, settings.language);
    const [mode, setMode] = useState<'relative_max' | 'percent_possible'>('relative_max');

    const processedData = useMemo(() => {
        const months: Record<number, { sun: number, daylight: number }> = {};
        
        // Initialize months
        for (let i = 0; i < 12; i++) {
            months[i] = { sun: 0, daylight: 0 };
        }

        data.forEach(d => {
            if (!d.date) return;
            const date = new Date(d.date);
            const m = date.getMonth();
            
            if (d.sunHours !== null && d.sunHours !== undefined && !isNaN(d.sunHours)) {
                months[m].sun += d.sunHours;
            }
            if (d.daylightHours !== null && d.daylightHours !== undefined && !isNaN(d.daylightHours)) {
                months[m].daylight += d.daylightHours;
            }
        });

        // Find max sun hours for relative calculation
        const maxSunHours = Math.max(...Object.values(months).map(m => m.sun), 0.1);

        const stats: MonthlySun[] = [];
        const monthNames = settings.language === 'nl' 
            ? ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
            : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let i = 0; i < 12; i++) {
            const mData = months[i];
            const percentOfPossible = mData.daylight > 0 ? (mData.sun / mData.daylight) * 100 : 0;
            
            stats.push({
                month: monthNames[i],
                monthIndex: i,
                totalSunHours: mData.sun,
                totalDaylightHours: mData.daylight,
                relativeToMax: (mData.sun / maxSunHours) * 100,
                percentOfPossible: Math.min(100, percentOfPossible)
            });
        }

        return stats;
    }, [data, settings.language]);

    return (
        <div className="w-full bg-bg-card rounded-2xl p-6 border border-border-color">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
                    <Icon name="sunny" className="text-orange-500" />
                    {t('records.monthly_sun_title') || 'Zonuren per maand'}
                </h3>
                <div className="flex bg-bg-page rounded-lg p-1 border border-border-color">
                    <button 
                        onClick={() => setMode('relative_max')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${mode === 'relative_max' ? 'bg-bg-card shadow-sm text-text-main' : 'text-text-muted hover:text-text-main'}`}
                    >
                        {t('records.mode_relative') || 'Relatief'}
                    </button>
                    <button 
                        onClick={() => setMode('percent_possible')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${mode === 'percent_possible' ? 'bg-bg-card shadow-sm text-text-main' : 'text-text-muted hover:text-text-main'}`}
                    >
                        {t('records.mode_percent') || 'Percentage'}
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
                            domain={[0, 100]} 
                            stroke="var(--text-muted)" 
                            tick={{ fontSize: 10 }} 
                            axisLine={false}
                            tickLine={false}
                            width={40}
                            unit="%"
                            tickCount={11}
                        />
                        
                        {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(tick => (
                             <ReferenceLine key={tick} y={tick} stroke="rgba(128,128,128,0.1)" />
                        ))}

                        <Tooltip 
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const d = payload[0].payload as MonthlySun;
                                    return (
                                        <div className="bg-bg-card border border-border-color p-3 rounded-xl shadow-xl text-xs">
                                            <p className="font-bold text-sm mb-2 text-text-main">{d.month}</p>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-text-muted">{t('records.sun_hours') || 'Zonuren'}:</span>
                                                    <span className="font-mono font-bold text-orange-500">{d.totalSunHours.toFixed(1)}u</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-text-muted">{t('records.mode_relative') || 'Relatief'}:</span>
                                                    <span className="font-mono font-bold text-orange-400">{d.relativeToMax.toFixed(0)}%</span>
                                                </div>
                                                <div className="flex justify-between gap-4">
                                                    <span className="text-text-muted">{t('records.mode_percent') || 'Mogelijk'}:</span>
                                                    <span className="font-mono font-bold text-yellow-500">{d.percentOfPossible.toFixed(0)}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />

                        <Bar 
                            dataKey={mode === 'relative_max' ? 'relativeToMax' : 'percentOfPossible'} 
                            fill="#f97316" 
                            radius={[4, 4, 0, 0]}
                            name={t('sunshine')}
                            isAnimationActive={false}
                        />

                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
