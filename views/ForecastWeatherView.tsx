import React, { useState, useEffect, useMemo } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse, ActivityType } from '../types';
import { Icon } from '../components/Icon';
import { fetchForecast, mapWmoCodeToIcon, mapWmoCodeToText, getActivityIcon, getScoreColor, convertTemp, convertWind, convertPrecip, getWindDirection, calculateMoonPhase, getMoonPhaseText, calculateHeatIndex } from '../services/weatherService';
import { loadCurrentLocation, saveCurrentLocation, loadForecastActivitiesMode, saveForecastActivitiesMode, loadForecastViewMode, saveForecastViewMode, loadForecastTrendArrowsMode, saveForecastTrendArrowsMode, ForecastViewMode, loadEnsembleModel } from '../services/storageService';
import { StaticWeatherBackground } from '../components/StaticWeatherBackground';
import { Modal } from '../components/Modal';
import { getTranslation } from '../services/translations';
import { reverseGeocode } from '../services/geoService';
import { calculateActivityScore } from '../services/activityService';
import { AIWeatherReport } from '../components/AIWeatherReport';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine, ReferenceArea } from 'recharts';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const ForecastWeatherView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [weatherData, setWeatherData] = useState<OpenMeteoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [visibleDays, setVisibleDays] = useState<number>(3);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  const t = (key: string) => getTranslation(key, settings.language);

    const currentTemp = weatherData ? Math.round(convertTemp(weatherData.current.temperature_2m, settings.tempUnit)) : 0;
    const feelsLike = weatherData ? convertTemp(weatherData.current.apparent_temperature, settings.tempUnit) : 0;
    const heatIndex = weatherData ? calculateHeatIndex(weatherData.current.temperature_2m, weatherData.current.relative_humidity_2m) : 0;
    const highTemp = weatherData ? Math.round(convertTemp(weatherData.daily.temperature_2m_max[0], settings.tempUnit)) : 0;
    const lowTemp = weatherData ? Math.round(convertTemp(weatherData.daily.temperature_2m_min[0], settings.tempUnit)) : 0;

    useEffect(() => {
    const loadWeather = async () => {
        setLoading(true);
        setError('');
        try {
            // Force auto model
            const data = await fetchForecast(location.lat, location.lon);
            
            // Check for empty data
            if (!data || !data.daily || data.daily.time.length === 0) {
                 setError(`${t('error_no_data_for_forecast') || 'Geen voorspelling beschikbaar voor deze locatie'}`);
                 setWeatherData(null);
                 return;
            }

            setWeatherData(data);
        } catch (e) {
            console.error(e);
            setError(t('error'));
        } finally {
            setLoading(false);
        }
    };
    loadWeather();
  }, [location]);

  useEffect(() => {
      saveCurrentLocation(location);
  }, [location]);

  useEffect(() => {
    if (selectedDayIndex !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [selectedDayIndex]);

  const [activitiesMode, setActivitiesMode] = useState<'none' | 'positive' | 'all'>(loadForecastActivitiesMode());
  const [viewMode, setViewMode] = useState<ForecastViewMode>(loadForecastViewMode());
  const [trendArrows, setTrendArrows] = useState(loadForecastTrendArrowsMode());
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    saveForecastActivitiesMode(activitiesMode);
  }, [activitiesMode]);

  useEffect(() => {
    saveForecastViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    saveForecastTrendArrowsMode(trendArrows);
  }, [trendArrows]);

  useEffect(() => {
    if (viewMode === 'graph' && visibleDays < 7) {
        setVisibleDays(7);
    }
  }, [viewMode]);

  const expandedMode = viewMode === 'expanded';


  const getDailyForecast = () => {
      if (!weatherData) return [];
      return weatherData.daily.time.map((ts, i) => {
          const date = new Date(ts);
          let dayName = i === 0 ? t('today') : i === 1 ? t('tomorrow') : date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long' });
          
          if (i > 0) {
             const dayMonth = date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short' });
             dayName += ` ${dayMonth}`;
          }

          const code = weatherData.daily.weather_code[i];
          const min = convertTemp(weatherData.daily.temperature_2m_min[i], settings.tempUnit);
          const max = convertTemp(weatherData.daily.temperature_2m_max[i], settings.tempUnit);
          const feelsLikeRaw = weatherData.daily.apparent_temperature_max?.[i] ?? weatherData.daily.temperature_2m_max[i];
          const feelsLike = convertTemp(feelsLikeRaw, settings.tempUnit);
          const precip = weatherData.daily.precipitation_sum?.[i] || 0;
          const precipAmount = convertPrecip(precip, settings.precipUnit);
          const sunshineSec = weatherData.daily.sunshine_duration?.[i] || 0;
          const sunshineHours = (sunshineSec / 3600).toFixed(1);
          const windRaw = weatherData.daily.wind_speed_10m_max?.[i] || 0;
          const windMax = convertWind(windRaw, settings.windUnit);
          const windDirRaw = weatherData.daily.wind_direction_10m_dominant?.[i] || 0;
          const windDir = getWindDirection(windDirRaw, settings.language);
          
          // Calculate hourly aggregates
          const hourlyIndices = weatherData.hourly.time
              .map((t, idx) => t.startsWith(ts) ? idx : -1)
              .filter(idx => idx !== -1);
          
          const getAvg = (arr: number[]) => {
              const vals = hourlyIndices.map(idx => arr[idx]).filter(v => v !== undefined);
              return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          };
          const getMin = (arr: number[]) => {
              const vals = hourlyIndices.map(idx => arr[idx]).filter(v => v !== undefined);
              return vals.length ? Math.min(...vals) : 0;
          };

          const cloudCover = getAvg(weatherData.hourly.cloud_cover || []);
          const visibility = getMin(weatherData.hourly.visibility || []);
          const humidity = getAvg(weatherData.hourly.relative_humidity_2m || []);

          // Moon Phase & Precip 24h
          const moonPhase = calculateMoonPhase(date);
          const moonPhaseText = getMoonPhaseText(moonPhase, settings.language);
          const precip24h = i > 0 ? (weatherData.daily.precipitation_sum?.[i-1] || 0) : 0;

          // Activity Scores (Only for first 7 days)
          let activityScores: any[] = [];
          if (i <= 6) {
              const activityData = {
                  tempFeelsLike: feelsLikeRaw,
                  windKmh: weatherData.daily.wind_speed_10m_max?.[i] || 0,
                  precipMm: weatherData.daily.precipitation_sum?.[i] || 0,
                  precipProb: weatherData.daily.precipitation_probability_max?.[i] || 0,
                  gustsKmh: weatherData.daily.wind_gusts_10m_max?.[i] || 0,
                  weatherCode: weatherData.daily.weather_code[i],
                  sunChance: ((weatherData.daily.sunshine_duration?.[i] || 0) / (weatherData.daily.daylight_duration?.[i] || 1)) * 100,
                  cloudCover,
                  visibility,
                  humidity,
                  moonPhaseText,
                  precip24h
              };

              const activities: ActivityType[] = ['bbq', 'cycling', 'walking', 'sailing', 'running', 'beach', 'gardening', 'stargazing', 'golf', 'drone'];
              activityScores = activities.map(act => ({
                  type: act,
                  ...calculateActivityScore(activityData, act, settings.language)
              }));
          }

              let color = 'from-yellow-400 to-amber-400';

              return {
                  day: dayName.charAt(0).toUpperCase() + dayName.slice(1),
                  icon: mapWmoCodeToIcon(code),
                  min,
                  max,
                  feelsLike,
                  color,
              precip,
              precipAmount,
              sunshineHours,
              windMax,
              windDir,
              activityScores
          };
      });
  };

  const dailyForecast = getDailyForecast().slice(0, visibleDays);
  const tempScaleMin = dailyForecast.length > 0 ? Math.min(...dailyForecast.map(d => d.min)) : 0;
  const tempScaleMax = dailyForecast.length > 0 ? Math.max(...dailyForecast.map(d => d.max)) : 1;
  const tempScaleRange = Math.max(1, tempScaleMax - tempScaleMin);

  const graphData = useMemo(() => {
      return dailyForecast.map((d, i) => ({
          ...d,
          index: i,
          dayShort: isMobile ? d.day.substring(0, 2) : d.day.split(' ')[0],
          dayDate: d.day.split(' ').slice(1).join(' '),
          // Cap visual precipitation height at 10mm, but keep real amount for label
          visualPrecip: Math.min(d.precip, 10)
      }));
  }, [dailyForecast, isMobile]);

  const CustomTopTick = ({ x, y, payload }: any) => {
      const data = graphData[payload.index];
      if (!data) return null;
      return (
          <g transform={`translate(${x},${y})`}>
               <foreignObject x={-15} y={-45} width={30} height={30}>
                   <div className="flex justify-center items-center h-full w-full">
                       <Icon name={data.icon} className="text-2xl text-slate-700 dark:text-white" />
                   </div>
               </foreignObject>
               <text x={0} y={-5} textAnchor="middle" fill="currentColor" fontSize={10} className="fill-slate-500 dark:fill-slate-400 font-bold uppercase">
                   {data.dayShort}
               </text>
          </g>
      );
  };

  const CustomBottomTick = ({ x, y, payload }: any) => {
      const data = graphData[payload.index];
      if (!data) return null;
      return (
          <g transform={`translate(${x},${y})`}>
              <text x={0} y={15} textAnchor="middle" fill="currentColor" fontSize={10} className="fill-slate-600 dark:fill-slate-300 font-bold">
                   {data.windMax}
              </text>
               <text x={0} y={28} textAnchor="middle" fill="currentColor" fontSize={10} className="fill-slate-400 dark:fill-slate-500">
                   {data.windDir}
              </text>
          </g>
      );
  };


  // Helper functions for modal
  const getDayHourlyIndices = (dayIndex: number) => {
      if (!weatherData) return [] as number[];
      const day = weatherData.daily.time[dayIndex];
      return weatherData.hourly.time.map((ts, idx) => ts.startsWith(day) ? idx : -1).filter(i => i !== -1);
  };

  const getDayAverage = (key: keyof OpenMeteoResponse['hourly'], dayIndex: number): number | null => {
      if (!weatherData) return null;
      const idxs = getDayHourlyIndices(dayIndex);
      if (idxs.length === 0) return null;
      const arr = weatherData.hourly[key] as number[] | undefined;
      if (!arr) return null;
      const vals = idxs.map(i => arr[i]).filter(v => typeof v === 'number' && !isNaN(v));
      if (vals.length === 0) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const formatHMSFromSeconds = (sec: number | undefined) => {
      if (!sec || sec <= 0) return null;
      const h = Math.round(sec / 3600);
      const m = Math.round((sec % 3600) / 60);
      return `${h}h ${m}m`;
  };

  const calculateDewPoint = (T: number, RH: number) => {
      return T - ((100 - RH) / 5);
  };

  const getActivityIcon = (type: ActivityType) => {
      switch(type) {
          case 'bbq': return 'outdoor_grill';
          case 'cycling': return 'directions_bike';
          case 'walking': return 'directions_walk';
          case 'sailing': return 'sailing';
          case 'running': return 'directions_run';
          case 'beach': return 'beach_access';
          case 'gardening': return 'yard';
          case 'stargazing': return 'auto_awesome';
          case 'golf': return 'golf_course';
          case 'drone': return 'flight';
          default: return 'sports_score';
      }
  };

  const getScoreColor = (score: number) => {
      if (score >= 8) return 'text-green-500 dark:text-green-400';
      if (score >= 5.5) return 'text-yellow-500 dark:text-yellow-400';
      return 'text-red-500 dark:text-red-400';
  };

  const getWeekendAreas = () => {
      const areas = [];
      for (let i = 0; i < graphData.length; i++) {
          const d = graphData[i];
          const date = new Date(d.dayDate + ' ' + new Date().getFullYear()); // Approximation for weekday check
          // Better: use the original index to find the date from weatherData if needed, but dayName has weekday.
          // Or just check day name? "Saturday" / "Zaterdag"
          // Let's rely on the index and initial date.
          // Actually, weatherData.daily.time[i] is available.
          if (weatherData && weatherData.daily && weatherData.daily.time[i]) {
              const dt = new Date(weatherData.daily.time[i]);
              const day = dt.getDay(); // 0 = Sunday, 6 = Saturday
              if (day === 0 || day === 6) {
                  areas.push(
                      <ReferenceArea 
                          key={`weekend-${i}`} 
                          x1={d.day} 
                          x2={d.day} 
                          fill="rgba(255, 255, 0, 0.1)" 
                          ifOverflow="extendDomain"
                      />
                  );
              }
          }
      }
      return areas;
  };

  return (
    <div className="relative min-h-screen flex flex-col pb-20 overflow-y-auto overflow-x-hidden text-slate-800 dark:text-white bg-slate-50 dark:bg-background-dark transition-colors duration-300">
      
      {error && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white px-6 py-3 rounded-full shadow-lg backdrop-blur-md animate-bounce">
            <div className="flex items-center gap-2">
                <Icon name="error_outline" />
                <span className="font-medium">{error}</span>
            </div>
        </div>
      )}

      {weatherData && (
        <div className="absolute inset-0 z-0">
            <StaticWeatherBackground 
                weatherCode={weatherData.current.weather_code} 
                isDay={weatherData.current.is_day}
                cloudCover={weatherData.current.cloud_cover}
            />
        </div>
      )}

      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent dark:from-black/60 dark:via-black/5 dark:to-background-dark/90 z-0 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Header (Same as Ensemble) */}
        <div className="flex flex-col pt-8 pb-4">
            <div className="flex items-center justify-center relative px-4 mb-2">
                <button onClick={() => onNavigate(ViewState.CURRENT)} className="absolute left-6 text-white hover:text-white/80 transition-colors p-2 drop-shadow-md">
                    <Icon name="arrow_back_ios_new" />
                </button>
                <div className="flex flex-col items-center">
                    <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-md text-white">
                        <Icon name="location_on" className="text-primary" />
                        {location.name}, {location.country}
                    </h2>
                </div>
            </div>

            {/* Favorite Cities Selector */}
            <div className="w-full overflow-x-auto scrollbar-hide pl-4 mt-2 transition-colors duration-300">
                <div className="flex gap-3 pr-4">
                    <button 
                        onClick={() => {
                            const geo = navigator.geolocation;
                            if (geo) {
                                setLoading(true);
                                geo.getCurrentPosition(async (pos) => {
                                    const lat = pos.coords.latitude;
                                    const lon = pos.coords.longitude;
                                    let name = t('my_location');
                                    
                                    try {
                                        const cityName = await reverseGeocode(lat, lon);
                                        if (cityName) {
                                            name = cityName;
                                        }
                                    } catch (e) {
                                        console.error(e);
                                    }

                                    setLocation({
                                        name: name, 
                                        country: "", 
                                        lat: lat, 
                                        lon: lon,
                                        isCurrentLocation: true
                                    });
                                    setLoading(false);
                                }, (err) => {
                                    console.error(err);
                                    setLoading(false);
                                });
                            }
                        }}
                        className={`flex items-center gap-1 px-4 py-2 rounded-full whitespace-nowrap backdrop-blur-md shadow-sm transition-colors border ${
                            location.isCurrentLocation 
                                ? 'bg-primary text-white dark:bg-white dark:text-slate-800 font-bold border-primary dark:border-white' 
                                : 'bg-white/60 dark:bg-white/10 text-slate-800 dark:text-white hover:bg-white dark:hover:bg-primary/20 hover:text-primary dark:hover:text-primary border-slate-200 dark:border-white/5'
                        }`}
                    >
                        <Icon name="my_location" className="text-sm" />
                        <span className="text-sm font-medium">{t('my_location')}</span>
                    </button>
                    {settings.favorites.map((fav, i) => (
                        <button 
                            key={i}
                            onClick={() => setLocation(fav)}
                            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border backdrop-blur-md shadow-sm ${location.name === fav.name ? 'bg-primary text-white dark:bg-white dark:text-slate-800 font-bold' : 'bg-white/60 dark:bg-white/10 text-slate-800 dark:text-white hover:bg-white dark:hover:bg-white/20 border-slate-200 dark:border-white/5'}`}
                        >
                            {fav.name}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {/* Current Weather Display (Same as Ensemble) */}
        {weatherData && (
            <div className="flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in duration-500 text-white">
                <div className="flex items-center gap-4">
                    <h1 className="text-[80px] font-bold leading-none tracking-tighter drop-shadow-2xl font-display">
                        {currentTemp}°
                    </h1>
                    
                    <div className="flex gap-3">
                        {feelsLike < 10 ? (
                            <div className="flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-2 border border-slate-200 dark:border-white/10 shadow-sm min-w-[70px]">
                                <Icon name="thermostat" className="text-xl text-blue-500 dark:text-blue-300" />
                                <span className="text-lg font-bold">{Math.round(feelsLike)}°</span>
                                <span className="text-[9px] uppercase text-slate-500 dark:text-white/60">{t('feels_like')}</span>
                            </div>
                        ) : (
                            heatIndex > currentTemp && (
                                <div className="flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-2 border border-slate-200 dark:border-white/10 shadow-sm min-w-[70px]">
                                    <Icon name="thermostat" className="text-xl text-orange-500 dark:text-orange-300" />
                                    <span className="text-lg font-bold">{Math.round(heatIndex)}°</span>
                                    <span className="text-[9px] uppercase text-slate-500 dark:text-white/60">{t('heat_index')}</span>
                                </div>
                            )
                        )}
                    </div>
                </div>
                <p className="text-xl font-medium tracking-wide drop-shadow-md mt-2 flex items-center gap-2 text-white">
                        <Icon name={mapWmoCodeToIcon(weatherData.current.weather_code, weatherData.current.is_day === 0)} className="text-2xl" />
                    {mapWmoCodeToText(weatherData.current.weather_code, settings.language)}
                </p>
                <p className="text-white/80 text-base font-normal drop-shadow-md mt-1">
                    H:{highTemp}° L:{lowTemp}°
                </p>
            </div>
        )}

        {/* Forecast Content */}
        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-2xl rounded-t-[40px] border-t border-slate-200 dark:border-white/10 p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom duration-500 text-slate-800 dark:text-white transition-colors min-h-[60vh]">
            
            {/* AI Report Section */}
            {weatherData && (
                <AIWeatherReport weatherData={weatherData} profile={settings.aiProfile} profiles={settings.aiProfiles} onNavigate={onNavigate} language={settings.language} />
            )}

            {/* Daily Forecast List */}
            <div className="flex flex-col gap-1 mb-8">
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center px-1 mb-4 gap-3 sm:gap-2">
                    <h3 className="text-slate-500 dark:text-white/60 text-xs font-bold uppercase tracking-wider">
                        {t('next_days')}
                    </h3>
                    <div className="flex flex-wrap gap-2 items-center justify-start sm:justify-end">
                        {expandedMode && (
                            <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 rounded-lg p-1 flex-grow sm:flex-grow-0">
                                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 ml-1">Activiteiten</span>
                                <div className="flex bg-white dark:bg-slate-800 rounded-md p-0.5 text-[10px] flex-grow sm:flex-grow-0">
                                    <button
                                        type="button"
                                        onClick={() => setActivitiesMode('none')}
                                        className={`flex-1 sm:flex-none px-2 py-1 rounded-md font-medium transition-colors ${
                                            activitiesMode === 'none'
                                                ? 'bg-slate-200 dark:bg-white/20 text-slate-800 dark:text-white shadow-sm'
                                                : 'text-slate-500 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        Uit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActivitiesMode('positive')}
                                        className={`flex-1 sm:flex-none px-2 py-1 rounded-md font-medium transition-colors ${
                                            activitiesMode === 'positive'
                                                ? 'bg-slate-200 dark:bg-white/20 text-slate-800 dark:text-white shadow-sm'
                                                : 'text-slate-500 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        7+
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActivitiesMode('all')}
                                        className={`flex-1 sm:flex-none px-2 py-1 rounded-md font-medium transition-colors ${
                                            activitiesMode === 'all'
                                                ? 'bg-slate-200 dark:bg-white/20 text-slate-800 dark:text-white shadow-sm'
                                                : 'text-slate-500 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        Alle
                                    </button>
                                </div>
                            </div>
                        )}
                        {viewMode === 'compact' && (
                            <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-100 dark:bg-white/5 rounded-lg p-1.5 px-3 h-[34px]">
                                <input 
                                    type="checkbox" 
                                    checked={trendArrows} 
                                    onChange={(e) => setTrendArrows(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Trend</span>
                            </label>
                        )}
                        
                        <div className="flex bg-slate-100 dark:bg-white/5 rounded-lg p-1 overflow-hidden flex-grow sm:flex-grow-0 h-[34px]">
                            <button 
                                onClick={() => setViewMode('expanded')}
                                className={`flex-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all truncate ${viewMode === 'expanded' ? 'bg-white dark:bg-white/20 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                            >
                                Uitgebreid
                            </button>
                            <button 
                                onClick={() => setViewMode('compact')}
                                className={`flex-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all truncate ${viewMode === 'compact' ? 'bg-white dark:bg-white/20 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                            >
                                Compact
                            </button>
                             <button  
                                onClick={() => setViewMode('graph')}
                                className={`flex-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all truncate ${viewMode === 'graph' ? 'bg-white dark:bg-white/20 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                            >
                                Grafiek
                            </button>
                        </div>
                    </div>
                </div>
                
                {viewMode === 'graph' ? (
                    <div className="flex flex-col w-full mt-4">
                        <div className="w-full h-[400px] select-none pr-2 overflow-x-auto scrollbar-hide">
                            <div className="h-full" style={{ minWidth: visibleDays > 7 ? '800px' : '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={graphData} margin={{ top: 40, right: 10, left: -20, bottom: 40 }}>
                                        {getWeekendAreas()}
                                        <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={false} opacity={0.1} stroke="currentColor" />
                                        <XAxis 
                                            dataKey="day" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={<CustomTopTick />} 
                                            orientation="top"
                                            interval={0}
                                            height={60}
                                        />
                                        <XAxis 
                                            xAxisId="bottom"
                                            dataKey="day" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={<CustomBottomTick />} 
                                            orientation="bottom"
                                            interval={0}
                                            height={60}
                                        />
                                        <YAxis yAxisId="temp" hide domain={['dataMin - 2', 'dataMax + 2']} />
                                        <YAxis yAxisId="precip" hide domain={[0, 10]} />
                                        
                                        <Bar yAxisId="precip" dataKey="visualPrecip" fill="#0ea5e9" barSize={40} radius={[4, 4, 0, 0]} opacity={0.6}>
                                            <LabelList dataKey="precipAmount" position="top" offset={5} fontSize={10} fill="#0ea5e9" formatter={(val: any) => val > 0 ? val : ''} />
                                        </Bar>
                                        
                                        <Line yAxisId="temp" type="monotone" dataKey="max" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }} isAnimationActive={true}>
                                             <LabelList dataKey="max" position="top" offset={10} fontSize={12} fontWeight="bold" fill="#ef4444" formatter={(val: any) => `${Math.round(val)}°`} />
                                        </Line>
                                        <Line yAxisId="temp" type="monotone" dataKey="min" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} isAnimationActive={true}>
                                             <LabelList dataKey="min" position="bottom" offset={10} fontSize={12} fontWeight="bold" fill="#3b82f6" formatter={(val: any) => `${Math.round(val)}°`} />
                                        </Line>
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="flex justify-center mt-4">
                            <button 
                                onClick={() => setVisibleDays(visibleDays <= 7 ? 14 : 7)}
                                className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-xs font-medium transition-colors border border-slate-200 dark:border-white/5 shadow-sm text-slate-600 dark:text-slate-300"
                            >
                                {visibleDays <= 7 ? 'Toon 14 dagen' : 'Toon 7 dagen'}
                            </button>
                        </div>
                    </div>
                ) : (
                <>
                <div className={`${viewMode === 'compact' ? 'grid grid-cols-2 md:grid-cols-3 gap-2' : 'flex flex-col gap-2'}`}>
                    {dailyForecast.map((d, i) => {
                        let trend: 'up' | 'down' | 'equal' | 'neutral' = 'neutral';
                        if (i > 0) {
                            const currentMax = d.max;
                            const prevMax = dailyForecast[i - 1].max;
                            if (currentMax > prevMax) trend = 'up';
                            else if (currentMax < prevMax) trend = 'down';
                            else trend = 'equal';
                        }
                        
                        return expandedMode ? (
                            <div key={i} onClick={() => setSelectedDayIndex(i)} className="flex flex-col p-3 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300 cursor-pointer border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="flex items-center justify-between w-full gap-2">
                                    <div className="flex items-center gap-3 w-auto min-w-[30%] sm:w-1/4">
                                        <div className="size-10 rounded-full bg-white dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                                            <Icon name={d.icon} className={`text-xl ${i===0 ? 'text-primary' : 'text-slate-600 dark:text-white'}`} />
                                        </div>
                                        <p className="font-medium flex items-center gap-1 truncate">
                                            {d.day}
                                            {d.feelsLike < 0 && (
                                                <Icon name="ac_unit" className="text-[14px] text-sky-500 flex-shrink-0" />
                                            )}
                                            {d.feelsLike > 25 && (
                                                <Icon name="whatshot" className="text-[14px] text-orange-500 flex-shrink-0" />
                                            )}
                                        </p>
                                    </div>
                                    
                                    <div className="flex-1 flex items-center gap-1 px-1 sm:px-2 min-w-0">
                                        <span className="text-slate-500 dark:text-white/60 text-xs font-medium text-right min-w-[24px]">{d.min}°</span>
                                        <div className="h-2 flex-1 mx-1 sm:mx-2 bg-slate-300 dark:bg-slate-800 rounded-full overflow-hidden relative">
                                            <div className={`absolute h-full rounded-full bg-gradient-to-r ${d.color}`} style={{ left: `${((d.min - tempScaleMin) / tempScaleRange) * 100}%`, width: `${Math.max(2, ((d.max - d.min) / tempScaleRange) * 100)}%` }}></div>
                                        </div>
                                        <span className="font-bold text-sm min-w-[24px]">{d.max}°</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-white/5 text-xs">
                                    {d.precipAmount > 0 ? (
                                        <div className="flex items-center justify-center gap-1.5 text-blue-500 dark:text-blue-400">
                                            <Icon name="water_drop" className="text-sm" />
                                            <span className="font-medium">{d.precipAmount} {settings.precipUnit}</span>
                                        </div>
                                    ) : <div className="invisible" />}
                                    <div className="flex items-center justify-center gap-1.5 text-orange-500 dark:text-orange-400">
                                        <Icon name="wb_sunny" className="text-sm" />
                                        <span className="font-medium">{d.sunshineHours}h</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-1.5 text-slate-600 dark:text-white/70">
                                        <Icon name="air" className="text-sm" />
                                        <span className="font-medium">{d.windDir} {d.windMax}</span>
                                    </div>
                                </div>

                                {activitiesMode !== 'none' && d.activityScores.length > 0 && (
                                    <div className="flex flex-row justify-between items-center gap-1 mt-2 pt-2 border-t border-slate-200 dark:border-white/5 overflow-x-auto scrollbar-hide">
                                        {d.activityScores
                                            .filter(s => settings.enabledActivities?.[s.type] !== false)
                                            .map(score => {
                                                const hidden = activitiesMode === 'positive' && score.score10 < 7;
                                                return (
                                                    <div
                                                        key={score.type}
                                                        className={`flex flex-col items-center justify-center gap-0.5 group relative cursor-help min-w-[24px] ${
                                                            hidden ? 'opacity-0 pointer-events-none' : ''
                                                        }`}
                                                    >
                                                        <Icon name={getActivityIcon(score.type)} className={`text-lg ${getScoreColor(score.score10)}`} />
                                                        <span className={`text-[10px] font-bold ${getScoreColor(score.score10)}`}>{score.score10}</span>
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                                                            {t(`activity.${score.type}`)}: {score.text}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div key={i} onClick={() => setSelectedDayIndex(i)} className={`flex flex-col p-3 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all animate-in fade-in zoom-in duration-300 cursor-pointer border h-full justify-between shadow-sm ${
                                trendArrows && trend === 'up' 
                                    ? 'border-red-500/50 dark:border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]' 
                                    : trendArrows && trend === 'down' 
                                        ? 'border-blue-500/50 dark:border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                                        : 'border-slate-200 dark:border-white/5'
                            }`}>
                                 <div className="flex items-center justify-between mb-2">
                                     <div className="flex flex-col">
                                         <span className="font-bold text-sm truncate">{d.day.split(' ')[0]}</span>
                                         <span className="text-[10px] text-slate-500 dark:text-white/60 whitespace-nowrap">{d.day.split(' ').slice(1).join(' ')}</span>
                                     </div>
                                     <div className="flex items-center gap-1 ml-2">
                                         {d.feelsLike < 0 && (
                                             <Icon name="ac_unit" className="text-xs text-sky-500" />
                                         )}
                                         {d.feelsLike > 25 && (
                                             <Icon name="whatshot" className="text-xs text-orange-500" />
                                         )}
                                     </div>
                                 </div>
                                 <div className="flex items-center justify-between mb-3">
                                     <Icon name={d.icon} className="text-3xl text-slate-700 dark:text-white" />
                                     <div className="flex flex-col items-end">
                                         <div className="flex items-center gap-1">
                                             {trendArrows && trend === 'up' && (
                                                 <Icon name="north_east" className="text-xs text-red-500" />
                                             )}
                                             {trendArrows && trend === 'down' && (
                                                 <Icon name="south_east" className="text-xs text-blue-500" />
                                             )}
                                             {trendArrows && trend === 'equal' && (
                                                 <Icon name="east" className="text-xs text-slate-400 dark:text-slate-500" />
                                             )}
                                             <span className="font-bold text-xl">{d.max}°</span>
                                         </div>
                                         <span className="text-xs text-slate-500 dark:text-white/60">{d.min}°</span>
                                     </div>
                                 </div>
                                 <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-500 dark:text-white/60 mt-auto">
                                     <div className="flex flex-col items-center">
                                         <Icon name="water_drop" className="text-xs mb-0.5 text-blue-500" />
                                         <span>{d.precipAmount > 0 ? d.precipAmount : '-'}</span>
                                     </div>
                                     <div className="flex flex-col items-center">
                                         <Icon name="wb_sunny" className="text-xs mb-0.5 text-orange-500" />
                                         <span>{d.sunshineHours}h</span>
                                     </div>
                                     <div className="flex flex-col items-center">
                                         <Icon name="air" className="text-xs mb-0.5" />
                                         <span>{d.windMax}</span>
                                     </div>
                                 </div>
                            </div>
                        )
                    })}
                </div>

                <div className="flex flex-col items-center mt-4 gap-3">
                    <button onClick={() => setVisibleDays(visibleDays === 3 ? 7 : visibleDays === 7 ? 16 : 3)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-xs font-medium transition-colors border border-slate-200 dark:border-white/5">
                        {visibleDays === 3 ? t('current.seven_days') : visibleDays === 7 ? t('current.sixteen_days') : t('current.less')}
                    </button>
                    
                    {visibleDays === 16 && (
                        <div className="w-full mt-4 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2">
                            <p className="text-xs text-slate-500 dark:text-white/60 mb-3 text-center max-w-[80%]">
                                Voor de zeer lange termijn voorspelling tot 6 maanden vooruit (Vakantieweer), klik hieronder.
                            </p>
                            <button 
                                onClick={() => onNavigate(ViewState.HOLIDAY)}
                                className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2"
                            >
                                <Icon name="flight" className="text-lg" />
                                6-Maanden / Vakantieweer
                            </button>
                        </div>
                    )}
                </div>
                </>
            )}
            </div>

        </div>
      </div>

      {/* Details Modal */}
      {selectedDayIndex !== null && weatherData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedDayIndex(null)} />
            <div className="relative z-[110] w-[95vw] max-w-[700px] max-h-[80vh] overflow-y-auto bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Icon name={mapWmoCodeToIcon(weatherData.daily.weather_code[selectedDayIndex])} className="text-2xl" />
                        <div>
                            <p className="text-xs font-bold uppercase text-slate-500 dark:text-white/60">{t('details')}</p>
                            <p className="text-lg font-bold">
                                {new Date(weatherData.daily.time[selectedDayIndex]).toLocaleDateString(settings.language==='nl'?'nl-NL':'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => setSelectedDayIndex(null)} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-sm font-bold">
                        {t('back')}
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="thermostat" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('temp')}</p>
                            <p className="text-sm font-bold">{convertTemp(weatherData.daily.temperature_2m_min[selectedDayIndex], settings.tempUnit)}° / {convertTemp(weatherData.daily.temperature_2m_max[selectedDayIndex], settings.tempUnit)}°</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="umbrella" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('precip')}</p>
                            <p className="text-sm font-bold">{convertPrecip(weatherData.daily.precipitation_sum?.[selectedDayIndex], settings.precipUnit)} {settings.precipUnit}</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="umbrella" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('precip_prob')}</p>
                            <p className="text-sm font-bold">{weatherData.daily.precipitation_probability_max?.[selectedDayIndex] ?? 0}%</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="wb_sunny" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('uv_max')}</p>
                            <p className="text-sm font-bold">{weatherData.daily.uv_index_max?.[selectedDayIndex] ?? t('no_data_available')}</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="timelapse" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('sunshine')}</p>
                            <p className="text-sm font-bold">{formatHMSFromSeconds(weatherData.daily.sunshine_duration?.[selectedDayIndex]) ?? t('no_data_available')}</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="wb_twilight" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('daylight')}</p>
                            <p className="text-sm font-bold">{formatHMSFromSeconds(weatherData.daily.daylight_duration?.[selectedDayIndex]) ?? t('no_data_available')}</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="air" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('wind_gusts')}</p>
                            <p className="text-sm font-bold">{convertWind(weatherData.daily.wind_gusts_10m_max?.[selectedDayIndex] ?? 0, settings.windUnit)} {settings.windUnit}</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="air" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('wind')}</p>
                            <p className="text-sm font-bold">{(() => {
                                const v = getDayAverage('wind_speed_10m', selectedDayIndex);
                                return v !== null ? `${convertWind(v, settings.windUnit)} ${settings.windUnit}` : t('no_data_available');
                            })()}</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="humidity_percentage" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('humidity')}</p>
                            <p className="text-sm font-bold">{(() => {
                                const v = getDayAverage('relative_humidity_2m', selectedDayIndex);
                                return v !== null ? `${Math.round(v)}%` : t('no_data_available');
                            })()}</p>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="water_drop" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('dew_point')}</p>
                            <p className="text-sm font-bold">{(() => {
                                const idxs = getDayHourlyIndices(selectedDayIndex);
                                if (idxs.length === 0) return t('no_data_available');
                                const temps = weatherData.hourly.temperature_2m;
                                const rhs = weatherData.hourly.relative_humidity_2m;
                                if (!temps || !rhs) return t('no_data_available');
                                const vals = idxs.map(i => calculateDewPoint(temps[i], rhs[i])).filter(v => typeof v === 'number' && !isNaN(v));
                                if (vals.length === 0) return t('no_data_available');
                                const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                                return `${Math.round(convertTemp(avg, settings.tempUnit))}°`;
                            })()}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-6">
                    <h4 className="text-sm font-bold uppercase text-slate-500 dark:text-white/60 mb-3">{t('activities')}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {dailyForecast[selectedDayIndex].activityScores.map(score => (
                             <div key={score.type} className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-3">
                                         <div className={`p-2 rounded-lg bg-white dark:bg-white/5 ${getScoreColor(score.score10)}`}>
                                            <Icon name={getActivityIcon(score.type)} className="text-xl" />
                                         </div>
                                         <div>
                                            <p className="font-bold capitalize">{t('activity.' + score.type)}</p>
                                            <div className="flex gap-0.5 mt-1">
                                                {[1,2,3,4,5].map(s => {
                                                    const isFull = s <= score.stars;
                                                    const isHalf = !isFull && (s - 0.5 <= score.stars);
                                                    
                                                    if (isHalf) {
                                                        return (
                                                            <div key={s} className="relative w-[18px] h-[18px]">
                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                    <Icon name="star" className="text-lg text-slate-200 dark:text-white/10" />
                                                                </div>
                                                                <div className="absolute inset-y-0 left-0 w-[50%] overflow-hidden">
                                                                    <div className="w-[18px] h-full flex items-center justify-center">
                                                                         <Icon name="star" className="text-lg text-yellow-400 drop-shadow-sm" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    
                                                    return (
                                                        <div key={s} className="w-[18px] h-[18px] flex items-center justify-center">
                                                            <Icon 
                                                                name="star" 
                                                                className={`text-lg ${isFull ? "text-yellow-400 drop-shadow-sm" : "text-slate-200 dark:text-white/10"}`} 
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                         </div>
                                    </div>
                                    <span className={`text-2xl font-bold ${getScoreColor(score.score10)}`}>{score.score10}</span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-white/70 mt-2 pl-1 border-l-2 border-slate-300 dark:border-white/10 italic">
                                    "{score.text}"
                                </p>
                             </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};
