import React, { useState, useMemo } from 'react';
import { AppSettings } from '../types';
import { calculateComfortScore } from '../services/weatherService';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { getTranslation } from '../services/translations';
import { useThemeColors } from '../hooks/useThemeColors';
import { Icon } from './Icon';

interface Props {
    dailyData?: any; // OpenMeteo daily object
    dailyDataList?: any[]; // Array of DailyData objects from RecordsWeatherView
    settings: AppSettings;
}

type Operator = 'eq' | 'lte' | 'gte';

export const BaroYearOverview: React.FC<Props> = ({ dailyData, dailyDataList, settings }) => {
    const t = (key: string) => getTranslation(key, settings.language);
    const isNL = settings.language === 'nl';
    const colors = useThemeColors();

    // State for the interactive 4th chart
    const [selectedScore, setSelectedScore] = useState<number>(10);
    const [operator, setOperator] = useState<Operator>('eq');

    // 1. Process Data & Calculate Scores
    const processedData = useMemo(() => {
        const results = [];

        // Option A: Process array format (from RecordsWeatherView)
        if (dailyDataList && dailyDataList.length > 0) {
            for (const d of dailyDataList) {
                if (!d.date) continue;
                const date = new Date(d.date);
                const monthIndex = date.getMonth();
                
                const input = {
                    temperature_2m: d.maxTemp !== null ? d.maxTemp : 15, // Fallback
                    wind_speed_10m: d.maxWindSpeed !== null ? d.maxWindSpeed : (d.windSpeed || 0),
                    relative_humidity_2m: 60, // Default
                    precipitation_sum: d.rain || 0,
                    cloud_cover: d.cloudCover !== null ? d.cloudCover : 50,
                    precipitation_probability: 0,
                    weather_code: 0,
                    wind_gusts_10m: d.windGust || 0,
                    uv_index: 0
                };
                
                const comfort = calculateComfortScore(input);
                results.push({
                    date: d.date,
                    monthIndex,
                    monthName: date.toLocaleDateString(isNL ? 'nl-NL' : 'en-GB', { month: 'short' }),
                    score: comfort.score
                });
            }
            return results;
        }

        // Option B: Process OpenMeteo object format (from HistoricalDashboard)
        if (!dailyData || !dailyData.time) return [];

        const time = dailyData.time;
        const len = time.length;

        for (let i = 0; i < len; i++) {
            const date = new Date(time[i]);
            const monthIndex = date.getMonth(); // 0-11
            
            // Map daily data to comfort score input
            // We use defaults for missing values to avoid extra API calls
            const input = {
                temperature_2m: dailyData.temperature_2m_max[i],
                wind_speed_10m: dailyData.wind_speed_10m_max?.[i] || 0,
                relative_humidity_2m: 60, // Default estimate
                precipitation_sum: dailyData.precipitation_sum?.[i] || 0,
                cloud_cover: dailyData.cloud_cover_mean?.[i] || 50,
                precipitation_probability: dailyData.precipitation_probability_max?.[i] || 0,
                weather_code: dailyData.weather_code?.[i] || 0,
                wind_gusts_10m: dailyData.wind_gusts_10m_max?.[i] || 0,
                uv_index: dailyData.uv_index_max?.[i] || 0
            };

            const comfort = calculateComfortScore(input);
            results.push({
                date: time[i],
                monthIndex,
                monthName: date.toLocaleDateString(isNL ? 'nl-NL' : 'en-GB', { month: 'short' }),
                score: comfort.score
            });
        }
        return results;
    }, [dailyData, dailyDataList, settings.language]);

    // 2. Aggregations

    // Chart 1: Distribution of Scores (1-10)
    const scoreDistribution = useMemo(() => {
        const counts = Array(10).fill(0);
        processedData.forEach(d => {
            if (d.score >= 1 && d.score <= 10) {
                counts[d.score - 1]++;
            }
        });

        // Find max for scaling (100%)
        const maxCount = Math.max(...counts);

        return counts.map((count, idx) => ({
            score: idx + 1,
            count,
            percentage: maxCount > 0 ? (count / maxCount) * 100 : 0
        }));
    }, [processedData]);

    // Chart 2 & 3: Top Months logic
    const topMonths = useMemo(() => {
        // Count scores per month
        const monthStats = Array(12).fill(0).map((_, idx) => ({
            monthIndex: idx,
            monthName: new Date(2000, idx, 1).toLocaleDateString(isNL ? 'nl-NL' : 'en-GB', { month: 'long' }),
            score10Count: 0, // High scores (9-10)
            score1Count: 0,  // Low scores (1-2)
            totalDays: 0
        }));

        processedData.forEach(d => {
            if (d.monthIndex >= 0 && d.monthIndex < 12) {
                monthStats[d.monthIndex].totalDays++;
                if (d.score >= 9) monthStats[d.monthIndex].score10Count++;
                if (d.score <= 2) monthStats[d.monthIndex].score1Count++;
            }
        });

        // Sort for Top 3 High Scores
        const topHigh = [...monthStats]
            .sort((a, b) => b.score10Count - a.score10Count)
            .slice(0, 3)
            .filter(m => m.score10Count > 0);

        // Sort for Top 3 Low Scores
        const topLow = [...monthStats]
            .sort((a, b) => b.score1Count - a.score1Count)
            .slice(0, 3)
            .filter(m => m.score1Count > 0);

        return { topHigh, topLow };
    }, [processedData, isNL]);

    // Chart 4: Monthly Distribution with Filters
    const monthlyFiltered = useMemo(() => {
        const data = Array(12).fill(0).map((_, idx) => ({
            monthIndex: idx,
            monthName: new Date(2000, idx, 1).toLocaleDateString(isNL ? 'nl-NL' : 'en-GB', { month: 'short' }),
            count: 0
        }));

        processedData.forEach(d => {
            let match = false;
            if (operator === 'eq') match = d.score === selectedScore;
            else if (operator === 'lte') match = d.score <= selectedScore;
            else if (operator === 'gte') match = d.score >= selectedScore;

            if (match && d.monthIndex >= 0 && d.monthIndex < 12) {
                data[d.monthIndex].count++;
            }
        });

        return data;
    }, [processedData, selectedScore, operator, isNL]);

    if (processedData.length === 0) return null;

    // Helper for color scale
    const getScoreColor = (score: number) => {
        if (score >= 8) return '#22c55e'; // Green-500
        if (score >= 6) return '#f59e0b'; // Amber-500
        if (score >= 4) return '#f97316'; // Orange-500
        return '#ef4444'; // Red-500
    };

    return (
        <div className="w-full space-y-8 mt-8 animate-in fade-in duration-500">
            <h3 className="text-xl font-bold text-text-main flex items-center gap-2">
                <Icon name="bar_chart" className="text-primary" />
                Baro Jaaroverzicht
            </h3>

            {/* 1. Baro Score Distribution (1-10) */}
            <div className="bg-bg-card rounded-2xl p-6 border border-border-color shadow-sm">
                <h4 className="text-sm font-bold text-text-muted uppercase mb-4">Verdeling Baro Scores</h4>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={scoreDistribution} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                            <XAxis 
                                dataKey="score" 
                                tick={{ fill: colors.textMuted }} 
                                tickLine={false} 
                                axisLine={false}
                            />
                            <Tooltip 
                                cursor={{ fill: colors.borderColor + '40' }}
                                contentStyle={{ backgroundColor: colors.bgCard, borderRadius: '12px', border: `1px solid ${colors.borderColor}` }}
                                labelStyle={{ color: colors.textMuted }}
                                formatter={(value: number) => [`${value} dagen`, 'Aantal']}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {scoreDistribution.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                                ))}
                                <LabelList dataKey="count" position="top" fill={colors.textMuted} fontSize={12} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2 & 3. Top Months (Best & Worst) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Best Months */}
                <div className="bg-bg-card rounded-2xl p-6 border border-border-color shadow-sm">
                    <h4 className="text-sm font-bold text-green-500 uppercase mb-4 flex items-center gap-2">
                        <Icon name="verified" /> Top Maanden (Score 9-10)
                    </h4>
                    {topMonths.topHigh.length > 0 ? (
                        <div className="space-y-4">
                            {topMonths.topHigh.map((m, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <span className="font-bold text-text-main">{i+1}. {m.monthName}</span>
                                    <span className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-bold">
                                        {m.score10Count} dagen
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-text-muted text-sm italic">Geen topdagen gevonden.</p>
                    )}
                </div>

                {/* Worst Months */}
                <div className="bg-bg-card rounded-2xl p-6 border border-border-color shadow-sm">
                    <h4 className="text-sm font-bold text-red-500 uppercase mb-4 flex items-center gap-2">
                        <Icon name="warning" /> Slechtste Maanden (Score 1-2)
                    </h4>
                    {topMonths.topLow.length > 0 ? (
                        <div className="space-y-4">
                            {topMonths.topLow.map((m, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <span className="font-bold text-text-main">{i+1}. {m.monthName}</span>
                                    <span className="px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-xs font-bold">
                                        {m.score1Count} dagen
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-text-muted text-sm italic">Geen slechte dagen gevonden.</p>
                    )}
                </div>
            </div>

            {/* 4. Interactive Monthly Chart */}
            <div className="bg-bg-card rounded-2xl p-6 border border-border-color shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                    <h4 className="text-sm font-bold text-text-muted uppercase">Maandelijkse Analyse</h4>
                    
                    {/* Filters */}
                    <div className="flex items-center gap-2 bg-bg-page p-1 rounded-xl border border-border-color">
                        <select 
                            value={operator}
                            onChange={(e) => setOperator(e.target.value as Operator)}
                            className="bg-transparent text-sm font-bold text-text-main outline-none px-2 py-1"
                        >
                            <option value="eq">Precies</option>
                            <option value="lte">t/m (≤)</option>
                            <option value="gte">Vanaf (≥)</option>
                        </select>
                        <div className="w-[1px] h-4 bg-border-color mx-1"></div>
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-text-muted">Score:</span>
                            <select 
                                value={selectedScore}
                                onChange={(e) => setSelectedScore(Number(e.target.value))}
                                className="bg-transparent text-sm font-bold text-text-main outline-none px-2 py-1"
                            >
                                {Array.from({length: 10}, (_, i) => i + 1).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyFiltered} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <XAxis 
                                dataKey="monthName" 
                                tick={{ fill: colors.textMuted, fontSize: 11 }} 
                                tickLine={false} 
                                axisLine={false}
                                interval={0}
                            />
                            <Tooltip 
                                cursor={{ fill: colors.borderColor + '40' }}
                                contentStyle={{ backgroundColor: colors.bgCard, borderRadius: '12px', border: `1px solid ${colors.borderColor}` }}
                                labelStyle={{ color: colors.textMuted }}
                                formatter={(value: number) => [`${value} dagen`, 'Aantal']}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={colors.accentPrimary}>
                                {monthlyFiltered.map((entry, index) => (
                                     <Cell key={`cell-${index}`} fill={getScoreColor(selectedScore)} opacity={0.8} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
