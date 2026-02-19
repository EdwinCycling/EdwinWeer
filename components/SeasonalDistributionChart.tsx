import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Label } from 'recharts';
import { AppSettings } from '../types';
import { getTranslation } from '../services/translations';

interface Props {
  data: {
    dates: string[];
    maxTemps: (number | null)[];
    minTemps: (number | null)[];
  };
  settings: AppSettings;
  lat: number;
}

export const SeasonalDistributionChart: React.FC<Props> = ({ data, settings, lat }) => {
    const t = (key: string) => getTranslation(key, settings.language);

    const { chartData, seasonStats, ranges } = useMemo(() => {
        const SEASONS = ['Winter', 'Lente', 'Zomer', 'Herfst'];
        const SEASON_LABELS: Record<string, string> = {
            'Winter': t('season.winter'),
            'Lente': t('season.spring'),
            'Zomer': t('season.summer'),
            'Herfst': t('season.autumn')
        };

        const RANGES = [
            { key: 'freezing', label: t('season.range_freezing'), min: -Infinity, max: 0, color: '#0000FF' },
            { key: 'cold', label: t('season.range_cold'), min: 0, max: 10, color: '#90EE90' },
            { key: 'moderate', label: t('season.range_moderate'), min: 10, max: 20, color: '#FFA500' },
            { key: 'warm', label: t('season.range_warm'), min: 20, max: 30, color: '#FF4500' },
            { key: 'hot', label: t('season.range_hot'), min: 30, max: Infinity, color: '#FF0000' },
        ];

        // Initialize structure
        const seasonData = {
            'Winter': { name: SEASON_LABELS['Winter'], key: 'Winter', freezing: 0, cold: 0, moderate: 0, warm: 0, hot: 0, maxSum: 0, minSum: 0, count: 0 },
            'Lente': { name: SEASON_LABELS['Lente'], key: 'Lente', freezing: 0, cold: 0, moderate: 0, warm: 0, hot: 0, maxSum: 0, minSum: 0, count: 0 },
            'Zomer': { name: SEASON_LABELS['Zomer'], key: 'Zomer', freezing: 0, cold: 0, moderate: 0, warm: 0, hot: 0, maxSum: 0, minSum: 0, count: 0 },
            'Herfst': { name: SEASON_LABELS['Herfst'], key: 'Herfst', freezing: 0, cold: 0, moderate: 0, warm: 0, hot: 0, maxSum: 0, minSum: 0, count: 0 },
        };

        const isSouth = lat < 0;

        data.maxTemps.forEach((temp, i) => {
            if (temp === null || temp === undefined) return;
            const date = new Date(data.dates[i]);
            const month = date.getMonth(); // 0-11

            let season = '';
            if (month === 11 || month === 0 || month === 1) season = isSouth ? 'Zomer' : 'Winter';
            else if (month >= 2 && month <= 4) season = isSouth ? 'Herfst' : 'Lente';
            else if (month >= 5 && month <= 7) season = isSouth ? 'Winter' : 'Zomer';
            else if (month >= 8 && month <= 10) season = isSouth ? 'Lente' : 'Herfst';

            if (season && seasonData[season as keyof typeof seasonData]) {
                const s = seasonData[season as keyof typeof seasonData];
                
                if (temp < 0) s.freezing++;
                else if (temp < 10) s.cold++;
                else if (temp < 20) s.moderate++;
                else if (temp < 30) s.warm++;
                else s.hot++;

                s.count++;
                s.maxSum += temp;
                if (data.minTemps && data.minTemps[i] !== null && data.minTemps[i] !== undefined) {
                    s.minSum += data.minTemps[i]!;
                }
            }
        });

        // Convert to array in correct order (Standard order: Winter, Spring, Summer, Autumn)
        // Or maybe adapt order based on hemisphere? Usually charts follow calendar order.
        // Let's keep it standard.
        const finalData = SEASONS.map(s => seasonData[s as keyof typeof seasonData]);
        
        // Calculate stats
        const stats = SEASONS.map(s => {
            const d = seasonData[s as keyof typeof seasonData];
            return {
                name: d.name,
                avgMax: d.count > 0 ? d.maxSum / d.count : null,
                avgMin: d.count > 0 ? d.minSum / d.count : null
            };
        });

        return { chartData: finalData, seasonStats: stats, ranges: RANGES };
    }, [data, lat, settings.language]);

    return (
        <div className="w-full flex flex-col items-center bg-bg-card rounded-2xl p-4 border border-border-color">
            <h3 className="text-lg font-bold text-text-main mb-4">{t('season.distribution')}</h3>
            <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={chartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                        <XAxis 
                            dataKey="name" 
                            stroke="var(--text-muted)" 
                            tick={{ fill: 'var(--text-muted)' }}
                            axisLine={{ stroke: 'var(--border-color)' }}
                            tickLine={{ stroke: 'var(--border-color)' }}
                            interval={0}
                        />
                        <YAxis 
                            stroke="var(--text-muted)" 
                            tick={{ fill: 'var(--text-muted)' }}
                            axisLine={{ stroke: 'var(--border-color)' }}
                            tickLine={{ stroke: 'var(--border-color)' }}
                        >
                             <Label value={t('season.days')} angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: 'var(--text-muted)', fontSize: 12 }} />
                        </YAxis>
                        <Tooltip
                            contentStyle={{ 
                                backgroundColor: 'var(--bg-card)', 
                                borderRadius: '12px', 
                                border: '1px solid var(--border-color)', 
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                color: 'var(--text-main)'
                            }}
                            cursor={{ fill: 'var(--bg-secondary)', opacity: 0.4 }}
                        />
                        <Legend 
                            wrapperStyle={{ paddingTop: '20px', fontSize: '14px' }} 
                            // @ts-ignore
                            payload={ranges.map(range => ({
                                value: range.label,
                                type: 'rect',
                                id: range.key,
                                color: range.color
                            })) as any}
                        />
                        
                        {ranges.map((range) => (
                            <Bar 
                                key={range.key} 
                                dataKey={range.key} 
                                name={range.label} 
                                fill={range.color} 
                                radius={[4, 4, 0, 0]} 
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
            
            {/* Average Stats */}
            <div className="w-full grid grid-cols-4 gap-2 mt-6 pt-4 border-t border-border-color">
                {seasonStats.map(stat => (
                    <div key={stat.name} className="flex flex-col items-center text-center">
                        <span className="text-xs font-bold text-text-muted mb-1">{stat.name}</span>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-red-500 font-medium">
                                Max: {stat.avgMax !== null ? stat.avgMax.toFixed(1) : '-'}°
                            </span>
                            <span className="text-[10px] text-blue-500 font-medium">
                                Min: {stat.avgMin !== null ? stat.avgMin.toFixed(1) : '-'}°
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
