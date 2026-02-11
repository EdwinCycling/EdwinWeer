import React, { useEffect, useState, useRef } from 'react';
import { AppSettings, ViewState, Location, TempUnit, WindUnit } from '../types';
import { throttledFetch, mapWmoCodeToIcon, mapWmoCodeToText, getTempLabel, convertTemp, convertWind } from '../services/weatherService';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { loadCurrentLocation } from '../services/storageService';

interface AmbientViewProps {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

const WORLD_CITIES: Location[] = [
    { name: 'Tokyo', country: 'JP', lat: 35.6895, lon: 139.6917 },
    { name: 'New York', country: 'US', lat: 40.7128, lon: -74.0060 },
    { name: 'London', country: 'GB', lat: 51.5074, lon: -0.1278 },
    { name: 'Paris', country: 'FR', lat: 48.8566, lon: 2.3522 },
    { name: 'Sydney', country: 'AU', lat: -33.8688, lon: 151.2093 },
    { name: 'Dubai', country: 'AE', lat: 25.2048, lon: 55.2708 },
    { name: 'Singapore', country: 'SG', lat: 1.3521, lon: 103.8198 },
    { name: 'Hong Kong', country: 'HK', lat: 22.3193, lon: 114.1694 },
    { name: 'Los Angeles', country: 'US', lat: 34.0522, lon: -118.2437 },
    { name: 'Rio de Janeiro', country: 'BR', lat: -22.9068, lon: -43.1729 },
    { name: 'Cape Town', country: 'ZA', lat: -33.9249, lon: 18.4241 },
    { name: 'Moscow', country: 'RU', lat: 55.7558, lon: 37.6173 },
    { name: 'Mumbai', country: 'IN', lat: 19.0760, lon: 72.8777 },
    { name: 'Beijing', country: 'CN', lat: 39.9042, lon: 116.4074 },
    { name: 'Cairo', country: 'EG', lat: 30.0444, lon: 31.2357 },
    { name: 'Istanbul', country: 'TR', lat: 41.0082, lon: 28.9784 },
    { name: 'Bangkok', country: 'TH', lat: 13.7563, lon: 100.5018 },
    { name: 'Seoul', country: 'KR', lat: 37.5665, lon: 126.9780 },
    { name: 'Mexico City', country: 'MX', lat: 19.4326, lon: -99.1332 },
    { name: 'Toronto', country: 'CA', lat: 43.65107, lon: -79.347015 },
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
    weatherCode: number;
    isNight: boolean;
    feelsLike?: number;
}

export const AmbientView: React.FC<AmbientViewProps> = ({ onNavigate, settings }) => {
    const [worldWeather, setWorldWeather] = useState<string[]>([]);
    const [favoritesWeather, setFavoritesWeather] = useState<string[]>([]);
    const [localWeatherStr, setLocalWeatherStr] = useState<string | null>(null);
    const [localWeatherData, setLocalWeatherData] = useState<LocalWeather | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [castAvailable, setCastAvailable] = useState(false);
    
    // Audio State
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0.5);
    const audioRef = useRef<HTMLAudioElement>(null);
    
