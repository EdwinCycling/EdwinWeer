import React, { useMemo, useState } from 'react';

interface Props {
  weatherCode: number;
  isDay: number;
  className?: string;
}

export const StaticWeatherBackground: React.FC<Props> = ({ weatherCode, isDay, className }) => {
  const [loaded, setLoaded] = useState(false);

  // Helper to map weather code to image category
  const getImageUrl = useMemo(() => {
    const isRainy = [51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode);
    const isSnowy = [71, 73, 75, 77, 85, 86].includes(weatherCode);
    const isCloudy = [1, 2, 3, 45, 48].includes(weatherCode);
    const isStormy = [95, 96, 99].includes(weatherCode);
    const isClear = weatherCode === 0;

    // Unsplash Image IDs (High quality, natural looking)
    // Using w=1920&q=80 for optimization
    const baseUrl = "https://images.unsplash.com";
    const params = "?auto=format&fit=crop&w=1920&q=80";

    if (isStormy) {
        return `${baseUrl}/photo-1605727216801-e27ce1d0cc28${params}`; // Lightning/Storm
    }
    
    if (isSnowy) {
        return isDay 
            ? `${baseUrl}/photo-1478265409131-1f65c88f965c${params}` // Day Snow
            : `${baseUrl}/photo-1483664852095-d6cc6870705d${params}`; // Night Snow
    }

    if (isRainy) {
        return isDay 
            ? `${baseUrl}/photo-1515694346937-94d85e41e6f0${params}` // Rain window/moody
            : `${baseUrl}/photo-1503435824048-a799a3a84bf7${params}`; // Night Rain
    }

    if (isCloudy) {
        // Fog/Mist (codes 45, 48)
        if ([45, 48].includes(weatherCode)) {
             return `${baseUrl}/photo-1485230905325-74bc54c4e2e7${params}`; // Fog
        }
        return isDay 
            ? `${baseUrl}/photo-1534088568595-a066f410bcda${params}` // Cloudy Day
            : `${baseUrl}/photo-1536514498073-50e69d39c6cf${params}`; // Cloudy Night
    }

    if (isClear) {
        return isDay 
            ? `${baseUrl}/photo-1601297183305-6df142704ea2${params}` // Clear Blue Sky
            : `${baseUrl}/photo-1532978023344-97e2733d18e5${params}`; // Clear Night Stars
    }

    // Default fallback
    return isDay 
        ? `${baseUrl}/photo-1601297183305-6df142704ea2${params}`
        : `${baseUrl}/photo-1532978023344-97e2733d18e5${params}`;

  }, [weatherCode, isDay]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
        {/* Placeholder / Loading State */}
        <div className={`absolute inset-0 bg-slate-900 transition-opacity duration-700 ${loaded ? 'opacity-0' : 'opacity-100'}`} />
        
        <img 
            src={getImageUrl} 
            alt="Weather Background"
            className={`w-full h-full object-cover transition-opacity duration-1000 ${loaded ? 'opacity-100' : 'opacity-0'} ${!isDay ? 'brightness-[0.4] saturate-[0.8]' : ''}`}
            onLoad={() => setLoaded(true)}
        />
        
        {/* Overlay to ensure text readability - darker at night */}
        <div className={`absolute inset-0 ${!isDay ? 'bg-black/60' : 'bg-black/20'}`} />
    </div>
  );
};
