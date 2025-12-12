import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse, ActivityType } from '../types';
import { Icon } from '../components/Icon';
import { fetchForecast, mapWmoCodeToIcon, mapWmoCodeToText, convertTemp, convertWind, convertPrecip, getWindDirection, calculateMoonPhase, getMoonPhaseText } from '../services/weatherService';
import { loadCurrentLocation } from '../services/storageService';
import { WeatherBackground } from '../components/WeatherBackground';
import { getTranslation } from '../services/translations';
import { calculateActivityScore } from '../services/activityService';

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

  useEffect(() => {
    const loadWeather = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await fetchForecast(location.lat, location.lon);
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
    if (selectedDayIndex !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [selectedDayIndex]);

  const currentTemp = weatherData ? convertTemp(weatherData.current.temperature_2m, settings.tempUnit) : 0;
  const highTemp = weatherData ? convertTemp(weatherData.daily.temperature_2m_max[0], settings.tempUnit) : 0;
  const lowTemp = weatherData ? convertTemp(weatherData.daily.temperature_2m_min[0], settings.tempUnit) : 0;

  const getDailyForecast = () => {
      if (!weatherData) return [];
      return weatherData.daily.time.map((ts, i) => {
          const date = new Date(ts);
          const dayName = i === 0 ? t('today') : i === 1 ? t('tomorrow') : date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long' });
          const code = weatherData.daily.weather_code[i];
          const min = convertTemp(weatherData.daily.temperature_2m_min[i], settings.tempUnit);
          const max = convertTemp(weatherData.daily.temperature_2m_max[i], settings.tempUnit);
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

          // Activity Scores
          const activityData = {
              tempFeelsLike: weatherData.daily.apparent_temperature_max?.[i] || weatherData.daily.temperature_2m_max[i],
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
          const activityScores = activities.map(act => ({
              type: act,
              ...calculateActivityScore(activityData, act)
          }));

          let color = 'from-yellow-400 to-amber-400';

          return {
              day: dayName.charAt(0).toUpperCase() + dayName.slice(1),
              icon: mapWmoCodeToIcon(code),
              min,
              max,
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

  return (
    <div className="relative min-h-screen flex flex-col pb-20 overflow-y-auto overflow-x-hidden text-slate-800 dark:text-white bg-slate-50 dark:bg-background-dark transition-colors duration-300">
      
      {weatherData && (
        <div className="hidden dark:block absolute inset-0 z-0">
            <WeatherBackground 
                weatherCode={weatherData.current.weather_code} 
                isDay={weatherData.current.is_day} 
            />
        </div>
      )}

      <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/10 to-background-dark/90 z-0 pointer-events-none hidden dark:block" />
      
      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Header (Same as Ensemble) */}
        <div className="flex flex-col pt-8 pb-4">
            <div className="flex items-center justify-center relative px-4 mb-2">
                <button onClick={() => onNavigate(ViewState.CURRENT)} className="absolute left-6 text-slate-400 dark:text-white/60 hover:text-slate-800 dark:hover:text-white transition-colors p-2">
                    <Icon name="arrow_back_ios_new" />
                </button>
                <div className="flex flex-col items-center">
                    <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-md dark:drop-shadow-md text-slate-800 dark:text-white">
                        <Icon name="location_on" className="text-primary" />
                        {location.name}, {location.country}
                    </h2>
                </div>
                <div className="absolute right-6">
                     <button
                        onClick={() => onNavigate(ViewState.COUNTRY_MAP)}
                        className="p-2 text-slate-400 dark:text-white/60 hover:text-slate-800 dark:hover:text-white transition-colors"
                        aria-label="Country Map"
                    >
                         <Icon name="public" className="text-2xl" />
                    </button>
                </div> 
            </div>

            {/* Favorite Cities Selector */}
            <div className="w-full overflow-x-auto scrollbar-hide pl-4 mt-2">
                <div className="flex gap-3 pr-4">
                    <button 
                         onClick={() => {
                             const geo = navigator.geolocation;
                             if (geo) {
                                 setLoading(true);
                                 geo.getCurrentPosition((pos) => {
                                     setLocation({name: t('my_location'), country: "", lat: pos.coords.latitude, lon: pos.coords.longitude});
                                     setLoading(false);
                                 }, () => setLoading(false));
                             }
                         }}
                         className="flex items-center gap-1 px-4 py-2 rounded-full bg-white/60 dark:bg-white/10 hover:bg-white dark:hover:bg-primary/20 text-slate-800 dark:text-white hover:text-primary dark:hover:text-primary transition-colors border border-slate-200 dark:border-white/5 whitespace-nowrap backdrop-blur-md shadow-sm"
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
            <div className="flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in duration-500 text-slate-800 dark:text-white">
                <div className="flex items-center gap-4">
                    <h1 className="text-[80px] font-bold leading-none tracking-tighter drop-shadow-2xl font-display">
                        {currentTemp}°
                    </h1>
                </div>
                <p className="text-xl font-medium tracking-wide drop-shadow-md mt-2 flex items-center gap-2">
                        <Icon name={mapWmoCodeToIcon(weatherData.current.weather_code, weatherData.current.is_day === 0)} className="text-2xl" />
                    {mapWmoCodeToText(weatherData.current.weather_code, settings.language)}
                </p>
                <p className="text-slate-500 dark:text-white/80 text-base font-normal drop-shadow-md mt-1">
                    H:{highTemp}° L:{lowTemp}°
                </p>
            </div>
        )}

        {/* Forecast Content */}
        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-2xl rounded-t-[40px] border-t border-slate-200 dark:border-white/10 p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom duration-500 text-slate-800 dark:text-white transition-colors min-h-[60vh]">
            
            {/* Daily Forecast List */}
            <div className="flex flex-col gap-1 mb-8">
                <div className="flex justify-between items-center px-1 mb-2">
                    <h3 className="text-slate-500 dark:text-white/60 text-xs font-bold uppercase tracking-wider">
                        {t('next_days')}
                    </h3>
                </div>
                
                <div className="flex flex-col gap-2">
                    {dailyForecast.map((d, i) => (
                        <div key={i} onClick={() => setSelectedDayIndex(i)} className="flex flex-col p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300 cursor-pointer">
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-3 w-1/4">
                                    <div className="size-10 rounded-full bg-white dark:bg-white/10 flex items-center justify-center">
                                        <Icon name={d.icon} className={`text-xl ${i===0 ? 'text-primary' : 'text-slate-600 dark:text-white'}`} />
                                    </div>
                                    <p className="font-medium">{d.day}</p>
                                </div>
                                
                                <div className="flex-1 flex items-center gap-1 px-2">
                                    <span className="text-slate-500 dark:text-white/60 text-xs font-medium text-right min-w-[24px]">{d.min}°</span>
                                    <div className="h-2 flex-1 mx-2 bg-slate-300 dark:bg-black/40 rounded-full overflow-hidden relative">
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

                            <div className="flex flex-row justify-between items-center gap-1 mt-2 pt-2 border-t border-slate-200 dark:border-white/5 overflow-x-auto scrollbar-hide">
                                {d.activityScores.filter(s => settings.enabledActivities?.[s.type] !== false).map(score => (
                                    <div key={score.type} className="flex flex-col items-center justify-center gap-0.5 group relative cursor-help min-w-[24px]">
                                         <Icon name={getActivityIcon(score.type)} className={`text-lg ${getScoreColor(score.score10)}`} />
                                         <span className={`text-[10px] font-bold ${getScoreColor(score.score10)}`}>{score.score10}</span>
                                         <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                                             {t(`activity.${score.type}`)}: {score.text}
                                         </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
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
                    <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="thermostat" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('temp')}</p>
                            <p className="text-sm font-bold">{convertTemp(weatherData.daily.temperature_2m_min[selectedDayIndex], settings.tempUnit)}° / {convertTemp(weatherData.daily.temperature_2m_max[selectedDayIndex], settings.tempUnit)}°</p>
                        </div>
                    </div>
                    <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="umbrella" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('precip')}</p>
                            <p className="text-sm font-bold">{convertPrecip(weatherData.daily.precipitation_sum?.[selectedDayIndex], settings.precipUnit)} {settings.precipUnit}</p>
                        </div>
                    </div>
                    <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="umbrella" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('precip_prob')}</p>
                            <p className="text-sm font-bold">{weatherData.daily.precipitation_probability_max?.[selectedDayIndex] ?? 0}%</p>
                        </div>
                    </div>

                    <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="wb_sunny" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('uv_max')}</p>
                            <p className="text-sm font-bold">{weatherData.daily.uv_index_max?.[selectedDayIndex] ?? t('no_data_available')}</p>
                        </div>
                    </div>
                    <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="timelapse" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('sunshine')}</p>
                            <p className="text-sm font-bold">{formatHMSFromSeconds(weatherData.daily.sunshine_duration?.[selectedDayIndex]) ?? t('no_data_available')}</p>
                        </div>
                    </div>
                    <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="wb_twilight" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('daylight')}</p>
                            <p className="text-sm font-bold">{formatHMSFromSeconds(weatherData.daily.daylight_duration?.[selectedDayIndex]) ?? t('no_data_available')}</p>
                        </div>
                    </div>

                    <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="air" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('wind_gusts')}</p>
                            <p className="text-sm font-bold">{convertWind(weatherData.daily.wind_gusts_10m_max?.[selectedDayIndex] ?? 0, settings.windUnit)} {settings.windUnit}</p>
                        </div>
                    </div>
                    <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="air" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('wind')}</p>
                            <p className="text-sm font-bold">{(() => {
                                const v = getDayAverage('wind_speed_10m', selectedDayIndex);
                                return v !== null ? `${convertWind(v, settings.windUnit)} ${settings.windUnit}` : t('no_data_available');
                            })()}</p>
                        </div>
                    </div>

                    <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                        <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="humidity_percentage" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('humidity')}</p>
                            <p className="text-sm font-bold">{(() => {
                                const v = getDayAverage('relative_humidity_2m', selectedDayIndex);
                                return v !== null ? `${Math.round(v)}%` : t('no_data_available');
                            })()}</p>
                        </div>
                    </div>
                    <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
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
                    <h4 className="text-sm font-bold uppercase text-slate-500 dark:text-white/60 mb-3">Activiteiten</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {dailyForecast[selectedDayIndex].activityScores.map(score => (
                             <div key={score.type} className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 border border-slate-200 dark:border-white/5">
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
