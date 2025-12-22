
import React, { useState, useEffect, useRef } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse, EnsembleModel, ActivityType } from '../types';
import { calculateActivityScore, ActivityScore } from '../services/activityService';
import { Icon } from '../components/Icon';
import { getLuckyCity } from '../services/geminiService';
import { fetchForecast, mapWmoCodeToIcon, mapWmoCodeToText, getMoonPhaseText, calculateMoonPhase, getMoonPhaseIcon, getBeaufortDescription, convertTemp, convertWind, convertPrecip, convertPressure, calculateHeatIndex, getWindDirection } from '../services/weatherService';
import { searchCityByName, reverseGeocode } from '../services/geoService';
import { loadCurrentLocation, saveCurrentLocation, loadEnsembleModel, saveEnsembleModel, loadSettings, loadLastKnownMyLocation, saveLastKnownMyLocation } from '../services/storageService';
import { WeatherBackground } from '../components/WeatherBackground';
import { StaticWeatherBackground } from '../components/StaticWeatherBackground';
import { Tooltip as RechartsTooltip, AreaChart, Area, XAxis, ResponsiveContainer } from 'recharts';
import { Tooltip } from '../components/Tooltip';
import { FavoritesList } from '../components/FavoritesList';
import { getTranslation } from '../services/translations';
import { WelcomeModal } from '../components/WelcomeModal';
import { Modal } from '../components/Modal';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
}

