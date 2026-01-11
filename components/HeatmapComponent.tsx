import React, { useMemo, useState } from 'react';
import { AppSettings, TempUnit, PrecipUnit } from '../types';
import { convertTemp, convertPrecip } from '../services/weatherService';
import { Icon } from './Icon';
import { Tooltip as UITooltip } from './Tooltip';

interface Props {
  data: {
    dates: string[];
    maxTemps: (number | null)[];
    minTemps: (number | null)[];
    precip: (number | null)[];
    sun?: (number | null)[];
    daylight?: (number | null)[];
  };
  year: number;
  settings: AppSettings;
  onDayClick?: (date: string) => void;
}

type HeatmapMode = 'heat' | 'cold' | 'rain' | 'sun';

// --- Color Utils ---

// Parse hex to [r, g, b]
const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
};

// Interpolate between two colors
const interpolateColor = (c1: string, c2: string, factor: number): string => {
    const rgb1 = hexToRgb(c1);
    const rgb2 = hexToRgb(c2);
    const r = Math.round(rgb1[0] + factor * (rgb2[0] - rgb1[0]));
    const g = Math.round(rgb1[1] + factor * (rgb2[1] - rgb1[1]));
    const b = Math.round(rgb1[2] + factor * (rgb2[2] - rgb1[2]));
    return `rgb(${r}, ${g}, ${b})`;
};

// --- Scales ---
// Temp Scale (For both Heat and Cold modes, consistent)
// < -5: #000080 (Navy)
// -5 to 0: #0000FF (Blue)
// 0 to 5: #ADD8E6 (Light Blue)
// 5 to 10: #E0FFFF (Light Cyan)
// 10 to 15: #90EE90 (Light Green)
// 15 to 20: #FFFF00 (Yellow)
// 20 to 25: #FFA500 (Orange)
// 25 to 30: #FF4500 (Orange Red)
// 30 to 35: #FF0000 (Red)
// 35 to 40: #8B0000 (Dark Red)
// > 40: #4B0082 (Indigo)

const TEMP_SCALE = [
    { limit: -5, color: '#000080', label: '< -5°' },
    { limit: 0, color: '#0000FF', label: '-5 - 0°' },
    { limit: 5, color: '#ADD8E6', label: '0 - 5°' },
    { limit: 10, color: '#E0FFFF', label: '5 - 10°' },
    { limit: 15, color: '#90EE90', label: '10 - 15°' },
    { limit: 20, color: '#FFFF00', label: '15 - 20°' },
    { limit: 25, color: '#FFA500', label: '20 - 25°' },
    { limit: 30, color: '#FF4500', label: '25 - 30°' },
    { limit: 35, color: '#FF0000', label: '30 - 35°' },
    { limit: 40, color: '#8B0000', label: '35 - 40°' },
    { limit: Infinity, color: '#4B0082', label: '> 40°' }
];

// Precip Scale
// 0: #e2e8f0 (Gray)
// < 2: #dbeafe (Blue 100)
// < 5: #93c5fd (Blue 300)
// < 10: #3b82f6 (Blue 500)
// < 20: #1d4ed8 (Blue 700)
// > 20: #1e3a8a (Blue 900)
const PRECIP_SCALE = [
    { limit: 0, color: '#e2e8f0', label: '0 mm' },
    { limit: 2, color: '#93c5fd', label: '< 2 mm' },
    { limit: 5, color: '#3b82f6', label: '2 - 5 mm' },
    { limit: 10, color: '#1d4ed8', label: '5 - 10 mm' },
    { limit: 20, color: '#1e3a8a', label: '10 - 20 mm' },
    { limit: Infinity, color: '#6d28d9', label: '> 20 mm' }
];

