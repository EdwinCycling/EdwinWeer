import React, { useMemo } from 'react';
import { AppSettings, TempUnit, PrecipUnit } from '../types';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';
import { convertTemp, convertPrecip, getBeaufort } from '../services/weatherService';

interface Props {
    data: any; // OpenMeteo daily object
    settings: AppSettings;
    variant?: 'default' | 'compact' | 'year';
    columns?: number;
    showTitle?: boolean;
    sourceType?: 'openmeteo' | 'daily_data';
    excludedCategories?: string[];
    onDayClick?: (date: Date) => void;
}

export const VisualStatsBlocks: React.FC<Props> = ({ 
    data, 
    settings, 
    variant = 'default', 
    columns = 1,
    showTitle = true,
    sourceType = 'openmeteo',
    excludedCategories = [],
    onDayClick
}) => {
    const t = (key: string) => getTranslation(key, settings.language);

    const visualStats = useMemo(() => {
        if (!data) return [];
        
        // Handle array data (OpenMeteo)
        if (sourceType === 'openmeteo') {
            if (!data.time) return [];
            // Check availability of arrays to prevent crashes
            const hasSun = !!data.sunshine_duration;
            const hasDaylight = !!data.daylight_duration;
            const hasCloud = !!data.cloud_cover_mean;
            const hasTempMax = !!data.temperature_2m_max;
            const hasTempMin = !!data.temperature_2m_min;
            const hasPrecip = !!data.precipitation_sum;
            const hasWind = !!data.wind_gusts_10m_max;
            const hasWindMax = !!data.wind_speed_10m_max;

            const categories = [
                { 
                    id: 'sunny', 
                    label: t('month_stats.visual.sunny'), 
                    icon: 'wb_sunny', 
                    color: 'bg-yellow-400', 
                    textColor: 'text-yellow-500', 
                    check: (i: number) => {
                        if (!hasSun || !hasDaylight) return false;
                        const sun = data.sunshine_duration[i] || 0;
                        const daylight = data.daylight_duration ? data.daylight_duration[i] : 0;
                        return daylight > 0 && (sun / daylight) >= 0.75;
                    }
                },
                { 
                    id: 'cloudy', 
                    label: t('month_stats.visual.cloudy'), 
                    icon: 'cloud', 
                    color: 'bg-gray-500', 
                    textColor: 'text-gray-500', 
                    check: (i: number) => hasCloud && (data.cloud_cover_mean?.[i] ?? 0) >= 75 
                },
                { 
                    id: 'hot', 
                    label: t('month_stats.visual.hot'), 
                    icon: 'thermostat', 
                    color: 'bg-red-600', 
                    textColor: 'text-red-600', 
                    check: (i: number) => {
                        if (!hasTempMax) return false;
                        const value = data.temperature_2m_max?.[i];
                        if (value === null || value === undefined) return false;
                        return convertTemp(value, settings.tempUnit) >= (settings.tempUnit === TempUnit.FAHRENHEIT ? 86 : 30);
                    }
                },
                { 
                    id: 'warm', 
                    label: t('month_stats.visual.warm'), 
                    icon: 'thermostat', 
                    color: 'bg-orange-500', 
                    textColor: 'text-orange-500', 
                    check: (i: number) => {
                        if (!hasTempMax) return false;
                        const value = data.temperature_2m_max?.[i];
                        if (value === null || value === undefined) return false;
                        return convertTemp(value, settings.tempUnit) >= (settings.tempUnit === TempUnit.FAHRENHEIT ? 77 : 25);
                    }
                },
                { 
                    id: 'cool', 
                    label: t('month_stats.visual.cool'), 
                    icon: 'ac_unit', 
                    color: 'bg-blue-300', 
                    textColor: 'text-blue-400', 
                    check: (i: number) => {
                        if (!hasTempMax) return false;
                        const value = data.temperature_2m_max?.[i];
                        if (value === null || value === undefined) return false;
                        return convertTemp(value, settings.tempUnit) < (settings.tempUnit === TempUnit.FAHRENHEIT ? 41 : 5);
                    }
                },
                { 
                    id: 'freezing', 
                    label: t('month_stats.visual.freezing'), 
                    icon: 'snowing', 
                    color: 'bg-purple-600', 
                    textColor: 'text-purple-600', 
                    check: (i: number) => {
                        if (!hasTempMax) return false;
                        const value = data.temperature_2m_max?.[i];
                        if (value === null || value === undefined) return false;
                        return convertTemp(value, settings.tempUnit) < (settings.tempUnit === TempUnit.FAHRENHEIT ? 32 : 0);
                    }
                },
                { 
                    id: 'cold_night', 
                    label: t('month_stats.visual.cold_night'), 
                    icon: 'nights_stay', 
                    color: 'bg-indigo-900', 
                    textColor: 'text-indigo-900 dark:text-indigo-400', 
                    check: (i: number) => {
                        if (!hasTempMin) return false;
                        const value = data.temperature_2m_min?.[i];
                        if (value === null || value === undefined) return false;
                        return convertTemp(value, settings.tempUnit) < (settings.tempUnit === TempUnit.FAHRENHEIT ? 32 : 0);
                    }
                },
                { 
                    id: 'warm_night', 
                    label: t('month_stats.visual.warm_night'), 
                    icon: 'bedtime', 
                    color: 'bg-pink-500', 
                    textColor: 'text-pink-500', 
                    check: (i: number) => {
                        if (!hasTempMin) return false;
                        const value = data.temperature_2m_min?.[i];
                        if (value === null || value === undefined) return false;
                        return convertTemp(value, settings.tempUnit) >= (settings.tempUnit === TempUnit.FAHRENHEIT ? 64 : 18);
                    }
                },
                { 
                    id: 'rainy', 
                    label: t('month_stats.visual.rainy'), 
                    icon: 'rainy', 
                    color: 'bg-blue-600', 
                    textColor: 'text-blue-600', 
                    check: (i: number) => {
                        if (!hasPrecip) return false;
                        const value = data.precipitation_sum?.[i];
                        if (value === null || value === undefined) return false;
                        return convertPrecip(value, settings.precipUnit) >= (settings.precipUnit === PrecipUnit.INCH ? 0.08 : 2);
                    }
                },
                { 
                    id: 'windy', 
                    label: t('month_stats.visual.windy'), 
                    icon: 'air', 
                    color: 'bg-orange-700', 
                    textColor: 'text-orange-700', 
                    check: (i: number) => {
                        // Priority: Max Wind Speed (Sustained) >= 6 Bft
                        if (hasWindMax) {
                            const val = data.wind_speed_10m_max[i];
                            return val !== null && val !== undefined && getBeaufort(val) >= 6;
                        }
                        // Fallback: Gusts >= 8 Bft (to avoid showing too many blocks)
                        if (!hasWind) return false;
                        const value = data.wind_gusts_10m_max?.[i];
                        if (value === null || value === undefined) return false;
                        return getBeaufort(value) >= 8;
                    }
                },
            ];

            return categories.filter(cat => !excludedCategories.includes(cat.id)).map(cat => {
                const days = [];
                for (let i = 0; i < data.time.length; i++) {
                    if (cat.check(i)) {
                        days.push({
                            date: data.time[i],
                            dayIndex: i + 1
                        });
                    }
                }
                return { ...cat, days };
            });
        } 
        
        // Handle DailyData[] (RecordsWeatherView)
        else if (sourceType === 'daily_data') {
            const dailyData = data as any[]; // Type assertion
            
            const categories = [
                { 
                    id: 'sunny', 
                    label: t('month_stats.visual.sunny'), 
                    icon: 'wb_sunny', 
                    color: 'bg-yellow-400', 
                    textColor: 'text-yellow-500', 
                    check: (d: any) => (d.sun ?? 0) >= 75
                },
                { 
                    id: 'cloudy', 
                    label: t('month_stats.visual.cloudy'), 
                    icon: 'cloud', 
                    color: 'bg-gray-500', 
                    textColor: 'text-gray-500', 
                    check: (d: any) => (d.cloudCover ?? 0) >= 75
                },
                { 
                    id: 'hot', 
                    label: t('month_stats.visual.hot'), 
                    icon: 'thermostat', 
                    color: 'bg-red-600', 
                    textColor: 'text-red-600', 
                    check: (d: any) => d.maxTemp !== null && d.maxTemp >= (settings.tempUnit === TempUnit.FAHRENHEIT ? 86 : 30) 
                },
                { 
                    id: 'warm', 
                    label: t('month_stats.visual.warm'), 
                    icon: 'thermostat', 
                    color: 'bg-orange-500', 
                    textColor: 'text-orange-500', 
                    check: (d: any) => d.maxTemp !== null && d.maxTemp >= (settings.tempUnit === TempUnit.FAHRENHEIT ? 77 : 25) 
                },
                { 
                    id: 'cool', 
                    label: t('month_stats.visual.cool'), 
                    icon: 'ac_unit', 
                    color: 'bg-blue-300', 
                    textColor: 'text-blue-400', 
                    check: (d: any) => d.maxTemp !== null && d.maxTemp < (settings.tempUnit === TempUnit.FAHRENHEIT ? 41 : 5) 
                },
                { 
                    id: 'freezing', 
                    label: t('month_stats.visual.freezing'), 
                    icon: 'snowing', 
                    color: 'bg-purple-600', 
                    textColor: 'text-purple-600', 
                    check: (d: any) => d.maxTemp !== null && d.maxTemp < (settings.tempUnit === TempUnit.FAHRENHEIT ? 32 : 0) 
                },
                { 
                    id: 'cold_night', 
                    label: t('month_stats.visual.cold_night'), 
                    icon: 'nights_stay', 
                    color: 'bg-indigo-900', 
                    textColor: 'text-indigo-900 dark:text-indigo-400', 
                    check: (d: any) => d.minTemp !== null && d.minTemp < (settings.tempUnit === TempUnit.FAHRENHEIT ? 32 : 0) 
                },
                { 
                    id: 'warm_night', 
                    label: t('month_stats.visual.warm_night'), 
                    icon: 'bedtime', 
                    color: 'bg-pink-500', 
                    textColor: 'text-pink-500', 
                    check: (d: any) => d.minTemp !== null && d.minTemp >= (settings.tempUnit === TempUnit.FAHRENHEIT ? 64 : 18) 
                },
                { 
                    id: 'rainy', 
                    label: t('month_stats.visual.rainy'), 
                    icon: 'rainy', 
                    color: 'bg-blue-600', 
                    textColor: 'text-blue-600', 
                    check: (d: any) => d.rain !== null && d.rain >= (settings.precipUnit === 'inch' ? 0.08 : 2) 
                },
                { 
                    id: 'windy', 
                    label: t('month_stats.visual.windy'), 
                    icon: 'air', 
                    color: 'bg-orange-700', 
                    textColor: 'text-orange-700', 
                    check: (d: any) => {
                        if (d.maxWindSpeed !== undefined && d.maxWindSpeed !== null) {
                            return getBeaufort(d.maxWindSpeed) >= 6;
                        }
                        return d.windGust !== null && getBeaufort(d.windGust) >= 8;
                    }
                },
            ];

            return categories.filter(cat => !excludedCategories.includes(cat.id)).map(cat => {
                const days = [];
                for (let i = 0; i < dailyData.length; i++) {
                    if (cat.check(dailyData[i])) {
                        days.push({
                            date: dailyData[i].date,
                            dayIndex: dailyData[i].day
                        });
                    }
                }
                return { ...cat, days };
            });
        }
        
        return [];
    }, [data, settings, sourceType, excludedCategories]);

    if (!data) return null;
    if (sourceType === 'openmeteo' && !data.time) return null;

    // Layout configuration
    // Default: Single column, bottom aligned (flex-col-reverse)
    // Grid: Grid of N columns (grid-cols-N)

    return (
        <div className="flex-grow flex items-end justify-between gap-1 md:gap-4 pb-4 min-h-[200px] w-full">
            {visualStats.map((cat) => (
                <div key={cat.id} className="flex flex-col items-center justify-end h-full flex-1 min-w-[60px] group">
                    {/* Blocks Container */}
                    <div className={`w-full mb-3 transition-all duration-300 ${
                        columns > 1 
                            ? `grid gap-0.5 justify-center` 
                            : 'flex flex-col-reverse gap-0.5 items-center'
                    }`}
                    style={columns > 1 ? { 
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                        alignContent: 'end',
                        transform: 'scaleY(-1)'
                    } : {}}
                    >
                        {cat.days.map((day, idx) => (
                            <div 
                                key={`${cat.id}-${day.date}`}
                                className={`
                                    ${columns > 1 ? 'aspect-square w-full' : 'w-full max-w-[40px] h-3 md:h-4'} 
                                    ${cat.color} 
                                    rounded-[1px] shadow-sm relative hover:scale-110 transition-transform ${onDayClick ? 'cursor-pointer' : 'cursor-help'}
                                `}
                                style={columns > 1 ? { transform: 'scaleY(-1)' } : undefined}
                                title={onDayClick ? undefined : `${new Date(day.date).toLocaleDateString()} - ${cat.label}`}
                                onClick={onDayClick ? () => onDayClick(new Date(day.date)) : undefined}
                            >
                                {/* Day number hint on hover (only if large enough) */}
                                {variant !== 'compact' && columns === 1 && (
                                    <div className="absolute inset-0 flex items-center justify-center text-[8px] md:text-[10px] font-bold text-white opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                                        {new Date(day.date).getDate()}
                                    </div>
                                )}
                                {/* Day Number Overlay for Clickable Blocks */}
                                {onDayClick && (
                                    <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90 opacity-0 hover:opacity-100 transition-opacity">
                                        {new Date(day.date).getDate()}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Label and Icon */}
                    <div className="flex flex-col items-center gap-1 z-10 pt-2 w-full border-t border-border-color/20 min-h-[85px] justify-start">
                        <div className={`p-2 rounded-full bg-bg-subtle ${cat.textColor}`}>
                            <Icon name={cat.icon} className="text-xl md:text-2xl" />
                        </div>
                        <span className="text-[10px] md:text-xs font-bold text-text-muted uppercase text-center leading-tight px-1">
                            {cat.label}
                        </span>
                        <span className="text-sm font-bold text-text-main">
                            {cat.days.length}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
};
