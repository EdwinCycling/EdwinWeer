
import React, { useState, useEffect, useRef } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse, EnsembleModel, ActivityType } from '../types';
import { calculateActivityScore, ActivityScore } from '../services/activityService';
import { getVisiblePlanets } from '../services/astronomyService';
import { Icon } from '../components/Icon';
import { getLuckyCity } from '../services/geminiService';
import { fetchForecast, mapWmoCodeToIcon, mapWmoCodeToText, getMoonPhaseText, calculateMoonPhase, getMoonPhaseIcon, getBeaufortDescription, getBeaufort, convertTemp, convertTempPrecise, convertWind, convertPrecip, convertPressure, calculateHeatIndex, calculateJagTi, getWindDirection, calculateDewPoint as calculateDewPointMagnus, calculateComfortScore } from '../services/weatherService';
import { searchCityByName, reverseGeocode } from '../services/geoService';
import { loadCurrentLocation, saveCurrentLocation, loadEnsembleModel, saveEnsembleModel, loadSettings, loadLastKnownMyLocation, saveLastKnownMyLocation } from '../services/storageService';
import { WeatherBackground } from '../components/WeatherBackground';
import { StaticWeatherBackground } from '../components/StaticWeatherBackground';
import { MoonPhaseVisual } from '../components/MoonPhaseVisual';
import { Tooltip as RechartsTooltip, AreaChart, Area, XAxis, ResponsiveContainer } from 'recharts';
import { Tooltip } from '../components/Tooltip';
import { FavoritesList } from '../components/FavoritesList';
import { getTranslation } from '../services/translations';
import { WelcomeModal } from '../components/WelcomeModal';
import { Modal } from '../components/Modal';
import { FeelsLikeInfoModal } from '../components/FeelsLikeInfoModal';
import { ComfortScoreModal } from '../components/ComfortScoreModal';
import { CreditFloatingButton } from '../components/CreditFloatingButton';
import { WeatherRatingButton } from '../components/WeatherRatingButton';
import { StarMapModal } from '../components/StarMapModal';
import { HorizonCompassView } from '../components/HorizonCompassView';
import { getUsage } from '../services/usageService';
import { useLocationSwipe } from '../hooks/useLocationSwipe';

