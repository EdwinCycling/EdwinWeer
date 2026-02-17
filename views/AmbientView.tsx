import React, { useEffect, useState, useRef } from 'react';
import { AppSettings, ViewState, Location, TempUnit, WindUnit, AppLanguage } from '../types';
import { throttledFetch, mapWmoCodeToIcon, mapWmoCodeToText, getTempLabel, convertTemp, convertWind } from '../services/weatherService';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { loadCurrentLocation } from '../services/storageService';
import { MAJOR_CITIES } from '../services/cityData';
import { AnalogueClock } from '../components/AnalogueClock';
import { CreditFloatingButton } from '../components/CreditFloatingButton';
import { WeatherStationClock } from '../components/WeatherStationClock';
import { DigitalRoundClock } from '../components/DigitalRoundClock';

interface AmbientViewProps {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
}

// Fallback if import fails or is empty, though we use the imported one
const FALLBACK_CITIES: Location[] = [
    { name: 'Tokyo', country: 'JP', lat: 35.6895, lon: 139.6917 },
    { name: 'New York', country: 'US', lat: 40.7128, lon: -74.0060 },
    { name: 'London', country: 'GB', lat: 51.5074, lon: -0.1278 },
];

const WEATHER_PHOTOS = [
    'bewolking 0.jpg',
    'bewolking 10.jpg',
    'bewolking 20.jpg',
    'bewolking 40.jpg',
    'bewolking 70.jpg',
    'bewolking 90.jpg',
    'fog.jpg',
    'rain heavy.jpg',
    'rain middle.jpg',
    'rain.jpg',
    'thunder.jpg'
];

declare global {
    interface Window {
        chrome: any;
        cast: any;
        __onGCastApiAvailable: (isAvailable: boolean) => void;
    }
}

interface LocalWeather {
    name: string;
    temp: number;
    windSpeed: number;
    windDir: string;
    windUnit: string;
    windAngle?: number;
    pressure?: number;
    weatherCode: number;
    isNight: boolean;
    feelsLike?: number;
    daily?: {
        date: string;
        code: number;
        min: number;
        max: number;
    }[];
}

