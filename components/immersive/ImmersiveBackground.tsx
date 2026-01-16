
import React from 'react';
import './immersive.css';
import { ImmersiveWeatherEffect } from './ImmersiveWeatherEffect';

interface Props {
    weatherCode: number;
    isDay: boolean;
    precipAmount?: number; // mm
    cloudCover?: number; // 0-100
}

export const ImmersiveBackground = React.memo(({ weatherCode, isDay, precipAmount = 0, cloudCover }: Props) => {
    
    // 1. Determine Background Gradient (Sky)
    const getSkyGradient = () => {
        if (!isDay) {
             // Night
             if (weatherCode >= 95) return 'linear-gradient(to bottom, #000000, #434343)'; // Storm night
             if (weatherCode >= 51) return 'linear-gradient(to bottom, #0F2027, #2C5364)'; // Rain night
             return 'linear-gradient(to bottom, #0F2027, #203A43, #2C5364)'; // Clear/Cloudy night
        }

        // Day
        // Use cloudCover to influence gradient if available
        if (cloudCover !== undefined) {
             if (cloudCover < 10) return 'linear-gradient(to bottom, #2980B9, #6DD5FA)'; // Clear Blue
             if (cloudCover < 50) return 'linear-gradient(to bottom, #517fa4, #a3c9e2)'; // Partly Cloudy
             if (cloudCover < 90) return 'linear-gradient(to bottom, #5d6d7e, #b2babb)'; // Cloudy
             return 'linear-gradient(to bottom, #424949, #7f8c8d)'; // Overcast
        }

        if (weatherCode === 0) return 'linear-gradient(to bottom, #2980B9, #6DD5FA)'; // Clear
        if (weatherCode >= 1 && weatherCode <= 3) return 'linear-gradient(to bottom, #3E5151, #DECBA4)'; // Cloudy
        if (weatherCode >= 95) return 'linear-gradient(to bottom, #232526, #414345)'; // Storm
        if (weatherCode >= 51) return 'linear-gradient(to bottom, #4B79A1, #283E51)'; // Rain
        if (weatherCode >= 45 && weatherCode <= 48) return 'linear-gradient(to bottom, #3E5151, #DECBA4)'; // Mist
        
        return 'linear-gradient(to bottom, #2980B9, #6DD5FA)'; // Default Clear
    };

    // 2. Celestial Bodies
    const renderCelestial = () => {
        // Hide sun/moon if very heavy storm/overcast or heavy rain
        if (weatherCode >= 95 || weatherCode === 65 || weatherCode === 75 || (cloudCover !== undefined && cloudCover > 90)) return null; 
        
        if (isDay) {
            // Sun - Moved further down to ensure no overlap with header
            return (
                <div className="absolute top-48 right-10 w-24 h-24 bg-yellow-400 rounded-full shadow-[0_0_60px_rgba(255,215,0,0.8)] animate-spin-slow opacity-90 z-0" />
            );
        } else {
            // Moon - Moved further down
            return (
                <div className="absolute top-48 right-10 w-20 h-20 bg-gray-100 rounded-full shadow-[0_0_30px_rgba(255,255,255,0.5)] z-0 opacity-80" />
            );
        }
    };

    // 3. Clouds
    const renderClouds = () => {
        if (weatherCode === 0 && (cloudCover === undefined || cloudCover < 10)) return null;
        
        // Determine density based on cloudCover or weatherCode
        let density = 0.4;
        let isDark = false;

        if (cloudCover !== undefined) {
             density = cloudCover / 100;
             isDark = cloudCover > 70;
        } else {
             const isHeavy = weatherCode > 2;
             density = isHeavy ? 0.8 : 0.4;
             isDark = isHeavy;
        }
        
        const color = isDark ? '#9CA3AF' : '#FFFFFF';
        const opacity = Math.min(0.9, density + 0.1);

        // Using multiple layers for parallax effect
        return (
            <div className="absolute inset-0 z-10 pointer-events-none">
                 <div className="absolute top-1/4 left-1/4 w-64 h-20 rounded-full blur-3xl animate-float-clouds" 
                      style={{ backgroundColor: color, opacity, animationDuration: '30s' }} />
                 <div className="absolute top-1/3 right-1/4 w-80 h-32 rounded-full blur-3xl animate-float-clouds" 
                      style={{ backgroundColor: color, opacity: opacity * 0.8, animationDuration: '45s', animationDirection: 'reverse' }} />
                 <div className="absolute top-1/2 left-1/3 w-96 h-40 rounded-full blur-3xl animate-float-clouds" 
                      style={{ backgroundColor: color, opacity: opacity * 0.6, animationDuration: '60s' }} />
                 
                 {isDark && (
                    <div className="absolute top-0 left-0 w-full h-full bg-gray-600/30 mix-blend-multiply" />
                 )}
            </div>
        );
    };

    // 4. Precipitation
    // Logic moved to ImmersiveWeatherEffect
    
    // Stars (Night only, clear sky)
    const renderStars = () => {
        if (!isDay && weatherCode <= 2) {
            return (
                <div className="absolute inset-0 z-0 opacity-50" style={{
                    backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
                    backgroundSize: '50px 50px'
                }} />
            );
        }
        return null;
    };

    return (
        <div className="absolute inset-0 w-full h-full overflow-hidden transition-all duration-1000" style={{ background: getSkyGradient() }}>
            {renderStars()}
            {renderCelestial()}
            {renderClouds()}
            <ImmersiveWeatherEffect weatherCode={weatherCode} isDay={isDay} precipAmount={precipAmount} />
        </div>
    );
});