export const CurrentWeatherView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [lastKnownMyLocation, setLastKnownMyLocation] = useState<Location | null>(() => loadLastKnownMyLocation());
  const [loadingCity, setLoadingCity] = useState(false);
  const [weatherData, setWeatherData] = useState<OpenMeteoResponse | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [error, setError] = useState('');
  const [selectedModel, setSelectedModel] = useState<EnsembleModel>(loadEnsembleModel());
  
  const [localTime, setLocalTime] = useState<string>('');
  const [timeDiff, setTimeDiff] = useState<string>('');
  const [moonPhase, setMoonPhase] = useState(0);
  const [frostWarning, setFrostWarning] = useState(false);
  const [rainAlert, setRainAlert] = useState<{inHours: number, amount: number, time: string} | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const t = (key: string) => getTranslation(key, settings.language);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
        searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

    useEffect(() => {
        // Welcome popup for new users
        const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
        if (!hasSeenWelcome) {
            setShowWelcomeModal(true);
        }

      window.scrollTo({ top: 0, behavior: 'smooth' });
      saveCurrentLocation(location);
      loadWeather();
  }, [location]);

  useEffect(() => {
      saveEnsembleModel(selectedModel);
      loadWeather();
  }, [selectedModel]);

  const getLocationTime = () => {
    if (!weatherData) return new Date();
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (weatherData.utc_offset_seconds * 1000));
  };

  useEffect(() => {
    if (!weatherData) return;
    const updateLocalClock = () => {
        const destTime = getLocationTime();
        setLocalTime(destTime.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' }));
        const now = new Date();
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
      const currentHour = getLocationTime().getHours();
      const next48 = weatherData.hourly.temperature_2m.slice(currentHour, currentHour + 48);
      
      const hasFrost = next48.some(temp => temp < 0);
      setFrostWarning(hasFrost);

      const next48Rain = weatherData.hourly.precipitation.slice(currentHour, currentHour + 48);
      const firstRainIndex = next48Rain.findIndex(p => p > 0);
      
      if (firstRainIndex !== -1) {
          const rainTime = getLocationTime();
          rainTime.setHours(currentHour + firstRainIndex);
          setRainAlert({
              inHours: firstRainIndex,
              amount: convertPrecip(next48Rain[firstRainIndex], settings.precipUnit),
              time: rainTime.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', {hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h'})
          });
      } else {
          setRainAlert(null);
      }
  };

    const loadWeather = async () => {
    setLoadingWeather(true);
    setError('');
    try {
        const data = await fetchForecast(location.lat, location.lon, selectedModel);
        
        // Check for empty data
        if (!data || !data.current || !data.hourly) {
            setError(`${t('error_no_data_for_model') || 'Geen data beschikbaar voor model'}: ${selectedModel}`);
            setWeatherData(null);
            return;
        }

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

  const searchCities = async () => {
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    try {
        const results = await searchCityByName(searchQuery, settings.language);
        setSearchResults(results);
    } catch (e) {
        console.error(e);
        setSearchResults([]);
    } finally {
        setLoadingSearch(false);
    }
  };

  const handleSelectSearchResult = (loc: Location) => {
    setLocation(loc);
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const isFavorite = (loc: Location) => {
    return settings.favorites.some(f => f.name === loc.name && f.country === loc.country);
  };

  const toggleFavorite = () => {
    if (!onUpdateSettings) return;
    
    let newFavorites = [...settings.favorites];
    if (isFavorite(location)) {
        newFavorites = newFavorites.filter(f => !(f.name === location.name && f.country === location.country));
    } else {
        newFavorites.push(location);
    }
    
    onUpdateSettings({
        ...settings,
        favorites: newFavorites
    });
  };

  const getHourlyForecast = () => {
      if (!weatherData) return [];
      const currentHour = getLocationTime().getHours();
      const startIndex = currentHour;
      const slice = weatherData.hourly.time.slice(startIndex, startIndex + 48);

      return slice.map((timeStr, i) => {
                const date = new Date(timeStr);
                const index = startIndex + i;
                const isNight = (weatherData.current.is_day === 0 && i === 0) || (date.getHours() < 6 || date.getHours() > 21);
                
                // Fallback to current weather code if hourly code is missing to avoid '?' icon
                const code = weatherData.hourly.weather_code && weatherData.hourly.weather_code[index] !== undefined
                    ? weatherData.hourly.weather_code[index]
                    : weatherData.current.weather_code;

                return {
                    time: i === 0 ? t('now') : date.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' }),
                    temp: convertTemp(weatherData.hourly.temperature_2m[index], settings.tempUnit),
                    icon: mapWmoCodeToIcon(code, isNight),
                    highlight: i === 0
                };
            });
  };

  const getRainGraphData = () => {
      if (!weatherData || !weatherData.minutely_15) return null;
      const d = getLocationTime();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const nowIso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
      
      let startIndex = weatherData.minutely_15.time.findIndex(timeStr => timeStr.startsWith(nowIso));
      if (startIndex === -1) {
        // Fallback: try to find the closest time if exact match fails
        // But minutely_15 is usually every 15 min.
        // If we are at 21:10, we want 21:00 or 21:15.
        // The startWith logic matches 21:xx.
        // So it finds the first entry with 21h.
        // If the array starts at 22:00 (past data missing?), we might return -1.
        startIndex = 0;
      }

      const rainData = weatherData.minutely_15.precipitation.slice(startIndex, startIndex + 8);
      
      const graphData = rainData.map((precip, i) => ({
          time: i === 0 ? t('now') : i * 15 + 'm',
          precip: convertPrecip(precip, settings.precipUnit)
      }));

      const totalRain = rainData.reduce((a, b) => a + b, 0);
      return { data: graphData, totalRain };
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
                    
                    <div className="flex flex-col gap-1 mt-2 text-xs text-slate-600 dark:text-white/70">
                        <p>{t('moon.days_to_full')}: <span className="font-bold">{daysToFull}</span></p>
                        <p>{t('moon.illumination')}: <span className="font-bold">{illumination}%</span></p>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-4">
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500 dark:text-white/60">{t('tonight')}</span>
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
    // We use direct parsing of the ISO string from OpenMeteo which is already in the city's timezone
    const sunriseHr = parseTime(weatherData.daily.sunrise[0]);
    const sunsetHr = parseTime(weatherData.daily.sunset[0]);
    
    // Calculate current time at the location
    // We calculate the city's current hour based on the UTC offset
    const cityDate = new Date(Date.now() + weatherData.utc_offset_seconds * 1000);
    const currentHr = cityDate.getUTCHours() + cityDate.getUTCMinutes() / 60;
    
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

            <div className="absolute bottom-12 left-4 text-[10px] font-bold text-slate-600 dark:text-white/70">
                {new Date(weatherData.daily.sunrise[0]).toLocaleTimeString(settings.language==='nl'?'nl-NL':'en-GB', {hour:'2-digit', minute:'2-digit', hour12: settings.timeFormat === '12h'})}
            </div>
            <div className="absolute bottom-12 right-4 text-[10px] font-bold text-slate-600 dark:text-white/70">
                {new Date(weatherData.daily.sunset[0]).toLocaleTimeString(settings.language==='nl'?'nl-NL':'en-GB', {hour:'2-digit', minute:'2-digit', hour12: settings.timeFormat === '12h'})}
            </div>

            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-4 text-[10px] text-slate-500 dark:text-white/60">
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
  const heatIndexRaw = weatherData ? calculateHeatIndex(weatherData.current.temperature_2m, weatherData.current.relative_humidity_2m) : 0;
  const heatIndex = convertTemp(heatIndexRaw, settings.tempUnit);
  
  const getCurrentHourly = (key: keyof OpenMeteoResponse['hourly']) => {
      if (!weatherData) return 0;
      const currentHour = getLocationTime().getHours();
      return weatherData.hourly[key]?.[currentHour] ?? 0;
  };

  const currentActivityScores = React.useMemo(() => {
      if (!weatherData) return [];
      
      const currentHour = getLocationTime().getHours();
      // Safe access to hourly probability, fallback to 0 if missing
      const precipProb = weatherData.hourly.precipitation_probability ? weatherData.hourly.precipitation_probability[currentHour] : 0;
      
      const activityData = {
          tempFeelsLike: weatherData.current.apparent_temperature,
          windKmh: weatherData.current.wind_speed_10m,
          precipMm: weatherData.current.precipitation,
          precipProb: precipProb,
          gustsKmh: weatherData.current.wind_gusts_10m,
          weatherCode: weatherData.current.weather_code,
          sunChance: 100 - weatherData.current.cloud_cover,
          cloudCover: weatherData.current.cloud_cover,
          visibility: weatherData.hourly.visibility ? weatherData.hourly.visibility[currentHour] : 10000
      };

      const activities: ActivityType[] = ['bbq', 'cycling', 'walking', 'running'];
      return activities.map(type => ({
          type,
          ...calculateActivityScore(activityData, type, settings.language)
      }));
  }, [weatherData, settings.language]);

    const getActivityIcon = (type: ActivityType) => {
        switch (type) {
            case 'bbq': return 'outdoor_grill';
            case 'cycling': return 'directions_bike';
            case 'walking': return 'hiking';
            case 'sailing': return 'sailing';
            case 'running': return 'directions_run';
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 8) return "text-green-500 dark:text-green-400";
        if (score >= 6) return "text-lime-500 dark:text-lime-400";
        if (score >= 4) return "text-orange-500 dark:text-orange-400";
        return "text-red-500 dark:text-red-400";
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
                className="absolute inset-0 w-full h-full"
            />
        </div>
      )}

      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent dark:from-black/60 dark:via-black/5 dark:to-background-dark/90 z-0 pointer-events-none" />
      
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none flex justify-center">
        <div className="w-full max-w-5xl px-4 sm:px-6 lg:px-8 relative pointer-events-auto h-0">
          <div className="absolute top-6 right-4 sm:right-6 lg:right-8 flex items-center gap-2 sm:gap-3 flex-row-reverse">
              {/* Refresh Button */}
              <Tooltip content={t('refresh')} position="bottom">
                  <button 
                      onClick={loadWeather} 
                      className="p-3 bg-white/80 dark:bg-black/20 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-black/40 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label={t('refresh')}
                  >
                      <Icon name="refresh" className={`text-2xl ${loadingWeather ? 'animate-spin' : ''}`} />
                  </button>
              </Tooltip>

              <Tooltip content={t('search')} position="bottom">
                  <button
                      onClick={() => setIsSearchOpen(v => !v)}
                      className="p-3 bg-white/80 dark:bg-black/20 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-black/40 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label={t('search')}
                  >
                      <Icon name="search" className="text-2xl" />
                  </button>
              </Tooltip>

              <Tooltip content={isFavorite(location) ? t('remove_favorite') : t('add_favorite')} position="bottom">
                  <button
                      onClick={toggleFavorite}
                      className="p-3 bg-white/80 dark:bg-black/20 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-black/40 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label="Toggle Favorite"
                  >
                      <Icon name={isFavorite(location) ? "favorite" : "favorite_border"} className={`text-2xl ${isFavorite(location) ? 'text-red-500' : ''}`} />
                  </button>
              </Tooltip>

              <Tooltip content={t('nav.country_map')} position="bottom">
                  <button
                      onClick={() => onNavigate(ViewState.COUNTRY_MAP)}
                      className="p-3 bg-white/80 dark:bg-black/20 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-black/40 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label="Country Map"
                  >
                      <Icon name="public" className="text-2xl" />
                  </button>
              </Tooltip>

              <Tooltip content={t('nav.map')} position="bottom">
                  <button
                      onClick={() => onNavigate(ViewState.MAP)}
                      className="p-3 bg-white/80 dark:bg-black/20 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-black/40 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label={t('nav.map')}
                  >
                      <Icon name="map" className="text-2xl" />
                  </button>
              </Tooltip>

              <Tooltip content={t('favorites_list') || 'Favorietenlijst'} position="bottom">
                  <button
                      onClick={() => setShowFavorites(true)}
                      className="p-3 bg-white/80 dark:bg-black/20 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-black/40 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label="Favorites List"
                  >
                      <Icon name="list" className="text-2xl" />
                  </button>
              </Tooltip>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Header */}
        <div className="flex flex-col pt-32 pb-4">
            <div className="flex items-center justify-center relative px-4 mb-2">
                <button onClick={() => cycleFavorite('prev')} className="absolute left-6 text-slate-400 dark:text-white/60 hover:text-slate-800 dark:hover:text-white transition-colors p-2" disabled={settings.favorites.length === 0}>
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
                            <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-md dark:drop-shadow-md text-slate-800 dark:text-white">
                                <Icon name="location_on" className="text-primary" />
                                {location.name}, {location.country}
                            </h2>
                            {localTime && (
                                <p className="text-slate-500 dark:text-white/80 text-sm font-medium mt-1 flex items-center gap-2">
                                    <Icon name="schedule" className="text-xs" />
                                    {localTime} 
                                    {timeDiff && <span className="bg-slate-200 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-slate-600 dark:text-white">{timeDiff}</span>}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <button onClick={() => cycleFavorite('next')} className="absolute right-6 text-slate-400 dark:text-white/60 hover:text-slate-800 dark:hover:text-white transition-colors p-2" disabled={settings.favorites.length === 0}>
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
                                 geo.getCurrentPosition(async (pos) => {
                                     const lat = pos.coords.latitude;
                                     const lon = pos.coords.longitude;
                                     let name = t('my_location');
                                     
                                     // Try to get actual city name
                                 const cityName = await reverseGeocode(lat, lon);
                                 if (cityName) {
                                     name = cityName;
                                 }

                                     const loc: Location = {
                                         name: name,
                                         country: "",
                                         lat: lat,
                                         lon: lon,
                                         isCurrentLocation: true
                                     };

                                     saveLastKnownMyLocation(loc);
                                     setLastKnownMyLocation(loc);
                                     setLocation(loc);
                                     setLoadingCity(false);
                                 }, (err) => {
                                     console.error("Geolocation error", err);
                                     setLoadingCity(false);
                                     // Optional: show error toast
                                 });
                             }
                         }}
                         className={`flex items-center gap-1 px-4 py-2 rounded-full whitespace-nowrap backdrop-blur-md shadow-sm transition-colors border ${location.isCurrentLocation ? 'bg-primary text-white dark:bg-white dark:text-slate-800 font-bold border-primary dark:border-white' : 'bg-white/60 dark:bg-white/10 text-slate-800 dark:text-white hover:bg-white dark:hover:bg-primary/20 hover:text-primary dark:hover:text-primary border-slate-200 dark:border-white/5'}`}
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

        {isSearchOpen && (
            <div className="fixed top-20 right-6 z-[60] w-[340px] max-w-[90vw] bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-3 backdrop-blur-md">
                <div className="flex gap-2">
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            searchCities();
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && searchCities()}
                        placeholder={t('search')}
                        className="flex-1 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-800 dark:text-white placeholder-slate-600 dark:placeholder-white/30 focus:outline-none focus:border-primary"
                    />
                    <button
                        onClick={searchCities}
                        disabled={loadingSearch || !searchQuery.trim()}
                        className="px-3 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                    >
                        <Icon name={loadingSearch ? 'hourglass_empty' : 'arrow_forward'} />
                    </button>
                </div>
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {searchResults.map((res, idx) => (
                        <button
                            key={`${res.name}-${idx}`}
                            onClick={() => handleSelectSearchResult(res)}
                            className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-left"
                        >
                            <span className="font-medium">{res.name}</span>
                            <span className="text-xs opacity-60">{res.country}</span>
                        </button>
                    ))}
                    {searchResults.length === 0 && !loadingSearch && searchQuery.trim() && (
                        <p className="text-xs text-slate-500 dark:text-white/60 px-2">{t('no_data_available')}</p>
                    )}
                </div>
            </div>
        )}

        {loadingWeather ? (
            <div className="flex-grow flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full"></div>
            </div>
        ) : weatherData ? (
            <>
                <div className="flex-grow flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in duration-500 text-white">
                    <div className="flex items-center gap-4">
                        <h1 className="text-[100px] font-bold leading-none tracking-tighter drop-shadow-2xl font-display">
                            {currentTemp}°
                        </h1>
                        <div className="flex flex-row gap-2">
                            {feelsLike < 10 ? (
                                <div className="flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-2 border border-slate-200 dark:border-white/10 shadow-sm cursor-pointer hover:scale-105 transition-transform group relative w-[70px] h-[70px]">
                                    <Icon name="thermostat" className="text-xl text-blue-500 dark:text-blue-300" />
                                    <span className="text-lg font-bold">{Math.round(feelsLike)}°</span>
                                    <span className="text-[9px] uppercase text-slate-500 dark:text-white/60">{t('feels_like')}</span>
                                </div>
                            ) : (
                                heatIndex > currentTemp && (
                                    <div className="flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-2 border border-slate-200 dark:border-white/10 shadow-sm cursor-pointer hover:scale-105 transition-transform group relative w-[70px] h-[70px]">
                                        <Icon name="thermostat" className="text-xl text-orange-500 dark:text-orange-300" />
                                        <span className="text-lg font-bold">{Math.round(heatIndex)}°</span>
                                        <span className="text-[9px] uppercase text-slate-500 dark:text-white/60">{t('heat_index')}</span>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                    <p className="text-2xl font-medium tracking-wide drop-shadow-md mt-2 flex items-center gap-2">
                         <Icon name={mapWmoCodeToIcon(weatherData.current.weather_code, weatherData.current.is_day === 0)} className="text-3xl" />
                        {mapWmoCodeToText(weatherData.current.weather_code, settings.language)}
                    </p>
                    <p className="text-white/90 text-lg font-normal drop-shadow-md mt-1">
                        H:{highTemp}° L:{lowTemp}°
                    </p>
                    <p className="text-white/70 text-sm font-normal drop-shadow-md mt-2">
                        {t('measured')}: {weatherData.current.time ? new Date(weatherData.current.time).toLocaleString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            day: 'numeric',
                            month: 'short',
                            hour12: settings.timeFormat === '12h'
                        }) : t('no_data_available')}
                    </p>
                </div>

                <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-2xl rounded-t-[40px] border-t border-slate-200 dark:border-white/10 p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom duration-500 text-slate-800 dark:text-white transition-colors">

                    <div className="mb-6">
                        <div className="flex items-center gap-2 mb-1">
                            <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-white/40">{t('ensemble.model')}</label>
                            <button 
                                onClick={() => onNavigate(ViewState.MODEL_INFO)}
                                className="text-slate-400 hover:text-primary transition-colors"
                            >
                                <Icon name="info" className="text-sm" />
                            </button>
                        </div>
                        <div className="relative">
                            <select 
                                value={selectedModel} 
                                onChange={(e) => setSelectedModel(e.target.value as EnsembleModel)}
                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-lg px-3 py-2 appearance-none text-xs font-medium text-slate-600 dark:text-slate-300 outline-none focus:border-primary/50 transition-colors cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10"
                            >
                                <option value="icon_seamless" className="text-slate-800 bg-white">DWD ICON EPS Seamless</option>
                                <option value="icon_global" className="text-slate-800 bg-white">DWD ICON EPS Global</option>
                                <option value="icon_eu" className="text-slate-800 bg-white">DWD ICON EPS EU</option>
                                <option value="icon_d2" className="text-slate-800 bg-white">DWD ICON EPS D2</option>
                                <option value="gfs_seamless" className="text-slate-800 bg-white">GFS Ensemble Seamless</option>
                                <option value="gfs025" className="text-slate-800 bg-white">GFS Ensemble 0.25°</option>
                                <option value="gfs05" className="text-slate-800 bg-white">GFS Ensemble 0.5°</option>
                                <option value="ecmwf_ifs025" className="text-slate-800 bg-white">ECMWF IFS 0.25°</option>
                                <option value="ecmwf_aifs025" className="text-slate-800 bg-white">ECMWF AIFS 0.25°</option>
                                <option value="gem_global" className="text-slate-800 bg-white">GEM Global Ensemble</option>
                                <option value="bom_access_global" className="text-slate-800 bg-white">BOM ACCESS Global</option>
                                <option value="metoffice_global" className="text-slate-800 bg-white">UK MetOffice Global 20km</option>
                                <option value="metoffice_uk" className="text-slate-800 bg-white">UK MetOffice UK 2km</option>
                                <option value="icon_ch1_eps" className="text-slate-800 bg-white">MeteoSwiss ICON CH1</option>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <Icon name="expand_more" className="text-sm" />
                            </div>
                        </div>
                    </div>
                    
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
                                        <RechartsTooltip 
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

                    {/* --- MOST COMPLETE DETAIL SECTION --- */}
                    <div className="mt-8">
                        <h3 className="text-lg font-bold mb-4">{t('detail_title')}</h3>
                        
                        {/* Activities Section */}
                        {currentActivityScores.length > 0 && (
                            <>
                                <p className="text-xs text-slate-500 dark:text-white/60 mb-2 italic">
                                    Activiteitenscores op basis van actuele weersomstandigheden (momentopname)
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                    {currentActivityScores.map(score => (
                                    <div key={score.type} className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-200 dark:border-white/5 flex items-center justify-between shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg bg-white dark:bg-white/5 ${getScoreColor(score.score10)}`}>
                                                <Icon name={getActivityIcon(score.type)} className="text-xl" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm capitalize">{t('activity.' + score.type)}</p>
                                                <p className="text-[10px] text-slate-500 dark:text-white/60 italic">"{score.text}"</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className={`text-xl font-bold ${getScoreColor(score.score10)}`}>{score.score10}</span>
                                            <div className="flex gap-0.5">
                                                {[1,2,3,4,5].map(s => {
                                                    const isFull = s <= score.stars;
                                                    const isHalf = !isFull && (s - 0.5 <= score.stars);
                                                    
                                                    if (isHalf) {
                                                        return (
                                                            <div key={s} className="relative w-[12px] h-[12px]">
                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                    <Icon name="star" className="text-[12px] text-slate-200 dark:text-white/10" />
                                                                </div>
                                                                <div className="absolute inset-y-0 left-0 w-[50%] overflow-hidden">
                                                                    <div className="w-[12px] h-full flex items-center justify-center">
                                                                         <Icon name="star" className="text-[12px] text-yellow-400 drop-shadow-sm" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    
                                                    return (
                                                        <div key={s} className="w-[12px] h-[12px] flex items-center justify-center">
                                                            <Icon 
                                                                name="star" 
                                                                className={`text-[12px] ${isFull ? "text-yellow-400 drop-shadow-sm" : "text-slate-200 dark:text-white/10"}`} 
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                        )}
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {/* Thermodynamics */}
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm relative group">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="thermostat" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('feels_like')}</p>
                                    <p className="text-sm font-bold">{Math.round(feelsLike)}°</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="humidity_percentage" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('humidity')}</p>
                                    <p className="text-sm font-bold">{weatherData.current.relative_humidity_2m}%</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="water_drop" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('dew_point')}</p>
                                    <p className="text-sm font-bold">{Math.round(convertTemp(dewPoint, settings.tempUnit))}°</p>
                                </div>
                            </div>

                            {/* Clouds & Vis */}
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="visibility" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('visibility')}</p>
                                    <p className="text-sm font-bold">{Math.round(getCurrentHourly('visibility') / 1000)} km</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="cloud" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('cloud_cover')}</p>
                                    <p className="text-sm font-bold">{weatherData.current.cloud_cover}%</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="cloud_queue" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('current.cloud_levels')}</p>
                                    <p className="text-[10px] font-bold">{getCurrentHourly('cloud_cover_low')}/{getCurrentHourly('cloud_cover_mid')}/{getCurrentHourly('cloud_cover_high')}%</p>
                                </div>
                            </div>

                            {/* Wind */}
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="air" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('wind')}</p>
                                    <p className="text-sm font-bold">{windSpeed} {settings.windUnit}</p>
                                </div>
                            </div>
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="cyclone" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('wind_gusts')}</p>
                                    <p className="text-sm font-bold">{convertWind(weatherData.current.wind_gusts_10m, settings.windUnit)} {settings.windUnit}</p>
                                </div>
                            </div>
                            
                            {/* Atmosphere */}
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="compress" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('pressure')}</p>
                                    <p className="text-sm font-bold">{convertPressure(weatherData.current.surface_pressure, settings.pressureUnit)} {settings.pressureUnit}</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="speed" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('pressure_msl')}</p>
                                    <p className="text-sm font-bold">{convertPressure(weatherData.current.pressure_msl, settings.pressureUnit)} {settings.pressureUnit}</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="filter_drama" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('vapor_pressure')}</p>
                                    <p className="text-sm font-bold">{getCurrentHourly('vapour_pressure_deficit')} kPa</p>
                                </div>
                            </div>

                            {/* Sun & Water */}
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="wb_sunny" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('uv_max')}</p>
                                    <p className="text-sm font-bold">{weatherData.daily.uv_index_max[0]}</p>
                                </div>
                            </div>
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="timelapse" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('sunshine')}</p>
                                    <p className="text-sm font-bold">{Math.round(weatherData.daily.sunshine_duration[0] / 3600)}h {Math.round((weatherData.daily.sunshine_duration[0] % 3600) / 60)}m</p>
                                </div>
                            </div>
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="opacity" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('evapotranspiration')}</p>
                                    <p className="text-sm font-bold">{weatherData.daily.et0_fao_evapotranspiration[0]}mm</p>
                                </div>
                            </div>

                            {/* Deep Soil Profile Header */}
                            <div className="col-span-2 md:col-span-3 mt-2">
                                <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-white/60 border-b border-slate-200 dark:border-white/10 pb-1 mb-2">{t('current.deep_soil_profile')}</h4>
                            </div>
                            
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="grass" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('soil_temp_0cm')}</p>
                                    <p className="text-sm font-bold">{convertTemp(getCurrentHourly('soil_temperature_0cm'), settings.tempUnit)}°</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="grass" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('soil_temp_6cm')}</p>
                                    <p className="text-sm font-bold">{convertTemp(getCurrentHourly('soil_temperature_6cm'), settings.tempUnit)}°</p>
                                </div>
                            </div>
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="grass" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('soil_temp_18cm')}</p>
                                    <p className="text-sm font-bold">{convertTemp(getCurrentHourly('soil_temperature_18cm'), settings.tempUnit)}°</p>
                                </div>
                            </div>
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="water" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('soil_moist_0_1')}</p>
                                    <p className="text-sm font-bold">{getCurrentHourly('soil_moisture_0_to_1cm')} m³/m³</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="water" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('soil_moist_3_9')}</p>
                                    <p className="text-sm font-bold">{getCurrentHourly('soil_moisture_3_to_9cm')} m³/m³</p>
                                </div>
                            </div>
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="water" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('soil_moist_27_81')}</p>
                                    <p className="text-sm font-bold">{getCurrentHourly('soil_moisture_27_to_81cm')} m³/m³</p>
                                </div>
                            </div>

                             {/* Atmosphere Profile Header */}
                             <div className="col-span-2 md:col-span-3 mt-2">
                                <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-white/60 border-b border-slate-200 dark:border-white/10 pb-1 mb-2">{t('current.atmosphere_profile')}</h4>
                            </div>

                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="wind_power" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('wind_80m')}</p>
                                    <p className="text-sm font-bold">{convertWind(getCurrentHourly('wind_speed_80m'), settings.windUnit)} {settings.windUnit}</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="wind_power" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('wind_120m')}</p>
                                    <p className="text-sm font-bold">{convertWind(getCurrentHourly('wind_speed_120m'), settings.windUnit)} {settings.windUnit}</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="wind_power" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('wind_180m')}</p>
                                    <p className="text-sm font-bold">{convertWind(getCurrentHourly('wind_speed_180m'), settings.windUnit)} {settings.windUnit}</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="thermostat" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('temp_80m')}</p>
                                    <p className="text-sm font-bold">{convertTemp(getCurrentHourly('temperature_80m'), settings.tempUnit)}°</p>
                                </div>
                            </div>
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="thermostat" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('temp_180m')}</p>
                                    <p className="text-sm font-bold">{convertTemp(getCurrentHourly('temperature_180m'), settings.tempUnit)}°</p>
                                </div>
                            </div>
                            
                            {/* Precip Daily */}
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="umbrella" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('precip_prob')}</p>
                                    <p className="text-sm font-bold">{weatherData.daily.precipitation_probability_max[0]}%</p>
                                </div>
                            </div>
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="rainy" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('today')} {t('precip')}</p>
                                    <p className="text-sm font-bold">{convertPrecip(weatherData.daily.precipitation_sum[0], settings.precipUnit)} {settings.precipUnit}</p>
                                </div>
                            </div>
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="wb_twilight" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('daylight')}</p>
                                    <p className="text-sm font-bold">{Math.round(weatherData.daily.daylight_duration[0] / 3600)}h {Math.round((weatherData.daily.daylight_duration[0] % 3600) / 60)}m</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-slate-200 dark:border-white/5">
                        <div className="text-center mb-6">
                            <h3 className="text-lg font-bold mb-4">{t('explore_world')}</h3>
                            <p className="text-slate-500 dark:text-white/60 text-sm">{t('lucky_compass')}</p>
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
                                        className="absolute top-1/2 left-1/2 -ml-5 -mt-5 size-10 rounded-full bg-white dark:bg-background-dark border border-slate-200 dark:border-white/10 hover:bg-primary hover:border-primary hover:text-white flex items-center justify-center font-bold text-xs transition-all duration-300 disabled:opacity-50 shadow-lg z-10 text-slate-700 dark:text-white"
                                        style={style}
                                     >
                                         {t(`dir.${dir}`)}
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
                                        <span className="text-[10px] font-bold uppercase tracking-widest">{t('current.lucky')}</span>
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
      <FavoritesList 
          isOpen={showFavorites}
          onClose={() => setShowFavorites(false)}
          favorites={settings.favorites}
          myLocation={lastKnownMyLocation}
          onSelectLocation={(loc) => {
              setLocation(loc);
              setShowFavorites(false);
          }}
          settings={settings}
      />
      <WelcomeModal 
          isOpen={showWelcomeModal} 
          onClose={() => {
              setShowWelcomeModal(false);
              localStorage.setItem('hasSeenWelcome', 'true');
          }} 
      />
    </div>
  );
};
