import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse, WindUnit } from '../types';
import { Icon } from '../components/Icon';
import { fetchForecast, mapWmoCodeToIcon, convertWind, mapWmoCodeToText } from '../services/weatherService';
import { loadCurrentLocation } from '../services/storageService';
import { getTranslation } from '../services/translations';
import { StaticWeatherBackground } from '../components/StaticWeatherBackground';
import { WeatherBackground } from '../components/WeatherBackground';
import { useRadio } from '../contexts/RadioContext';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

// Colors from spec
const COLORS = {
  stoneLight: '#E6D6AA',
  stoneDark: '#C4A968',
  gold: '#E5C100',
  goldDark: '#B8860B',
  handBlue: '#0f172a',
  black: '#111111',
  whiteOpal: '#F5F5F0', 
  dialWhite: '#FDFBE6', // Creamy white for dial background
  lightBlue: '#87CEEB', // Sky Blue
  darkBlue: '#18181b', // Zinc 900
};

export const BigBenView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
  const { play, pause, setVolume, startFadeIn, startFadeOut } = useRadio();
  const [time, setTime] = useState(new Date());
  const [weatherData, setWeatherData] = useState<OpenMeteoResponse | null>(null);
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [isMuted, setIsMuted] = useState(settings.bigBen?.isMuted ?? true);
    const [showModeMenu, setShowModeMenu] = useState(false);
    const [loading, setLoading] = useState(true);
  const [isNight, setIsNight] = useState(false);
  const [showEffect, setShowEffect] = useState(false);
  const [selectedHourData, setSelectedHourData] = useState<any | null>(null);
  const [sunPosition, setSunPosition] = useState<{ x: number, y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioHalfRef = useRef<HTMLAudioElement | null>(null);
  const lastChimeHour = useRef<number | null>(null);
  const lastEffectMinute = useRef<number | null>(null);
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const t = (key: string) => getTranslation(key, settings.language);

  // Mobile Check
  useEffect(() => {
    const checkMobile = () => {
        setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sun Position Logic
  const updateSunPosition = useCallback((currentDate: Date) => {
      if (!weatherData?.daily?.sunrise?.[0] || !weatherData?.daily?.sunset?.[0]) return;
      
      const sunrise = new Date(weatherData.daily.sunrise[0]).getTime();
      const sunset = new Date(weatherData.daily.sunset[0]).getTime();
      const nowTime = currentDate.getTime();
  
      if (nowTime < sunrise || nowTime > sunset) {
          setSunPosition(null);
          return;
      }
  
      const totalDuration = sunset - sunrise;
      const elapsed = nowTime - sunrise;
      const progress = elapsed / totalDuration; // 0 to 1
  
      // Wider Parabola for visible sun
      // Range: -400 to 900 (Total width 1300, Center 250)
      // Peak: (250, -200)
      // Start (-400, 1000) -> 1200 = a(-650)^2 -> a = 0.00284
      
      const startX = -400;
      const endX = 900;
      const x = startX + (progress * (endX - startX));
      
      const y = 0.00284 * Math.pow(x - 250, 2) - 200;
  
      setSunPosition({ x, y });
  }, [weatherData]);

  // Initial Sun Update
  useEffect(() => {
      if (weatherData) {
          // Use current 'time' state which is already adjusted for timezone if needed
          updateSunPosition(time);
      }
  }, [weatherData, updateSunPosition]); // 'time' is omitted to avoid loop, but weatherData change triggers it.

  // Wake Lock for Mobile
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err: any) {
        console.error(`${err.name}, ${err.message}`);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (wakeLock !== null) {
        wakeLock.release();
        wakeLock = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Update Location Logic (Local Weather)
  useEffect(() => {
    const updateLocation = () => {
        if (settings.bigBen?.useLocalWeather) {
             if (navigator.geolocation) {
                 navigator.geolocation.getCurrentPosition(
                     (position) => {
                         // Only update if changed significantly? For now just update.
                         // We need to get the city name ideally, but let's just use "Local" or coords for now or reverse geocode?
                         // The existing loadCurrentLocation might not be enough if we want real-time updates.
                         // But we can just update the `location` state.
                         
                         // Note: We might want to reverse geocode to get the name, but for now let's keep existing name or "Local"
                         // Actually, let's fetch reverse geocoding if possible, or just update lat/lon.
                         
                         // If we just update lat/lon, the name might be wrong if we moved cities.
                         // Let's assume for now we just want the weather for the current spot.
                         
                         setLocation(prev => {
                             // Only update if coordinates changed significantly to avoid loop
                             if (Math.abs(prev.lat - position.coords.latitude) < 0.001 && Math.abs(prev.lon - position.coords.longitude) < 0.001) {
                                 return prev;
                             }
                             return {
                                 ...prev,
                                 lat: position.coords.latitude,
                                 lon: position.coords.longitude,
                                 name: prev.isCurrentLocation ? prev.name : 'Lokaal Weer', // Use static string or memoized translation
                                 isCurrentLocation: true
                             };
                         });
                     },
                     (error) => {
                         console.error("Error getting location", error);
                     }
                 );
             }
        } else {
            // Revert to saved default location if we disable it? 
            // Or just keep the last loaded one.
            // Ideally we should reload the default "current" location from storage which might be the user's home.
            setLocation(loadCurrentLocation());
        }
    };

    updateLocation();

    // Set interval for every hour (3600000 ms) if enabled
    if (settings.bigBen?.useLocalWeather) {
        locationIntervalRef.current = setInterval(updateLocation, 3600000);
    }

    return () => {
        if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, [settings.bigBen?.useLocalWeather]); // Remove 't' from dependencies to prevent loop on language change/re-render

  // Initialize audio
  useEffect(() => {
    // 1. Hour Chime (Full Sequence/Melody + Strikes ideally, but here just a chime)
    const audio = new Audio();
    // Fallback/Standard chime - Prefer local file if exists
    // We try local file first, then fallback to online
    audio.src = '/sounds/bigben_hour.mp3';
    // Add error handler to fallback if local fails
    audio.onerror = () => {
        const canPlayOgg = audio.canPlayType('audio/ogg');
        if (canPlayOgg === 'probably' || canPlayOgg === 'maybe') {
            audio.src = 'https://upload.wikimedia.org/wikipedia/commons/9/98/Big_Ben_Chimes.ogg';
        } else {
            audio.src = 'https://www.soundjay.com/clock/sounds/clock-chime-01.mp3'; 
        }
    };
    audioRef.current = audio;
    audioRef.current.load();

    // 2. Half Hour Chime (Single Strike)
    const audioHalf = new Audio();
    audioHalf.src = '/sounds/bigben_strike.mp3';
    audioHalf.onerror = () => {
        audioHalf.src = 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3';
    };
    audioHalfRef.current = audioHalf;
    audioHalfRef.current.load();

    return () => {
        // No cleanup needed
    };
  }, []);

  // Weather Fetch
  const loadWeather = useCallback(async () => {
    try {
      const data = await fetchForecast(location.lat, location.lon);
      setWeatherData(data);
      
      // Check if it is night based on current condition
      if (data && data.current) {
          setIsNight(data.current.is_day === 0);
      }
    } catch (e) {
      console.error("Failed to load weather for Big Ben", e);
    } finally {
      setLoading(false);
    }
  }, [location.lat, location.lon]); // Only update if coordinates change, not the whole location object

  useEffect(() => {
    loadWeather();
  }, [loadWeather]);

  // Always Radio Logic
  useEffect(() => {
      if (settings.bigBen?.alwaysPlayRadio) {
          const defaultStream = 'https://stream.classic.nl/classicnl.mp3'; 
          play(settings.bigBen?.radioUrl || defaultStream);
      }
      // Note: We do NOT stop it if alwaysPlayRadio is false, to support persistence across views.
  }, [settings.bigBen?.alwaysPlayRadio]);

  // Time update
  useEffect(() => {
    const timer = setInterval(() => {
      // If we have weather data with UTC offset, use that. Otherwise local time.
      const now = new Date();
      let displayTime = now;

      if (weatherData) {
          const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
          displayTime = new Date(utc + (weatherData.utc_offset_seconds * 1000));
      }

      setTime(displayTime);

      const minutes = displayTime.getMinutes();
      const seconds = displayTime.getSeconds();
      const hour = displayTime.getHours();

      // Update sun position every 15 minutes (0, 15, 30, 45)
      if (minutes % 15 === 0 && seconds === 0) {
          updateSunPosition(displayTime);
      }

      // Effect logic: Top of hour (00) and Half past (30)
      if ((minutes === 0 || minutes === 30) && lastEffectMinute.current !== minutes) {
          setShowEffect(true);
          lastEffectMinute.current = minutes;
          
          // Auto hide effect after 20 seconds
          setTimeout(() => {
              setShowEffect(false);
          }, 20000);

          // If top of the hour, refresh weather data AND start Radio if enabled
          if (minutes === 0) {
              loadWeather();

              // Start Radio Fade-In if enabled (Standard Mode)
              // Only if "Always Radio" is OFF.
              if (settings.bigBen?.enableRadio && !settings.bigBen?.alwaysPlayRadio) {
                  const defaultStream = 'https://stream.classic.nl/classicnl.mp3'; 
                  startFadeIn(settings.bigBen?.radioUrl || defaultStream);

                  // Schedule Fade-Out after 2 minutes
                  setTimeout(() => {
                      startFadeOut();
                  }, 2 * 60 * 1000); // 2 minutes
              }
          }
      }

      // Chime logic (using display time or local time? Real Big Ben chimes at its local time.
      // So we should use the `displayTime` for chiming if it's the Big Ben location, 
      // but conceptually "Big Ben Weerklok" implies it chimes at the top of the hour of the displayed time.)
      if (!isMuted) {
        
        // Trigger at top of hour (00:00) - Full Chime
        if (minutes === 0 && seconds === 0 && lastChimeHour.current !== hour && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.error("Audio play failed", e));
            lastChimeHour.current = hour;
        }

        // Trigger at half hour (30:00) - Single Chime
        // Note: Using hour + 0.5 to track the half hour event uniquely
        if (minutes === 30 && seconds === 0 && lastChimeHour.current !== (hour + 0.5) && audioHalfRef.current) {
             audioHalfRef.current.currentTime = 0;
             audioHalfRef.current.play().catch(e => console.error("Audio play failed", e));
             lastChimeHour.current = hour + 0.5;
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isMuted, weatherData, loadWeather]);

  // Calculate rotation
  // Uurwijzer: (uren % 12 + minuten / 60) * 30
  // Minuutwijzer: minuten * 6
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();
  
  const hourRotation = ((hours % 12) + minutes / 60) * 30;
  const minuteRotation = (minutes + seconds / 60) * 6; // Adding seconds for smoother movement if desired, spec says "minuten * 6" but "Seconden kunnen genegeerd worden of optioneel toegevoegd". I'll add for smoothness if refreshing every sec.

  // Weather Data Mapping for Hours 1-12
  const getWeatherDataForHour = (clockHour: number) => {
    if (!weatherData || !weatherData.hourly) return null;
    
    const isPM = hours >= 12;
    // Map clock hour (1-12) to 0-23
    let targetHour = clockHour;
    if (clockHour === 12) {
        targetHour = isPM ? 12 : 0;
    } else {
        targetHour = isPM ? clockHour + 12 : clockHour;
    }

    // Find data for this hour in the forecast
    // We need to match the hour in the `time` array
    // The `time` array strings are ISO (e.g., "2023-10-27T14:00")
    // We assume the forecast covers today.
    
    // Construct target ISO string prefix for today/tomorrow depending on logic
    // Actually, "huidige dagdeel" means if it's PM, we show PM hours.
    // If it's 2 PM, and we look at the '1' on the clock, that means 1 PM (13:00) or 1 AM (01:00)?
    // Spec: "Voor elk uur (1 t/m 12) wordt de data getoond die overeenkomt met dat uur in het huidige dagdeel (AM/PM)."
    // So if it is PM, 1 -> 13:00.
    
    // We need to handle date. If it's 11 PM, and we look at 1 on the clock (1 PM), that's passed.
    // Does it mean the UPCOMING 1 PM? Or just the 1 PM of TODAY?
    // "huidige dagdeel" implies the current AM or PM block of the current day.
    
    const todayStr = time.toISOString().split('T')[0];
    const targetTimeStr = `${todayStr}T${String(targetHour).padStart(2, '0')}:00`;
    
    const index = weatherData.hourly.time.findIndex(t => t.startsWith(targetTimeStr));
    
    if (index !== -1) {
        // Fallback for is_day if not available in hourly
        const isDay = weatherData.hourly.is_day ? !!weatherData.hourly.is_day[index] : (targetHour >= 6 && targetHour < 20); // Fallback: 6-20 is day if missing
        
        // Determine Past/Present/Future status
        // Current time logic relative to "todayStr" and "targetHour".
        // Current hour (0-23)
        const currentHour24 = hours;
        
        let status: 'past' | 'present' | 'future' = 'future';
        
        // Compare targetHour vs currentHour24
        // Note: targetHour is derived from the current 12h block logic in previous step.
        // If targetHour < currentHour24 -> Past
        // If targetHour == currentHour24 -> Present
        // If targetHour > currentHour24 -> Future
        
        if (targetHour < currentHour24) status = 'past';
        else if (targetHour === currentHour24) status = 'present';
        else status = 'future';

        return {
            temp: Math.round(weatherData.hourly.temperature_2m[index]),
            code: weatherData.hourly.weather_code[index],
            isDay: isDay,
            status: status,
            index: index // Return index for detailed view
        };
    }
    return null;
  };

  const renderStars = useMemo(() => {
      // Generate static stars once to avoid hydration mismatch and performance issues
      // Using a deterministic random-like generator or just a loop
      const stars = [];
      for (let i = 0; i < 150; i++) {
          const x = Math.random() * 100; // percent
          const y = Math.random() * 100; // percent
          const r = Math.random() * 1.5 + 0.5;
          const opacity = Math.random() * 0.8 + 0.2;
          const delay = Math.random() * 5;
          const duration = Math.random() * 3 + 2;
          
          stars.push(
              <circle 
                  key={i} 
                  cx={`${x}%`} 
                  cy={`${y}%`} 
                  r={r} 
                  fill="white" 
                  opacity={opacity}
                  style={{
                      animation: `twinkle ${duration}s ease-in-out infinite ${delay}s`
                  }}
              />
          );
      }
      return stars;
  }, []);

  const renderWeatherRing = () => {
    const items = [];
    for (let i = 1; i <= 12; i++) {
        const data = getWeatherDataForHour(i);
        // Angle: i * 30 degrees. 12 is at -90 (or 270) if 0 is right.
        const angle = i * 30 - 90;
        const radius = 185; // Position on the gold rim
        const x = 250 + radius * Math.cos(angle * Math.PI / 180);
        const y = 300 + radius * Math.sin(angle * Math.PI / 180);

        if (data) {
            // Color Logic based on Status
            const circleFill = data.status === 'past' ? '#555' : (data.status === 'present' ? COLORS.gold : COLORS.stoneLight);
            const circleOpacity = data.status === 'past' ? 0.6 : 0.95;
            const textFill = data.status === 'past' ? '#AAA' : COLORS.black;
            const strokeColor = data.status === 'present' ? '#FFF' : COLORS.goldDark;
            const strokeWidth = data.status === 'present' ? 2.5 : 1.5;

            items.push(
                <g key={i} onClick={() => setSelectedHourData(data)} className="cursor-pointer hover:opacity-80 transition-opacity">
                    {/* Background circle for readability - Increased size */}
                    <circle cx={x} cy={y} r="35" fill={circleFill} stroke={strokeColor} strokeWidth={strokeWidth} opacity={circleOpacity} />
                    
                    {/* Icon - mapped from code - Larger */}
                    <text x={x} y={y - 6} textAnchor="middle" dominantBaseline="middle" fontSize="28" fontFamily="Material Symbols Outlined" fill={textFill}>
                        {mapWmoCodeToIcon(data.code, !!data.isDay)}
                    </text>
                    
                    {/* Temp - Larger and Bolder */}
                    <text x={x} y={y + 18} textAnchor="middle" dominantBaseline="middle" fontSize="16" fontFamily="Cinzel" fontWeight="900" fill={textFill}>
                        {data.temp}°
                    </text>
                </g>
            );
        }
    }
    return items;
  };

  // Volume Effect
  useEffect(() => {
    setVolume(settings.bigBen?.radioVolume ?? 0.5);
    if (audioRef.current) audioRef.current.volume = settings.bigBen?.radioVolume ?? 0.5;
    if (audioHalfRef.current) audioHalfRef.current.volume = settings.bigBen?.radioVolume ?? 0.5;
  }, [settings.bigBen?.radioVolume]);

  const handleVolumeChange = (newVolume: number) => {
    onUpdateSettings({
        ...settings,
        bigBen: {
            ...settings.bigBen,
            enableRadio: settings.bigBen?.enableRadio ?? false, // Ensure required prop
            radioVolume: newVolume
        }
    });
  };

  const handleModeChange = (mode: 'none' | 'chime' | 'news' | 'always') => {
        let newMuted = true;
        let newEnableRadio = false;
        let newAlways = false;

        switch (mode) {
            case 'none':
                newMuted = true;
                newEnableRadio = false;
                newAlways = false;
                pause();
                break;
            case 'chime':
                newMuted = false;
                newEnableRadio = false;
                newAlways = false;
                pause();
                break;
            case 'news':
                newMuted = false;
                newEnableRadio = true;
                newAlways = false;
                pause();
                break;
            case 'always':
                newMuted = true; // Chimes silent
                newEnableRadio = false;
                newAlways = true;
                const defaultStream = 'https://stream.classic.nl/classicnl.mp3'; 
                play(settings.bigBen?.radioUrl || defaultStream);
                break;
        }

        setIsMuted(newMuted);
        setShowModeMenu(false);
        onUpdateSettings({
            ...settings,
            bigBen: {
                ...settings.bigBen,
                enableRadio: newEnableRadio,
                alwaysPlayRadio: newAlways,
                isMuted: newMuted
            }
        });
    };

    const getCurrentMode = (): 'none' | 'chime' | 'news' | 'always' => {
        if (settings.bigBen?.alwaysPlayRadio) return 'always';
        if (isMuted) return 'none';
        if (settings.bigBen?.enableRadio) return 'news';
        return 'chime';
    };

    const getWindDirection = (degrees: number) => {
        const directions = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
        const index = Math.round(degrees / 45) % 8;
        return directions[index];
    };

    const currentMode = getCurrentMode();

    return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center overflow-hidden font-sans">
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 flex justify-center bg-black/40 backdrop-blur-md border-b border-white/10">
        <div className="w-full max-w-5xl flex items-center justify-between">
            <button 
                onClick={() => onNavigate(ViewState.CURRENT)}
                className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
                <Icon name="arrow_back" className="text-2xl" />
            </button>
            <div className="flex flex-col items-center">
                <h1 className="text-xl font-bold text-[#E5C100] font-serif tracking-wider" style={{ fontFamily: 'Cinzel' }}>{t('bigben.header.title')}</h1>
                <span className="text-xs text-[#E6D6AA]">{location.name}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/40 rounded-full p-1 border border-white/10 relative">
                {/* Local Weather Toggle */}
                <button
                    onClick={() => onUpdateSettings({
                        ...settings,
                        bigBen: { ...settings.bigBen, enableRadio: settings.bigBen?.enableRadio ?? false, useLocalWeather: !settings.bigBen?.useLocalWeather }
                    })}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors mr-1 ${settings.bigBen?.useLocalWeather ? 'bg-[#E5C100]/20 text-[#E5C100] border border-[#E5C100]/30' : 'bg-white/5 text-white/50 border border-white/5 hover:bg-white/10'}`}
                    title={t('bigben.local_weather')}
                >
                    <Icon name="my_location" className="text-sm" />
                    <span className="hidden sm:inline">{settings.bigBen?.useLocalWeather ? 'GPS' : 'FIXED'}</span>
                </button>

                {/* Mode Selector */}
                <div className="relative">
                    <button
                        onClick={() => setShowModeMenu(!showModeMenu)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${currentMode !== 'none' ? 'bg-[#E5C100]/20 text-[#E5C100] border border-[#E5C100]/30' : 'bg-white/5 text-white/50 border border-white/5 hover:bg-white/10'}`}
                    >
                        <Icon name={currentMode === 'none' ? 'volume_off' : (currentMode === 'always' ? 'radio' : 'volume_up')} className="text-sm" />
                        <span className="hidden sm:inline">
                            {currentMode === 'none' && t('settings.bigben.mode.none')}
                            {currentMode === 'chime' && t('settings.bigben.mode.chime')}
                            {currentMode === 'news' && 'Nieuws'}
                            {currentMode === 'always' && 'Radio'}
                        </span>
                        <Icon name="expand_more" className="text-sm" />
                    </button>

                    {showModeMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowModeMenu(false)} />
                            <div className="absolute top-full right-0 mt-2 w-64 bg-[#1a1a1a] border border-[#E5C100]/30 rounded-xl shadow-2xl z-50 overflow-hidden">
                                <div className="p-2 space-y-1">
                                    <button onClick={() => handleModeChange('none')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${currentMode === 'none' ? 'bg-[#E5C100] text-black' : 'text-white/70 hover:bg-white/10'}`}>
                                        <Icon name="volume_off" /> {t('settings.bigben.mode.none')}
                                    </button>
                                    <button onClick={() => handleModeChange('chime')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${currentMode === 'chime' ? 'bg-[#E5C100] text-black' : 'text-white/70 hover:bg-white/10'}`}>
                                        <Icon name="notifications" /> {t('settings.bigben.mode.chime')}
                                    </button>
                                    <button onClick={() => handleModeChange('news')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${currentMode === 'news' ? 'bg-[#E5C100] text-black' : 'text-white/70 hover:bg-white/10'}`}>
                                        <Icon name="campaign" /> {t('settings.bigben.mode.news')}
                                    </button>
                                    <button onClick={() => handleModeChange('always')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${currentMode === 'always' ? 'bg-[#E5C100] text-black' : 'text-white/70 hover:bg-white/10'}`}>
                                        <Icon name="radio" /> {t('settings.bigben.mode.always')}
                                    </button>
                                </div>
                                
                                {/* Mobile Volume Slider in Dropdown */}
                                <div className="sm:hidden px-3 py-3 border-t border-white/10 bg-black/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon name={settings.bigBen?.radioVolume === 0 ? "volume_off" : "volume_up"} className="text-white/50 text-xs" />
                                        <span className="text-[10px] text-white/50 uppercase font-bold">Volume</span>
                                        <span className="text-[10px] text-[#E5C100] font-mono ml-auto">
                                            {Math.round((settings.bigBen?.radioVolume ?? 0.5) * 100)}%
                                        </span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="1" 
                                        step="0.01" 
                                        value={settings.bigBen?.radioVolume ?? 0.5}
                                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#E5C100]"
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Volume Slider */}
                <div className="hidden sm:flex items-center gap-2 px-2 border-l border-white/10 pl-3">
                    <span className="text-[10px] text-[#E5C100] font-mono w-6 text-right">
                        {Math.round((settings.bigBen?.radioVolume ?? 0.5) * 100)}
                    </span>
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.005" 
                        value={settings.bigBen?.radioVolume ?? 0.5}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#E5C100]"
                    />
                </div>
            </div>
        </div>
      </div>

      {/* Main Content - SVG */}
      <div 
        className="w-full h-full flex items-end justify-center pt-16 pb-0 relative transition-colors duration-1000"
        style={{ backgroundColor: isNight ? COLORS.darkBlue : COLORS.lightBlue }}
      >
        
        {/* Weather Background Photo (Absolute, behind tower) */}
        {weatherData && (
             <div className={`absolute inset-0 transition-opacity duration-1000 ${showEffect ? 'opacity-100' : 'opacity-0'} z-0`}>
                 <StaticWeatherBackground 
                     weatherCode={weatherData.current.weather_code} 
                     isDay={weatherData.current.is_day} 
                     cloudCover={weatherData.hourly.cloud_cover ? weatherData.hourly.cloud_cover[new Date().getHours()] : undefined} // Approximation
                     className="w-full h-full object-cover"
                     style={{ backgroundColor: isNight ? COLORS.darkBlue : COLORS.lightBlue }}
                 />
             </div>
        )}

        {/* Weather Particles (Rain/Snow etc) - On Top */}
        {weatherData && showEffect && (
            <div className="absolute inset-0 z-50 pointer-events-none">
                 <WeatherBackground 
                    weatherCode={weatherData.current.weather_code}
                    isDay={weatherData.current.is_day}
                    className="w-full h-full"
                 />
            </div>
        )}

        {/* Starry Sky - Full Screen Background (Visible only at night) */}
        {isNight && (
            <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none fade-in duration-1000">
                <style>
                    {`
                        @keyframes twinkle {
                            0% { opacity: 0.3; }
                            50% { opacity: 1; }
                            100% { opacity: 0.3; }
                        }
                        @keyframes wave {
                            0% { transform: scale(1, 1) skewY(0deg); }
                            25% { transform: scale(0.9, 1) skewY(8deg); }
                            50% { transform: scale(1, 1) skewY(0deg); }
                            75% { transform: scale(0.9, 1) skewY(-8deg); }
                            100% { transform: scale(1, 1) skewY(0deg); }
                        }
                    `}
                </style>
                {renderStars}
            </svg>
        )}

        {/* Adjusted viewBox for taller tower (including roof), remove max-h constraint on md screens to fill height */}
        <svg 
            viewBox={isMobile ? "-125 -200 750 1200" : "-500 -250 1500 1250"} 
            preserveAspectRatio="xMidYMax meet"
            className="w-full h-full max-w-5xl drop-shadow-2xl z-10 relative"
        >
            <defs>
                <linearGradient id="stoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={COLORS.stoneLight} />
                    <stop offset="100%" stopColor={COLORS.stoneDark} />
                </linearGradient>
                <linearGradient id="roofGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#2c3e50" />
                    <stop offset="50%" stopColor="#34495e" />
                    <stop offset="100%" stopColor="#2c3e50" />
                </linearGradient>
                <filter id="shadow">
                    <feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.5" />
                </filter>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="10" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <filter id="handShadow">
                    <feDropShadow dx="4" dy="4" stdDeviation="4" floodOpacity="0.6" />
                </filter>
                <pattern id="roseWindow" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                     <path d="M20 0 L40 20 L20 40 L0 20 Z" fill="none" stroke={COLORS.gold} strokeWidth="1" />
                     <circle cx="20" cy="20" r="5" fill={COLORS.goldDark} />
                     <path d="M20 5 L35 20 L20 35 L5 20 Z" fill="none" stroke={COLORS.goldDark} strokeWidth="0.5" />
                </pattern>
                <pattern id="gridPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                    <rect x="0" y="0" width="20" height="20" fill="none" stroke={COLORS.stoneDark} strokeOpacity="0.3" strokeWidth="1" />
                </pattern>
                <pattern id="roofPattern" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect x="0" y="0" width="10" height="10" fill="none" stroke="#1a252f" strokeWidth="0.5" />
                </pattern>
                <radialGradient id="sunGradient">
                    <stop offset="0%" stopColor="#FFF700" />
                    <stop offset="50%" stopColor="#FFD700" />
                    <stop offset="100%" stopColor="#FF8C00" />
                </radialGradient>
                <filter id="sunGlow">
                    <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
                <style>
                    {`
                        @keyframes twinkle {
                            0% { opacity: 0.3; }
                            50% { opacity: 1; }
                            100% { opacity: 0.3; }
                        }
                        @keyframes wave {
                            0% { transform: scale(1, 1) skewY(0deg); }
                            25% { transform: scale(0.9, 1) skewY(8deg); }
                            50% { transform: scale(1, 1) skewY(0deg); }
                            75% { transform: scale(0.9, 1) skewY(-8deg); }
                            100% { transform: scale(1, 1) skewY(0deg); }
                        }
                    `}
                </style>
            </defs>

            {/* SUN - Hidden on mobile and at night */}
            {sunPosition && !isNight && (
                <g transform={`translate(${sunPosition.x}, ${sunPosition.y})`} className="hidden md:block">
                     <circle r="90" fill="url(#sunGradient)" filter="url(#sunGlow)" />
                </g>
            )}

            {/* Toren Achtergrond - Extended height */}
            <rect x="0" y="0" width="500" height="1000" fill="url(#stoneGrad)" opacity={showEffect ? "0.2" : (isNight ? "0.4" : "1")} className="transition-opacity duration-1000" />
            <rect x="0" y="0" width="500" height="1000" fill="url(#gridPattern)" opacity="0.2" />
            
            {/* ROOF SECTION (Spits) */}
            <g transform="translate(0, 0)">
                {/* Main Pyramid Roof */}
                <path d="M25 10 L250 -180 L475 10 L475 75 L25 75 Z" fill="url(#roofGrad)" />
                <path d="M25 10 L250 -180 L475 10" fill="url(#roofPattern)" opacity="0.5" />
                
                {/* Gold detailing on roof ridges */}
                <line x1="25" y1="10" x2="250" y2="-180" stroke={COLORS.goldDark} strokeWidth="2" />
                <line x1="475" y1="10" x2="250" y2="-180" stroke={COLORS.goldDark} strokeWidth="2" />
                
                {/* Dormer Windows (Dakkapellen) */}
                <g transform="translate(250, -80)">
                    <path d="M-30 0 L0 -30 L30 0 L30 40 L-30 40 Z" fill={COLORS.stoneDark} stroke={COLORS.gold} strokeWidth="1" />
                    <rect x="-15" y="0" width="30" height="30" fill={COLORS.black} />
                    {/* Grill */}
                    <line x1="-15" y1="10" x2="15" y2="10" stroke={COLORS.goldDark} strokeWidth="1" />
                    <line x1="-15" y1="20" x2="15" y2="20" stroke={COLORS.goldDark} strokeWidth="1" />
                </g>

                {/* Ayrton Light (Lantern at top) */}
                <g transform="translate(250, -180)">
                     <rect x="-15" y="-40" width="30" height="40" fill={COLORS.stoneLight} />
                     <rect x="-15" y="-40" width="30" height="40" fill="url(#gridPattern)" opacity="0.5" />
                     {/* Light glow if night */}
                     <rect x="-10" y="-35" width="20" height="30" fill={isNight ? "#FDFBE6" : "#444"} opacity={isNight ? "0.9" : "0.8"} filter={isNight ? "url(#glow)" : ""} />
                     
                     {/* Spire top */}
                     <path d="M-18 -40 L0 -80 L18 -40" fill={COLORS.goldDark} />
                     <line x1="0" y1="-80" x2="0" y2="-110" stroke={COLORS.gold} strokeWidth="2" />
                     <circle cx="0" cy="-90" r="4" fill={COLORS.gold} />
                     <circle cx="0" cy="-110" r="2" fill={COLORS.gold} />
                </g>
            </g>

            {/* Extra dark overlay for night */}
            {isNight && <rect x="0" y="-250" width="500" height="1250" fill="#000" opacity="0.6" />}

            {/* Architectural Details - Top Windows/Arches */}
            <g transform="translate(0, 0)">
                {/* Background for top section */}
                <rect x="50" y="10" width="400" height="60" fill={COLORS.black} opacity="0.8" />
                {/* Arches */}
                {[0, 1, 2, 3, 4].map(i => (
                    <path 
                        key={i} 
                        d={`M${90 + i * 70} 70 L${90 + i * 70} 30 A25 25 0 0 1 ${140 + i * 70} 30 L${140 + i * 70} 70 Z`} 
                        fill="none" 
                        stroke={COLORS.goldDark} 
                        strokeWidth="2" 
                    />
                ))}
                {/* Diamond belt below arches */}
                 <g transform="translate(0, 75)">
                    {Array.from({length: 10}).map((_, i) => (
                        <rect 
                            key={i} 
                            x={75 + i * 40} y="-5" 
                            width="10" height="10" 
                            transform={`rotate(45 ${80 + i * 40} 0)`} 
                            fill={COLORS.gold} 
                        />
                    ))}
                 </g>
            </g>

            {/* Omlijsting / Frame */}
            <rect x="25" y="75" width="450" height="450" fill="none" stroke="#222" strokeWidth="20" rx="4" />
            <rect x="35" y="85" width="430" height="430" fill="none" stroke={COLORS.gold} strokeWidth="2" />
            
            {/* Ornamenten (Simplified corners) */}
            <path d="M25 75 L75 75 L25 125 Z" fill={COLORS.goldDark} />
            <path d="M475 75 L425 75 L475 125 Z" fill={COLORS.goldDark} />
            <path d="M25 525 L75 525 L25 475 Z" fill={COLORS.goldDark} />
            <path d="M475 525 L425 525 L475 475 Z" fill={COLORS.goldDark} />

            {/* Dial Background - Cream/White for Day */}
            <circle cx="250" cy="300" r="200" fill={COLORS.dialWhite} stroke={COLORS.gold} strokeWidth="10" />
            
            {/* Inner detailed pattern (Binnenplaatje) */}
            <circle cx="250" cy="300" r="130" fill="url(#roseWindow)" opacity={isNight ? "0.4" : "0.6"} />
            <circle cx="250" cy="300" r="130" fill="none" stroke={COLORS.gold} strokeWidth="1" opacity="0.5" />
            
            {/* Inner decorative ring */}
            <circle cx="250" cy="300" r="90" fill="none" stroke={COLORS.goldDark} strokeWidth="2" strokeDasharray="4 4" opacity="0.7" />

            {/* Rose Window Center - Gold Pattern */}
            <circle cx="250" cy="300" r="40" fill={COLORS.goldDark} opacity="0.2" />
            <circle cx="250" cy="300" r="5" fill={COLORS.gold} />

            {/* Cijferring - White Opal */}
            <circle cx="250" cy="300" r="140" fill="none" stroke={COLORS.whiteOpal} strokeWidth="45" opacity="0.9" filter={isNight ? "url(#glow)" : ""} />
            
            {/* Romeinse Cijfers - Black */}
            <g fontFamily="Cinzel" fontWeight="bold" fontSize="28" fill="#111" textAnchor="middle" dominantBaseline="middle">
                {[
                    {n: 'XII', a: -90}, {n: 'I', a: -60}, {n: 'II', a: -30},
                    {n: 'III', a: 0}, {n: 'IV', a: 30}, {n: 'V', a: 60},
                    {n: 'VI', a: 90}, {n: 'VII', a: 120}, {n: 'VIII', a: 150},
                    {n: 'IX', a: 180}, {n: 'X', a: 210}, {n: 'XI', a: 240}
                ].map((item, i) => {
                    const r = 125;
                    const x = 250 + r * Math.cos(item.a * Math.PI / 180);
                    const y = 300 + r * Math.sin(item.a * Math.PI / 180);
                    return (
                        <g key={i} transform={`translate(${x}, ${y})`}> 
                             <text transform={`rotate(${item.a + 90})`}>{item.n}</text>
                        </g>
                    );
                })}
            </g>

            {/* Minuutmarkeringen */}
            <g stroke={COLORS.gold} strokeWidth="2">
                {Array.from({length: 60}).map((_, i) => (
                    <line 
                        key={i}
                        x1="250" y1="110" 
                        x2="250" y2={i % 5 === 0 ? "120" : "115"} 
                        transform={`rotate(${i * 6} 250 300)`} 
                    />
                ))}
            </g>

            {/* Weerdata Ring (Buitenrand) */}
            {renderWeatherRing()}

            {/* Inscriptie */}
            <rect x="50" y="550" width="400" height="60" fill="black" rx="4" />
            <text x="250" y="585" textAnchor="middle" fill={COLORS.gold} fontFamily="UnifrakturMaguntia" fontSize="14" textLength="380" lengthAdjust="spacingAndGlyphs">
                {t('bigben.inscription')}
            </text>

            {/* Flagpole - Wind Indicator */}
            {!isMobile && weatherData && (
                <g transform={`translate(700, 920)`}>
                     {/* Pole */}
                     <line x1="0" y1="0" x2="0" y2="-300" stroke="#333" strokeWidth="8" strokeLinecap="round" />
                     {/* Finial (Gold ball) */}
                     <circle cx="0" cy="-305" r="5" fill={COLORS.gold} />
                     
                     {/* Flag */}
                   <g transform={`translate(2, -280) scale(${weatherData.current.wind_direction_10m > 180 ? -1 : 1}, 1)`}>
                        <g style={{ 
                            animation: `wave ${Math.max(0.5, 3 - ((weatherData.current.wind_speed_10m || 0) / 20))}s infinite ease-in-out`,
                            transformOrigin: '0px 0px'
                        }}>
                             {/* White Flag Background */}
                             <path d="M2 0 L180 10 L180 110 L2 100 Z" fill="#FFFFFF" stroke="#ccc" strokeWidth="1" />
                             
                             {/* Wind Info Text (Corrected for mirroring) */}
                             <g transform={`scale(${weatherData.current.wind_direction_10m > 180 ? -1 : 1}, 1) translate(${weatherData.current.wind_direction_10m > 180 ? -180 : 0}, 0)`}>
                                <text 
                                    x="90" 
                                    y="50" 
                                    textAnchor="middle" 
                                    dominantBaseline="middle" 
                                    className="font-bold font-mono"
                                    fill="#111"
                                    fontSize="24"
                                >
                                    {convertWind(weatherData.current.wind_speed_10m, settings.windUnit || WindUnit.KMH)} {settings.windUnit || 'km/h'}
                                </text>
                                <text 
                                    x="90" 
                                    y="80" 
                                    textAnchor="middle" 
                                    dominantBaseline="middle" 
                                    className="font-bold font-mono"
                                    fill="#555"
                                    fontSize="16"
                                >
                                    {getWindDirection(weatherData.current.wind_direction_10m)}
                                </text>
                             </g>
                         </g>
                     </g>
                </g>
            )}

            {/* Extended Bottom Architecture */}
             <g transform="translate(0, 620)">
                 {/* Decorative band */}
                 <rect x="20" y="0" width="460" height="10" fill={COLORS.goldDark} opacity="0.5" />
                 
                 {/* Repeating Windows/Arches Pattern downwards */}
                 {Array.from({length: 3}).map((_, row) => (
                    <g key={row} transform={`translate(0, ${row * 120})`}>
                        {/* Windows row */}
                        {[0, 1, 2, 3, 4, 5, 6].map(i => (
                             <g key={i} transform={`translate(${55 + i * 60}, 20)`}>
                                 <rect x="0" y="0" width="30" height="80" fill={COLORS.black} opacity="0.6" />
                                 <path d="M0 0 L30 0 L15 -15 Z" fill={COLORS.stoneDark} />
                                 <rect x="10" y="10" width="10" height="60" fill={COLORS.gold} opacity="0.1" />
                             </g>
                         ))}
                         {/* Separation line */}
                         <rect x="40" y="110" width="420" height="5" fill={COLORS.stoneDark} />
                    </g>
                 ))}
             </g>

            {/* Side Strips (Left & Right) - Extended */}
            <g>
                <rect x="5" y="0" width="15" height="1000" fill={COLORS.stoneDark} opacity="0.8" />
                <rect x="480" y="0" width="15" height="1000" fill={COLORS.stoneDark} opacity="0.8" />
                {/* Dots/Pattern on strips */}
                 {Array.from({length: 50}).map((_, i) => (
                    <g key={i}>
                        <rect x="5" y={i * 20} width="15" height="10" fill={COLORS.stoneLight} opacity="0.6" />
                        <rect x="480" y={i * 20} width="15" height="10" fill={COLORS.stoneLight} opacity="0.6" />
                    </g>
                 ))}
            </g>

            {/* Wijzers - Verbeterd / Improved Hands */}
            
            {/* Uurwijzer - More ornate Gothic style */}
            <g transform={`rotate(${hourRotation} 250 300)`} filter="url(#handShadow)">
                {/* Main Shaft */}
                <path d="M245 300 L245 220 C240 215 240 205 245 200 L250 180 L255 200 C260 205 260 215 255 220 L255 300 Z" fill={COLORS.handBlue} stroke={COLORS.gold} strokeWidth="1.5" />
                {/* Decorative Diamond/Heart near tip */}
                <path d="M250 200 L242 215 L250 230 L258 215 Z" fill={COLORS.gold} />
                {/* Base detail */}
                <circle cx="250" cy="300" r="12" fill={COLORS.handBlue} stroke={COLORS.gold} strokeWidth="2" />
                {/* Counterweight */}
                <path d="M246 300 L246 320 L250 330 L254 320 L254 300 Z" fill={COLORS.handBlue} stroke={COLORS.gold} strokeWidth="1" />
            </g>

            {/* Minuutwijzer - Elegant, long, tapered */}
            <g transform={`rotate(${minuteRotation} 250 300)`} filter="url(#handShadow)">
                {/* Main Shaft */}
                <path d="M247 300 L248 115 L250 105 L252 115 L253 300 Z" fill={COLORS.handBlue} stroke={COLORS.gold} strokeWidth="1" />
                {/* Counterweight */}
                <path d="M247 300 L245 340 L250 350 L255 340 L253 300 Z" fill={COLORS.handBlue} stroke={COLORS.gold} strokeWidth="1" />
                {/* Decorative dots along the hand */}
                <circle cx="250" cy="250" r="3" fill={COLORS.gold} />
                <circle cx="250" cy="200" r="2.5" fill={COLORS.gold} />
                <circle cx="250" cy="150" r="2" fill={COLORS.gold} />
            </g>

            {/* Center Cap - Gold with detail */}
            <circle cx="250" cy="300" r="8" fill={COLORS.gold} filter="url(#shadow)" />
            <circle cx="250" cy="300" r="3" fill={COLORS.goldDark} />

            {/* Secondewijzer (Subtle) */}
            <g transform={`rotate(${seconds * 6} 250 300)`}>
                <line x1="250" y1="330" x2="250" y2="105" stroke={COLORS.goldDark} strokeWidth="1" opacity="0.9" />
                <circle cx="250" cy="300" r="4" fill={COLORS.goldDark} />
            </g>

        </svg>

        {/* Legend */}
        <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-6 px-4 z-50">
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <div className="w-3 h-3 rounded-full bg-[#555] border border-white/20"></div>
                <span className="text-[10px] text-white/70 uppercase tracking-wider font-bold">{t('bigben.legend.elapsed')}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <div className="w-3 h-3 rounded-full bg-[#E5C100] border border-white"></div>
                <span className="text-[10px] text-[#E5C100] uppercase tracking-wider font-bold">{t('bigben.legend.current')}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <div className="w-3 h-3 rounded-full bg-[#E6D6AA] border border-[#B8860B]"></div>
                <span className="text-[10px] text-[#E6D6AA] uppercase tracking-wider font-bold">{t('bigben.legend.upcoming')}</span>
            </div>
        </div>
      </div>

      {/* Weather Detail Modal */}
      {selectedHourData && weatherData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop with Blur */}
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" 
                onClick={() => setSelectedHourData(null)}
            />
            
            {/* Modal Content */}
            <div className="relative bg-[#1a1a1a] border border-[#E5C100] rounded-xl max-w-sm w-full p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Close Button */}
                <button 
                    onClick={() => setSelectedHourData(null)}
                    className="absolute top-2 right-2 p-2 text-white/50 hover:text-white transition-colors"
                >
                    <Icon name="close" className="text-xl" />
                </button>

                <div className="flex flex-col items-center gap-4">
                     {/* Header */}
                     <div className="text-center">
                         <span className="text-[#E6D6AA] text-sm uppercase tracking-widest mb-1 block">
                             {selectedHourData.status === 'past' && t('bigben.popup.report')}
                             {selectedHourData.status === 'present' && t('bigben.popup.current')}
                             {selectedHourData.status === 'future' && t('bigben.popup.forecast')}
                         </span>
                         <h2 className="text-3xl font-serif text-[#E5C100]" style={{ fontFamily: 'Cinzel' }}>
                             {new Date(weatherData.hourly.time[selectedHourData.index]).toLocaleTimeString(settings.language, {hour: '2-digit', minute:'2-digit', hour12: settings.timeFormat === '12h'})}
                         </h2>
                     </div>

                     {/* Main Icon & Temp */}
                     <div className="flex flex-col items-center">
                         <span className="text-6xl text-[#E5C100] mb-2 material-symbols-outlined">
                            {mapWmoCodeToIcon(selectedHourData.code, selectedHourData.isDay)}
                         </span>
                         <span className="text-5xl font-bold text-white font-serif">{selectedHourData.temp}°</span>
                     </div>

                     {/* Grid of Details */}
                     <div className="grid grid-cols-2 gap-4 w-full mt-4">
                         <div className="bg-white/5 p-3 rounded-lg flex flex-col items-center">
                             <span className="text-xs text-white/50 mb-1">{t('bigben.wind')}</span>
                             <div className="flex items-center gap-1">
                                 <Icon name="air" className="text-[#E5C100]" />
                                 <span className="text-white font-bold">
                                     {convertWind(weatherData.hourly.wind_speed_10m[selectedHourData.index], settings.windUnit || WindUnit.KMH)} {settings.windUnit || 'km/h'}
                                 </span>
                             </div>
                         </div>
                         <div className="bg-white/5 p-3 rounded-lg flex flex-col items-center">
                             <span className="text-xs text-white/50 mb-1">{t('bigben.precipitation')}</span>
                             <div className="flex items-center gap-1">
                                 <Icon name="water_drop" className="text-[#E5C100]" />
                                 <span className="text-white font-bold">{weatherData.hourly.precipitation_probability[selectedHourData.index]}%</span>
                             </div>
                         </div>
                         <div className="bg-white/5 p-3 rounded-lg flex flex-col items-center">
                             <span className="text-xs text-white/50 mb-1">{t('bigben.humidity')}</span>
                             <div className="flex items-center gap-1">
                                 <Icon name="humidity_percentage" className="text-[#E5C100]" />
                                 <span className="text-white font-bold">{weatherData.hourly.relative_humidity_2m[selectedHourData.index]}%</span>
                             </div>
                         </div>
                         <div className="bg-white/5 p-3 rounded-lg flex flex-col items-center">
                             <span className="text-xs text-white/50 mb-1">{t('bigben.clouds')}</span>
                             <div className="flex items-center gap-1">
                                 <Icon name="cloud" className="text-[#E5C100]" />
                                 <span className="text-white font-bold">{weatherData.hourly.cloud_cover[selectedHourData.index]}%</span>
                             </div>
                         </div>
                     </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
