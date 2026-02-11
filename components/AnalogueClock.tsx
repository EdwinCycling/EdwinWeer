import React, { useEffect, useState } from 'react';

interface Props {
    timezone?: string;
}

export const AnalogueClock: React.FC<Props> = ({ timezone }) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    let hours = time.getHours();
    let minutes = time.getMinutes();
    let seconds = time.getSeconds();

    if (timezone) {
        try {
            const timeString = time.toLocaleTimeString('en-US', { timeZone: timezone, hour12: false });
            const parts = timeString.split(':');
            if (parts.length === 3) {
                hours = parseInt(parts[0]);
                minutes = parseInt(parts[1]);
                seconds = parseInt(parts[2]);
            }
        } catch (e) {
            // Fallback to local time if timezone is invalid
        }
    }

    // SVG Rotation: 0 degrees is 3 o'clock (standard math angle)
    // We want 0 degrees to be 12 o'clock.
    // So we subtract 90 degrees from the calculation.
    
    // Seconds: 60s = 360deg -> 6deg per sec
    const secondDegrees = (seconds * 6) - 90;
    
    // Minutes: 60m = 360deg -> 6deg per min + slight offset for seconds
    const minuteDegrees = (minutes * 6) + (seconds * 0.1) - 90;
    
    // Hours: 12h = 360deg -> 30deg per hour + offset for minutes
    // Ensure we use 12-hour format for rotation calculation
    const hourDegrees = ((hours % 12) * 30) + (minutes * 0.5) - 90;

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-2xl">
                {/* Outer Ring/Bezel */}
                <circle cx="50" cy="50" r="48" fill="rgba(255,255,255,0.1)" stroke="white" strokeWidth="1.5" className="backdrop-blur-sm" />
                
                {/* Clock Face Background - Transparent/Glassy */}
                <circle cx="50" cy="50" r="45" fill="rgba(0,0,0,0.2)" />

                {/* Hour Markers */}
                {[...Array(12)].map((_, i) => {
                    const rotation = i * 30;
                    return (
                        <line
                            key={i}
                            x1="50" y1="10"
                            x2="50" y2={i % 3 === 0 ? "18" : "12"}
                            stroke="white"
                            strokeWidth={i % 3 === 0 ? "2" : "1"}
                            transform={`rotate(${rotation} 50 50)`}
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Brand Text */}
                <text x="50" y="65" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="5" fontWeight="bold" fontFamily="sans-serif" letterSpacing="0.5">
                    AskBaro.com
                </text>

                {/* Hands */}
                {/* Hour */}
                <line
                    x1="50" y1="50"
                    x2="75" y2="50" // Length 25
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    transform={`rotate(${hourDegrees} 50 50)`}
                />
                
                {/* Minute */}
                <line
                    x1="50" y1="50"
                    x2="85" y2="50" // Length 35
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    transform={`rotate(${minuteDegrees} 50 50)`}
                />

                {/* Second */}
                <line
                    x1="50" y1="50"
                    x2="88" y2="50" // Length 38
                    stroke="#ef4444" // Red like Viking
                    strokeWidth="0.8"
                    strokeLinecap="round"
                    transform={`rotate(${secondDegrees} 50 50)`}
                />
                
                {/* Center Pin */}
                <circle cx="50" cy="50" r="2" fill="#ef4444" />
            </svg>
        </div>
    );
};
