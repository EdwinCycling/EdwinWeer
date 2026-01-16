import React, { useState } from 'react';
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Label, ReferenceDot } from 'recharts';
import { AppSettings } from '../types';
import { Icon } from './Icon';
import { mapWmoCodeToIcon } from '../services/weatherService';

interface Props {
    data: any[];
    settings: AppSettings;
}

const getIconColor = (iconName: string): string => {
    if (iconName.includes('sunny') || iconName.includes('clear')) return 'text-yellow-500';
    if (iconName.includes('rain') || iconName.includes('drizzle')) return 'text-blue-500';
    if (iconName.includes('thunderstorm')) return 'text-purple-600';
    if (iconName.includes('snow')) return 'text-blue-200';
    if (iconName.includes('cloud')) return 'text-slate-400';
    if (iconName.includes('fog')) return 'text-slate-300';
    return 'text-slate-600';
};

export const CompactHourlyChart: React.FC<Props> = ({ data, settings }) => {
    const [showWind, setShowWind] = useState(true);
    const [showRain, setShowRain] = useState(true);

    // Prepare data
    const chartData = data.map((d, i) => {
        const date = new Date(d.timestamp);
        // Format Day Label: e.g. "Do. 15 Jan."
        const dayName = date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        
        const prevDate = i > 0 ? new Date(data[i-1].timestamp) : null;
        const isNewDay = !prevDate || date.getDate() !== prevDate.getDate();
        
        const hour = date.getHours();
        const hourLabel = hour.toString().padStart(2, '0');

        return {
            ...d,
            dayLabel: isNewDay ? dayName : '',
            hourLabel,
            // For wind arrow rotation
            windRotation: d.windDir + 180,
            index: i, // Add index for reference lines
            isMidnight: hour === 0
        };
    });

    const temps = chartData.map(d => d.temp);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    
    const minTempPoint = chartData.find(d => d.temp === minTemp);
    const maxTempPoint = chartData.find(d => d.temp === maxTemp);

    const minTempFloor = Math.floor(minTemp);
    const maxTempCeil = Math.ceil(maxTemp);
    
    // Generate ticks for every degree
    const tempTicks = [];
    for (let i = minTempFloor - 2; i <= maxTempCeil + 2; i++) {
        tempTicks.push(i);
    }

    // Fixed ticks for Rain and Wind
    const rainTicks = [0, 1, 2, 3, 4, 5];
    const windTicks = settings.windUnit === 'bft' ? [0, 2, 4, 6, 8, 10] : undefined;

    const midnightIndices = chartData.filter(d => d.isMidnight).map(d => d.index);

    const CustomIconTick = (props: any) => {
        const { x, y, index } = props;
        // Show every 2 hours
        if (index % 2 !== 0) return null;
        
        const d = chartData[index];
        if (!d) return null;

        const date = new Date(d.timestamp);
        const hour = date.getHours();
        const isNight = hour < 6 || hour > 21;
        const icon = mapWmoCodeToIcon(d.weatherCode, isNight);
        const colorClass = getIconColor(icon);

        return (
            <foreignObject x={x - 15} y={y - 15} width={30} height={30}>
                <div className={`flex items-center justify-center w-full h-full ${colorClass}`}>
                    <Icon name={icon} className="text-xl" />
                </div>
            </foreignObject>
        );
    };

    const CustomWindTick = (props: any) => {
        const { x, y, index } = props;
        if (!showWind) return null;
        if (index % 2 !== 0) return null;
        const d = chartData[index];
        if (!d) return null;
        
        return (
            <g transform={`translate(${x},${y})`}>
                    {/* Speed Text */}
                    <text x={0} y={0} dy={8} textAnchor="middle" fill="#334155" fontSize={10} fontWeight="bold">
                        {Math.round(d.wind)}
                    </text>
                    {/* Arrow - Made slightly larger and bolder */}
                    <g transform={`translate(0, 20) rotate(${d.windRotation})`}>
                         <path d="M0,0 L-3,-5 L0,-3 L3,-5 Z" fill="#334155" />
                    </g>
                </g>
        );
    };

    const CustomDayTick = (props: any) => {
        const { x, y, index } = props;
        const d = chartData[index];
        if (!d || !d.dayLabel) return null;

        return (
            <text x={x} y={y} dy={16} textAnchor="start" fill="#0f172a" fontSize={13} fontWeight="bold">
                {d.dayLabel}
            </text>
        );
    };

    const CustomTempPopup = (props: any) => {
        const { x, y, value, color, position } = props;
        const yOffset = position === 'top' ? -25 : 10;
        return (
            <g transform={`translate(${x},${y})`}>
                <rect x="-18" y={yOffset} width="36" height="20" rx="4" fill={color} stroke="#fff" strokeWidth={1.5} />
                <text x="0" y={yOffset + 14} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">
                    {value}°
                </text>
            </g>
        );
    };

    return (
        <div className="w-full select-none bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="h-[480px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <defs>
                            <linearGradient id="windGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#a855f7" stopOpacity={0.3}/>
                            </linearGradient>
                            <linearGradient id="rainGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            </linearGradient>
                        </defs>

                        <CartesianGrid strokeDasharray="3 3" vertical={false} horizontal={false} />
                        
                        {/* Vertical Grid Lines per hour (background) */}
                        {chartData.map((d, idx) => (
                            <ReferenceLine 
                                key={`vgrid-${idx}`} 
                                x={idx} 
                                stroke="#cbd5e1" 
                                strokeWidth={1} 
                                strokeOpacity={0.3}
                                xAxisId="hours"
                            />
                        ))}

                        {/* Custom Horizontal Grid Lines per degree */}
                        {tempTicks.map(tick => {
                            if (tick % 5 === 0) {
                                return <ReferenceLine key={`grid-${tick}`} yAxisId="temp" y={tick} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.6} />;
                            }
                            return <ReferenceLine key={`grid-${tick}`} yAxisId="temp" y={tick} stroke="#cbd5e1" strokeWidth={1} strokeOpacity={0.3} />;
                        })}

                        {/* Special 0 degree line */}
                        <ReferenceLine 
                            yAxisId="temp" 
                            y={0} 
                            stroke="#1e293b" 
                            strokeWidth={2} 
                            label={{ value: '0°', position: 'left', fill: '#1e293b', fontSize: 12, fontWeight: 'bold' }} 
                        />
                        
                        {/* Midnight Reference Lines - Duidelijk aangeven wanneer er een nieuwe dag begint */}
                        {midnightIndices.map(idx => (
                            <ReferenceLine 
                                key={`midnight-${idx}`} 
                                x={idx} 
                                stroke="#1e293b" 
                                strokeWidth={2} 
                                strokeDasharray="3 3"
                                xAxisId="hours"
                            >
                                <Label 
                                    value={settings.language === 'nl' ? 'Nieuwe dag 00:00' : 'New day 00:00'} 
                                    position="insideTopLeft" 
                                    fill="#1e293b" 
                                    fontSize={11} 
                                    fontWeight="bold" 
                                    dy={40}
                                    dx={5}
                                />
                            </ReferenceLine>
                        ))}

                        {/* Min/Max Temperature Popups - Rendered last to be on top */}
                        {maxTempPoint && (
                            <ReferenceDot
                                yAxisId="temp"
                                xAxisId="hours"
                                x={maxTempPoint.index}
                                y={maxTempPoint.temp}
                                r={4}
                                fill="#ef4444"
                                stroke="#fff"
                                strokeWidth={2}
                                isFront={true}
                                label={<CustomTempPopup value={maxTempPoint.temp} color="#ef4444" position="top" />}
                            />
                        )}
                        {minTempPoint && (
                            <ReferenceDot
                                yAxisId="temp"
                                xAxisId="hours"
                                x={minTempPoint.index}
                                y={minTempPoint.temp}
                                r={4}
                                fill="#3b82f6"
                                stroke="#fff"
                                strokeWidth={2}
                                isFront={true}
                                label={<CustomTempPopup value={minTempPoint.temp} color="#3b82f6" position="bottom" />}
                            />
                        )}

                        {/* Top 1: Day Labels */}
                        <XAxis 
                            xAxisId="days"
                            dataKey="index"
                            type="category"
                            orientation="top" 
                            axisLine={false} 
                            tickLine={false} 
                            interval={0}
                            tick={CustomDayTick}
                            height={40}
                        />

                        {/* Top 2: Icons - MOVED ABOVE HOURS, fixed overlap */}
                        <XAxis 
                            xAxisId="icons"
                            dataKey="index"
                            type="category"
                            orientation="top" 
                            axisLine={false} 
                            tickLine={false}
                            interval={0}
                            tick={CustomIconTick}
                            height={35}
                        />

                        {/* Top 3: Hours - MOVED BELOW ICONS */}
                        <XAxis 
                            xAxisId="hours"
                            dataKey="index"
                            type="category"
                            orientation="top" 
                            axisLine={false} 
                            tickLine={false}
                            interval={1} // Every 2 hours
                            tick={(props) => {
                                const { x, y, payload } = props;
                                const d = chartData[payload.value];
                                return (
                                    <text x={x} y={y} dy={0} textAnchor="middle" fill="#64748b" fontSize={10} fontWeight="bold">
                                        {d ? d.hourLabel : ''}
                                    </text>
                                );
                            }}
                            height={20}
                        />

                        {/* Bottom: Wind */}
                        <XAxis 
                            xAxisId="wind" 
                            dataKey="index"
                            type="category"
                            orientation="bottom" 
                            axisLine={false} 
                            tickLine={false} 
                            interval={0}
                            tick={CustomWindTick}
                            height={showWind ? 60 : 0}
                            hide={!showWind}
                        />

                        {/* Temp Axis (Left) */}
                        <YAxis 
                            yAxisId="temp" 
                            orientation="left" 
                            tick={{ fill: '#ef4444', fontSize: 11, fontWeight: 'bold' }} 
                            ticks={tempTicks}
                            domain={[minTempFloor - 2, maxTempCeil + 2]} 
                            axisLine={false}
                            tickLine={false}
                            width={50}
                        >
                            <Label 
                                value={settings.language === 'nl' ? 'Temperatuur (°C)' : 'Temperature (°C)'} 
                                angle={-90} 
                                position="insideLeft" 
                                style={{ textAnchor: 'middle', fill: '#ef4444', fontSize: 12, fontWeight: 'bold' }} 
                                offset={-10}
                            />
                        </YAxis>

                        {/* Rain Axis (Right 1) */}
                        <YAxis 
                            yAxisId="rain" 
                            type="number"
                            orientation="right" 
                            tick={{ fill: '#3b82f6', fontSize: 10 }} 
                            axisLine={false} 
                            tickLine={false}
                            domain={[0, (dataMax: number) => Math.max(dataMax, 5)]}
                            ticks={rainTicks}
                            width={50}
                            hide={!showRain}
                        >
                            <Label 
                                value={settings.language === 'nl' ? 'Neerslag (mm)' : 'Rain (mm)'} 
                                angle={90} 
                                position="insideRight" 
                                style={{ textAnchor: 'middle', fill: '#3b82f6', fontSize: 12, fontWeight: 'bold' }} 
                                offset={-10}
                            />
                        </YAxis>

                        {/* Wind Axis (Right 2 - Hidden/Scaled) */}
                        <YAxis 
                            yAxisId="windAxis" 
                            type="number"
                            orientation="right" 
                            hide={true}
                            domain={[0, (dataMax: number) => Math.max(dataMax, windMaxY)]}
                            ticks={windTicks}
                        />

                        <Tooltip 
                            contentStyle={{ 
                                backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                                borderRadius: '8px', 
                                border: '1px solid #e2e8f0', 
                                color: '#1e293b',
                                fontSize: '12px',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                            }}
                            labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                            formatter={(value: any, name: string) => {
                                if (name === 'Temp') return [`${value}°`, settings.language === 'nl' ? 'Temperatuur' : 'Temperature'];
                                if (name === 'Wind') return [`${value} ${settings.windUnit}`, 'Wind'];
                                if (name === 'Neerslag') return [`${value} mm`, settings.language === 'nl' ? 'Neerslag' : 'Precipitation'];
                                return [value, name];
                            }}
                            labelFormatter={(idx) => {
                                const d = chartData[idx];
                                return d ? `${d.dayLabel ? d.dayLabel + ' ' : ''}${d.hourLabel}:00` : '';
                            }}
                        />

                        {/* Rain Bars */}
                        {showRain && (
                            <Bar 
                                yAxisId="rain" 
                                dataKey="precipAmount" 
                                name="Neerslag" 
                                fill="#3b82f6" 
                                fillOpacity={0.6}
                                barSize={10} 
                                radius={[2, 2, 0, 0]} 
                                xAxisId="hours"
                                minPointSize={2}
                            />
                        )}

                        {/* Wind Bars (New) */}
                        {showWind && (
                            <Bar 
                                yAxisId="windAxis" 
                                dataKey="wind" 
                                name="Wind" 
                                fill="#a855f7" 
                                fillOpacity={0.4}
                                barSize={10} 
                                radius={[2, 2, 0, 0]} 
                                xAxisId="hours"
                                minPointSize={2}
                            />
                        )}

                        {/* Temp Line */}
                        <Line 
                            yAxisId="temp" 
                            type="monotone" 
                            dataKey="temp" 
                            name="Temp" 
                            stroke="#ef4444" 
                            strokeWidth={3} 
                            dot={false} 
                            xAxisId="hours"
                            activeDot={{ r: 6, strokeWidth: 0 }}
                        />

                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Selection Controls */}
            <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                        type="checkbox" 
                        checked={showRain} 
                        onChange={() => setShowRain(!showRain)}
                        className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`text-sm font-medium ${showRain ? 'text-blue-600' : 'text-slate-400'}`}>
                        {settings.language === 'nl' ? 'Neerslag tonen' : 'Show Rain'}
                    </span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                        type="checkbox" 
                        checked={showWind} 
                        onChange={() => setShowWind(!showWind)}
                        className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className={`text-sm font-medium ${showWind ? 'text-purple-600' : 'text-slate-400'}`}>
                        {settings.language === 'nl' ? 'Wind tonen' : 'Show Wind'}
                    </span>
                </label>
            </div>

            {/* Detailed Legend */}
            <div className="grid grid-cols-3 gap-4 mt-4 px-4 pt-4 border-t border-slate-100">
                <div className="flex flex-col items-center justify-center">
                    <span className="text-xs text-slate-500 mb-1">{settings.language === 'nl' ? 'Temperatuur' : 'Temperature'}</span>
                    <div className="h-1 w-8 bg-red-500 rounded-full"></div>
                </div>
                {showWind && (
                    <div className="flex flex-col items-center justify-center">
                        <span className="text-xs text-slate-500 mb-1">Wind ({settings.windUnit})</span>
                        <div className="h-3 w-8 bg-purple-500/50 rounded-sm border border-purple-500"></div>
                    </div>
                )}
                {showRain && (
                    <div className="flex flex-col items-center justify-center">
                        <span className="text-xs text-slate-500 mb-1">{settings.language === 'nl' ? 'Neerslag' : 'Precipitation'}</span>
                        <div className="h-3 w-8 bg-blue-500/50 rounded-sm border border-blue-500"></div>
                    </div>
                )}
            </div>
        </div>
    );
};
