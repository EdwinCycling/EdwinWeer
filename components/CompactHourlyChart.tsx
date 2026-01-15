import React from 'react';
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { AppSettings } from '../types';
import { Icon } from './Icon';
import { mapWmoCodeToIcon } from '../services/weatherService';

interface Props {
    data: any[];
    settings: AppSettings;
}

export const CompactHourlyChart: React.FC<Props> = ({ data, settings }) => {
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
            index: i // Add index for reference lines
        };
    });

    const newDayIndices = chartData.filter(d => d.dayLabel && d.index > 0).map(d => d.index);

    const CustomIconTick = (props: any) => {
        const { x, y, index } = props;
        // Show every 2 hours
        if (index % 2 !== 0) return null;
        
        const d = chartData[index];
        if (!d) return null;

        const isNight = new Date(d.timestamp).getHours() < 6 || new Date(d.timestamp).getHours() > 21;
        const icon = mapWmoCodeToIcon(d.weatherCode, isNight);

        return (
             <foreignObject x={x - 12} y={y} width={24} height={24}>
                <div className="flex items-center justify-center w-full h-full text-slate-700">
                    <Icon name={icon} className="text-2xl" />
                </div>
            </foreignObject>
        );
    };

    const CustomWindTick = (props: any) => {
        const { x, y, index } = props;
        if (index % 2 !== 0) return null;
        const d = chartData[index];
        if (!d) return null;
        
        return (
            <g transform={`translate(${x},${y})`}>
                    {/* Speed Text */}
                    <text x={0} y={0} dy={12} textAnchor="middle" fill="#334155" fontSize={11} fontWeight="bold">
                        {Math.round(d.wind)}
                    </text>
                    {/* Arrow */}
                    <g transform={`translate(0, 24) rotate(${d.windRotation})`}>
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
        <div className="w-full select-none bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="h-[450px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
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

                        <CartesianGrid strokeDasharray="3 3" vertical={false} horizontal={true} stroke="#e2e8f0" />
                        
                        {/* New Day Reference Lines */}
                        {newDayIndices.map(idx => (
                            <ReferenceLine key={`day-${idx}`} x={idx} stroke="#94a3b8" strokeDasharray="3 3" />
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
                            height={30}
                        />

                        {/* Top 2: Hours */}
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
                                    <text x={x} y={y} dy={0} textAnchor="middle" fill="#64748b" fontSize={10}>
                                        {d ? d.hourLabel : ''}
                                    </text>
                                );
                            }}
                            height={20}
                        />

                        {/* Top 3: Icons */}
                        <XAxis 
                            xAxisId="icons"
                            dataKey="index"
                            type="category"
                            orientation="top" 
                            axisLine={false} 
                            tickLine={false}
                            interval={0}
                            tick={CustomIconTick}
                            height={50}
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
                            height={50}
                        />

                        {/* Temp Axis (Left) */}
                        <YAxis 
                            yAxisId="temp" 
                            orientation="left" 
                            tick={{ fill: '#ef4444', fontSize: 11, fontWeight: 'bold' }} 
                            domain={['dataMin - 2', 'dataMax + 2']} 
                            axisLine={false}
                            tickLine={false}
                            unit="°"
                            width={30}
                        />

                        {/* Rain Axis (Right 1) */}
                        <YAxis 
                            yAxisId="rain" 
                            orientation="right" 
                            tick={{ fill: '#3b82f6', fontSize: 10 }} 
                            axisLine={false} 
                            tickLine={false}
                            domain={[0, 'auto']}
                            width={30}
                        />

                        {/* Wind Axis (Right 2 - Hidden/Scaled) */}
                        <YAxis 
                            yAxisId="windAxis" 
                            orientation="right" 
                            hide={true}
                            domain={[0, 'auto']}
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
                        <Bar 
                            yAxisId="rain" 
                            dataKey="precipAmount" 
                            name="Neerslag" 
                            fill="url(#rainGradient)" 
                            barSize={8} 
                            radius={[2, 2, 0, 0]} 
                            xAxisId="hours"
                        />

                        {/* Wind Bars (New) */}
                        <Bar 
                            yAxisId="windAxis" 
                            dataKey="wind" 
                            name="Wind" 
                            fill="url(#windGradient)" 
                            barSize={8} 
                            radius={[2, 2, 0, 0]} 
                            xAxisId="hours"
                        />

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

            {/* Detailed Legend */}
            <div className="grid grid-cols-3 gap-4 mt-2 px-4 pt-4 border-t border-slate-100">
                <div className="flex flex-col items-center justify-center">
                    <span className="text-xs text-slate-500 mb-1">{settings.language === 'nl' ? 'Temperatuur' : 'Temperature'}</span>
                    <div className="h-1 w-8 bg-red-500 rounded-full"></div>
                </div>
                <div className="flex flex-col items-center justify-center">
                    <span className="text-xs text-slate-500 mb-1">Wind ({settings.windUnit})</span>
                    <div className="h-3 w-8 bg-purple-500/50 rounded-sm border border-purple-500"></div>
                </div>
                <div className="flex flex-col items-center justify-center">
                    <span className="text-xs text-slate-500 mb-1">{settings.language === 'nl' ? 'Neerslag' : 'Precipitation'}</span>
                    <div className="h-3 w-8 bg-blue-500/50 rounded-sm border border-blue-500"></div>
                </div>
            </div>
        </div>
    );
};
