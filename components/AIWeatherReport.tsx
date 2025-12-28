import React, { useState, useEffect } from 'react';
import { OpenMeteoResponse, AIProfile, ViewState, ActivityType, AppLanguage } from '../types';
import { generateAIWeatherReport } from '../services/geminiService';
import { Icon } from './Icon';
import { useAuth } from '../contexts/AuthContext';
import { trackAiCall, getUsage } from '../services/usageService';
import { searchCityByName } from '../services/geoService';
import { fetchForecast, getActivityIcon, getScoreColor } from '../services/weatherService';
import { calculateActivityScore, ActivityScore, ActivityWeatherData } from '../services/activityService';
import { getTranslation } from '../services/translations';

const activityTranslations: Record<string, string> = {
    bbq: 'BBQ',
    cycling: 'Fietsen',
    walking: 'Wandelen',
    sailing: 'Zeilen',
    running: 'Hardlopen',
    beach: 'Strand',
    gardening: 'Tuinieren',
    stargazing: 'Sterrenkijken',
    golf: 'Golf',
    drone: 'Drone',
    home: 'Thuis',
    work: 'Werk'
};

interface Props {
    weatherData: OpenMeteoResponse; // This is the app-wide weather data, might not be used if profile has specific location
    profile: AIProfile | undefined;
    profiles?: AIProfile[];
    onNavigate: (view: ViewState, params?: any) => void;
    language?: AppLanguage;
}

interface DayScore {
    date: string;
    scores: { type: ActivityType; score: ActivityScore }[];
}

