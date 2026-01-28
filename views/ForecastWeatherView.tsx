import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse, ActivityType } from '../types';
import { Icon } from '../components/Icon';
import { fetchHolidaysSmart, Holiday, fetchForecast, mapWmoCodeToIcon, mapWmoCodeToText, getActivityIcon, getScoreColor, convertTemp, convertWind, convertPrecip, getWindDirection, calculateMoonPhase, getMoonPhaseText, calculateHeatIndex, calculateDewPoint, calculateComfortScore, ComfortScore, calculateSolarOutput } from '../services/weatherService';
import { loadCurrentLocation, saveCurrentLocation, loadForecastActivitiesMode, saveForecastActivitiesMode, loadForecastViewMode, saveForecastViewMode, loadForecastTrendArrowsMode, saveForecastTrendArrowsMode, ForecastViewMode, loadEnsembleModel } from '../services/storageService';
import { StaticWeatherBackground } from '../components/StaticWeatherBackground';
import { Modal } from '../components/Modal';
import { FeelsLikeInfoModal } from '../components/FeelsLikeInfoModal';
import { ComfortScoreModal } from '../components/ComfortScoreModal';
import { YrInteractiveMap } from '../components/YrInteractiveMap';
import { getTranslation } from '../services/translations';
import { reverseGeocode } from '../services/geoService';
import { calculateActivityScore } from '../services/activityService';
import { BaroWeatherReport } from '../components/BaroWeatherReport';
import { CreditFloatingButton } from '../components/CreditFloatingButton';
import { WeatherRatingButton } from '../components/WeatherRatingButton';
import { useLocationSwipe } from '../hooks/useLocationSwipe';
import { useThemeColors } from '../hooks/useThemeColors';
import { SolarPowerWidget } from '../components/SolarPowerWidget';
import { ComposedChart, Line, Bar, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine, ReferenceArea } from 'recharts';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
  isLimitReached?: boolean;
}

