import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { AppSettings } from '../types';

interface Props {
  data: {
    dates: string[];
    maxTemps: (number | null)[];
  };
  settings: AppSettings;
}

// Bins and Colors aligned with HeatmapComponent.tsx
const BINS = [
    { label: '< -5°C', min: -Infinity, max: -5, color: '#000080' },
    { label: '-5 - 0°C', min: -5, max: 0, color: '#0000FF' },
    { label: '0 - 5°C', min: 0, max: 5, color: '#ADD8E6' },
    { label: '5 - 10°C', min: 5, max: 10, color: '#E0FFFF' },
    { label: '10 - 15°C', min: 10, max: 15, color: '#90EE90' },
    { label: '15 - 20°C', min: 15, max: 20, color: '#FFFF00' },
    { label: '20 - 25°C', min: 20, max: 25, color: '#FFA500' },
    { label: '25 - 30°C', min: 25, max: 30, color: '#FF4500' },
    { label: '30 - 35°C', min: 30, max: 35, color: '#FF0000' },
    { label: '35 - 40°C', min: 35, max: 40, color: '#8B0000' },
    { label: '> 40°C', min: 40, max: Infinity, color: '#4B0082' },
];

export const TemperatureDistributionChart: React.FC<Props> = ({ data, settings }) => {
    const chartData = useMemo(() => {
        // Initialize counts
        const counts = BINS.map(b => ({ ...b, count: 0 }));

        data.maxTemps.forEach(temp => {
            if (temp === null || temp === undefined) return;
            // Find bin
            const bin = counts.find(b => temp >= b.min && temp < b.max);
            if (bin) {
                bin.count++;
            }
        });

        // Ensure all bins are present for a consistent legend
        return counts;
    }, [data]);

    return (
        <div className="w-full h-[400px] flex flex-col items-center bg-bg-card rounded-2xl p-4 border border-border-color">
            <h3 className="text-lg font-bold text-text-main mb-4">Temperatuur Verdeling</h3>
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={chartData}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        stroke="none"
                        startAngle={90}
                        endAngle={-270}
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip 
                        contentStyle={{ 
                            backgroundColor: 'var(--bg-card)', 
                            borderRadius: '12px', 
                            border: '1px solid var(--border-color)', 
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            color: 'var(--text-main)'
                        }}
                        formatter={(value: number, name: string) => [`${value} dagen`, name]}
                        itemStyle={{ color: 'var(--text-main)' }}
                    />
                    <Legend 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
                        payload={chartData.map(item => ({
                            value: item.label,
                            type: 'rect',
                            id: item.label,
                            color: item.color
                        }))}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};
