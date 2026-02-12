import React, { useState } from 'react';
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Label, ReferenceDot } from 'recharts';
import { AppSettings, WindUnit } from '../types';
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

export const CompactHourlyChart = React.memo(({ data, settings }: Props) => {
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

    // Fix axes scales
    const rainMaxData = Math.max(...chartData.map(d => d.precipAmount || 0));
    const rainMaxY = Math.max(rainMaxData, 5);
    const rainTicks = rainMaxY <= 5 ? [0, 1, 2, 3, 4, 5] : undefined;

    const windMaxData = Math.max(...chartData.map(d => d.wind || 0));
    const getWindMax = (unit: WindUnit) => {
        switch (unit) {
            case WindUnit.BFT: return 12;
            case WindUnit.MS: return 33;
            case WindUnit.MPH: return 74;
            case WindUnit.KNOTS: return 64;
            case WindUnit.KMH:
            default: return 118;
        }
    };
    const windTargetMax = getWindMax(settings.windUnit);
    let windMaxY = Math.max(windMaxData, windTargetMax);
    
    // Ensure minimum scale for Bft
    if (settings.windUnit === WindUnit.BFT) {
        // User requested max 12 Bft
        windMaxY = Math.max(windMaxData, 12);
    }

    // Dynamic ticks for Bft
    let windTicks: number[] | undefined = undefined;
    if (settings.windUnit === WindUnit.BFT) {
        // Create ticks: 0, 1, 2, ... up to windMaxY (User requested whole Bfts)
        windTicks = [];
        for (let i = 0; i <= windMaxY; i += 1) {
            windTicks.push(i);
        }
    }

    // Use isNewDay for vertical lines to be more robust than just hour 0
    const dayBoundaryIndices = chartData.filter(d => d.dayLabel).map(d => d.index);

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

    return (
        <div className="w-full max-w-full select-none bg-white rounded-xl p-2 md:p-4 shadow-sm border border-slate-200 overflow-hidden">
            <div className="h-[480px] w-full min-w-0">
                <ResponsiveContainer width="99%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 40, right: 60, left: 10, bottom: 20 }}>
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
                                xAxisId="wind"
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
                        {dayBoundaryIndices.map(idx => (
                            <ReferenceLine 
                                key={`midnight-${idx}`} 
                                x={idx} 
                                stroke="#1e293b" 
                                strokeWidth={2} 
                                strokeDasharray="3 3"
                                xAxisId="wind"
                            >
                                <Label 
                                    value={settings.language === 'nl' ? 'Nieuwe dag' : 'New day'} 
                                    position="insideTopLeft" 
                                    fill="#1e293b" 
                                    fontSize={11} 
                                    fontWeight="bold" 
                                    dy={40}
                                    dx={5}
                                />
                            </ReferenceLine>
                        ))}

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

                        {/* Bottom: Wind & Base Axis */}
                        <XAxis 
                            xAxisId="wind" 
                            dataKey="index"
                            type="category"
                            orientation="bottom" 
                            axisLine={false} 
                            tickLine={false} 
                            interval={0}
                            tick={showWind ? CustomWindTick : () => null}
                            height={showWind ? 60 : 5}
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
                            domain={[0, rainMaxY]}
                            ticks={rainTicks}
                            width={40}
                            hide={!showRain}
                        >
                            <Label 
                                value={settings.language === 'nl' ? 'Regen' : 'Rain'} 
                                angle={90} 
                                position="insideRight" 
                                style={{ textAnchor: 'middle', fill: '#3b82f6', fontSize: 10, fontWeight: 'bold' }} 
                                offset={10}
                            />
                        </YAxis>

                        {/* Wind Axis (Right 2) */}
                        <YAxis 
                            yAxisId="windAxis" 
                            type="number"
                            orientation="right" 
                            tick={{ fill: '#a855f7', fontSize: 10 }} 
                            axisLine={false} 
                            tickLine={false}
                            domain={[0, windMaxY]}
                            ticks={windTicks}
                            width={40}
                            hide={!showWind}
                        >
                            <Label 
                                value={settings.language === 'nl' ? 'Wind' : 'Wind'} 
                                angle={90} 
                                position="insideRight" 
                                style={{ textAnchor: 'middle', fill: '#a855f7', fontSize: 10, fontWeight: 'bold' }} 
                                offset={10}
                            />
                        </YAxis>

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
                                fillOpacity={0.5}
                                stroke="#3b82f6"
                                strokeWidth={1}
                                barSize={10} 
                                radius={[2, 2, 0, 0]} 
                                xAxisId="wind"
                            />
                        )}

                        {/* Wind Bars (New) */}
                        {showWind && (
                            <Bar 
                                yAxisId="windAxis" 
                                dataKey="wind" 
                                name="Wind" 
                                fill="#a855f7" 
                                fillOpacity={0.5}
                                stroke="#a855f7"
                                strokeWidth={1}
                                barSize={10} 
                                radius={[2, 2, 0, 0]} 
                                xAxisId="wind"
                                minPointSize={5}
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
                            xAxisId="wind"
                            activeDot={{ r: 6, strokeWidth: 0 }}
                        />

                        {/* Min/Max Temperature Popups - Rendered last to be on top and correctly positioned */}
                        {maxTempPoint && (
                            <ReferenceDot
                                yAxisId="temp"
                                xAxisId="wind"
                                x={maxTempPoint.index}
                                y={maxTempPoint.temp}
                                r={5}
                                fill="#ef4444"
                                stroke="#fff"
                                strokeWidth={2}
                                // @ts-ignore
                                isFront={true as any}
                                label={({ x, y }: any) => {
                                    if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) return null;
                                    return (
                                        <g transform={`translate(${x},${y})`}>
                                            <rect x="-20" y="-32" width="40" height="22" rx="6" fill="#ef4444" stroke="#fff" strokeWidth={2} />
                                            <text x="0" y="-17" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold">
                                                {maxTempPoint.temp}°
                                            </text>
                                        </g>
                                    );
                                }}
                            />
                        )}
                        {minTempPoint && (
                            <ReferenceDot
                                yAxisId="temp"
                                xAxisId="wind"
                                x={minTempPoint.index}
                                y={minTempPoint.temp}
                                r={5}
                                fill="#3b82f6"
                                stroke="#fff"
                                strokeWidth={2}
                                // @ts-ignore
                                isFront={true as any}
                                label={({ x, y }: any) => {
                                    if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) return null;
                                    return (
                                        <g transform={`translate(${x},${y})`}>
                                            <rect x="-20" y="10" width="40" height="22" rx="6" fill="#3b82f6" stroke="#fff" strokeWidth={2} />
                                            <text x="0" y="25" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold">
                                                {minTempPoint.temp}°
                                            </text>
                                        </g>
                                    );
                                }}
                            />
                        )}

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
});
