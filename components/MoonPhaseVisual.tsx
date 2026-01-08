import React from 'react';

interface MoonPhaseVisualProps {
    phase: number;
    size?: number;
    className?: string;
}

/**
 * Renders a realistic SVG moon phase
 * phase: 0 (new), 0.25 (first quarter), 0.5 (full), 0.75 (last quarter), 1 (new)
 */
export const MoonPhaseVisual: React.FC<MoonPhaseVisualProps> = ({ phase, size = 80, className = "" }) => {
    const radius = 45;
    const center = 50;
    
    // Normalize phase to 0-1
    const p = phase % 1;
    
    // Calculate the horizontal radius of the "inner" ellipse that creates the phase effect
    // It goes from radius to -radius and back to radius
    let innerRadius = 0;
    let isWaxing = p <= 0.5;
    
    if (p <= 0.5) {
        // 0 -> 0.25 -> 0.5
        // radius -> 0 -> -radius
        innerRadius = radius * (1 - 4 * p);
    } else {
        // 0.5 -> 0.75 -> 1.0
        // -radius -> 0 -> radius
        innerRadius = radius * (4 * p - 3);
    }

    // Path for the moon
    // We draw two arcs. One is always the semi-circle (left or right).
    // The other is the ellipse that changes with the phase.
    
    const sweep1 = isWaxing ? 1 : 0;
    const sweep2 = isWaxing ? 0 : 1;
    
    // The "dark" part is always a circle
    // The "light" part is what we draw with paths
    
    return (
        <svg 
            width={size} 
            height={size} 
            viewBox="0 0 100 100" 
            className={`${className} drop-shadow-lg`}
            style={{ filter: 'drop-shadow(0 0 8px rgba(199, 210, 254, 0.3))' }}
        >
            <defs>
                <radialGradient id="moonGradient" cx="50%" cy="50%" r="50%" fx="30%" fy="30%">
                    <stop offset="0%" stopColor="#f8fafc" />
                    <stop offset="70%" stopColor="#e2e8f0" />
                    <stop offset="100%" stopColor="#cbd5e1" />
                </radialGradient>
                <filter id="craterBlur" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" />
                </filter>
            </defs>

            {/* Dark background (the moon's shadow/dark side) */}
            <circle 
                cx={center} 
                cy={center} 
                r={radius} 
                className="fill-slate-800/40 dark:fill-slate-900/60" 
            />

            {/* The lit part */}
            <path
                d={`
                    M ${center} ${center - radius}
                    A ${radius} ${radius} 0 0 ${sweep1} ${center} ${center + radius}
                    A ${Math.abs(innerRadius)} ${radius} 0 0 ${sweep2} ${center} ${center - radius}
                `}
                fill="url(#moonGradient)"
            />

            {/* Add some subtle craters for realism */}
            <g opacity="0.15" filter="url(#craterBlur)">
                <circle cx="35" cy="40" r="4" fill="#64748b" />
                <circle cx="65" cy="45" r="6" fill="#64748b" />
                <circle cx="45" cy="65" r="5" fill="#64748b" />
                <circle cx="55" cy="30" r="3" fill="#64748b" />
                <circle cx="30" cy="60" r="3" fill="#64748b" />
            </g>
        </svg>
    );
};
