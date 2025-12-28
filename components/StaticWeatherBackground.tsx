import React, { useMemo, useState } from 'react';

interface Props {
  weatherCode: number;
  isDay: number;
  cloudCover?: number;
  className?: string;
}

export const StaticWeatherBackground: React.FC<Props> = ({ weatherCode, isDay, cloudCover, className }) => {
  const [loaded, setLoaded] = useState(false);

  // Helper to map weather code to image category
  const getImageUrl = useMemo(() => {
    // 1. Thunder
    if ([95, 96, 99].includes(weatherCode)) {
      return '/weerfoto/thunder.jpg';
    }

    // 2. Fog
    if ([45, 48].includes(weatherCode)) {
      return '/weerfoto/fog.jpg';
    }

    // 3. Rain
    const lightRain = [51, 61, 80];
    const moderateRain = [53, 63, 81];
    const heavyRain = [55, 65, 82, 66, 67];

    if (lightRain.includes(weatherCode)) return '/weerfoto/rain.jpg';
    if (moderateRain.includes(weatherCode)) return '/weerfoto/rain middle.jpg';
    if (heavyRain.includes(weatherCode)) return '/weerfoto/rain heavy.jpg';

    // 4. Clouds (Default fallback if no rain/thunder/fog)
    // If cloudCover is provided, use it. Otherwise, guess from weatherCode.
    let cover = cloudCover;

    if (cover === undefined) {
      // Approximate from weatherCode if cloudCover is missing
      if (weatherCode === 0) cover = 0; // Clear
      else if (weatherCode === 1) cover = 15; // Mainly clear
      else if (weatherCode === 2) cover = 50; // Partly cloudy
      else if (weatherCode === 3) cover = 100; // Overcast
      else cover = 50; // Default fallback
    }

    if (cover <= 9) return '/weerfoto/bewolking 0.jpg';
    if (cover <= 19) return '/weerfoto/bewolking 10.jpg';
    if (cover <= 29) return '/weerfoto/bewolking 20.jpg';
    if (cover <= 39) return '/weerfoto/bewolking 40.jpg';
    if (cover <= 70) return '/weerfoto/bewolking 70.jpg';
    return '/weerfoto/bewolking 90.jpg';

  }, [weatherCode, isDay, cloudCover]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
        {/* Placeholder / Loading State */}
        <div className={`absolute inset-0 bg-slate-900 transition-opacity duration-700 ${loaded ? 'opacity-0' : 'opacity-100'}`} />
        
        <img 
            src={getImageUrl} 
            alt="Weather Background"
            className={`w-full h-full object-cover transition-opacity duration-1000 ${loaded ? 'opacity-100' : 'opacity-0'} ${!isDay ? 'brightness-[0.7]' : ''}`}
            onLoad={() => setLoaded(true)}
            onError={(e) => {
                console.error("Failed to load image:", getImageUrl);
            }}
        />
        
        {/* Overlay to ensure text readability */}
        <div className={`absolute inset-0 ${!isDay ? 'bg-black/40' : 'bg-black/10'}`} />
    </div>
  );
};
