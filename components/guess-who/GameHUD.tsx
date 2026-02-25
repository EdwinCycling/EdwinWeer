
import React, { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { AppSettings } from '../../types';
import { convertPressure, convertPrecip, convertTemp, convertWind, getTempLabel, getWindUnitLabel } from '../../services/weatherService';
import { getCountryDisplayName } from '../../services/countries';

interface GameHUDProps {
    timeLeft: number;
    questionsCount: number;
    onAskQuestion: (param: string, operator: string, value: string) => void;
    remainingCards: number;
    onGuessTarget: () => void;
    gameStatus: 'playing' | 'won' | 'lost';
    targetCity?: {
        name: string;
        country: string;
    };
    targetWeather?: {
        tempMax: number;
        tempMin: number;
        rainSum: number;
        sunPct: number;
        windMax: number;
        pressure: number;
    };
    guessedCity?: {
        name: string;
        country: string;
    };
    onRestart: () => void;
    onExit: () => void;
    settings: AppSettings;
    onResetCamera?: () => void;
}

const OPERATORS = [
    { key: '>', label: 'Hoger dan' },
    { key: '<', label: 'Lager dan' },
    { key: '=', label: 'Gelijk aan' }
];

export const GameHUD: React.FC<GameHUDProps> = ({ 
    timeLeft, 
    questionsCount, 
    onAskQuestion, 
    remainingCards,
    onGuessTarget,
    gameStatus,
    targetCity,
    targetWeather,
    guessedCity,
    onRestart,
    onExit,
    settings,
    onResetCamera
}) => {
    const parameters = useMemo(() => ([
        { key: 'tempMax', label: 'Max temp', unit: getTempLabel(settings.tempUnit) },
        { key: 'tempMin', label: 'Min temp', unit: getTempLabel(settings.tempUnit) },
        { key: 'rainSum', label: 'Neerslag', unit: settings.precipUnit },
        { key: 'sunPct', label: 'Zon', unit: '%' },
        { key: 'windMax', label: 'Wind', unit: getWindUnitLabel(settings.windUnit) },
        { key: 'pressure', label: 'Luchtdruk', unit: settings.pressureUnit }
    ]), [settings.precipUnit, settings.pressureUnit, settings.tempUnit, settings.windUnit]);

    const getDefaultValue = (param: string) => {
        if (param === 'tempMax') return convertTemp(20, settings.tempUnit);
        if (param === 'tempMin') return convertTemp(10, settings.tempUnit);
        if (param === 'pressure') return convertPressure(1013, settings.pressureUnit);
        return 10;
    };

    const [selectedParam, setSelectedParam] = useState(parameters[0].key);
    const [selectedOperator, setSelectedOperator] = useState('>');
    const [value, setValue] = useState(() => getDefaultValue(parameters[0].key).toString());

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleParamChange = (nextParam: string) => {
        setSelectedParam(nextParam);
        setValue(getDefaultValue(nextParam).toString());
    };

    const countryName = (code?: string) => {
        if (!code) return '';
        return getCountryDisplayName(code, settings.language);
    };

    const handleAsk = () => {
        onAskQuestion(selectedParam, selectedOperator, value);
    };

    return (
        <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-4 pb-72 lg:pb-20">
            {/* Top Bar: Score & Timer */}
            <div className="flex justify-between items-start pointer-events-auto pt-16 lg:pt-4 px-4 w-full">
                <div className="flex gap-4">
                    <button 
                        onClick={onExit}
                        className="bg-red-500/20 hover:bg-red-500/40 text-red-100 p-3 rounded-xl backdrop-blur-md transition border border-red-500/30"
                    >
                        <Icon name="logout" className="text-xl" />
                    </button>
                    {onResetCamera && (
                        <button 
                            onClick={onResetCamera}
                            className="bg-blue-500/20 hover:bg-blue-500/40 text-blue-100 p-3 rounded-xl backdrop-blur-md transition border border-blue-500/30"
                            title="Reset Camera"
                        >
                            <Icon name="center_focus_strong" className="text-xl" />
                        </button>
                    )}
                </div>

                {/* Instructions Hint */}
                <div className="hidden lg:flex flex-col items-center justify-center bg-black/40 text-white p-2 rounded-lg backdrop-blur-sm text-xs opacity-70 hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2 mb-1">
                        <Icon name="mouse" className="text-[16px]" /> <span>Draaien / Zoom</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Icon name="pan_tool" className="text-[16px]" /> <span>Rechtermuisknop = Pan</span>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                    <div className="bg-bg-card/90 backdrop-blur-md p-4 rounded-xl shadow-lg border-2 border-accent-primary text-center min-w-[140px]">
                        <div className="text-2xl font-bold text-accent-primary font-mono">{formatTime(timeLeft)}</div>
                        <div className="text-sm text-text-muted">Resterende Tijd</div>
                    </div>

                    <div className="bg-bg-card/90 backdrop-blur-md p-4 rounded-xl shadow-lg border-2 border-accent-primary text-center min-w-[140px]">
                        <div className="text-2xl font-bold text-accent-primary font-mono">{questionsCount}/25</div>
                        <div className="text-sm text-text-muted">Vragen Gesteld</div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center pointer-events-none" />

            {/* Bottom: Query Builder & Game Over */}
            <div className="flex justify-center items-end pointer-events-auto w-full mb-10 lg:mb-6">
                {gameStatus === 'playing' ? (
                    remainingCards === 1 ? (
                        <button 
                            onClick={onGuessTarget}
                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-full text-xl shadow-lg transform transition hover:scale-105 mb-4"
                        >
                            Is dit hem?
                        </button>
                    ) : (
                        <div className="bg-bg-card/95 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-border-color flex flex-wrap items-center gap-2 max-w-3xl w-full justify-center">
                            <div className="flex flex-col min-w-[120px]">
                                <label className="text-xs font-bold text-text-muted uppercase ml-1">Eigenschap</label>
                                <select 
                                    value={selectedParam} 
                                    onChange={(e) => handleParamChange(e.target.value)}
                                    className="bg-bg-input border border-border-color text-text-main text-sm rounded-lg focus:ring-accent-primary focus:border-accent-primary block w-full p-2.5"
                                >
                                    {parameters.map(p => (
                                        <option key={p.key} value={p.key}>{p.label} ({p.unit})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col w-32">
                                <label className="text-xs font-bold text-text-muted uppercase ml-1">Is...</label>
                                <select 
                                    value={selectedOperator} 
                                    onChange={(e) => setSelectedOperator(e.target.value)}
                                    className="bg-bg-input border border-border-color text-text-main text-sm rounded-lg focus:ring-accent-primary focus:border-accent-primary block w-full p-2.5"
                                >
                                    {OPERATORS.map(o => (
                                        <option key={o.key} value={o.key}>{o.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col w-24">
                                <label className="text-xs font-bold text-text-muted uppercase ml-1">Waarde</label>
                                <input 
                                    type="number" 
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    className="bg-bg-input border border-border-color text-text-main text-sm rounded-lg focus:ring-accent-primary focus:border-accent-primary block w-full p-2.5"
                                />
                            </div>
                            
                            <div className="flex flex-col justify-end h-full pt-4">
                                <button 
                                    onClick={handleAsk}
                                    disabled={questionsCount >= 25}
                                    className="bg-accent-primary hover:bg-accent-hover text-white font-bold py-2.5 px-6 rounded-lg shadow transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Icon name="search" className="text-lg" />
                                    <span>Vraag</span>
                                </button>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-bg-card p-8 rounded-3xl shadow-2xl max-w-md w-full text-center relative overflow-hidden border border-border-color">
                            {gameStatus === 'won' ? (
                                <>
                                    <h2 className="text-4xl font-black text-green-500 mb-2">GEWONNEN!</h2>
                                    <p className="text-text-muted mb-6">Je hebt de juiste stad gevonden!</p>
                                    
                                    <div className="flex justify-center items-center gap-8 mb-8">
                                        <div className="bg-green-50 p-4 rounded-xl border-2 border-green-200 min-w-[200px]">
                                            <div className="text-sm text-green-600 font-bold uppercase mb-1">De Stad</div>
                                            <div className="text-2xl font-bold text-gray-800">{guessedCity?.name}</div>
                                            <div className="text-sm text-gray-500">{countryName(guessedCity?.country)}</div>
                                        </div>
                                    </div>

                                    <div className="text-2xl font-bold mb-8 text-text-main">
                                        Score: {Math.max(0, timeLeft * 10 - questionsCount * 50)}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h2 className="text-4xl font-black text-red-500 mb-2">HELAAS...</h2>
                                    <p className="text-text-muted mb-4">{timeLeft === 0 ? "De tijd is om!" : "Dat was niet de juiste stad."}</p>
                                    
                                    <div className="flex justify-center items-center gap-4 mb-8 flex-wrap">
                                        {guessedCity && (
                                            <div className="bg-red-50 p-4 rounded-xl border-2 border-red-200 min-w-[150px]">
                                                <div className="text-sm text-red-600 font-bold uppercase mb-1">Jouw keuze</div>
                                                <div className="text-xl font-bold text-gray-800">{guessedCity.name}</div>
                                                <div className="text-sm text-gray-500">{countryName(guessedCity.country)}</div>
                                            </div>
                                        )}
                                        
                                        {guessedCity && <div className="text-gray-400 font-bold">VS</div>}
                                        
                                        <div className="bg-green-50 p-4 rounded-xl border-2 border-green-200 min-w-[150px]">
                                            <div className="text-sm text-green-600 font-bold uppercase mb-1">Het was</div>
                                            <div className="text-xl font-bold text-gray-800">{targetCity?.name}</div>
                                            <div className="text-sm text-gray-500">{countryName(targetCity?.country)}</div>
                                        </div>
                                    </div>
                                    {timeLeft === 0 && targetWeather && (
                                        <div className="bg-bg-page/60 p-4 rounded-xl border border-border-color text-left mb-6">
                                            <div className="text-sm font-bold text-text-muted uppercase mb-2">Weer van de geheime stad</div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-text-main">
                                                <div>Max temp</div>
                                                <div className="text-right">{convertTemp(targetWeather.tempMax, settings.tempUnit)} {getTempLabel(settings.tempUnit)}</div>
                                                <div>Min temp</div>
                                                <div className="text-right">{convertTemp(targetWeather.tempMin, settings.tempUnit)} {getTempLabel(settings.tempUnit)}</div>
                                                <div>Neerslag</div>
                                                <div className="text-right">{convertPrecip(targetWeather.rainSum, settings.precipUnit)} {settings.precipUnit}</div>
                                                <div>Zon</div>
                                                <div className="text-right">{Math.round(targetWeather.sunPct)} %</div>
                                                <div>Wind</div>
                                                <div className="text-right">{convertWind(targetWeather.windMax, settings.windUnit)} {getWindUnitLabel(settings.windUnit)}</div>
                                                <div>Luchtdruk</div>
                                                <div className="text-right">
                                                    {convertPressure(targetWeather.pressure, settings.pressureUnit)} {settings.pressureUnit}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                            
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button 
                                    onClick={onRestart}
                                    className="w-full bg-accent-primary hover:bg-accent-hover text-white font-bold py-3 px-6 rounded-xl transition transform hover:scale-105"
                                >
                                    Nog een keer spelen
                                </button>
                                <button 
                                    onClick={onExit}
                                    className="w-full bg-bg-input hover:bg-bg-page text-text-main font-bold py-3 px-6 rounded-xl transition transform hover:scale-105 border border-border-color"
                                >
                                    Spel afsluiten
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
