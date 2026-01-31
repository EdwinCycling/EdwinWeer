
import React, { useRef, useState, useEffect } from 'react';
import * as Astronomy from "astronomy-engine";
import { OpenMeteoResponse, AppSettings, Location } from '../../types';
import { ImmersiveSlide } from './ImmersiveSlide';
import { convertWind } from '../../services/weatherService';
import { Icon } from '../Icon';

interface Props {
    data: OpenMeteoResponse;
    settings: AppSettings;
    location: Location;
}

export const ImmersiveForecast: React.FC<Props> = ({ data, settings, location }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPC, setIsPC] = useState(window.innerWidth >= 768);

    useEffect(() => {
        const checkPC = () => {
            setIsPC(window.innerWidth >= 768);
        };
        window.addEventListener('resize', checkPC);
        return () => window.removeEventListener('resize', checkPC);
    }, []);
    // Memoize the filtered and enriched data to prevent recalculation on every render
    const enrichedHours = React.useMemo(() => {
        // Filter next 48 hours starting from current hour
        const currentHourIndex = getCurrentHourIndex(data);
        
        // Safety check
        if (currentHourIndex === -1) return [];

        const observer = new Astronomy.Observer(location.lat, location.lon, 0);

        // Pre-calculate moon events for the entire period to avoid rebuilding inside the loop
        const moonEvents: { type: 'rise' | 'set', time: number }[] = [];
        if (data.daily.moonrise) data.daily.moonrise.forEach(t => moonEvents.push({ type: 'rise', time: new Date(t).getTime() }));
        if (data.daily.moonset) data.daily.moonset.forEach(t => moonEvents.push({ type: 'set', time: new Date(t).getTime() }));
        moonEvents.sort((a, b) => a.time - b.time);

        const hoursData = data.hourly.time
            .slice(currentHourIndex, currentHourIndex + 48)
            .map((time, i) => {
                const index = currentHourIndex + i;
                
                // Calculate Sun/Moon position
                const date = new Date(time); 
                const nowTime = date.getTime();
                
                const sunEq = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, true);
                const sunHor = Astronomy.Horizon(date, observer, sunEq.ra, sunEq.dec, 'normal');
                
                const moonEq = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
                const moonHor = Astronomy.Horizon(date, observer, moonEq.ra, moonEq.dec, 'normal');
                const moonPhase = Astronomy.Illumination(Astronomy.Body.Moon, date).phase_fraction;

                // Get sunrise/sunset and moonrise/moonset for this day
                const dateStr = time.split('T')[0];
                const dayIndex = data.daily.time.findIndex(d => d === dateStr);
                let sunriseStr = null;
                let sunsetStr = null;
                let moonriseStr = null;
                let moonsetStr = null;
                
                let sunProgress = 0;
                let moonProgress = 0;

                if (dayIndex !== -1) {
                    const sr = new Date(data.daily.sunrise[dayIndex]);
                    const ss = new Date(data.daily.sunset[dayIndex]);
                    sunriseStr = sr.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' });
                    sunsetStr = ss.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' });
                    
                    // Calculate Sun Progress
                    const totalSunTime = ss.getTime() - sr.getTime();
                    const currentSunTime = date.getTime() - sr.getTime();
                    sunProgress = Math.max(0, Math.min(1, currentSunTime / totalSunTime));

                    // Find the active transit (Rise <= Now < NextRise) using the pre-calculated events
                    const lastRise = moonEvents.filter(e => e.type === 'rise' && e.time <= nowTime).pop();
                    
                    if (lastRise) {
                        const nextSet = moonEvents.find(e => e.type === 'set' && e.time > lastRise.time);
                        if (nextSet) {
                            const totalDuration = nextSet.time - lastRise.time;
                            moonProgress = (nowTime - lastRise.time) / totalDuration;
                            const mrDate = new Date(lastRise.time);
                            const msDate = new Date(nextSet.time);
                            moonriseStr = mrDate.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' });
                            moonsetStr = msDate.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' });
                        }
                    } else {
                        const nextRise = moonEvents.find(e => e.type === 'rise' && e.time > nowTime);
                        if (nextRise) {
                             const nextSet = moonEvents.find(e => e.type === 'set' && e.time > nextRise.time);
                             if (nextSet) {
                                 const totalDuration = nextSet.time - nextRise.time;
                                 moonProgress = (nowTime - nextRise.time) / totalDuration;
                                 const mrDate = new Date(nextRise.time);
                                 const msDate = new Date(nextSet.time);
                                 moonriseStr = mrDate.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' });
                                 moonsetStr = msDate.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' });
                             }
                        }
                    }
                }

                return {
                    time,
                    temp: data.hourly.temperature_2m[index],
                    code: data.hourly.weather_code[index],
                    precip: data.hourly.precipitation[index],
                    windSpeed: data.hourly.wind_speed_10m[index], 
                    windDir: data.hourly.wind_direction_10m[index],
                    feelsLike: data.hourly.apparent_temperature[index],
                    humidity: data.hourly.relative_humidity_2m[index],
                    pressure: data.hourly.pressure_msl ? data.hourly.pressure_msl[index] : (data.hourly.surface_pressure ? data.hourly.surface_pressure[index] : 0),
                    cloudCover: data.hourly.cloud_cover ? data.hourly.cloud_cover[index] : 0,
                    sunAltitude: sunHor.altitude,
                    moonAltitude: moonHor.altitude,
                    sunProgress, 
                    moonProgress, 
                    moonPhase: moonPhase,
                    sunrise: sunriseStr,
                    sunset: sunsetStr,
                    moonrise: moonriseStr,
                    moonset: moonsetStr
                };
            });

        return hoursData.map((h, idx) => {
            let tempTrend: 'up' | 'down' | undefined = undefined;
            let pressureTrend: 'up' | 'down' | 'stable' = 'stable';
            
            if (idx > 0) {
                const prev = hoursData[idx - 1];
                
                const prevRounded = Math.round(prev.temp);
                const currRounded = Math.round(h.temp);
                if (currRounded > prevRounded) tempTrend = 'up';
                else if (currRounded < prevRounded) tempTrend = 'down';
                
                // Pressure Trend - Only change if difference is at least 1 hPa
                if (h.pressure - prev.pressure >= 1) pressureTrend = 'up';
                else if (prev.pressure - h.pressure >= 1) pressureTrend = 'down';
            }

            return {
                ...h,
                isDay: isDayTime(h.time, data),
                windSpeed: typeof convertWind === 'function' ? convertWind(h.windSpeed, settings.windUnit) : h.windSpeed,
                tempTrend,
                pressureTrend
            };
        });
    }, [data, location.lat, location.lon, settings]);

    // Safety check
    if (!enrichedHours.length) {
        return <div className="text-text-main p-10">Data niet beschikbaar voor deze periode.</div>;
    }

    const [scrollInit, setScrollInit] = React.useState(false);

    useEffect(() => {
        if (!scrollInit && containerRef.current && enrichedHours.length > 2) {
            const slideWidth = containerRef.current.clientWidth;
            containerRef.current.scrollLeft = slideWidth * 2;
            setCurrentIndex(2);
            setScrollInit(true);
        }
    }, [scrollInit, enrichedHours]);

    const handleScroll = () => {
        if (containerRef.current) {
            const scrollLeft = containerRef.current.scrollLeft;
            const width = containerRef.current.clientWidth;
            const newIndex = Math.round(scrollLeft / width);
            if (newIndex !== currentIndex) {
                setCurrentIndex(newIndex);
            }
        }
    };

    const navigate = (direction: 'prev' | 'next') => {
        if (containerRef.current) {
            const width = containerRef.current.clientWidth;
            const newIndex = direction === 'next' 
                ? Math.min(currentIndex + 1, enrichedHours.length - 1)
                : Math.max(currentIndex - 1, 0);
            
            containerRef.current.scrollTo({
                left: newIndex * width,
                behavior: 'smooth'
            });
            setCurrentIndex(newIndex);
        }
    };

    const formatTime = (timeStr: string) => {
        return new Date(timeStr).toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: settings.timeFormat === '12h'
        });
    };

    return (
        <div className="flex-1 w-full bg-bg-page flex flex-col items-center overflow-hidden relative">
            {/* PC Navigation Buttons */}
            {isPC && (
                <div className="absolute inset-0 pointer-events-none z-50">
                    <div className="relative w-full max-w-5xl mx-auto h-full">
                        {currentIndex > 0 && (
                            <button 
                                onClick={() => navigate('prev')}
                                className="absolute left-4 top-[65%] -translate-y-1/2 pointer-events-auto p-4 bg-bg-card/20 hover:bg-bg-card/40 backdrop-blur-md rounded-full border border-border-color/20 transition-all flex flex-col items-center gap-1 group shadow-xl"
                            >
                                <Icon name="arrow_back_ios" className="text-text-main text-2xl group-hover:-translate-x-1 transition-transform" />
                                <span className="text-[10px] text-text-muted font-bold uppercase">{formatTime(enrichedHours[currentIndex - 1].time)}</span>
                            </button>
                        )}
                        {currentIndex < enrichedHours.length - 1 && (
                            <button 
                                onClick={() => navigate('next')}
                                className="absolute right-4 top-[65%] -translate-y-1/2 pointer-events-auto p-4 bg-bg-card/20 hover:bg-bg-card/40 backdrop-blur-md rounded-full border border-border-color/20 transition-all flex flex-col items-center gap-1 group shadow-xl"
                            >
                                <Icon name="arrow_forward_ios" className="text-text-main text-2xl group-hover:translate-x-1 transition-transform pl-1" />
                                <span className="text-[10px] text-text-muted font-bold uppercase">{formatTime(enrichedHours[currentIndex + 1].time)}</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Centered Content Window */}
            <div className="w-full max-w-5xl h-full relative overflow-hidden flex flex-col items-center bg-bg-card shadow-2xl">
                <div 
                    ref={containerRef}
                    onScroll={handleScroll}
                    className="w-full h-full overflow-x-auto overflow-y-hidden flex snap-x snap-mandatory scrollbar-hide items-center"
                    style={{ scrollBehavior: 'smooth' }}
                >
                    {enrichedHours.map((hour, idx) => {
                        // Alleen de huidige slide en de direct aangrenzende slides volledig renderen
                        // Dit bespaart enorm veel CPU/GPU omdat we niet 48 zware achtergronden tegelijk renderen
                        const isVisible = Math.abs(idx - currentIndex) <= 1;
                        const isNear = Math.abs(idx - currentIndex) <= 2;

                        return (
                            <ImmersiveSlide 
                                key={hour.time} 
                                data={hour as any} 
                                settings={settings} 
                                isVisible={isVisible}
                                isNear={isNear}
                            />
                        );
                    })}
                </div>

                {/* Indicator Dots - Inside the window */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20">
                    {enrichedHours.map((_, idx) => (
                        <div 
                            key={idx} 
                            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'bg-text-main w-4' : 'bg-text-muted/30'}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

function getCurrentHourIndex(data: OpenMeteoResponse): number {
    // Get current UTC time
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    
    // Adjust to location time
    const locationTimeMs = utcMs + (data.utc_offset_seconds * 1000);
    const locationDate = new Date(locationTimeMs);
    
    // Format to ISO string YYYY-MM-DDTHH:00 matching OpenMeteo format
    const year = locationDate.getFullYear();
    const month = String(locationDate.getMonth() + 1).padStart(2, '0');
    const day = String(locationDate.getDate()).padStart(2, '0');
    const hour = String(locationDate.getHours()).padStart(2, '0');
    const targetTime = `${year}-${month}-${day}T${hour}:00`;
    
    const index = data.hourly.time.findIndex(t => t === targetTime);
    
    // If exact match fail, try finding closest or just start
    if (index === -1) {
        // Fallback: find first time that is >= targetTime
        return Math.max(0, data.hourly.time.findIndex(t => t >= targetTime));
    }
    return index;
}

function isDayTime(timeStr: string, data: OpenMeteoResponse): boolean {
    const dateStr = timeStr.split('T')[0];
    const dayIndex = data.daily.time.findIndex(d => d === dateStr);
    if (dayIndex === -1) return true;

    const sunrise = data.daily.sunrise[dayIndex];
    const sunset = data.daily.sunset[dayIndex];
    
    return timeStr >= sunrise && timeStr < sunset;
}
