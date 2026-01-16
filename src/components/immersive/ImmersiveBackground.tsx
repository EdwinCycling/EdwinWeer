
import React from 'react';
import './immersive.css';

interface Props {
    weatherCode: number;
    isDay: boolean;
    precipAmount?: number; // mm
}

export const ImmersiveBackground: React.FC<Props> = ({ weatherCode, isDay, precipAmount = 0 }) => {
    
    // 1. Determine Background Gradient (Sky)
    const getSkyGradient = () => {
        if (!isDay) {
             // Night
             if (weatherCode >= 95) return 'linear-gradient(to bottom, #000000, #434343)'; // Storm night
             if (weatherCode >= 51) return 'linear-gradient(to bottom, #0F2027, #2C5364)'; // Rain night
             return 'linear-gradient(to bottom, #0F2027, #203A43, #2C5364)'; // Clear/Cloudy night
        }

        // Day
        if (weatherCode === 0) return 'linear-gradient(to bottom, #2980B9, #6DD5FA)'; // Clear
        if (weatherCode >= 1 && weatherCode <= 3) return 'linear-gradient(to bottom, #3E5151, #DECBA4)'; // Cloudy
        if (weatherCode >= 95) return 'linear-gradient(to bottom, #232526, #414345)'; // Storm
        if (weatherCode >= 51) return 'linear-gradient(to bottom, #4B79A1, #283E51)'; // Rain
        if (weatherCode >= 45 && weatherCode <= 48) return 'linear-gradient(to bottom, #3E5151, #DECBA4)'; // Mist
        
        return 'linear-gradient(to bottom, #2980B9, #6DD5FA)'; // Default Clear
    };

    // 2. Celestial Bodies
    const renderCelestial = () => {
        // Hide sun/moon if very heavy storm/overcast
        if (weatherCode >= 95 || weatherCode === 65 || weatherCode === 75) return null; 
        
        if (isDay) {
            // Sun
            return (
                <div className="absolute top-10 right-10 w-24 h-24 bg-yellow-400 rounded-full shadow-[0_0_60px_rgba(255,215,0,0.8)] animate-spin-slow opacity-90 z-0" />
            );
        } else {
            // Moon
            return (
                <div className="absolute top-10 right-10 w-20 h-20 bg-gray-100 rounded-full shadow-[0_0_30px_rgba(255,255,255,0.5)] z-0 opacity-80" />
            );
        }
    };

    // 3. Clouds
    const renderClouds = () => {
        if (weatherCode === 0) return null;
        
        const isHeavy = weatherCode > 2;
        const opacity = isHeavy ? 0.8 : 0.4;
        const color = isHeavy ? '#9CA3AF' : '#FFFFFF';

        // Using multiple layers for parallax effect
        return (
            <div className="absolute inset-0 z-10 pointer-events-none">
                 <div className="absolute top-1/4 left-1/4 w-48 h-16 rounded-full blur-2xl animate-float-clouds" 
                      style={{ backgroundColor: color, opacity, animationDuration: '25s' }} />
                 <div className="absolute top-1/3 right-1/4 w-64 h-24 rounded-full blur-3xl animate-float-clouds" 
                      style={{ backgroundColor: color, opacity: opacity * 0.8, animationDuration: '35s', animationDirection: 'reverse' }} />
                 {isHeavy && (
                    <div className="absolute top-0 left-0 w-full h-full bg-gray-500/20 mix-blend-multiply" />
                 )}
            </div>
        );
    };

    // 4. Precipitation
    const renderPrecipitation = () => {
        // Rain: 51-67, 80-82, 95-99
        if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82) || (weatherCode >= 95)) {
             const intensity = precipAmount > 2 ? 0.8 : 0.4;
             return <div className="absolute inset-0 z-20 rain-layer animate-rain pointer-events-none" style={{ opacity: intensity }} />;
        }

        // Snow: 71-77, 85-86
        if ((weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86)) {
             return <div className="absolute inset-0 z-20 snow-layer animate-snow pointer-events-none opacity-80" />;
        }
        
        // Mist: 45, 48
        if (weatherCode === 45 || weatherCode === 48) {
            return <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-white/30 to-transparent animate-mist z-20 pointer-events-none" />;
        }

        return null;
    };

    // 5. Storm Flash
    const renderStorm = () => {
        if (weatherCode >= 95) {
            return <div className="absolute inset-0 bg-white z-30 animate-flash pointer-events-none mix-blend-overlay" />;
        }
        return null;
    };

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
            {renderPrecipitation()}
            {renderStorm()}
        </div>
    );
};
