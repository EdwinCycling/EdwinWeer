
import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse } from '../types';
import { Icon } from '../components/Icon';
import { getLuckyCity } from '../services/geminiService';
import { fetchForecast, mapWmoCodeToIcon, mapWmoCodeToText, getMoonPhaseText, calculateMoonPhase, getMoonPhaseIcon, getBeaufortDescription, convertTemp, convertWind, convertPrecip } from '../services/weatherService';
import { loadCurrentLocation, saveCurrentLocation } from '../services/storageService';
import { WeatherBackground } from '../components/WeatherBackground';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const CurrentWeatherView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [loadingCity, setLoadingCity] = useState(false);
  const [weatherData, setWeatherData] = useState<OpenMeteoResponse | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [error, setError] = useState('');
  
  const [localTime, setLocalTime] = useState<string>('');
  const [timeDiff, setTimeDiff] = useState<string>('');
  const [moonPhase, setMoonPhase] = useState(0);
  const [visibleDays, setVisibleDays] = useState<number>(3);
  const [frostWarning, setFrostWarning] = useState(false);
  const [rainAlert, setRainAlert] = useState<{inHours: number, amount: number, time: string} | null>(null);

  const t = (key: string) => getTranslation(key, settings.language);

  useEffect(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      saveCurrentLocation(location);
      loadWeather();
  }, [location]);

  useEffect(() => {
    if (!weatherData) return;
    const updateLocalClock = () => {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const destTime = new Date(utc + (weatherData.utc_offset_seconds * 1000));
        setLocalTime(destTime.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit' }));
        const diffHours = (weatherData.utc_offset_seconds / 3600) - (-now.getTimezoneOffset() / 60);
        const sign = diffHours >= 0 ? '+' : '';
        setTimeDiff(diffHours === 0 ? '' : `${sign}${diffHours}h`);
    };
    updateLocalClock();
    const interval = setInterval(updateLocalClock, 10000);
    return () => clearInterval(interval);
  }, [weatherData, settings.language]);

  useEffect(() => {
      if (!weatherData) return;
      setMoonPhase(calculateMoonPhase(new Date()));
      checkAlerts();
  }, [weatherData]);

  const checkAlerts = () => {
      if (!weatherData) return;
      const currentHour = new Date().getHours();
      const next48 = weatherData.hourly.temperature_2m.slice(currentHour, currentHour + 48);
      
      const hasFrost = next48.some(temp => temp < 0);
      setFrostWarning(hasFrost);

      const next48Rain = weatherData.hourly.precipitation.slice(currentHour, currentHour + 48);
      const firstRainIndex = next48Rain.findIndex(p => p > 0);
      
      if (firstRainIndex !== -1) {
          const rainTime = new Date();
          rainTime.setHours(currentHour + firstRainIndex);
          setRainAlert({
              inHours: firstRainIndex,
              amount: convertPrecip(next48Rain[firstRainIndex], settings.precipUnit),
              time: rainTime.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', {hour: '2-digit', minute: '2-digit'})
          });
      } else {
          setRainAlert(null);
      }
  };

  const loadWeather = async () => {
    setLoadingWeather(true);
    setError('');
    setVisibleDays(3);
    try {
        const data = await fetchForecast(location.lat, location.lon);
        setWeatherData(data);
    } catch (e) {
        console.error(e);
        setError(t('error'));
    } finally {
        setLoadingWeather(false);
    }
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

  const handleCompassSelect = async (direction: string) => {
    setLoadingCity(true);
    try {
        const newCity = await getLuckyCity(location, direction);
        setLocation(newCity);
    } catch(e) {
        console.error(e);
    } finally {
        setLoadingCity(false);
    }
  };

  const getHourlyForecast = () => {
      if (!weatherData) return [];
      const currentHour = new Date().getHours();
      const startIndex = currentHour;
      const slice = weatherData.hourly.time.slice(startIndex, startIndex + 48);

      return slice.map((timeStr, i) => {
          const date = new Date(timeStr);
          const index = startIndex + i;
          const isNight = (weatherData.current.is_day === 0 && i === 0) || (date.getHours() < 6 || date.getHours() > 21);
          
          return {
              time: i === 0 ? t('now') : date.getHours().toString().padStart(2, '0') + ':00',
              temp: convertTemp(weatherData.hourly.temperature_2m[index], settings.tempUnit),
              icon: mapWmoCodeToIcon(weatherData.hourly.weather_code[index], isNight),
              highlight: i === 0
          };
      });
  };

  const getRainGraphData = () => {
      if (!weatherData || !weatherData.minutely_15) return null;
      const nowIso = new Date().toISOString().slice(0, 13);
      let startIndex = weatherData.minutely_15.time.findIndex(timeStr => timeStr.startsWith(nowIso));
      if (startIndex === -1) startIndex = 0;

      const rainData = weatherData.minutely_15.precipitation.slice(startIndex, startIndex + 8);
      
      const graphData = rainData.map((precip, i) => ({
          time: i === 0 ? t('now') : i * 15 + 'm',
          precip: convertPrecip(precip, settings.precipUnit)
      }));

      const totalRain = rainData.reduce((a, b) => a + b, 0);
      return { data: graphData, totalRain };
  };

  const getDailyForecast = () => {
      if (!weatherData) return [];
      return weatherData.daily.time.map((ts, i) => {
          const date = new Date(ts);
          const dayName = i === 0 ? t('today') : i === 1 ? t('tomorrow') : date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long' });
          const code = weatherData.daily.weather_code[i];
          const min = convertTemp(weatherData.daily.temperature_2m_min[i], settings.tempUnit);
          const max = convertTemp(weatherData.daily.temperature_2m_max[i], settings.tempUnit);
          
          let color = 'from-cyan-400 to-amber-400';
          if (code >= 50) color = 'from-sky-400 to-blue-500'; 
          if (code === 0) color = 'from-yellow-300 to-orange-400';

          return {
              day: dayName.charAt(0).toUpperCase() + dayName.slice(1),
              icon: mapWmoCodeToIcon(code),
              min,
              max,
              color
          };
      });
  };

  // --- Sun Graph Widget Component ---
  const SunElevationGraph = () => {
    if (!weatherData) return null;
    const isDay = weatherData.current.is_day === 1;

    // If it's night, show the Moon card instead of graph
    if (!isDay) {
        const daysToFull = Math.round((moonPhase < 0.5 ? 0.5 - moonPhase : 1.5 - moonPhase) * 29.53);
        const illumination = Math.round((1 - Math.cos(moonPhase * 2 * Math.PI)) / 2 * 100);

        return (
            <div className="bg-slate-100 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/5 relative overflow-hidden flex flex-col justify-between h-[180px]">
                <div>
                    <div className="absolute top-0 right-0 p-3 opacity-20">
                        <Icon name="dark_mode" className="text-6xl text-indigo-300" />
                    </div>
                    <p className="text-slate-500 dark:text-white/50 text-xs font-bold uppercase mb-1">{t('moon_phase')}</p>
                    <p className="text-xl font-bold truncate pr-8">{getMoonPhaseText(moonPhase, settings.language)}</p>
                    
                    <div className="flex flex-col gap-1 mt-2 text-xs opacity-70">
                        <p>{t('moon.days_to_full')}: <span className="font-bold">{daysToFull}</span></p>
                        <p>{t('moon.illumination')}: <span className="font-bold">{illumination}%</span></p>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-4">
                    <div className="flex flex-col">
                        <span className="text-xs opacity-50">{t('tonight')}</span>
                        <span className="text-lg font-medium">{t('visible')}</span>
                    </div>
                    <Icon name={getMoonPhaseIcon(moonPhase)} className="text-5xl text-indigo-400 dark:text-indigo-200" />
                </div>
            </div>
        )
    }

    // Calculations for Sun Graph
    const parseTime = (iso: string) => {
        const d = new Date(iso);
        return d.getHours() + d.getMinutes() / 60;
    };
    
    // Adjust sunrise/sunset for UTC offset to get local solar time roughly
    const offsetHr = weatherData.utc_offset_seconds / 3600;
    const sunriseHr = parseTime(weatherData.daily.sunrise[0]);
    const sunsetHr = parseTime(weatherData.daily.sunset[0]);
    
    const now = new Date();
    const currentHr = now.getHours() + now.getMinutes() / 60;
    
    const width = 300;
    const height = 100;
    
    const minX = 4;
    const maxX = 22;
    const scaleX = (val: number) => ((val - minX) / (maxX - minX)) * width;
    
    const generateSunPath = (rise: number, set: number, maxElev: number) => {
        const points = [];
        for (let t = rise; t <= set; t += 0.5) {
            const x = scaleX(t);
            const p = (t - rise) / (set - rise); 
            const h = Math.sin(p * Math.PI); 
            const y = height - (h * maxElev); 
            points.push(`${x},${y}`);
        }
        return points.join(' L ');
    };

    // Calculate dynamic height based on day length
    // Longest day approx 16.8 hours, Shortest approx 7.5 hours (at 52 lat)
    const currentDayLength = sunsetHr - sunriseHr;
    const longestDayLength = 16.8;
    const dayRatio = Math.min(1, currentDayLength / longestDayLength);
    const todayMaxElev = dayRatio * 90; // Scale amplitude based on day length

    const todayPath = generateSunPath(sunriseHr, sunsetHr, todayMaxElev); 
    const longRise = 5; 
    const longSet = 22;
    const longestPath = generateSunPath(longRise, longSet, 90); 

    const progress = Math.max(0, Math.min(1, (currentHr - sunriseHr) / (sunsetHr - sunriseHr)));
    const currentYRatio = Math.sin(progress * Math.PI);
    const sunCx = scaleX(currentHr);
    const sunCy = height - (currentYRatio * todayMaxElev);

    return (
        <div className="bg-slate-100 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/5 h-[180px] relative">
            <div className="flex justify-between items-start mb-2">
                 <p className="text-slate-500 dark:text-white/50 text-xs font-bold uppercase">{t('sun_graph.title')}</p>
                 <div className="flex items-center gap-1 bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-lg">
                    <Icon name="cloud" className="text-xs" />
                    <span className="text-xs font-bold">{weatherData.current.cloud_cover}%</span>
                 </div>
            </div>
            
            <div className="absolute inset-x-0 bottom-8 h-[100px] flex justify-center overflow-hidden">
                <svg viewBox={`0 0 ${width} ${height + 10}`} className="w-full h-full" preserveAspectRatio="none">
                    <path d={`M ${longestPath}`} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-yellow-500/30" />
                    <path d={`M ${todayPath}`} fill="none" stroke="url(#sunGradient)" strokeWidth="3" strokeLinecap="round" />
                    <defs>
                        <linearGradient id="sunGradient" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="50%" stopColor="#fbbf24" />
                            <stop offset="100%" stopColor="#f59e0b" />
                        </linearGradient>
                    </defs>
                    {currentHr > sunriseHr && currentHr < sunsetHr && (
                         <g transform={`translate(${sunCx}, ${sunCy})`}>
                            <circle r="6" fill="#fbbf24" stroke="white" strokeWidth="2" />
                            <circle r="12" fill="#fbbf24" opacity="0.3" className="animate-pulse" />
                        </g>
                    )}
                </svg>
            </div>

            <div className="absolute bottom-12 left-4 text-[10px] font-bold opacity-60">
                {new Date(weatherData.daily.sunrise[0]).toLocaleTimeString(settings.language==='nl'?'nl-NL':'en-GB', {hour:'2-digit', minute:'2-digit'})}
            </div>
            <div className="absolute bottom-12 right-4 text-[10px] font-bold opacity-60">
                {new Date(weatherData.daily.sunset[0]).toLocaleTimeString(settings.language==='nl'?'nl-NL':'en-GB', {hour:'2-digit', minute:'2-digit'})}
            </div>

            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-4 text-[10px] opacity-60">
                <div className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-yellow-500"></span> {t('sun_graph.today')}
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-yellow-500/50 border-t border-dashed border-yellow-500"></span> {t('sun_graph.longest')}
                </div>
            </div>
        </div>
    );
  };


  const dailyForecast = getDailyForecast().slice(0, visibleDays);
  const rainGraph = getRainGraphData();
  
  const currentTemp = weatherData ? convertTemp(weatherData.current.temperature_2m, settings.tempUnit) : 0;
  const highTemp = weatherData ? convertTemp(weatherData.daily.temperature_2m_max[0], settings.tempUnit) : 0;
  const lowTemp = weatherData ? convertTemp(weatherData.daily.temperature_2m_min[0], settings.tempUnit) : 0;
  const feelsLike = weatherData ? convertTemp(weatherData.current.apparent_temperature, settings.tempUnit) : 0;
  const windSpeed = weatherData ? convertWind(weatherData.current.wind_speed_10m, settings.windUnit) : 0;
  
  const calculateDewPoint = (T: number, RH: number) => {
      return T - ((100 - RH) / 5);
  };
  const dewPoint = weatherData ? calculateDewPoint(weatherData.current.temperature_2m, weatherData.current.relative_humidity_2m) : 0;
  
  const getCurrentHourly = (key: keyof OpenMeteoResponse['hourly']) => {
      if (!weatherData) return 0;
      const currentHour = new Date().getHours();
      return weatherData.hourly[key]?.[currentHour] ?? 0;
  };

  return (
    <div className="relative min-h-screen flex flex-col pb-20 overflow-y-auto overflow-x-hidden text-white">
      
      {weatherData && (
        <WeatherBackground 
            weatherCode={weatherData.current.weather_code} 
            isDay={weatherData.current.is_day} 
        />
      )}

      <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/10 to-background-dark/90 z-0 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Header */}
        <div className="flex flex-col pt-8 pb-4">
            <div className="flex items-center justify-center relative px-4 mb-2">
                <button onClick={() => cycleFavorite('prev')} className="absolute left-6 text-white/60 hover:text-white transition-colors p-2" disabled={settings.favorites.length === 0}>
                    <Icon name="chevron_left" className="text-3xl" />
                </button>

                <div className="text-center cursor-pointer group">
                    {loadingCity ? (
                        <div className="flex items-center gap-2">
                             <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                             <span className="font-medium">{t('search')}</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center">
                            <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-md">
                                <Icon name="location_on" className="text-primary" />
                                {location.name}, {location.country}
                            </h2>
                            {localTime && (
                                <p className="text-white/80 text-sm font-medium mt-1 flex items-center gap-2">
                                    <Icon name="schedule" className="text-xs" />
                                    {localTime} 
                                    {timeDiff && <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{timeDiff}</span>}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <button onClick={() => cycleFavorite('next')} className="absolute right-6 text-white/60 hover:text-white transition-colors p-2" disabled={settings.favorites.length === 0}>
                    <Icon name="chevron_right" className="text-3xl" />
                </button>
            </div>

            <div className="w-full overflow-x-auto scrollbar-hide pl-4">
                <div className="flex gap-3 pr-4">
                    <button 
                         onClick={() => {
                             const geo = navigator.geolocation;
                             if (geo) {
                                 setLoadingCity(true);
                                 geo.getCurrentPosition((pos) => {
                                     setLocation({name: t('my_location'), country: "", lat: pos.coords.latitude, lon: pos.coords.longitude});
                                     setLoadingCity(false);
                                 }, () => setLoadingCity(false));
                             }
                         }}
                         className="flex items-center gap-1 px-4 py-2 rounded-full bg-white/10 hover:bg-primary/20 hover:text-primary transition-colors border border-white/5 whitespace-nowrap backdrop-blur-md"
                    >
                        <Icon name="my_location" className="text-sm" />
                        <span className="text-sm font-medium">{t('my_location')}</span>
                    </button>
                    {settings.favorites.map((fav, i) => (
                        <button 
                            key={i}
                            onClick={() => setLocation(fav)}
                            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border backdrop-blur-md ${location.name === fav.name ? 'bg-white text-slate-800 font-bold' : 'bg-white/10 text-white hover:bg-white/20 border-white/5'}`}
                        >
                            {fav.name}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {loadingWeather ? (
            <div className="flex-grow flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full"></div>
            </div>
        ) : weatherData ? (
            <>
                <div className="flex-grow flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in duration-500">
                    <div className="flex items-center gap-4">
                        <h1 className="text-[100px] font-bold leading-none tracking-tighter drop-shadow-2xl font-display">
                            {currentTemp}°
                        </h1>
                        {feelsLike < 10 && (
                            <div className="flex flex-col items-center justify-center bg-white/10 backdrop-blur-md rounded-xl p-2 border border-white/10">
                                <Icon name="thermostat" className="text-xl text-blue-300" />
                                <span className="text-lg font-bold">{Math.round(feelsLike)}°</span>
                                <span className="text-[9px] uppercase opacity-70">{t('feels_like')}</span>
                            </div>
                        )}
                    </div>
                    <p className="text-2xl font-medium tracking-wide drop-shadow-md mt-2 flex items-center gap-2">
                         <Icon name={mapWmoCodeToIcon(weatherData.current.weather_code, weatherData.current.is_day === 0)} className="text-3xl" />
                        {mapWmoCodeToText(weatherData.current.weather_code, settings.language)}
                    </p>
                    <p className="text-white/80 text-lg font-normal drop-shadow-md mt-1">
                        H:{highTemp}° L:{lowTemp}°
                    </p>
                </div>

                <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-2xl rounded-t-[40px] border-t border-slate-200 dark:border-white/10 p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom duration-500 text-slate-800 dark:text-white transition-colors">
                    
                    {/* Hourly */}
                    <div className="mb-8">
                        <button 
                            onClick={() => onNavigate(ViewState.HOURLY_DETAIL)}
                            className="w-full flex items-center justify-between mb-4 px-1 group"
                        >
                            <h3 className="text-slate-500 dark:text-white/60 text-xs font-bold uppercase tracking-wider group-hover:text-primary transition-colors">{t('hourly_forecast')}</h3>
                            <div className="flex items-center gap-1 text-slate-400 dark:text-white/40 text-[10px] uppercase group-hover:text-primary transition-colors">
                                <span>{t('details')}</span>
                                <Icon name="chevron_right" className="text-base" />
                            </div>
                        </button>
                        <div 
                            className="flex overflow-x-auto scrollbar-hide -mx-6 px-6 pb-4 gap-5 cursor-pointer"
                            onClick={() => onNavigate(ViewState.HOURLY_DETAIL)}
                        >
                            {getHourlyForecast().map((hour, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-3 min-w-[64px] shrink-0 group p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                                    <p className={`text-sm font-medium ${hour.highlight ? 'text-primary' : 'text-slate-500 dark:text-white/60'}`}>{hour.time}</p>
                                    <Icon name={hour.icon} className={`text-3xl transition-transform group-hover:scale-110 ${hour.highlight ? 'text-primary' : 'text-slate-700 dark:text-white'}`} />
                                    <p className="text-lg font-bold">{hour.temp}°</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* Rain Graph */}
                    {rainGraph && rainGraph.totalRain > 0 && (
                        <div className="mb-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 dark:border-blue-500/20">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-blue-600 dark:text-blue-200 text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                                    <Icon name="rainy" /> {t('precip_forecast')}
                                </h3>
                                <span className="text-xs text-blue-400 dark:text-blue-200/60">{t('coming_2_hours')}</span>
                            </div>
                            <div className="h-32 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={rainGraph.data}>
                                        <defs>
                                            <linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5}/>
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="time" tick={{fill: '#93c5fd', fontSize: 10}} axisLine={false} tickLine={false} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#1e3a8a', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                                            itemStyle={{ color: '#fff' }}
                                            formatter={(value: any) => [`${value} ${settings.precipUnit}`, t('precip')]}
                                        />
                                        <Area type="monotone" dataKey="precip" stroke="#3b82f6" fill="url(#rainFill)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* New Sun Graph Widget */}
                    <div className="mb-8">
                        <SunElevationGraph />
                    </div>

                    {(frostWarning || rainAlert) && (
                        <div className="flex flex-col gap-3 mb-8">
                             {frostWarning && (
                                 <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                                     <Icon name="ac_unit" className="text-red-400 dark:text-red-300 text-xl" />
                                     <div>
                                         <p className="text-red-600 dark:text-red-200 font-bold text-sm">{t('frost_warning')}</p>
                                         <p className="text-red-500 dark:text-red-200/60 text-xs">{t('frost_desc')}</p>
                                     </div>
                                 </div>
                             )}
                             {rainAlert && (
                                 <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                                     <Icon name="rainy" className="text-blue-400 dark:text-blue-300 text-xl" />
                                     <div>
                                         <p className="text-blue-600 dark:text-blue-200 font-bold text-sm">{t('rain_expected')}</p>
                                         <p className="text-blue-500 dark:text-blue-200/60 text-xs">
                                             {t('rain_desc').replace('{hours}', rainAlert.inHours.toString()).replace('{time}', rainAlert.time).replace('{amount}', rainAlert.amount.toString() + settings.precipUnit)}
                                         </p>
                                     </div>
                                 </div>
                             )}
                        </div>
                    )}

                    {/* Daily Forecast */}
                    <div className="flex flex-col gap-1 mb-8">
                        <div className="flex justify-between items-center px-1 mb-2">
                            <h3 className="text-slate-500 dark:text-white/60 text-xs font-bold uppercase tracking-wider">{t('next_days')}</h3>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                            {dailyForecast.map((d, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-colors animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="flex items-center gap-3 w-1/3">
                                        <div className="size-10 rounded-full bg-white dark:bg-white/10 flex items-center justify-center">
                                            <Icon name={d.icon} className={`text-xl ${i===0 ? 'text-primary' : 'text-slate-600 dark:text-white'}`} />
                                        </div>
                                        <p className="font-medium">{d.day}</p>
                                    </div>
                                    
                                    <div className="flex-1 flex items-center gap-3 px-2">
                                        <span className="opacity-50 text-xs w-8 text-right">{d.min}°</span>
                                        <div className="h-1.5 flex-1 bg-slate-300 dark:bg-black/40 rounded-full overflow-hidden relative">
                                            <div className={`absolute h-full rounded-full bg-gradient-to-r ${d.color}`} style={{ left: '10%', width: '80%' }}></div>
                                        </div>
                                        <span className="font-bold text-sm w-8">{d.max}°</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-center mt-4 gap-2">
                            <button onClick={() => setVisibleDays(visibleDays === 3 ? 7 : visibleDays === 7 ? 16 : 3)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-xs font-medium opacity-70 transition-colors border border-slate-200 dark:border-white/5">
                                {visibleDays === 3 ? '7 Days' : visibleDays === 7 ? '16 Days' : 'Less'}
                            </button>
                        </div>
                    </div>

                    {/* --- MOST COMPLETE DETAIL SECTION --- */}
                    <div className="mt-8">
                        <h3 className="text-lg font-bold mb-4">{t('detail_title')}</h3>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {/* Thermodynamics */}
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="thermostat" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('feels_like')}</p>
                                    <p className="text-sm font-bold">{Math.round(feelsLike)}°</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="humidity_percentage" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('humidity')}</p>
                                    <p className="text-sm font-bold">{weatherData.current.relative_humidity_2m}%</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="water_drop" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('dew_point')}</p>
                                    <p className="text-sm font-bold">{Math.round(convertTemp(dewPoint, settings.tempUnit))}°</p>
                                </div>
                            </div>

                            {/* Clouds & Vis */}
                             <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="visibility" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('visibility')}</p>
                                    <p className="text-sm font-bold">{Math.round(getCurrentHourly('visibility') / 1000)} km</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="cloud" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('cloud_cover')}</p>
                                    <p className="text-sm font-bold">{weatherData.current.cloud_cover}%</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="cloud_queue" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">L/M/H Clouds</p>
                                    <p className="text-[10px] font-bold">{getCurrentHourly('cloud_cover_low')}/{getCurrentHourly('cloud_cover_mid')}/{getCurrentHourly('cloud_cover_high')}%</p>
                                </div>
                            </div>

                            {/* Wind */}
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="air" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('wind')}</p>
                                    <p className="text-sm font-bold">{windSpeed} {settings.windUnit}</p>
                                </div>
                            </div>
                             <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="cyclone" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('wind_gusts')}</p>
                                    <p className="text-sm font-bold">{convertWind(weatherData.current.wind_gusts_10m, settings.windUnit)} {settings.windUnit}</p>
                                </div>
                            </div>
                            
                            {/* Atmosphere */}
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="compress" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('pressure')}</p>
                                    <p className="text-sm font-bold">{Math.round(weatherData.current.surface_pressure)} hPa</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="speed" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('pressure_msl')}</p>
                                    <p className="text-sm font-bold">{Math.round(weatherData.current.pressure_msl)} hPa</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="filter_drama" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('vapor_pressure')}</p>
                                    <p className="text-sm font-bold">{getCurrentHourly('vapour_pressure_deficit')} kPa</p>
                                </div>
                            </div>

                            {/* Sun & Water */}
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="wb_sunny" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('uv_max')}</p>
                                    <p className="text-sm font-bold">{weatherData.daily.uv_index_max[0]}</p>
                                </div>
                            </div>
                             <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="timelapse" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('sunshine')}</p>
                                    <p className="text-sm font-bold">{Math.round(weatherData.daily.sunshine_duration[0] / 3600)}h {Math.round((weatherData.daily.sunshine_duration[0] % 3600) / 60)}m</p>
                                </div>
                            </div>
                             <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="opacity" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('evapotranspiration')}</p>
                                    <p className="text-sm font-bold">{weatherData.daily.et0_fao_evapotranspiration[0]}mm</p>
                                </div>
                            </div>

                            {/* Deep Soil Profile Header */}
                            <div className="col-span-2 md:col-span-3 mt-2">
                                <h4 className="text-xs font-bold uppercase opacity-50 border-b border-slate-200 dark:border-white/10 pb-1 mb-2">Deep Soil Profile</h4>
                            </div>
                            
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="grass" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('soil_temp_0cm')}</p>
                                    <p className="text-sm font-bold">{convertTemp(getCurrentHourly('soil_temperature_0cm'), settings.tempUnit)}°</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="grass" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('soil_temp_6cm')}</p>
                                    <p className="text-sm font-bold">{convertTemp(getCurrentHourly('soil_temperature_6cm'), settings.tempUnit)}°</p>
                                </div>
                            </div>
                             <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="grass" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('soil_temp_18cm')}</p>
                                    <p className="text-sm font-bold">{convertTemp(getCurrentHourly('soil_temperature_18cm'), settings.tempUnit)}°</p>
                                </div>
                            </div>
                             <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="water" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('soil_moist_0_1')}</p>
                                    <p className="text-sm font-bold">{getCurrentHourly('soil_moisture_0_to_1cm')} m³/m³</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="water" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('soil_moist_3_9')}</p>
                                    <p className="text-sm font-bold">{getCurrentHourly('soil_moisture_3_to_9cm')} m³/m³</p>
                                </div>
                            </div>
                             <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="water" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('soil_moist_27_81')}</p>
                                    <p className="text-sm font-bold">{getCurrentHourly('soil_moisture_27_to_81cm')} m³/m³</p>
                                </div>
                            </div>

                             {/* Atmosphere Profile Header */}
                             <div className="col-span-2 md:col-span-3 mt-2">
                                <h4 className="text-xs font-bold uppercase opacity-50 border-b border-slate-200 dark:border-white/10 pb-1 mb-2">Atmosphere Profile</h4>
                            </div>

                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="wind_power" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('wind_80m')}</p>
                                    <p className="text-sm font-bold">{convertWind(getCurrentHourly('wind_speed_80m'), settings.windUnit)} {settings.windUnit}</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="wind_power" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('wind_120m')}</p>
                                    <p className="text-sm font-bold">{convertWind(getCurrentHourly('wind_speed_120m'), settings.windUnit)} {settings.windUnit}</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="wind_power" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('wind_180m')}</p>
                                    <p className="text-sm font-bold">{convertWind(getCurrentHourly('wind_speed_180m'), settings.windUnit)} {settings.windUnit}</p>
                                </div>
                            </div>
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="thermostat" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('temp_80m')}</p>
                                    <p className="text-sm font-bold">{convertTemp(getCurrentHourly('temperature_80m'), settings.tempUnit)}°</p>
                                </div>
                            </div>
                             <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="thermostat" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('temp_180m')}</p>
                                    <p className="text-sm font-bold">{convertTemp(getCurrentHourly('temperature_180m'), settings.tempUnit)}°</p>
                                </div>
                            </div>
                            
                            {/* Precip Daily */}
                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="umbrella" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('precip_prob')}</p>
                                    <p className="text-sm font-bold">{weatherData.daily.precipitation_probability_max[0]}%</p>
                                </div>
                            </div>
                             <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="rainy" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('today')} {t('precip')}</p>
                                    <p className="text-sm font-bold">{convertPrecip(weatherData.daily.precipitation_sum[0], settings.precipUnit)} {settings.precipUnit}</p>
                                </div>
                            </div>
                             <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg opacity-70"><Icon name="wb_twilight" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase opacity-40">{t('daylight')}</p>
                                    <p className="text-sm font-bold">{Math.round(weatherData.daily.daylight_duration[0] / 3600)}h {Math.round((weatherData.daily.daylight_duration[0] % 3600) / 60)}m</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-slate-200 dark:border-white/5">
                        <div className="text-center mb-6">
                            <h3 className="text-lg font-bold">{t('explore_world')}</h3>
                            <p className="opacity-50 text-sm">{t('lucky_compass')}</p>
                        </div>
                        
                        <div className="relative size-64 mx-auto my-4 group">
                             <div className="absolute inset-0 rounded-full border border-slate-200 dark:border-white/5 animate-[spin_60s_linear_infinite]"></div>
                             <div className="absolute inset-4 rounded-full border border-slate-200 dark:border-white/5 border-dashed animate-[spin_40s_linear_infinite_reverse]"></div>
                             
                             {['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'].map((dir, i) => {
                                 const angle = i * 45;
                                 const style = {
                                     transform: `rotate(${angle}deg) translate(0, -100px) rotate(-${angle}deg)`
                                 };
                                 return (
                                     <button 
                                        key={dir}
                                        disabled={loadingCity}
                                        onClick={() => handleCompassSelect(dir)}
                                        className="absolute top-1/2 left-1/2 -ml-5 -mt-5 size-10 rounded-full bg-white dark:bg-background-dark border border-slate-200 dark:border-white/10 hover:bg-primary hover:border-primary hover:text-white flex items-center justify-center font-bold text-xs opacity-60 transition-all duration-300 disabled:opacity-50 shadow-lg z-10 text-slate-700 dark:text-white"
                                        style={style}
                                     >
                                         {dir}
                                     </button>
                                 )
                             })}
                             
                             <button 
                                onClick={() => handleCompassSelect('')} 
                                disabled={loadingCity}
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-24 rounded-full bg-gradient-to-br from-primary to-blue-600 text-white shadow-[0_0_40px_rgba(19,182,236,0.4)] flex flex-col items-center justify-center z-20 hover:scale-105 active:scale-95 transition-all disabled:opacity-70 disabled:scale-100"
                             >
                                {loadingCity ? (
                                    <span className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent"></span>
                                ) : (
                                    <>
                                        <Icon name="explore" className="text-4xl mb-1" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Lucky</span>
                                    </>
                                )}
                             </button>
                        </div>
                    </div>

                </div>
            </>
        ) : (
            <div className="flex-grow flex flex-col items-center justify-center opacity-60">
                <Icon name="cloud_off" className="text-6xl mb-4" />
                <p>{error || t('loading')}</p>
            </div>
        )}
      </div>
    </div>
  );
};
