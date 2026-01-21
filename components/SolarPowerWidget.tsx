import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { AppSettings } from '../types';
import { getTranslation } from '../services/translations';

interface Props {
    weatherData: any;
    settings: AppSettings;
    targetDate?: Date;
    showStats?: boolean;
}

export const SolarPowerWidget: React.FC<Props> = ({ weatherData, settings, targetDate, showStats = true }) => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (!weatherData || !weatherData.hourly || !weatherData.hourly.shortwave_radiation) {
        return null;
    }

    if (settings.enableSolar === false) return null;

    const t = (key: string) => getTranslation(key, settings.language);

    // 1. Data Preparation
    const now = new Date();
    // Use targetDate if provided, otherwise use now. 
    // If targetDate is provided, we treat it as "current" for data selection purposes, 
    // but we only show "current time" line if it's actually today.
    const displayDate = targetDate || now;
    const isToday = displayDate.getDate() === now.getDate() && 
                    displayDate.getMonth() === now.getMonth() && 
                    displayDate.getFullYear() === now.getFullYear();

    const currentHour = now.getHours(); // Always use real current hour for "NU" line
    
    // Find index for displayDate 06:00
    const timeArray = weatherData.hourly.time;
    const radArray = weatherData.hourly.shortwave_radiation;
    
    // For advice, we need a specific value. 
    // If it's today, we use current hour.
    // If it's another day, maybe use max value or noon?
    // Let's stick to current hour if today, otherwise max value of the day.
    
    let adviceWatts = 0;

    if (isToday) {
        // Find current index
        const currentIndex = timeArray.findIndex((t: string) => {
            const d = new Date(t);
            return d.getDate() === now.getDate() && d.getHours() === currentHour;
        });
        if (currentIndex !== -1) adviceWatts = radArray[currentIndex];
    } else {
        // Find max for that day
        const dayStr = displayDate.toISOString().split('T')[0];
        let maxW = 0;
        for (let i = 0; i < timeArray.length; i++) {
            if (timeArray[i].startsWith(dayStr)) {
                if (radArray[i] > maxW) maxW = radArray[i];
            }
        }
        adviceWatts = maxW;
    }

    // Helper for advice
    const getSolarAdvice = (watts: number) => {
        if (watts >= 500) return { 
            text: isToday ? t('solar.advice.free_power_today') : t('solar.advice.high_forecast'), 
            color: "text-green-400", 
            icon: "bolt", 
            bgColor: "bg-green-900/20",
            borderColor: "border-green-500/30"
        };
        if (watts >= 200) return { 
            text: isToday ? t('solar.advice.good_yield_today') : t('solar.advice.good_day_forecast'), 
            color: "text-yellow-400", 
            icon: "wb_sunny",
            bgColor: "bg-yellow-900/20",
            borderColor: "border-yellow-500/30"
        };
        if (watts >= 50) return { 
            text: isToday ? t('solar.advice.moderate_yield_today') : t('solar.advice.moderate_energy'), 
            color: "text-orange-400", 
            icon: "cloud_queue",
            bgColor: "bg-orange-900/20",
            borderColor: "border-orange-500/30"
        };
        return { 
            text: isToday ? t('solar.advice.low_sun_today') : t('solar.advice.low_energy_forecast'), 
            color: "text-blue-400", 
            icon: "nightlight_round",
            bgColor: "bg-blue-900/20",
            borderColor: "border-blue-500/30"
        };
    };

    const advice = getSolarAdvice(adviceWatts);

    // 3. Chart Data (06:00 - 22:00 for the target day)
    const targetDayStr = displayDate.toISOString().split('T')[0];
    const chartData = [];
    
    let totalWattsToday = 0;
    let receivedWattsSoFar = 0;

    for (let i = 0; i < timeArray.length; i++) {
        if (timeArray[i].startsWith(targetDayStr)) {
            const date = new Date(timeArray[i]);
            const h = date.getHours();
            
            // Collect data for relevant hours
            if (h >= 6 && h <= 22) {
                const w = radArray[i];
                chartData.push({
                    time: h.toString().padStart(2, '0') + ':00',
                    watts: w,
                    isCurrent: isToday && h === currentHour
                });

                totalWattsToday += w;
                if (isToday && h <= currentHour) {
                    receivedWattsSoFar += w;
                }
            }
        }
    }

    const remainingWatts = totalWattsToday - receivedWattsSoFar;
    const percentReceived = totalWattsToday > 0 ? Math.round((receivedWattsSoFar / totalWattsToday) * 100) : 0;
    const percentRemaining = 100 - percentReceived;

    // Y-Axis Logic
    const maxWatts = Math.max(...chartData.map(d => d.watts), 0);
    const useFixedScale = maxWatts <= 600;
    const fixedTicks = [0, 50, 100, 200, 300, 400, 500, 600];

    return (
        <div className={`mb-8 p-4 rounded-2xl border shadow-sm backdrop-blur-md transition-all ${advice.borderColor} ${advice.bgColor}`}>
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-full ${advice.bgColor} border border-white/10`}>
                         <Icon name={advice.icon} className={`${advice.color} text-xl`} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-text-main">{t('solar.title')}</h3>
                        <p className="text-xs text-text-muted">{isToday ? t('solar.check') : t('solar.forecast')}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className={`text-2xl font-black ${advice.color}`}>{Math.round(adviceWatts)}</p>
                    <p className="text-[10px] font-bold text-text-muted uppercase">{t('solar.unit')} {isToday ? `(${t('solar.now')})` : `(${t('solar.max')})`}</p>
                </div>
            </div>

            {/* Advice Text */}
            <div className="mb-4 bg-bg-page/40 p-3 rounded-xl border border-white/5">
                <p className="text-sm font-medium text-text-main">{advice.text}</p>
                {showStats && isToday && (
                    <div className="mt-2 flex gap-4 text-xs text-text-muted">
                        <div>
                            <span className="block font-bold text-text-main">{percentReceived}%</span>
                            {t('solar.received')}
                        </div>
                        <div>
                            <span className="block font-bold text-text-main">{percentRemaining}%</span>
                            {t('solar.expected')}
                        </div>
                    </div>
                )}
            </div>

            {/* Chart */}
            <div className="h-48 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="solarFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                        <XAxis 
                            dataKey="time" 
                            tick={{fill: '#94a3b8', fontSize: 10}} 
                            axisLine={false} 
                            tickLine={false} 
                            interval={isMobile ? 1 : 0} 
                        />
                        <YAxis 
                            tick={{fill: '#94a3b8', fontSize: 10}} 
                            axisLine={false} 
                            tickLine={false}
                            domain={useFixedScale ? [0, 600] : [0, 'auto']}
                            ticks={useFixedScale ? fixedTicks : undefined}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(value: any) => [`${value} ${t('solar.unit')}`, t('solar.radiation')]}
                            labelStyle={{ color: '#94a3b8' }}
                        />
                        <ReferenceLine y={50} stroke="#fb923c" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "50", position: 'insideLeft', fill: '#fb923c', fontSize: 10 }} />
                        <ReferenceLine y={200} stroke="#facc15" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "200", position: 'insideLeft', fill: '#facc15', fontSize: 10 }} />
                        <ReferenceLine y={500} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: "500", position: 'insideLeft', fill: '#ef4444', fontSize: 10 }} />
                        
                        {isToday && (
                            <ReferenceLine 
                                x={`${currentHour.toString().padStart(2, '0')}:00`} 
                                stroke="#fff" 
                                strokeDasharray="3 3" 
                                strokeOpacity={0.8}
                                strokeWidth={2}
                                label={{ value: t('solar.now'), position: 'insideTop', fill: '#fff', fontSize: 10, fontWeight: 'bold' }} 
                            />
                        )}
                        
                        <Area 
                            type="monotone" 
                            dataKey="watts" 
                            stroke="#f59e0b" 
                            fill="url(#solarFill)" 
                            strokeWidth={2} 
                            filter={settings.theme === 'dark' ? 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.5))' : ''}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
