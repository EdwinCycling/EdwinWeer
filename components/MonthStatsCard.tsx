import React, { useState, useEffect, useMemo } from 'react';
import { AppSettings, Location, ViewState, WindUnit, WeatherData } from '../types';
import { Icon } from './Icon';
import { fetchHistorical, convertTemp, convertPrecip, convertWind } from '../services/weatherService';
import { getTranslation } from '../services/translations';
import { MonthStatsModal } from './MonthStatsModal';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';

interface Props {
    location: Location;
    settings: AppSettings;
    onNavigate?: (view: ViewState, params?: any) => void;
    onUpdateSettings?: (settings: AppSettings) => void;
    weatherData?: WeatherData;
}

export const MonthStatsCard: React.FC<Props> = ({ location, settings, onNavigate, onUpdateSettings, weatherData }) => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [data, setData] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);
    const [isExpanded, setIsExpanded] = useState(() => settings.currentView?.monthStatsExpanded ?? true);

    const t = (key: string) => getTranslation(key, settings.language);

    useEffect(() => {
        setIsExpanded(settings.currentView?.monthStatsExpanded ?? true);
    }, [settings.currentView?.monthStatsExpanded]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const now = new Date();
                // Construct local date strings manually to avoid UTC shifts
                const year = now.getFullYear();
                const month = now.getMonth() + 1; // 1-12
                
                // Start date: 1st of current month
                const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
                
                // End date: Yesterday
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                
                // Check if yesterday is in the previous month (i.e. today is 1st)
                // If today is 1st, we can't show stats for "this month until yesterday" as there are no days.
                // But typically we might want to show empty or just return.
                if (yesterday.getMonth() !== now.getMonth()) {
                     setLoading(false);
                     return;
                }

                const yYear = yesterday.getFullYear();
                const yMonth = yesterday.getMonth() + 1;
                const yDay = yesterday.getDate();
                const endStr = `${yYear}-${String(yMonth).padStart(2, '0')}-${String(yDay).padStart(2, '0')}`;

                const result = await fetchHistorical(location.lat, location.lon, startStr, endStr);
                
                if (result && result.daily) {
                    setData(result);
                    
                    // Calculate stats
                    const daily = result.daily;
                    const len = daily.time.length;
                    
                    if (len === 0) {
                        setLoading(false);
                        return;
                    }

                    // Helper for averages ignoring nulls
                    const calcAvg = (arr: (number | null | undefined)[]) => {
                        if (!arr) return 0;
                        const valid = arr.filter(v => v !== null && v !== undefined) as number[];
                        if (valid.length === 0) return 0;
                        return valid.reduce((a, b) => a + b, 0) / valid.length;
                    };

                    // Fix: Ensure temperature_2m_mean is used if available (now added to fetchHistorical)
                    // If still missing (cached old data), fallback to (min+max)/2
                    let avgTemp = 0;
                    if (daily.temperature_2m_mean) {
                        avgTemp = calcAvg(daily.temperature_2m_mean);
                    } else {
                        // Fallback calculation
                        let sum = 0;
                        let count = 0;
                        for(let i=0; i<len; i++) {
                            const max = daily.temperature_2m_max[i];
                            const min = daily.temperature_2m_min[i];
                            if (max !== null && max !== undefined && min !== null && min !== undefined) {
                                sum += (max + min) / 2;
                                count++;
                            }
                        }
                        avgTemp = count > 0 ? sum / count : 0;
                    }

                    const avgMax = calcAvg(daily.temperature_2m_max);
                    const avgMin = calcAvg(daily.temperature_2m_min);
                    // Rain sum treats null as 0
                    const rainSum = daily.precipitation_sum ? daily.precipitation_sum.reduce((a: number, b: number | null) => a + (b || 0), 0) : 0;
                    
                    // Rain days > 0.1mm (Standard meteorological threshold)
                    const rainDays = daily.precipitation_sum ? daily.precipitation_sum.filter((p: number | null) => (p || 0) > 0.1).length : 0;
                    
                    // New: Rain days >= 2mm (Natte dagen)
                    const rainDays2mm = daily.precipitation_sum ? daily.precipitation_sum.filter((p: number | null) => (p || 0) > 1).length : 0;
                    
                    // Sun days: > 50% of daylight duration
                    let sunDays = 0;
                    if (daily.sunshine_duration && daily.daylight_duration) {
                        daily.sunshine_duration.forEach((sun: number | null, i: number) => {
                            const daylight = daily.daylight_duration[i];
                            if (sun !== null && daylight && daylight > 0 && (sun / daylight) >= 0.5) {
                                sunDays++;
                            }
                        });
                    } else if (daily.sunshine_duration) {
                        // Fallback if daylight_duration is missing (should not happen with new fetch)
                         sunDays = daily.sunshine_duration.filter((d: number | null) => (d || 0) > 14400).length;
                    }

                    // Calculate Avg Wind
                    let avgWind = 0;
                    if (daily.wind_speed_10m_mean) {
                        avgWind = calcAvg(daily.wind_speed_10m_mean);
                    } else if (daily.wind_speed_10m_max) {
                        avgWind = calcAvg(daily.wind_speed_10m_max);
                    }

                    // Calculate Absolute Max/Min with dates
                    let absoluteMax = -Infinity;
                    let absoluteMaxDate = '';
                    let absoluteMin = Infinity;
                    let absoluteMinDate = '';

                    if (daily.temperature_2m_max) {
                        daily.temperature_2m_max.forEach((t: number, i: number) => {
                            if (t > absoluteMax) {
                                absoluteMax = t;
                                absoluteMaxDate = daily.time[i];
                            }
                        });
                    }
                    if (daily.temperature_2m_min) {
                        daily.temperature_2m_min.forEach((t: number, i: number) => {
                            if (t < absoluteMin) {
                                absoluteMin = t;
                                absoluteMinDate = daily.time[i];
                            }
                        });
                    }

                    const monthAmplitude = Number.isFinite(absoluteMax) && Number.isFinite(absoluteMin)
                        ? absoluteMax - absoluteMin
                        : 0;

                    // Max Wind Gust
                    let maxGust = 0;
                    let maxGustDate = '';
                    if (daily.wind_gusts_10m_max) {
                        daily.wind_gusts_10m_max.forEach((g: number, i: number) => {
                            if (g > maxGust) {
                                maxGust = g;
                                maxGustDate = daily.time[i];
                            }
                        });
                    }

                    // Max Day Amplitude
                    let maxDayAmplitude = 0;
                    let maxDayAmplitudeDate = '';

                    if (daily.temperature_2m_max && daily.temperature_2m_min) {
                        daily.temperature_2m_max.forEach((maxT: number, i: number) => {
                            const minT = daily.temperature_2m_min[i];
                            if (typeof maxT === 'number' && typeof minT === 'number') {
                                const diff = maxT - minT;
                                if (diff > maxDayAmplitude) {
                                    maxDayAmplitude = diff;
                                    maxDayAmplitudeDate = daily.time[i];
                                }
                            }
                        });
                    }

                    // Percentages (of passed days in month)
                    const totalDays = len; // Days processed so far
                    const rainPercentage = totalDays > 0 ? (rainDays2mm / totalDays) * 100 : 0;
                    const sunPercentage = totalDays > 0 ? (sunDays / totalDays) * 100 : 0;

                    // Mini Charts Data
                    const miniChartMax = daily.temperature_2m_max ? daily.temperature_2m_max.map((v: number, i: number) => ({ val: v, date: daily.time[i] })) : [];
                    const miniChartMin = daily.temperature_2m_min ? daily.temperature_2m_min.map((v: number, i: number) => ({ val: v, date: daily.time[i] })) : [];

                    setStats({
                        avgTemp,
                        avgMax,
                        avgMin,
                        rainSum,
                        rainDays,
                        rainDays2mm,
                        sunDays,
                        avgWind,
                        absoluteMax,
                        absoluteMaxDate,
                        absoluteMin,
                        absoluteMinDate,
                        monthAmplitude,
                        maxDayAmplitude,
                        maxDayAmplitudeDate,
                        maxGust,
                        maxGustDate,
                        rainPercentage,
                        sunPercentage,
                        miniChartMax,
                        miniChartMin
                    });
                }

            } catch (e) {
                console.error("Failed to load month stats", e);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [location]);

    if (loading) return null;
    if (!stats) return null;

    const currentMonthName = new Date().toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'long' });

    const formatDate = (d: string) => {
        if (!d) return '';
        return new Date(d).toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'numeric' });
    };

    const maxGustUnit = settings.windUnit === WindUnit.MPH ? WindUnit.MPH : WindUnit.KMH;
    const maxGustUnitLabel = maxGustUnit === WindUnit.MPH ? 'mph' : 'km/h';

    const handleToggleExpanded = (e: React.MouseEvent) => {
        e.stopPropagation();
        const next = !isExpanded;
        setIsExpanded(next);
        if (onUpdateSettings) {
            onUpdateSettings({
                ...settings,
                currentView: {
                    ...settings.currentView,
                    monthStatsExpanded: next
                }
            });
        }
    };

    const handlePrevMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onNavigate) {
            const now = new Date();
            // Go to first day of current month, then subtract 1 month
            // This handles year changes automatically (e.g. Jan 2024 -> Dec 2023)
            // And avoids "day overflow" issues (e.g. 31 March -> Feb)
            const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            
            // Navigate to Records view (Inzichten)
            onNavigate(ViewState.RECORDS, { date: d });
        }
    };

    // Prediction vs Average logic
    let predictionCard = null;
    const weatherDataAny = weatherData as any;
    if (weatherDataAny && weatherDataAny.daily) {
        const todayMax = weatherDataAny.daily.temperature_2m_max[0];
        const todayMin = weatherDataAny.daily.temperature_2m_min[0];
        
        const diffMax = todayMax - stats.avgMax;
        const diffMin = todayMin - stats.avgMin;

        predictionCard = (
            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                <span className="text-xs text-text-muted uppercase font-bold">Vandaag vs Gem.</span>
                <div className="flex flex-col text-xs font-medium">
                    <div className="flex justify-between">
                        <span>Max:</span>
                        <span className={diffMax > 0 ? "text-red-500 font-bold" : "text-blue-500 font-bold"}>
                            {diffMax > 0 ? '+' : ''}{diffMax.toFixed(1)}°
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span>Min:</span>
                        <span className={diffMin > 0 ? "text-red-500 font-bold" : "text-blue-500 font-bold"}>
                            {diffMin > 0 ? '+' : ''}{diffMin.toFixed(1)}°
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div 
                onClick={() => setShowModal(true)}
                className="bg-bg-card/80 backdrop-blur-md rounded-3xl border border-border-color p-6 shadow-lg cursor-pointer hover:scale-[1.02] transition-all group mb-8 relative overflow-hidden"
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
                        <Icon name="calendar_month" className="text-primary" />
                        {t('month_stats.title') || 'Actuele maandoverzicht'}
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase text-text-muted bg-bg-subtle px-2 py-1 rounded-lg">
                            {currentMonthName}
                        </span>
                        <button
                            onClick={handleToggleExpanded}
                            className="size-8 rounded-full flex items-center justify-center hover:bg-bg-page text-text-muted"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                            <Icon name={isExpanded ? 'expand_less' : 'expand_more'} className="text-lg" />
                        </button>
                    </div>
                </div>
                {isExpanded && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Gem. Temp</span>
                                <span className="text-xl font-bold text-text-main">{convertTemp(stats.avgTemp, settings.tempUnit).toFixed(1)}°</span>
                            </div>
                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Gem. Max</span>
                                <span className="text-lg font-bold text-text-main">{convertTemp(stats.avgMax, settings.tempUnit).toFixed(1)}°</span>
                            </div>
                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Gem. Min</span>
                                <span className="text-lg font-bold text-text-main">{convertTemp(stats.avgMin, settings.tempUnit).toFixed(1)}°</span>
                            </div>

                            {predictionCard}

                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Hoogste Max</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xl font-bold text-red-500">{convertTemp(stats.absoluteMax, settings.tempUnit).toFixed(1)}°</span>
                                    <span className="text-[10px] text-text-muted font-medium">{formatDate(stats.absoluteMaxDate)}</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Laagste Min</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xl font-bold text-blue-500">{convertTemp(stats.absoluteMin, settings.tempUnit).toFixed(1)}°</span>
                                    <span className="text-[10px] text-text-muted font-medium">{formatDate(stats.absoluteMinDate)}</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Maand Amplitude</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xl font-bold text-text-main">{convertTemp(stats.monthAmplitude, settings.tempUnit).toFixed(1)}°</span>
                                </div>
                                <div className="text-[10px] text-text-muted font-medium">
                                    Max - Min temp
                                </div>
                            </div>

                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Dag Amplitude</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xl font-bold text-text-main">{convertTemp(stats.maxDayAmplitude, settings.tempUnit).toFixed(1)}°</span>
                                </div>
                                <div className="text-[10px] text-text-muted font-medium">
                                    {formatDate(stats.maxDayAmplitudeDate)}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Gem. Wind</span>
                                <span className="text-lg font-bold text-text-main">{convertWind(stats.avgWind, WindUnit.BFT)} Bft</span>
                            </div>

                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Max Windstoot</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-lg font-bold text-text-main">{convertWind(stats.maxGust, maxGustUnit)} {maxGustUnitLabel}</span>
                                    <span className="text-[10px] text-text-muted font-medium">{formatDate(stats.maxGustDate)}</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Neerslag Totaal</span>
                                <span className="text-xl font-bold text-blue-400">{convertPrecip(stats.rainSum, settings.precipUnit).toFixed(1)} {settings.precipUnit}</span>
                            </div>

                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">Natte Dagen</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-lg font-bold text-blue-500">{stats.rainDays2mm}</span>
                                    <span className="text-[10px] text-text-muted font-medium">{stats.rainPercentage.toFixed(0)}%</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50">
                                <span className="text-xs text-text-muted uppercase font-bold">{t('month_stats.sun_days')}</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-lg font-bold text-yellow-500">{stats.sunDays}</span>
                                    <span className="text-[10px] text-text-muted font-medium">{stats.sunPercentage.toFixed(0)}%</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50 relative overflow-hidden">
                                <span className="text-xs text-text-muted uppercase font-bold z-10">Max Verloop</span>
                                <div className="absolute bottom-0 left-0 right-0 h-12 opacity-50">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={stats.miniChartMax}>
                                            <Bar dataKey="val" fill="#ef4444" radius={[2, 2, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 p-3 rounded-xl bg-bg-page/50 border border-border-color/50 relative overflow-hidden">
                                <span className="text-xs text-text-muted uppercase font-bold z-10">Min Verloop</span>
                                <div className="absolute bottom-0 left-0 right-0 h-12 opacity-50">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={stats.miniChartMin}>
                                            <Bar dataKey="val" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-4 flex justify-between items-center">
                            <button 
                                onClick={handlePrevMonth}
                                className="hidden md:flex text-xs font-bold text-text-muted hover:text-primary transition-colors items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-bg-page border border-transparent hover:border-border-color z-10"
                            >
                                <Icon name="arrow_back" className="text-sm" />
                                Vorige maand
                            </button>

                            <span className="text-xs text-primary font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform ml-auto">
                                Bekijk details <Icon name="arrow_forward" className="text-sm" />
                            </span>
                        </div>
                    </>
                )}
            </div>

            <MonthStatsModal 
                isOpen={showModal} 
                onClose={() => setShowModal(false)} 
                data={data} 
                settings={settings}
                location={location}
            />
        </>
    );
};
