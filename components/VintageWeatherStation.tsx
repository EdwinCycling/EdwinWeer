import React, { useMemo } from 'react';
import { getTranslation } from '../services/translations';
import { AppLanguage, TempUnit } from '../types';
import { convertTemp } from '../services/weatherService';

interface VintageWeatherStationProps {
    pressure: number | null | undefined;
    prevPressure: number | null | undefined;
    temp: number | null | undefined;
    humidity: number | null | undefined;
    tempUnit: TempUnit;
    language: AppLanguage;
}

export const VintageWeatherStation: React.FC<VintageWeatherStationProps> = ({
    pressure,
    prevPressure,
    temp,
    humidity,
    tempUnit,
    language
}) => {
    const t = (key: string) => getTranslation(key, language);

    // --- Thermometer Calculations ---
    // Range: -20°C to 50°C
    const minTempC = -20;
    const maxTempC = 50;
    const tempRange = maxTempC - minTempC;
    
    // Convert current temp to C for calculation (if it's not already, but usually API returns C)
    // Assuming 'temp' prop is in Celsius from weatherService (standard OpenMeteo)
    // If tempUnit is F, we still calculate height based on C scale physically fixed on the device
    const currentTempC = temp ?? 0;
    const clampedTemp = Math.max(minTempC, Math.min(maxTempC, currentTempC));
    const tempPercent = (clampedTemp - minTempC) / tempRange;
    
    // --- Barometer Calculations ---
    // Range: 960 to 1060 hPa
    const minPressure = 960;
    const maxPressure = 1060;
    const pressureRange = maxPressure - minPressure;
    
    const startAngle = -135; // Bottom Left
    const endAngle = 135;   // Bottom Right
    const totalAngle = endAngle - startAngle;

    const getPressureAngle = (p: number) => {
        const clamped = Math.max(minPressure, Math.min(maxPressure, p));
        const pct = (clamped - minPressure) / pressureRange;
        return startAngle + (pct * totalAngle);
    };

    const currentPressureAngle = pressure ? getPressureAngle(pressure) : startAngle;
    const prevPressureAngle = prevPressure ? getPressureAngle(prevPressure) : startAngle;

    // --- Hygrometer Calculations ---
    // Range: 0 to 100%
    const getHumidityAngle = (h: number) => {
        // -135 to 135
        const pct = Math.max(0, Math.min(100, h)) / 100;
        return -135 + (pct * 270);
    };
    const humidityAngle = humidity ? getHumidityAngle(humidity) : -135;


    // --- Graphics Helpers ---
    // Generate ticks for Thermometer
    const renderThermometerTicks = () => {
        const ticks = [];
        // Celsius (Left)
        for (let c = minTempC; c <= maxTempC; c += 10) {
            const pct = (c - minTempC) / tempRange;
            const y = 240 - (pct * 200); // Top is 40, Bottom is 240 (200px height)
            ticks.push(
                <g key={`c-${c}`}>
                    <line x1="25" y1={y} x2="35" y2={y} stroke="#3e2723" strokeWidth="2" />
                    <text x="20" y={y + 4} textAnchor="end" fontSize="10" fill="#3e2723" fontFamily="serif" fontWeight="bold">{c}</text>
                </g>
            );
            // Subticks
            if (c < maxTempC) {
                for (let sub = 1; sub < 10; sub++) {
                    const subPct = (c + sub - minTempC) / tempRange;
                    const subY = 240 - (subPct * 200);
                    const len = sub === 5 ? 6 : 3;
                    ticks.push(<line key={`c-sub-${c}-${sub}`} x1="29" y1={subY} x2={29+len} y2={subY} stroke="#3e2723" strokeWidth="1" />);
                }
            }
        }
        
        // Fahrenheit (Right) - approximate alignment
        // C = (F - 32) * 5/9 => F = C * 9/5 + 32
        const minF = Math.round(minTempC * 9/5 + 32); // -4
        const maxF = Math.round(maxTempC * 9/5 + 32); // 122
        
        for (let f = 0; f <= 120; f += 20) {
            // Convert F back to C to find Y position
            const cEq = (f - 32) * 5/9;
            const pct = (cEq - minTempC) / tempRange;
            if (pct < 0 || pct > 1) continue;
            
            const y = 240 - (pct * 200);
            ticks.push(
                <g key={`f-${f}`}>
                    <line x1="45" y1={y} x2="55" y2={y} stroke="#3e2723" strokeWidth="2" />
                    <text x="60" y={y + 4} textAnchor="start" fontSize="10" fill="#3e2723" fontFamily="serif" fontWeight="bold">{f}</text>
                </g>
            );
             // Subticks
             if (f < 120) {
                 for (let sub = 2; sub < 20; sub+=2) { // Every 2 degrees F
                    const subF = f + sub;
                    const subC = (subF - 32) * 5/9;
                    const subPct = (subC - minTempC) / tempRange;
                    if (subPct > 1) break;
                    const subY = 240 - (subPct * 200);
                    const len = sub === 10 ? 6 : 3;
                    ticks.push(<line key={`f-sub-${f}-${sub}`} x1={45-len} y1={subY} x2="51" y2={subY} stroke="#3e2723" strokeWidth="1" />);
                 }
             }
        }

        return ticks;
    };

    return (
        <div className="relative w-[320px] h-[780px] filter drop-shadow-2xl mx-auto transform scale-90 sm:scale-100 origin-top">
            
            {/* SVG Definitions for Gradients/Filters */}
            <svg width="0" height="0">
                <defs>
                    <linearGradient id="woodGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#5d4037" />
                        <stop offset="20%" stopColor="#4e342e" />
                        <stop offset="40%" stopColor="#6d4c41" />
                        <stop offset="60%" stopColor="#5d4037" />
                        <stop offset="80%" stopColor="#4e342e" />
                        <stop offset="100%" stopColor="#5d4037" />
                    </linearGradient>
                    <filter id="woodGrain">
                        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise" />
                        <feColorMatrix type="saturate" values="0" in="noise" result="desaturatedNoise" />
                        <feBlend in="SourceGraphic" in2="desaturatedNoise" mode="multiply" />
                    </filter>
                    
                    <linearGradient id="brassGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fdd835" />
                        <stop offset="30%" stopColor="#fbc02d" />
                        <stop offset="50%" stopColor="#f9a825" />
                        <stop offset="80%" stopColor="#fbc02d" />
                        <stop offset="100%" stopColor="#fff176" />
                    </linearGradient>
                    
                    <radialGradient id="glassGlare" cx="30%" cy="30%" r="50%">
                        <stop offset="0%" stopColor="white" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </radialGradient>
                </defs>
            </svg>

            {/* Main Wood Body (Banjo Shape) */}
            <div className="absolute inset-0 z-0">
                <svg width="100%" height="100%" viewBox="0 0 320 780">
                    {/* Top Finial */}
                    <path d="M160 10 C 170 10, 180 20, 160 40 C 140 20, 150 10, 160 10 Z" fill="url(#brassGradient)" />
                    
                    {/* Main Shape */}
                    <path 
                        d="M120 20 
                           L200 20 
                           L200 60
                           Q210 100 200 280 
                           L240 320
                           Q280 360 280 460
                           L280 750
                           Q280 780 160 780
                           Q40 780 40 750
                           L40 460
                           Q40 360 80 320
                           L120 280
                           Q110 100 120 60
                           Z" 
                        fill="url(#woodGradient)" 
                        stroke="#3e2723" 
                        strokeWidth="2"
                        filter="url(#woodGrain)"
                    />
                     {/* Inner Bevel Highlight */}
                     <path 
                        d="M125 25 
                           L195 25 
                           L195 62 
                           Q205 100 195 280 
                           L235 320
                           Q275 360 275 460
                           L275 745
                           Q275 775 160 775
                           Q45 775 45 745
                           L45 460
                           Q45 360 85 320
                           L125 280
                           Q115 100 125 62
                           Z" 
                        fill="none" 
                        stroke="rgba(255,255,255,0.1)" 
                        strokeWidth="2"
                    />
                </svg>
            </div>

            {/* Thermometer Section (Top) */}
            <div className="absolute top-[60px] left-1/2 -translate-x-1/2 w-[80px] h-[260px] bg-[#fff8e1] rounded-lg border-2 border-[#8d6e63] shadow-inner flex justify-center items-center">
                <svg width="80" height="260" viewBox="0 0 80 260">
                    {/* Scale Markings */}
                    {renderThermometerTicks()}
                    
                    {/* Text */}
                    <text x="20" y="20" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#3e2723">°C</text>
                    <text x="60" y="20" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#3e2723">°F</text>
                    
                    {/* Glass Tube */}
                    <rect x="36" y="30" width="8" height="210" rx="4" fill="#e0e0e0" stroke="#9e9e9e" strokeWidth="0.5" />
                    
                    {/* Red Liquid (Variable Height) */}
                    <rect 
                        x="37" 
                        y={240 - (tempPercent * 200)} 
                        width="6" 
                        height={(tempPercent * 200) + 10} // +10 to connect to bulb
                        fill="#d32f2f" 
                    />
                    
                    {/* Bulb */}
                    <circle cx="40" cy="245" r="8" fill="#d32f2f" />
                    
                    {/* Glass Glare */}
                    <rect x="36" y="30" width="4" height="225" rx="2" fill="white" fillOpacity="0.3" />
                </svg>
            </div>

            {/* Barometer Section (Center/Large) */}
            <div className="absolute top-[340px] left-1/2 -translate-x-1/2 w-[240px] h-[240px]">
                {/* Brass Bezel */}
                <div className="absolute inset-0 rounded-full bg-[url(#brassGradient)] shadow-xl border-4 border-[#4e342e]" style={{background: 'linear-gradient(135deg, #fdd835 0%, #f57f17 100%)'}}></div>
                <div className="absolute inset-2 rounded-full bg-white shadow-inner flex items-center justify-center border border-slate-300">
                    <svg width="230" height="230" viewBox="0 0 230 230">
                        {/* Dial Markings */}
                        {/* 960 to 1060. Total 100hPa. Angle -135 to +135 (270 deg) */}
                        {Array.from({length: 11}).map((_, i) => {
                            const p = 960 + (i * 10);
                            const angle = getPressureAngle(p);
                            const isMajor = true;
                            const r1 = 85;
                            const r2 = 95;
                            const rad = (angle - 90) * (Math.PI / 180);
                            const x1 = 115 + r1 * Math.cos(rad);
                            const y1 = 115 + r1 * Math.sin(rad);
                            const x2 = 115 + r2 * Math.cos(rad);
                            const y2 = 115 + r2 * Math.sin(rad);
                            
                            const tx = 115 + 72 * Math.cos(rad);
                            const ty = 115 + 72 * Math.sin(rad);

                            return (
                                <g key={p}>
                                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth="2" />
                                    <text x={tx} y={ty} textAnchor="middle" alignmentBaseline="middle" fontSize="10" fontWeight="bold" fontFamily="serif">{p}</text>
                                </g>
                            );
                        })}
                        {/* Minor ticks */}
                        {Array.from({length: 50}).map((_, i) => {
                            const p = 960 + (i * 2);
                            if (p % 10 === 0) return null;
                            const angle = getPressureAngle(p);
                            const r1 = 90;
                            const r2 = 95;
                            const rad = (angle - 90) * (Math.PI / 180);
                            const x1 = 115 + r1 * Math.cos(rad);
                            const y1 = 115 + r1 * Math.sin(rad);
                            const x2 = 115 + r2 * Math.cos(rad);
                            const y2 = 115 + r2 * Math.sin(rad);
                             return <line key={`min-${p}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth="1" />;
                        })}

                        {/* Weather Text */}
                        {/* Storm 970, Rain 990, Change 1010, Fair 1030, Dry 1050 */}
                        <text x="115" y="160" textAnchor="middle" fontSize="12" fontFamily="serif" fill="#666" transform={`rotate(${getPressureAngle(975)} 115 115) translate(0 -60)`}>{t('barometer.storm')}</text>
                        <text x="115" y="160" textAnchor="middle" fontSize="12" fontFamily="serif" fill="#666" transform={`rotate(${getPressureAngle(990)} 115 115) translate(0 -60)`}>{t('barometer.rain')}</text>
                        <text x="115" y="160" textAnchor="middle" fontSize="12" fontFamily="serif" fill="#666" transform={`rotate(${getPressureAngle(1013)} 115 115) translate(0 -60)`}>{t('barometer.change')}</text>
                        <text x="115" y="160" textAnchor="middle" fontSize="12" fontFamily="serif" fill="#666" transform={`rotate(${getPressureAngle(1030)} 115 115) translate(0 -60)`}>{t('barometer.fair')}</text>
                        <text x="115" y="160" textAnchor="middle" fontSize="12" fontFamily="serif" fill="#666" transform={`rotate(${getPressureAngle(1050)} 115 115) translate(0 -60)`}>{t('barometer.dry')}</text>
                        
                        {/* Decorative Center */}
                        <circle cx="115" cy="115" r="10" fill="#fdd835" stroke="#fbc02d" />

                        {/* Hands */}
                        {/* Reference Hand (Black, Old Reading) */}
                        <g transform={`rotate(${prevPressureAngle} 115 115)`}>
                             <line x1="115" y1="115" x2="115" y2="30" stroke="black" strokeWidth="3" strokeLinecap="round" />
                             <circle cx="115" cy="115" r="6" fill="black" />
                             <path d="M115 30 L110 40 L120 40 Z" fill="black" />
                        </g>

                        {/* Current Hand (Gold/Brass, New Reading) */}
                        <g transform={`rotate(${currentPressureAngle} 115 115)`} style={{filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.3))'}}>
                             <line x1="115" y1="130" x2="115" y2="25" stroke="#fdd835" strokeWidth="2" strokeLinecap="round" />
                             <circle cx="115" cy="115" r="4" fill="#fdd835" />
                             <path d="M115 20 L110 35 L120 35 Z" fill="#fdd835" />
                             <circle cx="115" cy="20" r="3" fill="none" stroke="#fdd835" strokeWidth="2" />
                        </g>
                        
                        {/* Glass Glare */}
                        <circle cx="115" cy="115" r="110" fill="url(#glassGlare)" pointerEvents="none" />
                    </svg>
                </div>
            </div>

             {/* Hygrometer Section (Bottom) */}
             <div className="absolute top-[620px] left-1/2 -translate-x-1/2 w-[120px] h-[120px]">
                {/* Brass Bezel */}
                <div className="absolute inset-0 rounded-full bg-[url(#brassGradient)] shadow-xl border-2 border-[#4e342e]" style={{background: 'linear-gradient(135deg, #fdd835 0%, #f57f17 100%)'}}></div>
                <div className="absolute inset-1 rounded-full bg-white shadow-inner flex items-center justify-center border border-slate-300">
                    <svg width="110" height="110" viewBox="0 0 110 110">
                        {/* Dial Markings */}
                        {/* 0 to 100. Angle -135 to +135 */}
                        {Array.from({length: 6}).map((_, i) => {
                            const h = i * 20;
                            const angle = getHumidityAngle(h);
                            const r1 = 38;
                            const r2 = 45;
                            const rad = (angle - 90) * (Math.PI / 180);
                            const x1 = 55 + r1 * Math.cos(rad);
                            const y1 = 55 + r1 * Math.sin(rad);
                            const x2 = 55 + r2 * Math.cos(rad);
                            const y2 = 55 + r2 * Math.sin(rad);
                            const tx = 55 + 28 * Math.cos(rad);
                            const ty = 55 + 28 * Math.sin(rad);

                            return (
                                <g key={h}>
                                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth="2" />
                                    <text x={tx} y={ty} textAnchor="middle" alignmentBaseline="middle" fontSize="8" fontWeight="bold" fontFamily="serif">{h}</text>
                                </g>
                            );
                        })}
                        <text x="55" y="70" textAnchor="middle" fontSize="8" fontFamily="serif" fill="#666">% Rel. Hum.</text>

                        {/* Hand */}
                        <g transform={`rotate(${humidityAngle} 55 55)`}>
                             <line x1="55" y1="55" x2="55" y2="15" stroke="#d32f2f" strokeWidth="2" strokeLinecap="round" />
                             <circle cx="55" cy="55" r="3" fill="#d32f2f" />
                             <path d="M55 10 L52 20 L58 20 Z" fill="#d32f2f" />
                        </g>
                         {/* Glass Glare */}
                         <circle cx="55" cy="55" r="50" fill="url(#glassGlare)" pointerEvents="none" />
                    </svg>
                </div>
            </div>

        </div>
    );
};
