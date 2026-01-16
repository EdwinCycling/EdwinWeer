
import React from 'react';
import { AppSettings } from '../../types';
import { ImmersiveBackground } from './ImmersiveBackground';
import { Icon } from '../Icon';

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
}

interface Props {
    data: HourData;
    settings: AppSettings;
}

export const ImmersiveSlide: React.FC<Props> = ({ data, settings }) => {
    const date = new Date(data.time);
    const timeStr = date.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' });
    const dateStr = date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    // Helper for wind direction arrow
    const getWindArrow = (deg: number) => {
        return { transform: `rotate(${deg}deg)` };
    };

    const getWeatherDescription = (code: number) => {
        // Basic mapping
        if (code === 0) return settings.language === 'nl' ? "Helder" : "Clear";
        if (code <= 3) return settings.language === 'nl' ? "Bewolkt" : "Cloudy";
        if (code <= 48) return settings.language === 'nl' ? "Mist" : "Fog";
        if (code <= 67) return settings.language === 'nl' ? "Regen" : "Rain";
        if (code <= 77) return settings.language === 'nl' ? "Sneeuw" : "Snow";
        if (code <= 82) return settings.language === 'nl' ? "Buien" : "Showers";
        if (code <= 86) return settings.language === 'nl' ? "Sneeuwbuien" : "Snow Showers";
        if (code <= 99) return settings.language === 'nl' ? "Onweer" : "Thunderstorm";
        return "";
    };

    return (
        <article className="relative w-full h-full min-w-[100vw] md:min-w-[400px] snap-center md:snap-start flex-shrink-0 overflow-hidden border-r border-white/10">
            {/* Visual Engine */}
            <ImmersiveBackground weatherCode={data.code} isDay={data.isDay} precipAmount={data.precip} />

            {/* Content Layout (Screenshot Look) */}
            <div className="absolute inset-0 z-10 p-6 flex flex-col justify-between text-white select-none">
                
                {/* Top Section */}
                <div className="flex justify-between items-start">
                    {/* Left Top: Temp */}
                    <div className="flex flex-col">
                        <span className="text-[5rem] font-thin leading-none tracking-tighter drop-shadow-lg font-display">
                            {Math.round(data.temp)}°
                        </span>
                        <span className="text-lg opacity-80 font-medium drop-shadow-md">
                            {settings.language === 'nl' ? 'Voelt als' : 'Feels like'} {Math.round(data.feelsLike)}°
                        </span>
                    </div>

                    {/* Right Top: Wind */}
                    <div className="flex flex-col items-center bg-black/10 backdrop-blur-sm p-3 rounded-full border border-white/20 shadow-lg">
                        <div className="relative w-12 h-12 flex items-center justify-center mb-1">
                             <div className="absolute inset-0 border-2 border-white/30 rounded-full" />
                             <div className="absolute top-0 text-[8px] font-bold text-white/70">N</div>
                             <Icon name="north" className="text-2xl text-white drop-shadow-md" style={getWindArrow(data.windDir)} />
                        </div>
                        <span className="text-sm font-bold">{Math.round(data.windSpeed)} <span className="text-[10px] font-normal opacity-80">{settings.windUnit}</span></span>
                    </div>
                </div>

                {/* Middle Left: Description */}
                <div className="mt-auto mb-auto">
                    <span className="text-3xl font-medium tracking-wide drop-shadow-lg bg-black/10 px-4 py-2 rounded-2xl backdrop-blur-sm border border-white/10">
                        {getWeatherDescription(data.code)}
                    </span>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-end mt-8 border-t border-white/20 pt-4 bg-gradient-to-t from-black/40 to-transparent -mx-6 -mb-6 px-6 pb-6">
                    <div className="flex flex-col">
                        <span className="text-4xl font-bold drop-shadow-md">{timeStr}</span>
                        <span className="text-sm opacity-90 uppercase tracking-widest">{dateStr}</span>
                    </div>
                    
                    {/* Precip Details */}
                    {data.precip > 0 && (
                        <div className="flex items-center gap-2 bg-blue-500/30 backdrop-blur-md px-3 py-2 rounded-xl border border-white/20 shadow-lg">
                            <span className="text-xl">💧</span>
                            <div className="flex flex-col items-end">
                                <span className="font-bold">{data.precip} mm</span>
                                <span className="text-xs opacity-80">{settings.language === 'nl' ? 'Neerslag' : 'Precip'}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </article>
    );
};
