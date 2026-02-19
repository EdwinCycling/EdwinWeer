import React from 'react';
import { MonthlyAverage, detectRainSeason } from '../services/climateService';
import { Icon } from './Icon';
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, Tooltip } from 'recharts';
import { useAuth } from '../hooks/useAuth';
import { getTranslation } from '../services/translations';

interface RainSeasonProps {
    monthlyData: MonthlyAverage[];
    selectedYear?: number;
}

export const RainSeasonCard: React.FC<RainSeasonProps> = ({ monthlyData, selectedYear }) => {
    const { settings } = useAuth();
    const t = (key: string, params?: Record<string, string | number>) => getTranslation(key, settings.language, params);
    
    // Check if selected year is current year
    const isCurrentYear = selectedYear === new Date().getFullYear();

    if (isCurrentYear) {
        return (
            <div className="bg-bg-card rounded-2xl p-6 border border-border-color h-full flex flex-col justify-between relative overflow-hidden">
                 <div className="relative z-10">
                    <h3 className="text-xl font-bold flex items-center gap-2 mb-2 text-text-main">
                        <Icon name="water_drop" className="text-blue-500" />
                        {t('rain_season.title')}
                    </h3>
                </div>
                <div className="flex flex-col items-center justify-center flex-grow text-center opacity-60">
                     <Icon name="calendar_month" className="text-4xl text-text-muted mb-2" />
                     <p className="text-sm text-text-muted">{t('rain_season.not_available_current_year')}</p>
                </div>
            </div>
        );
    }

    const season = detectRainSeason(monthlyData);
    
    // Format months string localized
    const getMonthName = (monthIndex: number) => {
        const date = new Date(2000, monthIndex, 1);
        return date.toLocaleString(settings.language, { month: 'long' });
    };

    let monthsStr = '';
    if (season.hasSeason) {
        if (season.startMonth === season.endMonth) {
            monthsStr = getMonthName(season.startMonth);
        } else {
            monthsStr = `${getMonthName(season.startMonth)} - ${getMonthName(season.endMonth)}`;
        }
    }

    // Determine max rain for scaling
    const maxRain = Math.max(...monthlyData.map(m => m.totalRain));

    // Prepare data for chart
    const chartData = Array.from({ length: 12 }, (_, i) => {
        const found = monthlyData.find(m => m.month === i);
        const rain = found ? found.totalRain : 0;
        return {
            month: i,
            name: new Date(2000, i, 1).toLocaleString(settings.language, { month: 'short' }),
            rain: rain,
            // Normalize for visual consistency (highest bar is always 100% of height)
            rainHeight: maxRain > 0 ? (rain / maxRain) * 100 : 0
        };
    });

    // Determine highlight color logic
    const isSeasonMonth = (monthIndex: number) => {
        if (!season.hasSeason) return false;
        const start = season.startMonth;
        const end = season.endMonth;
        
        // Normal case: start <= end (e.g., 2 to 4)
        if (start <= end) {
            return monthIndex >= start && monthIndex <= end;
        } 
        // Wrapping case: start > end (e.g., 10 to 0 for Nov-Jan)
        else {
            return monthIndex >= start || monthIndex <= end;
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl p-6 border border-border-color h-full flex flex-col justify-between relative overflow-hidden">
            <div className="relative z-10">
                <h3 className="text-xl font-bold flex items-center gap-2 mb-2 text-text-main">
                    <Icon name="water_drop" className="text-blue-500" />
                    {t('rain_season.title')}
                </h3>
            </div>

            <div className="relative z-10 flex flex-col gap-4 flex-grow">
                {season.hasSeason ? (
                    <div className="mt-2">
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {t('rain_season.detected', { months: monthsStr })}
                        </p>
                        <p className="text-sm text-text-muted mt-1">
                            <span className="font-bold">{season.percentage.toFixed(0)}%</span> {t('rain_season.percentage_text').replace('{percentage}% ', '')}
                        </p>
                        <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {t(season.intensity)}
                        </div>
                    </div>
                ) : (
                    <div className="mt-2 flex flex-col items-center text-center py-4">
                        <Icon name="stacked_line_chart" className="text-4xl text-text-muted mb-2 opacity-50" />
                        <p className="text-base font-medium text-text-main">{t('rain_season.none_title')}</p>
                        <p className="text-sm text-text-muted">{t('rain_season.none_text')}</p>
                    </div>
                )}

                <div className="h-32 w-full mt-auto">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <Bar dataKey="rainHeight" radius={[4, 4, 0, 0]}>
                                {chartData.map((entry, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={isSeasonMonth(index) ? '#3b82f6' : '#e5e7eb'} // blue-500 vs gray-200
                                        className={isSeasonMonth(index) ? 'fill-blue-500 dark:fill-blue-500' : 'fill-gray-200 dark:fill-gray-700'}
                                    />
                                ))}
                            </Bar>
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} 
                                interval={0}
                            />
                            <Tooltip 
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                labelStyle={{ color: '#6b7280' }}
                                // Show original rain value, not the normalized height
                                formatter={(value: number, name: string, props: any) => [Math.round(props.payload.rain), t('rain_season.tooltip_rain')]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
