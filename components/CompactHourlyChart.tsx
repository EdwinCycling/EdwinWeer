import React from 'react';
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
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
        
        // Logic to show day label only at start of new day or very first item
        // We check if previous data point had different day
        const prevDate = i > 0 ? new Date(data[i-1].timestamp) : null;
        const isNewDay = !prevDate || date.getDate() !== prevDate.getDate();
        
        const hour = date.getHours();
        const hourLabel = hour.toString().padStart(2, '0');

        return {
            ...d,
            dayLabel: isNewDay ? dayName : '',
            hourLabel,
            // For wind arrow rotation
            windRotation: d.windDir + 180
        };
    });

    const CustomIconTick = (props: any) => {
        const { x, y, payload, index } = props;
        // Show every 2 hours
        if (index % 2 !== 0) return null;
        
        const d = chartData[index];
        if (!d) return null;

        const isNight = new Date(d.timestamp).getHours() < 6 || new Date(d.timestamp).getHours() > 21;
        const icon = mapWmoCodeToIcon(d.weatherCode, isNight);

        return (
             <foreignObject x={x - 12} y={y} width={24} height={24}>
                <div className="flex items-center justify-center w-full h-full text-white">
                    <Icon name={icon} className="text-xl" />
                </div>
            </foreignObject>
        );
    };

    const CustomWindTick = (props: any) => {
        const { x, y, payload, index } = props;
        if (index % 2 !== 0) return null;
        const d = chartData[index];
        if (!d) return null;
        
        return (
            <g transform={`translate(${x},${y})`}>
                    {/* Speed Text */}
                    <text x={0} y={0} dy={12} textAnchor="middle" fill="#f8fafc" fontSize={10} fontWeight="bold">
                        {Math.round(d.wind)}
                    </text>
                    {/* Arrow */}
                    <g transform={`translate(0, -8) rotate(${d.windRotation})`}>
                         <path d="M0,0 L-3,-5 L0,-3 L3,-5 Z" fill="#e879f9" />
                    </g>
                </g>
        );
    };

    const CustomDayTick = (props: any) => {
        const { x, y, payload, index } = props;
        const d = chartData[index];
        if (!d || !d.dayLabel) return null;

        return (
            <text x={x} y={y} dy={16} textAnchor="start" fill="#ffffff" fontSize={12} fontWeight="bold">
                {d.dayLabel}
            </text>
        );
    };

    return (
        <div className="w-full h-[400px] select-none bg-white dark:bg-slate-900/50 rounded-xl p-2 text-white">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke="rgba(255,255,255,0.15)" />
                    
                    {/* Top 1: Day Labels */}
                    <XAxis 
                        xAxisId="days"
                        dataKey="dayLabel" 
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
                        dataKey="hourLabel" 
                        orientation="top" 
                        axisLine={false} 
                        tickLine={false}
                        interval={1} // Every 2 hours
                        tick={{ fill: '#e2e8f0', fontSize: 10 }}
                        height={20}
                    />

                    {/* Top 3: Icons */}
                    <XAxis 
                        xAxisId="icons"
                        dataKey="hourLabel" 
                        orientation="top" 
                        axisLine={false} 
                        tickLine={false}
                        interval={0}
                        tick={CustomIconTick}
                        height={40}
                    />

                    {/* Bottom: Wind */}
                    <XAxis 
                        xAxisId="wind" 
                        orientation="bottom" 
                        axisLine={false} 
                        tickLine={false} 
                        interval={0}
                        tick={CustomWindTick}
                        height={40}
                    />

                    {/* Temp Axis (Left) */}
                    <YAxis 
                        yAxisId="temp" 
                        orientation="left" 
                        tick={{ fill: '#f87171', fontSize: 10 }} 
                        domain={['auto', 'auto']} 
                        axisLine={false}
                        tickLine={false}
                        unit="°"
                        width={30}
                    />

                    {/* Rain/Wind Axis (Right) */}
                    <YAxis 
                        yAxisId="secondary" 
                        orientation="right" 
                        tick={{ fill: '#60a5fa', fontSize: 10 }} 
                        axisLine={false} 
                        tickLine={false}
                        domain={[0, 'auto']}
                        width={30}
                    />

                    <Tooltip 
                        contentStyle={{ 
                            backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                            borderRadius: '12px', 
                            border: '1px solid rgba(255,255,255,0.1)', 
                            color: '#fff',
                            fontSize: '12px'
                        }}
                        labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                        formatter={(value: any, name: string) => {
                            if (name === 'Temp') return [`${value}°`, settings.language === 'nl' ? 'Temperatuur' : 'Temperature'];
                            if (name === 'Wind') return [`${value} ${settings.windUnit}`, 'Wind'];
                            if (name === 'Neerslag') return [`${value} mm`, settings.language === 'nl' ? 'Neerslag' : 'Precipitation'];
                            return [value, name];
                        }}
                        labelFormatter={(label) => {
                             // Find item by label is hard if we don't have index.
                             // Recharts passes label (hourLabel).
                             return label; 
                        }}
                    />

                    {/* Rain Bars */}
                    <Bar 
                        yAxisId="secondary" 
                        dataKey="precipAmount" 
                        name="Neerslag" 
                        fill="#60a5fa" 
                        barSize={6} 
                        radius={[2, 2, 0, 0]} 
                        xAxisId="hours"
                    />

                    {/* Wind Line (Purple) */}
                    <Line 
                        yAxisId="secondary" 
                        type="monotone" 
                        dataKey="wind" 
                        name="Wind" 
                        stroke="#e879f9" 
                        strokeWidth={2} 
                        dot={false} 
                        xAxisId="hours"
                    />

                    {/* Temp Line (Red) */}
                    <Line 
                        yAxisId="temp" 
                        type="monotone" 
                        dataKey="temp" 
                        name="Temp" 
                        stroke="#f87171" 
                        strokeWidth={3} 
                        dot={false} 
                        xAxisId="hours"
                    />

                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};
