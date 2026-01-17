import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { AppSettings } from '../types';

interface Props {
  data: (number | null)[];
  title: string;
  settings: AppSettings;
}

const BINS = [
    { min: -Infinity, max: -5, color: '#000080' },
    { min: -5, max: 0, color: '#0000FF' },
    { min: 0, max: 5, color: '#ADD8E6' },
    { min: 5, max: 10, color: '#E0FFFF' },
    { min: 10, max: 15, color: '#90EE90' },
    { min: 15, max: 20, color: '#FFFF00' },
    { min: 20, max: 25, color: '#FFA500' },
    { min: 25, max: 30, color: '#FF4500' },
    { min: 30, max: 35, color: '#FF0000' },
    { min: 35, max: 40, color: '#8B0000' },
    { min: 40, max: Infinity, color: '#4B0082' },
];

const getColorForTemp = (temp: number) => {
    const bin = BINS.find(b => temp >= b.min && temp < b.max);
    return bin ? bin.color : '#ccc';
};

export const TemperatureFrequencyChart: React.FC<Props> = ({ data, title, settings }) => {
    const chartData = useMemo(() => {
        const validTemps = data.filter((t): t is number => t !== null && t !== undefined).map(Math.round);
        if (validTemps.length === 0) return [];

        const minTemp = Math.min(...validTemps);
        const maxTemp = Math.max(...validTemps);

        const frequencyMap: Record<number, number> = {};
        for (let t = minTemp; t <= maxTemp; t++) {
            frequencyMap[t] = 0;
        }

        validTemps.forEach(t => {
            frequencyMap[t]++;
        });

        return Object.entries(frequencyMap)
            .map(([temp, count]) => ({
                temp: parseInt(temp),
                count,
                color: getColorForTemp(parseInt(temp))
            }))
            .sort((a, b) => a.temp - b.temp);
    }, [data]);

    return (
        <div className="w-full flex flex-col items-center bg-bg-card rounded-2xl p-4 border border-border-color">
            <h3 className="text-lg font-bold text-text-main mb-4">{title}</h3>
            <div className="w-full h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                        <XAxis 
                            type="number"
                            stroke="var(--text-muted)" 
                            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                            axisLine={{ stroke: 'var(--border-color)' }}
                            tickLine={{ stroke: 'var(--border-color)' }}
                        />
                        <YAxis 
                            dataKey="temp" 
                            type="category"
                            stroke="var(--text-muted)" 
                            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                            axisLine={{ stroke: 'var(--border-color)' }}
                            tickLine={{ stroke: 'var(--border-color)' }}
                            unit="°C"
                        />
                        <Tooltip
                            contentStyle={{ 
                                backgroundColor: 'var(--bg-card)', 
                                borderRadius: '12px', 
                                border: '1px solid var(--border-color)', 
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                color: 'var(--text-main)'
                            }}
                            cursor={{ fill: 'var(--bg-secondary)', opacity: 0.4 }}
                            formatter={(value: number) => [`${value} dagen`, 'Frequentie']}
                            labelFormatter={(label) => `${label}°C`}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
