import React, { useState, useEffect, useRef } from 'react';
import { ViewState, AppSettings, HighLowQuestion, Location } from '../types';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { generateQuiz, submitHighLowScore } from '../services/highLowGameService';
import { doc, getDoc, setDoc, updateDoc, increment, collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, startAfter, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getUsage, deductBaroCredit } from '../services/usageService';
import { CreditFloatingButton } from '../components/CreditFloatingButton';
import { LoadingSpinner } from '../components/LoadingSpinner';

// Fix Leaflet marker icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
});

interface Props {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
    onUpdateSettings?: (settings: AppSettings) => void;
}

// Map Updater Component
const MapUpdater: React.FC<{ center: [number, number], zoom: number }> = ({ center, zoom }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
};

interface GameLogEntry {
    question: HighLowQuestion;
    answer: string;
    correct: boolean;
    points: number;
    timeSpent: number;
}

const COUNTRY_NAMES: Record<string, { nl: string, en: string }> = {
    'NL': { nl: 'Nederland', en: 'Netherlands' },
    'BE': { nl: 'België', en: 'Belgium' },
    'DE': { nl: 'Duitsland', en: 'Germany' },
    'FR': { nl: 'Frankrijk', en: 'France' },
    'GB': { nl: 'Verenigd Koninkrijk', en: 'United Kingdom' },
    'UK': { nl: 'Verenigd Koninkrijk', en: 'United Kingdom' },
    'IE': { nl: 'Ierland', en: 'Ireland' },
    'ES': { nl: 'Spanje', en: 'Spain' },
    'IT': { nl: 'Italië', en: 'Italy' },
    'CH': { nl: 'Zwitserland', en: 'Switzerland' },
    'AT': { nl: 'Oostenrijk', en: 'Austria' },
    'DK': { nl: 'Denemarken', en: 'Denmark' },
    'SE': { nl: 'Zweden', en: 'Sweden' },
    'NO': { nl: 'Noorwegen', en: 'Norway' },
    'FI': { nl: 'Finland', en: 'Finland' },
    'PL': { nl: 'Polen', en: 'Poland' },
    'CZ': { nl: 'Tsjechië', en: 'Czech Republic' },
    'HU': { nl: 'Hongarije', en: 'Hungary' },
    'HR': { nl: 'Kroatië', en: 'Croatia' },
    'TR': { nl: 'Turkije', en: 'Turkey' },
    'LU': { nl: 'Luxemburg', en: 'Luxembourg' },
    'CA': { nl: 'Canada', en: 'Canada' },
    'AU': { nl: 'Australië', en: 'Australia' },
    'US': { nl: 'Verenigde Staten', en: 'United States' },
    'JP': { nl: 'Japan', en: 'Japan' },
    'PT': { nl: 'Portugal', en: 'Portugal' },
    'GR': { nl: 'Griekenland', en: 'Greece' },
    'ZA': { nl: 'Zuid-Afrika', en: 'South Africa' },
    'BR': { nl: 'Brazilië', en: 'Brazil' },
    'AR': { nl: 'Argentinië', en: 'Argentina' },
    'CL': { nl: 'Chili', en: 'Chile' },
    'MX': { nl: 'Mexico', en: 'Mexico' },
    'TH': { nl: 'Thailand', en: 'Thailand' },
    'CN': { nl: 'China', en: 'China' },
    'IN': { nl: 'India', en: 'India' },
    'RU': { nl: 'Rusland', en: 'Russia' },
    'KR': { nl: 'Zuid-Korea', en: 'South Korea' },
    'AE': { nl: 'Verenigde Arabische Emiraten', en: 'United Arab Emirates' },
    'EG': { nl: 'Egypte', en: 'Egypt' },
    'MA': { nl: 'Marokko', en: 'Morocco' },
    'UA': { nl: 'Oekraïne', en: 'Ukraine' },
    'PE': { nl: 'Peru', en: 'Peru' },
    'CO': { nl: 'Colombia', en: 'Colombia' },
    'VN': { nl: 'Vietnam', en: 'Vietnam' },
    'ID': { nl: 'Indonesië', en: 'Indonesia' },
    'MY': { nl: 'Maleisië', en: 'Malaysia' },
    'NZ': { nl: 'Nieuw-Zeeland', en: 'New Zealand' },
    'KE': { nl: 'Kenia', en: 'Kenya' },
    'NG': { nl: 'Nigeria', en: 'Nigeria' },
    'SA': { nl: 'Saoedi-Arabië', en: 'Saudi Arabia' },
    'IL': { nl: 'Israël', en: 'Israel' },
    'IS': { nl: 'IJsland', en: 'Iceland' },
    'EE': { nl: 'Estland', en: 'Estonia' },
    'LV': { nl: 'Letland', en: 'Latvia' },
    'LT': { nl: 'Litouwen', en: 'Lithuania' },
    'RO': { nl: 'Roemenië', en: 'Romania' },
    'BG': { nl: 'Bulgarije', en: 'Bulgaria' },
    'RS': { nl: 'Servië', en: 'Serbia' },
    'AL': { nl: 'Albanië', en: 'Albania' },
    'BA': { nl: 'Bosnië en Herzegovina', en: 'Bosnia and Herzegovina' },
    'MK': { nl: 'Noord-Macedonië', en: 'North Macedonia' },
    'SI': { nl: 'Slovenië', en: 'Slovenia' },
    'SK': { nl: 'Slowakije', en: 'Slovakia' },
    'BY': { nl: 'Wit-Rusland', en: 'Belarus' },
    'MD': { nl: 'Moldavië', en: 'Moldova' },
    'GE': { nl: 'Georgië', en: 'Georgia' },
    'AM': { nl: 'Armenië', en: 'Armenia' },
    'AZ': { nl: 'Azerbeidzjan', en: 'Azerbaijan' },
    'MT': { nl: 'Malta', en: 'Malta' },
    'CY': { nl: 'Cyprus', en: 'Cyprus' },
    'AD': { nl: 'Andorra', en: 'Andorra' },
    'MC': { nl: 'Monaco', en: 'Monaco' },
    'BS': { nl: 'Bahama\'s', en: 'Bahamas' },
    'CU': { nl: 'Cuba', en: 'Cuba' },
    'DO': { nl: 'Dominicaanse Republiek', en: 'Dominican Republic' },
    'PR': { nl: 'Puerto Rico', en: 'Puerto Rico' },
    'JM': { nl: 'Jamaica', en: 'Jamaica' },
    'VE': { nl: 'Venezuela', en: 'Venezuela' },
    'EC': { nl: 'Ecuador', en: 'Ecuador' },
    'HK': { nl: 'Hongkong', en: 'Hong Kong' },
    'TW': { nl: 'Taiwan', en: 'Taiwan' },
    'SG': { nl: 'Singapore', en: 'Singapore' },
    'PH': { nl: 'Filipijnen', en: 'Philippines' },
    'NP': { nl: 'Nepal', en: 'Nepal' },
    'QA': { nl: 'Qatar', en: 'Qatar' },
    'IR': { nl: 'Iran', en: 'Iran' },
    'MV': { nl: 'Malediven', en: 'Maldives' },
    'MN': { nl: 'Mongolië', en: 'Mongolia' },
    'KZ': { nl: 'Kazachstan', en: 'Kazakhstan' },
    'UZ': { nl: 'Oezbekistan', en: 'Uzbekistan' },
    'KG': { nl: 'Kirgizië', en: 'Kyrgyzstan' },
    'TJ': { nl: 'Tadzjikistan', en: 'Tajikistan' },
    'TM': { nl: 'Turkmenistan', en: 'Turkmenistan' },
    'AF': { nl: 'Afghanistan', en: 'Afghanistan' },
    'PK': { nl: 'Pakistan', en: 'Pakistan' },
    'BD': { nl: 'Bangladesh', en: 'Bangladesh' },
    'LK': { nl: 'Sri Lanka', en: 'Sri Lanka' },
    'MM': { nl: 'Myanmar', en: 'Myanmar' },
    'LA': { nl: 'Laos', en: 'Laos' },
    'KH': { nl: 'Cambodja', en: 'Cambodia' },
    'JO': { nl: 'Jordanië', en: 'Jordan' },
    'LB': { nl: 'Libanon', en: 'Lebanon' },
    'IQ': { nl: 'Irak', en: 'Iraq' },
    'KW': { nl: 'Koeweit', en: 'Kuwait' },
    'BH': { nl: 'Bahrein', en: 'Bahrain' },
    'OM': { nl: 'Oman', en: 'Oman' },
    'YE': { nl: 'Jemen', en: 'Yemen' },
    'TN': { nl: 'Tunesië', en: 'Tunisia' },
    'ET': { nl: 'Ethiopië', en: 'Ethiopia' },
    'TZ': { nl: 'Tanzania', en: 'Tanzania' },
    'SC': { nl: 'Seychellen', en: 'Seychelles' },
    'SN': { nl: 'Senegal', en: 'Senegal' },
    'GH': { nl: 'Ghana', en: 'Ghana' },
    'CI': { nl: 'Ivoorkust', en: 'Ivory Coast' },
    'AO': { nl: 'Angola', en: 'Angola' },
    'CD': { nl: 'Congo-Kinshasa', en: 'DR Congo' },
    'SD': { nl: 'Soedan', en: 'Sudan' },
    'DZ': { nl: 'Algerije', en: 'Algeria' },
    'LY': { nl: 'Libië', en: 'Libya' },
    'UG': { nl: 'Oeganda', en: 'Uganda' },
    'RW': { nl: 'Rwanda', en: 'Rwanda' },
    'MZ': { nl: 'Mozambique', en: 'Mozambique' },
    'ZW': { nl: 'Zimbabwe', en: 'Zimbabwe' },
    'NA': { nl: 'Namibië', en: 'Namibia' },
    'BW': { nl: 'Botswana', en: 'Botswana' },
    'MG': { nl: 'Madagaskar', en: 'Madagascar' },
    'MU': { nl: 'Mauritius', en: 'Mauritius' },
    'FJ': { nl: 'Fiji', en: 'Fiji' },
    'PF': { nl: 'Frans-Polynesië', en: 'French Polynesia' }
};

