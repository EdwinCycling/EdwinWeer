import React, { useState, useEffect } from 'react';
import { AppSettings, Location, OpenMeteoResponse } from '../types';
import { Icon } from '../components/Icon';
import { useThemeColors } from '../hooks/useThemeColors';
import { fetchHistoricalFull, fetchHistorical, fetchHistoricalDaily, convertTemp } from '../services/weatherService';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { getTranslation } from '../services/translations';
import { VisualStatsBlocks } from '../components/VisualStatsBlocks';

interface Props {
  date: Date;
  location: Location;
  settings: AppSettings;
  onClose: () => void;
}

export const HistoricalDashboard: React.FC<Props> = ({ date, location, settings, onClose }) => {
  const colors = useThemeColors();
  const [weatherData, setWeatherData] = useState<OpenMeteoResponse | null>(null);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [yearData, setYearData] = useState<any[]>([]);
  const [currentYearData, setCurrentYearData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const t = (key: string) => getTranslation(key, settings.language);

  const hasValidArray = (arr: any) => Array.isArray(arr) && arr.some((v) => v !== null && v !== undefined);

  const computeAvgByDay = (times: string[] | undefined, values: Array<number | null> | undefined) => {
      if (!times || !values || times.length !== values.length) return null;
      const sumMap = new Map<string, number>();
      const countMap = new Map<string, number>();
      for (let i = 0; i < times.length; i++) {
          const value = values[i];
          if (value === null || value === undefined) continue;
          const day = times[i].split('T')[0];
          sumMap.set(day, (sumMap.get(day) ?? 0) + value);
          countMap.set(day, (countMap.get(day) ?? 0) + 1);
      }
      const avgMap = new Map<string, number>();
      sumMap.forEach((sum, day) => {
          const count = countMap.get(day) ?? 0;
          if (count > 0) avgMap.set(day, sum / count);
      });
      return avgMap;
  };

  const computeMaxByDay = (times: string[] | undefined, values: Array<number | null> | undefined) => {
      if (!times || !values || times.length !== values.length) return null;
      const maxMap = new Map<string, number>();
      for (let i = 0; i < times.length; i++) {
          const value = values[i];
          if (value === null || value === undefined) continue;
          const day = times[i].split('T')[0];
          const current = maxMap.get(day);
          if (current === undefined || value > current) {
              maxMap.set(day, value);
          }
      }
      return maxMap;
  };

  const buildDailyFallback = (data: any) => {
      if (!data || !data.daily || !data.daily.time) return null;
      const daily = data.daily;
      const time = daily.time as string[];
      const result = { ...daily };
      if (!hasValidArray(daily.cloud_cover_mean)) {
          const avgCloud = computeAvgByDay(data.hourly?.time, data.hourly?.cloud_cover);
          if (avgCloud) {
              result.cloud_cover_mean = time.map((d: string) => avgCloud.get(d) ?? null);
          }
      }
      if (!hasValidArray(daily.wind_gusts_10m_max)) {
          if (hasValidArray(daily.wind_speed_10m_max)) {
              result.wind_gusts_10m_max = daily.wind_speed_10m_max;
          } else {
              const maxWind = computeMaxByDay(data.hourly?.time, data.hourly?.wind_speed_10m);
              if (maxWind) {
                  result.wind_gusts_10m_max = time.map((d: string) => maxWind.get(d) ?? null);
              }
          }
      }
      return result;
  };

  useEffect(() => {
    loadData();
  }, [date, location]);

  const getDateString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
        const dateStr = getDateString(date);
        
        // 1. Fetch Full Daily Data
        const fullData = await fetchHistoricalFull(location.lat, location.lon, dateStr);
        
        // Synthesize 'current' from hourly data (use 14:00 or max temp time)
        // Find index of max temp
        const temps = fullData.hourly.temperature_2m;
        const maxTempIndex = temps.indexOf(Math.max(...temps));
        const targetIndex = maxTempIndex !== -1 ? maxTempIndex : 14; // Default to max temp time or 14:00

        // Create a synthetic current object
        const syntheticCurrent = {
            temperature_2m: fullData.hourly.temperature_2m[targetIndex],
            relative_humidity_2m: fullData.hourly.relative_humidity_2m[targetIndex],
            apparent_temperature: fullData.hourly.temperature_2m[targetIndex], 
            precipitation: fullData.hourly.precipitation[targetIndex],
            weather_code: fullData.hourly.weather_code[targetIndex],
            surface_pressure: fullData.hourly.surface_pressure[targetIndex],
            pressure_msl: fullData.hourly.surface_pressure[targetIndex], // approx
            wind_speed_10m: fullData.hourly.wind_speed_10m[targetIndex],
            wind_direction_10m: fullData.hourly.wind_direction_10m[targetIndex],
            wind_gusts_10m: fullData.hourly.wind_speed_10m[targetIndex] * 1.5, // Approx if missing
            cloud_cover: fullData.hourly.cloud_cover_mid?.[targetIndex] || 50, // rough
            is_day: (targetIndex >= 6 && targetIndex <= 20) ? 1 : 0
        };

        // Inject synthetic current
        fullData.current = syntheticCurrent;
        setWeatherData(fullData);

        // 2. Fetch Trend Data (-10 to +10 days)
        const start = new Date(date);
        start.setDate(start.getDate() - 10);
        const end = new Date(date);
        end.setDate(end.getDate() + 10);
        
        const trend = await fetchHistorical(location.lat, location.lon, getDateString(start), getDateString(end));
        
        // Process trend data
        const todayStr = getDateString(new Date());
        if (trend && trend.daily) {
            const processedTrend = trend.daily.time.map((t: string, i: number) => {
                const min = convertTemp(trend.daily.temperature_2m_min[i], settings.tempUnit);
                const max = convertTemp(trend.daily.temperature_2m_max[i], settings.tempUnit);
                
                // Determine if point is past/today or future
                // We overlap on today to ensure line continuity
                const isPastOrToday = t <= todayStr;
                const isFutureOrToday = t >= todayStr;

                return {
                    date: t,
                    minSolid: isPastOrToday ? min : null,
                    maxSolid: isPastOrToday ? max : null,
                    minDotted: isFutureOrToday ? min : null,
                    maxDotted: isFutureOrToday ? max : null,
                    code: trend.daily.weather_code[i]
                };
            });
            setTrendData(processedTrend);
        }

        // 3. Fetch Yearly Comparison Data (-5 to +5 years) - OPTIMIZED to 1 request
        const targetYear = date.getFullYear();
        const startYear = targetYear - 5;
        let endYear = targetYear + 5;
        
        const rangeStart = new Date(date);
        rangeStart.setFullYear(startYear);
        const rangeEnd = new Date(date);
        rangeEnd.setFullYear(endYear);
        
        // Ensure we don't fetch into the future
        const now = new Date();
        if (rangeEnd > now) {
            rangeEnd.setTime(now.getTime());
        }

        const rangeData = await fetchHistoricalDaily(location.lat, location.lon, getDateString(rangeStart), getDateString(rangeEnd));
        
        if (rangeData && rangeData.daily) {
             const targetMonth = date.getMonth();
             const targetDay = date.getDate();
             const suffix = `-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
             
             const processedYears = rangeData.daily.time.reduce((acc: any[], t: string, i: number) => {
                 // Check if it's the same day of the year using string comparison to avoid timezone issues
                 if (t.endsWith(suffix)) {
                     acc.push({
                         year: parseInt(t.split('-')[0]),
                         min: convertTemp(rangeData.daily.temperature_2m_min[i], settings.tempUnit),
                         max: convertTemp(rangeData.daily.temperature_2m_max[i], settings.tempUnit)
                     });
                 }
                 return acc;
             }, []).sort((a: any, b: any) => a.year - b.year);
             
             setYearData(processedYears);
         }

        // 4. Fetch Current Year Data (Jan 1 to Yesterday)
        const currentYear = new Date().getFullYear();
        const startCurrent = `${currentYear}-01-01`;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        // Ensure yesterday is not before start of year (e.g. on Jan 1)
        if (yesterday.getFullYear() === currentYear) {
             const endCurrent = getDateString(yesterday);
             const currentYearRes = await fetchHistorical(location.lat, location.lon, startCurrent, endCurrent);
             if (currentYearRes && currentYearRes.daily) {
                 const dailyWithFallback = buildDailyFallback(currentYearRes);
                 setCurrentYearData(dailyWithFallback || currentYearRes.daily);
             }
        }

    } catch (e: any) {
        console.error(e);
        setError(e.message || t('error'));
    } finally {
        setLoading(false);
    }
  };



  if (loading) {
      return (
        <div className="fixed inset-0 z-50 bg-bg-page flex items-center justify-center">
            <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      );
  }

  if (error) {
      return (
        <div className="fixed inset-0 z-50 bg-bg-page flex items-center justify-center p-4">
            <div className="bg-bg-card p-6 rounded-2xl border border-red-500/20 text-center max-w-md">
                <Icon name="error" className="text-4xl text-red-500 mb-4 mx-auto" />
                <h3 className="text-xl font-bold mb-2">{t('error')}</h3>
                <p className="text-text-muted mb-4">{error}</p>
                <button onClick={onClose} className="px-4 py-2 bg-bg-subtle rounded-lg font-bold">
                    {t('close')}
                </button>
            </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg-page overflow-y-auto text-text-main animate-in slide-in-from-bottom duration-300">
      
      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-black/20 to-bg-page/90 z-0 pointer-events-none" />

      {/* Close Button */}
      <button 
        onClick={onClose} 
        className="fixed top-4 right-4 z-50 bg-bg-card/20 hover:bg-bg-card/40 backdrop-blur-md p-2 rounded-full text-text-main transition-all"
      >
        <Icon name="close" className="text-2xl" />
      </button>

      <div className="relative z-10 flex flex-col min-h-screen max-w-5xl mx-auto w-full">
        
        {/* Header */}
        <div className="pt-12 pb-6 text-center">
            <h2 className="text-2xl font-bold flex items-center justify-center gap-2 drop-shadow-md">
                <Icon name="location_on" className="text-primary" />
                {location.name}
            </h2>
            <p className="text-text-muted text-sm font-medium mt-1">
                {date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
        </div>

        {/* Dashboard Content */}
        <div className="bg-bg-card/90 backdrop-blur-2xl rounded-t-[40px] border-t border-border-color p-6 pb-32 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.3)] text-text-main transition-colors flex-1">
            
            {/* 1. Trend Graph (-10 to +10 days) */}
            {trendData.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-lg font-bold mb-4">{t('historical.temp_trend')} {t('historical.trend_range')}</h3>
                    <div className="h-[250px] w-full bg-bg-page rounded-2xl p-2 border border-border-color">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke={colors.borderColor} />
                                <XAxis 
                                    dataKey="date" 
                                    tick={{fill: colors.textMuted, fontSize: 10}} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    tickFormatter={(val) => {
                                        const d = new Date(val);
                                        return `${d.getDate()}/${d.getMonth()+1}`;
                                    }}
                                    interval={0}
                                    minTickGap={0}
                                />
                                <YAxis width={45} tick={{fill: colors.textMuted, fontSize: 11}} tickLine={false} axisLine={false} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: colors.bgCard, border: `1px solid ${colors.borderColor}`, borderRadius: '8px' }}
                                    itemStyle={{ color: colors.textMain }}
                                    labelStyle={{ color: colors.textMuted }}
                                />
                                <Legend />
                                <ReferenceLine x={getDateString(date)} stroke="#ef4444" strokeDasharray="3 3" />
                                {/* Solid Lines (Past/Today) */}
                                <Line type="monotone" dataKey="maxSolid" name={t('historical.max')} stroke="#ef4444" strokeWidth={2} dot={false} connectNulls={false} />
                                <Line type="monotone" dataKey="minSolid" name={t('historical.min')} stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} />
                                
                                {/* Dotted Lines (Future) - Use same color but dashed */}
                                <Line type="monotone" dataKey="maxDotted" name={t('historical.max')} stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" connectNulls={false} legendType="none" />
                                <Line type="monotone" dataKey="minDotted" name={t('historical.min')} stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="5 5" connectNulls={false} legendType="none" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* 2. Yearly Comparison Graph (-5 to +5 years) */}
            {yearData.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-lg font-bold mb-1">
                        {t('historical.year_comparison')} {t('historical.year_range')}
                    </h3>
                    <p className="text-xs text-text-muted mb-3">
                        {date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'long', day: 'numeric' })}
                    </p>
                    <div className="h-[250px] w-full bg-bg-page rounded-2xl p-2 border border-border-color">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={yearData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke={colors.borderColor} />
                                <XAxis 
                                    dataKey="year" 
                                    tick={{fill: colors.textMuted, fontSize: 10}} 
                                    tickLine={false} 
                                    axisLine={false} 
                                />
                                <YAxis width={45} tick={{fill: colors.textMuted, fontSize: 11}} tickLine={false} axisLine={false} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: colors.bgCard, border: `1px solid ${colors.borderColor}`, borderRadius: '8px' }}
                                    itemStyle={{ color: colors.textMain }}
                                    labelStyle={{ color: colors.textMuted }}
                                />
                                <Legend />
                                <ReferenceLine x={date.getFullYear()} stroke="#ef4444" strokeDasharray="3 3" />
                                <Line type="monotone" dataKey="max" name={t('historical.max')} stroke="#ef4444" strokeWidth={2} dot={true} />
                                <Line type="monotone" dataKey="min" name={t('historical.min')} stroke="#3b82f6" strokeWidth={2} dot={true} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* 3. Hourly Graph for the day - REMOVED per request */}
            {/* 
            {weatherData && (
                <div className="mb-8">
                     <h3 className="text-lg font-bold mb-4">{t('hourly_forecast')}</h3>
                     <div className="flex overflow-x-auto scrollbar-hide -mx-6 px-6 pb-4 gap-5">
                        {weatherData.hourly.time.map((t, i) => (
                            <div key={i} className="flex flex-col items-center gap-3 min-w-[64px] shrink-0 p-2 rounded-2xl bg-slate-100 dark:bg-white/5">
                                <p className="text-sm font-medium opacity-60">{t.split('T')[1].slice(0,5)}</p>
                                <Icon name={mapWmoCodeToIcon(weatherData.hourly.weather_code[i], (i<6 || i>21))} className="text-2xl" />
                                <p className="text-lg font-bold">{convertTemp(weatherData.hourly.temperature_2m[i], settings.tempUnit)}°</p>
                            </div>
                        ))}
                     </div>
                </div>
            )}
            */}

            <div className="mb-8">
                <h3 className="text-lg font-bold mb-4">{t('month_stats.visual') || 'Jaar Overzicht (t/m gisteren)'}</h3>
                <div className="bg-bg-page rounded-2xl p-4 border border-border-color overflow-hidden">
                    {currentYearData ? (
                        <VisualStatsBlocks 
                            data={currentYearData} 
                            settings={settings} 
                            columns={10}
                            variant="compact"
                        />
                    ) : (
                        <div className="p-8 text-center text-text-muted text-sm">
                            <Icon name="event_busy" className="text-2xl mb-2 opacity-50" />
                            <p>Nog geen data beschikbaar voor dit jaar.</p>
                        </div>
                    )}
                </div>
                <div className="mt-4 p-4 bg-bg-subtle rounded-xl text-xs text-text-muted flex flex-wrap gap-4 justify-center w-full">
                    <p className="flex items-center gap-1 w-full justify-center text-center font-bold mb-1"><Icon name="info" className="text-sm"/> {t('month_stats.visual.explanation_title')}</p>
                    <p className="text-center opacity-80 leading-relaxed max-w-4xl">{t('month_stats.visual.explanation_legend')}</p>
                </div>
            </div>



        </div>
      </div>
    </div>
  );
};
