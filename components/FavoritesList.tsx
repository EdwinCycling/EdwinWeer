import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Location, AppSettings, TempUnit } from '../types';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';
import { convertTemp, mapWmoCodeToText, mapWmoCodeToIcon, convertWind } from '../services/weatherService';
import { StaticWeatherBackground } from './StaticWeatherBackground';
import { loadFavoritesCompactMode, saveFavoritesCompactMode } from '../services/storageService';
import { useScrollLock } from '../hooks/useScrollLock';

interface FavoriteWeather {
    temp: number;
    minTemp: number;
    maxTemp: number;
    weatherCode: number;
    isDay: number;
    time: string; // Local time
    utcOffset: number;
    apparentTemp: number;
    sunriseToday: string;
    sunsetToday: string;
    sunriseTomorrow: string;
    precipitation: number;
    precipProb: number;
    cloudCover: number;
    windSpeed: number;
    minutely15: {
        time: string[];
        precipitation: number[];
    };
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    favorites: Location[];
    myLocation?: Location | null;
    onSelectLocation: (loc: Location) => void;
    settings: AppSettings;
}

export const FavoritesList: React.FC<Props> = ({ 
    isOpen, 
    onClose, 
    favorites, 
    myLocation,
    onSelectLocation, 
    settings 
}) => {
    const [weatherData, setWeatherData] = useState<Record<string, FavoriteWeather>>({});
    const [displayedFavorites, setDisplayedFavorites] = useState<Location[]>([]);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [compactMode, setCompactMode] = useState<boolean>(() => loadFavoritesCompactMode());
    const observerTarget = useRef(null);
    const BATCH_SIZE = 10;

    useScrollLock(isOpen);

    const t = (key: string) => getTranslation(key, settings.language);

    // Initial load: Current Location + First Batch
    useEffect(() => {
        if (isOpen) {
            setPage(0);
            setDisplayedFavorites(favorites.slice(0, BATCH_SIZE));
            const firstBatch = favorites.slice(0, BATCH_SIZE);
            const initialList = myLocation ? [myLocation, ...firstBatch] : firstBatch;
            fetchWeatherForList(initialList);
        }
    }, [isOpen, favorites, myLocation]);

    // Load more favorites when page changes
    useEffect(() => {
        if (page > 0) {
            const start = page * BATCH_SIZE;
            const end = start + BATCH_SIZE;
            const nextBatch = favorites.slice(start, end);
            
            if (nextBatch.length > 0) {
                setDisplayedFavorites(prev => [...prev, ...nextBatch]);
                fetchWeatherForList(nextBatch);
            }
        }
    }, [page]);

    const fetchWeatherForList = async (locations: Location[]) => {
        if (locations.length === 0) return;
        setLoading(true);

        const lats = locations.map(l => l.lat).join(',');
        const lons = locations.map(l => l.lon).join(',');

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,is_day,apparent_temperature,precipitation,cloud_cover,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&minutely_15=precipitation&timezone=auto`;
            const res = await fetch(url);
            const data = await res.json();

            const newWeather: Record<string, FavoriteWeather> = {};

            const processItem = (item: any, loc: Location) => {
                if (!item || !item.current || !item.daily) return;
                
                // Calculate local time based on UTC offset
                const now = new Date();
                const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
                const localDate = new Date(utc + (item.utc_offset_seconds * 1000));
                
                const timeStr = localDate.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', {
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: settings.timeFormat === '12h'
                });

                newWeather[`${loc.lat},${loc.lon}`] = {
                    temp: item.current.temperature_2m,
                    weatherCode: item.current.weather_code,
                    isDay: item.current.is_day,
                    minTemp: item.daily.temperature_2m_min[0],
                    maxTemp: item.daily.temperature_2m_max[0],
                    time: timeStr,
                    utcOffset: item.utc_offset_seconds,
                    apparentTemp: item.current.apparent_temperature,
                    sunriseToday: item.daily.sunrise[0],
                    sunsetToday: item.daily.sunset[0],
                    sunriseTomorrow: item.daily.sunrise[1],
                    precipitation: item.current.precipitation,
                    precipProb: item.daily.precipitation_probability_max[0],
                    cloudCover: item.current.cloud_cover,
                    windSpeed: item.current.wind_speed_10m,
                    minutely15: item.minutely_15
                };
            };

            if (Array.isArray(data)) {
                data.forEach((item, index) => {
                    processItem(item, locations[index]);
                });
            } else {
                // Single location response
                processItem(data, locations[0]);
            }

            setWeatherData(prev => ({ ...prev, ...newWeather }));

        } catch (error) {
            console.error("Failed to fetch favorites weather", error);
        } finally {
            setLoading(false);
        }
    };

    // Intersection Observer for infinite scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && !loading && displayedFavorites.length < favorites.length) {
                    setPage(prev => prev + 1);
                }
            },
            { threshold: 0.5 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current);
            }
        };
    }, [loading, displayedFavorites.length, favorites.length]);

    if (!isOpen) return null;

    const getTimeUntilSunEvent = (weather: FavoriteWeather) => {
        // We need to compare "Now" at the location with "Sun Event" at the location.
        // The most robust way is to convert everything to UNIX timestamps (UTC).
        
        // 1. Get current UTC time (Device time is correct reference for "Now" in absolute terms)
        const nowTs = Date.now(); 

        // 2. Parse Open-Meteo ISO strings (which are local to the requested timezone) back to UTC timestamps.
        // The API returns e.g. "2023-10-28T06:00" for a location with timezone offset.
        // If we just do new Date("..."), it assumes browser timezone. We must correct this.
        // Actually, since we know the utcOffset from the API, we can calculate the true UTC timestamp.
        // Open-Meteo with &timezone=auto returns local time string.
        // To get UTC timestamp: Parse as UTC, then subtract offset.
        // E.g. Tokyo (+9). "06:00". Parse as 06:00 UTC. Real time is 06:00 - 9h = 21:00 UTC (prev day).
        
        const parseToUtc = (isoStr: string) => {
            // Append Z to treat as UTC, then subtract offset to get true UTC timestamp
            return new Date(isoStr + 'Z').getTime() - (weather.utcOffset * 1000);
        };

        const sunriseToday = parseToUtc(weather.sunriseToday);
        const sunsetToday = parseToUtc(weather.sunsetToday);
        const sunriseTomorrow = parseToUtc(weather.sunriseTomorrow);

        let targetTime = 0;
        let type = '';

        if (weather.isDay) {
            targetTime = sunsetToday;
            type = 'sunset';
        } else {
            // Night logic
            // If now is before sunriseToday (early morning hours), target is sunriseToday.
            // If now is after sunriseToday (meaning it's evening/night after sunset), target is sunriseTomorrow.
            
            if (nowTs < sunriseToday) {
                targetTime = sunriseToday;
            } else {
                targetTime = sunriseTomorrow;
            }
            type = 'sunrise';
        }
        
        const diff = targetTime - nowTs;
        if (diff > 0) {
             const hours = Math.floor(diff / 3600000);
             const mins = Math.floor((diff % 3600000) / 60000);
             return { type, text: `${hours}u ${mins}m` };
        } else {
             return { type, text: '--' }; 
        }
    };

    const getTimeDifference = (weather: FavoriteWeather) => {
        const localOffset = -new Date().getTimezoneOffset() * 60; // in seconds
        const remoteOffset = weather.utcOffset;
        const diffHours = Math.round((remoteOffset - localOffset) / 3600);

        if (diffHours === 0) return null;
        
        const key = diffHours > 0 ? 'time.later' : 'time.earlier';
        return t(key).replace('{hours}', Math.abs(diffHours).toString());
    };

    const renderCard = (loc: Location, isMyLocation: boolean) => {
        const weather = weatherData[`${loc.lat},${loc.lon}`];
        const key = `${loc.lat},${loc.lon}-${isMyLocation ? 'my' : 'fav'}`;

        let sunEvent = null;
        let timeDiff = null;
        if (weather) {
            sunEvent = getTimeUntilSunEvent(weather);
            timeDiff = getTimeDifference(weather);
        }

        return (
            <div 
                key={key}
                onClick={() => onSelectLocation(loc)}
                className={`relative overflow-hidden rounded-3xl mb-4 cursor-pointer transform transition-all active:scale-95 shadow-lg border border-white/10 bg-slate-900 ${compactMode ? 'p-4 min-h-[110px]' : 'p-5 min-h-[140px]'}`}
            >
                {/* Background Weather Animation/Image */}
                {weather && (
                     <div className="absolute inset-0 z-0">
                        <StaticWeatherBackground 
                            weatherCode={weather.weatherCode} 
                            isDay={weather.isDay} 
                            cloudCover={weather.cloudCover}
                            className="absolute inset-0 w-full h-full"
                        />
                    </div>
                )}
                
                {/* Subtle overlay for text readability */}
                <div className="absolute inset-0 bg-black/20 z-0 pointer-events-none" />

                <div className={`relative z-10 flex flex-col justify-between h-full text-white drop-shadow-md ${compactMode ? 'gap-2' : 'gap-4'}`}>
                    
                    {/* Top Row: Name, Time, Main Temp */}
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-0.5">
                            <h3 className="text-xl font-bold leading-tight drop-shadow-md">
                                {loc.name}
                            </h3>
                            {isMyLocation ? (
                                 <div className="flex items-center gap-1 text-xs text-white/90 font-medium drop-shadow-sm">
                                    <Icon name="my_location" className="text-[10px]" />
                                    <span>{t('favorites.my_location_last') || 'My Location (last known)'}</span>
                                 </div>
                            ) : (
                                <div className="flex flex-col">
                                    <span className="text-sm text-white/90 font-medium tracking-wide drop-shadow-sm">
                                        {weather ? weather.time : '--:--'}
                                    </span>
                                    {timeDiff && (
                                        <span className="text-[10px] text-white/70">
                                            {timeDiff}
                                        </span>
                                    )}
                                </div>
                            )}
                            <div className="text-sm text-white/80 font-medium mt-1">
                                {weather ? mapWmoCodeToText(weather.weatherCode, settings.language) : '...'}
                            </div>
                        </div>

                        <div className="flex flex-col items-end">
                            <div className="text-5xl font-light tracking-tighter drop-shadow-lg">
                                {weather ? convertTemp(weather.temp, settings.tempUnit) : '--'}°
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-white/90 mt-1">
                                <span>{t('temp.high_short')}:{weather ? convertTemp(weather.maxTemp, settings.tempUnit) : '--'}°</span>
                                <span>{t('temp.low_short')}:{weather ? convertTemp(weather.minTemp, settings.tempUnit) : '--'}°</span>
                            </div>
                            {/* Feels Like moved here */}
                            {weather && (
                                <div className="text-[11px] text-white/80 mt-0.5">
                                    {t('feels_like')}: {convertTemp(weather.apparentTemp, settings.tempUnit)}°
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom Row: Details (Grid) */}
                    {weather && !compactMode && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-white/90 border-t border-white/10 pt-3 mt-1">
                            
                            {/* Sun Event */}
                            <div className="flex items-center gap-2">
                                <Icon name={sunEvent?.type === 'sunset' ? 'wb_twilight' : 'wb_sunny'} className="text-base opacity-70" />
                                <span>
                                    {sunEvent?.type === 'sunset' ? t('sunset') : t('sunrise')}: 
                                    {sunEvent?.text ? ` ${t('in') || 'in'} ${sunEvent.text}` : ' --'}
                                </span>
                            </div>

                            {/* Rain Info */}
                            <div className="flex items-center gap-2 flex-row-reverse justify-end sm:flex-row sm:justify-start">
                                <span>
                                    {weather.precipitation > 0 
                                        ? `${weather.precipitation}mm` 
                                        : `${weather.precipProb}% ${t('chance') || 'kans'}`
                                    }
                                </span>
                                <Icon name="water_drop" className="text-base opacity-70" />
                            </div>

                            {/* Cloud Cover Bar - spanning full width if odd number of items, or just keeping it in grid */}
                            <div className="col-span-2 flex items-center gap-2 mt-1">
                                <Icon name="cloud" className="text-base opacity-70" />
                                <div className="flex-1 flex flex-col gap-0.5">
                                    <div className="flex justify-between text-[10px] opacity-80">
                                        <span>{t('cloud_cover') || 'Bewolking'}</span>
                                        <span>{weather.cloudCover}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-white/80 rounded-full" 
                                            style={{ width: `${weather.cloudCover}%` }} 
                                        />
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-100/50 dark:bg-black/50 backdrop-blur-sm flex justify-center animate-in fade-in duration-300">
            <div className="w-full max-w-5xl h-full bg-slate-100 dark:bg-background-dark flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300 relative">
             {/* Header */}
             <div className="flex items-center justify-between p-4 pt-6 bg-white/50 dark:bg-slate-900/90 backdrop-blur-md sticky top-0 z-20">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white pl-2">
                    {t('favorites') || 'Favorieten'}
                </h2>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-white/80 select-none">
                        <input
                            type="checkbox"
                            checked={compactMode}
                            onChange={(e) => {
                                const next = e.target.checked;
                                setCompactMode(next);
                                saveFavoritesCompactMode(next);
                            }}
                            className="size-4 accent-primary"
                        />
                        <span className="whitespace-nowrap">{t('favorites.compact') || 'Compact'}</span>
                    </label>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full bg-slate-200/50 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-800 dark:text-white transition-colors"
                    >
                        <Icon name="close" className="text-xl" />
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 pb-20 scrollbar-hide">
                {myLocation && renderCard(myLocation, true)}

                {/* Favorites */}
                {displayedFavorites.map(fav => renderCard(fav, false))}

                {/* Loading Indicator / Sentinel */}
                <div ref={observerTarget} className="h-10 flex items-center justify-center w-full mt-4">
                    {loading && (
                        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    )}
                </div>
            </div>
        </div>
        </div>
    );
};