const getCountryName = (code: string, lang: 'nl' | 'en' = 'nl') => {
    const country = COUNTRY_NAMES[code];
    if (country) {
        return lang === 'nl' ? country.nl : country.en;
    }
    return code;
};

export const HighLowGameView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
    const { user } = useAuth();
    const t = (key: string, params?: any) => getTranslation(key, settings.language, params);
    
    // State
    const [activeTab, setActiveTab] = useState<'play' | 'scores' | 'ranking' | 'rules'>('play');
    const [gameState, setGameState] = useState<'intro' | 'loading' | 'playing' | 'finished'>('intro');
    const [questions, setQuestions] = useState<HighLowQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [globalTimer, setGlobalTimer] = useState(90);
    const [questionTimer, setQuestionTimer] = useState(5);
    const [lastPlayed, setLastPlayed] = useState<string | null>(null);
    const [highScore, setHighScore] = useState(0);
    const [highScoreDate, setHighScoreDate] = useState<string | null>(null);
    const [highScoreQuestions, setHighScoreQuestions] = useState(0);
    const [feedback, setFeedback] = useState<{ correct: boolean, points: number } | null>(null);
    const [canPlayToday, setCanPlayToday] = useState(true);
    const [loadingUser, setLoadingUser] = useState(true);
    
    // Game Log State
    const [gameLog, setGameLog] = useState<GameLogEntry[]>([]);
    const gameLogRef = useRef<GameLogEntry[]>([]);

    // Scores Tab State
    const [scoresTab, setScoresTab] = useState<'last_game' | 'history'>('last_game');
    const [lastGameDetails, setLastGameDetails] = useState<any>(null);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [lastVisible, setLastVisible] = useState<any>(null);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);

    // Leaderboard Filter State
    const [leaderboardType, setLeaderboardType] = useState<'all_time' | 'year' | 'quarter' | 'month' | 'day'>('day');
    const [leaderboardYear, setLeaderboardYear] = useState<number>(new Date().getFullYear());
    const [leaderboardMonth, setLeaderboardMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
    const [leaderboardQuarter, setLeaderboardQuarter] = useState<number>(Math.floor((new Date().getMonth() + 3) / 3)); // 1-4
    
    const [leaderboardData, setLeaderboardData] = useState<{name: string, score: number, userId: string}[]>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);

    // Username State
    const [username, setUsername] = useState('');
    const [usernameError, setUsernameError] = useState('');
    const [isSavingUsername, setIsSavingUsername] = useState(false);
    const [showUsernameInput, setShowUsernameInput] = useState(false);

    // Refs for timers
    const globalIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const questionIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isEndingRef = useRef(false);
    const suspiciousStreakRef = useRef(0);
    const isFlaggedRef = useRef(false);

    // Helper for Question Time
    const getQuestionTime = (index: number) => {
        if (index < 5) return 15;   // 1-5 (Very easy)
        if (index < 8) return 12;   // 6-8 (Easy)
        if (index < 11) return 10;  // 9-11 (Medium)
        if (index < 13) return 7;   // 12-13 (Hard)
        return 5;                   // 14-15 (Expert)
    };

    // Load User Data
    useEffect(() => {
        const fetchUserData = async () => {
            if (!user) {
                setLoadingUser(false);
                return;
            }
            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    setLastPlayed(data.last_played_highlow || null);
                    setHighScore(data.highlow_highscore || 0);
                    setHighScoreDate(data.highlow_highscore_date || null);
                    setHighScoreQuestions(data.highlow_highscore_questions || 0);
                    
                    // Check if played today
                    const today = new Date().toISOString().split('T')[0];
                    if (data.last_played_highlow === today) {
                        setCanPlayToday(false);
                    }
                }
            } catch (e) {
                console.error("Error fetching user data", e);
            } finally {
                setLoadingUser(false);
            }
        };
        fetchUserData();
    }, [user]);

    // Fetch History Data when tab changes
    useEffect(() => {
        if (activeTab === 'scores' && user) {
            // Load last game details
            const fetchLastGame = async () => {
                try {
                    const docRef = doc(db, 'users', user.uid, 'highlow', 'last_game');
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        setLastGameDetails(docSnap.data());
                    } else {
                        setLastGameDetails(null);
                    }
                } catch (e) {
                    console.error("Error fetching last game", e);
                }
            };
            
            // Load history list (initial)
            const fetchHistory = async () => {
                setHistoryLoading(true);
                try {
                    const q = query(
                        collection(db, 'users', user.uid, 'highlow_results'),
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

            fetchLastGame();
            fetchHistory();
        }
    }, [activeTab, user]);

    const loadMoreHistory = async () => {
        if (!user || !lastVisible) return;
        setHistoryLoading(true);
        try {
            const q = query(
                collection(db, 'users', user.uid, 'highlow_results'),
                orderBy('timestamp', 'desc'),
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

    // Fetch leaderboard
    useEffect(() => {
        if (activeTab !== 'ranking') return;

        setLeaderboardLoading(true);

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
        }

        const q = query(
            collection(db, 'highlow_leaderboards', docId, 'entries'),
            orderBy('score', 'desc'),
            limit(50)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                userId: doc.id,
                ...doc.data()
            })) as {name: string, score: number, userId: string}[];
            setLeaderboardData(data);
            setLeaderboardLoading(false);
        }, (error) => {
            console.error("Error fetching leaderboard:", error);
            setLeaderboardData([]);
            setLeaderboardLoading(false);
        });

        return () => unsub();
    }, [activeTab, leaderboardType, leaderboardYear, leaderboardMonth, leaderboardQuarter]);

    const handleUsernameSubmit = async () => {
        if (!user) return;
        
        // Validate
        if (username.length < 5) {
            setUsernameError(t('game.username.error.min'));
            return;
        }
        if (username.length > 25) {
            setUsernameError(t('game.username.error.max'));
            return;
        }
        if (!/^[a-zA-Z0-9 *]+$/.test(username)) {
            setUsernameError(t('game.username.error.chars'));
            return;
        }
        if (username.toLowerCase().includes('baro')) {
            setUsernameError(t('game.username.error.baro'));
            return;
        }

        setIsSavingUsername(true);
        setUsernameError('');

        try {
            const currentLogs = [...gameLogRef.current];
            
            // Save to profile
            const updateData: any = { username: username };
            if (score > highScore) {
                 updateData.highlow_highscore_questions = currentLogs.length;
            }
            await updateDoc(doc(db, 'users', user.uid), updateData);
            
            // Submit pending score
            try {
                await submitHighLowScore(user.uid, username, score, currentLogs);
            } catch (scoreErr: any) {
                // If it's just a config error (local dev), ignore it for the UI flow
                let isConfigError = false;
                try {
                    const errObj = JSON.parse(scoreErr.message);
                    if (errObj.error === 'CONFIG_ERROR') isConfigError = true;
                } catch {}
                
                if (isConfigError) {
                    console.warn("Leaderboard update skipped due to missing server config");
                } else {
                    throw scoreErr;
                }
            }
            
            setShowUsernameInput(false);
            
            // Update local highscore display if needed
            if (score > highScore) {
                setHighScoreDate(new Date().toISOString().split('T')[0]);
                setHighScoreQuestions(currentLogs.length);
            }
            setHighScore(Math.max(score, highScore));
            setLastPlayed(new Date().toISOString().split('T')[0]);
            setCanPlayToday(false);

        } catch (e) {
            console.error("Error saving username/score", e);
            setUsernameError("Error saving. Try again.");
        } finally {
            setIsSavingUsername(false);
        }
    };

    // Start Game
    const startGame = async () => {
        if (!canPlayToday) return;
        
        isEndingRef.current = false;

        // Deduct Credit
        if (!deductBaroCredit()) {
            alert(t('planner.no_credits_desc')); // Or show modal
            return;
        }
        // Force update if possible, but usageService usually handles localStorage. 
        // Ideally we sync with Firestore too if credits are server-side managed properly.
        
        setGameState('loading');
        const newQuestions = await generateQuiz();
        setQuestions(newQuestions);
        setGameState('playing');
        setCurrentIndex(0);
        setScore(0);
        setGlobalTimer(90);
        setQuestionTimer(getQuestionTime(0));
        setFeedback(null);
        setGameLog([]);
        gameLogRef.current = [];
        suspiciousStreakRef.current = 0;
        isFlaggedRef.current = false;
    };

    // Game Loop - Global Timer
    useEffect(() => {
        if (gameState === 'playing') {
            globalIntervalRef.current = setInterval(() => {
                setGlobalTimer(prev => {
                    if (prev <= 1) {
                        endGame();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (globalIntervalRef.current) clearInterval(globalIntervalRef.current);
        }
        return () => {
            if (globalIntervalRef.current) clearInterval(globalIntervalRef.current);
        };
    }, [gameState]);

    // Game Loop - Question Timer
    useEffect(() => {
        if (gameState === 'playing' && !feedback) {
            setQuestionTimer(getQuestionTime(currentIndex));
            questionIntervalRef.current = setInterval(() => {
                setQuestionTimer(prev => {
                    if (prev <= 0.1) {
                        // Time's up for question -> Game Over
                        endGame();
                        return 0;
                    }
                    return parseFloat((prev - 0.1).toFixed(1));
                });
            }, 100);
        } else {
            if (questionIntervalRef.current) clearInterval(questionIntervalRef.current);
        }
        return () => {
            if (questionIntervalRef.current) clearInterval(questionIntervalRef.current);
        };
    }, [gameState, currentIndex, feedback]);

    const handleAnswer = (answer: 'higher' | 'lower' | 'true' | 'false') => {
        if (gameState !== 'playing' || feedback) return;

        const currentQ = questions[currentIndex];
        const isCorrect = answer === currentQ.correctAnswer;
        
        let points = 0;
        const maxTime = getQuestionTime(currentIndex);
        const timeSpent = parseFloat((maxTime - questionTimer).toFixed(1));

        // Anti-Cheat Check
        if (isCorrect && timeSpent < 1.0) {
            suspiciousStreakRef.current += 1;
        } else {
            suspiciousStreakRef.current = 0;
        }

        if (suspiciousStreakRef.current >= 5) {
            isFlaggedRef.current = true;
            console.log("Activity flagged");
        }

        if (isCorrect) {
            // Calculate points: 
            // Base score: 10
            // Time bonus: (maxTime - timeSpent) / maxTime * 50
            // Speed bonus (Exponential):
            // If answered within 1s: +30
            // If answered within 2s: +20
            // If answered within 3s: +10
            
            const timeBonus = (questionTimer / maxTime) * 50;
            let speedBonus = 0;
            
            if (timeSpent <= 1.0) speedBonus = 30;
            else if (timeSpent <= 2.0) speedBonus = 25;
            else if (timeSpent <= 3.0) speedBonus = 20;
            else if (timeSpent <= 4.0) speedBonus = 15;
            else if (timeSpent <= 5.0) speedBonus = 10;
            else if (timeSpent <= 7.0) speedBonus = 5;
            else if (timeSpent <= 10.0) speedBonus = 1;
            
            points = Math.round(10 + timeBonus + speedBonus);
            
            setScore(prev => prev + points);
            setFeedback({ correct: true, points });
        } else {
            setFeedback({ correct: false, points: 0 });
        }

        // Log entry
        const entry: GameLogEntry = {
            question: currentQ,
            answer,
            correct: isCorrect,
            points,
            timeSpent: timeSpent
        };
        
        setGameLog(prev => [...prev, entry]);
        gameLogRef.current.push(entry);
        
        if (isCorrect) {
            // Wait briefly then next question
            setTimeout(() => {
                setFeedback(null);
                if (currentIndex < questions.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                    // Timer is reset by useEffect when currentIndex changes
                } else {
                    // Finished all questions (rare!)
                    endGame(true, score + points); 
                }
            }, 1000);
        } else {
            setTimeout(() => {
                endGame(false, score);
            }, 1500);
        }
    };

    const endGame = async (completedAll = false, overrideScore?: number) => {
        if (isEndingRef.current) return;
        isEndingRef.current = true;
        
        const finalScore = overrideScore !== undefined ? overrideScore : score;

        setFeedback(null); // Clear feedback overlay
        setGameState('finished');
        if (globalIntervalRef.current) clearInterval(globalIntervalRef.current);
        if (questionIntervalRef.current) clearInterval(questionIntervalRef.current);
        
        // Check if last question was logged
        const currentLogs = [...gameLogRef.current];
        // If we timed out or stopped before answering (and not completedAll), the last question might be missing from log
        // But handleAnswer adds to log immediately.
        // So this is only for Global Timeout or Question Timeout where handleAnswer wasn't called.
        // BUG FIX: Only add timeout if the question was actually active for a moment (questionTimer < 4.5) 
        // AND we haven't logged it yet.
        // Actually, if global timer runs out, questionTimer might be full (5.0) if we just switched.
        // We should NOT log a timeout for a question the user didn't see.
        
        // Only log timeout if we are NOT at the start of a new question (meaning we saw it)
        // If questionTimer is very close to 5, we probably just switched.
        // But questionTimer counts DOWN. So 5 is start.
        // Let's say if questionTimer < 4.5 (user had 0.5s to see it), we log it? 
        // Or simpler: If currentLogs.length === currentIndex, we are waiting for an answer.
        // If globalTimer killed it, we can check if we want to penalize.
        // The user says "Game Over and I see 'Time is up'".
        // If we just remove the "Timeout" logging for the "current" index if it wasn't answered, 
        // the log will just be shorter (only answered questions). This is probably better for "Last Game" view.
        
        // Let's ONLY add timeout if it was a QUESTION timeout (questionTimer <= 0.1).
        // If it was GLOBAL timeout (completedAll = false, but questionTimer > 0), we just stop.
        
        // However, we passed `completedAll` as false for global timeout.
        // We can check `questionTimer`.
        
        if (!completedAll && currentLogs.length === currentIndex && questions[currentIndex]) {
             // Only add if Question Timer ran out, OR if we really want to show they ran out of global time on this question.
             // If questionTimer <= 0.2, it's definitely a question timeout.
             if (questionTimer <= 0.2) {
                const currentQ = questions[currentIndex];
                const entry: GameLogEntry = {
                    question: currentQ,
                    answer: 'timeout',
                    correct: false,
                    points: 0,
                    timeSpent: 5
                };
                currentLogs.push(entry);
                setGameLog(currentLogs);
             }
             // Else (Global timeout), we don't add the partial question to the log.
        }

        // Save Score Logic
        if (user) {
            if (isFlaggedRef.current) {
                // If flagged, we do NOT save the score, but we pretend we did or show a validation error.
                // The user asked to be "careful", so we show a generic validation error.
                console.warn("Score submission blocked due to suspicious activity");
                // We can just show the game over screen without saving.
                // Or maybe trigger a "verification failed" toast?
                // For now, let's just NOT save, and let the UI show the score locally as "Final Score" but not Highscore.
                return;
            }

            try {
                // 1. Save Result History (Now handled by Cloud Function)
                // await addDoc(collection(db, 'users', user.uid, 'highlow_results'), {
                //     score: finalScore,
                //     timestamp: serverTimestamp()
                // });

                // 2. Save Detailed Last Game (Now handled by Cloud Function)
                // await setDoc(doc(db, 'users', user.uid, 'highlow', 'last_game'), {
                //     score: finalScore,
                //     timestamp: serverTimestamp(),
                //     questions: currentLogs
                // });

                // Check if user has username
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                const userData = userSnap.data();
                
                if (userData && userData.username) {
                    // Username exists, submit score directly
                    await submitHighLowScore(user.uid, userData.username, finalScore, currentLogs);
                    
                    if (finalScore > highScore) {
                        const today = new Date().toISOString().split('T')[0];
                        setHighScoreDate(today);
                        setHighScoreQuestions(currentLogs.length);
                        
                        // Save extra metadata for UI
                        try {
                            await updateDoc(doc(db, 'users', user.uid), {
                                highlow_highscore_questions: currentLogs.length
                            });
                        } catch (e) {
                            console.error("Failed to save highscore metadata", e);
                        }
                    }
                    setHighScore(Math.max(finalScore, highScore));
                    setLastPlayed(new Date().toISOString().split('T')[0]);
                    setCanPlayToday(false);
                } else {
                    // Prompt for username
                    // Update score state so UI shows correct score
                    if (overrideScore !== undefined) setScore(overrideScore);
                    setShowUsernameInput(true);
                }
            } catch (e: any) {
                console.error("Error saving score", e);
                // Fallback for missing server config (e.g. local dev without env vars)
                let isConfigError = false;
                try {
                    const errObj = JSON.parse(e.message);
                    if (errObj.error === 'CONFIG_ERROR') isConfigError = true;
                } catch {}

                if (isConfigError && user) {
                    console.warn("Falling back to client-side save due to server config error");
                    try {
                         // 1. Save Result History
                         await addDoc(collection(db, 'users', user.uid, 'highlow_results'), {
                             score: finalScore,
                             timestamp: serverTimestamp()
                         });
        
                         // 2. Save Detailed Last Game
                         await setDoc(doc(db, 'users', user.uid, 'highlow', 'last_game'), {
                             score: finalScore,
                             timestamp: serverTimestamp(),
                             questions: currentLogs
                         });

                         // 3. Update Highscore locally
                         const userRef = doc(db, 'users', user.uid);
                         const userSnap = await getDoc(userRef);
                         const userData = userSnap.data();
                         const currentHigh = userData?.highlow_highscore || 0;
                         
                         const updateData: any = {
                            last_played_highlow: new Date().toISOString().split('T')[0]
                         };

                         if (finalScore > currentHigh) {
                            updateData.highlow_highscore = finalScore;
                            updateData.highlow_highscore_date = new Date().toISOString().split('T')[0];
                            updateData.highlow_highscore_questions = currentLogs.length;
                            
                            // Update local state
                            setHighScore(finalScore);
                            setHighScoreDate(updateData.highlow_highscore_date);
                            setHighScoreQuestions(currentLogs.length);
                         }
                         
                         await updateDoc(userRef, updateData);
                         setLastPlayed(updateData.last_played_highlow);
                         setCanPlayToday(false);
                         
                    } catch (fallbackErr) {
                        console.error("Fallback save failed", fallbackErr);
                    }
                }
            }
        }
    };

    const currentQ = questions[currentIndex];

    // Helper to format date
    const formatDate = (date: Date | string | null | undefined) => {
        if (!date) return '';
        const d = typeof date === 'string' ? new Date(date) : date;
        // Check if date is valid
        if (isNaN(d.getTime())) return '';
        
        const day = d.getDate();
        const month = d.toLocaleDateString(settings.language, { month: 'short' });
        const year = d.getFullYear();
        // Ensure format dd-MMM-yyyy
        const cleanMonth = month.replace('.', '').slice(0, 3);
        // Capitalize first letter of month
        const capitalizedMonth = cleanMonth.charAt(0).toUpperCase() + cleanMonth.slice(1);
        return `${day}-${capitalizedMonth}-${year}`;
    };

    const formatTime = (date: Date | string | null | undefined) => {
        if (!date) return '';
        const d = typeof date === 'string' ? new Date(date) : date;
        // Check if date is valid
        if (isNaN(d.getTime())) return '';
        
        return d.toLocaleTimeString(settings.language, {
            hour: '2-digit', 
            minute: '2-digit',
            hour12: settings.timeFormat === '12h'
        });
    };

    const getYesterdayDate = () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return formatDate(d);
    };

    return (
        <div className="min-h-screen bg-bg-page text-text-main pb-24">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-bg-card/80 backdrop-blur-md border-b border-border-color p-4 flex items-center justify-between">
                <button onClick={() => onNavigate(ViewState.CURRENT)} className="p-2 hover:bg-bg-page rounded-full text-text-main transition-colors">
                    <Icon name="arrow_back" className="text-xl" />
                </button>
                <h1 className="font-bold text-lg">{t('game.highlow.title')}</h1>
                <div className="w-10" />
            </div>

            {/* Tabs */}
            <div className="flex p-2 gap-2 overflow-x-auto bg-bg-card border-b border-border-color no-scrollbar">
                {['play', 'scores', 'ranking', 'rules'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-6 py-3 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                            activeTab === tab 
                            ? 'bg-accent-primary text-white shadow-md' 
                            : 'bg-bg-page text-text-muted hover:bg-bg-subtle hover:text-text-main'
                        }`}
                    >
                        {t(`game.tab.${tab === 'scores' ? 'my_results' : tab === 'ranking' ? 'leaderboard' : tab}`)}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="p-4 max-w-2xl mx-auto">
                {activeTab === 'play' && (
                    <>
                        {gameState === 'intro' && (
                            <div className="text-center space-y-6 mt-8">
                                <div className="rounded-3xl overflow-hidden shadow-lg mx-auto max-w-sm mb-6 border border-border-color">
                                    <img src="/barogame.jpg" alt="Baro Game" className="w-full h-auto object-cover" />
                                </div>
                                <h2 className="text-2xl font-bold">{t('game.highlow.subtitle')}</h2>
                                <p className="text-text-muted px-4">{t('game.highlow.rules')}</p>
                                
                                {loadingUser ? (
                                    <div className="animate-pulse h-12 bg-bg-card rounded-xl" />
                                ) : !canPlayToday ? (
                                    <div className="p-6 bg-accent-secondary/10 rounded-xl border border-accent-secondary/20">
                                        <p className="text-accent-secondary font-bold text-lg mb-2">{t('game.highlow.come_back_tomorrow')}</p>
                                        <p className="text-sm text-text-muted">{t('game.highlow.already_played')}</p>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={startGame}
                                        className="w-full bg-accent-primary hover:bg-accent-hover text-white font-bold py-4 rounded-3xl text-lg shadow-xl shadow-accent-primary/30 transition-transform active:scale-95 flex items-center justify-center gap-3"
                                    >
                                        <Icon name="play_arrow" className="text-3xl" />
                                        {t('game.highlow.play_now')}
                                    </button>
                                )}
                                
                                <div 
                                    onClick={() => {
                                        setActiveTab('scores');
                                        setScoresTab('history');
                                    }}
                                    className="mt-8 relative overflow-hidden p-6 bg-gradient-to-br from-bg-card to-accent-primary/5 rounded-3xl border border-border-color shadow-sm cursor-pointer hover:shadow-md transition-all group"
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <Icon name="emoji_events" className="text-9xl text-accent-secondary transform rotate-12" />
                                    </div>
                                    
                                    <div className="relative z-10">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 bg-accent-secondary/10 rounded-lg">
                                                    <Icon name="emoji_events" className="text-accent-secondary" />
                                                </div>
                                                <p className="text-sm text-text-muted font-bold uppercase tracking-wider">Jouw Highscore</p>
                                            </div>
                                            <Icon name="chevron_right" className="text-text-muted group-hover:text-accent-primary transition-colors" />
                                        </div>
                                        
                                        <div className="flex items-baseline gap-2 mt-4">
                                            <p className="text-5xl font-black text-accent-secondary tracking-tight">{highScore}</p>
                                            <p className="text-sm text-text-muted font-bold">punten</p>
                                        </div>
                                        
                                        <div className="mt-2 space-y-1">
                                            {highScoreDate && (
                                                <p className="text-xs text-text-muted flex items-center gap-1 font-medium">
                                                    <Icon name="event" className="text-sm" />
                                                    {new Date(highScoreDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                    <span className="opacity-60 ml-1">
                                                        ({(() => {
                                                            const diff = Math.floor((new Date().setHours(0,0,0,0) - new Date(highScoreDate).setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
                                                            if (diff === 0) return 'Vandaag';
                                                            if (diff === 1) return 'Gisteren';
                                                            return `${diff} dagen geleden`;
                                                        })()})
                                                    </span>
                                                </p>
                                            )}
                                            {highScoreQuestions > 0 && (
                                                <p className="text-xs text-text-muted flex items-center gap-1 font-medium">
                                                    <Icon name="check_circle" className="text-sm" />
                                                    {highScoreQuestions} {highScoreQuestions === 1 ? 'vraag' : 'vragen'} goed
                                                </p>
                                            )}
                                        </div>
                                        
                                        <div className="mt-6 pt-4 border-t border-border-color flex items-center gap-2 text-xs font-bold text-accent-primary opacity-60 group-hover:opacity-100 transition-opacity">
                                            <span>Bekijk al je resultaten</span>
                                            <Icon name="arrow_forward" className="text-sm transition-transform group-hover:translate-x-1" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {gameState === 'loading' && (
                            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                                <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
                                <p>{t('loading')}</p>
                            </div>
                        )}

                        {(gameState === 'playing' || gameState === 'finished') && questions.length > 0 && (
                            <div className="space-y-4 relative max-w-5xl mx-auto">
                                {/* Top Bars */}
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs font-bold text-text-muted">
                                        <span>{t('game.highlow.time')}</span>
                                        <span>{globalTimer}s</span>
                                    </div>
                                    <div className="h-4 bg-bg-card rounded-full overflow-hidden border border-border-color">
                                        <div 
                                            className="h-full bg-accent-primary transition-all duration-1000 ease-linear"
                                            style={{ width: `${(globalTimer / 90) * 100}%` }}
                                        />
                                    </div>
                                    
                                    <div className="flex justify-between text-xs font-bold text-text-muted mt-2">
                                        <span>{t('game.highlow.question')}</span>
                                        <span className={`${(questionTimer / getQuestionTime(currentIndex)) < 0.25 ? 'text-red-500 animate-pulse' : ''}`}>{questionTimer.toFixed(1)}s</span>
                                    </div>
                                    <div className="h-2 bg-bg-card rounded-full overflow-hidden border border-border-color">
                                        <div 
                                            className={`h-full transition-all duration-100 ease-linear ${(questionTimer / getQuestionTime(currentIndex)) < 0.25 ? 'bg-red-500' : 'bg-blue-500'}`}
                                            style={{ width: `${(questionTimer / getQuestionTime(currentIndex)) * 100}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Score */}
                                <div className="absolute top-0 right-0 -mt-10 bg-bg-card px-3 py-1 rounded-full border border-border-color shadow-sm">
                                    <span className="font-bold text-accent-primary">{score}</span> pts
                                </div>

                                {/* Main Game Area: Split Layout for Desktop */}
                                <div className="flex flex-col md:flex-row gap-6 mt-4">
                                    
                                    {/* Left: Question & Controls */}
                                    <div className="flex-1 flex flex-col justify-center space-y-6 order-2 md:order-1">
                                        <div className={`${(questionTimer / getQuestionTime(currentIndex)) < 0.25 ? 'bg-orange-100 dark:bg-orange-900/20 animate-pulse' : 'bg-bg-card/90'} backdrop-blur rounded-3xl p-8 shadow-lg border border-border-color text-center relative overflow-hidden transition-colors duration-300`}>
                                            {/* Decorative background element */}
                                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent-primary to-accent-secondary opacity-50" />
                                            
                                            <h3 className="text-xl md:text-3xl font-bold leading-tight mt-2">
                                                {settings.language === 'nl' 
                                                    ? currentQ.questionText.nl
                                                        .replace('{date}', getYesterdayDate())
                                                        .replace('{value}', Math.round(currentQ.targetValue || 0).toString())
                                                        .replace('{city}', currentQ.cityA.name)
                                                        .replace('{cityA}', currentQ.cityA.name)
                                                        .replace('{cityB}', currentQ.cityB?.name || '')
                                                        .replace(currentQ.cityA.name, `${currentQ.cityA.name} (${getCountryName(currentQ.cityA.country, 'nl')})`)
                                                        .replace(currentQ.cityB?.name || 'NONEXISTENT', `${currentQ.cityB?.name} (${getCountryName(currentQ.cityB?.country || '', 'nl')})`)
                                                    : currentQ.questionText.en
                                                        .replace('{date}', getYesterdayDate())
                                                        .replace('{value}', Math.round(currentQ.targetValue || 0).toString())
                                                        .replace('{city}', currentQ.cityA.name)
                                                        .replace('{cityA}', currentQ.cityA.name)
                                                        .replace('{cityB}', currentQ.cityB?.name || '')
                                                        .replace(currentQ.cityA.name, `${currentQ.cityA.name} (${getCountryName(currentQ.cityA.country, 'en')})`)
                                                        .replace(currentQ.cityB?.name || 'NONEXISTENT', `${currentQ.cityB?.name} (${getCountryName(currentQ.cityB?.country || '', 'en')})`)
                                                }
                                            </h3>
                                        </div>

                                        {/* Buttons */}
                                        {gameState === 'playing' && (
                                            <div className="grid grid-cols-2 gap-4">
                                                {currentQ.type === 'solo' ? (
                                                    <>
                                                        <button 
                                                            onClick={() => handleAnswer('higher')}
                                                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-8 rounded-3xl text-xl shadow-lg transform transition active:scale-95 flex flex-col items-center border-b-4 border-green-700 active:border-b-0 active:mt-1"
                                                        >
                                                            <Icon name="arrow_upward" className="text-4xl mb-2" />
                                                            {t('game.highlow.higher')}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleAnswer('lower')}
                                                            className="bg-red-500 hover:bg-red-600 text-white font-bold py-8 rounded-3xl text-xl shadow-lg transform transition active:scale-95 flex flex-col items-center border-b-4 border-red-700 active:border-b-0 active:mt-1"
                                                        >
                                                            <Icon name="arrow_downward" className="text-4xl mb-2" />
                                                            {t('game.highlow.lower')}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button 
                                                            onClick={() => handleAnswer('true')}
                                                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-8 rounded-3xl text-xl shadow-lg transform transition active:scale-95 flex flex-col items-center border-b-4 border-green-700 active:border-b-0 active:mt-1"
                                                        >
                                                            <Icon name="check" className="text-4xl mb-2" />
                                                            {t('game.highlow.yes')}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleAnswer('false')}
                                                            className="bg-red-500 hover:bg-red-600 text-white font-bold py-8 rounded-3xl text-xl shadow-lg transform transition active:scale-95 flex flex-col items-center border-b-4 border-red-700 active:border-b-0 active:mt-1"
                                                        >
                                                            <Icon name="close" className="text-4xl mb-2" />
                                                            {t('game.highlow.no')}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: Map(s) */}
                                    <div className="hidden md:flex flex-1 flex-col gap-4 h-[500px] order-1 md:order-2">
                                        {currentQ.type === 'duel' && currentQ.cityB ? (
                                            // Dual Maps
                                            <>
                                                <div className="flex-1 rounded-3xl overflow-hidden shadow-md border border-border-color relative z-0 min-h-[200px]">
                                                    <MapContainer 
                                                        key={`map-a-${currentQ.id}`}
                                                        center={[currentQ.cityA.lat, currentQ.cityA.lon]} 
                                                        zoom={4} 
                                                        zoomControl={false}
                                                        scrollWheelZoom={false}
                                                        dragging={false}
                                                        className="h-full w-full"
                                                    >
                                                        <TileLayer
                                                            url={settings.mapBaseLayer === 'dark' 
                                                                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
                                                                : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
                                                        />
                                                        <Marker position={[currentQ.cityA.lat, currentQ.cityA.lon]}>
                                                            <Popup autoPan={false}>{currentQ.cityA.name}</Popup>
                                                        </Marker>
                                                    </MapContainer>
                                                    <div className="absolute top-2 left-2 bg-bg-card/80 backdrop-blur px-2 py-1 rounded text-xs font-bold shadow-sm z-[401]">
                                                        {currentQ.cityA.name}
                                                    </div>
                                                </div>
                                                <div className="flex-1 rounded-3xl overflow-hidden shadow-md border border-border-color relative z-0 min-h-[200px]">
                                                    <MapContainer 
                                                        key={`map-b-${currentQ.id}`}
                                                        center={[currentQ.cityB.lat, currentQ.cityB.lon]} 
                                                        zoom={4} 
                                                        zoomControl={false}
                                                        scrollWheelZoom={false}
                                                        dragging={false}
                                                        className="h-full w-full"
                                                    >
                                                        <TileLayer
                                                            url={settings.mapBaseLayer === 'dark' 
                                                                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
                                                                : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
                                                        />
                                                        <Marker position={[currentQ.cityB.lat, currentQ.cityB.lon]}>
                                                            <Popup autoPan={false}>{currentQ.cityB.name}</Popup>
                                                        </Marker>
                                                    </MapContainer>
                                                    <div className="absolute top-2 left-2 bg-bg-card/80 backdrop-blur px-2 py-1 rounded text-xs font-bold shadow-sm z-[401]">
                                                        {currentQ.cityB.name}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            // Solo Map
                                            <div className="h-full w-full rounded-3xl overflow-hidden shadow-md border border-border-color relative z-0 min-h-[300px]">
                                                <MapContainer 
                                                    key={`map-solo-${currentQ.id}`}
                                                    center={[currentQ.cityA.lat, currentQ.cityA.lon]} 
                                                    zoom={4} 
                                                    zoomControl={false}
                                                    scrollWheelZoom={false}
                                                    dragging={false}
                                                    className="h-full w-full"
                                                >
                                                    <TileLayer
                                                        url={settings.mapBaseLayer === 'dark' 
                                                            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
                                                            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
                                                    />
                                                    <Marker position={[currentQ.cityA.lat, currentQ.cityA.lon]}>
                                                        <Popup autoPan={false}>{currentQ.cityA.name}</Popup>
                                                    </Marker>
                                                </MapContainer>
                                                <div className="absolute bottom-4 left-4 bg-bg-card/80 backdrop-blur px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm z-[401]">
                                        {currentQ.cityA.name}, {getCountryName(currentQ.cityA.country, settings.language === 'nl' ? 'nl' : 'en')}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                                
                                {/* Feedback Overlay */}
                                {feedback && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                                        <div className={`transform scale-110 p-8 rounded-3xl shadow-2xl text-center border-4 ${feedback.correct ? 'bg-green-100 border-green-500 text-green-800' : 'bg-red-100 border-red-500 text-red-800'}`}>
                                            <Icon name={feedback.correct ? 'check_circle' : 'cancel'} className="text-6xl mb-4 mx-auto" />
                                            <h2 className="text-3xl font-black mb-2">{feedback.correct ? t('game.highlow.correct') : t('game.highlow.wrong')}</h2>
                                            {feedback.correct && (
                                                <p className="text-xl font-bold">+{feedback.points} {t('game.highlow.points')}</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Game Over Overlay */}
                                {gameState === 'finished' && (
                                    <div className="fixed inset-0 z-[100] bg-bg-page/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
                                        <div className="bg-bg-card p-8 rounded-[2rem] shadow-2xl border border-border-color w-full max-w-md relative overflow-hidden transform scale-100 transition-all">
                                            {/* Decorative Background */}
                                            <div className="absolute inset-0 opacity-10 bg-[url('/barogame.jpg')] bg-cover bg-center mix-blend-overlay pointer-events-none" />
                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-primary via-yellow-400 to-accent-secondary" />

                                            {/* Confetti or decoration */}
                                            {score > highScore && (
                                                <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                                                    <div className="absolute top-0 left-1/4 w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
                                                    <div className="absolute top-10 right-1/4 w-3 h-3 bg-red-500 rounded-full animate-bounce" />
                                                </div>
                                            )}
                                            
                                            <div className="relative z-10 text-center">
                                                {showUsernameInput ? (
                                                    <div className="animate-in fade-in slide-in-from-bottom duration-300">
                                                         <div className="w-20 h-20 bg-accent-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                                            <Icon name="person" className="text-5xl text-accent-primary" />
                                                         </div>
                                                         <h2 className="text-2xl font-bold mb-2 text-text-main">{t('game.username.title')}</h2>
                                                         <p className="text-text-muted mb-6 text-sm">{t('game.username.desc')}</p>
                                                         
                                                         <div className="space-y-4">
                                                            <input 
                                                                type="text"
                                                                value={username}
                                                                onChange={(e) => setUsername(e.target.value)}
                                                                placeholder={t('game.username.placeholder')}
                                                                className="w-full bg-bg-page border border-border-color rounded-xl p-4 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-accent-primary shadow-inner"
                                                            />
                                                            {usernameError && (
                                                                <p className="text-red-500 text-sm font-bold animate-pulse">{usernameError}</p>
                                                            )}
                                                            <button 
                                                                onClick={handleUsernameSubmit}
                                                                disabled={isSavingUsername}
                                                                className="w-full bg-accent-primary hover:bg-accent-hover text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent-primary/20 transition-transform active:scale-95 flex items-center justify-center gap-2"
                                                            >
                                                                {isSavingUsername ? <LoadingSpinner size="sm" color="white" /> : <><Icon name="save" /> {t('game.username.save')}</>}
                                                            </button>
                                                         </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="mb-6">
                                                            <Icon name="emoji_events" className={`text-8xl filter drop-shadow-lg ${score > highScore ? 'text-yellow-400 animate-bounce' : 'text-accent-primary'}`} />
                                                        </div>
                                                        
                                                        <h2 className="text-3xl font-black mb-2 text-text-main">{t('game.highlow.game_over')}</h2>
                                                        {isFlaggedRef.current ? (
                                                            <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl mb-6 border border-red-200 dark:border-red-800">
                                                                <p className="text-red-600 dark:text-red-400 font-bold text-sm">
                                                                    Score niet geverifieerd.
                                                                </p>
                                                                <p className="text-xs text-red-500/80 mt-1">
                                                                    Ongebruikelijk speelgedrag gedetecteerd.
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <p className="text-text-muted mb-8 font-medium">{score > highScore ? t('game.highlow.new_highscore') : t('game.highlow.final_score')}</p>
                                                        )}
                                                        
                                                        <div className="bg-bg-page/50 rounded-2xl p-6 mb-8 border border-border-color/50">
                                                            <div className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-accent-primary to-accent-secondary">
                                                                {score}
                                                            </div>
                                                            <div className="text-xs font-bold uppercase tracking-widest text-text-muted mt-1">{t('game.highlow.points')}</div>
                                                        </div>
                                                        
                                                        <div className="w-full space-y-3">
                                                            <button 
                                                                onClick={() => {
                                                                    setActiveTab('scores');
                                                                    setGameState('intro');
                                                                }}
                                                                className="w-full bg-accent-primary hover:bg-accent-hover text-white font-bold py-4 rounded-2xl shadow-lg shadow-accent-primary/20 transition-all transform active:scale-95 flex items-center justify-center gap-2"
                                                            >
                                                                <Icon name="list_alt" />
                                                                {t('game.tab.my_results')}
                                                            </button>
                                                            
                                                            <button 
                                                                onClick={() => {
                                                                    setGameState('intro');
                                                                    setActiveTab('play');
                                                                }}
                                                                className="w-full bg-transparent hover:bg-bg-page text-text-muted hover:text-text-main font-bold py-3 rounded-2xl transition-colors border border-transparent hover:border-border-color"
                                                            >
                                                                {t('common.back')}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'scores' && (
                    <div className="space-y-4">
                        <div className="flex p-1 bg-bg-card rounded-xl border border-border-color">
                            <button 
                                onClick={() => setScoresTab('last_game')}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                                    scoresTab === 'last_game' 
                                        ? 'bg-accent-primary text-white shadow-md' 
                                        : 'text-text-muted hover:text-text-main hover:bg-bg-page'
                                }`}
                            >
                                {t('game.tab.last_game') || 'Laatste Spel'}
                            </button>
                            <button 
                                onClick={() => setScoresTab('history')}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                                    scoresTab === 'history' 
                                        ? 'bg-accent-primary text-white shadow-md' 
                                        : 'text-text-muted hover:text-text-main hover:bg-bg-page'
                                }`}
                            >
                                {t('game.tab.history') || 'Geschiedenis'}
                            </button>
                        </div>

                        {scoresTab === 'last_game' && (
                            <div className="space-y-4">
                                {lastGameDetails ? (
                                    <>
                                        <div className="bg-bg-card p-4 rounded-xl border border-border-color flex justify-between items-center">
                                            <div>
                                                <p className="text-xs text-text-muted uppercase font-bold">Datum</p>
                                                <p className="font-bold">
                                                    {lastGameDetails.timestamp?.toDate ? `${formatDate(lastGameDetails.timestamp.toDate())} ${formatTime(lastGameDetails.timestamp.toDate())}` : 'Just now'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-text-muted uppercase font-bold">Score</p>
                                                <p className="text-2xl font-black text-accent-primary">{lastGameDetails.score}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            {lastGameDetails.questions && lastGameDetails.questions.map((entry: GameLogEntry, idx: number) => {
                                                const q = entry.question;
                                                const maxTime = getQuestionTime(idx);
                                                const timeLeft = Math.max(0, maxTime - entry.timeSpent);
                                                const percentLeft = Math.round((timeLeft / maxTime) * 100);
                                                
                                                let deviation = '-';
                                                if (q.type === 'solo' && q.actualValueA !== undefined && q.targetValue !== undefined) {
                                                    deviation = Math.round(Math.abs(q.actualValueA - q.targetValue)) + '°';
                                                } else if (q.type === 'duel' && q.actualValueA !== undefined && q.actualValueB !== undefined) {
                                                    deviation = Math.round(Math.abs(q.actualValueA - q.actualValueB)) + '°';
                                                }

                                                // Determine correct answer display
                                                let correctAnswerDisplay = '';
                                                if (q.correctAnswer === 'true' || q.correctAnswer === 'false') {
                                                    correctAnswerDisplay = t(`game.highlow.${q.correctAnswer}`);
                                                } else {
                                                    correctAnswerDisplay = t(`game.highlow.${q.correctAnswer}`);
                                                }

                                                return (
                                                    <div key={idx} className={`${!entry.correct ? 'bg-red-50 dark:bg-red-900/10' : 'bg-bg-card'} p-4 rounded-xl border border-border-color relative overflow-hidden transition-colors`}>
                                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${entry.correct ? 'bg-green-500' : 'bg-red-500'}`} />
                                                        
                                                        <div className="pl-3">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-bold bg-bg-page px-2 py-1 rounded text-text-muted w-fit mb-1">
                                                                        Vraag {idx + 1}
                                                                    </span>
                                                                    {/* Country Info */}
                                                                    <div className="text-xs text-text-muted flex gap-2">
                                                                        <span>📍 {q.cityA.name} ({getCountryName(q.cityA.country, settings.language === 'nl' ? 'nl' : 'en')})</span>
                                                                        {q.cityB && <span>vs {q.cityB.name} ({getCountryName(q.cityB.country, settings.language === 'nl' ? 'nl' : 'en')})</span>}
                                                                    </div>
                                                                </div>
                                                                
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-text-muted">
                                                                            {entry.timeSpent}s / {maxTime}s
                                                                        </span>
                                                                        <span className={`font-bold ${entry.correct ? 'text-green-500' : 'text-red-500'}`}>
                                                                            {entry.points} pts
                                                                        </span>
                                                                    </div>
                                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${percentLeft < 25 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                                        {percentLeft}% tijd over
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <p className="text-sm font-medium mb-3 mt-2">
                                                                {settings.language === 'nl' 
                                                                    ? q.questionText.nl
                                                                        .replace('{date}', 'gisteren')
                                                                        .replace('{value}', Math.round(q.targetValue || 0).toString())
                                                                        .replace('{city}', q.cityA.name)
                                                                        .replace('{cityA}', q.cityA.name)
                                                                        .replace('{cityB}', q.cityB?.name || '')
                                                                        .replace(q.cityA.name, `${q.cityA.name} (${getCountryName(q.cityA.country, 'nl')})`)
                                                                        .replace(q.cityB?.name || 'NONEXISTENT', `${q.cityB?.name} (${getCountryName(q.cityB?.country || '', 'nl')})`)
                                                                    : q.questionText.en
                                                                        .replace('{date}', 'yesterday')
                                                                        .replace('{value}', Math.round(q.targetValue || 0).toString())
                                                                        .replace('{city}', q.cityA.name)
                                                                        .replace('{cityA}', q.cityA.name)
                                                                        .replace('{cityB}', q.cityB?.name || '')
                                                                        .replace(q.cityA.name, `${q.cityA.name} (${getCountryName(q.cityA.country, 'en')})`)
                                                                        .replace(q.cityB?.name || 'NONEXISTENT', `${q.cityB?.name} (${getCountryName(q.cityB?.country || '', 'en')})`)
                                                                }
                                                            </p>

                                                            <div className="grid grid-cols-3 gap-2 text-xs bg-bg-page/50 p-2 rounded-lg">
                                                                <div>
                                                                    <span className="text-text-muted block">Jouw antwoord</span>
                                                                    <span className={`font-bold capitalize ${!entry.correct ? 'text-red-500' : 'text-green-500'}`}>
                                                                        {t(`game.highlow.${entry.answer}`) || entry.answer}
                                                                    </span>
                                                                </div>
                                                                <div className="text-center border-l border-r border-border-color/50 px-2">
                                                                    <span className="text-text-muted block">Afwijking</span>
                                                                    <span className="font-bold">{deviation}</span>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="text-text-muted block">Echt antwoord</span>
                                                                    <span className="font-bold text-accent-primary capitalize">
                                                                        {correctAnswerDisplay}
                                                                    </span>
                                                                </div>
                                                                
                                                                {q.type === 'solo' && (
                                                                    <div className="col-span-3 mt-2 pt-2 border-t border-border-color/50 flex justify-between text-xs">
                                                                         <div className="flex flex-col items-start">
                                                                             <span className="text-text-muted">{t('game.highlow.reference_temp')}</span>
                                                                             <span className="font-bold text-sm">{Math.round(q.targetValue || 0)}°C</span>
                                                                         </div>
                                                                         <div className="flex flex-col items-end">
                                                                             <span className="text-text-muted">{t('game.highlow.actual_temp')}</span>
                                                                             <span className="font-bold text-sm">{Math.round(q.actualValueA || 0)}°C</span>
                                                                         </div>
                                                                    </div>
                                                                )}
                                                                {q.type === 'duel' && (
                                                                    <div className="col-span-3 mt-2 pt-2 border-t border-border-color/50 flex justify-between text-xs">
                                                                         <div className="flex flex-col items-start">
                                                                             <span className="text-text-muted">{q.cityA.name}</span>
                                                                             <span className="font-bold text-sm">{Math.round(q.actualValueA || 0)}°C</span>
                                                                         </div>
                                                                         <div className="flex flex-col items-end">
                                                                             <span className="text-text-muted">{q.cityB?.name}</span>
                                                                             <span className="font-bold text-sm">{Math.round(q.actualValueB || 0)}°C</span>
                                                                         </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center py-12 text-text-muted">
                                        <p>Nog geen spel gespeeld.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {scoresTab === 'history' && (
                            <div className="space-y-4">
                                {/* Highscore Card */}
                                <div className="bg-gradient-to-br from-accent-primary to-accent-secondary p-6 rounded-2xl shadow-lg text-white relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-20">
                                        <Icon name="emoji_events" className="text-8xl" />
                                    </div>
                                    <p className="text-sm font-bold uppercase tracking-wider opacity-80 mb-1">Jouw Highscore</p>
                                    <div className="text-5xl font-black mb-2">{highScore}</div>
                                    <p className="text-sm opacity-80">
                                        {highScoreDate ? formatDate(highScoreDate) : 'Nog geen datum'}
                                    </p>
                                </div>

                                {/* History List */}
                                <div className="space-y-2">
                                    {historyData.map((item) => (
                                        <div key={item.id} className="bg-bg-card p-4 rounded-xl border border-border-color flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-text-main">
                                                    {item.timestamp?.toDate ? formatDate(item.timestamp.toDate()) : 'Onbekend'}
                                                </p>
                                                <p className="text-xs text-text-muted">
                                                    {item.timestamp?.toDate ? formatTime(item.timestamp.toDate()) : ''}
                                                </p>
                                            </div>
                                            <div className="font-black text-xl text-accent-primary">
                                                {item.score}
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {historyLoading && <div className="py-4 text-center"><LoadingSpinner /></div>}
                                    
                                    {!historyLoading && hasMoreHistory && historyData.length > 0 && (
                                        <button 
                                            onClick={loadMoreHistory}
                                            className="w-full py-3 text-sm font-bold text-text-muted hover:text-text-main hover:bg-bg-card rounded-xl transition-colors"
                                        >
                                            Laad meer
                                        </button>
                                    )}

                                    {!historyLoading && historyData.length === 0 && (
                                        <div className="text-center py-8 text-text-muted">
                                            Nog geen geschiedenis.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                {activeTab === 'ranking' && (
                    <div className="space-y-4">
                        {/* Filters */}
                        <div className="bg-bg-card p-4 rounded-xl border border-border-color space-y-4">
                            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                {['all_time', 'year', 'quarter', 'month', 'day'].map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => setLeaderboardType(type as any)}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                                            leaderboardType === type
                                                ? 'bg-accent-primary text-white shadow-md'
                                                : 'bg-bg-page text-text-muted hover:bg-bg-subtle hover:text-text-main'
                                        }`}
                                    >
                                        {type === 'day' ? t('game.day') : t(`game.filter.${type}`)}
                                    </button>
                                ))}
                            </div>
                            
                            <div className="flex gap-2">
                                {['year', 'quarter', 'month'].includes(leaderboardType) && (
                                    <select 
                                        value={leaderboardYear} 
                                        onChange={(e) => setLeaderboardYear(Number(e.target.value))}
                                        className="bg-bg-page border border-border-color rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent-primary"
                                    >
                                        {[2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                )}

                                {leaderboardType === 'quarter' && (
                                    <select 
                                        value={leaderboardQuarter} 
                                        onChange={(e) => setLeaderboardQuarter(Number(e.target.value))}
                                        className="bg-bg-page border border-border-color rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent-primary"
                                    >
                                        {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
                                    </select>
                                )}

                                {leaderboardType === 'month' && (
                                    <select 
                                        value={leaderboardMonth} 
                                        onChange={(e) => setLeaderboardMonth(Number(e.target.value))}
                                        className="bg-bg-page border border-border-color rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent-primary"
                                    >
                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                            <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString(settings.language, { month: 'long' })}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {/* Dynamic Title */}
                        <div className="text-center mb-2">
                            <h3 className="text-lg font-bold text-text-main">
                                {leaderboardType === 'all_time' && t('game.leaderboard.all_time')}
                                {leaderboardType === 'year' && `${t('game.filter.year')} ${leaderboardYear}`}
                                {leaderboardType === 'quarter' && `${t('game.filter.year')} ${leaderboardYear} - Q${leaderboardQuarter}`}
                                {leaderboardType === 'month' && `${t('game.filter.year')} ${leaderboardYear} - ${new Date(2000, leaderboardMonth - 1).toLocaleString(settings.language, { month: 'long' })}`}
                                {leaderboardType === 'day' && t('game.day')}
                            </h3>
                        </div>

                        {/* List */}
                        <div className="bg-bg-card rounded-xl border border-border-color overflow-hidden">
                            {leaderboardLoading ? (
                                <div className="text-center py-8"><LoadingSpinner /></div>
                            ) : leaderboardData.length > 0 ? (
                                <div className="divide-y divide-border-color">
                                    {leaderboardData.map((entry, index) => {
                                        const rank = index + 1;
                                        return (
                                            <div key={entry.userId} className={`p-4 flex items-center gap-4 ${entry.userId === user?.uid ? 'bg-accent-primary/10' : ''}`}>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-sm ${
                                                    rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white' :
                                                    rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-white' :
                                                    rank === 3 ? 'bg-gradient-to-br from-orange-400 to-orange-700 text-white' : 'bg-bg-page text-text-muted border border-border-color'
                                                }`}>
                                                    {rank}
                                                </div>
                                                <div className="flex-1">
                                                    <p className={`font-bold ${entry.userId === user?.uid ? 'text-accent-primary' : 'text-text-main'}`}>
                                                        {entry.name || 'Anonymous'} {entry.userId === user?.uid && t('game.you')}
                                                    </p>
                                                </div>
                                                <div className="font-bold text-accent-primary">
                                                    {entry.score} <span className="text-[10px] text-text-muted uppercase font-normal">pts</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-text-muted">
                                    <p>{t('game.leaderboard.empty')}</p>
                                </div>
                            )}
                            <div className="bg-bg-page/50 p-2 text-center text-[10px] text-text-muted border-t border-border-color">
                                {t('game.leaderboard.footer')}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'rules' && (
                    <div className="space-y-6">
                        <div className="rounded-3xl overflow-hidden shadow-lg border border-border-color">
                            <img src="/barogame.jpg" alt="Baro Game" className="w-full h-48 object-cover" />
                        </div>

                        <div className="bg-bg-card p-6 rounded-2xl border border-border-color shadow-sm">
                            <h2 className="text-2xl font-bold mb-4 text-text-main">{t('game.explanation_title')}</h2>
                            <p className="text-text-main mb-6 leading-relaxed">
                                Speel elke dag gratis mee met Baro's Hoog/Laag expert! We stellen je 15 vragen over het weer van gisteren op verschillende plekken in de wereld. Weet jij of het warmer of kouder was?
                            </p>
                            
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="bg-bg-page p-4 rounded-xl border border-border-color">
                                    <h4 className="font-bold mb-2 flex items-center gap-2 text-text-main">
                                        <Icon name="casino" className="text-accent-primary" />
                                        Hoe werkt het?
                                    </h4>
                                    <ul className="text-sm text-text-muted leading-relaxed list-disc pl-5 space-y-1">
                                        <li>Je krijgt 15 vragen.</li>
                                        <li>Je hebt 90 seconden in totaal.</li>
                                        <li>De tijd per vraag start bij 15s en loopt af naar 5s.</li>
                                        <li>Sneller antwoorden = meer punten!</li>
                                        <li>1 fout = Game Over.</li>
                                        <li>Je hebt 1 poging per dag.</li>
                                        <li>Deelname is gratis, weerdata via weather credits.</li>
                                        <li>En ja, iedereen krijgt een unieke vragenset!</li>
                                    </ul>
                                </div>
                                <div className="bg-bg-page p-4 rounded-xl border border-border-color">
                                     <h4 className="font-bold mb-2 flex items-center gap-2 text-text-main">
                                        <Icon name="military_tech" className="text-yellow-500" />
                                        Puntentelling
                                    </h4>
                                    <p className="text-sm text-text-muted leading-relaxed mb-2">
                                        Voor elk goed antwoord krijg je 10 punten + bonuspunten voor de snelheid. Hoe sneller je bent, hoe hoger je score!
                                    </p>
                                    <p className="text-sm text-text-muted leading-relaxed">
                                        Win Weather Credits voor de hoogste maandscore!
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <CreditFloatingButton onNavigate={onNavigate} settings={settings} currentView={ViewState.HIGHLOW_GAME} />
        </div>
    );
};
