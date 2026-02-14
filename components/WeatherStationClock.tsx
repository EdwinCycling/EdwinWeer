import React from 'react';
import { Icon } from './Icon';
import { mapWmoCodeToIcon } from '../services/weatherService';
import { TempUnit, AppSettings } from '../types';
import { getTranslation } from '../services/translations';
import { convertWind, getWindUnitLabel } from '../services/weatherService';

interface Props {
    weatherData: {
        name: string;
        temp: number;
        weatherCode: number;
        isNight: boolean;
        humidity?: number;
        minTemp?: number;
        maxTemp?: number;
        feelsLike?: number;
        windSpeed?: number;
        windDir?: string;
        windUnit?: string;
        windAngle?: number;
        pressure?: number;
        daily?: {
            date: string;
            code: number;
            min: number;
            max: number;
        }[];
    } | null;
    currentTime: Date;
    settings: AppSettings;
}

export const WeatherStationClock: React.FC<Props> = ({ weatherData, currentTime, settings }) => {
    const timeStr = currentTime.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    
    const seconds = currentTime.getSeconds().toString().padStart(2, '0');
    const dayName = currentTime.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short' }).toUpperCase();
    const dateStr = `${currentTime.getDate()}/${currentTime.getMonth() + 1}`;

    const temp = weatherData ? Math.round(weatherData.temp) : '--';
    const humidity = weatherData?.humidity || 45;
    const icon = weatherData ? mapWmoCodeToIcon(weatherData.weatherCode, !weatherData.isNight) : 'wb_sunny';
    const feelsLike = weatherData?.feelsLike ? Math.round(weatherData.feelsLike) : temp;
    
    // Wind calculation based on settings
    const rawWindSpeed = weatherData?.windSpeed || 0;
    const windSpeed = Math.round(convertWind(rawWindSpeed, settings.windUnit));
    const windUnit = getWindUnitLabel(settings.windUnit);
    
    const windDir = weatherData?.windDir || 'N';
    const windAngle = weatherData?.windAngle || 0;
    const pressure = weatherData?.pressure || '--';

    const t = (key: string) => getTranslation(key, settings.language);

    return (
        <div className="relative bg-[#1a1a1a] rounded-[40px] p-2 shadow-2xl border-[12px] border-[#2a2a2a] min-w-[360px] md:min-w-[600px] aspect-[4/3] hidden md:flex flex-col overflow-hidden font-mono select-none">
            {/* Inner Screen Container */}
            <div className="flex-1 bg-black rounded-[28px] p-4 flex flex-col gap-2 relative overflow-hidden">
                
                {/* Scanlines Effect */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.05] z-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)]" style={{ backgroundSize: '100% 4px' }} />

                {/* Metal Plate Header: Location & Branding */}
                <div className="flex justify-between items-start mb-2 px-2">
                    {/* Location Plate */}
                    <div className="bg-gradient-to-b from-gray-700 to-gray-900 px-4 py-1 rounded-lg border border-gray-600 shadow-md flex items-center gap-2 relative overflow-hidden">
                         <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />
                         <Icon name="location_on" className="text-gray-400 text-[10px]" />
                         <span className="text-gray-300 font-bold uppercase tracking-widest text-[10px] shadow-black drop-shadow-sm truncate max-w-[120px]">
                             {weatherData?.name || 'LOCATION'}
                         </span>
                         <div className="absolute left-1 top-1 w-0.5 h-0.5 rounded-full bg-gray-500 shadow-inner" />
                         <div className="absolute right-1 top-1 w-0.5 h-0.5 rounded-full bg-gray-500 shadow-inner" />
                         <div className="absolute left-1 bottom-1 w-0.5 h-0.5 rounded-full bg-gray-500 shadow-inner" />
                         <div className="absolute right-1 bottom-1 w-0.5 h-0.5 rounded-full bg-gray-500 shadow-inner" />
                    </div>

                    {/* Branding Plate */}
                    <div className="bg-gradient-to-b from-gray-700 to-gray-900 px-4 py-1 rounded-lg border border-gray-600 shadow-md flex items-center gap-2 relative overflow-hidden">
                         <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />
                         <span className="text-gray-300 font-black uppercase tracking-[0.3em] text-[10px] shadow-black drop-shadow-sm">
                             {t('ambient.bresser')}
                         </span>
                         <div className="absolute left-1 top-1 w-0.5 h-0.5 rounded-full bg-gray-500 shadow-inner" />
                         <div className="absolute right-1 top-1 w-0.5 h-0.5 rounded-full bg-gray-500 shadow-inner" />
                         <div className="absolute left-1 bottom-1 w-0.5 h-0.5 rounded-full bg-gray-500 shadow-inner" />
                         <div className="absolute right-1 bottom-1 w-0.5 h-0.5 rounded-full bg-gray-500 shadow-inner" />
                    </div>
                </div>

                {/* Top Section: Forecast & Time */}
                <div className="flex gap-4 h-1/2">
                    {/* Left: 3-Day Forecast */}
                    <div className="w-1/2 bg-slate-900/50 rounded-2xl p-2 flex flex-col border border-white/5 relative overflow-hidden">
                        <div className="absolute top-1 left-2 text-[8px] text-white/40 font-bold uppercase">{t('ambient.forecast')}</div>
                        
                        <div className="flex-1 flex items-center justify-around mt-2">
                            {weatherData?.daily?.slice(0, 3).map((day, i) => {
                                const d = new Date(day.date);
                                const dayShort = d.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short' }).toUpperCase().slice(0, 2);
                                
                                return (
                                    <div key={i} className="flex flex-col items-center gap-1">
                                        <span className="text-[10px] text-white/60 font-bold">{dayShort}</span>
                                        <Icon name={mapWmoCodeToIcon(day.code)} className="text-2xl text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.4)]" />
                                        <div className="flex flex-col items-center leading-none">
                                            <span className="text-xs font-bold text-white">{Math.round(day.max)}°</span>
                                            <span className="text-[9px] text-white/40">{Math.round(day.min)}°</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {!weatherData?.daily && (
                                <div className="text-white/40 text-xs">{t('loading')}</div>
                            )}
                        </div>
                    </div>

                    {/* Right: Time & Date */}
                    <div className="flex-1 bg-slate-900/50 rounded-2xl p-3 flex flex-col justify-between border border-white/5">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                                <span className="text-[8px] text-white/40 font-bold uppercase leading-none">{t('ambient.day')}</span>
                                <span className="text-lg text-white font-bold">{dayName}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[8px] text-white/40 font-bold uppercase leading-none">{t('ambient.date')}</span>
                                <span className="text-lg text-white font-bold">{dateStr}</span>
                            </div>
                        </div>
                        
                        <div className="flex items-baseline justify-center gap-1">
                            <span className="text-6xl font-bold text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.3)]">{timeStr}</span>
                            <span className="text-xl font-bold text-amber-500/60">{seconds}</span>
                        </div>
                    </div>
                </div>

                {/* Bottom Section: Feels Like, Wind Rose & Outdoor */}
                <div className="flex-1 flex gap-2">
                    {/* FEELS LIKE */}
                    <div className="w-[30%] bg-slate-900/50 rounded-2xl p-3 border-l-4 border-cyan-500/50 flex flex-col justify-between border border-white/5">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] text-cyan-400 font-bold uppercase">{t('ambient.feels_like')}</span>
                            <Icon name="thermostat" className="text-xs text-cyan-400" />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-4xl font-bold text-white">{feelsLike}<span className="text-sm">°C</span></span>
                                <span className="text-[8px] text-white/40 font-bold uppercase">{t('ambient.apparent_temp')}</span>
                            </div>
                        </div>
                    </div>

                    {/* WIND ROSE */}
                    <div className="flex-1 bg-slate-900/50 rounded-2xl p-3 border-l-4 border-amber-500/50 flex flex-col items-center justify-between border border-white/5 relative overflow-hidden">
                        <div className="absolute top-1 left-2 text-[8px] text-amber-400 font-bold uppercase">{t('ambient.wind')}</div>
                        
                        <div className="relative w-20 h-20 mt-1">
                            {/* Compass Circle */}
                            <div className="absolute inset-0 rounded-full border border-white/10 flex items-center justify-center">
                                <div className="absolute top-0 text-[8px] text-white/40 font-bold">N</div>
                                <div className="absolute right-0 text-[8px] text-white/40 font-bold">E</div>
                                <div className="absolute bottom-0 text-[8px] text-white/40 font-bold">S</div>
                                <div className="absolute left-0 text-[8px] text-white/40 font-bold">W</div>
                                
                                {/* Inner decoration */}
                                <div className="w-12 h-12 rounded-full border border-white/5 flex items-center justify-center">
                                    <div className="w-1 h-1 rounded-full bg-amber-500/40" />
                                </div>
                            </div>
                            
                            {/* Needle */}
                            <div 
                                className="absolute inset-0 transition-transform duration-1000 ease-in-out"
                                style={{ transform: `rotate(${windAngle}deg)` }}
                            >
                                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-10 bg-gradient-to-b from-amber-500 to-transparent rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-0.5 h-10 bg-white/40 rounded-full" />
                            </div>
                        </div>
                        
                        <div className="flex flex-col items-center leading-none mb-1">
                            <span className="text-lg font-bold text-white">{windSpeed}<span className="text-[10px] ml-0.5 text-white/60">{windUnit}</span></span>
                            <span className="text-[10px] text-amber-400 font-bold">{windDir}</span>
                        </div>
                    </div>

                    {/* OUTDOOR */}
                    <div className="w-[35%] bg-slate-900/50 rounded-2xl p-3 border-l-4 border-lime-500/50 flex flex-col justify-between border border-white/5">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] text-lime-400 font-bold uppercase">{t('ambient.outdoor')}</span>
                            <Icon name="cloud" className="text-xs text-lime-400" />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-4xl font-bold text-white">{temp}<span className="text-sm">.0°C</span></span>
                                <span className="text-[8px] text-white/40 font-bold uppercase">{t('ambient.temperature')}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-2xl font-bold text-lime-400">{humidity}<span className="text-xs">%</span></span>
                                <span className="text-[8px] text-white/40 font-bold uppercase">{t('ambient.humidity')}</span>
                            </div>
                        </div>
                        <div className="mt-1 pt-1 border-t border-white/5 flex justify-between items-center">
                            <span className="text-[8px] text-white/40 font-bold uppercase">{t('ambient.pressure')}</span>
                            <span className="text-xs font-bold text-lime-400/80">{pressure} hPa</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Reflection Effect Overlay */}
            <div className="absolute inset-0 rounded-[40px] pointer-events-none bg-gradient-to-tr from-white/5 via-transparent to-white/10" />
        </div>
    );
};