// Sun Scale (Percentage)
// 0-10: #f8fafc (slate-50)
// 10-20: #fef9c3 (yellow-100)
// 20-30: #fef08a (yellow-200)
// 30-40: #fde047 (yellow-300)
// 40-50: #facc15 (yellow-400)
// 50-60: #eab308 (yellow-500)
// 60-70: #ca8a04 (yellow-600)
// 70-80: #a16207 (yellow-700)
// 80-90: #854d0e (yellow-800)
// 90-100: #713f12 (yellow-900)
const SUN_SCALE = [
    { limit: 10, color: '#ffffff', label: '< 10%' },
    { limit: 20, color: '#fffde7', label: '10 - 20%' },
    { limit: 30, color: '#fff9c4', label: '20 - 30%' },
    { limit: 40, color: '#fff59d', label: '30 - 40%' },
    { limit: 50, color: '#fff176', label: '40 - 50%' },
    { limit: 60, color: '#ffee58', label: '50 - 60%' },
    { limit: 70, color: '#ffeb3b', label: '60 - 70%' },
    { limit: 80, color: '#fdd835', label: '70 - 80%' },
    { limit: 90, color: '#fbc02d', label: '80 - 90%' },
    { limit: Infinity, color: '#ffeb3b', label: '90 - 100%' }
];

// Get color based on value and mode
const getColor = (value: number | null, mode: HeatmapMode): string => {
    if (value === null) return '#f1f5f9'; // slate-100 for no data

    if (mode === 'rain') {
        if (value === 0) return PRECIP_SCALE[0].color;
        for (let i = 1; i < PRECIP_SCALE.length; i++) {
            if (value < PRECIP_SCALE[i].limit) return PRECIP_SCALE[i].color;
        }
        return PRECIP_SCALE[PRECIP_SCALE.length - 1].color;
    } else if (mode === 'sun') {
        for (let i = 0; i < SUN_SCALE.length; i++) {
            if (value < SUN_SCALE[i].limit) return SUN_SCALE[i].color;
        }
        return SUN_SCALE[SUN_SCALE.length - 1].color;
    } else {
        // Temp (Heat or Cold)
        // Check ranges
        if (value < TEMP_SCALE[0].limit) return TEMP_SCALE[0].color;
        for (let i = 1; i < TEMP_SCALE.length; i++) {
            if (value < TEMP_SCALE[i].limit) return TEMP_SCALE[i].color;
        }
        return TEMP_SCALE[TEMP_SCALE.length - 1].color;
    }
};

