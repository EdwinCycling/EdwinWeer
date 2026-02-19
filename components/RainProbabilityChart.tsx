import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Label } from 'recharts';
import { AppSettings } from '../types';
import { getTranslation } from '../services/translations';

interface Props {
  data: {
    dates: string[];
    precip: (number | null)[];
  };
  settings: AppSettings;
}

export const RainProbabilityChart: React.FC<Props> = ({ data, settings }) => {
    const t = (key: string) => getTranslation(key, settings.language);

    const chartData = useMemo(() => {
        const monthlyRain: number[] = new Array(12).fill(0);
        
        data.precip.forEach((p, i) => {
            if (p === null || p === undefined) return;
            const date = new Date(data.dates[i]);
            const month = date.getMonth();
            monthlyRain[month] += p;
        });

        const maxRain = Math.max(...monthlyRain);
        
        const localeMap: Record<string, string> = {
            nl: 'nl-NL',
            de: 'de-DE',
            fr: 'fr-FR',
            es: 'es-ES',
            en: 'en-GB'
        };
        const locale = localeMap[settings.language] || 'en-GB';
        
        const monthNames = Array.from({length: 12}, (_, i) => {
             return new Date(2000, i, 1).toLocaleString(locale, { month: 'short' });
        });

        return monthlyRain.map((rain, i) => ({
            month: monthNames[i],
            probability: maxRain > 0 ? (rain / maxRain) * 100 : 0,
            actualRain: rain
        }));
    }, [data, settings.language]);

    return (
        <div className="w-full flex flex-col items-center bg-bg-card rounded-2xl p-4 border border-border-color">
            <h3 className="text-lg font-bold text-text-main mb-4">{t('records.rain_distribution_month')}</h3>
            <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={chartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                        <XAxis 
                            dataKey="month" 
                            stroke="var(--text-muted)" 
                            tick={{ fill: 'var(--text-muted)' }}
                            axisLine={{ stroke: 'var(--border-color)' }}
                            tickLine={{ stroke: 'var(--border-color)' }}
                        />
                        <YAxis 
                            stroke="var(--text-muted)" 
                            tick={{ fill: 'var(--text-muted)' }}
                            axisLine={{ stroke: 'var(--border-color)' }}
                            tickLine={{ stroke: 'var(--border-color)' }}
                            domain={[0, 100]}
                            unit="%"
                        >
                             <Label value={t('precipitation')} angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: 'var(--text-muted)', fontSize: 12 }} />
                        </YAxis>
                        <Tooltip
                            contentStyle={{ 
                                backgroundColor: 'var(--bg-card)', 
                                borderRadius: '12px', 
                                border: '1px solid var(--border-color)', 
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                color: 'var(--text-main)'
                            }}
                            cursor={{ fill: 'var(--bg-secondary)', opacity: 0.4 }}
                            formatter={(value: number, name: string, props: any) => [
                                `${value.toFixed(1)}% (${props.payload.actualRain.toFixed(1)} ${settings.precipUnit || 'mm'})`,
                                t('precipitation')
                            ]}
                        />
                        <Bar 
                            dataKey="probability" 
                            fill="#3b82f6" 
                            radius={[4, 4, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