    // Popup State
    const [popupPos, setPopupPos] = useState({ top: '20%', left: '20%' });
    
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
        if (audioRef.current) {
            audioRef.current.volume = volume;
            audioRef.current.muted = isMuted;
            
            // Forceer play als het niet op pauze staat
            if (!isMuted && audioRef.current.paused) {
                audioRef.current.play().catch(e => console.error("Audio play error:", e));
            }
        }
    }, [volume, isMuted]);

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
        const initCast = () => {
            if (window.chrome && window.chrome.cast && window.chrome.cast.isAvailable) {
                setCastAvailable(true);
                try {
                    const context = window.cast.framework.CastContext.getInstance();
                    context.setOptions({
                        receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
                    });
                    
                    // Listen for session changes
                    context.addEventListener(
                        window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                        (event: any) => {
                            console.log("Cast session state:", event.sessionState);
                        }
                    );
                } catch (e) {
                    console.error("Cast init error", e);
                }
            }
        };

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
    }, []);

    const handleCast = () => {
        if (window.cast && window.cast.framework) {
             window.cast.framework.CastContext.getInstance().requestSession();
        }
    };

    const lastFetchRef = useRef<number>(0);

    // Data Fetching
    useEffect(() => {
        const fetchAllWeather = async () => {
            // Prevent fetching if less than 5 minutes passed
            const now = Date.now();
            if (now - lastFetchRef.current < 5 * 60 * 1000) return;
            lastFetchRef.current = now;

            const fetchWorldWeather = async () => {
            try {
                const lats = WORLD_CITIES.map(c => c.lat).join(',');
                const lons = WORLD_CITIES.map(c => c.lon).join(',');
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,is_day`;
                
                const response = await throttledFetch(url);
                const results = Array.isArray(response) ? response : [response];
                
                const items: string[] = results.map((data: any, index: number) => {
                    const city = WORLD_CITIES[index];
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
                    const timeStr = cityTime.getUTCHours().toString().padStart(2, '0') + ':' + 
                                   cityTime.getUTCMinutes().toString().padStart(2, '0');
                    
                    // Uurverschil met huidige lokale tijd
                    const localOffset = new Date().getTimezoneOffset() * -60; // in seconden
                    const diffHours = Math.round((utcOffset - localOffset) / 3600);
                    const diffStr = diffHours >= 0 ? `+${diffHours}u` : `${diffHours}u`;

                    return `<strong>${city.name.toUpperCase()}</strong> ${emoji} ${Math.round(temp)}${getTempLabel(settings.tempUnit)} <span class="text-white/50 text-[1.2rem]">(${timeStr}, ${diffStr})</span>`;
                });
                
                setWorldWeather(items);
            } catch (e) {
                console.error("Failed to fetch world weather", e);
            }
        };

        const fetchFavoritesWeather = async () => {
            if (!settings.favorites || settings.favorites.length === 0) return;
            
            try {
                const lats = settings.favorites.map(c => c.lat).join(',');
                const lons = settings.favorites.map(c => c.lon).join(',');
                
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day&hourly=precipitation_probability,weather_code&forecast_days=1`;
                
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

                    const currentHour = new Date().getHours();
                    const next3Hours = data.hourly.precipitation_probability.slice(currentHour, currentHour + 3);
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
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day`;
                const response = await throttledFetch(url);
                
                const temp = convertTemp(response.current.temperature_2m, settings.tempUnit);
                const feelsLike = convertTemp(response.current.apparent_temperature, settings.tempUnit);
                const windSpeed = convertWind(response.current.wind_speed_10m, settings.windUnit);
                const windUnit = settings.windUnit === WindUnit.BFT ? 'Bft' : settings.windUnit;
                const windDir = getWindDirection(response.current.wind_direction_10m);
                
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
                
                setLocalWeatherData({
                    name: loc.name,
                    temp,
                    windSpeed,
                    windDir,
                    windUnit,
                    weatherCode: code,
                    isNight,
                    feelsLike
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
            {/* Audio Player */}
            <audio ref={audioRef} src="/fireplace.mp3" loop autoPlay crossOrigin="anonymous" />

            {/* Video Background */}
            <video 
                src="/fireplace.mp4" 
                autoPlay 
                loop 
                muted 
                playsInline 
                className="absolute inset-0 w-full h-full object-cover z-0"
            />
            {/* Dark Overlay */}
            <div className="absolute inset-0 bg-black/30 z-10" />
            
            {/* Floating Info Popup */}
            {localWeatherData && (
                <div 
                    className="absolute z-30 transition-all duration-1000 ease-in-out"
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

            {/* Top Ticker - World Weather */}
            <div className="absolute top-0 left-0 right-0 z-20">
                <div className="bg-blue-900/60 backdrop-blur-sm border-b border-white/10 py-3 text-white/90 font-medium drop-shadow-md overflow-hidden">
                    <marquee scrollamount="10" className="flex items-center text-[1.8rem]">
                        {worldWeather.map((item, i) => (
                            <span key={i} className="mx-8 inline-block" dangerouslySetInnerHTML={{ __html: item }} />
                        ))}
                    </marquee>
                </div>
            </div>

            {/* Bottom Bar Container */}
             <div className="absolute bottom-0 left-0 right-0 z-20 bg-gray-900/80 backdrop-blur-md border-t border-white/10 flex items-stretch h-28 overflow-hidden">
                 {/* Date/Time & Local Weather (Static) */}
                 <div className="flex-none px-8 flex flex-col justify-center border-r border-white/10 bg-black/40 min-w-[250px] z-30">
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
                     <marquee scrollamount="7" className="w-full text-white font-bold flex items-center text-[2.2rem]">
                         {favoritesWeather.map((item, i) => (
                             <span key={i} className="mx-8 inline-block" dangerouslySetInnerHTML={{ __html: item }} />
                         ))}
                     </marquee>
                 </div>
            </div>

            {/* Controls - Always visible */}
            <div className="absolute top-24 right-8 z-50 flex flex-col gap-4 transition-opacity duration-500">
                {/* Audio Controls */}
                <div className="p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 shadow-xl flex flex-col gap-3 items-center">
                    <div className="flex items-center gap-2 mb-1">
                        <button 
                            onClick={() => setIsMuted(!isMuted)}
                            className="flex items-center justify-center p-2 rounded-full hover:bg-white/10 transition-colors"
                            title={isMuted ? "Unmute" : "Mute"}
                        >
                            <Icon name={isMuted ? "volume_off" : "volume_up"} className="text-2xl" />
                        </button>
                        <span className="text-xs font-bold w-8 text-center">{Math.round(volume * 100)}%</span>
                    </div>
                    <div className="h-32 flex items-center justify-center py-2">
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
                            className="w-32 h-2 appearance-none bg-white/20 rounded-full outline-none cursor-pointer accent-accent-primary -rotate-90"
                            style={{ 
                                WebkitAppearance: 'none',
                                MozAppearance: 'none'
                            }} 
                        />
                    </div>
                </div>

                {/* Chromecast */}
                <button 
                    onClick={handleCast}
                    className={`p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all text-white border border-white/20 shadow-xl ${!castAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Cast naar TV"
                    disabled={!castAvailable}
                >
                    <Icon name="cast" className="text-3xl" />
                </button>
            </div>
            
            {/* Floating Back Button (Always visible and prominent) */}
            <button 
                onClick={() => onNavigate(ViewState.CURRENT)}
                className="absolute top-24 left-8 z-50 p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-xl flex items-center gap-2 transition-all hover:scale-105"
            >
                <Icon name="arrow_back" className="text-2xl" />
                <span className="font-bold">Terug</span>
            </button>
        </div>
    );
};

function getWindDirection(degree: number): string {
    const sectors = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
    degree += 22.5;
    if (degree < 0) degree = 360 - Math.abs(degree) % 360;
    else degree = degree % 360;
    const which = Math.floor(degree / 45);
    return sectors[which];
}