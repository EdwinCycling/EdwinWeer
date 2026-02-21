
import React from 'react';
import { Icon } from './Icon';
import { determineClimateType, calculateBSI, MonthlyAverage } from '../services/climateService';
import { getTranslation } from '../services/translations';
import { AppSettings } from '../types';

interface ClimateProps {
    monthlyData: MonthlyAverage[];
    settings: AppSettings;
}

export const ClimateClassificationCard: React.FC<ClimateProps> = ({ monthlyData, settings }) => {
    const t = (key: string, params?: Record<string, string | number>) => getTranslation(key, settings.language, params);
    
    const climate = determineClimateType(monthlyData);

    // Calculate core values for display
    let maxTemp = -Infinity;
    let minTemp = Infinity;
    let minRain = Infinity;
    
    if (monthlyData && monthlyData.length > 0) {
        monthlyData.forEach(m => {
            if (m.avgTemp > maxTemp) { maxTemp = m.avgTemp; }
            if (m.avgTemp < minTemp) { minTemp = m.avgTemp; }
            if (m.totalRain < minRain) minRain = m.totalRain;
        });
    }

    const amplitude = maxTemp - minTemp;

    return (
        <div className="bg-bg-card rounded-2xl p-6 border border-border-color h-full flex flex-col justify-between relative overflow-hidden group">
            <div className="relative z-10">
                <h3 className="text-xl font-bold flex items-center gap-2 mb-2 text-text-main">
                    <Icon name="public" className="text-accent-primary" />
                    {t('climate.classification.title')}
                </h3>
                <p className="text-xs text-text-muted mb-4">{t('climate.classification.subtitle')}</p>
            </div>
            
            <div className="flex flex-col items-center justify-center py-2 text-center relative z-10 my-auto">
                <span className={`text-2xl font-black mb-2 ${climate.color || 'text-text-main'} transition-all group-hover:scale-105`}>
                    {t(climate.label)}
                </span>
                <p className="text-sm text-text-muted italic max-w-xs">
                    {t(climate.description)}
                </p>
            </div>

            <div className="mt-4 pt-4 border-t border-border-color grid grid-cols-2 gap-4 text-xs relative z-10 bg-bg-card/50 backdrop-blur-sm rounded-xl">
                 <div className="flex flex-col gap-1">
                     <span className="text-text-muted">{t('climate.temp_range')}</span>
                     <span className="font-bold">{minTemp.toFixed(1)}° - {maxTemp.toFixed(1)}°</span>
                 </div>
                 <div className="flex flex-col gap-1 text-right">
                     <span className="text-text-muted">{t('climate.season_diff')}</span>
                     <span className="font-bold">{amplitude.toFixed(1)}°</span>
                 </div>
            </div>
        </div>
    );
};

export const BaroSeasonalIndexCard: React.FC<ClimateProps> = ({ monthlyData, settings }) => {
    const t = (key: string, params?: Record<string, string | number>) => getTranslation(key, settings.language, params);
    
    const bsi = calculateBSI(monthlyData);
    
    return (
        <div className="bg-bg-card rounded-2xl p-6 border border-border-color h-full flex flex-col justify-between overflow-hidden relative group">
            <div className="relative z-10">
                <h3 className="text-xl font-bold flex items-center gap-2 mb-2 text-text-main">
                    <Icon name="waves" className="text-blue-500" />
                    {t('bsi.title')}
                </h3>
                <p className="text-xs text-text-muted mb-4">{t('bsi.subtitle')}</p>
            </div>

            <div className="relative z-10 flex flex-col items-start my-auto">
                <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black text-text-main tracking-tighter">{bsi.score.toFixed(0)}</span>
                    <span className="text-sm font-bold text-text-muted mb-1.5 opacity-60">/ 100</span>
                </div>
                <p className={`text-lg font-bold mt-1 ${
                    bsi.score < 25 ? 'text-green-500' : 
                    bsi.score < 50 ? 'text-blue-500' : 
                    bsi.score < 75 ? 'text-orange-500' : 'text-red-500'
                }`}>{t(bsi.label)}</p>
                <p className="text-xs text-text-muted">{t(bsi.description)}</p>
            </div>

            <div className="absolute bottom-0 left-0 w-full h-32 opacity-20 pointer-events-none text-blue-500 dark:text-blue-400">
                <WaveAnimation score={bsi.score} />
            </div>
        </div>
    );
};

const WaveAnimation: React.FC<{ score: number }> = ({ score }) => {
    // Determine wave properties based on score (volatility)
    // Low score = stable = calm waves
    // High score = extreme = wild waves
    
    return (
        <svg viewBox="0 0 1440 320" className="w-full h-full" preserveAspectRatio="none">
            <path fill="currentColor" fillOpacity="1" d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,261.3C960,256,1056,224,1152,197.3C1248,171,1344,149,1392,138.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>
    );
}