export const AmbientView: React.FC<AmbientViewProps> = ({ onNavigate, settings, onUpdateSettings }) => {
    const [worldWeather, setWorldWeather] = useState<string[]>([]);
    const [favoritesWeather, setFavoritesWeather] = useState<string[]>([]);
    const [news, setNews] = useState<string[]>([]);
    const [localWeatherStr, setLocalWeatherStr] = useState<string | null>(null);
    const [localWeatherData, setLocalWeatherData] = useState<LocalWeather | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [castAvailable, setCastAvailable] = useState(false);
    const [showControls, setShowControls] = useState(false);
    
    const currentMode = settings.ambientMode || 'fireplace';
    const [randomVideoMode, setRandomVideoMode] = useState<'fireplace' | 'aquarium' | 'clouds' | 'clouds2' | 'rain' | 'sunset1' | 'sunset2'>('fireplace');
    const modeType = settings.ambientSettings?.modeType || 'video';
    const [currentPhoto, setCurrentPhoto] = useState<string>(WEATHER_PHOTOS[0]);

    useEffect(() => {
        if (modeType === 'photo') {
            const pickRandomPhoto = () => {
                const random = WEATHER_PHOTOS[Math.floor(Math.random() * WEATHER_PHOTOS.length)];
                setCurrentPhoto(random);
            };
            
            pickRandomPhoto(); // Initial
            const interval = setInterval(pickRandomPhoto, 30000); // 30 seconds
            return () => clearInterval(interval);
        } else if (currentMode === 'random') {
            const modes = ['fireplace', 'aquarium', 'clouds', 'clouds2', 'rain', 'sunset1', 'sunset2'] as const;
            
            const pickRandom = () => {
                // Pick a random mode
                const next = modes[Math.floor(Math.random() * modes.length)];
                setRandomVideoMode(next);
            };
            
            pickRandom(); // Initial pick
            const interval = setInterval(pickRandom, 60000); // Every 60 seconds
            return () => clearInterval(interval);
        }
    }, [currentMode, modeType]);

    const effectiveMode = currentMode === 'random' ? randomVideoMode : currentMode;

    const [fadeOpacity, setFadeOpacity] = useState(1);
    
    // Soft Transition Effect
    useEffect(() => {
        setFadeOpacity(0); // Fade out
        const timeout = setTimeout(() => {
            setFadeOpacity(1); // Fade in (after source changed)
        }, 500); // 500ms fade duration
        return () => clearTimeout(timeout);
    }, [effectiveMode, currentPhoto, modeType]);

    const setMode = (mode: 'fireplace' | 'aquarium' | 'clouds' | 'clouds2' | 'rain' | 'sunset1' | 'sunset2' | 'random') => {
        onUpdateSettings({ ...settings, ambientMode: mode });
    };

    const updateAmbientSetting = (key: 'showPopup' | 'showClock' | 'showBottomBar' | 'modeType' | 'showNews' | 'clockType', value: boolean | string) => {
        onUpdateSettings({
            ...settings,
            ambientSettings: {
                ...settings.ambientSettings,
                showPopup: settings.ambientSettings?.showPopup ?? true, // defaults
                showClock: settings.ambientSettings?.showClock ?? true,
                showBottomBar: settings.ambientSettings?.showBottomBar ?? true,
                showNews: settings.ambientSettings?.showNews ?? true,
                modeType: settings.ambientSettings?.modeType || 'video',
                clockType: settings.ambientSettings?.clockType || 'analogue',
                [key]: value
            }
        });
    };

    const showPopup = settings.ambientSettings?.showPopup ?? true;
    const showClock = settings.ambientSettings?.showClock ?? true;
    const clockType = settings.ambientSettings?.clockType || 'analogue';
    const showBottomBar = settings.ambientSettings?.showBottomBar ?? true;
    const showNews = settings.ambientSettings?.showNews ?? true;
    
    // Mobile Detection & Scroll Speed
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const scrollSpeedMultiplier = isMobile ? 0.6 : 1;
    
    // Audio State
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0.5);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [showCredits, setShowCredits] = useState(false);
    
    // Popup State
    const [popupPos, setPopupPos] = useState({ top: '20%', left: '20%' });
    const [showCastModal, setShowCastModal] = useState(false);
    const [currentCastState, setCurrentCastState] = useState<string>('NO_DEVICES_AVAILABLE');
    
    const wakeLockRef = useRef<any>(null);
    const t = (key: string) => getTranslation(key, settings.language);

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Random Popup Position (Every minute)
    useEffect(() => {
        const movePopup = () => {
            // Keep within central 60% of screen to avoid edges
            const top = 20 + Math.random() * 60;
            const left = 20 + Math.random() * 60;
            setPopupPos({ top: `${top}%`, left: `${left}%` });
        };
        
        movePopup(); // Initial
        const interval = setInterval(movePopup, 60000);
        return () => clearInterval(interval);
    }, []);

    // Audio Control
    useEffect(() => {
        // Only play audio if explicitly in fireplace mode and video type
        // User request: "in random modus en je toont fireplace, dan geluid niet aanzetten"
        const shouldPlay = currentMode === 'fireplace' && modeType === 'video';

        if (!shouldPlay) {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            return;
        }

        if (audioRef.current) {
            audioRef.current.volume = volume;
            audioRef.current.muted = isMuted;
            
            // Forceer play als het niet op pauze staat
            if (!isMuted && audioRef.current.paused) {
                audioRef.current.play().catch(e => console.error("Audio play error:", e));
            }
        }
    }, [volume, isMuted, currentMode, modeType]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        };
    }, []);

    // Wake Lock
    useEffect(() => {
        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                    
                    wakeLockRef.current.addEventListener('release', () => {
                        console.log('Wake Lock released');
                    });
                } catch (err: any) {
                    console.error(`${err.name}, ${err.message}`);
                }
            }
        };

        requestWakeLock();
        
        const handleVisibilityChange = async () => {
            if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
                await requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (wakeLockRef.current) {
                wakeLockRef.current.release();
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Chromecast
    useEffect(() => {
        let attempts = 0;
        const initCast = () => {
            const hasFramework = !!window.cast?.framework?.CastContext?.getInstance;
            const hasEventTypes = !!window.cast?.framework?.CastContextEventType;
            const hasSessionRequest = !!window.chrome?.cast?.SessionRequest;
            const isAvailable = window.chrome?.cast?.isAvailable === true;

            if (isAvailable && hasFramework && hasEventTypes && hasSessionRequest) {
                setCastAvailable(true);
                try {
                    const context = window.cast.framework.CastContext.getInstance();
                    const receiverAppId = window.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID || 'CC1AD845';
                    const autoJoinPolicy = window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED || 'origin_scoped';

                    context.setOptions({
                        receiverApplicationId: receiverAppId,
                        autoJoinPolicy: autoJoinPolicy
                    });
                    
                    // Initial state
                    setCurrentCastState(context.getCastState());

                    // Listen for session changes
                    context.addEventListener(
                        window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                        (event: any) => {
                            console.log("Cast session state:", event.sessionState);
                        }
                    );

                    // Listen for cast state changes (to know if devices are available)
                    context.addEventListener(
                        window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
                        (event: any) => {
                            console.log("Cast state:", event.castState);
                            setCurrentCastState(event.castState);
                        }
                    );
                } catch (e) {
                    console.error("Cast init error", e);
                }
            } else if (attempts < 20) {
                // Retry for ~20 seconds (20 * 1000ms) to allow script to load on mobile
                attempts++;
                setTimeout(initCast, 1000);
            }
        };

        // Standard Google Cast API check
        if (window['__onGCastApiAvailable']) {
            const original = window['__onGCastApiAvailable'];
            window['__onGCastApiAvailable'] = (isAvailable: boolean) => {
                original(isAvailable);
                if (isAvailable) initCast();
            };
        } else {
            window['__onGCastApiAvailable'] = (isAvailable: boolean) => {
                if (isAvailable) initCast();
            };
        }
        
        // Also check immediately
        initCast();

        // Add a global trigger for re-init
        (window as any).reInitCast = initCast;
    }, []);

    const handleCast = () => {
        setShowCastModal(true);
    };

    const triggerNativeCast = () => {
        const hasFramework = !!window.cast?.framework?.CastContext?.getInstance;
        const hasSessionRequest = !!window.chrome?.cast?.SessionRequest;
        if (hasFramework && hasSessionRequest) {
            window.cast.framework.CastContext.getInstance().requestSession();
        }
    };

    const reInitCast = () => {
        if ((window as any).reInitCast) {
            (window as any).reInitCast();
        }
    };

    const lastFetchRef = useRef<number>(0);

    // News Fetching
    useEffect(() => {
        const fetchNewsItems = async () => {
            try {
                const lang = (settings.language || 'nl').toLowerCase();
                // Ensure country is uppercase for Google News (e.g. NL, BE, US)
                const country = (settings.countryCode || (lang === 'nl' ? 'NL' : 'US')).toUpperCase();
                
                // Construct specific locale string for Google News (e.g. nl-NL, nl-BE, en-US)
                // For NL: hl=nl&gl=NL&ceid=NL:nl
                // For BE (Dutch): hl=nl&gl=BE&ceid=BE:nl
                const ceid = `${country}:${lang}`;
                
                // Fetch Local News
                const localRss = `https://news.google.com/rss?hl=${lang}&gl=${country}&ceid=${ceid}`;
                const localUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(localRss)}`;
                
                // Fetch International News (always English/US for global reach)
                const intRss = `https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en`;
                const intUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(intRss)}`;
                
                const [localRes, intRes] = await Promise.all([
                    fetch(localUrl).then(r => r.json()).catch(e => ({ status: 'error', items: [] })),
                    fetch(intUrl).then(r => r.json()).catch(e => ({ status: 'error', items: [] }))
                ]);
                
                let allNews: string[] = [];
                
                // Prioritize Local News
                if (localRes.status === 'ok' && localRes.items) {
                    allNews = [...allNews, ...localRes.items.slice(0, 10).map((i: any) => i.title)];
                }
                
                // Append International News
                if (intRes.status === 'ok' && intRes.items) {
                    allNews = [...allNews, ...intRes.items.slice(0, 10).map((i: any) => i.title)];
                }
                
                setNews(allNews);
            } catch (e) {
                console.error("Failed to fetch news", e);
            }
        };

        fetchNewsItems();
        const interval = setInterval(fetchNewsItems, 60 * 60 * 1000); // 60 mins for breaking news
        return () => clearInterval(interval);
    }, [settings.language, settings.countryCode]);

    // Data Fetching
    useEffect(() => {
        const fetchAllWeather = async () => {
            // Prevent fetching if less than 5 minutes passed
            const now = Date.now();
            if (now - lastFetchRef.current < 5 * 60 * 1000) return;
            lastFetchRef.current = now;

            const fetchWorldWeather = async () => {
            try {
                // Use MAJOR_CITIES or fallback
                let cities = MAJOR_CITIES.length > 0 ? [...MAJOR_CITIES] : [...FALLBACK_CITIES];
                
                // Shuffle cities randomly using Fisher-Yates
                for (let i = cities.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [cities[i], cities[j]] = [cities[j], cities[i]];
                }

                // Limit to 40 cities to prevent 429 errors (Too Many Requests)
                // This fits in exactly 1 chunk request usually
                cities = cities.slice(0, 40);
                
                setWorldWeather([]); // Clear previous data

                // Chunking for energy efficiency (and API limits)
                const chunkSize = 40;
                
                for (let i = 0; i < cities.length; i += chunkSize) {
                    const chunk = cities.slice(i, i + chunkSize);
                    const lats = chunk.map(c => c.lat).join(',');
                    const lons = chunk.map(c => c.lon).join(',');
                    
                    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,is_day&timezone=auto`;
                    
                    // throttledFetch already handles the delay/queueing to be energy efficient
                    const response = await throttledFetch(url);
                    const results = Array.isArray(response) ? response : [response];
                    
                    const chunkItems: string[] = results.map((data: any, index: number) => {
                        const city = chunk[index];
                        const temp = convertTemp(data.current.temperature_2m, settings.tempUnit);
                        
                        let emoji = '☀️';
                        const code = data.current.weather_code;
                        const isNight = data.current.is_day === 0;
                        
                        if (isNight) emoji = '🌙';
                        else if ([0, 1].includes(code)) emoji = '☀️';
                        else if ([2, 3].includes(code)) emoji = '☁️';
                        else if ([45, 48].includes(code)) emoji = '🌫️';
                        else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) emoji = '🌧️';
                        else if ([71, 73, 75, 77, 85, 86].includes(code)) emoji = '❄️';
                        else if ([95, 96, 99].includes(code)) emoji = '⛈️';
                        
                        // Lokale tijd berekenen op basis van UTC offset van de API
                        const utcOffset = data.utc_offset_seconds || 0;
                        const cityTime = new Date(Date.now() + utcOffset * 1000);
                        const timeStr = cityTime.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'UTC'
                        });
                        
                        // Uurverschil met huidige lokale tijd
                        const localOffset = new Date().getTimezoneOffset() * -60; // in seconden
                        const diffHours = Math.round((utcOffset - localOffset) / 3600);
                        const diffStr = diffHours >= 0 ? `+${diffHours}u` : `${diffHours}u`;

                        return `<strong>${city.name.toUpperCase()}</strong>${city.country ? ` (${city.country})` : ''} ${emoji} ${Math.round(temp)}${getTempLabel(settings.tempUnit)} <span class="text-white/50 text-[1.2rem]">(${timeStr}, ${diffStr})</span>`;
                    });
                    
                    // Update state incrementally so user sees data appearing
                    setWorldWeather(prev => [...prev, ...chunkItems]);
                }
            } catch (e) {
                console.error("Failed to fetch world weather", e);
            }
        };

        const fetchFavoritesWeather = async () => {
            if (!settings.favorites || settings.favorites.length === 0) return;
            
            try {
                const lats = settings.favorites.map(c => c.lat).join(',');
                const lons = settings.favorites.map(c => c.lon).join(',');
                
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day&hourly=precipitation_probability,weather_code&forecast_days=1&timezone=auto`;
                
                const response = await throttledFetch(url);
                const results = Array.isArray(response) ? response : [response];

                const items: string[] = results.map((data: any, index: number) => {
                    const loc = settings.favorites[index];
                    const temp = convertTemp(data.current.temperature_2m, settings.tempUnit);
                    const feelsLike = convertTemp(data.current.apparent_temperature, settings.tempUnit);
                    const windSpeed = convertWind(data.current.wind_speed_10m, settings.windUnit);
                    const windUnit = settings.windUnit === WindUnit.BFT ? 'Bft' : settings.windUnit;
                    
                    let emoji = '☀️';
                    const code = data.current.weather_code;
                    const isNight = data.current.is_day === 0;
                    if (isNight) emoji = '🌙';
                    else if ([0, 1].includes(code)) emoji = '☀️';
                    else if ([2, 3].includes(code)) emoji = '☁️';
                    else if ([45, 48].includes(code)) emoji = '🌫️';
                    else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) emoji = '🌧️';
                    else if ([71, 73, 75, 77, 85, 86].includes(code)) emoji = '❄️';
                    else if ([95, 96, 99].includes(code)) emoji = '⛈️';

                    const locOffset = data.utc_offset_seconds || 0;
                    const cityTime = new Date(Date.now() + locOffset * 1000);
                    const cityHour = cityTime.getUTCHours();
                    const next3Hours = data.hourly.precipitation_probability.slice(cityHour, cityHour + 3);
                    const maxRainProb = Math.max(...next3Hours);
                    let warning = '';
                    if (maxRainProb > 30) warning = ' • ☂️ Pas op voor buien!';
                    else if (maxRainProb > 70) warning = ' • ☔ Regen verwacht!';
                    
                    const windDir = getWindDirection(data.current.wind_direction_10m);

                    return `📍 <strong>${loc.name.toUpperCase()}</strong>: ${emoji} ${Math.round(temp)}${getTempLabel(settings.tempUnit)} ` +
                        `(Gevoel ${Math.round(feelsLike)}°) - Wind ${windDir} ${Math.round(windSpeed)} ${windUnit}${warning}`;
                });
                
                setFavoritesWeather(items);
            } catch (e) {
                console.error("Failed to fetch favorites weather", e);
            }
        };

        const fetchLocalWeather = async () => {
            const loc = loadCurrentLocation();
            if (!loc) return;

            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto`;
                const response = await throttledFetch(url);
                
                const temp = convertTemp(response.current.temperature_2m, settings.tempUnit);
                const feelsLike = convertTemp(response.current.apparent_temperature, settings.tempUnit);
                const windSpeed = convertWind(response.current.wind_speed_10m, settings.windUnit);
                const windUnit = settings.windUnit === WindUnit.BFT ? 'Bft' : settings.windUnit;
                const windDir = getWindDirection(response.current.wind_direction_10m);
                const windAngle = response.current.wind_direction_10m;
                const pressure = Math.round(response.current.surface_pressure);
                
                let emoji = '☀️';
                const code = response.current.weather_code;
                const isNight = response.current.is_day === 0;
                
                if (isNight) emoji = '🌙';
                else if ([0, 1].includes(code)) emoji = '☀️';
                else if ([2, 3].includes(code)) emoji = '☁️';
                else if ([45, 48].includes(code)) emoji = '🌫️';
                else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) emoji = '🌧️';
                else if ([71, 73, 75, 77, 85, 86].includes(code)) emoji = '❄️';
                else if ([95, 96, 99].includes(code)) emoji = '⛈️';

                setLocalWeatherStr(`📍 ${loc.name}: ${emoji} ${Math.round(temp)}${getTempLabel(settings.tempUnit)} • ${windDir} ${Math.round(windSpeed)} ${windUnit}`);
                
                const daily = response.daily.time.slice(1).map((t: string, i: number) => ({
                    date: t,
                    code: response.daily.weather_code[i + 1],
                    min: convertTemp(response.daily.temperature_2m_min[i + 1], settings.tempUnit),
                    max: convertTemp(response.daily.temperature_2m_max[i + 1], settings.tempUnit)
                }));

                setLocalWeatherData({
                    name: loc.name,
                    temp,
                    windSpeed,
                    windDir,
                    windUnit,
                    windAngle,
                    pressure,
                    weatherCode: code,
                    isNight,
                    feelsLike,
                    daily
                });

            } catch (e) {
                console.error("Failed to fetch local weather", e);
            }
        };

        await Promise.all([
                fetchWorldWeather(),
                fetchFavoritesWeather(),
                fetchLocalWeather()
            ]);
        };

        // Initial fetch
        fetchAllWeather();

        // Refresh every 60 minutes
        const interval = setInterval(fetchAllWeather, 60 * 60 * 1000);

        return () => clearInterval(interval);
    }, []); // Empty dependency array to prevent re-fetch loop

    return (
        <div className="fixed inset-0 z-[2000] overflow-hidden bg-black text-white font-sans">
            {/* Audio Player - Only for fireplace */}
            <audio 
                ref={audioRef} 
                src="/fireplace.mp3" 
                loop 
                autoPlay={currentMode === 'fireplace' && modeType === 'video'} 
                crossOrigin="anonymous" 
            />

            {/* Background Content (Video or Photo) */}
            <div className="absolute inset-0 w-full h-full bg-black z-0">
                {modeType === 'photo' ? (
                    <div 
                        key={currentPhoto}
                        className="absolute inset-0 w-full h-full bg-cover bg-center transition-opacity duration-500 ease-in-out"
                        style={{ 
                            backgroundImage: `url('/weerfoto/${currentPhoto}')`,
                            opacity: fadeOpacity 
                        }}
                    />
                ) : (
                    <video 
                        key={effectiveMode} // Force reload on change
                        src={
                            effectiveMode === 'fireplace' ? "/fireplace.mp4" : 
                            effectiveMode === 'aquarium' ? "/aquarium.mp4" : 
                            effectiveMode === 'clouds' ? "/clouds1.mp4" :
                            effectiveMode === 'clouds2' ? "/clouds2.mp4" :
                            effectiveMode === 'sunset1' ? "/sunset1.mp4" :
                            effectiveMode === 'sunset2' ? "/sunset2.mp4" :
                            "/rain1.mp4"
                        } 
                        autoPlay 
                        loop 
                        muted 
                        playsInline 
                        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-in-out"
                        style={{ opacity: fadeOpacity }}
                    />
                )}
            </div>
            {/* Dark Overlay */}
            <div className="absolute inset-0 bg-black/30 z-10" />
            
            {/* Clock - Centered & Configurable */}
            {showClock && (
                <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 transition-opacity duration-500 hover:opacity-100 opacity-80">
                    {clockType === 'analogue' && (
                        <div className="w-[60vw] md:w-[20vw] max-w-[250px] aspect-square">
                            <AnalogueClock timezone={settings.timezone} />
                        </div>
                    )}
                    {clockType === 'weather_station' && (
                        <WeatherStationClock 
                            weatherData={localWeatherData} 
                            currentTime={currentTime} 
                            settings={settings} 
                        />
                    )}
                    {clockType === 'digital_round' && (
                        <div className="scale-75 md:scale-100">
                            <DigitalRoundClock 
                                currentTime={currentTime} 
                                settings={settings} 
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Floating Info Popup - Hidden on mobile */}
            {localWeatherData && showPopup && (
                <div 
                    className="absolute z-30 transition-all duration-1000 ease-in-out hidden md:block"
                    style={{ top: popupPos.top, left: popupPos.left }}
                >
                    <div className="bg-black/60 backdrop-blur-md border border-white/20 p-6 rounded-2xl shadow-2xl flex flex-col items-center min-w-[200px] animate-in fade-in zoom-in duration-500">
                        <h2 className="text-xl font-bold mb-1">{localWeatherData.name}</h2>
                        <div className="text-5xl my-2 text-white drop-shadow-lg">
                            <Icon name={mapWmoCodeToIcon(localWeatherData.weatherCode, !localWeatherData.isNight)} />
                        </div>
                        <div className="text-sm font-medium text-white/90 mb-2">
                             {mapWmoCodeToText(localWeatherData.weatherCode, 'nl')}
                        </div>
                        <div className="text-3xl font-bold mb-1">
                            {Math.round(localWeatherData.temp)}{getTempLabel(settings.tempUnit)}
                        </div>
                        <div className="text-xs text-white/70">
                            Gevoel {Math.round(localWeatherData.feelsLike || localWeatherData.temp)}°
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-sm">
                            <Icon name="air" />
                            <span>{localWeatherData.windDir} {Math.round(localWeatherData.windSpeed)} {localWeatherData.windUnit}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Tickers Container */}
            <div className="absolute top-0 left-0 right-0 z-20 flex flex-col">
                {/* World Weather Ticker - Adjusted for Mobile Camera Notch */}
                <div className="bg-blue-900/60 backdrop-blur-sm border-b border-white/10 text-white/90 font-medium drop-shadow-md overflow-hidden md:py-3 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-2 min-h-[90px] md:min-h-0 flex flex-col justify-end">
                    {/* @ts-ignore */}
                    <marquee scrollamount={Math.round(10 * scrollSpeedMultiplier)} className="flex items-center text-[1.8rem]">
                        {worldWeather.map((item, i) => (
                            <span key={i} className="mx-8 inline-block" dangerouslySetInnerHTML={{ __html: item }} />
                        ))}
                    {/* @ts-ignore */}
                    </marquee>
                </div>
                
                {/* News Ticker */}
                {showNews && news.length > 0 && (
                    <div className="bg-emerald-900/60 backdrop-blur-sm border-b border-white/10 py-2 text-white/80 font-medium drop-shadow-sm overflow-hidden">
                        {/* @ts-ignore */}
                        <marquee scrollamount={Math.round(8 * scrollSpeedMultiplier)} className="flex items-center text-[1.4rem]">
                            {news.map((item, i) => (
                                <span key={i} className="mx-8 inline-block">
                                    <span className="text-accent-primary mr-2">•</span>
                                    {item}
                                </span>
                            ))}
                        {/* @ts-ignore */}
                        </marquee>
                    </div>
                )}
            </div>

            {/* Bottom Bar Container */}
            {showBottomBar && (
             <div className="absolute bottom-0 left-0 right-0 z-20 bg-gray-900/80 backdrop-blur-md border-t border-white/10 flex items-stretch h-16 md:h-28 overflow-hidden transition-all duration-300">
                 {/* Date/Time & Local Weather (Static) - Hidden on mobile if needed, but logic says never show if hidden */}
                 <div className="hidden md:flex flex-none px-8 flex-col justify-center border-r border-white/10 bg-black/40 min-w-[250px] z-30">
                     <div className="text-3xl font-bold text-white leading-tight">
                         {currentTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                     </div>
                     <div className="text-sm text-white/70 uppercase font-medium mb-1">
                         {currentTime.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })}
                     </div>
                     {localWeatherStr && (
                         <div className="text-sm text-accent-primary font-bold truncate max-w-[300px] mt-1">
                             {localWeatherStr}
                         </div>
                     )}
                 </div>

                 {/* Favorites Ticker (Scrolling) */}
                 <div className="flex-1 flex items-center bg-red-900/30 relative overflow-hidden">
                     {/* @ts-ignore */}
                     <marquee scrollamount={Math.round(5 * scrollSpeedMultiplier)} className="w-full text-white font-bold flex items-center text-[1.5rem] md:text-[2.2rem]">
                         {favoritesWeather.map((item, i) => (
                             <span key={i} className="mx-8 inline-block" dangerouslySetInnerHTML={{ __html: item }} />
                         ))}
                     {/* @ts-ignore */}
                     </marquee>
                 </div>
            </div>
            )}

            {/* Fallback Full Width Ticker if Bottom Bar is hidden */}
            {!showBottomBar && (
                <div className="absolute bottom-0 left-0 right-0 z-20 bg-red-900/30 backdrop-blur-md border-t border-white/10 h-16 flex items-center overflow-hidden">
                     {/* @ts-ignore */}
                     <marquee scrollamount={Math.round(5 * scrollSpeedMultiplier)} className="w-full text-white font-bold flex items-center text-[1.5rem] md:text-[1.8rem]">
                         {favoritesWeather.map((item, i) => (
                             <span key={i} className="mx-8 inline-block" dangerouslySetInnerHTML={{ __html: item }} />
                         ))}
                     {/* @ts-ignore */}
                     </marquee>
                </div>
            )}

            {/* Floating Credit Button */}
            <CreditFloatingButton 
                onNavigate={onNavigate} 
                settings={settings} 
                className={`fixed right-4 z-50 transition-all duration-300 ${showBottomBar ? 'bottom-20 md:bottom-32' : 'bottom-20'}`}
            />

            {/* Controls - Toggleable */}
            <div 
                className="absolute top-36 right-8 z-50 flex flex-col items-end gap-4"
                onMouseLeave={() => setShowControls(false)}
            >
                {!showControls ? (
                    <button 
                        onClick={() => setShowControls(true)}
                        className="p-4 rounded-full bg-black/60 backdrop-blur-md border border-white/20 shadow-xl flex items-center gap-3 hover:bg-white/10 transition-all hover:scale-105 group"
                        title={t('ambient.settings.title')}
                    >
                        <Icon name="volume_up" className="text-xl text-white/80 group-hover:text-white" />
                        <Icon name="cast" className="text-xl text-white/80 group-hover:text-white" />
                    </button>
                ) : (
                    <div className="flex flex-col md:gap-4 gap-2 animate-in fade-in slide-in-from-right-4 duration-300 max-h-[80vh] overflow-y-auto pr-2">
                        
                        {/* Type Switcher (Video vs Photo) */}
                        <div className="md:p-4 p-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 shadow-xl flex flex-col md:gap-3 gap-2 items-center">
                            <div className="flex bg-black/40 rounded-lg p-1 w-full">
                                <button
                                    onClick={() => updateAmbientSetting('modeType', 'video')}
                                    className={`flex-1 md:py-2 py-1.5 rounded-md text-xs md:text-sm font-bold transition-all ${modeType === 'video' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'}`}
                                >
                                    {getTranslation('ambient.settings.video', settings.language)}
                                </button>
                                <button
                                    onClick={() => updateAmbientSetting('modeType', 'photo')}
                                    className={`flex-1 md:py-2 py-1.5 rounded-md text-xs md:text-sm font-bold transition-all ${modeType === 'photo' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'}`}
                                >
                                    {getTranslation('ambient.settings.photos', settings.language)}
                                </button>
                            </div>
                        </div>

                        {/* Mode Switcher (Only visible in Video mode) */}
                        {modeType === 'video' && (
                            <div className="md:p-4 p-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 shadow-xl flex flex-col md:gap-3 gap-2 items-center">
                                 <div className="flex md:gap-2 gap-1 flex-wrap justify-center max-w-[200px] md:max-w-none">
                                    {['fireplace', 'aquarium', 'clouds', 'clouds2', 'rain', 'sunset1', 'sunset2', 'random'].map(mode => (
                                        <button 
                                            key={mode}
                                            onClick={() => setMode(mode as any)}
                                            className={`p-1.5 md:p-2 rounded-lg transition-all border ${currentMode === mode ? 'bg-white/20 border-accent-primary text-white' : 'bg-transparent border-transparent text-white/50 hover:text-white'}`}
                                            title={t('ambient.modes.' + mode)}
                                        >
                                            <Icon name={
                                                mode === 'fireplace' ? "local_fire_department" :
                                                mode === 'aquarium' ? "water" :
                                                mode === 'clouds' ? "cloud" :
                                                mode === 'clouds2' ? "cloud_queue" :
                                                mode === 'rain' ? "rainy" : 
                                                mode === 'sunset1' ? "wb_twilight" :
                                                mode === 'sunset2' ? "sunny" : "shuffle"
                                            } className="text-xl md:text-2xl" />
                                        </button>
                                    ))}
                                 </div>
                            </div>
                        )}

                        {/* Audio Controls - Only for Fireplace (Video Mode) */}
                        {(modeType === 'video' && effectiveMode === 'fireplace') && (
                            <div className="md:p-4 p-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 shadow-xl flex flex-col md:gap-3 gap-2 items-center">
                                <div className="flex items-center gap-2 mb-1">
                                    <button 
                                        onClick={() => setIsMuted(!isMuted)}
                                        className="flex items-center justify-center p-2 rounded-full hover:bg-white/10 transition-colors"
                                        title={isMuted ? t('ambient.settings.unmute') : t('ambient.settings.mute')}
                                    >
                                        <Icon name={isMuted ? "volume_off" : "volume_up"} className="text-xl md:text-2xl" />
                                    </button>
                                    <span className="text-xs font-bold w-8 text-center">{Math.round(volume * 100)}%</span>
                                </div>
                                <div className="h-24 md:h-32 flex items-center justify-center py-2">
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="1" 
                                        step="0.01" 
                                        value={volume}
                                        onInput={(e) => {
                                            const newVol = parseFloat((e.target as HTMLInputElement).value);
                                            setVolume(newVol);
                                            if (audioRef.current) {
                                                audioRef.current.volume = newVol;
                                                if (newVol > 0 && isMuted) setIsMuted(false);
                                            }
                                        }}
                                        className="w-24 md:w-32 h-2 appearance-none bg-white/20 rounded-full outline-none cursor-pointer accent-accent-primary -rotate-90"
                                        style={{ 
                                            WebkitAppearance: 'none',
                                            MozAppearance: 'none'
                                        }} 
                                    />
                                </div>
                            </div>
                        )}

                        {/* Display Settings */}
                        <div className="md:p-4 p-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 shadow-xl flex flex-col md:gap-3 gap-1 w-full min-w-[160px] md:min-w-[200px]">
                            <h3 className="text-xs md:text-sm font-bold text-white/80 uppercase tracking-wider mb-1 text-center">{getTranslation('ambient.settings.display', settings.language)}</h3>
                            
                            <button 
                                onClick={() => updateAmbientSetting('showNews', !showNews)}
                                className="flex items-center justify-between w-full p-1.5 md:p-2 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Icon name="newspaper" className="text-lg md:text-xl" />
                                    <span className="text-xs md:text-sm">{getTranslation('ambient.settings.news', settings.language)}</span>
                                </div>
                                <div className={`w-8 md:w-10 h-4 md:h-5 rounded-full relative transition-colors ${showNews ? 'bg-accent-primary' : 'bg-white/20'}`}>
                                    <div className={`absolute top-0.5 md:top-1 w-3 h-3 rounded-full bg-white transition-all duration-200 ${showNews ? 'left-4 md:left-6' : 'left-1'}`} />
                                </div>
                            </button>

                            <button 
                                onClick={() => updateAmbientSetting('showPopup', !showPopup)}
                                className="flex items-center justify-between w-full p-1.5 md:p-2 rounded-lg hover:bg-white/10 transition-colors"
                                title="Toon weer popup (verborgen op mobiel)"
                            >
                                <div className="flex items-center gap-2">
                                    <Icon name="widgets" className="text-lg md:text-xl" />
                                    <span className="text-xs md:text-sm">{getTranslation('ambient.settings.popup', settings.language)}</span>
                                </div>
                                <div className={`w-8 md:w-10 h-4 md:h-5 rounded-full relative transition-colors ${showPopup ? 'bg-accent-primary' : 'bg-white/20'}`}>
                                    <div className={`absolute top-0.5 md:top-1 w-3 h-3 rounded-full bg-white transition-all duration-200 ${showPopup ? 'left-4 md:left-6' : 'left-1'}`} />
                                </div>
                            </button>

                            <div className="flex flex-col gap-1 w-full">
                                <button 
                                    onClick={() => updateAmbientSetting('showClock', !showClock)}
                                    className="flex items-center justify-between w-full p-1.5 md:p-2 rounded-lg hover:bg-white/10 transition-colors"
                                    title="Toon klok (verborgen op mobiel)"
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon name="schedule" className="text-lg md:text-xl" />
                                        <span className="text-xs md:text-sm">{getTranslation('ambient.settings.clock', settings.language)}</span>
                                    </div>
                                    <div className={`w-8 md:w-10 h-4 md:h-5 rounded-full relative transition-colors ${showClock ? 'bg-accent-primary' : 'bg-white/20'}`}>
                                        <div className={`absolute top-0.5 md:top-1 w-3 h-3 rounded-full bg-white transition-all duration-200 ${showClock ? 'left-4 md:left-6' : 'left-1'}`} />
                                    </div>
                                </button>
                                {showClock && (
                                    <div className="flex gap-1 pl-8 w-full overflow-x-auto pb-1">
                                        {[
                                            { id: 'analogue', icon: 'schedule', label: 'Analoog' },
                                            { id: 'weather_station', icon: 'nest_remote_comfort_sensor', label: 'Station' },
                                            { id: 'digital_round', icon: 'watch', label: 'Digitaal' }
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                onClick={() => updateAmbientSetting('clockType', opt.id)}
                                                className={`flex-1 min-w-[60px] py-1 px-2 rounded-md text-[10px] font-bold border transition-all flex flex-col items-center gap-1 ${clockType === opt.id ? 'bg-white/20 border-accent-primary text-white' : 'border-white/10 text-white/50 hover:bg-white/10'}`}
                                            >
                                                <Icon name={opt.icon} className="text-sm" />
                                                <span>{opt.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button 
                                onClick={() => updateAmbientSetting('showBottomBar', !showBottomBar)}
                                className="flex items-center justify-between w-full p-1.5 md:p-2 rounded-lg hover:bg-white/10 transition-colors"
                                title={t('ambient.settings.bar_hint')}
                            >
                                <div className="flex items-center gap-2">
                                    <Icon name="dock" className="text-lg md:text-xl" />
                                    <span className="text-xs md:text-sm">{getTranslation('ambient.settings.bar', settings.language)}</span>
                                </div>
                                <div className={`w-8 md:w-10 h-4 md:h-5 rounded-full relative transition-colors ${showBottomBar ? 'bg-accent-primary' : 'bg-white/20'}`}>
                                    <div className={`absolute top-0.5 md:top-1 w-3 h-3 rounded-full bg-white transition-all duration-200 ${showBottomBar ? 'left-4 md:left-6' : 'left-1'}`} />
                                </div>
                            </button>
                        </div>

                        {/* Chromecast Button */}
                        <button 
                            onClick={handleCast}
                            className="md:p-4 p-3 rounded-full bg-black/60 hover:bg-white/10 backdrop-blur-md transition-all text-white border border-white/20 shadow-xl flex items-center justify-center"
                            title={getTranslation('ambient.chromecast.title', settings.language)}
                        >
                            <Icon name="cast" className="text-2xl md:text-3xl" />
                        </button>
                    </div>
                )}
            </div>
            
            {/* Chromecast Modal */}
            {showCastModal && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-slate-900 border border-white/20 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-6">
                        <div className="w-20 h-20 rounded-full bg-accent-primary/20 flex items-center justify-center">
                            <Icon name="cast" className="text-4xl text-accent-primary" />
                        </div>
                        
                        <div className="text-center w-full">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <h2 className="text-2xl font-bold">{t('ambient.chromecast.title')}</h2>
                                <div className="group relative">
                                    <Icon name="info" className="text-white/40 hover:text-white cursor-help transition-colors" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 p-3 bg-slate-800 border border-white/20 rounded-xl shadow-2xl text-xs text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[4000] text-center">
                                        {getTranslation('ambient.chromecast.ios_warning', settings.language)}
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800" />
                                    </div>
                                </div>
                            </div>
                            <p className="text-white/60 text-sm">{getTranslation('ambient.chromecast.scan_text', settings.language)}</p>
                        </div>

                        <div className="w-full space-y-4">
                            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-white/40 uppercase tracking-wider">{getTranslation('ambient.chromecast.status', settings.language)}</span>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${currentCastState === 'NO_DEVICES_AVAILABLE' ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
                                        <span className="text-sm font-medium">
                                            {currentCastState === 'NO_DEVICES_AVAILABLE' ? getTranslation('ambient.chromecast.no_devices', settings.language) : 
                                             currentCastState === 'NOT_CONNECTED' ? getTranslation('ambient.chromecast.devices_available', settings.language) : 
                                             currentCastState === 'CONNECTING' ? getTranslation('ambient.chromecast.connecting', settings.language) : 
                                             currentCastState === 'CONNECTED' ? getTranslation('ambient.chromecast.connected', settings.language) : getTranslation('ambient.chromecast.searching', settings.language)}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs text-white/40 leading-relaxed">
                                    {currentCastState === 'NO_DEVICES_AVAILABLE' 
                                        ? getTranslation('ambient.chromecast.no_devices_hint', settings.language) 
                                        : getTranslation('ambient.chromecast.connect_hint', settings.language)}
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button 
                                    onClick={reInitCast}
                                    className="flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 transition-all font-bold flex items-center justify-center gap-2 border border-white/10"
                                >
                                    <Icon name="refresh" className="text-xl" />
                                    <span>{getTranslation('ambient.chromecast.refresh', settings.language)}</span>
                                </button>
                                
                                <button 
                                    onClick={triggerNativeCast}
                                    className="flex-[2] py-3 px-4 rounded-xl bg-accent-primary hover:bg-accent-primary/80 transition-all font-bold text-white flex items-center justify-center gap-2 shadow-lg shadow-accent-primary/20"
                                >
                                    <Icon name="search" className="text-xl" />
                                    <span>{getTranslation('ambient.chromecast.connect', settings.language)}</span>
                                </button>
                            </div>
                        </div>

                        <button 
                            onClick={() => setShowCastModal(false)}
                            className="text-white/40 hover:text-white transition-colors text-sm font-medium"
                        >
                            {getTranslation('ambient.chromecast.close', settings.language)}
                        </button>
                    </div>
                </div>
            )}
            
            {/* Floating Back Button (Always visible and prominent) */}
            <button 
                onClick={() => onNavigate(ViewState.CURRENT)}
                className="absolute top-36 left-8 z-50 p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-xl flex items-center gap-2 transition-all hover:scale-105"
            >
                <Icon name="arrow_back" className="text-2xl" />
                <span className="font-bold">{getTranslation('common.back', settings.language)}</span>
            </button>

            {/* Credit Icon removed (duplicate) */}
        </div>
    );
};

function getWindDirection(degree: number, language: AppLanguage = 'nl'): string {
    const sectors = [
        getTranslation('ambient.wind.n', language),
        getTranslation('ambient.wind.ne', language),
        getTranslation('ambient.wind.e', language),
        getTranslation('ambient.wind.se', language),
        getTranslation('ambient.wind.s', language),
        getTranslation('ambient.wind.sw', language),
        getTranslation('ambient.wind.w', language),
        getTranslation('ambient.wind.nw', language)
    ];
    degree += 22.5;
    if (degree < 0) degree = 360 - Math.abs(degree) % 360;
    else degree = degree % 360;
    const which = Math.floor(degree / 45);
    return sectors[which];
}
