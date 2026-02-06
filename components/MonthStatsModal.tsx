import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AppSettings, Location } from '../types';
import { Icon } from './Icon';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, ReferenceArea } from 'recharts';
import { useThemeColors } from '../hooks/useThemeColors';
import { convertTemp, convertPrecip, getBeaufort } from '../services/weatherService';
import { getTranslation } from '../services/translations';

import { VisualStatsBlocks } from './VisualStatsBlocks';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    data: any;
    settings: AppSettings;
    location: Location;
}

export const MonthStatsModal: React.FC<Props> = ({ isOpen, onClose, data, settings, location }) => {
    const colors = useThemeColors();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const t = (key: string) => getTranslation(key, settings.language);
    const [viewMode, setViewMode] = React.useState<'graph' | 'visual'>('graph');

    useEffect(() => {
        const savedMode = localStorage.getItem('monthStatsViewMode');
        if (savedMode === 'graph' || savedMode === 'visual') {
            setViewMode(savedMode);
        }
    }, []);

    const handleViewModeChange = (mode: 'graph' | 'visual') => {
        setViewMode(mode);
        localStorage.setItem('monthStatsViewMode', mode);
    };

    const chartData = useMemo(() => {
        if (!data || !data.daily) return [];
        return data.daily.time.map((t: string, i: number) => {
            const sunshine = data.daily.sunshine_duration[i] || 0;
            const daylight = data.daily.daylight_duration ? data.daily.daylight_duration[i] : 0;
            const sunPercentage = daylight > 0 ? (sunshine / daylight) * 100 : 0;

            return {
                date: t,
                min: convertTemp(data.daily.temperature_2m_min[i], settings.tempUnit),
                max: convertTemp(data.daily.temperature_2m_max[i], settings.tempUnit),
                rain: convertPrecip(data.daily.precipitation_sum[i], settings.precipUnit),
                sun: sunPercentage
            };
        });
    }, [data, settings]);

    const weekendAreas = useMemo(() => {
        if (!chartData) return [];
        return chartData.map((d: any) => {
            const date = new Date(d.date);
            const day = date.getDay();
            if (day === 0 || day === 6) {
                return (
                    <ReferenceArea 
                        key={d.date} 
                        x1={d.date} 
                        x2={d.date} 
                        strokeOpacity={0} 
                        fill={day === 6 ? "#3b82f6" : "#ef4444"}
                        fillOpacity={0.15} 
                    />
                );
            }
            return null;
        });
    }, [chartData, colors]);

    useEffect(() => {
        if (isOpen && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const currentMonthName = new Date().toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'long', year: 'numeric' });

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const date = new Date(label);
            return (
                <div className="bg-bg-card p-3 rounded-xl border border-border-color shadow-xl text-xs z-[110]">
                    <p className="font-bold mb-2 border-b border-border-color pb-1 text-text-main">
                        {date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                    {payload.map((p: any) => (
                        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="text-text-muted capitalize">{p.name}:</span>
                            <span className="font-bold text-text-main">
                                {p.value.toFixed(1)} {p.unit}
                            </span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    const modalContent = (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-7xl max-h-[90vh] bg-bg-page rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-border-color">
                <div className="flex items-center justify-between p-4 border-b border-border-color shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="size-10 flex items-center justify-center rounded-full hover:bg-bg-subtle transition-colors">
                            <Icon name="arrow_back_ios_new" />
                        </button>
                        <div>
                            <h1 className="text-lg font-bold">{t('month_stats.title')}</h1>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-text-muted font-bold uppercase">{currentMonthName}</span>
                                <span className="text-xs text-text-muted opacity-50">•</span>
                                <div className="flex items-center gap-1 text-xs opacity-50">
                                    <Icon name="location_on" className="text-xs" /> {location.name}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex bg-bg-subtle rounded-lg p-1 border border-border-color">
                        <button
                            onClick={() => handleViewModeChange('graph')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                                viewMode === 'graph' 
                                    ? 'bg-bg-card text-primary shadow-sm' 
                                    : 'text-text-muted hover:text-text-main'
                            }`}
                        >
                            <Icon name="analytics" className="text-sm" />
                            {t('month_stats.graph') || 'Grafiek'}
                        </button>
                        <button
                            onClick={() => handleViewModeChange('visual')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                                viewMode === 'visual' 
                                    ? 'bg-bg-card text-primary shadow-sm' 
                                    : 'text-text-muted hover:text-text-main'
                            }`}
                        >
                            <Icon name="grid_view" className="text-sm" />
                            {t('month_stats.visual') || 'Visueel'}
                        </button>
                    </div>
                </div>

                <div ref={scrollContainerRef} className="p-4 overflow-y-auto flex-grow bg-bg-page/50" style={{ overscrollBehavior: 'contain' }}>
                    {viewMode === 'graph' ? (
                        <div className="space-y-6">
                            <div className="bg-bg-card rounded-2xl p-4 border border-border-color">
                                <h3 className="text-lg font-bold mb-4 text-text-main flex items-center gap-2">
                                    <Icon name="thermostat" className="text-red-500" />
                                    Temperatuur
                                </h3>
                                <div className="h-[200px] md:h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                                </linearGradient>
                                                <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.borderColor} />
                                            <XAxis 
                                                dataKey="date" 
                                                tick={{fill: colors.textMuted, fontSize: 10}} 
                                                tickLine={false} 
                                                axisLine={false} 
                                                tickFormatter={(val) => new Date(val).getDate().toString()}
                                            />
                                            <YAxis tick={{fill: colors.textMuted, fontSize: 10}} tickLine={false} axisLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            {weekendAreas}
                                            <Area type="monotone" dataKey="max" name="Max" unit="°" stroke="#ef4444" fillOpacity={1} fill="url(#colorMax)" strokeWidth={2} />
                                            <Area type="monotone" dataKey="min" name="Min" unit="°" stroke="#3b82f6" fillOpacity={1} fill="url(#colorMin)" strokeWidth={2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-bg-card rounded-2xl p-4 border border-border-color">
                                <h3 className="text-lg font-bold mb-4 text-text-main flex items-center gap-2">
                                    <Icon name="rainy" className="text-blue-500" />
                                    Neerslag
                                </h3>
                                <div className="h-[180px] md:h-[250px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.borderColor} />
                                            <XAxis 
                                                dataKey="date" 
                                                tick={{fill: colors.textMuted, fontSize: 10}} 
                                                tickLine={false} 
                                                axisLine={false} 
                                                tickFormatter={(val) => new Date(val).getDate().toString()}
                                            />
                                            <YAxis tick={{fill: colors.textMuted, fontSize: 10}} tickLine={false} axisLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            {weekendAreas}
                                            <Bar dataKey="rain" name="Neerslag" unit={settings.precipUnit} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-bg-card rounded-2xl p-4 border border-border-color">
                                <h3 className="text-lg font-bold mb-4 text-text-main flex items-center gap-2">
                                    <Icon name="wb_sunny" className="text-yellow-500" />
                                    Zon (% van daglicht)
                                </h3>
                                <div className="h-[180px] md:h-[250px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.borderColor} />
                                            <XAxis 
                                                dataKey="date" 
                                                tick={{fill: colors.textMuted, fontSize: 10}} 
                                                tickLine={false} 
                                                axisLine={false} 
                                                tickFormatter={(val) => new Date(val).getDate().toString()}
                                            />
                                            <YAxis tick={{fill: colors.textMuted, fontSize: 10}} tickLine={false} axisLine={false} domain={[0, 100]} />
                                            <Tooltip content={<CustomTooltip />} />
                                            {weekendAreas}
                                            <Bar dataKey="sun" name="Zon" unit="%" fill="#eab308" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col bg-bg-card rounded-2xl p-4 md:p-8 border border-border-color overflow-hidden">
                             {/* Visual View */}
                             <VisualStatsBlocks 
                                data={data.daily}
                                settings={settings}
                             />
                             
                             <div className="mt-4 p-4 bg-bg-subtle rounded-xl text-xs text-text-muted flex flex-wrap gap-4 justify-center w-full">
                                 <p className="flex items-center gap-1 w-full justify-center text-center font-bold mb-1"><Icon name="info" className="text-sm"/> {t('month_stats.visual.explanation_title')}</p>
                                 <p className="text-center opacity-80 leading-relaxed max-w-4xl">{t('month_stats.visual.explanation_legend')}</p>
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};
