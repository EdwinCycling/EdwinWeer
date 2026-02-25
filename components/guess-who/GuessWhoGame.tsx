
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BoardGameScene } from './BoardGameScene';
import { GameHUD } from './GameHUD';
import { LoadingSpinner } from '../LoadingSpinner';
import { getUsage, consumeCredit } from '../../services/usageService';
import { AppSettings, PressureUnit, PrecipUnit, TempUnit, WindUnit } from '../../types';
import { getTempLabel, getWindUnitLabel } from '../../services/weatherService';

interface GameCardData {
    id: number;
    city: {
        name: string;
        country: string;
        lat: number;
        lon: number;
    };
    weather: {
        tempMax: number;
        tempMin: number;
        rainSum: number;
        sunPct: number;
        windMax: number;
        pressure: number;
    };
}

interface GameData {
    cards: GameCardData[];
    targetHash: string;
    targetStats: GameCardData['weather'];
    date: string;
}

interface GuessWhoGameProps {
    settings: AppSettings;
    onExit: () => void;
}

export const GuessWhoGame: React.FC<GuessWhoGameProps> = ({ settings, onExit }) => {
    const [gameState, setGameState] = useState<'intro' | 'loading' | 'playing' | 'won' | 'lost'>('intro');
    const [gameData, setGameData] = useState<GameData | null>(null);
    const [flippedState, setFlippedState] = useState<Record<number, boolean>>({});
    const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
    const [questionsCount, setQuestionsCount] = useState(0);
    const [lastAnswer, setLastAnswer] = useState<{ question: string, result: boolean, timestamp: number } | null>(null);
    const [isAnswerVisible, setIsAnswerVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [guessedCity, setGuessedCity] = useState<{name: string, country: string} | undefined>(undefined);
    const [resetCameraTrigger, setResetCameraTrigger] = useState(0);

    // Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (gameState === 'playing' && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        setGameState('lost');
                        // Find the correct city to display
                        if (gameData) {
                            gameData.cards.find(c => 
                                c.weather.tempMax === gameData.targetStats.tempMax && 
                                c.weather.tempMin === gameData.targetStats.tempMin
                            );
                        }
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [gameState, timeLeft, gameData]);

    useEffect(() => {
        if (!lastAnswer) {
            setIsAnswerVisible(false);
            return;
        }
        setIsAnswerVisible(true);
        const timeout = setTimeout(() => {
            setIsAnswerVisible(false);
        }, 20000);
        return () => clearTimeout(timeout);
    }, [lastAnswer]);

    const startGame = async () => {
        setError(null);
        
        // 1. Credit Check
        const usage = getUsage();
        if (usage.weatherCredits < 25) {
            setError('Je hebt minimaal 25 Weather Credits nodig om dit spel te spelen.');
            return;
        }

        // 2. Deduct Credits
        await consumeCredit('weather', 25);

        // 3. Fetch Data
        setGameState('loading');
        try {
            const response = await fetch('/.netlify/functions/generate-guess-who');
            if (!response.ok) throw new Error('Failed to load game data');
            const data: GameData = await response.json();
            
            setGameData(data);
            setFlippedState({});
            setTimeLeft(300);
            setQuestionsCount(0);
            setLastAnswer(null);
            setIsAnswerVisible(false);
            setGuessedCity(undefined);
            setGameState('playing');
        } catch (e) {
            console.error(e);
            setError('Er ging iets mis bij het laden van het spel.');
            setGameState('intro');
        }
    };

    const handleToggleCard = (id: number) => {
        if (gameState !== 'playing') return;
        setFlippedState(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const bftToKmh = useCallback((bft: number) => {
        const rounded = Math.round(bft);
        const map = [1, 5, 11, 19, 28, 38, 49, 61, 74, 88, 102, 117, 130];
        if (rounded <= 0) return 0;
        if (rounded >= 12) return 130;
        return map[rounded];
    }, []);

    const windToKmh = useCallback((value: number) => {
        switch (settings.windUnit) {
            case WindUnit.BFT:
                return bftToKmh(value);
            case WindUnit.MS:
                return value * 3.6;
            case WindUnit.MPH:
                return value * 1.60934;
            case WindUnit.KNOTS:
                return value * 1.852;
            case WindUnit.KMH:
            default:
                return value;
        }
    }, [bftToKmh, settings.windUnit]);

    const toBaseValue = useCallback((param: string, value: number) => {
        switch (param) {
            case 'tempMax':
            case 'tempMin':
                return settings.tempUnit === TempUnit.FAHRENHEIT ? (value - 32) * 5 / 9 : value;
            case 'rainSum':
                return settings.precipUnit === PrecipUnit.INCH ? value * 25.4 : value;
            case 'windMax':
                return windToKmh(value);
            case 'pressure':
                return settings.pressureUnit === PressureUnit.INHG ? value / 0.02953 : value;
            case 'sunPct':
            default:
                return value;
        }
    }, [settings.precipUnit, settings.pressureUnit, settings.tempUnit, windToKmh]);

    const sanitizeValue = useCallback((param: string, value: number) => {
        if (!Number.isFinite(value)) return NaN;
        if (param === 'sunPct') return Math.min(100, Math.max(0, value));
        if (param === 'rainSum' || param === 'windMax' || param === 'pressure') return Math.max(0, value);
        return value;
    }, []);

    const getParamLabel = useCallback((param: string) => {
        switch (param) {
            case 'tempMax': return 'Max temp';
            case 'tempMin': return 'Min temp';
            case 'rainSum': return 'Neerslag';
            case 'sunPct': return 'Zon';
            case 'windMax': return 'Wind';
            case 'pressure': return 'Luchtdruk';
            default: return param;
        }
    }, []);

    const getParamUnit = useCallback((param: string) => {
        switch (param) {
            case 'tempMax':
            case 'tempMin':
                return getTempLabel(settings.tempUnit);
            case 'rainSum':
                return settings.precipUnit;
            case 'windMax':
                return getWindUnitLabel(settings.windUnit);
            case 'pressure':
                return settings.pressureUnit;
            case 'sunPct':
                return '%';
            default:
                return '';
        }
    }, [settings.precipUnit, settings.pressureUnit, settings.tempUnit, settings.windUnit]);

    const formatValue = useCallback((param: string, value: number) => {
        if (param === 'rainSum') {
            return settings.precipUnit === PrecipUnit.INCH ? value.toFixed(2) : value.toFixed(1);
        }
        if (param === 'windMax' && settings.windUnit === WindUnit.MS) {
            return value.toFixed(1);
        }
        if (param === 'pressure' && settings.pressureUnit === PressureUnit.INHG) {
            return value.toFixed(2);
        }
        return Number.isInteger(value) ? value.toString() : value.toFixed(1);
    }, [settings.precipUnit, settings.pressureUnit, settings.windUnit]);

    const handleAskQuestion = (param: string, operator: string, valueStr: string) => {
        if (!gameData || questionsCount >= 25) return;

        const rawValue = parseFloat(valueStr);
        const sanitizedValue = sanitizeValue(param, rawValue);
        if (!Number.isFinite(sanitizedValue)) return;

        const value = toBaseValue(param, sanitizedValue);
        const targetValue = (gameData.targetStats as any)[param];
        if (targetValue === null || targetValue === undefined || !Number.isFinite(value)) return;
        
        let result = false;
        
        // Compare
        switch (operator) {
            case '>': result = targetValue > value; break;
            case '<': result = targetValue < value; break;
            case '=': result = Math.abs(targetValue - value) < 0.1; break; // Float tolerance
        }

        setQuestionsCount(prev => prev + 1);
        
        // Construct question string for display
        const paramLabel = getParamLabel(param);
        const unitLabel = getParamUnit(param);
        const displayValue = formatValue(param, sanitizedValue);
        const qText = unitLabel ? `${paramLabel} ${operator} ${displayValue} ${unitLabel}?` : `${paramLabel} ${operator} ${displayValue}?`;
        
        setLastAnswer({
            question: qText,
            result: result,
            timestamp: Date.now()
        });
    };

    const handleGuessTarget = () => {
        // Find the one standing card
        const standingCards = gameData?.cards.filter(c => !flippedState[c.id]);
        if (!standingCards || standingCards.length !== 1) return;
        
        const candidate = standingCards[0];
        setGuessedCity({
            name: candidate.city.name,
            country: candidate.city.country
        });
        
        const isMatch = 
            candidate.weather.tempMax === gameData.targetStats.tempMax &&
            candidate.weather.tempMin === gameData.targetStats.tempMin &&
            candidate.weather.rainSum === gameData.targetStats.rainSum;
            
        if (isMatch) {
            setGameState('won');
        } else {
            setGameState('lost');
        }
    };
    
    // Count remaining cards
    const remainingCount = gameData ? gameData.cards.length - Object.values(flippedState).filter(Boolean).length : 0;

    // Mobile Check
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 1024);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const targetCity = useMemo(() => {
        if (!gameData) return undefined;
        const match = gameData.cards.find(c => 
            c.weather.tempMax === gameData.targetStats.tempMax && 
            c.weather.tempMin === gameData.targetStats.tempMin
        );
        if (!match) return undefined;
        return { name: match.city.name, country: match.city.country };
    }, [gameData]);

    if (isMobile) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-white p-8 text-center">
                <div className="text-6xl mb-4">📱</div>
                <h1 className="text-3xl font-bold mb-4">Alleen voor Desktop</h1>
                <p className="text-lg text-gray-300 mb-8 max-w-md">
                    Baro&apos;s Wie is Het? is ontworpen voor grotere schermen. 
                    Bezoek deze pagina op een desktop of laptop om te spelen!
                </p>
                <div className="text-sm text-gray-500">
                    Of probeer je scherm te draaien (als je een tablet hebt).
                </div>
            </div>
        );
    }

    if (gameState === 'intro') {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-blue-900 text-white p-8 rounded-3xl relative overflow-hidden">
                 <div className="absolute inset-0 bg-[url('/landing/hero-weather.jpg')] bg-cover opacity-20"></div>
                 <div className="relative z-10 text-center max-w-2xl">
                    <h1 className="text-5xl font-black mb-4 tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-white drop-shadow-lg">
                        Baro&apos;s Guess Who?
                    </h1>
                    <p className="text-xl mb-8 text-blue-100">
                        Raad de geheime stad gebaseerd op het weer van gisteren!
                        <br/>
                        <span className="text-sm opacity-75">Kost 25 Weather Credits</span>
                    </p>
                    
                    {error && (
                        <div className="bg-red-500/80 text-white p-4 rounded-xl mb-8 backdrop-blur-sm border border-red-400">
                            {error}
                        </div>
                    )}
                    
                    <button 
                        onClick={startGame}
                        className="bg-gradient-to-br from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-white text-2xl font-bold py-4 px-12 rounded-full shadow-2xl transform transition hover:scale-105 hover:rotate-1"
                    >
                        Start Spel 🎮
                    </button>
                 </div>
            </div>
        );
    }

    if (gameState === 'loading') {
        return (
            <div className="flex items-center justify-center h-full bg-blue-900">
                <LoadingSpinner />
                <span className="ml-4 text-white text-xl">Bord opzetten...</span>
            </div>
        );
    }

    const targetCard = gameData ? {
        id: -1,
        city: { name: '???', country: '??', lat: 0, lon: 0 },
        weather: gameData.targetStats
    } : null;

    return (
        <div className="relative w-full h-full bg-slate-900 overflow-hidden">
            <div className="absolute inset-0 z-0">
                {gameData && (
                    <BoardGameScene 
                        cards={gameData.cards} 
                        flippedState={flippedState}
                        onToggleCard={handleToggleCard}
                        targetCard={targetCard}
                        lastAnswer={lastAnswer}
                        isAnswerVisible={isAnswerVisible}
                        settings={settings}
                        resetCameraTrigger={resetCameraTrigger}
                    />
                )}
            </div>

            <GameHUD 
                timeLeft={timeLeft}
                questionsCount={questionsCount}
                onAskQuestion={handleAskQuestion}
                remainingCards={remainingCount}
                onGuessTarget={handleGuessTarget}
                gameStatus={gameState}
                targetCity={gameData && gameState !== 'playing' ? targetCity : undefined}
                targetWeather={gameData ? gameData.targetStats : undefined}
                guessedCity={guessedCity}
                onRestart={() => setGameState('intro')}
                onExit={onExit}
                settings={settings}
                onResetCamera={() => setResetCameraTrigger(prev => prev + 1)}
            />
        </div>
    );
};