interface Props {
  onNavigate: (view: ViewState, params?: any) => void;
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
  const [showFeelsLikeModal, setShowFeelsLikeModal] = useState(false);
  const [showComfortModal, setShowComfortModal] = useState(false);
  const [showStarMap, setShowStarMap] = useState(false);
  const [showHorizon, setShowHorizon] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitError, setLimitError] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
        const activeBtn = scrollContainerRef.current.querySelector('[data-active="true"]');
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
  }, [location]);

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
        const data = await fetchForecast(location.lat, location.lon);
        
        // Check for empty data
        if (!data || !data.current || !data.hourly) {
            setError(`${t('error_no_data_for_forecast')}`);
            setWeatherData(null);
            return;
        }

        setWeatherData(data);
    } catch (e: any) {
        console.error(e);
        if (e.message && e.message.includes("limit exceeded")) {
            setLimitError(e.message);
            setShowLimitModal(true);
        } else {
            setError(t('error'));
        }
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

  useLocationSwipe({
      onSwipeLeft: () => cycleFavorite('next'),
      onSwipeRight: () => cycleFavorite('prev'),
  });

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

        // Moonrise and Moonset
        const moonrise = weatherData.daily.moonrise?.[0];
        const moonset = weatherData.daily.moonset?.[0];

        const formatTime = (timeStr?: string) => {
            if (!timeStr) return '--:--';
            const date = new Date(timeStr);
            return date.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: settings.timeFormat === '12h' 
            });
        };

        // Calculate visible planets
        const now = new Date();
        // Safely get current location with fallback
        const currentLocation = settings.locations && settings.activeLocationIndex !== undefined 
            ? settings.locations[settings.activeLocationIndex] 
            : null;
        // Use coordinates from current location or fallback to Netherlands center
        const lat = currentLocation?.lat || 52.1;
        const lon = currentLocation?.lon || 5.2;
        
        const visiblePlanets = getVisiblePlanets(now, lat, lon, weatherData || undefined);

        return (
            <div className="bg-slate-100 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/5 relative overflow-hidden min-h-[180px] md:h-[180px] flex flex-col md:flex-row gap-4">
                {/* Left Section: Moon Phase */}
                <div className="flex-1 flex flex-col justify-between z-10 relative">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <Icon name="dark_mode" className="text-indigo-400 dark:text-indigo-300" />
                                <p className="text-slate-500 dark:text-white/50 text-xs font-bold uppercase">{t('moon_phase')}</p>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => {
                                        const credits = getUsage().weatherCredits;
                                        if (credits < 250) {
                                            setShowPremiumModal(true);
                                        } else {
                                            setShowHorizon(true);
                                        }
                                    }}
                                    className="text-[10px] bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 px-3 py-1 rounded-full font-bold hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-all active:scale-95 flex items-center gap-1.5 border border-indigo-100/50 dark:border-indigo-500/30 shadow-sm cursor-pointer"
                                >
                                    <Icon name="visibility" className="text-[12px]" />
                                    <span>Horizon</span>
                                </button>
                                <button 
                                    onClick={() => {
                                        const credits = getUsage().weatherCredits;
                                        if (credits < 250) {
                                            setShowPremiumModal(true);
                                        } else {
                                            setShowStarMap(true);
                                        }
                                    }}
                                    className="text-[10px] bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 px-3 py-1 rounded-full font-bold hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-all active:scale-95 flex items-center gap-1.5 border border-indigo-100/50 dark:border-indigo-500/30 shadow-sm cursor-pointer"
                                >
                                    <Icon name="public" className="text-[12px]" />
                                    <span>Sterrenkaart</span>
                                </button>
                            </div>
                        </div>
                        <p className="text-xl font-bold truncate text-slate-800 dark:text-white">{getMoonPhaseText(moonPhase, settings.language)}</p>
                    </div>

                    <div className="flex justify-between items-center mt-2">
                        <div className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-white/70">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <p>{t('moon.days_to_full')}: <span className="font-bold text-slate-800 dark:text-white">{daysToFull}</span></p>
                                <p>{t('moon.illumination')}: <span className="font-bold text-slate-800 dark:text-white">{illumination}%</span></p>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 dark:border-white/10 pt-1.5">
                                <div className="flex items-center gap-1">
                                    <Icon name="vertical_align_top" className="text-[14px] text-indigo-400" />
                                    <span>{t('moonrise')}: <span className="font-bold text-slate-800 dark:text-white">{formatTime(moonrise)}</span></span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Icon name="vertical_align_bottom" className="text-[14px] text-indigo-400" />
                                    <span>{t('moonset')}: <span className="font-bold text-slate-800 dark:text-white">{formatTime(moonset)}</span></span>
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0 ml-2">
                            <MoonPhaseVisual phase={moonPhase} size={settings.language === 'nl' ? 56 : 64} />
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className="hidden md:block w-px bg-slate-200 dark:bg-white/10 my-1"></div>
                <div className="md:hidden h-px bg-slate-200 dark:border-white/10 w-full opacity-50"></div>

                {/* Right Section: Visible Planets */}
                <div className="flex-1 z-10 relative overflow-hidden flex flex-col min-h-[100px] md:min-h-0">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-white/50">{t('moon.visible_planets')}</span>
                        <span className="text-[9px] text-slate-400">{t('tonight')}</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin max-h-[120px] md:max-h-none">
                        <div className="flex flex-col gap-2">
                            {visiblePlanets.length > 0 ? visiblePlanets.map(p => (
                                <div key={p.name} className="bg-white/50 dark:bg-black/20 rounded-lg p-2 border border-slate-200 dark:border-white/5 flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-base">{p.icon}</span>
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 hidden sm:inline">{p.nameNl}</span>
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 sm:hidden">{p.nameNl.substring(0, 2)}</span>
                                        </div>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                            p.status === 'visible' 
                                            ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' 
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-500/20 dark:text-slate-400'
                                        }`}>
                                            {p.status === 'visible' ? (
                                                <>
                                                    <span className="hidden sm:inline">{t('visible')}</span>
                                                    <Icon name="visibility" className="text-[10px] sm:hidden" />
                                                </>
                                            ) : (
                                                <>
                                                    <span className="hidden sm:inline">{t('cloud_cover')}</span>
                                                    <Icon name="cloud" className="text-[10px] sm:hidden" />
                                                </>
                                            )}
                                        </span>
                                    </div>
                                    
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pl-6">
                                        <span>Best: <span className="font-medium text-slate-700 dark:text-slate-200">{p.bestTime}</span></span>
                                        <span>{p.direction} • {p.altitude}°</span>
                                    </div>

                                    {p.conjunction && (
                                        <div className="mt-0.5 text-[9px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 pl-6">
                                            <Icon name="auto_awesome" className="text-[10px]" />
                                            {p.conjunction}
                                        </div>
                                    )}
                                </div>
                            )) : (
                                <div className="text-xs text-slate-400 italic text-center py-4">{t('moon.no_planets_visible')}</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Background Decoration */}
                <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                     <Icon name="dark_mode" className="text-8xl" />
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
                 <div className="flex items-center gap-1 bg-white/50 dark:bg-slate-800 px-2 py-0.5 rounded-lg">
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

  const currentTemp = weatherData ? convertTempPrecise(weatherData.current.temperature_2m, settings.tempUnit) : 0;
  const highTemp = weatherData ? convertTemp(weatherData.daily.temperature_2m_max[0], settings.tempUnit) : 0;
  const lowTemp = weatherData ? convertTemp(weatherData.daily.temperature_2m_min[0], settings.tempUnit) : 0;
  
  // Use JAG/TI for feels like if applicable, otherwise fallback to apparent_temperature
  const jagTi = weatherData ? calculateJagTi(weatherData.current.temperature_2m, weatherData.current.wind_speed_10m) : null;
  const feelsLike = weatherData 
    ? (jagTi !== null ? convertTempPrecise(jagTi, settings.tempUnit) : convertTempPrecise(weatherData.current.apparent_temperature, settings.tempUnit))
    : 0;

  // Significant difference for feels like display
  const isFeelsLikeSignificant = Math.abs(feelsLike - currentTemp) >= 1;
  
  const windSpeed = weatherData ? convertWind(weatherData.current.wind_speed_10m, settings.windUnit) : 0;
  
  const dewPoint = weatherData ? calculateDewPointMagnus(weatherData.current.temperature_2m, weatherData.current.relative_humidity_2m) : 0;
  const heatIndexRaw = weatherData ? calculateHeatIndex(weatherData.current.temperature_2m, weatherData.current.relative_humidity_2m) : 0;
  const heatIndex = convertTemp(heatIndexRaw, settings.tempUnit);
  
  const currentComfort = weatherData ? calculateComfortScore({
      apparent_temperature: feelsLike,
      temperature_2m: currentTemp,
      wind_speed_10m: windSpeed,
      relative_humidity_2m: weatherData.current.relative_humidity_2m,
      precipitation_sum: weatherData.daily.precipitation_sum[0] || 0,
      cloud_cover: weatherData.current.cloud_cover,
      precipitation_probability: weatherData.daily.precipitation_probability_max?.[0] || 0,
      weather_code: weatherData.current.weather_code,
      wind_gusts_10m: weatherData.current.wind_gusts_10m,
      uv_index: weatherData.daily.uv_index_max?.[0] || 0
  }) : null;

  const todayExtremes = React.useMemo(() => {
    if (!weatherData) return null;

    const now = getLocationTime();
    // Use the date from weatherData.current.time or now to find "today" in the hourly data
    const currentTime = weatherData.current.time;
    const todayStr = currentTime.split('T')[0];

    let maxTemp = weatherData.current.temperature_2m;
    let minTemp = weatherData.current.temperature_2m;
    let maxTime = currentTime;
    let minTime = currentTime;
    let found = true;

    weatherData.hourly.time.forEach((time, index) => {
      // Only look at today, and only up to the current local time
      if (time.startsWith(todayStr) && time <= currentTime) {
        const temp = weatherData.hourly.temperature_2m[index];
        found = true;

        if (temp > maxTemp) {
          maxTemp = temp;
          maxTime = time;
        }
        if (temp < minTemp) {
          minTemp = temp;
          minTime = time;
        }
      }
    });

    if (!found) return null;

    const formatTime = (isoTime: string) => {
      const timePart = isoTime.split('T')[1]; // "HH:MM"
      if (settings.timeFormat === '12h') {
        let [hours, minutes] = timePart.split(':').map(Number);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
      }
      return timePart;
    };

    return {
      max: convertTempPrecise(maxTemp, settings.tempUnit),
      min: convertTempPrecise(minTemp, settings.tempUnit),
      maxTime: formatTime(maxTime),
      minTime: formatTime(minTime)
    };
    }, [weatherData, settings.tempUnit, settings.timeFormat]);
  
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

      const activities: ActivityType[] = ['bbq', 'cycling', 'walking', 'running', 'padel', 'tennis', 'field_sports'];
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
            case 'padel': return 'sports_tennis';
            case 'tennis': return 'sports_tennis';
            case 'field_sports': return 'sports_soccer';
            case 'golf': return 'sports_golf';
            case 'gardening': return 'yard';
            case 'beach': return 'beach_access';
            case 'stargazing': return 'nights_stay';
            default: return 'help';
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 8) return "text-green-500 dark:text-green-400";
        if (score >= 6) return "text-lime-500 dark:text-lime-400";
        if (score >= 4) return "text-orange-500 dark:text-orange-400";
        return "text-red-500 dark:text-red-400";
    };

    const pastHourIndex = weatherData ? Math.max(0, getLocationTime().getHours() - 1) : 0;
    const pastWindSpeed = weatherData ? convertWind(weatherData.hourly.wind_speed_10m[pastHourIndex], settings.windUnit) : 0;
    const pastWindSpeedRaw = weatherData ? weatherData.hourly.wind_speed_10m[pastHourIndex] : 0;
    const pastWindBft = getBeaufort(pastWindSpeedRaw);
    const pastWindGust = weatherData ? convertWind(weatherData.hourly.wind_gusts_10m[pastHourIndex], settings.windUnit) : 0;
    const pastWindDir = weatherData ? weatherData.hourly.wind_direction_10m[pastHourIndex] : 0;
    const pastWindDirText = getWindDirection(pastWindDir, settings.language);

  return (
    <div className="relative min-h-screen flex flex-col pb-20 overflow-y-auto overflow-x-hidden text-slate-800 dark:text-white bg-background-light dark:bg-background-dark transition-colors duration-300">
      
      {error && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white px-6 py-3 rounded-full shadow-lg backdrop-blur-md animate-bounce">
            <div className="flex items-center gap-2">
                <Icon name="error_outline" />
                <span className="font-medium">{error}</span>
            </div>
        </div>
      )}

      {weatherData && (
        <div className="absolute top-0 left-0 right-0 h-[90vh] md:h-[80vh] z-0 overflow-hidden rounded-b-[3rem]">
             <StaticWeatherBackground 
                weatherCode={weatherData.current.weather_code} 
                isDay={weatherData.current.is_day} 
                cloudCover={weatherData.current.cloud_cover}
                className="absolute inset-0 w-full h-full"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background-light dark:to-background-dark" />
        </div>
      )}

      <CreditFloatingButton onNavigate={onNavigate} settings={settings} />

      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent dark:from-black/60 dark:via-black/5 dark:to-background-dark/90 z-0 pointer-events-none" />
      
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none flex justify-center">
        <div className="w-full max-w-5xl px-4 sm:px-6 lg:px-8 relative pointer-events-auto h-0">
          
          {/* Language Selector removed as requested */}


          <div className="absolute top-2 right-4 sm:right-6 flex items-center gap-1 sm:gap-3 flex-row-reverse z-50">
              {/* Refresh Button */}
              <Tooltip content={t('refresh')} position="bottom">
                  <button 
                      onClick={loadWeather} 
                      className="p-2 sm:p-3 bg-white/80 dark:bg-slate-800 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label={t('refresh')}
                  >
                      <Icon name="refresh" className={`text-xl sm:text-2xl ${loadingWeather ? 'animate-spin' : ''}`} />
                  </button>
              </Tooltip>

              <Tooltip content={t('search')} position="bottom">
                  <button
                      onClick={() => setIsSearchOpen(v => !v)}
                      className="p-2 sm:p-3 bg-white/80 dark:bg-slate-800 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label={t('search')}
                  >
                      <Icon name="search" className="text-xl sm:text-2xl" />
                  </button>
              </Tooltip>

              <Tooltip content={isFavorite(location) ? t('remove_favorite') : t('add_favorite')} position="bottom">
                  <button
                      onClick={toggleFavorite}
                      className="p-2 sm:p-3 bg-white/80 dark:bg-slate-800 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label="Toggle Favorite"
                  >
                      <Icon name={isFavorite(location) ? "favorite" : "favorite_border"} className={`text-xl sm:text-2xl ${isFavorite(location) ? 'text-red-500' : ''}`} />
                  </button>
              </Tooltip>

              <Tooltip content={t('nav.country_map')} position="bottom">
                  <button
                      onClick={() => onNavigate(ViewState.COUNTRY_MAP)}
                      className="p-2 sm:p-3 bg-white/80 dark:bg-slate-800 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label="Country Map"
                  >
                      <Icon name="public" className="text-xl sm:text-2xl" />
                  </button>
              </Tooltip>

              <Tooltip content={t('nav.barometer')} position="bottom">
                  <button
                      onClick={() => onNavigate(ViewState.BAROMETER)}
                      className="p-2 sm:p-3 bg-white/80 dark:bg-slate-800 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label={t('nav.barometer')}
                  >
                      <Icon name="speed" className="text-xl sm:text-2xl" />
                  </button>
              </Tooltip>

              <Tooltip content={t('nav.map')} position="bottom">
                  <button
                      onClick={() => onNavigate(ViewState.MAP)}
                      className="p-2 sm:p-3 bg-white/80 dark:bg-slate-800 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label={t('nav.map')}
                  >
                      <Icon name="map" className="text-xl sm:text-2xl" />
                  </button>
              </Tooltip>

              <Tooltip content={t('favorites_list') || 'Favorietenlijst'} position="bottom">
                  <button
                      onClick={() => setShowFavorites(true)}
                      className="p-2 sm:p-3 bg-white/80 dark:bg-slate-800 backdrop-blur-md rounded-full text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      aria-label="Favorites List"
                  >
                      <Icon name="list" className="text-xl sm:text-2xl" />
                  </button>
              </Tooltip>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Header */}
        <div className="flex flex-col pt-20 pb-4">
            <div className="flex items-center justify-center relative px-4 mb-2">
                <button onClick={() => cycleFavorite('prev')} className="absolute left-4 p-2 rounded-full bg-white/30 dark:bg-black/20 backdrop-blur-md text-slate-700 dark:text-white/90 hover:bg-white/50 dark:hover:bg-black/40 transition-all shadow-sm disabled:opacity-0" disabled={settings.favorites.length === 0}>
                    <Icon name="chevron_left" className="text-3xl" />
                </button>

                <div className="text-center relative z-20">
                    {loadingCity ? (
                        <div className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                             <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                             <span className="font-medium text-white">{t('search')}</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center bg-black/20 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-lg">
                            <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-xl text-white">
                                <span className="md:hidden">{location.name.length > 15 ? location.name.slice(0, 15) + '...' : location.name}</span>
                                <span className="hidden md:inline">{location.name}, {location.country}</span>
                            </h2>
                            {localTime && (
                                <p className="text-white/90 text-sm font-medium mt-1 flex items-center gap-2">
                                    <Icon name="schedule" className="text-xs" />
                                    {localTime} 
                                    {timeDiff && <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] text-white">{timeDiff}</span>}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <button onClick={() => cycleFavorite('next')} className="absolute right-4 p-2 rounded-full bg-white/30 dark:bg-black/20 backdrop-blur-md text-slate-700 dark:text-white/90 hover:bg-white/50 dark:hover:bg-black/40 transition-all shadow-sm disabled:opacity-0" disabled={settings.favorites.length === 0}>
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
                            data-active={location.name === fav.name && !location.isCurrentLocation}
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
                        className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-800 dark:text-white placeholder-slate-600 dark:placeholder-white/30 focus:outline-none focus:border-primary"
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
                <div key={location.name} className="flex-grow flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in duration-500 text-white">
                    <div className="flex flex-col md:flex-row items-center gap-2 md:gap-8">
                        <h1 className="text-[80px] md:text-[110px] font-bold leading-none tracking-tighter drop-shadow-2xl font-display">
                            {typeof currentTemp === 'number' ? currentTemp.toFixed(1) : currentTemp}°
                        </h1>
                        <div className="grid grid-cols-3 gap-2 md:flex md:flex-row">
                            {weatherData.current.temperature_2m < 10 && (
                                <div onClick={() => setShowFeelsLikeModal(true)} className="flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-2 border border-slate-200 dark:border-white/10 shadow-sm cursor-pointer hover:scale-105 transition-transform group relative w-[75px] h-[85px] md:w-[80px] md:h-[100px]">
                                    <Icon name="thermostat" className={`text-lg md:text-xl ${feelsLike < currentTemp ? 'text-blue-500 dark:text-blue-300' : 'text-orange-500 dark:text-orange-300'}`} />
                                    <span className="text-base md:text-lg font-bold">{feelsLike.toFixed(1)}°</span>
                                    <span className="text-[8px] md:text-[9px] uppercase text-slate-500 dark:text-white/60 text-center">{t('feels_like')}</span>
                                </div>
                            )}
                            {weatherData.current.temperature_2m > 25 && (
                                <div onClick={() => setShowFeelsLikeModal(true)} className="flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-2 border border-slate-200 dark:border-white/10 shadow-sm cursor-pointer hover:scale-105 transition-transform group relative w-[75px] h-[85px] md:w-[80px] md:h-[100px]">
                                    <Icon name="thermostat" className="text-lg md:text-xl text-orange-500 dark:text-orange-300" />
                                    <span className="text-base md:text-lg font-bold">{heatIndex}°</span>
                                    <span className="text-[8px] md:text-[9px] uppercase text-slate-500 dark:text-white/60 text-center">{t('heat_index')}</span>
                                </div>
                            )}

                            {/* Wind Box (New Compass Style) */}
                            <div className="relative flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-1 border border-slate-200 dark:border-white/10 shadow-sm w-[75px] h-[85px] md:w-[80px] md:h-[100px] overflow-hidden">
                                {/* Compass Background */}
                                <div className="absolute inset-1 rounded-full border-2 border-slate-300/50 dark:border-white/10" />
                                <div className="absolute top-1 text-[8px] font-bold text-slate-400">N</div>
                                <div className="absolute bottom-1 text-[8px] font-bold text-slate-400">{settings.language === 'nl' ? 'Z' : 'S'}</div>
                                <div className="absolute left-1 text-[8px] font-bold text-slate-400">W</div>
                                <div className="absolute right-1 text-[8px] font-bold text-slate-400">{settings.language === 'nl' ? 'O' : 'E'}</div>

                                {/* Rotating Arrow */}
                                <div 
                                    className="absolute inset-0 flex items-center justify-center transition-transform duration-700 ease-out"
                                    style={{ transform: `rotate(${pastWindDir}deg)` }}
                                >
                                    <Icon name="north" className="text-xl md:text-2xl text-red-500 absolute top-2 md:top-3" />
                                </div>

                                {/* Center Value */}
                                <div className="z-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-full w-10 h-10 flex flex-col items-center justify-center shadow-sm border border-slate-100 dark:border-white/5">
                                    <span className="text-sm md:text-base font-bold leading-none">{pastWindBft}</span>
                                    <span className="text-[8px] font-medium leading-none opacity-70">bft</span>
                                </div>
                            </div>

                            {currentComfort && (
                                <div className="w-[75px] h-[85px] md:w-auto md:h-auto flex items-center justify-center">
                                    <WeatherRatingButton 
                                        score={currentComfort} 
                                        onClick={() => setShowComfortModal(true)} 
                                        className="w-full h-full md:min-w-[70px] md:w-auto"
                                        label={t('weather_rating')}
                                    />
                                </div>
                            )}

                            {/* 48h Forecast Link (Now also on Mobile) */}
                            <div 
                                onClick={() => onNavigate(ViewState.HOURLY_DETAIL)}
                                className="flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-2 border border-slate-200 dark:border-white/10 shadow-sm w-[75px] h-[85px] md:min-w-[70px] md:h-[100px] cursor-pointer hover:scale-105 transition-transform group"
                            >
                                <Icon name="schedule" className="text-lg md:text-xl text-slate-700 dark:text-white" />
                                <span className="text-base md:text-lg font-bold">48u</span>
                                <span className="text-[8px] md:text-[9px] uppercase text-slate-500 dark:text-white/60 text-center">{t('forecast')}</span>
                            </div>

                            {/* Past 24h Link (Terugblik) (Now also on Mobile) */}
                            <div 
                                onClick={() => onNavigate(ViewState.HOURLY_DETAIL, { mode: 'history', title: t('past_24h'), subtitle: '24 uur' })}
                                className="flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-2 border border-slate-200 dark:border-white/10 shadow-sm w-[75px] h-[85px] md:min-w-[70px] md:h-[100px] cursor-pointer hover:scale-105 transition-transform group"
                            >
                                <Icon name="history" className="text-lg md:text-xl text-slate-700 dark:text-white" />
                                <span className="text-base md:text-lg font-bold">24u</span>
                                <span className="text-[8px] md:text-[9px] uppercase text-slate-500 dark:text-white/60 text-center">{t('past_24h')}</span>
                            </div>

                            {/* Today's Extremes (Min/Max with time) */}
                            {todayExtremes && (
                                <div className="flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-2 border border-slate-200 dark:border-white/10 shadow-sm min-w-[75px] h-[85px] md:min-w-[85px] md:h-[100px]">
                                    <div className="flex flex-col items-center gap-1 w-full">
                                        <div className="flex flex-col w-full px-1">
                                            <div className="flex items-center justify-between w-full">
                                                <span className="text-sm font-bold text-red-500 dark:text-red-400">{todayExtremes.max}°</span>
                                                <span className="text-[10px] font-medium text-slate-600 dark:text-white/80">{todayExtremes.maxTime}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col w-full px-1 border-t border-slate-200 dark:border-white/10 pt-1">
                                            <div className="flex items-center justify-between w-full">
                                                <span className="text-sm font-bold text-blue-500 dark:text-blue-400">{todayExtremes.min}°</span>
                                                <span className="text-[10px] font-medium text-slate-600 dark:text-white/80">{todayExtremes.minTime}</span>
                                            </div>
                                        </div>
                                        <span className="text-[9px] uppercase text-slate-500 dark:text-white/60 text-center mt-0.5 font-bold tracking-wider">{t('weather.today_label')}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <p className="text-2xl font-medium tracking-wide drop-shadow-md mt-2 flex items-center gap-2">
                         <Icon name={mapWmoCodeToIcon(weatherData.current.weather_code, weatherData.current.is_day === 0)} className="text-3xl" />
                        {mapWmoCodeToText(weatherData.current.weather_code, settings.language)}
                    </p>
                    <button 
                        onClick={() => onNavigate(ViewState.FORECAST)}
                        className="text-white/90 text-lg font-normal drop-shadow-md mt-1 hover:scale-105 transition-transform cursor-pointer flex items-center gap-1"
                    >
                        H:{highTemp}° L:{lowTemp}° <Icon name="arrow_forward" className="text-sm opacity-70" />
                    </button>
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
                            className="flex overflow-x-auto scrollbar-hide -mx-6 px-6 pb-4 gap-5 cursor-pointer no-swipe"
                            data-no-swipe="true"
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
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-1 sm:gap-4">
                                <h3 className="text-blue-600 dark:text-blue-200 text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                                    <Icon name="rainy" /> {t('precip_forecast')}
                                </h3>
                                <span className="text-[10px] sm:text-xs text-blue-400 dark:text-blue-200/60">{t('coming_2_hours')}</span>
                            </div>
                            <div className="h-32 w-full">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                                 <div 
                                    onClick={() => onNavigate(ViewState.HOURLY_DETAIL)}
                                    className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                                 >
                                     <Icon name="ac_unit" className="text-red-400 dark:text-red-300 text-xl" />
                                     <div>
                                         <p className="text-red-600 dark:text-red-200 font-bold text-sm">{t('frost_warning')}</p>
                                         <p className="text-red-500 dark:text-red-200/60 text-xs">{t('frost_desc')}</p>
                                     </div>
                                 </div>
                             )}
                             {rainAlert && (
                                 <div 
                                    onClick={() => onNavigate(ViewState.HOURLY_DETAIL)}
                                    className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-500/10 transition-colors"
                                 >
                                     <Icon name="rainy" className="text-blue-400 dark:text-blue-300 text-xl" />
                                     <div>
                                        <p className="text-blue-600 dark:text-blue-200 font-bold text-sm">{t('rain_expected')}</p>
                                        <p className="text-blue-500 dark:text-blue-200/60 text-xs">
                                            {rainAlert.inHours === 0 
                                                ? t('rain.raining_now')
                                                : t('rain_desc').replace('{hours}', rainAlert.inHours.toString()).replace('{time}', rainAlert.time).replace('{amount}', rainAlert.amount.toString() + settings.precipUnit)
                                            }
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
                                    <div key={score.type} className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-200 dark:border-white/5 flex flex-row items-center justify-between shadow-sm gap-2">
                                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                            <div className={`p-2 rounded-lg bg-white dark:bg-white/5 shrink-0 ${getScoreColor(score.score10)}`}>
                                                <Icon name={getActivityIcon(score.type)} className="text-lg sm:text-xl" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-xs sm:text-sm capitalize truncate">{t('activity.' + score.type)}</p>
                                                <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-white/60 italic truncate">"{score.text}"</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end shrink-0">
                                            <span className={`text-lg sm:text-xl font-bold ${getScoreColor(score.score10)}`}>{score.score10}</span>
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
                            <div onClick={() => setShowFeelsLikeModal(true)} className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm relative group cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="thermostat" /></div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60">{t('feels_like')}</p>
                                    <p className="text-sm font-bold">{Math.round(feelsLike)}°</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg"><Icon name="humidity_percentage" /></div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60 truncate">{t('humidity')}</p>
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
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg shrink-0"><Icon name="cyclone" /></div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60 truncate">{t('wind_gusts')}</p>
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
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg shrink-0"><Icon name="speed" /></div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60 truncate">{t('pressure_msl')}</p>
                                    <p className="text-sm font-bold">{convertPressure(weatherData.current.pressure_msl, settings.pressureUnit)} {settings.pressureUnit}</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg shrink-0"><Icon name="filter_drama" /></div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60 truncate">{t('vapor_pressure')}</p>
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
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg shrink-0"><Icon name="opacity" /></div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60 truncate">{t('evapotranspiration')}</p>
                                    <p className="text-sm font-bold">{weatherData.daily.et0_fao_evapotranspiration[0]}mm</p>
                                </div>
                            </div>

                            {/* Deep Soil Profile Header */}
                            <div className="col-span-2 md:col-span-3 mt-2">
                                <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-white/60 border-b border-slate-200 dark:border-white/10 pb-1 mb-2">{t('current.deep_soil_profile')}</h4>
                            </div>
                            
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg shrink-0"><Icon name="grass" /></div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60 truncate">{t('soil_temp_0cm')}</p>
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
                             <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg shrink-0"><Icon name="water" /></div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60 truncate">{t('soil_moist_0_1')}</p>
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
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-3 border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                                <div className="bg-white dark:bg-white/5 p-2 rounded-lg shrink-0"><Icon name="umbrella" /></div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/60 truncate">{t('precip_prob')}</p>
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
          settings={settings}
          onUpdateSettings={onUpdateSettings}
      />
      <FeelsLikeInfoModal 
          isOpen={showFeelsLikeModal}
          onClose={() => setShowFeelsLikeModal(false)}
          settings={settings}
      />
      
      <ComfortScoreModal 
          isOpen={showComfortModal}
          onClose={() => setShowComfortModal(false)}
          settings={settings}
      />
      
      {/* API Limit Modal */}
      <Modal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        title={t('error')}
      >
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 text-red-500 bg-red-50 dark:bg-red-900/20 p-4 rounded-xl">
                <Icon name="warning" className="text-3xl" />
                <p className="font-bold">{limitError}</p>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                Het lijkt erop dat je het limiet van de gratis weer-data hebt bereikt. 
                Probeer het later opnieuw of neem contact op met de beheerder voor een upgrade.
            </p>
            <div className="flex justify-end mt-2">
                <button
                    onClick={() => setShowLimitModal(false)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                    Sluiten
                </button>
            </div>
        </div>
      </Modal>
      {showPremiumModal && (
        <Modal isOpen={showPremiumModal} onClose={() => setShowPremiumModal(false)} title={t('premium.feature.title')}>
            <div className="p-4 flex flex-col gap-4">
                <p className="text-slate-600 dark:text-slate-300">{t('premium.feature.desc')}</p>
                <button 
                    onClick={() => {
                        setShowPremiumModal(false);
                        onNavigate('settings');
                    }}
                    className="bg-indigo-600 text-white py-2 px-4 rounded-lg font-bold hover:bg-indigo-700 transition-colors w-full"
                >
                    {t('premium.view_pricing')}
                </button>
            </div>
        </Modal>
      )}
      {showStarMap && (
        <StarMapModal 
        isOpen={showStarMap} 
        onClose={() => setShowStarMap(false)} 
        lat={location.lat} 
        lon={location.lon}
        cloudCover={weatherData?.current?.cloud_cover || 0}
        locationName={location.name}
        temp={weatherData?.current?.temperature_2m || 0}
        utcOffsetSeconds={weatherData?.utc_offset_seconds || 0}
      />
      )}
      {showHorizon && (
          <HorizonCompassView 
            isOpen={showHorizon}
            onClose={() => setShowHorizon(false)}
            latitude={location.lat}
            longitude={location.lon}
            locationName={location.name}
            utcOffsetSeconds={weatherData?.utc_offset_seconds || 0}
            language={settings.language}
          />
      )}
    </div>
  );
};
