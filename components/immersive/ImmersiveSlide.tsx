
import React from 'react';
import { AppSettings } from '../../types';
import { ImmersiveBackground } from './ImmersiveBackground';
import { Icon } from '../Icon';
import { getTranslation } from '../../services/translations';

interface HourData {
    time: string;
    temp: number;
    code: number;
    isDay: boolean;
    precip: number;
    windSpeed: number;
    windDir: number;
    feelsLike: number;
    humidity: number;
    pressure: number;
    tempTrend?: 'up' | 'down' | 'stable';
    pressureTrend?: 'up' | 'down' | 'stable';
    cloudCover: number;
    sunAltitude: number;
    moonAltitude: number;
    sunProgress: number;
    moonProgress: number;
    moonPhase: number;
    sunrise: string | null;
    sunset: string | null;
    moonrise?: string | null;
    moonset?: string | null;
}

interface Props {
    data: HourData;
    settings: AppSettings;
    isVisible?: boolean;
    isNear?: boolean;
}

export const ImmersiveSlide = React.memo(({ data, settings, isVisible = true, isNear = true }: Props) => {
    const date = new Date(data.time);
    const timeStr = date.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' });
    const dateStr = date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    // Helper for wind direction arrow
    const getWindArrow = (deg: number) => {
        return { transform: `rotate(${deg}deg)` };
    };

    const getWeatherDescription = (code: number) => {
        let desc = "";
        // Basic mapping
        if (code === 0) desc = getTranslation('immersive.weather.clear', settings.language);
        else if (code <= 3) {
            const base = getTranslation('immersive.weather.cloudy', settings.language);
            desc = `${base} (${Math.round(data.cloudCover)}%)`;
        }
        else if (code <= 48) desc = getTranslation('immersive.weather.fog', settings.language);
        else if (code <= 67) desc = getTranslation('immersive.weather.rain', settings.language);
        else if (code <= 77) desc = getTranslation('immersive.weather.snow', settings.language);
        else if (code <= 82) desc = getTranslation('immersive.weather.showers', settings.language);
        else if (code <= 86) desc = getTranslation('immersive.weather.snow_showers', settings.language);
        else if (code <= 99) desc = getTranslation('immersive.weather.thunderstorm', settings.language);
        
        return desc;
    };

    // Sun/Moon Position Calculation for Visual
    // Map altitude -10 to 60 degrees to 0-100% of the visual container
    const minAlt = -10;
    const maxAlt = 70; // Increased to 70 for summer peak
    const sunY = Math.max(0, Math.min(100, ((data.sunAltitude - minAlt) / (maxAlt - minAlt)) * 100));
    const moonY = Math.max(0, Math.min(100, ((data.moonAltitude - minAlt) / (maxAlt - minAlt)) * 100));
    
    // X Position based on progress (0-1)
    const sunX = data.sunProgress * 100;
    const moonX = data.moonProgress * 100;

    const showFeelsLike = data.feelsLike > 25 || data.feelsLike < 10;

    const getTrendArrow = (trend: 'up' | 'down' | 'stable' | undefined, size: string = "text-3xl", ml: string = "ml-2") => {
        if (!trend) return null;
        if (trend === 'up') return <Icon name="north" className={`text-red-500 ${size} ${ml}`} />;
        if (trend === 'down') return <Icon name="south_east" className={`text-blue-400 ${size} ${ml}`} />;
        return <Icon name="east" className={`text-green-500 ${size} ${ml}`} />;
    };

    return (
        <article className="relative w-full h-full min-w-full md:min-w-full snap-center flex-shrink-0 overflow-hidden border-r border-border-color/10">
            {/* Visual Engine - Alleen renderen als we in de buurt zijn */}
            {isNear ? (
                <ImmersiveBackground 
                    weatherCode={data.code} 
                    isDay={data.isDay} 
                    precipAmount={data.precip} 
                    cloudCover={data.cloudCover}
                    isVisible={isVisible}
                />
            ) : (
                <div className="absolute inset-0 bg-bg-card" />
            )}

            {/* Content Layout (Screenshot Look) */}
            <div className="absolute inset-0 z-10 p-6 pt-36 pb-24 flex flex-col justify-between text-text-main select-none">
                
                {/* Top Section */}
                <div className="flex flex-col items-start gap-4">
                    {/* Temp */}
                    <div className="flex flex-col">
                        <div className="flex items-center">
                            <span className="text-[5rem] font-thin leading-none tracking-tighter drop-shadow-lg font-display">
                                {Math.round(data.temp)}°
                            </span>
                            {getTrendArrow(data.tempTrend)}
                        </div>
                        {showFeelsLike && (
                            <span className="text-lg opacity-80 font-medium drop-shadow-md pl-1">
                                {Math.round(data.feelsLike) > 25 
                                    ? getTranslation('immersive.heat_index', settings.language)
                                    : getTranslation('immersive.feels_like', settings.language)} {Math.round(data.feelsLike)}°
                            </span>
                        )}

                    </div>

                    {/* Sun/Moon Visual - Moved BELOW Temp */}
                    <div className="relative w-48 h-24 bg-bg-subtle/10 backdrop-blur-sm rounded-t-full border-t border-l border-r border-border-color/20 shadow-lg overflow-hidden mt-2">
                        <div className="absolute bottom-0 w-full h-px bg-text-main/40" />
                        <div className="absolute bottom-1 left-3 text-[10px] text-text-muted font-medium">{getTranslation('immersive.rise', settings.language)}</div>
                        <div className="absolute bottom-1 right-3 text-[10px] text-text-muted font-medium">{getTranslation('immersive.set', settings.language)}</div>
                        {data.sunAltitude > -10 && (
                            <div 
                                className="absolute w-6 h-6 bg-yellow-400 rounded-full shadow-[0_0_20px_rgba(255,215,0,0.8)] transition-all duration-1000 flex items-center justify-center text-[8px] text-yellow-900 font-bold z-10"
                                style={{ bottom: `${sunY}%`, left: `${sunX}%`, transform: 'translate(-50%, 50%)' }}
                            >
                            </div>
                        )}
                        {data.moonAltitude > -10 && (
                            <div 
                                className="absolute w-5 h-5 bg-gray-200 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all duration-1000 flex items-center justify-center text-[8px] text-gray-900 font-bold z-10"
                                style={{ bottom: `${moonY}%`, left: `${moonX}%`, transform: 'translate(-50%, 50%)' }}
                            >
                            </div>
                        )}
                    </div>

                    {/* Wind & Details */}
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-4">
                            <div className="relative w-16 h-16 flex items-center justify-center bg-bg-subtle/10 backdrop-blur-sm rounded-full border border-border-color/20 shadow-lg">
                                <div className="absolute inset-0 border-2 border-border-color/30 rounded-full m-1" />
                                <div className="absolute top-1 text-[8px] font-bold text-text-main shadow-bg-page drop-shadow-sm">N</div>
                                <div className="absolute bottom-1 text-[8px] font-bold text-text-main shadow-bg-page drop-shadow-sm">S</div>
                                <div className="absolute left-1.5 text-[8px] font-bold text-text-main shadow-bg-page drop-shadow-sm">W</div>
                                <div className="absolute right-1.5 text-[8px] font-bold text-text-main shadow-bg-page drop-shadow-sm">E</div>
                                <Icon name="north" className="text-2xl text-text-main drop-shadow-md" style={getWindArrow(data.windDir)} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-2xl font-bold leading-none">{Math.round(data.windSpeed)}</span>
                                <span className="text-xs opacity-80">{settings.windUnit}</span>
                            </div>
                        </div>

                        {/* Pressure & Humidity */}
                        <div className="flex flex-col gap-2 pl-4 border-l border-border-color/20">
                            {/* Pressure */}
                            <div className="flex items-center gap-2">
                                <Icon name="compress" className="text-text-muted text-sm" />
                                <span className="text-sm font-medium">{Math.round(data.pressure)} hPa</span>
                                {getTrendArrow(data.pressureTrend, "text-sm", "ml-0")}
                            </div>
                            {/* Humidity */}
                            <div className="flex items-center gap-2">
                                <Icon name="water_drop" className="text-blue-300 text-sm" />
                                <span className="text-sm font-medium">{Math.round(data.humidity)}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Middle Left: Description */}
                <div className="mt-auto mb-auto flex flex-col items-start gap-4">
                    <div className="flex flex-col">
                        <span className="text-3xl font-medium tracking-wide drop-shadow-lg bg-bg-subtle/10 px-4 py-2 rounded-2xl backdrop-blur-sm border border-border-color/10">
                            {getWeatherDescription(data.code)}
                        </span>
                        {!data.isDay && (
                            <div className="mt-2 text-sm opacity-80 pl-2">
                            {/* Moon Phase Text could go here if we had a mapper, for now just show visual */}
                            </div>
                        )}
                    </div>

                    {/* Precip Details - Moved Here */}
                    {data.precip > 0 && (
                        <div className="flex items-center gap-2 bg-blue-500/30 backdrop-blur-md px-3 py-2 rounded-xl border border-border-color/20 shadow-lg">
                            <span className="text-xl">💧</span>
                            <div className="flex flex-col items-start">
                                <span className="font-bold">{data.precip} mm</span>
                                <span className="text-xs opacity-80">{getTranslation('immersive.precip', settings.language)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-end mt-8 border-t border-border-color/20 pt-4 bg-gradient-to-t from-bg-page/40 to-transparent -mx-6 -mb-10 px-6 pb-10">
                    <div className="flex flex-col min-w-[150px]">
                        <span className="text-4xl font-bold drop-shadow-md">{timeStr}</span>
                        <span className="text-sm opacity-90 uppercase tracking-widest mb-2">{dateStr}</span>
                        
                        {/* Sun/Moon Times Grid */}
                        <div className="flex gap-4">
                            {/* Sun */}
                            {(data.sunrise || data.sunset) && (
                                <div className="flex flex-col gap-0.5">
                                    {data.sunrise && (
                                        <span className="text-xs opacity-70 flex items-center gap-1">
                                            <Icon name="wb_twilight" className="text-sm text-yellow-300"/> <span className="text-[10px]">{getTranslation('immersive.rise', settings.language)}</span> {data.sunrise}
                                        </span>
                                    )}
                                    {data.sunset && (
                                        <span className="text-xs opacity-70 flex items-center gap-1">
                                            <Icon name="wb_twilight" className="text-sm text-orange-400"/> <span className="text-[10px]">{getTranslation('immersive.set', settings.language)}</span> {data.sunset}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Moon */}
                            {(data.moonrise || data.moonset) && (
                                <div className="flex flex-col gap-0.5 border-l border-border-color/10 pl-4">
                                    {data.moonrise && (
                                        <span className="text-xs opacity-70 flex items-center gap-1">
                                            <Icon name="dark_mode" className="text-sm text-gray-300"/> <span className="text-[10px]">{getTranslation('immersive.rise', settings.language)}</span> {data.moonrise}
                                        </span>
                                    )}
                                    {data.moonset && (
                                        <span className="text-xs opacity-70 flex items-center gap-1">
                                            <Icon name="dark_mode" className="text-sm text-gray-400"/> <span className="text-[10px]">{getTranslation('immersive.set', settings.language)}</span> {data.moonset}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Precip Details - REMOVED */}
                </div>
            </div>
        </article>
    );
});
