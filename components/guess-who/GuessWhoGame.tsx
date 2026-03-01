
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BoardGameScene } from './BoardGameScene';
import { GameHUD } from './GameHUD';
import { LoadingSpinner } from '../LoadingSpinner';
import { getUsage, consumeCredit } from '../../services/usageService';
import { AppSettings, PressureUnit, PrecipUnit, TempUnit, WindUnit } from '../../types';
import { getTempLabel, getWindUnitLabel } from '../../services/weatherService';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../services/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, startAfter, updateDoc, getDocs } from 'firebase/firestore';
import { Icon } from '../Icon';
import { submitGuessWhoScore } from '../../services/guessWhoService';
import { getTranslation } from '../../services/translations';

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
    const { user } = useAuth();
    const t = (key: string) => getTranslation(key, settings.language);
    
    const [gameState, setGameState] = useState<'intro' | 'loading' | 'playing' | 'won' | 'lost'>('intro');
    const [activeTab, setActiveTab] = useState<'play' | 'ranking' | 'rules'>('play');
    const [leaderboardData, setLeaderboardData] = useState<{name: string, score: number, userId: string}[]>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [lastVisibleLeaderboard, setLastVisibleLeaderboard] = useState<any>(null);
    const [hasMoreLeaderboard, setHasMoreLeaderboard] = useState(true);

    const [userStats, setUserStats] = useState<{dailyCount: number, highScore: number, lastPlayed: string, username?: string} | null>(null);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [lastVisible, setLastVisible] = useState<any>(null);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);
    
    // Leaderboard State
    const [leaderboardType, setLeaderboardType] = useState<'all_time' | 'year' | 'quarter' | 'month' | 'day' | 'yesterday' | 'day_before'>('day');
    const [leaderboardYear, setLeaderboardYear] = useState<number>(new Date().getFullYear());
    const [leaderboardMonth, setLeaderboardMonth] = useState<number>(new Date().getMonth() + 1);
    const [leaderboardQuarter, setLeaderboardQuarter] = useState<number>(Math.floor((new Date().getMonth() + 3) / 3));

    // Username State
    const [username, setUsername] = useState('');
    const [usernameError, setUsernameError] = useState('');
    const [isSavingUsername, setIsSavingUsername] = useState(false);
    const [showUsernameInput, setShowUsernameInput] = useState(false);

    const [gameData, setGameData] = useState<GameData | null>(null);
    const [flippedState, setFlippedState] = useState<Record<number, boolean>>({});
    const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
    const [questionsCount, setQuestionsCount] = useState(0);
    const [lastAnswer, setLastAnswer] = useState<{ question: string, result: boolean, timestamp: number } | null>(null);
    const [isAnswerVisible, setIsAnswerVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [guessedCity, setGuessedCity] = useState<{name: string, country: string} | undefined>(undefined);
    const [resetCameraTrigger, setResetCameraTrigger] = useState(0);
    const [blockedParams, setBlockedParams] = useState<Record<string, number>>({});

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

    // Fetch User Stats
    useEffect(() => {
        if (!user) return;
        
        const fetchUserStats = async () => {
            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    const today = new Date().toISOString().split('T')[0];
                    let dailyCount = 0;
                    if (data.last_played_guesswho === today) {
                        dailyCount = data.guesswho_daily_count || 0;
                    }
                    setUserStats({
                        dailyCount,
                        highScore: data.guesswho_highscore || 0,
                        lastPlayed: data.last_played_guesswho,
                        username: data.username
                    });
                    if (data.username) setUsername(data.username);
                }
            } catch (e) {
                console.error("Error fetching user stats", e);
            }
        };
        fetchUserStats();
    }, [user, gameState]); // Re-fetch on game state change (e.g. after playing)

    // Fetch History
    useEffect(() => {
        if (activeTab === 'ranking' && user) {
            const fetchHistory = async () => {
                setHistoryLoading(true);
                try {
                    const q = query(
                        collection(db, 'users', user.uid, 'guesswho_results'),
                        orderBy('timestamp', 'desc'),
                        limit(10)
                    );
                    const snapshot = await getDocs(q);
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setHistoryData(data);
                    setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
                    setHasMoreHistory(snapshot.docs.length === 10);
                } catch (e) {
                    console.error("Error fetching history", e);
                } finally {
                    setHistoryLoading(false);
                }
            };
            fetchHistory();
        }
    }, [activeTab, user]);

    const loadMoreHistory = async () => {
        if (!user || !lastVisible) return;
        setHistoryLoading(true);
        try {
            const q = query(
                collection(db, 'users', user.uid, 'guesswho_results'),
                orderBy('timestamp', 'desc'),
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                startAfter(lastVisible),
                limit(10)
            );
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setHistoryData(prev => {
                const existingIds = new Set(prev.map(item => item.id));
                const uniqueNew = data.filter(item => !existingIds.has(item.id));
                return [...prev, ...uniqueNew];
            });
            setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
            setHasMoreHistory(snapshot.docs.length === 10);
        } catch (e) {
            console.error("Error loading more history", e);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Fetch Leaderboard
    useEffect(() => {
        if (activeTab !== 'ranking' || !user) return;
        
        setLeaderboardLoading(true);
        setLastVisibleLeaderboard(null);
        setHasMoreLeaderboard(true);
        
        let docId = 'all_time';
        if (leaderboardType === 'year') {
            docId = leaderboardYear.toString();
        } else if (leaderboardType === 'quarter') {
            docId = `${leaderboardYear}_Q${leaderboardQuarter}`;
        } else if (leaderboardType === 'month') {
            docId = `${leaderboardYear}_${leaderboardMonth.toString().padStart(2, '0')}`;
        } else if (leaderboardType === 'day') {
             const now = new Date();
             docId = now.toISOString().split('T')[0];
        } else if (leaderboardType === 'yesterday') {
             const d = new Date();
             d.setDate(d.getDate() - 1);
             docId = d.toISOString().split('T')[0];
        } else if (leaderboardType === 'day_before') {
             const d = new Date();
             d.setDate(d.getDate() - 2);
             docId = d.toISOString().split('T')[0];
        }
        
        const q = query(
            collection(db, 'guesswho_leaderboards', docId, 'entries'),
            orderBy('score', 'desc'),
            limit(50)
        );

        // For initial load, use getDocs instead of onSnapshot to handle pagination simpler
        // Or keep onSnapshot for real-time updates on first page?
        // High/Low uses getDocs usually for pagination.
        // Let's use getDocs.
        
        const fetchLeaderboard = async () => {
            try {
                const snapshot = await getDocs(q);
                const data = snapshot.docs.map(doc => ({
                    userId: doc.id,
                    ...doc.data()
                })) as {name: string, score: number, userId: string}[];
                
                setLeaderboardData(data);
                setLastVisibleLeaderboard(snapshot.docs[snapshot.docs.length - 1]);
                setHasMoreLeaderboard(snapshot.docs.length === 50);
            } catch (e) {
                console.error("Error fetching leaderboard:", e);
            } finally {
                setLeaderboardLoading(false);
            }
        };

        fetchLeaderboard();

    }, [activeTab, leaderboardType, leaderboardYear, leaderboardMonth, leaderboardQuarter, user]);

    const loadMoreLeaderboard = async () => {
        if (!user || !lastVisibleLeaderboard) return;
        setLeaderboardLoading(true);
        
        let docId = 'all_time';
        // Reuse logic or refactor to helper function
        if (leaderboardType === 'year') {
            docId = leaderboardYear.toString();
        } else if (leaderboardType === 'quarter') {
            docId = `${leaderboardYear}_Q${leaderboardQuarter}`;
        } else if (leaderboardType === 'month') {
            docId = `${leaderboardYear}_${leaderboardMonth.toString().padStart(2, '0')}`;
        } else if (leaderboardType === 'day') {
             const now = new Date();
             docId = now.toISOString().split('T')[0];
        } else if (leaderboardType === 'yesterday') {
             const d = new Date();
             d.setDate(d.getDate() - 1);
             docId = d.toISOString().split('T')[0];
        } else if (leaderboardType === 'day_before') {
             const d = new Date();
             d.setDate(d.getDate() - 2);
             docId = d.toISOString().split('T')[0];
        }

        try {
            const q = query(
                collection(db, 'guesswho_leaderboards', docId, 'entries'),
                orderBy('score', 'desc'),
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                startAfter(lastVisibleLeaderboard),
                limit(50)
            );
            
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                userId: doc.id,
                ...doc.data()
            })) as {name: string, score: number, userId: string}[];
            
            setLeaderboardData(prev => [...prev, ...data]);
            setLastVisibleLeaderboard(snapshot.docs[snapshot.docs.length - 1]);
            setHasMoreLeaderboard(snapshot.docs.length === 50);
        } catch (e) {
            console.error("Error loading more leaderboard:", e);
        } finally {
            setLeaderboardLoading(false);
        }
    };

    const handleUsernameSubmit = async () => {
        if (!user) return;
        
        // Validate
        if (username.length < 5) {
            setUsernameError(t('game.username.error.min') || 'Minimaal 5 tekens');
            return;
        }
        if (username.length > 25) {
            setUsernameError(t('game.username.error.max') || 'Maximaal 25 tekens');
            return;
        }
        if (!/^[a-zA-Z0-9 *]+$/.test(username)) {
            setUsernameError(t('game.username.error.chars') || 'Alleen letters en cijfers');
            return;
        }
        if (username.toLowerCase().includes('baro')) {
            setUsernameError(t('game.username.error.baro') || 'Geen Baro in naam');
            return;
        }

        setIsSavingUsername(true);
        setUsernameError('');

        try {
            await updateDoc(doc(db, 'users', user.uid), { username: username });
            
            setUserStats(prev => prev ? { ...prev, username } : null);
            setShowUsernameInput(false);
            
            // Retry submission of pending score if any? 
            // Currently handleGuessTarget handles submission. 
            // If username was missing, it used 'Anonymous'.
            // Ideally we prompt BEFORE playing if possible, or AFTER game but before submit?
            // High/Low prompts AFTER game if score > highscore or if no username.
            
        } catch (e) {
            console.error("Error saving username", e);
            setUsernameError("Error saving. Try again.");
        } finally {
            setIsSavingUsername(false);
        }
    };

    const startGame = async () => {
        setError(null);
        
        // 0. Check Daily Limit
        if (userStats && userStats.dailyCount >= 3) {
            setError('Je hebt je dagelijkse limiet van 3 spellen bereikt. Kom morgen terug!');
            return;
        }

        // Check username
        if (userStats && !userStats.username) {
            setShowUsernameInput(true);
            return;
        }

        // 1. Credit Check
        const usage = getUsage();
        if (usage.weatherCredits < 50) {
            setError('Je hebt minimaal 50 Weather Credits nodig om te starten (Buffer). Kost per spel: 25.');
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
            setBlockedParams({});
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
        
        // Check if parameter is blocked
        if (blockedParams[param] > 0) return;

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
        
        // Update blocked params: decrement all, set current to 2
        setBlockedParams(prev => {
            const next: Record<string, number> = {};
            // Decrement existing blocks
            Object.entries(prev).forEach(([key, count]) => {
                if (count > 1) next[key] = count - 1;
            });
            // Set new block
            next[param] = 2;
            return next;
        });
        
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

    const handleGuessTarget = async () => {
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
            
        let finalScore = 0;

        if (isMatch) {
            setGameState('won');
            // Calculate Score
            const qPoints = Math.max(0, (25 - questionsCount) * 10);
            const bonusPoints = questionsCount < 10 ? (10 - questionsCount) * 10 : 0;
            const timePoints = timeLeft;
            finalScore = qPoints + bonusPoints + timePoints;
        } else {
            setGameState('lost');
            finalScore = 0;
        }

        if (user) {
            try {
                // Refresh user stats to update daily count and high score immediately
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                     const data = userSnap.data();
                     setUserStats(prev => prev ? {
                         ...prev,
                         dailyCount: data.last_played_guesswho === new Date().toISOString().split('T')[0] ? (data.guesswho_daily_count || 0) : 0,
                         highScore: data.guesswho_highscore || 0
                     } : null);
                }

                await submitGuessWhoScore(
                    user.uid, 
                    userStats?.username || user.displayName || 'Anonymous', 
                    finalScore, 
                    timeLeft, 
                    questionsCount, 
                    [] // We can add log later if needed
                );
            } catch (e) {
                console.error("Failed to submit score", e);
            }
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

    if (showUsernameInput) {
        return (
             <div className="flex flex-col h-full bg-blue-900 text-white relative overflow-hidden items-center justify-center p-8">
                <div className="absolute inset-0 bg-[url('/landing/hero-weather.jpg')] bg-cover opacity-20"></div>
                <div className="relative z-10 max-w-md w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/10 shadow-2xl">
                    <h2 className="text-3xl font-black mb-6 text-center">Kies je Spelersnaam</h2>
                    <p className="text-center mb-6 text-blue-100">Voordat we beginnen, hoe wil je heten op de ranglijst?</p>
                    
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Jouw naam..."
                        className="w-full bg-white/20 border border-white/30 rounded-xl p-4 text-white placeholder-white/50 text-xl font-bold mb-4 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                    />
                    
                    {usernameError && (
                        <div className="bg-red-500/80 text-white p-3 rounded-lg mb-4 text-sm font-bold text-center">
                            {usernameError}
                        </div>
                    )}
                    
                    <div className="flex gap-4">
                        <button 
                            onClick={() => setShowUsernameInput(false)}
                            className="flex-1 py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 transition"
                        >
                            Annuleren
                        </button>
                        <button 
                            onClick={handleUsernameSubmit}
                            disabled={isSavingUsername}
                            className="flex-1 py-3 rounded-xl font-bold bg-yellow-400 text-black hover:bg-yellow-300 transition shadow-lg disabled:opacity-50"
                        >
                            {isSavingUsername ? <LoadingSpinner size="sm" /> : 'Opslaan & Starten'}
                        </button>
                    </div>
                </div>
             </div>
        );
    }

    if (gameState === 'intro') {
        return (
            <div className="flex flex-col h-full bg-blue-900 text-white relative overflow-hidden">
                 <div className="absolute inset-0 bg-[url('/landing/hero-weather.jpg')] bg-cover opacity-20"></div>
                 
                 {/* Header */}
                 <div className="relative z-10 p-4 flex items-center justify-between border-b border-white/10 backdrop-blur-sm">
                    <h1 className="text-xl font-bold">Baro&apos;s Guess Who?</h1>
                 </div>

                 {/* Tabs */}
                 <div className="relative z-10 flex p-2 gap-2 justify-center bg-black/20 backdrop-blur-md">
                    {['play', 'ranking', 'rules'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === tab ? 'bg-white text-blue-900 shadow-lg scale-105' : 'bg-white/10 text-white hover:bg-white/20'}`}
                        >
                            {tab === 'play' ? 'Spelen' : tab === 'ranking' ? 'Ranglijst' : 'Spelregels'}
                        </button>
                    ))}
                 </div>

                 {/* Content */}
                 <div className="relative z-10 flex-1 overflow-y-auto p-4 flex flex-col items-center custom-scrollbar">
                    {activeTab === 'play' && (
                        <div className="text-center max-w-2xl my-auto animate-in fade-in zoom-in duration-300">
                            <h2 className="text-5xl font-black mb-4 tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-white drop-shadow-lg">
                                Raad de Stad
                            </h2>
                            <p className="text-xl mb-8 text-blue-100">
                                Vind de geheime stad gebaseerd op het weer van gisteren!
                                <br/>
                                <span className="text-sm opacity-75">Kost 25 Weather Credits per spel</span>
                            </p>
                            
                            {/* Stats */}
                            {userStats && (
                                <div className="flex justify-center gap-4 mb-8">
                                    <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                                        <div className="text-sm opacity-75 uppercase tracking-wider font-bold mb-1">Spellen Vandaag</div>
                                        <div className={`text-3xl font-black ${userStats.dailyCount >= 3 ? 'text-red-400' : 'text-white'}`}>{userStats.dailyCount} / 3</div>
                                    </div>
                                    <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                                        <div className="text-sm opacity-75 uppercase tracking-wider font-bold mb-1">Jouw Highscore</div>
                                        <div className="text-3xl font-black text-yellow-400">{userStats.highScore}</div>
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="bg-red-500/80 text-white p-4 rounded-xl mb-8 backdrop-blur-sm border border-red-400 font-bold shadow-lg">
                                    {error}
                                </div>
                            )}
                            
                            <button 
                                onClick={startGame}
                                disabled={userStats ? userStats.dailyCount >= 3 : false}
                                className="bg-gradient-to-br from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-white text-2xl font-bold py-4 px-12 rounded-full shadow-2xl transform transition hover:scale-105 hover:rotate-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:scale-100"
                            >
                                {userStats && userStats.dailyCount >= 3 ? 'Limiet Bereikt' : 'Start Spel 🎮'}
                            </button>
                        </div>
                    )}

                    {activeTab === 'ranking' && (
                        <div className="w-full max-w-2xl bg-white/10 rounded-2xl p-6 backdrop-blur-md animate-in slide-in-from-right duration-300 border border-white/10">
                            
                            {/* Personal High Score Display */}
                            {userStats && (
                                <div className="mb-6 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 p-4 rounded-xl border border-yellow-500/30 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-yellow-500 p-2 rounded-full text-black">
                                            <Icon name="emoji_events" />
                                        </div>
                                        <div>
                                            <div className="text-xs uppercase font-bold text-yellow-300 opacity-80">Jouw Beste Score</div>
                                            <div className="text-2xl font-black">{userStats.highScore}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs uppercase font-bold opacity-50">Gespeeld</div>
                                        <div className="text-lg font-bold">{userStats.dailyCount} / 3</div>
                                    </div>
                                </div>
                            )}

                            {/* Filters */}
                            <div className="flex flex-wrap gap-2 mb-6 justify-center">
                                {[
                                    { id: 'day', label: 'Vandaag' },
                                    { id: 'yesterday', label: 'Gisteren' },
                                    { id: 'month', label: 'Maand' },
                                    { id: 'quarter', label: 'Kwartaal' },
                                    { id: 'year', label: 'Jaar' },
                                    { id: 'all_time', label: 'Totaal' },
                                    { id: 'history', label: 'Mijn Spellen' } // New History Tab Option
                                ].map(filter => (
                                    <button
                                        key={filter.id}
                                        onClick={() => setLeaderboardType(filter.id as any)}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                            leaderboardType === filter.id 
                                            ? 'bg-yellow-400 text-black shadow-md' 
                                            : 'bg-white/10 hover:bg-white/20 text-white'
                                        }`}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>

                            <h2 className="text-xl font-bold mb-4 text-center flex items-center justify-center gap-2">
                                {leaderboardType === 'history' ? (
                                    <><Icon name="history" className="text-blue-300" /> Mijn Geschiedenis</>
                                ) : (
                                    <><Icon name="leaderboard" className="text-yellow-400" /> Ranglijst</>
                                )}
                            </h2>
                            
                            {/* Content */}
                            {leaderboardType === 'history' ? (
                                // History View
                                <div className="space-y-2">
                                    {historyLoading && historyData.length === 0 ? (
                                        <div className="flex justify-center py-8"><LoadingSpinner /></div>
                                    ) : historyData.length > 0 ? (
                                        <>
                                            {historyData.map((entry, idx) => (
                                                <div key={entry.id || idx} className="bg-white/5 border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                                    <div>
                                                        <div className="text-sm opacity-50 font-mono">
                                                            {entry.timestamp?.seconds 
                                                                ? new Date(entry.timestamp.seconds * 1000).toLocaleString() 
                                                                : 'Zojuist'}
                                                        </div>
                                                        <div className="font-bold text-white flex gap-4 mt-1 text-sm">
                                                            <span>⏱ {entry.timeLeft}s over</span>
                                                            <span>❓ {entry.questionsCount} vragen</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-xl font-black text-yellow-400 font-mono">
                                                        {entry.score}
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            {hasMoreHistory && (
                                                <button 
                                                    onClick={loadMoreHistory}
                                                    disabled={historyLoading}
                                                    className="w-full py-3 mt-4 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition"
                                                >
                                                    {historyLoading ? <LoadingSpinner size="sm" /> : 'Laad meer...'}
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-center opacity-50 py-8">Nog geen spellen gespeeld.</div>
                                    )}
                                </div>
                            ) : (
                                // Leaderboard View
                                <>
                                    {leaderboardLoading ? (
                                        <div className="flex justify-center py-12"><LoadingSpinner /></div>
                                    ) : leaderboardData.length > 0 ? (
                                        <div className="space-y-2">
                                            {leaderboardData.map((entry, idx) => (
                                                <div key={idx} className={`flex items-center p-4 rounded-xl transition-all hover:bg-white/10 ${entry.userId === user?.uid ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-white/5 border border-white/5'}`}>
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mr-4 text-sm shadow-sm ${
                                                        idx === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-white' :
                                                        idx === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-white' :
                                                        idx === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-700 text-white' :
                                                        'bg-white/10 text-white'
                                                    }`}>
                                                        {idx + 1}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="font-bold text-base">
                                                            {entry.name || 'Anoniem'}
                                                            {entry.userId === user?.uid && <span className="ml-2 text-[10px] uppercase font-bold bg-yellow-500 text-black px-2 py-0.5 rounded-full align-middle">Jij</span>}
                                                        </div>
                                                    </div>
                                                    <div className="font-mono text-yellow-300 font-bold text-lg">
                                                        {entry.score}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center opacity-50 py-12 flex flex-col items-center gap-4">
                                            <Icon name="leaderboard" className="text-4xl opacity-50" />
                                            <p>Nog geen scores in deze periode.</p>
                                        </div>
                                    )}
                                    
                                    {leaderboardData.length > 0 && hasMoreLeaderboard && (
                                        <button 
                                            onClick={loadMoreLeaderboard}
                                            disabled={leaderboardLoading}
                                            className="w-full py-3 mt-4 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition"
                                        >
                                            {leaderboardLoading ? <LoadingSpinner size="sm" /> : 'Laad meer...'}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'rules' && (
                        <div className="w-full max-w-2xl bg-white/10 rounded-2xl p-8 backdrop-blur-md text-left space-y-8 animate-in slide-in-from-right duration-300 border border-white/10">
                            <h2 className="text-3xl font-black mb-4 text-center">Spelregels</h2>
                            
                            <div className="space-y-3">
                                <h3 className="font-bold text-xl text-yellow-300 flex items-center gap-2">
                                    <Icon name="casino" /> Hoe werkt het?
                                </h3>
                                <ul className="list-disc pl-5 space-y-2 opacity-90 text-lg leading-relaxed">
                                    <li>Er zijn 24 steden met het weer van gisteren.</li>
                                    <li>Eén stad is de geheime stad die je moet vinden.</li>
                                     <li>Stel slimme vragen over het weer (bijv. &quot;Is het warmer dan 20°C?&quot;).</li>
                                     <li>Kaartjes die niet voldoen moet je zelf snel zoeken en omdraaien.</li>
                                     <li>Vind de stad voordat de tijd (5 min) op is!</li>
                                </ul>
                            </div>

                            <div className="space-y-3">
                                <h3 className="font-bold text-xl text-yellow-300 flex items-center gap-2">
                                    <Icon name="military_tech" /> Puntentelling
                                </h3>
                                <ul className="list-disc pl-5 space-y-2 opacity-90 text-lg leading-relaxed">
                                    <li>Je start met <strong>25 vragen</strong>.</li>
                                    <li>Elke ongebruikte vraag levert <strong>10 punten</strong> op.</li>
                                    <li><strong>Bonus:</strong> Heb je het geraden binnen 10 vragen? Dan krijg je <strong>10 extra punten</strong> per ongebruikte vraag onder de 10.</li>
                                    <li>Elke seconde die over is levert <strong>1 punt</strong> op.</li>
                                </ul>
                            </div>

                            <div className="bg-blue-500/20 p-6 rounded-xl border border-blue-400/30 flex items-start gap-4">
                                <Icon name="info" className="text-2xl text-blue-300 mt-1" />
                                <p className="text-base leading-relaxed">
                                    <strong>Let op:</strong> Je mag dit spel maximaal <strong>3 keer per dag</strong> spelen.
                                    Deelname kost <strong>25 Weather Credits</strong> per keer. Zorg dat je minimaal 50 credits hebt als buffer.
                                </p>
                            </div>
                        </div>
                    )}
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
                blockedParams={blockedParams}
            />
        </div>
    );
};