export const ForecastWeatherView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings, isLimitReached = false }) => {
  const colors = useThemeColors();
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [showMapModal, setShowMapModal] = useState(false);
  const [weatherData, setWeatherData] = useState<OpenMeteoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [visibleDays, setVisibleDays] = useState<number>(3);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [showComfortModal, setShowComfortModal] = useState(false);
  const [showFeelsLikeModal, setShowFeelsLikeModal] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  useEffect(() => {
      const loadHolidays = async () => {
          const countryCode = location.country || settings.countryCode || 'NL';
          const h = await fetchHolidaysSmart(countryCode);
          setHolidays(h);
      };
      loadHolidays();
  }, [location.country, settings.countryCode]);

  const t = (key: string) => getTranslation(key, settings.language);

  const formatDateTime = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
    };
    return now.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-US', options);
  };

  const cycleFavorite = (direction: 'next' | 'prev') => {
      if (settings.favorites.length === 0) return;
      const currentIndex = settings.favorites.findIndex(f => f.name === location.name);
      let nextIndex = 0;
      if (currentIndex === -1) {
          nextIndex = 0;
      } else {
          if (direction === 'next') {
              nextIndex = (currentIndex + 1) % settings.favorites.length;
          } else {
              nextIndex = (currentIndex - 1 + settings.favorites.length) % settings.favorites.length;
          }
      }
      setLocation(settings.favorites[nextIndex]);
  };

  useLocationSwipe({
      onSwipeLeft: () => cycleFavorite('next'),
      onSwipeRight: () => cycleFavorite('prev'),
  });

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
        const activeBtn = scrollContainerRef.current.querySelector('[data-active="true"]');
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
  }, [location]);

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
    if ((viewMode === 'graph' || viewMode === 'graph2' || viewMode === 'table2') && visibleDays < 7) {
        setVisibleDays(7);
    }
  }, [viewMode]);

  useEffect(() => {
    if (isMobile && viewMode === 'graph2') {
        setViewMode('graph');
    }
    if (isMobile && viewMode === 'table2') {
        setViewMode('table');
    }
  }, [isMobile, viewMode]);

  const expandedMode = viewMode === 'expanded';


  const getDailyForecast = () => {
      if (!weatherData) return [];
      
      const getLocale = (lang: string) => {
        switch (lang) {
            case 'nl': return 'nl-NL';
            case 'de': return 'de-DE';
            case 'fr': return 'fr-FR';
            case 'es': return 'es-ES';
            default: return 'en-GB';
        }
      };

      return weatherData.daily.time.map((ts, i) => {
          const date = new Date(ts);
          const locale = getLocale(settings.language);
          let dayName = i === 0 ? t('today') : i === 1 ? t('tomorrow') : date.toLocaleDateString(locale, { weekday: 'long' });
          
          if (i > 0) {
             const dayMonth = date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
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
              // Extract hourly precip for this day
              // weatherData.hourly.precipitation is a flat array. 
              // We need indices for this day.
              const hourlyPrecip = hourlyIndices.map(idx => weatherData.hourly.precipitation[idx] || 0);

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
                  precip24h,
                  hourlyPrecip // Pass the hourly precip array
              };

              const activities: ActivityType[] = ['bbq', 'cycling', 'walking', 'sailing', 'running', 'beach', 'gardening', 'stargazing', 'golf', 'padel', 'field_sports', 'tennis'];
              activityScores = activities.map(act => ({
                  type: act,
                  ...calculateActivityScore(activityData, act, settings.language)
              }));
          }

          // Calculate Comfort Score
          const comfort = calculateComfortScore({
              apparent_temperature: feelsLikeRaw,
              temperature_2m: weatherData.daily.temperature_2m_max[i],
              wind_speed_10m: weatherData.daily.wind_speed_10m_max?.[i] || 0,
              relative_humidity_2m: humidity,
              precipitation_sum: precip,
              cloud_cover: cloudCover,
              precipitation_probability: weatherData.daily.precipitation_probability_max?.[i],
              weather_code: code,
              wind_gusts_10m: weatherData.daily.wind_gusts_10m_max?.[i] || 0,
              uv_index: weatherData.daily.uv_index_max?.[i] || 0
          });

          // Day part icons
          const getIconForHour = (hour: number) => {
              const targetTime = `${ts}T${hour.toString().padStart(2, '0')}:00`;
              const idx = weatherData.hourly.time.indexOf(targetTime);
              if (idx !== -1) {
                  return mapWmoCodeToIcon(weatherData.hourly.weather_code[idx]);
              }
              return mapWmoCodeToIcon(code);
          };

          const dayParts = {
              night: getIconForHour(3),
              morning: getIconForHour(9),
              afternoon: getIconForHour(15),
              evening: getIconForHour(21)
          };

          let color = 'from-yellow-400 to-amber-400';

          // Find holiday
          const dateStr = date.toISOString().split('T')[0];
          const holiday = holidays.find(h => h.date === dateStr);

          // Solar calculation
          const mjValue = weatherData.daily.shortwave_radiation_sum?.[i] || 0;
          const solar = settings.enableSolar && (settings.solarPowerWp || 0) > 0 
            ? calculateSolarOutput(mjValue, settings.solarPowerWp || 0)
            : null;

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
              windDirRaw,
              activityScores,
              comfort,
              dayParts,
              holiday,
              solar,
              mjValue
          };
      });
  };

  const allDaysForecast = getDailyForecast();
  const dailyForecast = allDaysForecast.slice(0, visibleDays);
  const maxMj = Math.max(...allDaysForecast.map(d => d.mjValue), 1);
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

  const getIconColorClass = (iconName: string) => {
      if (iconName === 'wb_sunny' || iconName === 'clear_day') return 'text-yellow-500';
      if (iconName.includes('partly_cloudy')) return 'text-yellow-500'; 
      if (iconName === 'cloud' || iconName === 'cloud_queue') return 'text-gray-400';
      if (iconName.includes('rain') || iconName.includes('water')) return 'text-blue-500';
      if (iconName.includes('snow') || iconName.includes('ac_unit')) return 'text-sky-300';
      if (iconName.includes('thunder')) return 'text-purple-500';
      if (iconName.includes('fog') || iconName.includes('mist')) return 'text-slate-400';
      return 'text-text-main';
  };

  const CustomTopTick = ({ x, y, payload }: any) => {
      const data = graphData[payload.index];
      if (!data) return null;
      return (
          <g transform={`translate(${x},${y})`}>
               <foreignObject x={-15} y={-70} width={30} height={22}>
                    <button
                        onClick={() => setShowComfortModal(true)}
                        className={`flex justify-center items-center h-full w-full rounded-lg text-sm font-bold shadow-sm ${data.comfort.colorClass} hover:opacity-80 transition-opacity cursor-pointer`}
                    >
                        {data.comfort.score}
                    </button>
               </foreignObject>
               <foreignObject x={-15} y={-45} width={30} height={30}>
                   <div className="flex justify-center items-center h-full w-full relative">
                       <Icon name={data.icon} className={`text-2xl ${getIconColorClass(data.icon)}`} />
                       {data.holiday && (
                           <div className="absolute -top-1 -right-1 bg-accent-primary rounded-full p-[2px] shadow-sm border border-bg-page flex items-center justify-center">
                              <Icon name="celebration" className="text-[8px] text-white" />
                           </div>
                       )}
                   </div>
               </foreignObject>
               <text x={0} y={-5} textAnchor="middle" fill={colors.textMuted} fontSize={10} className="font-bold uppercase">
                   {data.dayShort}
               </text>
          </g>
      );
  };

  const CustomTopTickGraph2 = ({ x, y, payload }: any) => {
       const data = graphData[payload.index];
       if (!data) return null;
       return (
           <g transform={`translate(${x},${y})`}>
                <text x={5} y={-5} textAnchor="start" fill={colors.textMuted} fontSize={12} className="font-bold uppercase" transform="rotate(-45)">
                    {data.dayShort}
                </text>
           </g>
       );
   };

  const CustomGraph2Dot = (props: any) => {
      const { cx, cy, payload } = props;
      const data = payload;
      if (!data) return null;
      
      return (
          <g transform={`translate(${cx},${cy})`}>
              <circle cx={0} cy={0} r={18} fill={colors.bgCard} stroke={colors.borderColor} strokeWidth={1} />
              <foreignObject x={-12} y={-12} width={24} height={24}>
                   <div className="flex justify-center items-center h-full w-full">
                       <Icon name={data.icon} className={`text-xl ${getIconColorClass(data.icon)}`} />
                   </div>
              </foreignObject>
          </g>
      );
  };

  const CustomBottomTickGraph2 = ({ x, y, payload }: any) => {
       const data = graphData[payload.index];
       if (!data) return null;
       return (
           <g transform={`translate(${x},${y})`}>
               <circle cx={0} cy={15} r={12} fill={colors.bgCard} stroke={colors.borderColor || '#e2e8f0'} strokeWidth={1} />
               <text x={0} y={19} textAnchor="middle" fontSize={10} fontWeight="bold" fill={colors.textMain}>{data.windMax}</text>
               <g transform={`translate(0, 15) rotate(${data.windDirRaw})`}>
                    <path d="M0,-12 L-4,-18 L4,-18 Z" fill={colors.textMain} /> 
               </g>
               <text x={0} y={40} textAnchor="middle" fill={colors.textMuted} fontSize={10} className="uppercase">
                   {data.windDir}
               </text>
           </g>
       );
   };

   const CustomBottomTick = ({ x, y, payload }: any) => {
      const data = graphData[payload.index];
      if (!data) return null;
      return (
          <g transform={`translate(${x},${y})`}>
              <text x={0} y={15} textAnchor="middle" fill={colors.textMuted} fontSize={10} className="font-bold">
                   {data.windMax}
              </text>
               <text x={0} y={28} textAnchor="middle" fill={colors.textMuted} fontSize={10}>
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

  const getWeekendAreas = () => {
      const areas = [];
      for (let i = 0; i < graphData.length; i++) {
          const d = graphData[i];
          // weatherData.daily.time[i] is available.
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

  const currentComfort = weatherData ? calculateComfortScore({
      apparent_temperature: weatherData.current.apparent_temperature,
      temperature_2m: weatherData.current.temperature_2m,
      wind_speed_10m: weatherData.current.wind_speed_10m,
      relative_humidity_2m: weatherData.current.relative_humidity_2m,
      precipitation_sum: weatherData.daily.precipitation_sum[0] || 0,
      cloud_cover: weatherData.current.cloud_cover,
      precipitation_probability: weatherData.daily.precipitation_probability_max?.[0] || 0,
      weather_code: weatherData.current.weather_code,
      wind_gusts_10m: weatherData.current.wind_gusts_10m,
      uv_index: weatherData.daily.uv_index_max?.[0] || 0
  }) : null;

  return (
    <div className="relative min-h-screen flex flex-col pb-20 overflow-y-auto overflow-x-hidden text-text-main bg-bg-page transition-colors duration-300">
      
      {error && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white px-6 py-3 rounded-full shadow-lg backdrop-blur-md animate-bounce">
            <div className="flex items-center gap-2">
                <Icon name="error_outline" />
                <span className="font-medium">{error}</span>
            </div>
        </div>
      )}

      {weatherData && (
        <div className="absolute top-0 left-0 right-0 h-[80vh] z-0 overflow-hidden rounded-b-[3rem]">
            <StaticWeatherBackground 
                weatherCode={weatherData.current.weather_code} 
                isDay={weatherData.current.is_day}
                cloudCover={weatherData.current.cloud_cover}
                className="absolute inset-0 w-full h-full"
            />
        </div>
      )}

      <CreditFloatingButton onNavigate={onNavigate} settings={settings} />

      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent dark:from-black/60 dark:via-black/5 dark:to-bg-page/90 z-0 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Header */}
        <div className="flex flex-col pt-8 pb-4">
            <div className="flex items-center justify-center relative px-4 mb-2">
                <button onClick={() => cycleFavorite('prev')} className="absolute left-4 p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/40 transition-all shadow-sm disabled:opacity-0" disabled={settings.favorites.length === 0}>
                    <Icon name="chevron_left" className="text-3xl" />
                </button>

                <div className="flex flex-col items-center bg-black/20 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-lg">
                    <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-xl text-white">
                        <span className="md:hidden">{location.name.length > 15 ? location.name.slice(0, 15) + '...' : location.name}</span>
                        <span className="hidden md:inline">{location.name}, {location.country}</span>
                    </h2>
                </div>

                <button onClick={() => cycleFavorite('next')} className="absolute right-4 p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/40 transition-all shadow-sm disabled:opacity-0" disabled={settings.favorites.length === 0}>
                    <Icon name="chevron_right" className="text-3xl" />
                </button>
            </div>

            {/* Favorite Cities Selector */}
            <div className="w-full overflow-x-auto scrollbar-hide pl-4 mt-2 transition-colors duration-300" ref={scrollContainerRef}>
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
                        data-active={location.isCurrentLocation}
                        className={`flex items-center gap-1 px-4 py-2 rounded-full whitespace-nowrap backdrop-blur-md shadow-sm transition-colors border ${
                            location.isCurrentLocation 
                                ? 'bg-accent-primary text-text-inverse font-bold border-accent-primary shadow-md' 
                                : 'bg-bg-card/60 text-text-main hover:bg-bg-card hover:text-accent-primary border-border-color'
                        }`}
                    >
                        <Icon name="my_location" className="text-sm" />
                        <span className="text-sm font-medium">{t('my_location')}</span>
                    </button>
                    {settings.favorites.map((fav, i) => {
                        const isActive = !location.isCurrentLocation && 
                                        location.name === fav.name && 
                                        Math.abs(location.lat - fav.lat) < 0.01 && 
                                        Math.abs(location.lon - fav.lon) < 0.01;
                        return (
                            <button 
                                key={i}
                                data-active={isActive}
                                onClick={() => setLocation(fav)}
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border backdrop-blur-md shadow-sm ${
                                    isActive 
                                        ? 'bg-accent-primary text-text-inverse font-bold border-accent-primary shadow-md' 
                                        : 'bg-bg-card/60 text-text-main hover:bg-bg-card border-border-color'
                                }`}
                            >
                                {fav.name}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* Current Weather Display (Same as Ensemble) */}
        {weatherData && (
            <div key={location.name} className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in duration-500 text-white">
                <div className="flex items-center gap-4">
                    <div className="bg-black/20 backdrop-blur-md px-6 py-2 rounded-3xl border border-white/10 shadow-lg">
                        <h1 className="text-[80px] font-bold leading-none tracking-tighter drop-shadow-2xl font-display text-white">
                            {currentTemp}°
                        </h1>
                    </div>
                    
                    <div className="flex gap-3">
                        {feelsLike < 10 ? (
                            <div onClick={() => setShowFeelsLikeModal(true)} className="flex flex-col items-center justify-center bg-bg-card backdrop-blur-md rounded-xl p-2 border border-border-color shadow-sm min-w-[70px] h-[100px] cursor-pointer hover:scale-105 transition-transform">
                                <Icon name="thermostat" className="text-xl text-blue-500 dark:text-blue-300" />
                                <span className="text-lg font-bold text-text-main">{Math.round(feelsLike)}°</span>
                                <span className="text-[9px] uppercase text-text-muted">{t('feels_like')}</span>
                            </div>
                        ) : (
                            heatIndex > currentTemp && (
                                <div onClick={() => setShowFeelsLikeModal(true)} className="flex flex-col items-center justify-center bg-bg-card backdrop-blur-md rounded-xl p-2 border border-border-color shadow-sm min-w-[70px] h-[100px] cursor-pointer hover:scale-105 transition-transform">
                                    <Icon name="thermostat" className="text-xl text-orange-500 dark:text-orange-300" />
                                    <span className="text-lg font-bold text-text-main">{Math.round(heatIndex)}°</span>
                                    <span className="text-[9px] uppercase text-text-muted">{t('heat_index')}</span>
                                </div>
                            )
                        )}
                        {currentComfort && (
                            <WeatherRatingButton 
                                score={currentComfort} 
                                onClick={() => setShowComfortModal(true)} 
                                className="min-w-[70px] w-auto"
                            />
                        )}
                        <div onClick={() => setShowMapModal(true)} className="flex flex-col items-center justify-center bg-bg-card backdrop-blur-md rounded-xl p-2 border border-border-color shadow-sm min-w-[70px] h-[100px] cursor-pointer hover:scale-105 transition-transform">
                             <Icon name="public" className="text-3xl text-green-500 dark:text-green-300 mb-1" />
                             <span className="text-[9px] font-bold uppercase text-text-muted text-center leading-tight">Interactieve<br/>Kaart</span>
                        </div>
                    </div>
                </div>
                <div 
                    onClick={() => onNavigate(ViewState.IMMERSIVE_FORECAST)}
                    className="bg-black/20 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/10 shadow-lg mt-4 flex flex-col items-center cursor-pointer hover:bg-black/30 transition-colors hover:scale-105 transform duration-300"
                >
                    <p className="text-xl font-medium tracking-wide drop-shadow-md flex items-center gap-2 text-white">
                            <Icon name={mapWmoCodeToIcon(weatherData.current.weather_code, weatherData.current.is_day === 0)} className="text-2xl" />
                        {mapWmoCodeToText(weatherData.current.weather_code, settings.language)}
                    </p>
                    <p className="text-white/80 text-base font-normal drop-shadow-md mt-1">
                        H:{highTemp}° L:{lowTemp}° <span className="text-xs opacity-70 ml-1">(48u)</span>
                    </p>
                    <p className="text-white/60 text-sm mt-2 font-normal drop-shadow-md">
                        {formatDateTime()}
                    </p>
                </div>
            </div>
        )}

        {/* Forecast Content */}
        <div className="bg-bg-card/90 backdrop-blur-2xl rounded-t-[40px] border-t border-border-color p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom duration-500 text-text-main transition-colors min-h-[60vh]">
            
            {/* AI Report Section */}
            {weatherData && (
                <BaroWeatherReport weatherData={weatherData} profile={settings.baroProfile} profiles={settings.baroProfiles} onNavigate={onNavigate} language={settings.language} isLimitReached={isLimitReached} />
            )}

            {/* Daily Forecast List */}
            <div className="flex flex-col gap-1 mb-8">
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center px-1 mb-4 gap-3 sm:gap-2">
                    <h3 className="text-text-muted text-xs font-bold uppercase tracking-wider">
                        {t('next_days')}
                    </h3>
                    <div className="flex flex-wrap gap-2 items-center justify-start sm:justify-end">
                        {expandedMode && (
                            <div className="flex items-center gap-2 bg-bg-page rounded-lg p-1 flex-grow sm:flex-grow-0">
                                <span className="text-[10px] font-medium text-text-muted ml-1">Activiteiten</span>
                                <div className="flex bg-bg-card rounded-md p-0.5 text-[10px] flex-grow sm:flex-grow-0">
                                    <button
                                        type="button"
                                        onClick={() => setActivitiesMode('none')}
                                        className={`flex-1 sm:flex-none px-2 py-1 rounded-md font-medium transition-colors ${
                                            activitiesMode === 'none'
                                                ? 'bg-border-color text-text-main shadow-sm'
                                                : 'text-text-muted hover:bg-bg-page'
                                        }`}
                                    >
                                        Uit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActivitiesMode('positive')}
                                        className={`flex-1 sm:flex-none px-2 py-1 rounded-md font-medium transition-colors ${
                                            activitiesMode === 'positive'
                                                ? 'bg-border-color text-text-main shadow-sm'
                                                : 'text-text-muted hover:bg-bg-page'
                                        }`}
                                    >
                                        7+
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActivitiesMode('all')}
                                        className={`flex-1 sm:flex-none px-2 py-1 rounded-md font-medium transition-colors ${
                                            activitiesMode === 'all'
                                                ? 'bg-border-color text-text-main shadow-sm'
                                                : 'text-text-muted hover:bg-bg-page'
                                        }`}
                                    >
                                        Alle
                                    </button>
                                </div>
                            </div>
                        )}
                        {viewMode === 'compact' && (
                            <label className="flex items-center gap-2 cursor-pointer select-none bg-bg-page rounded-lg p-1.5 px-3 h-[34px]">
                                <input 
                                    type="checkbox" 
                                    checked={trendArrows} 
                                    onChange={(e) => setTrendArrows(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <span className="text-xs font-medium text-text-muted">Trend</span>
                            </label>
                        )}
                        
                        <div className="flex bg-bg-page rounded-lg p-1 overflow-hidden flex-grow sm:flex-grow-0 h-[34px]">
                            <button 
                                onClick={() => setViewMode('expanded')}
                                className={`flex-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all whitespace-nowrap ${viewMode === 'expanded' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                            >
                                Uitgebreid
                            </button>
                            <button 
                                onClick={() => setViewMode('compact')}
                                className={`flex-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all whitespace-nowrap ${viewMode === 'compact' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                            >
                                Compact
                            </button>
                             <button  
                                onClick={() => setViewMode('graph')}
                                className={`flex-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all whitespace-nowrap ${viewMode === 'graph' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                            >
                                Grafiek 1
                            </button>
                            {!isMobile && (
                                <button  
                                    onClick={() => setViewMode('graph2')}
                                    className={`flex-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all whitespace-nowrap ${viewMode === 'graph2' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                >
                                    Grafiek 2
                                </button>
                            )}
                             <button  
                                onClick={() => setViewMode('table')}
                                className={`flex-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all whitespace-nowrap ${viewMode === 'table' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                            >
                                Tabel 1
                            </button>
                            {!isMobile && (
                                <button  
                                    onClick={() => setViewMode('table2')}
                                    className={`flex-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium transition-all whitespace-nowrap ${viewMode === 'table2' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                >
                                    Tabel 2
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                
                {viewMode === 'table' ? (
                    <div className="flex flex-col w-full mt-4 overflow-x-auto scrollbar-hide">
                        <table className="w-full text-left border-separate border-spacing-y-2 px-1">
                            <thead>
                                <tr className="text-text-muted text-[10px] sm:text-xs uppercase tracking-wider">
                                    <th className="px-2 py-1 font-medium">{t('weather_rating')}</th>
                                    <th className="px-2 py-1 font-medium">{t('day')}</th>
                                    <th className="px-2 py-1 font-medium text-center">{t('night')}</th>
                                    <th className="px-2 py-1 font-medium text-center">{t('morning')}</th>
                                    <th className="px-2 py-1 font-medium text-center">{t('afternoon')}</th>
                                    <th className="px-2 py-1 font-medium text-center">{t('evening')}</th>
                                    <th className="px-2 py-1 font-medium text-center">Temp.</th>
                                    <th className="px-2 py-1 font-medium text-center">{t('precip')}</th>
                                    <th className="px-2 py-1 font-medium text-right">{t('wind')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailyForecast.map((d, i) => (
                                    <tr key={i} onClick={() => setSelectedDayIndex(i)} className="bg-bg-card/50 hover:bg-bg-card rounded-xl transition-colors cursor-pointer group shadow-sm border border-border-color">
                                        <td className="px-2 py-3 first:rounded-l-xl border-y border-l border-border-color/30">
                                            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-bold text-sm sm:text-base shadow-sm ${d.comfort.colorClass}`}>
                                                {d.comfort.score}
                                            </div>
                                        </td>
                                        <td className="px-2 py-3 border-y border-border-color/30">
                                            <div className="flex flex-col">
                                                <span className="text-xs sm:text-sm font-bold text-text-main whitespace-nowrap">{d.day.split(' ')[0]}</span>
                                                <span className="text-[10px] text-text-muted whitespace-nowrap">{d.day.split(' ').slice(1).join(' ')}</span>
                                                {d.holiday && (
                                                    <div className="flex items-center gap-1 mt-0.5 text-accent-primary">
                                                        <Icon name="celebration" className="text-[10px]" />
                                                        <span className="text-[9px] font-medium truncate max-w-[80px]">{d.holiday.localName}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 py-3 text-center border-y border-border-color/30">
                                            <div className="flex justify-center">
                                                <Icon name={d.dayParts.night} className="text-xl sm:text-2xl text-text-main" />
                                            </div>
                                        </td>
                                        <td className="px-2 py-3 text-center border-y border-border-color/30">
                                            <div className="flex justify-center">
                                                <Icon name={d.dayParts.morning} className="text-xl sm:text-2xl text-text-main" />
                                            </div>
                                        </td>
                                        <td className="px-2 py-3 text-center border-y border-border-color/30">
                                            <div className="flex justify-center">
                                                <Icon name={d.dayParts.afternoon} className="text-xl sm:text-2xl text-text-main" />
                                            </div>
                                        </td>
                                        <td className="px-2 py-3 text-center border-y border-border-color/30">
                                            <div className="flex justify-center">
                                                <Icon name={d.dayParts.evening} className="text-xl sm:text-2xl text-text-main" />
                                            </div>
                                        </td>
                                        <td className="px-2 py-3 text-center whitespace-nowrap border-y border-border-color/30">
                                            <div className="flex items-center justify-center gap-1 font-bold text-xs sm:text-sm">
                                                <span className="text-red-500">{Math.round(d.max)}°</span>
                                                <span className="text-text-muted">/</span>
                                                <span className="text-blue-500">{Math.round(d.min)}°</span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-3 text-center whitespace-nowrap border-y border-border-color/30">
                                            {d.precipAmount > 0 ? (
                                                <span className="text-blue-500 text-[10px] sm:text-xs font-bold">{d.precipAmount} {settings.precipUnit}</span>
                                            ) : (
                                                <span className="text-text-muted text-[10px] sm:text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-3 text-right last:rounded-r-xl border-y border-r border-border-color/30 whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <span className="text-xs sm:text-sm font-bold text-text-main">{d.windMax} {settings.windUnit}</span>
                                                <span className="text-[10px] text-text-muted font-medium uppercase">{d.windDir}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        
                        <div className="flex justify-center mt-4">
                             <button 
                                onClick={() => setVisibleDays(visibleDays <= 7 ? 14 : 7)}
                                className="px-4 py-2 bg-bg-page hover:bg-bg-page/80 rounded-full text-xs font-medium transition-colors border border-border-color shadow-sm text-text-muted"
                            >
                                {visibleDays <= 7 ? 'Toon 14 dagen' : 'Toon 7 dagen'}
                            </button>
                        </div>
                    </div>
                ) : viewMode === 'table2' ? (
                    <div className="flex flex-col w-full mt-4">
                        {[0, 7].map((offset) => {
                            if (visibleDays <= 7 && offset > 0) return null;
                            const weekData = graphData.slice(offset, offset + 7);
                            if (weekData.length === 0) return null;

                            const maxTemp = Math.max(...weekData.map(d => d.max));
                            const minTemp = Math.min(...weekData.map(d => d.min));
                            const tempRange = maxTemp - minTemp;
                            
                            return (
                                <div key={offset} className="mb-8">
                                    <h3 className="text-sm font-bold text-text-muted mb-4 px-2">
                                        {offset === 0 ? 'Komende 7 dagen' : 'Week erna'}
                                    </h3>
                                    <div className="bg-bg-card border border-border-color rounded-xl overflow-hidden shadow-sm">
                                        <div className="grid grid-cols-7 divide-x divide-border-color">
                                            {weekData.map((d, i) => (
                                                <div key={i} className="flex flex-col relative group">
                                                    {/* Row 1: Rating */}
                                                    <div className="h-12 flex items-center justify-center border-b border-border-color/50 bg-bg-page/30">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${d.comfort.colorClass}`}>
                                                            {d.comfort.score}
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Date */}
                                                    <div className="h-14 flex flex-col items-center justify-center border-b border-border-color/50 p-1">
                                                        <span className="text-[11px] font-bold text-text-main uppercase">{d.day.split(' ')[0]}</span>
                                                        <span className="text-[10px] text-text-muted">{d.day.split(' ').slice(1).join(' ')}</span>
                                                    </div>

                                                    {/* Row 3: Icon */}
                                                    <div className="h-14 flex items-center justify-center border-b border-border-color/50">
                                                        <Icon name={d.icon} className={`text-2xl ${getIconColorClass(d.icon)}`} />
                                                    </div>

                                                    {/* Row 4: Sun */}
                                                    <div className="h-12 flex flex-col items-center justify-center border-b border-border-color/50 text-[10px]">
                                                        <div className="flex items-center gap-1 text-orange-500">
                                                            <Icon name="wb_sunny" className="text-[10px]" />
                                                            <span className="font-bold">{d.sunshineHours}u</span>
                                                        </div>
                                                        <span className="text-text-muted mt-0.5">UV {Math.round(d.mjValue / 3.6)}</span>
                                                    </div>

                                                    {/* Row 5: Temperature Graph */}
                                                    <div className="h-24 relative border-b border-border-color/50 bg-bg-page/5">
                                                        <div className="absolute inset-0 flex flex-col justify-between py-2 items-center z-10">
                                                            <span className="text-xs font-bold text-red-500">{Math.round(d.max)}°</span>
                                                            <span className="text-xs font-bold text-blue-500">{Math.round(d.min)}°</span>
                                                        </div>
                                                        {/* Visual Representation */}
                                                        <div className="absolute inset-x-0 top-8 bottom-8 mx-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                                                            <div 
                                                                className="absolute w-full bg-red-400/20"
                                                                style={{ 
                                                                    bottom: '50%',
                                                                    height: `${((d.max - minTemp) / (tempRange || 1)) * 50}%`
                                                                }}
                                                            />
                                                            <div 
                                                                className="absolute w-full bg-blue-400/20"
                                                                style={{ 
                                                                    top: '50%',
                                                                    height: `${((maxTemp - d.min) / (tempRange || 1)) * 50}%`
                                                                }}
                                                            />
                                                            {/* Actual bar */}
                                                            <div 
                                                                className="absolute w-full bg-gradient-to-b from-red-400 to-blue-400 opacity-50"
                                                                style={{ 
                                                                    bottom: `${((d.min - minTemp) / (tempRange || 1)) * 100}%`,
                                                                    height: `${((d.max - d.min) / (tempRange || 1)) * 100}%`
                                                                }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Row 6: Precip */}
                                                    <div className="h-20 flex flex-col items-center justify-end pb-2 border-b border-border-color/50 relative overflow-hidden">
                                                        <div className="z-10 flex flex-col items-center text-[10px] mb-1">
                                                            <div className="flex items-center gap-0.5 text-blue-500 font-bold">
                                                                <Icon name="water_drop" className="text-[8px]" />
                                                                <span>{Math.round(d.precipProb)}%</span>
                                                            </div>
                                                            <span className="text-text-main">{d.precipAmount}mm</span>
                                                        </div>
                                                        {/* Blue wave fill */}
                                                        <div 
                                                            className="absolute bottom-0 left-0 right-0 bg-blue-500/20 transition-all duration-500"
                                                            style={{ height: `${Math.min(100, d.precip * 5)}%` }}
                                                        />
                                                        <div 
                                                            className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500/40"
                                                            style={{ opacity: d.precip > 0 ? 1 : 0 }}
                                                        />
                                                    </div>

                                                    {/* Row 7: Wind */}
                                                    <div className="h-12 flex items-center justify-center bg-bg-page/30 cursor-pointer hover:bg-bg-page/50 transition-colors">
                                                        <div className="flex items-center gap-1">
                                                            <div 
                                                                className="w-5 h-5 rounded-full border border-text-muted flex items-center justify-center"
                                                                style={{ transform: `rotate(${d.windDirRaw}deg)` }}
                                                            >
                                                                <Icon name="arrow_upward" className="text-[10px] text-text-main" />
                                                            </div>
                                                            <Icon name="add_circle" className="text-text-muted text-xs opacity-50" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        
                        <div className="flex justify-center mt-4">
                             <button 
                                onClick={() => setVisibleDays(visibleDays <= 7 ? 14 : 7)}
                                className="px-4 py-2 bg-bg-page hover:bg-bg-page/80 rounded-full text-xs font-medium transition-colors border border-border-color shadow-sm text-text-muted"
                            >
                                {visibleDays <= 7 ? 'Toon 14 dagen' : 'Toon 7 dagen'}
                            </button>
                        </div>
                    </div>
                ) : (viewMode === 'graph' || viewMode === 'graph2') ? (
                    <div className="flex flex-col w-full mt-4">
                        <div 
                            className="w-full h-[400px] select-none pr-2 overflow-x-auto scrollbar-hide no-swipe"
                            data-no-swipe="true"
                        >
                            <div className="h-full" style={{ minWidth: visibleDays > 7 ? '800px' : '100%' }}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <ComposedChart data={graphData} margin={{ top: 40, right: 20, left: 20, bottom: 40 }}>
                                        {getWeekendAreas()}
                                        <CartesianGrid strokeDasharray={viewMode === 'graph2' ? "0" : "3 3"} vertical={true} horizontal={false} opacity={0.1} stroke={colors.textMuted} />
                                        <XAxis 
                                            dataKey="day" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={viewMode === 'graph' ? <CustomTopTick /> : <CustomTopTickGraph2 />} 
                                            orientation="top"
                                            interval={0}
                                            height={60}
                                        />
                                        <XAxis 
                                            xAxisId="bottom"
                                            dataKey="day" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={viewMode === 'graph2' ? <CustomBottomTickGraph2 /> : <CustomBottomTick />} 
                                            orientation="bottom"
                                            interval={0}
                                            height={60}
                                        />
                                        <YAxis yAxisId="temp" hide domain={['dataMin - 2', 'dataMax + 2']} />
                                        <YAxis yAxisId="precip" hide domain={[0, 10]} />
                                        
                                        {viewMode === 'graph' && (
                                            <Bar yAxisId="precip" dataKey="visualPrecip" fill="#0ea5e9" barSize={40} radius={[4, 4, 0, 0]} opacity={0.6}>
                                                <LabelList dataKey="precipAmount" position="top" offset={5} fontSize={10} fill="#0ea5e9" formatter={(val: any) => val > 0 ? val : ''} />
                                            </Bar>
                                        )}
                                        
                                        {viewMode === 'graph2' ? (
                                            <Line yAxisId="temp" type="monotone" dataKey="max" stroke={colors.textMain} strokeWidth={2} dot={<CustomGraph2Dot />} isAnimationActive={true}>
                                                 <LabelList dataKey="max" position="top" offset={20} fontSize={14} fontWeight="bold" fill={colors.textMain} formatter={(val: any) => `${Math.round(val)}°`} />
                                            </Line>
                                        ) : (
                                            <>
                                                <Line yAxisId="temp" type="monotone" dataKey="max" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }} isAnimationActive={true}>
                                                     <LabelList dataKey="max" position="top" offset={10} fontSize={12} fontWeight="bold" fill="#ef4444" formatter={(val: any) => `${Math.round(val)}°`} />
                                                </Line>
                                                <Line yAxisId="temp" type="monotone" dataKey="min" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} isAnimationActive={true}>
                                                     <LabelList dataKey="min" position="bottom" offset={10} fontSize={12} fontWeight="bold" fill="#3b82f6" formatter={(val: any) => `${Math.round(val)}°`} />
                                                </Line>
                                            </>
                                        )}
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="flex justify-center mt-4">
                            <button 
                                onClick={() => setVisibleDays(visibleDays <= 7 ? 14 : 7)}
                                className="px-4 py-2 bg-bg-page hover:bg-bg-page/80 rounded-full text-xs font-medium transition-colors border border-border-color shadow-sm text-text-muted"
                            >
                                {visibleDays <= 7 ? 'Toon 14 dagen' : 'Toon 7 dagen'}
                            </button>
                        </div>

                        {visibleDays === 14 && (
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
                            <div key={i} onClick={() => setSelectedDayIndex(i)} className="flex flex-col p-3 bg-bg-page/50 hover:bg-bg-page rounded-xl transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300 cursor-pointer border border-border-color shadow-sm relative overflow-hidden">
                                <div className="flex items-center justify-between w-full gap-2 relative z-10">
                                    <div className="flex items-center gap-3 w-auto min-w-[30%] sm:w-1/4">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowComfortModal(true); }}
                                            className={`flex items-center justify-center w-10 h-10 rounded-xl ${d.comfort.colorClass} shadow-md flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer`}
                                        >
                                            <span className="text-xl font-bold leading-none">{d.comfort.score}</span>
                                        </button>
                                        <div className="size-10 rounded-full bg-bg-card flex items-center justify-center flex-shrink-0">
                                            <Icon name={d.icon} className={`text-xl ${i===0 ? 'text-primary' : 'text-text-main'}`} />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div>
                                                <p className="font-medium flex items-center gap-1 truncate">
                                                    {d.day}
                                                    {d.holiday && <Icon name="celebration" className="text-sm text-accent-primary flex-shrink-0" />}
                                                    {d.feelsLike < 0 && (
                                                        <Icon name="ac_unit" className="text-[14px] text-sky-500 flex-shrink-0" />
                                                    )}
                                                    {d.feelsLike > 25 && (
                                                        <Icon name="whatshot" className="text-[14px] text-orange-500 flex-shrink-0" />
                                                    )}
                                                </p>
                                                {d.holiday && (
                                                    <p className="text-[10px] text-accent-primary font-medium truncate max-w-[150px] -mt-0.5">{d.holiday.localName}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 flex items-center gap-1 px-1 sm:px-2 min-w-0">
                                        <span className="text-text-muted text-xs font-medium text-right min-w-[24px]">{d.min}°</span>
                                        <div className="h-2 flex-1 mx-1 sm:mx-2 bg-border-color rounded-full overflow-hidden relative">
                                            <div className={`absolute h-full rounded-full bg-gradient-to-r ${d.color}`} style={{ left: `${((d.min - tempScaleMin) / tempScaleRange) * 100}%`, width: `${Math.max(2, ((d.max - d.min) / tempScaleRange) * 100)}%` }}></div>
                                        </div>
                                        <span className="font-bold text-sm min-w-[24px]">{d.max}°</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border-color text-xs">
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
                                    <div className="flex items-center justify-center gap-1.5 text-text-muted">
                                        <Icon name="air" className="text-sm" />
                                        <span className="font-medium">{d.windDir} {d.windMax}</span>
                                    </div>
                                </div>

                                {activitiesMode !== 'none' && d.activityScores.length > 0 && (
                                    <div className={`${isMobile ? 'grid grid-cols-6 gap-y-2 place-items-center' : 'flex flex-row justify-between items-center overflow-x-auto scrollbar-hide'} gap-1 mt-2 pt-2 border-t border-border-color`}>
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
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-text-main text-bg-page text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                                                            {t(`activity.${score.type}`)}: {score.text}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}

                                {settings.enableSolar && (settings.solarPowerWp || 0) > 0 && d.solar && (
                                    <div className="mt-2 pt-2 border-t border-border-color">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-[100px]">
                                                <Icon name="solar_power" className="text-orange-500 text-sm" />
                                                <span className="text-[10px] font-bold text-text-muted uppercase tracking-tight">{t('solar.title')}</span>
                                            </div>
                                            <div className="flex-1 h-1.5 bg-border-color rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full transition-all duration-500 ${
                                                        (d.mjValue / maxMj) > 0.8 ? 'bg-green-500' : (d.mjValue / maxMj) < 0.2 ? 'bg-red-500/50' : 'bg-orange-400'
                                                    }`} 
                                                    style={{ width: `${(d.mjValue / maxMj) * 100}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 min-w-[80px] justify-end">
                                                <span className="text-[10px] font-bold text-text-main">{d.solar.label}</span>
                                                <span className="text-[9px] text-text-muted font-medium bg-bg-card px-1.5 py-0.5 rounded border border-border-color">
                                                    Score {d.solar.score}/10
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div key={i} onClick={() => setSelectedDayIndex(i)} className={`flex flex-col p-3 bg-bg-page/50 hover:bg-bg-page rounded-xl transition-all animate-in fade-in zoom-in duration-300 cursor-pointer border h-full justify-between shadow-sm relative overflow-hidden ${
                                trendArrows && trend === 'up' 
                                    ? 'border-red-500/50 dark:border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]' 
                                    : trendArrows && trend === 'down' 
                                        ? 'border-blue-500/50 dark:border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                                        : 'border-border-color'
                            }`}>
                                 <div className="flex items-center justify-between mb-2">
                                     <div className="flex items-center gap-2">
                                         <div className="flex flex-col">
                                             <span className="font-bold text-sm truncate">{d.day.split(' ')[0]}</span>
                                             <span className="text-[10px] text-text-muted whitespace-nowrap">{d.day.split(' ').slice(1).join(' ')}</span>
                                             {d.holiday && (
                                                <div className="flex items-center gap-0.5 text-accent-primary mt-0.5">
                                                     <Icon name="celebration" className="text-[10px]" />
                                                     <span className="text-[9px] truncate max-w-[60px] font-medium">{d.holiday.localName}</span>
                                                </div>
                                             )}
                                         </div>
                                         <div className="flex flex-col items-center">
                                             <button
                                                 onClick={(e) => { e.stopPropagation(); setShowComfortModal(true); }}
                                                 className={`flex items-center justify-center w-8 h-8 rounded-lg ${d.comfort.colorClass} shadow-sm hover:opacity-80 transition-opacity cursor-pointer`}
                                             >
                                                <span className="text-lg font-bold leading-none">{d.comfort.score}</span>
                                             </button>
                                             <span className="text-[9px] text-text-muted mt-0.5">Weercijfer</span>
                                         </div>
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
                                     <Icon name={d.icon} className="text-3xl text-text-main" />
                                     <div className="flex flex-col items-end">
                                         <div className="flex items-center gap-1">
                                             {trendArrows && trend === 'up' && (
                                                 <Icon name="north_east" className="text-xs text-red-500" />
                                             )}
                                             {trendArrows && trend === 'down' && (
                                                 <Icon name="south_east" className="text-xs text-blue-500" />
                                             )}
                                             {trendArrows && trend === 'equal' && (
                                                 <Icon name="east" className="text-xs text-text-muted" />
                                             )}
                                             <span className="font-bold text-xl">{d.max}°</span>
                                         </div>
                                         <span className="text-xs text-text-muted">{d.min}°</span>
                                     </div>
                                 </div>
                                 <div className="grid grid-cols-3 gap-1 text-[10px] text-text-muted mt-auto">
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
                    <button onClick={() => setVisibleDays(visibleDays === 3 ? 7 : visibleDays === 7 ? 16 : 3)} className="px-4 py-2 bg-bg-page hover:bg-bg-page/80 rounded-full text-xs font-medium transition-colors border border-border-color text-text-muted">
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
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedDayIndex(null)} />
            <div className="relative z-[110] w-[95vw] max-w-3xl max-h-[90vh] flex flex-col bg-bg-card rounded-2xl border border-border-color shadow-2xl overflow-hidden">
                
                {/* Comfort Score Banner - Fixed at top */}
                <div className={`shrink-0 p-4 ${dailyForecast[selectedDayIndex].comfort.colorClass} relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-1/4 -translate-y-1/4">
                        <Icon name={mapWmoCodeToIcon(weatherData.daily.weather_code[selectedDayIndex])} className="text-9xl" />
                    </div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setShowComfortModal(true)}
                                className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 shadow-inner hover:bg-white/30 transition-colors cursor-pointer"
                            >
                                <span className="text-4xl font-bold text-white">{Math.round(dailyForecast[selectedDayIndex].comfort.score)}</span>
                            </button>
                            <div>
                                <h3 className="text-2xl font-bold text-white">{t(dailyForecast[selectedDayIndex].comfort.label)}</h3>
                                <p className="text-white/80 font-medium flex items-center gap-1">
                                    {t(dailyForecast[selectedDayIndex].comfort.mainFactor)}
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setSelectedDayIndex(null)}
                            className="p-2 rounded-full bg-black/10 hover:bg-black/20 text-white transition-colors backdrop-blur-md"
                        >
                            <Icon name="close" className="text-xl" />
                        </button>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-5 scrollbar-hide">
                    <div className="sticky top-0 z-[120] bg-bg-card py-4 border-b border-border-color mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                        <Icon name={mapWmoCodeToIcon(weatherData.daily.weather_code[selectedDayIndex])} className="text-3xl text-text-main" />
                        <div>
                            <p className="text-xs font-bold uppercase text-text-muted">{t('details')}</p>
                            <p className="text-lg font-bold">
                                {(() => {
                                    const date = new Date(weatherData.daily.time[selectedDayIndex]);
                                    const locales: Record<string, string> = { nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', en: 'en-GB' };
                                    return date.toLocaleDateString(locales[settings.language] || 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
                                })()}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Hourly Graphs */}
                <div className="mb-6 pb-6 border-b border-border-color">
                    <h4 className="text-sm font-bold uppercase text-text-muted mb-3">Temperatuur (24U)</h4>
                    
                    {/* Temperature Graph */}
                    <div className="h-48 w-full mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart syncId="dayDetails" data={(() => {
                                const idxs = getDayHourlyIndices(selectedDayIndex);
                                const locales: Record<string, string> = { nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', en: 'en-GB' };
                                return idxs.map(i => ({
                                    time: new Date(weatherData.hourly.time[i]).toLocaleTimeString(locales[settings.language] || 'en-GB', { hour: '2-digit', minute: '2-digit' }),
                                    temp: convertTemp(weatherData.hourly.temperature_2m[i], settings.tempUnit),
                                }));
                            })()} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorTempModal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                {(() => {
                                    // Calculate dynamic ticks
                                    const idxs = getDayHourlyIndices(selectedDayIndex);
                                    if (idxs.length === 0) return null;
                                    const vals = idxs.map(i => convertTemp(weatherData.hourly.temperature_2m[i], settings.tempUnit));
                                    const min = Math.floor(Math.min(...vals));
                                    const max = Math.ceil(Math.max(...vals));
                                    const ticks = [];
                                    for (let i = min - 1; i <= max + 1; i++) ticks.push(i);
                                    
                                    return (
                                        <>
                                            {ticks.map(tick => (
                                                <ReferenceLine 
                                                    key={tick} 
                                                    y={tick} 
                                                    stroke={tick % 5 === 0 ? colors.textMuted : colors.borderColor} 
                                                    strokeOpacity={tick % 5 === 0 ? 0.4 : 0.1}
                                                    strokeWidth={tick % 5 === 0 ? 1.5 : 0.5}
                                                />
                                            ))}
                                            <YAxis 
                                            domain={[ticks[0], ticks[ticks.length-1]]} 
                                            ticks={ticks}
                                            interval={0}
                                            width={40}
                                            tick={{ fontSize: 10, fill: colors.textMuted }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => val % 5 === 0 ? val : ''}
                                        />
                                        </>
                                    );
                                })()}
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.borderColor} strokeOpacity={0.5} />
                                <XAxis dataKey="time" tick={{fill: colors.textMuted, fontSize: 10}} axisLine={false} tickLine={false} interval={3} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: colors.bgCard, borderRadius: '8px', border: `1px solid ${colors.borderColor}`, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                    itemStyle={{ color: colors.textMain }}
                                    labelStyle={{ color: colors.textMuted, marginBottom: '0.25rem' }}
                                />
                                <Area type="monotone" dataKey="temp" stroke={colors.accentPrimary} fillOpacity={1} fill="url(#colorTempModal)" strokeWidth={2} name={t('temp')} unit={`°${settings.tempUnit}`} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Rain Graph (Precip Chance Only) */}
                    {(() => {
                         const idxs = getDayHourlyIndices(selectedDayIndex);
                         const locales: Record<string, string> = { nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', en: 'en-GB' };
                         const rainData = idxs.map(i => ({
                             time: new Date(weatherData.hourly.time[i]).toLocaleTimeString(locales[settings.language] || 'en-GB', { hour: '2-digit', minute: '2-digit' }),
                             precip: convertPrecip(weatherData.hourly.precipitation[i], settings.precipUnit),
                             prob: weatherData.hourly.precipitation_probability[i] || 0
                         }));
                         
                         return (
                            <div className="h-32 w-full mb-6">
                                <h5 className="text-xs font-bold uppercase text-blue-500 mb-2 flex items-center gap-1"><Icon name="rainy" className="text-sm" /> {t('precip_prob')}</h5>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart syncId="dayDetails" data={rainData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.borderColor} strokeOpacity={0.5} />
                                        <XAxis dataKey="time" tick={{fill: colors.textMuted, fontSize: 10}} axisLine={false} tickLine={false} interval={3} />
                                        <YAxis 
                                            width={40}
                                            domain={[0, 100]} 
                                            ticks={[0, 25, 50, 75, 100]}
                                            tick={{ fontSize: 10, fill: colors.textMuted }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => `${val}%`}
                                        />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: colors.bgCard, borderRadius: '8px', border: `1px solid ${colors.borderColor}`, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                            itemStyle={{ color: '#0ea5e9' }}
                                            labelStyle={{ color: colors.textMuted, marginBottom: '0.25rem' }}
                                        />
                                        <Line type="monotone" dataKey="prob" stroke="#2563eb" strokeWidth={2} dot={false} name="Kans" unit="%" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                         );
                    })()}

                    {/* Sunshine Graph (Duration/Prob) */}
                    {(() => {
                         const idxs = getDayHourlyIndices(selectedDayIndex);
                         const locales: Record<string, string> = { nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', en: 'en-GB' };
                         const sunData = idxs.map(i => ({
                             time: new Date(weatherData.hourly.time[i]).toLocaleTimeString(locales[settings.language] || 'en-GB', { hour: '2-digit', minute: '2-digit' }),
                             sunProb: Math.min(100, Math.round((weatherData.hourly.sunshine_duration[i] / 3600) * 100))
                         }));
                         
                         return (
                            <div className="h-32 w-full">
                                <h5 className="text-xs font-bold uppercase text-orange-500 mb-2 flex items-center gap-1"><Icon name="wb_sunny" className="text-sm" /> {t('sunshine')} (Kans)</h5>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart syncId="dayDetails" data={sunData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorSunModal" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.borderColor} strokeOpacity={0.5} />
                                        <XAxis dataKey="time" tick={{fill: colors.textMuted, fontSize: 10}} axisLine={false} tickLine={false} interval={3} />
                                        <YAxis 
                                            width={40}
                                            domain={[0, 100]} 
                                            ticks={[0, 25, 50, 75, 100]}
                                            tick={{ fontSize: 10, fill: colors.textMuted }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => `${val}%`}
                                        />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: colors.bgCard, borderRadius: '8px', border: `1px solid ${colors.borderColor}`, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                            itemStyle={{ color: '#f59e0b' }}
                                            labelStyle={{ color: colors.textMuted, marginBottom: '0.25rem' }}
                                        />
                                        <Area type="monotone" dataKey="sunProb" stroke="#f59e0b" fillOpacity={1} fill="url(#colorSunModal)" strokeWidth={2} name={t('sunshine')} unit="%" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                         );
                    })()}
                </div>

                {/* Solar Power Widget */}
                {settings.enableSolar && (() => {
                    const targetDate = new Date(weatherData.daily.time[selectedDayIndex]);
                    const isWithinSolarRange = () => {
                        const now = new Date();
                        const diffTime = targetDate.getTime() - now.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                        return diffDays < 8; // API provides 7 days forecast for solar usually, or ensuring accuracy
                    };
                    
                    if (isWithinSolarRange()) {
                        return (
                            <div className="w-full mt-6 mb-6">
                                <SolarPowerWidget 
                                    weatherData={weatherData} 
                                    settings={settings} 
                                    targetDate={targetDate}
                                    showStats={false}
                                />
                            </div>
                        );
                    }
                    return null;
                })()}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-bg-page rounded-xl p-3 flex items-center gap-3 border border-border-color shadow-sm">
                        <div className="bg-bg-card p-2 rounded-lg"><Icon name="thermostat" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-text-muted">{t('temp')}</p>
                            <p className="text-sm font-bold">{convertTemp(weatherData.daily.temperature_2m_min[selectedDayIndex], settings.tempUnit)}° / {convertTemp(weatherData.daily.temperature_2m_max[selectedDayIndex], settings.tempUnit)}°</p>
                        </div>
                    </div>
                    <div className="bg-bg-page rounded-xl p-3 flex items-center gap-3 border border-border-color shadow-sm">
                        <div className="bg-bg-card p-2 rounded-lg"><Icon name="umbrella" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-text-muted">{t('precip')}</p>
                            <p className="text-sm font-bold">{convertPrecip(weatherData.daily.precipitation_sum?.[selectedDayIndex], settings.precipUnit)} {settings.precipUnit}</p>
                        </div>
                    </div>
                    <div className="bg-bg-page rounded-xl p-3 flex items-center gap-3 border border-border-color shadow-sm">
                        <div className="bg-bg-card p-2 rounded-lg"><Icon name="umbrella" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-text-muted">{t('precip_prob')}</p>
                            <p className="text-sm font-bold">{weatherData.daily.precipitation_probability_max?.[selectedDayIndex] ?? 0}%</p>
                        </div>
                    </div>

                    <div className="bg-bg-page rounded-xl p-3 flex items-center gap-3 border border-border-color shadow-sm">
                        <div className="bg-bg-card p-2 rounded-lg"><Icon name="wb_sunny" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-text-muted">{t('uv_max')}</p>
                            <p className="text-sm font-bold">{weatherData.daily.uv_index_max?.[selectedDayIndex] ?? t('no_data_available')}</p>
                        </div>
                    </div>
                    <div className="bg-bg-page rounded-xl p-3 flex items-center gap-3 border border-border-color shadow-sm">
                        <div className="bg-bg-card p-2 rounded-lg"><Icon name="timelapse" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-text-muted">{t('sunshine')}</p>
                            <p className="text-sm font-bold">{formatHMSFromSeconds(weatherData.daily.sunshine_duration?.[selectedDayIndex]) ?? t('no_data_available')}</p>
                        </div>
                    </div>
                    <div className="bg-bg-page rounded-xl p-3 flex items-center gap-3 border border-border-color shadow-sm">
                        <div className="bg-bg-card p-2 rounded-lg"><Icon name="wb_twilight" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-text-muted">{t('daylight')}</p>
                            <p className="text-sm font-bold">{formatHMSFromSeconds(weatherData.daily.daylight_duration?.[selectedDayIndex]) ?? t('no_data_available')}</p>
                        </div>
                    </div>

                    <div className="bg-bg-page rounded-xl p-3 flex items-center gap-3 border border-border-color shadow-sm">
                        <div className="bg-bg-card p-2 rounded-lg"><Icon name="air" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-text-muted">{t('wind_gusts')}</p>
                            <p className="text-sm font-bold">{convertWind(weatherData.daily.wind_gusts_10m_max?.[selectedDayIndex] ?? 0, settings.windUnit)} {settings.windUnit}</p>
                        </div>
                    </div>
                    <div className="bg-bg-page rounded-xl p-3 flex items-center gap-3 border border-border-color shadow-sm">
                        <div className="bg-bg-card p-2 rounded-lg"><Icon name="air" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-text-muted">{t('wind')}</p>
                            <p className="text-sm font-bold">{(() => {
                                const v = getDayAverage('wind_speed_10m', selectedDayIndex);
                                return v !== null ? `${convertWind(v, settings.windUnit)} ${settings.windUnit}` : t('no_data_available');
                            })()}</p>
                        </div>
                    </div>

                    <div className="bg-bg-page rounded-xl p-3 flex items-center gap-3 border border-border-color shadow-sm">
                        <div className="bg-bg-card p-2 rounded-lg"><Icon name="humidity_percentage" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-text-muted">{t('humidity')}</p>
                            <p className="text-sm font-bold">{(() => {
                                const v = getDayAverage('relative_humidity_2m', selectedDayIndex);
                                return v !== null ? `${Math.round(v)}%` : t('no_data_available');
                            })()}</p>
                        </div>
                    </div>
                    <div className="bg-bg-page rounded-xl p-3 flex items-center gap-3 border border-border-color shadow-sm">
                        <div className="bg-bg-card p-2 rounded-lg"><Icon name="water_drop" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-text-muted">{t('dew_point')}</p>
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
                    <h4 className="text-sm font-bold uppercase text-text-muted mb-3">{t('activities')}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {dailyForecast[selectedDayIndex].activityScores.map(score => (
                             <div key={score.type} className="bg-bg-page rounded-xl p-3 border border-border-color shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-3">
                                         <div className={`p-2 rounded-lg bg-bg-card ${getScoreColor(score.score10)}`}>
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
                                                                    <Icon name="star" className="text-lg text-border-color" />
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
                                                                className={`text-lg ${isFull ? "text-yellow-400 drop-shadow-sm" : "text-border-color"}`} 
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                         </div>
                                    </div>
                                    <span className={`text-2xl font-bold ${getScoreColor(score.score10)}`}>{score.score10}</span>
                                </div>
                                <p className="text-xs text-text-muted mt-2 pl-1 border-l-2 border-border-color italic">
                                    "{score.text}"
                                </p>
                             </div>
                        ))}
                    </div>
                </div>

                {/* Hourly Graphs moved to top */}
            </div>
            </div>
            

        </div>
      )}

      <ComfortScoreModal 
          isOpen={showComfortModal}
          onClose={() => setShowComfortModal(false)}
          settings={settings}
      />
      
      <FeelsLikeInfoModal
          isOpen={showFeelsLikeModal}
          onClose={() => setShowFeelsLikeModal(false)}
          settings={settings}
      />

      <Modal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          title={`${location.name} - ${formatDateTime()}`}
          fullScreen={true}
          className="md:m-4 md:h-[calc(100%-2rem)] md:max-w-[calc(100%-2rem)] md:rounded-3xl"
      >
          <div className="w-full h-full flex flex-col p-2 sm:p-4">
            <YrInteractiveMap 
                userLocation={location}
                settings={settings}
                onUpdateSettings={onUpdateSettings}
            />
          </div>
      </Modal>

    </div>
  );
};
