import React, { useState } from 'react';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';
import { AppLanguage } from '../types';

interface HumidexCardProps {
    currentTemp: number; // Celsius
    maxTemp: number; // Celsius
    currentDewPoint: number; // Celsius
    maxDewPoint: number; // Celsius (estimated)
    tempUnit: 'C' | 'F';
    language: AppLanguage;
}

export const HumidexCard: React.FC<HumidexCardProps> = ({ 
    currentTemp, 
    maxTemp, 
    currentDewPoint, 
    maxDewPoint,
    tempUnit,
    language
}) => {
    const t = (key: string) => getTranslation(key, language);
    const [isOpen, setIsOpen] = useState(false);

    // Calculate Humidex
    // Formula: H = Tair + 5/9 * (6.11 * e^(5417.7530 * (1/273.16 - 1/(273.15 + Tdew))) - 10)
    const calculateHumidex = (temp: number, dew: number): number => {
        const kelvin = 273.15;
        const term = 5417.7530 * ((1/273.16) - (1/(kelvin + dew)));
        const e = 6.11 * Math.exp(term);
        const humidex = temp + (5/9) * (e - 10);
        return Math.round(humidex);
    };

    const currentHumidex = calculateHumidex(currentTemp, currentDewPoint);
    const displayHumidex = tempUnit === 'F' ? Math.round(currentHumidex * 9/5 + 32) : currentHumidex;

    const getStatus = (h: number) => {
        if (h < 30) return { text: t('humidex.little_discomfort'), color: 'text-green-500' };
        if (h < 40) return { text: t('humidex.some_discomfort'), color: 'text-yellow-500' };
        if (h < 46) return { text: t('humidex.great_discomfort'), color: 'text-orange-500' };
        return { text: t('humidex.dangerous'), color: 'text-red-500' };
    };

    // Check if values are within map range
    const isTempInRange = (t: number) => t >= 15 && t <= 43;
    const isDewInRange = (d: number) => d >= 10 && d <= 28;

    const isCurrentOnMap = isTempInRange(Math.round(currentTemp)) && isDewInRange(Math.round(currentDewPoint));
    const isMaxOnMap = isTempInRange(Math.round(maxTemp)) && isDewInRange(Math.round(maxDewPoint));

    // If Max is not on map, don't show component (as per request "als waarde niet op kaart voorkomt, de kaart niet laten zien")
    // We prioritize Max because the alert is about the day's forecast.
    if (!isMaxOnMap) return null;

    const status = getStatus(currentHumidex);

    const temps = Array.from({length: 43 - 15 + 1}, (_, i) => 15 + i);
    const dews = Array.from({length: 28 - 10 + 1}, (_, i) => 10 + i);

    // Highlight coordinates
    const curT = Math.round(currentTemp);
    const curD = Math.round(currentDewPoint);
    const maxT = Math.round(maxTemp);
    const maxD = Math.round(maxDewPoint);

    return (
        <div className="bg-bg-card rounded-2xl border border-border-color shadow-sm overflow-hidden mb-4">
             <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-bg-card/80 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="bg-orange-500/10 p-2 rounded-lg">
                        <Icon name="thermostat" className="text-orange-500" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm">{t('humidex.title')}</h3>
                        {!isOpen && (
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className={`font-bold text-lg ${status.color}`}>
                                        {displayHumidex}{tempUnit === 'F' ? '' : ''}
                                    </span>
                                    <span className="text-xs text-text-muted">
                                        {status.text}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <Icon name={isOpen ? "expand_less" : "expand_more"} className="text-text-muted" />
            </div>

            {isOpen && (
                <div className="p-4 pt-0 border-t border-border-color/50 animate-in slide-in-from-top-2 fade-in duration-300">
                    <div className="mt-4 overflow-x-auto">
                        <div className="min-w-[600px] text-[10px] select-none">
                            {/* Header Row (Temps) */}
                            <div className="flex">
                                <div className="w-12 shrink-0 flex items-center justify-center font-bold text-text-muted bg-bg-page/50">
                                    Dew \ T
                                </div>
                                {temps.map(t => (
                                    <div key={t} className="w-8 shrink-0 flex items-center justify-center font-bold bg-bg-page/50 border-b border-border-color py-1">
                                        {t}
                                    </div>
                                ))}
                            </div>

                            {/* Grid Rows */}
                            {dews.map(d => (
                                <div key={d} className="flex">
                                    <div className="w-12 shrink-0 flex items-center justify-center font-bold bg-bg-page/50 border-r border-border-color px-1">
                                        {d}
                                    </div>
                                    {temps.map(t => {
                                        const h = calculateHumidex(t, d);
                                        let cellClass = "";
                                        if (h < 30) cellClass = "bg-green-500 text-white";
                                        else if (h < 40) cellClass = "bg-yellow-400 text-black";
                                        else if (h < 46) cellClass = "bg-orange-500 text-white";
                                        else cellClass = "bg-red-600 text-white";

                                        // Check highlights
                                        const isCurrent = t === curT && d === curD;
                                        const isMax = t === maxT && d === maxD;

                                        return (
                                            <div key={t} className={`w-8 h-8 shrink-0 flex items-center justify-center border-[0.5px] border-white/20 relative ${cellClass}`}>
                                                {h}
                                                {isCurrent && (
                                                    <div className="absolute inset-0 border-[3px] border-blue-600 bg-blue-600/20 rounded-full z-10 animate-pulse shadow-[0_0_10px_rgba(37,99,235,0.8)]"></div>
                                                )}
                                                {isMax && (
                                                    <div className="absolute inset-0 border-[3px] border-purple-800 bg-purple-800/20 rounded-full z-10 shadow-[0_0_10px_rgba(107,33,168,0.8)]"></div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-text-muted bg-bg-page/30 p-3 rounded-xl">
                        {isCurrentOnMap && (
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full border-[3px] border-blue-600 bg-blue-600/20"></div>
                                <span>
                                    Nu ({Math.round(currentTemp)}°C, Dew {Math.round(currentDewPoint)}°C)
                                    <span className="font-bold ml-1">- Index: {tempUnit === 'F' ? Math.round(currentHumidex * 9/5 + 32) : currentHumidex}</span>
                                </span>
                            </div>
                        )}
                         <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full border-[3px] border-purple-800 bg-purple-800/20"></div>
                            <span>
                                Max ({Math.round(maxTemp)}°C, Dew {Math.round(maxDewPoint)}°C)
                                <span className="font-bold ml-1">- Index: {tempUnit === 'F' ? Math.round(calculateHumidex(maxTemp, maxDewPoint) * 9/5 + 32) : calculateHumidex(maxTemp, maxDewPoint)}</span>
                            </span>
                        </div>
                    </div>

                     <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-green-500 rounded"></div>
                            <span>20-29: {t('humidex.little_discomfort')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-yellow-400 rounded"></div>
                            <span>30-39: {t('humidex.some_discomfort')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-orange-500 rounded"></div>
                            <span>40-45: {t('humidex.great_discomfort')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-red-600 rounded"></div>
                            <span>&gt; 45: {t('humidex.dangerous')}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