export const AIWeatherReport: React.FC<Props> = ({ weatherData: appWeatherData, profile, profiles, onNavigate, language }) => {
    const { user } = useAuth();
    const t = (key: string) => getTranslation(key, language || 'nl');
    const [report, setReport] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activityScores, setActivityScores] = useState<DayScore[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [reportDate, setReportDate] = useState<Date | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('aiReportCollapsed');
        return saved === 'true';
    });

    const isEdwin = user?.email === 'edwin@editsolutions.nl';

    useEffect(() => {
        localStorage.setItem('aiReportCollapsed', String(isCollapsed));
    }, [isCollapsed]);

    const handleGenerate = async (selectedProfile: AIProfile) => {
        if (!isEdwin) return;
        
        // Check limits
        const stats = getUsage();
        if (stats.aiCalls >= 25) {
             setError("Je dagelijkse AI limiet is bereikt (25/25).");
             return;
        }

        // 1. Validatie
        if (!selectedProfile) {
            setError("Kies eerst een profiel.");
            return;
        }

        if (!selectedProfile.name) {
            setError("Het profiel moet een naam hebben. Pas dit aan in de instellingen.");
            return;
        }

        if (!selectedProfile.location) {
            setError("Het profiel moet een locatie bevatten. Pas dit aan in de instellingen.");
            return;
        }

        setLoading(true);
        setError(null);
        setReport(null);
        setActivityScores([]);
        setReportDate(null);
        setIsCollapsed(false);

        try {
            // 2. Locatie ophalen
            const locations = await searchCityByName(selectedProfile.location, 'nl');
            if (!locations || locations.length === 0) {
                throw new Error(`Locatie '${selectedProfile.location}' niet gevonden.`);
            }
            const loc = locations[0];

            // 3. Weerdata ophalen voor deze specifieke locatie
            const forecast = await fetchForecast(loc.lat, loc.lon);
            if (!forecast || !forecast.daily) {
                throw new Error("Kon geen weergegevens ophalen voor deze locatie.");
            }

            // 4. Activiteitenscores berekenen (Systeem, niet AI)
            // ALLEEN als het GEEN algemeen rapport is
            if (!selectedProfile.isGeneralReport) {
                const daysAhead = selectedProfile.daysAhead || 3;
                const calculatedScores: DayScore[] = [];
                let activities: ActivityType[] = [];
                
                if (Array.isArray(selectedProfile.activities)) {
                    activities = selectedProfile.activities;
                } else if (typeof selectedProfile.activities === 'string') {
                    // Try to parse comma separated string
                    activities = selectedProfile.activities.split(',').map(s => s.trim()) as ActivityType[];
                }

                if (activities.length > 0) {
                    for (let i = 0; i < Math.min(daysAhead, forecast.daily.time.length); i++) {
                        // Map forecast daily data to ActivityWeatherData
                        // Note: This is an approximation based on daily aggregates
                        const dailyData: ActivityWeatherData = {
                            tempFeelsLike: (forecast.daily.temperature_2m_max[i] + forecast.daily.temperature_2m_min[i]) / 2,
                            windKmh: forecast.daily.wind_speed_10m_max[i],
                            precipMm: forecast.daily.precipitation_sum[i],
                            precipProb: forecast.daily.precipitation_probability_max[i],
                            gustsKmh: forecast.daily.wind_gusts_10m_max[i],
                            weatherCode: forecast.daily.weather_code[i],
                            sunChance: 50, // Default, hard to calc from daily only without sunshine_duration normalized
                            cloudCover: 50,
                            visibility: 10000
                        };

                        // If sunshine_duration is available (seconds)
                        if (forecast.daily.sunshine_duration && forecast.daily.sunshine_duration[i] !== null) {
                             // Max daylight approx 12-16h depending on season, let's take a ratio if daylight_duration exists
                             // or just a rough check.
                             // Let's rely on precipitation prob mostly for bad weather.
                             // Actually sunshine_duration is in seconds.
                             const hours = forecast.daily.sunshine_duration[i] / 3600;
                             dailyData.sunChance = Math.min(100, (hours / 12) * 100); 
                        }

                        const dayScores = activities.map(act => ({
                            type: act,
                            score: calculateActivityScore(dailyData, act, 'nl')
                        }));

                        calculatedScores.push({
                            date: forecast.daily.time[i],
                            scores: dayScores
                        });
                    }
                    setActivityScores(calculatedScores);
                }
            }

            // 5. AI Rapport Genereren
            // Get User Name from Auth Context or Profile
            let userName = user?.email?.split('@')[0] || selectedProfile.name || "Gebruiker";
            // Capitalize
            userName = userName.charAt(0).toUpperCase() + userName.slice(1);

            const text = await generateAIWeatherReport(forecast, selectedProfile, userName, language || 'nl');
            setReport(text);
            setReportDate(new Date());
            setShowModal(true); // Open modal on success
            trackAiCall();

        } catch (e: any) {
            console.error("AI Generation Error:", e);
            setError(`Er ging iets mis: ${e.message || 'Onbekende fout'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!report) return;
        try {
            await navigator.clipboard.writeText(report);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleShare = async () => {
        if (!report) return;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Weerbericht voor ${profile?.location || 'jou'}`,
                    text: report,
                });
            } catch (err) {
                console.error('Error sharing:', err);
            }
        } else {
            handleCopy();
        }
    };

    if (!isEdwin) {
        return (
            <div className="mx-4 mb-8 bg-gradient-to-r from-purple-900 to-indigo-900 rounded-3xl text-white shadow-xl relative overflow-hidden transition-all duration-300">
                {/* Header - Always visible */}
                <div 
                    className="p-4 flex items-center justify-between cursor-pointer"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                >
                     <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                            <Icon name="auto_awesome" className="text-xl text-yellow-300" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">{t('profile.teaser.title')}</h3>
                            <p className="text-xs text-white/70">{t('profile.teaser.pro_only')}</p>
                        </div>
                    </div>
                    <Icon name={isCollapsed ? "expand_more" : "expand_less"} />
                </div>

                {/* Content - Collapsible */}
                {!isCollapsed && (
                    <div className="p-6 pt-0 animate-in fade-in slide-in-from-top-2">
                         <p className="text-white/90 text-sm mb-6 leading-relaxed">
                            {t('profile.teaser.desc')}
                         </p>
                         
                         <div className="bg-white/10 rounded-xl p-4 mb-6 border border-white/10">
                            <ul className="space-y-2 text-sm">
                                <li className="flex items-center gap-2">
                                    <Icon name="check_circle" className="text-green-400 text-xs" />
                                    <span>{t('profile.schedule.days')}</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <Icon name="check_circle" className="text-green-400 text-xs" />
                                    <span>{t('profile.schedule.breakfast').split(' ')[0]} / {t('profile.schedule.lunch').split(' ')[0]} / {t('profile.schedule.dinner').split(' ')[0]}</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <Icon name="check_circle" className="text-green-400 text-xs" />
                                    <span>{t('profile.schedule.max_limit')}</span>
                                </li>
                            </ul>
                         </div>

                         <button 
                            onClick={() => onNavigate(ViewState.PRICING)}
                            className="w-full py-3 bg-white text-purple-900 rounded-xl font-bold shadow-lg hover:bg-purple-50 transition-colors flex items-center justify-center gap-2"
                         >
                            <Icon name="star" className="text-yellow-500" />
                            {t('profile.teaser.upgrade')}
                         </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="mx-4 mb-8 bg-white dark:bg-card-dark rounded-3xl shadow-xl overflow-hidden border border-purple-100 dark:border-purple-900/30">
            {/* Header */}
            <div 
                className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 text-white cursor-pointer flex items-center justify-between"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                        <Icon name="auto_awesome" className="text-xl text-yellow-300" />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">AI Weerbericht</h3>
                        {profile && <p className="text-xs text-purple-100 opacity-90">Profiel: {profile.name}</p>}
                    </div>
                </div>
                <Icon name={isCollapsed ? "expand_more" : "expand_less"} />
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div className="p-6">
                    {error && (
                        <div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm border border-red-100 dark:border-red-900/30">
                            <div className="flex items-center gap-2 font-bold">
                                <Icon name="error" />
                                <span>Foutmelding</span>
                            </div>
                            <p className="mt-1">{error}</p>
                        </div>
                    )}

                    {!report && !loading && (
                        <div className="text-center py-4">
                            <p className="text-slate-500 dark:text-white/60 mb-6 max-w-md mx-auto">
                                Genereer een uniek weerbericht op basis van jouw profiel:
                            </p>
                            
                            {profiles && profiles.length > 1 ? (
                                <div className="flex flex-wrap justify-center gap-3">
                                    {profiles.map((p, index) => (
                                        <button
                                            key={p.id || index}
                                            onClick={() => handleGenerate(p)}
                                            className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-slate-700 dark:text-white rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-white/10"
                                        >
                                            {p.name}
                                        </button>
                                    ))}
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onNavigate(ViewState.SETTINGS, { tab: 'profile' });
                                        }}
                                        className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        + Nieuw
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => profile && handleGenerate(profile)}
                                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-purple-500/30 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto"
                                >
                                    <Icon name="auto_awesome" />
                                    {profile?.name || 'Genereer Weerbericht'}
                                </button>
                            )}
                            
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onNavigate(ViewState.SETTINGS, { tab: 'profile' });
                                }}
                                className="mt-4 text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center justify-center gap-1 mx-auto"
                            >
                                <Icon name="settings" className="text-sm" />
                                Profielen beheren
                            </button>
                        </div>
                    )}

                    {loading && (
                        <div className="flex flex-col items-center justify-center py-8 gap-4">
                            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500"></div>
                            <p className="text-sm font-medium text-slate-500 dark:text-white/60 animate-pulse">
                                Edwin Weer stelt jouw bericht op met de laatste gegevens...
                            </p>
                        </div>
                    )}

                    {report && !showModal && (
                        <div className="flex justify-center py-6 animate-in fade-in">
                            <button
                                onClick={() => setShowModal(true)}
                                className="px-6 py-3 bg-white dark:bg-white/10 border border-purple-200 dark:border-white/10 hover:border-purple-400 text-purple-700 dark:text-white rounded-xl font-bold shadow-sm transition-all transform hover:scale-105 flex items-center gap-3"
                            >
                                <Icon name="visibility" />
                                Bekijk laatste weerbericht
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Modal for Report */}
            {showModal && report && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#1e293b] w-full h-[100dvh] md:h-[85vh] md:max-w-3xl md:rounded-2xl flex flex-col shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex-none flex items-center justify-between p-4 border-b border-slate-100 dark:border-white/5 bg-white/50 dark:bg-[#1e293b]/50 backdrop-blur-md sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
                                    <Icon name="auto_awesome" className="text-purple-600 dark:text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800 dark:text-white">Jouw Weerbericht</h3>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-white/50">
                                        <span>{profile?.location}</span>
                                        {reportDate && (
                                            <>
                                                <span>•</span>
                                                <span>{reportDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowModal(false)}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-white/50"
                            >
                                <Icon name="close" />
                            </button>
                        </div>

                        {/* Modal Content - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-white/10">
                            <div className="prose dark:prose-invert max-w-none text-base leading-relaxed text-slate-700 dark:text-slate-300">
                                <div className="whitespace-pre-wrap font-serif">
                                    {report}
                                </div>
                            </div>

                            {/* Scores */}
                            {activityScores.length > 0 && (
                                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/10">
                                    <h4 className="text-sm font-bold uppercase text-slate-500 dark:text-white/50 mb-4 tracking-wider">
                                        Jouw activiteiten score ({profile?.location})
                                    </h4>
                                    <div className="space-y-4">
                                        {activityScores.map((day, idx) => {
                                            const date = new Date(day.date);
                                            const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' });
                                            
                                            return (
                                                <div key={day.date} className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/5">
                                                    <p className="text-xs font-bold text-slate-500 dark:text-white/60 mb-2 capitalize">{dayName}</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {day.scores.map(({ type, score }) => (
                                                            <div key={type} className="flex items-center justify-between bg-white dark:bg-black/20 p-2 rounded-lg">
                                                                <div className="flex items-center gap-2">
                                                                    <Icon name={getActivityIcon(type)} className="text-slate-400" />
                                                                    <span className="text-xs font-medium capitalize">
                                                                        {activityTranslations[type] || type}
                                                                    </span>
                                                                </div>
                                                                <span className={`text-xs font-bold ${getScoreColor(score.score10)}`}>
                                                                    {score.score10}/10
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer - Actions */}
                        <div className="flex-none p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-[#0f172a] flex items-center justify-between gap-3 safe-area-bottom">
                            <button 
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl transition-colors"
                            >
                                Sluiten
                            </button>
                            
                            <div className="flex items-center gap-2">
                                <a 
                                    href={`mailto:?subject=Weerbericht voor ${profile?.location}&body=${encodeURIComponent(report)}`}
                                    className="p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl"
                                    title="E-mail"
                                >
                                    <Icon name="mail" />
                                </a>
                                <button onClick={handleCopy} className="p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl" title="Kopiëren">
                                    <Icon name="content_copy" />
                                </button>
                                <button onClick={handleShare} className="p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl" title="Delen">
                                    <Icon name="share" />
                                </button>
                                <button 
                                    onClick={() => profile && handleGenerate(profile)}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg shadow-purple-500/20 transition-colors flex items-center gap-2"
                                >
                                    <Icon name="refresh" />
                                    <span className="hidden sm:inline">Opnieuw</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};