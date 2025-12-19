import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse, TempUnit, PrecipUnit, WindUnit } from '../types';
import { Icon } from '../components/Icon';
import { fetchForecast, fetchSeasonal, fetchHistoricalPeriods, mapWmoCodeToIcon, mapWmoCodeToText, convertTemp, convertPrecip, convertWind } from '../services/weatherService';
import { loadCurrentLocation, saveCurrentLocation } from '../services/storageService';
import { WeatherBackground } from '../components/WeatherBackground';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend, ReferenceLine, ComposedChart, Line } from 'recharts';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

interface WeekData {
    id: number;
    weekNumber: number;
    startDate: Date;
    endDate: Date;
    label: string;
    fullLabel: string;
    isForecastAvailable: boolean;
    forecastData: any[] | null;
    summary: {
        avgMax: number;
        avgMin: number;
        totalRain: number;
        avgDailySunshine: number;
        avgWind: number;
    } | null;
}

export const HolidayWeatherView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [loadingCity, setLoadingCity] = useState(false);
  const [weatherData, setWeatherData] = useState<OpenMeteoResponse | null>(null);
  const [seasonalData, setSeasonalData] = useState<any>(null);
  const [historicalCache, setHistoricalCache] = useState<{[key: number]: any[]}>({});
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState('');
  
  // Selection State
  const [userSelectedWeek, setUserSelectedWeek] = useState<number | null>(null);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  
  // View Settings
  const [useForecast, setUseForecast] = useState(true);
  const [showIndividualYears, setShowIndividualYears] = useState(false);

  const t = (key: string) => getTranslation(key, settings.language);

  useEffect(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      saveCurrentLocation(location);
      loadAllData();
  }, [location]);

  useEffect(() => {
      if (userSelectedWeek !== null) {
          const week = weeks[userSelectedWeek];
          if (!week.isForecastAvailable) {
              setUseForecast(false);
          } else {
              setUseForecast(true);
          }
      }
  }, [userSelectedWeek]);

  useEffect(() => {
      if (userSelectedWeek !== null && !useForecast && !historicalCache[userSelectedWeek] && !loadingHistory) {
          loadHistoricalForWeek(userSelectedWeek);
      }
  }, [userSelectedWeek, useForecast, historicalCache]);

  const loadAllData = async () => {
    setLoading(true);
    setError('');
    try {
        const [current, seasonal] = await Promise.all([
            fetchForecast(location.lat, location.lon),
            fetchSeasonal(location.lat, location.lon)
        ]);
        setWeatherData(current);
        setSeasonalData(seasonal);
    } catch (e) {
        console.error(e);
        setError(t('error'));
    } finally {
        setLoading(false);
    }
  };

  const loadHistoricalForWeek = async (weekIdx: number) => {
      const week = weeks[weekIdx];
      if (!week) return;

      setLoadingHistory(true);
      try {
          const data = await fetchHistoricalPeriods(location.lat, location.lon, week.startDate);
          setHistoricalCache(prev => ({
              ...prev,
              [weekIdx]: data
          }));
      } catch (e) {
          console.error("Failed to fetch historical data", e);
      } finally {
          setLoadingHistory(false);
      }
  };

  const weeks = useMemo<WeekData[]>(() => {
      const result: WeekData[] = [];
      const today = new Date();
      today.setHours(0,0,0,0);
      
      const startRef = seasonalData?.daily?.time ? new Date(seasonalData.daily.time[0]) : today;
      
      for (let i = 0; i < 52; i++) {
          const wStart = new Date(startRef);
          wStart.setDate(wStart.getDate() + (i * 7));
          const wEnd = new Date(wStart);
          wEnd.setDate(wEnd.getDate() + 6);

          let forecastData = null;
          let summary = null;
          let isForecastAvailable = false;

          if (seasonalData && seasonalData.daily) {
             const daily = seasonalData.daily;
             const wStartStr = wStart.toISOString().split('T')[0];
             const startIndex = daily.time.indexOf(wStartStr);

             if (startIndex !== -1 && startIndex + 7 <= daily.time.length) {
                 isForecastAvailable = true;
                 
                 const getMemberData = (prefix: string) => {
                     if (daily[`${prefix}_member01`]) return daily[`${prefix}_member01`];
                     if (daily[`${prefix}_member0`]) return daily[`${prefix}_member0`];
                     if (daily[`${prefix}_member00`]) return daily[`${prefix}_member00`];
                     if (daily[`${prefix}_mean`]) return daily[`${prefix}_mean`];
                     if (daily[prefix]) return daily[prefix];
                     return [];
                 };

                 const chunkMax = getMemberData('temperature_2m_max').slice(startIndex, startIndex + 7);
                 const chunkMin = getMemberData('temperature_2m_min').slice(startIndex, startIndex + 7);
                 const chunkPrecip = getMemberData('precipitation_sum').slice(startIndex, startIndex + 7);
                 const chunkSunshine = getMemberData('sunshine_duration').slice(startIndex, startIndex + 7);
                 const chunkWind = getMemberData('wind_speed_10m_max').slice(startIndex, startIndex + 7);
                 const chunkTime = daily.time.slice(startIndex, startIndex + 7);

                 const validMax = chunkMax.filter((x: any) => x !== null);
                 const validMin = chunkMin.filter((x: any) => x !== null);
                 const validSunshine = chunkSunshine.filter((x: any) => x !== null);
                 const validWind = chunkWind.filter((x: any) => x !== null);
                 
                 const avgMax = validMax.length ? validMax.reduce((a: number, b: number) => a + b, 0) / validMax.length : 0;
                 const avgMin = validMin.length ? validMin.reduce((a: number, b: number) => a + b, 0) / validMin.length : 0;
                 const totalRain = chunkPrecip.reduce((a: number, b: number) => a + (b || 0), 0);
                 const totalSunshineHours = validSunshine.reduce((a: number, b: number) => a + b, 0) / 3600; 
                 const avgDailySunshine = totalSunshineHours / 7;
                 const avgWind = validWind.length ? validWind.reduce((a: number, b: number) => a + b, 0) / validWind.length : 0;

                 summary = {
                     avgMax: convertTemp(avgMax, settings.tempUnit),
                     avgMin: convertTemp(avgMin, settings.tempUnit),
                     totalRain: convertPrecip(totalRain, settings.precipUnit),
                     avgDailySunshine: parseFloat(avgDailySunshine.toFixed(1)),
                     avgWind: convertWind(avgWind, settings.windUnit)
                 };

                 forecastData = chunkTime.map((time: string, idx: number) => ({
                    time,
                    date: new Date(time).toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short', day: 'numeric' }),
                    max: convertTemp(chunkMax[idx] ?? 0, settings.tempUnit),
                    min: convertTemp(chunkMin[idx] ?? 0, settings.tempUnit),
                    precip: convertPrecip(chunkPrecip[idx], settings.precipUnit),
                    sunshine: chunkSunshine[idx] !== null ? parseFloat((chunkSunshine[idx] / 3600).toFixed(1)) : null,
                    wind: chunkWind[idx] !== null ? convertWind(chunkWind[idx], settings.windUnit) : null
                 }));
             }
          }

          const weekNum = getWeekNumber(wStart);
          result.push({
              id: i,
              weekNumber: weekNum,
              startDate: wStart,
              endDate: wEnd,
              label: `${wStart.getDate()} ${wStart.toLocaleString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short' }).substring(0,3)} - ${wEnd.getDate()} ${wEnd.toLocaleString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short' }).substring(0,3)}`,
              fullLabel: `${t('holiday.week')} ${weekNum}: ${wStart.toLocaleDateString()} - ${wEnd.toLocaleDateString()}`,
              isForecastAvailable,
              forecastData,
              summary
          });
      }
      return result;
  }, [seasonalData, settings.language, settings.tempUnit, settings.precipUnit, settings.windUnit]);

  // Group weeks by month
  const weeksByMonth = useMemo(() => {
      const grouped: { [key: string]: WeekData[] } = {};
      weeks.forEach(week => {
         // Using 'short' for 3-letter month abbreviations
         const key = week.startDate.toLocaleString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short' }).substring(0,3);
         if (!grouped[key]) grouped[key] = [];
         grouped[key].push(week);
      });
      return grouped;
  }, [weeks, settings.language]);

  const monthKeys = Object.keys(weeksByMonth);
  const currentMonthKey = monthKeys[selectedMonthIndex];
  const currentMonthWeeks = weeksByMonth[currentMonthKey] || [];

  function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
    return weekNo;
  }

  const handleWeekSelect = (index: number) => {
    setUserSelectedWeek(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetSelection = () => {
    setUserSelectedWeek(null);
  };

  const getDisplayData = () => {
      if (userSelectedWeek === null) return [];
      const week = weeks[userSelectedWeek];
      
      if (useForecast && week.isForecastAvailable && week.forecastData) {
          return week.forecastData;
      }
      
      const history = historicalCache[userSelectedWeek];
      if (!history) return [];

      const days = [];
      for(let i=0; i<7; i++) {
          const d = new Date(week.startDate);
          d.setDate(d.getDate() + i);
          
          let sumMax = 0, sumMin = 0, sumPrecip = 0, sumSunshine = 0, sumWind = 0;
          let count = 0;

          const yearValues: any = {};

          history.forEach((hYear: any, yIdx: number) => {
              if (hYear.daily && hYear.daily.time && hYear.daily.time.length > i) {
                  const max = hYear.daily.temperature_2m_max[i];
                  const min = hYear.daily.temperature_2m_min[i];
                  const precip = hYear.daily.precipitation_sum[i];
                  const sun = hYear.daily.sunshine_duration[i];
                  const wind = hYear.daily.wind_speed_10m_max[i];
                  
                  if (max !== null && min !== null) {
                      sumMax += max;
                      sumMin += min;
                      sumPrecip += (precip || 0);
                      sumSunshine += (sun || 0);
                      sumWind += (wind || 0);
                      count++;

                      if (showIndividualYears) {
                          yearValues[`max_${yIdx}`] = convertTemp(max, settings.tempUnit);
                          yearValues[`min_${yIdx}`] = convertTemp(min, settings.tempUnit);
                          yearValues[`sunshine_${yIdx}`] = sun !== null ? parseFloat((sun / 3600).toFixed(1)) : null;
                          yearValues[`wind_${yIdx}`] = wind !== null ? convertWind(wind, settings.windUnit) : null;
                      }
                  }
              }
          });

          if (count > 0) {
              days.push({
                  date: d.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short', day: 'numeric' }),
                  max: convertTemp(sumMax / count, settings.tempUnit),
                  min: convertTemp(sumMin / count, settings.tempUnit),
                  precip: convertPrecip(sumPrecip / count, settings.precipUnit),
                  sunshine: parseFloat(((sumSunshine / count) / 3600).toFixed(1)),
                  wind: convertWind(sumWind / count, settings.windUnit),
                  ...yearValues
              });
          }
      }
      return days;
  };

  const displayData = getDisplayData();
  const currentWeek = userSelectedWeek !== null ? weeks[userSelectedWeek] : null;

  return (
    <div className="relative min-h-screen flex flex-col pb-20 overflow-y-auto overflow-x-hidden text-slate-800 dark:text-white bg-slate-50 dark:bg-background-dark transition-colors duration-300">

        <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/10 to-background-dark/90 z-0 pointer-events-none hidden dark:block" />

        <div className="relative z-10 flex flex-col h-full w-full">
            {/* Header */}
            <div className="flex flex-col pt-8 pb-4">
                <div className="flex items-center justify-center relative px-4 mb-2">
                    <div className="text-center cursor-pointer group">
                        {loadingCity ? (
                            <div className="flex items-center gap-2">
                                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                                <span className="font-medium">{t('search')}</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-md dark:drop-shadow-md text-slate-800 dark:text-white">
                                    <Icon name="location_on" className="text-primary" />
                                    {location.name}, {location.country}
                                </h2>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex-grow flex items-center justify-center min-h-[30vh]">
                    <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
            ) : weatherData ? (
                <>
                    {userSelectedWeek === null ? (
                        // Initial Selection Screen
                        <div className="flex flex-col items-center px-4 animate-in fade-in zoom-in duration-500 w-full max-w-4xl mx-auto">
                             <div className="bg-white dark:bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 text-center border border-slate-200 dark:border-white/10 shadow-lg w-full text-slate-800 dark:text-white">
                                <Icon name="calendar_month" className="text-4xl mb-2 text-primary mx-auto" />
                                <h3 className="text-xl font-bold mb-2">{t('holiday.planner_title')}</h3>
                                <p className="text-slate-500 dark:text-white/80 text-sm leading-relaxed max-w-md mx-auto">
                                    {t('holiday.planner_desc')}
                                </p>
                             </div>

                             {/* Month Navigation Grid (All months visible) */}
                             <div className="w-full mb-8">
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                    {monthKeys.map((month, idx) => (
                                        <button
                                            key={month}
                                            onClick={() => setSelectedMonthIndex(idx)}
                                            className={`px-2 py-2 rounded-xl text-xs font-bold transition-all text-center truncate ${
                                                selectedMonthIndex === idx 
                                                ? 'bg-primary text-white shadow-lg scale-105 ring-2 ring-primary/50' 
                                                : 'bg-white/60 dark:bg-white/10 text-slate-600 dark:text-white/70 hover:bg-white dark:hover:bg-white/20'
                                            }`}
                                        >
                                            {month}
                                        </button>
                                    ))}
                                </div>
                             </div>

                             {/* Weeks for Selected Month */}
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pb-10">
                                {currentMonthWeeks.map((week) => (
                                    <button
                                        key={week.id}
                                        onClick={() => handleWeekSelect(week.id)}
                                        className="relative overflow-hidden flex flex-col items-start p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 transition-all hover:scale-[1.02] active:scale-95 text-left group shadow-sm"
                                    >
                                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <Icon name="airplane_ticket" className="text-6xl text-slate-800 dark:text-white" />
                                        </div>

                                        <div className="flex justify-between w-full mb-2 z-10 text-slate-800 dark:text-white">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-500 dark:text-white/50 uppercase tracking-wider">{t('holiday.week')} {week.weekNumber}</span>
                                                <span className="text-lg font-bold">{week.label}</span>
                                            </div>
                                            
                                            <div className="flex flex-col items-end gap-1">
                                                {week.isForecastAvailable ? (
                                                    <div className="flex gap-1">
                                                        <div className="bg-primary/20 text-primary border border-primary/20 px-2 py-1 rounded-md text-[10px] font-bold h-fit uppercase">
                                                            {t('holiday.forecast')}
                                                        </div>
                                                        <div className="bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white/50 border border-slate-300 dark:border-white/10 px-2 py-1 rounded-md text-[10px] font-bold h-fit uppercase">
                                                            {t('holiday.plus_history')}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white/50 border border-slate-300 dark:border-white/10 px-2 py-1 rounded-md text-[10px] font-bold h-fit uppercase">
                                                        {t('holiday.history_only')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                             </div>
                        </div>
                    ) : (
                        // Detail View
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
                            
                            {/* Navigation Header */}
                            <div className="px-4 mb-6">
                                <div className="flex items-center justify-between gap-2 max-w-4xl mx-auto bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-2xl p-2 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white shadow-sm">
                                    <button 
                                        onClick={() => handleWeekSelect(userSelectedWeek - 1)}
                                        disabled={userSelectedWeek <= 0}
                                        className={`p-2 rounded-xl transition-all flex items-center justify-center ${userSelectedWeek > 0 ? 'hover:bg-white dark:hover:bg-white/10 text-slate-800 dark:text-white' : 'opacity-20 cursor-not-allowed'}`}
                                    >
                                        <Icon name="chevron_left" className="text-2xl" />
                                    </button>

                                    <div className="flex-grow flex items-center justify-center gap-2 md:gap-8 overflow-hidden">
                                        {/* Prev Week Label */}
                                        {userSelectedWeek > 0 && (
                                            <div 
                                                onClick={() => handleWeekSelect(userSelectedWeek - 1)}
                                                className="hidden md:flex flex-col items-center opacity-40 hover:opacity-70 cursor-pointer scale-90 transition-all"
                                            >
                                                <span className="text-[10px] uppercase font-bold">{weeks[userSelectedWeek - 1].label}</span>
                                            </div>
                                        )}

                                        {/* Current Week Label */}
                                        <div className="flex flex-col items-center min-w-[140px]">
                                            <span className="text-xs uppercase font-bold text-primary mb-1">{t('holiday.selected_week')}</span>
                                            <span className="font-bold text-sm text-center leading-tight">{weeks[userSelectedWeek].label}</span>
                                        </div>

                                        {/* Next Week Label */}
                                        {userSelectedWeek < weeks.length - 1 && (
                                            <div 
                                                onClick={() => handleWeekSelect(userSelectedWeek + 1)}
                                                className="hidden md:flex flex-col items-center opacity-40 hover:opacity-70 cursor-pointer scale-90 transition-all"
                                            >
                                                <span className="text-[10px] uppercase font-bold">{weeks[userSelectedWeek + 1].label}</span>
                                            </div>
                                        )}
                                    </div>

                                    <button 
                                        onClick={() => handleWeekSelect(userSelectedWeek + 1)}
                                        disabled={userSelectedWeek >= weeks.length - 1}
                                        className={`p-2 rounded-xl transition-all flex items-center justify-center ${userSelectedWeek < weeks.length - 1 ? 'hover:bg-white dark:hover:bg-white/10 text-slate-800 dark:text-white' : 'opacity-20 cursor-not-allowed'}`}
                                    >
                                        <Icon name="chevron_right" className="text-2xl" />
                                    </button>
                                </div>
                                
                                <button 
                                    onClick={resetSelection}
                                    className="mx-auto mt-2 flex items-center gap-1 text-xs opacity-60 hover:opacity-100 hover:text-primary transition-all py-1 px-3 rounded-full hover:bg-white/5 w-fit"
                                >
                                    <Icon name="grid_view" className="text-sm" />
                                    {t('holiday.back_overview')}
                                </button>
                            </div>

                            {/* Charts Section */}
                            <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-2xl rounded-t-[40px] border-t border-slate-200 dark:border-white/10 p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.3)] min-h-[600px] text-slate-800 dark:text-white transition-colors">
                                
                                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                                    <h4 className="font-bold text-lg flex items-center gap-2">
                                        <Icon name="date_range" className="text-primary" />
                                        {currentWeek?.fullLabel}
                                    </h4>
                                    
                                    {/* Settings / Toggles */}
                                    <div className="flex items-center gap-4 text-xs font-medium">
                                        {currentWeek?.isForecastAvailable && (
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={useForecast} 
                                                    onChange={(e) => setUseForecast(e.target.checked)}
                                                    className="rounded border-slate-300 text-primary focus:ring-primary"
                                                />
                                                {t('holiday.use_forecast')}
                                            </label>
                                        )}
                                        {!useForecast && (
                                             <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={showIndividualYears} 
                                                    onChange={(e) => setShowIndividualYears(e.target.checked)}
                                                    className="rounded border-slate-300 text-primary focus:ring-primary"
                                                />
                                                {t('holiday.show_5_years')}
                                            </label>
                                        )}
                                    </div>
                                </div>

                                {!useForecast && (
                                    <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs flex items-center gap-2">
                                        <Icon name="history" className="text-blue-400" />
                                        {t('holiday.history_desc')}
                                    </div>
                                )}

                                {loadingHistory ? (
                                    <div className="flex flex-col items-center justify-center h-[300px] opacity-50">
                                        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mb-2"></div>
                                        <span className="text-sm">{t('holiday.loading_history')}</span>
                                    </div>
                                ) : (
                                    <>
                                        {/* Summary Chips (Dynamic based on source) */}
                                        {(useForecast && currentWeek?.summary) || (!useForecast && displayData.length > 0) ? (
                                             <div className="flex flex-wrap gap-3 mb-6">
                                                {(() => {
                                                    // Calculate summary from displayData if historical
                                                    let s = currentWeek?.summary;
                                                    if (!useForecast && displayData.length > 0) {
                                                        const avgMax = displayData.reduce((a, b) => a + b.max, 0) / displayData.length;
                                                        const avgMin = displayData.reduce((a, b) => a + b.min, 0) / displayData.length;
                                                        const totalRain = displayData.reduce((a, b) => a + b.precip, 0); // Sum of averages
                                                        const avgSunshine = displayData.reduce((a, b) => a + b.sunshine, 0) / displayData.length; // Average daily
                                                        const avgWind = displayData.reduce((a, b) => a + b.wind, 0) / displayData.length;
                                                        s = {
                                                            avgMax, avgMin, totalRain, avgDailySunshine: avgSunshine, avgWind
                                                        };
                                                    }
                                                    
                                                    if (!s) return null;

                                                    return (
                                                        <>
                                                            <div className="px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-full text-xs font-bold flex items-center gap-1">
                                                                <Icon name="thermostat" className="text-orange-400" />
                                                                {Math.round(s.avgMax)}° / {Math.round(s.avgMin)}°
                                                            </div>
                                                            <div className="px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-full text-xs font-bold flex items-center gap-1">
                                                                <Icon name="water_drop" className="text-blue-400" />
                                                                {parseFloat(s.totalRain.toFixed(1))} {settings.precipUnit === PrecipUnit.MM ? 'mm' : 'in'}
                                                            </div>
                                                            <div className="px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-full text-xs font-bold flex items-center gap-1">
                                                                <Icon name="sunny" className="text-yellow-400" />
                                                                {parseFloat(s.avgDailySunshine.toFixed(1))}h / day
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                             </div>
                                        ) : null}

                                        {/* Temperature Graph */}
                                        <div className="mb-6 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5">
                                            <h5 className="text-xs font-bold uppercase text-slate-500 dark:text-white/50 mb-4">{t('temp')}</h5>
                                            <div className="h-[200px] w-full" style={{ minHeight: '200px', width: '100%', minWidth: 0, position: 'relative' }}>
                                                <ResponsiveContainer width="99%" height="100%" debounce={50}>
                                                    <ComposedChart data={displayData}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                                                        <XAxis dataKey="date" tick={{fontSize: 10, fill: 'currentColor', opacity: 0.6}} axisLine={false} tickLine={false} />
                                                        <YAxis 
                                                            domain={['auto', 'auto']} 
                                                            tick={{fontSize: 10, fill: 'currentColor', opacity: 0.6}} 
                                                            axisLine={false} 
                                                            tickLine={false}
                                                            width={35}
                                                            tickCount={6}
                                                        />
                                                        <Tooltip 
                                                            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                                        />
                                                        
                                                        {/* Individual Years (if toggled) */}
                                                        {!useForecast && showIndividualYears && Array.from({length: 5}).map((_, i) => (
                                                            <Line key={i} type="monotone" dataKey={`max_${i}`} stroke="#f59e0b" strokeWidth={1} strokeOpacity={0.2} dot={false} />
                                                        ))}

                                                        <Area type="monotone" dataKey="max" stroke="#f59e0b" fill="url(#tempGradient)" strokeWidth={2} name={t('holiday.max_temp')} />
                                                        <Line type="monotone" dataKey="min" stroke="#3b82f6" strokeWidth={2} dot={{r: 3}} name={t('holiday.min_temp')} />
                                                        <defs>
                                                            <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                                            </linearGradient>
                                                        </defs>
                                                    </ComposedChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Precipitation & Sunshine Graph */}
                                            <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-200 dark:border-blue-500/20">
                                                <h5 className="text-xs font-bold uppercase text-blue-600 dark:text-blue-300 mb-4">{t('holiday.precip_sunshine')}</h5>
                                                <div className="h-[150px] w-full" style={{ minHeight: '150px', width: '100%', minWidth: 0, position: 'relative' }}>
                                                    <ResponsiveContainer width="99%" height="100%" debounce={50}>
                                                        <ComposedChart data={displayData}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                                                            <XAxis dataKey="date" tick={{fontSize: 10, fill: 'currentColor', opacity: 0.6}} axisLine={false} tickLine={false} />
                                                            <YAxis 
                                                                yAxisId="left" 
                                                                tick={{fontSize: 10, fill: 'currentColor', opacity: 0.6}} 
                                                                axisLine={false} 
                                                                tickLine={false}
                                                                width={35}
                                                                tickCount={6}
                                                            />
                                                            <YAxis 
                                                                yAxisId="right" 
                                                                orientation="right" 
                                                                tick={{fontSize: 10, fill: 'currentColor', opacity: 0.6}} 
                                                                axisLine={false} 
                                                                tickLine={false}
                                                                width={35}
                                                                tickCount={6}
                                                            />
                                                            <Tooltip 
                                                                cursor={{fill: 'transparent'}}
                                                                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                                            />
                                                            
                                                            {/* Individual Years for Sunshine */}
                                                            {!useForecast && showIndividualYears && Array.from({length: 5}).map((_, i) => (
                                                                <Line yAxisId="right" key={i} type="monotone" dataKey={`sunshine_${i}`} stroke="#fbbf24" strokeWidth={1} strokeOpacity={0.2} dot={false} />
                                                            ))}

                                                            <Bar yAxisId="left" dataKey="precip" fill="#3b82f6" radius={[4, 4, 0, 0]} name={t('precip')} barSize={20} />
                                                            <Line yAxisId="right" type="monotone" dataKey="sunshine" stroke="#fbbf24" strokeWidth={2} dot={{r: 3, fill: '#fbbf24'}} name={t('holiday.sunshine_h')} />
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>

                                            {/* Wind Speed Graph */}
                                            <div className="p-4 bg-slate-100 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5">
                                                <h5 className="text-xs font-bold uppercase text-slate-500 dark:text-white/50 mb-4">{t('holiday.max_wind_speed')}</h5>
                                                <div className="h-[150px] w-full" style={{ minHeight: '150px', width: '100%', minWidth: 0, position: 'relative' }}>
                                                    <ResponsiveContainer width="99%" height="100%" debounce={50}>
                                                        <ComposedChart data={displayData}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                                                            <XAxis dataKey="date" tick={{fontSize: 10, fill: 'currentColor', opacity: 0.6}} axisLine={false} tickLine={false} />
                                                            <YAxis 
                                                                tick={{fontSize: 10, fill: 'currentColor', opacity: 0.6}} 
                                                                axisLine={false} 
                                                                tickLine={false}
                                                                width={35}
                                                                tickCount={6}
                                                            />
                                                            <Tooltip 
                                                                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                                            />
                                                            
                                                            {/* Individual Years for Wind */}
                                                            {!useForecast && showIndividualYears && Array.from({length: 5}).map((_, i) => (
                                                                <Line key={i} type="monotone" dataKey={`wind_${i}`} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.2} dot={false} />
                                                            ))}

                                                            <Area type="monotone" dataKey="wind" stroke="#94a3b8" fill="#cbd5e1" fillOpacity={0.5} strokeWidth={2} name={t('holiday.wind_speed')} />
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </>
            ) : null}
        </div>
    </div>
  );
};