export const HeatmapComponent: React.FC<Props> = ({ data, year, settings, onDayClick }) => {
    const [mode, setMode] = useState<HeatmapMode>('heat');

    const processedData = useMemo(() => {
        const items = [];
        const startDate = new Date(year, 0, 1);
        
        let startDay = startDate.getDay() - 1;
        if (startDay === -1) startDay = 6;

        for (let i = 0; i < data.dates.length; i++) {
            const date = new Date(data.dates[i]);
            
            const dayIndex = i; 
            const gridIndex = dayIndex + startDay;
            const x = Math.floor(gridIndex / 7);
            const y = gridIndex % 7;

            let value = null;
            if (mode === 'heat') value = data.maxTemps[i];
            else if (mode === 'cold') value = data.minTemps[i];
            else if (mode === 'rain') value = data.precip[i];
            else if (mode === 'sun') {
                const s = data.sun?.[i];
                const d = data.daylight?.[i];
                if (s !== undefined && d !== undefined && s !== null && d !== null && d > 0) {
                    value = (s / d) * 100;
                }
            }

            items.push({
                date: data.dates[i],
                value,
                x,
                y,
                displayValue: value // raw value
            });
        }
        return items;
    }, [data, year, mode]);

    const monthLabels = useMemo(() => {
        const labels = [];
        const months = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
        let currentMonth = -1;
        
        processedData.forEach((item) => {
            const d = new Date(item.date);
            const m = d.getMonth();
            if (m !== currentMonth) {
                currentMonth = m;
                if (!labels.find(l => l.label === months[m])) {
                     labels.push({ label: months[m], x: item.x });
                }
            }
        });
        return labels;
    }, [processedData]);

    // Dimensions
    const cellSize = 12;
    const gap = 3;
    const width = 54 * (cellSize + gap); // 53 weeks + buffer
    const height = 7 * (cellSize + gap) + 30; // 7 days + header

    const currentScale = mode === 'rain' ? PRECIP_SCALE : mode === 'sun' ? SUN_SCALE : TEMP_SCALE;

    return (
        <div className="w-full flex flex-col gap-4">
            {/* Mode Selector */}
            <div className="flex gap-2 justify-center">
                <button
                    onClick={() => setMode('heat')}
                    className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${
                        mode === 'heat' ? 'bg-red-500 text-white shadow-lg' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-white/20'
                    }`}
                >
                    <Icon name="thermostat" />
                    Hitte
                </button>
                <button
                    onClick={() => setMode('cold')}
                    className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${
                        mode === 'cold' ? 'bg-blue-500 text-white shadow-lg' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-white/20'
                    }`}
                >
                    <Icon name="ac_unit" />
                    Kou
                </button>
                <button
                    onClick={() => setMode('rain')}
                    className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${
                        mode === 'rain' ? 'bg-blue-800 text-white shadow-lg' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-white/20'
                    }`}
                >
                    <Icon name="rainy" />
                    Regen
                </button>
                <button
                    onClick={() => setMode('sun')}
                    className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${
                        mode === 'sun' ? 'bg-yellow-500 text-white shadow-lg' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-white/20'
                    }`}
                >
                    <Icon name="wb_sunny" />
                    Zon
                </button>
            </div>

            {/* Heatmap Container */}
            <div className="overflow-x-auto pb-4">
                <div className="min-w-[700px] flex justify-center">
                    <svg width={width} height={height} className="font-sans">
                        {/* Month Labels */}
                        {monthLabels.map((l, i) => (
                            <text
                                key={l.label}
                                x={l.x * (cellSize + gap)}
                                y={15}
                                fontSize={10}
                                fill="currentColor"
                                className="text-slate-400 dark:text-slate-500"
                            >
                                {l.label}
                            </text>
                        ))}

                        {/* Day Labels (Ma, Wo, Vr) */}
                        <text x={-20} y={30 + 1 * (cellSize + gap) + 10} fontSize={9} fill="currentColor" className="text-slate-300 dark:text-slate-600 hidden">Ma</text>

                        {/* Grid */}
                        <g transform="translate(0, 30)">
                             {/* Day Labels */}
                             <text x={-5} y={1 * (cellSize + gap) + 9} fontSize={9} textAnchor="end" className="fill-slate-400 dark:fill-slate-500">Ma</text>
                             <text x={-5} y={3 * (cellSize + gap) + 9} fontSize={9} textAnchor="end" className="fill-slate-400 dark:fill-slate-500">Wo</text>
                             <text x={-5} y={5 * (cellSize + gap) + 9} fontSize={9} textAnchor="end" className="fill-slate-400 dark:fill-slate-500">Vr</text>

                            {processedData.map((item) => (
                                <g key={item.date}>
                                    <UITooltip 
                                        content={
                                            <div className="text-center">
                                                <div className="font-bold">{new Date(item.date).toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-US', { day: 'numeric', month: 'short' })}</div>
                                                <div>
                                                    {item.value !== null ? (
                                                        mode === 'rain' 
                                                            ? `${convertPrecip(item.value, settings.precipUnit)} ${settings.precipUnit}`
                                                            : mode === 'sun'
                                                                ? `${Math.round(item.value)}% zon`
                                                                : `${convertTemp(item.value, settings.tempUnit)}°`
                                                    ) : 'Geen data'}
                                                </div>
                                                <div className="text-[10px] text-slate-300 mt-1">Klik voor details</div>
                                            </div>
                                        }
                                    >
                                        <rect
                                            x={item.x * (cellSize + gap)}
                                            y={item.y * (cellSize + gap)}
                                            width={cellSize}
                                            height={cellSize}
                                            fill={item.value !== null ? getColor(item.value, mode) : 'transparent'}
                                            className={`${item.value !== null ? 'cursor-pointer hover:stroke-white/50 hover:stroke-1' : ''} transition-all duration-200`}
                                            onClick={() => item.value !== null && onDayClick?.(item.date)}
                                            rx={2}
                                        />
                                    </UITooltip>
                                </g>
                            ))}
                        </g>
                    </svg>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap justify-center items-center gap-2 px-4">
                {currentScale.map((item, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-sm shadow-sm border border-slate-200 dark:border-white/10" style={{ backgroundColor: item.color }}></div>
                        <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
