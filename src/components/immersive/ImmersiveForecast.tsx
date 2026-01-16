
import React, { useRef } from 'react';
import { OpenMeteoResponse, AppSettings } from '../../types';
import { ImmersiveSlide } from './ImmersiveSlide';
import { Icon } from '../Icon';
import { convertWind } from '../../services/weatherService';

interface Props {
    weatherData: OpenMeteoResponse;
    settings: AppSettings;
}

export const ImmersiveForecast: React.FC<Props> = ({ weatherData, settings }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter next 48 hours starting from current hour
    const currentHourIndex = getCurrentHourIndex(weatherData);
    
    // Safety check
    if (currentHourIndex === -1) {
        return <div className="text-white p-10">Data niet beschikbaar voor deze periode.</div>;
    }

    const hoursData = weatherData.hourly.time
        .slice(currentHourIndex, currentHourIndex + 48)
        .map((time, i) => {
            const index = currentHourIndex + i;
            return {
                time,
                temp: weatherData.hourly.temperature_2m[index],
                code: weatherData.hourly.weather_code[index],
                precip: weatherData.hourly.precipitation[index],
                windSpeed: weatherData.hourly.wind_speed_10m[index], // Raw value, convert later
                windDir: weatherData.hourly.wind_direction_10m[index],
                feelsLike: weatherData.hourly.apparent_temperature[index],
                humidity: weatherData.hourly.relative_humidity_2m[index],
            };
        });

    const enrichedHours = hoursData.map(h => ({
        ...h,
        isDay: isDayTime(h.time, weatherData),
        windSpeed: typeof convertWind === 'function' ? convertWind(h.windSpeed, settings.windUnit) : h.windSpeed // Handle if convertWind returns number or string? It usually returns number or string depending on impl.
    }));

    return (
        <div 
            ref={containerRef}
            className="flex-1 w-full overflow-x-auto overflow-y-hidden flex snap-x snap-mandatory scrollbar-hide items-center bg-gray-900"
            style={{ scrollBehavior: 'smooth' }}
        >
            {enrichedHours.map((hour) => (
                <ImmersiveSlide key={hour.time} data={hour as any} settings={settings} />
            ))}
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
