import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { OpenMeteoResponse, BaroProfile, ViewState, ActivityType, AppLanguage } from '../types';
import { generateBaroWeatherReport } from '../services/geminiService';
import { Icon } from './Icon';
import { useAuth } from '../contexts/AuthContext';
import { trackAiCall, trackBaroCall, getUsage, getLimit } from '../services/usageService';
import { searchCityByName } from '../services/geoService';
import { fetchForecast, getActivityIcon, getScoreColor } from '../services/weatherService';
import { calculateActivityScore, ActivityScore, ActivityWeatherData } from '../services/activityService';
import { getTranslation } from '../services/translations';


interface Props {
    weatherData: OpenMeteoResponse; // This is the app-wide weather data, might not be used if profile has specific location
    profile: BaroProfile | undefined;
    profiles?: BaroProfile[];
    onNavigate: (view: ViewState, params?: any) => void;
    language?: AppLanguage;
}

interface DayScore {
    date: string;
    scores: { type: ActivityType; score: ActivityScore }[];
}

export const BaroWeatherReport: React.FC<Props> = ({ weatherData: appWeatherData, profile, profiles, onNavigate, language }) => {
    const { user } = useAuth();
    const t = (key: string) => getTranslation(key, language || 'nl');
    const [report, setReport] = useState<string | null>(null);
    const [lastUsedProfile, setLastUsedProfile] = useState<BaroProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activityScores, setActivityScores] = useState<DayScore[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [reportDate, setReportDate] = useState<Date | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [copySuccess, setCopySuccess] = useState<string | null>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);

    // Lock body scroll when modal is open
    useEffect(() => {
        if (showModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showModal]);

    // Clear copy success message after 3 seconds
    useEffect(() => {
        if (copySuccess) {
            const timer = setTimeout(() => setCopySuccess(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [copySuccess]);

    // Removed localStorage persistence for collapse state to ensure it always starts collapsed


    const handleGenerate = async (selectedProfile: BaroProfile) => {
        
        // Check limits
        const stats = getUsage();
        const limit = getLimit();
        const today = new Date().toISOString().split('T')[0];
        const currentAiCalls = stats.aiCallsDayStart === today ? (stats.aiCalls || 0) : 0;
        
        if (currentAiCalls >= limit) {
             setError(t('baro.error_limit'));
             return;
        }

        // 1. Validatie
        if (!selectedProfile) {
            setError(t('baro.error_no_profile'));
            return;
        }

        if (!selectedProfile.name) {
            setError(t('baro.error_profile_name'));
            return;
        }

        if (!selectedProfile.location) {
            setError(t('baro.error_profile_location'));
            return;
        }

        setLoading(true);
        setError(null);
        setReport(null);
        setActivityScores([]);
        setReportDate(null);
        setLastUsedProfile(selectedProfile);
        setIsCollapsed(false);

        try {
            // 2. Locatie ophalen
            const locations = await searchCityByName(selectedProfile.location, 'nl');
            if (!locations || locations.length === 0) {
                throw new Error(t('baro.error_location_not_found').replace('{location}', selectedProfile.location));
            }
            const loc = locations[0];

            // 3. Weerdata ophalen voor deze specifieke locatie
            const forecast = await fetchForecast(loc.lat, loc.lon);
            if (!forecast || !forecast.daily) {
                throw new Error(t('baro.error_fetch_weather'));
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

            // 5. Baro Rapport Genereren
            // Get User Name from Auth Context or Profile
            let userName = user?.email?.split('@')[0] || selectedProfile.name || t('baro.user_default');
            // Capitalize
            userName = userName.charAt(0).toUpperCase() + userName.slice(1);

            const text = await generateBaroWeatherReport(forecast, selectedProfile, userName, language || 'nl');
            setReport(text);
            setReportDate(new Date());
            setShowModal(true); // Open modal on success
            
            // Deduct credits (Strict)
            trackBaroCall();
            // Also deduct weather credit as we used data
            trackAiCall();

        } catch (e: any) {
            console.error("Baro Generation Error:", e);
            setError(`${t('baro.error_generic')}: ${e.message || t('baro.unknown_error')}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!report) return;
        // Clean markdown (remove **)
        const cleanReport = report.replace(/\*\*/g, '');
        try {
            await navigator.clipboard.writeText(cleanReport);
            setCopySuccess(t('baro.copy_success'));
        } catch (err) {
            console.error('Failed to copy:', err);
            setError(t('baro.copy_error'));
        }
    };

    const handleShare = async () => {
        if (!report) return;
        // Clean markdown (remove **)
        const cleanReport = report.replace(/\*\*/g, '');
        
        const shareData = {
            title: `${t('baro.report_title')} - ${lastUsedProfile?.location || t('baro.my_profile')}`,
            text: cleanReport,
            url: window.location.origin
        };

        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error('Error sharing:', err);
                    // Fallback to copy if share fails
                    handleCopy();
                }
            }
        } else {
            // Fallback for browsers that don't support sharing
            handleCopy();
        }
    };

    const handleEmail = () => {
        if (!report) return;
        // Clean markdown (remove **)
        const cleanReport = report.replace(/\*\*/g, '');
        const subject = `${t('baro.email_subject_prefix')} ${lastUsedProfile?.location || 'jou'}`;
        const body = encodeURIComponent(cleanReport);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };

    // Test email function removed




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
                        <h3 className="font-bold text-lg">{t('baro.title')}</h3>
                        {profile && <p className="text-xs text-purple-100 opacity-90">{t('baro.subtitle')}</p>}
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
                                <Icon name="warning" />
                                <span>{t('baro.warning')}</span>
                            </div>
                            <p className="mt-1">{error}</p>
                            {(error.includes('limiet') || error.includes('overschreden') || error.includes('credits') || error.includes('limit') || error.includes('exceeded')) && (
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => onNavigate(ViewState.PRICING)}
                                        className="mt-3 text-xs font-bold underline hover:no-underline text-left"
                                    >
                                        {t('baro.view_packages')}
                                    </button>
                                    <button 
                                        onClick={() => setShowPreviewModal(true)}
                                        className="text-xs font-bold underline hover:no-underline text-left flex items-center gap-1"
                                    >
                                        <Icon name="visibility" className="text-sm" />
                                        {t('landing.view_preview') || 'Bekijk Voorbeeld'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {!loading && (
                        <div className="text-center py-4">
                            {report && !showModal ? (
                                <div className="space-y-6 animate-in fade-in">
                                    <button
                                        onClick={() => setShowModal(true)}
                                        className="px-6 py-4 bg-white dark:bg-white/10 border-2 border-purple-200 dark:border-purple-500/30 hover:border-purple-400 text-purple-700 dark:text-white rounded-2xl font-bold shadow-lg transition-all transform hover:scale-105 flex items-center gap-4 mx-auto"
                                    >
                                        <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-xl">
                                            <Icon name="visibility" className="text-xl" />
                                        </div>
                                        <div className="flex flex-col items-start text-left">
                                            <span className="text-sm opacity-70 font-medium">{t('baro.view_last_report')}</span>
                                            <span className="text-lg">{lastUsedProfile?.name || t('baro.my_profile')}</span>
                                            {reportDate && (
                                                <span className="text-xs font-normal opacity-50 mt-1">
                                                    {t('baro.generated_at')} {reportDate.toLocaleTimeString(language === 'en' ? 'en-US' : 'nl-NL', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                    </button>

                                    <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                                        <p className="text-xs font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest mb-4">
                                            {t('baro.generate_new')}
                                        </p>
                                        {profiles && profiles.length > 0 ? (
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {profiles.map((p, index) => (
                                                    <button
                                                        key={p.id || index}
                                                        onClick={() => handleGenerate(p)}
                                                        className="px-4 py-2 bg-slate-50 dark:bg-white/5 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-slate-600 dark:text-white/70 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-white/10 hover:border-purple-200"
                                                    >
                                                        {p.name}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => profile && handleGenerate(profile)}
                                                className="px-6 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-xl font-bold text-sm hover:bg-purple-200 transition-colors"
                                            >
                                                {t('baro.regenerate')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : !report && (
                                <>
                                    <p className="text-slate-500 dark:text-white/60 mb-6 max-w-md mx-auto">
                                        {t('baro.generate_prompt')}
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
                                                {t('baro.new_button')}
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => profile && handleGenerate(profile)}
                                            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-purple-500/30 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto"
                                        >
                                            <Icon name="auto_awesome" />
                                            {profile?.name || t('baro.generate_button')}
                                        </button>
                                    )}
                                </>
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
                                {t('baro.manage_profiles')}
                            </button>
                        </div>
                    )}

                    {loading && (
                        <div className="flex flex-col items-center justify-center py-8 gap-4">
                            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500"></div>
                            <p className="text-sm font-medium text-slate-500 dark:text-white/60 animate-pulse">
                                {t('baro.generating_message')}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Modal for Report - Rendered via Portal to ensure top z-index */}
            {showModal && report && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 pt-2 pb-0 px-0 md:p-6" style={{ position: 'fixed', zIndex: 9999 }}>
                    <div className="bg-white dark:bg-[#1e293b] w-full h-[calc(100dvh-0.5rem)] md:w-full md:max-w-4xl md:h-[90vh] rounded-t-3xl md:rounded-3xl flex flex-col shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-300 ring-1 ring-white/10">
                        {/* Modal Header */}
                        <div className="flex-none flex items-center justify-between p-4 border-b border-slate-100 dark:border-white/5 bg-white/50 dark:bg-[#1e293b]/50 backdrop-blur-md z-10">
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
                                    <Icon name="auto_awesome" className="text-purple-600 dark:text-purple-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-lg text-slate-800 dark:text-white">{t('baro.title')}</h3>
                                        <span className="text-purple-600 dark:text-purple-400 font-bold px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-xs uppercase tracking-wider">
                                            {lastUsedProfile?.name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-white/50">
                                        <Icon name="location_on" className="text-[10px]" />
                                        <span className="font-bold text-slate-700 dark:text-slate-300">{lastUsedProfile?.location}</span>
                                        {reportDate && (
                                            <>
                                                <span>•</span>
                                                <span>{reportDate.toLocaleDateString(language === 'en' ? 'en-US' : 'nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
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
                        <div className="flex-1 overflow-y-auto scrollbar-hide bg-slate-50 dark:bg-[#0f172a]/30 relative">
                            <div className="p-4 md:p-8">
                                {/* Copy Success Toast */}
                                {copySuccess && (
                                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                                        <div className="bg-emerald-500 text-white px-6 py-2 rounded-full shadow-lg font-bold flex items-center gap-2">
                                            <Icon name="check_circle" />
                                            {copySuccess}
                                        </div>
                                    </div>
                                )}

                                <div className="prose dark:prose-invert max-w-none text-base leading-relaxed text-slate-700 dark:text-slate-300">
                                    <div className="whitespace-pre-wrap font-serif text-lg md:text-xl">
                                        {report.split('\n').map((line, i) => {
                                            if (!line.trim()) return <div key={i} className="h-2" />; // Reduced spacer height
                                            
                                            // Handle bold text within the line
                                            const parts = line.split(/(\*\*.*?\*\*)/g);
                                            return (
                                                <p key={i} className="mb-2"> {/* Reduced margin */}
                                                    {parts.map((part, j) => {
                                                        if (part.startsWith('**') && part.endsWith('**')) {
                                                            return (
                                                                <strong key={j} className="text-purple-600 dark:text-purple-400 font-bold">
                                                                    {part.slice(2, -2)}
                                                                </strong>
                                                            );
                                                        }
                                                        return part;
                                                    })}
                                                </p>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Scores */}
                                {activityScores.length > 0 && (
                                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-white/10"> {/* Reduced margin/padding */}
                                        <h4 className="text-sm font-bold uppercase text-slate-500 dark:text-white/50 mb-4 tracking-widest">
                                            {t('baro.activity_score_title')} ({lastUsedProfile?.location})
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {activityScores.map((day, idx) => {
                                            const date = new Date(day.date);
                                            const dayName = date.toLocaleDateString(language === 'en' ? 'en-US' : 'nl-NL', { weekday: 'long', day: 'numeric', month: 'short' });
                                            
                                            return (
                                                <div key={day.date} className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 border border-slate-100 dark:border-white/5">
                                                    <p className="text-xs font-bold text-slate-500 dark:text-white/60 mb-3 capitalize">{dayName}</p>
                                                    <div className="space-y-2">
                                                        {day.scores.map(({ type, score }) => (
                                                            <div key={type} className="flex items-center justify-between bg-white dark:bg-black/20 p-2.5 rounded-xl">
                                                                <div className="flex items-center gap-3">
                                                                    <Icon name={getActivityIcon(type)} className="text-slate-400" />
                                                                    <span className="text-xs font-bold capitalize">
                                                                        {t(`activity.${type}`) || type}
                                                                    </span>
                                                                </div>
                                                                <span className={`text-xs font-black px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5 ${getScoreColor(score.score10)}`}>
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
                        </div>

                        {/* Modal Footer - Fixed */}
                        <div className="flex-none p-4 md:p-6 border-t border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-[#0f172a]/50 backdrop-blur-md safe-area-bottom pb-8 md:pb-6">
                            <div className="flex flex-col gap-3">
                                {/* Action Buttons */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-white rounded-xl font-bold transition-all active:scale-95"
                                    >
                                        <Icon name="close" className="w-5 h-5" />
                                        <span>{t('baro.close')}</span>
                                    </button>
                                    
                                    <button
                                        onClick={handleEmail}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                                    >
                                        <Icon name="mail" className="w-5 h-5" />
                                        <span>{t('baro.email')}</span>
                                    </button>

                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                                    >
                                        <Icon name="content_copy" className="w-5 h-5" />
                                        <span>{t('baro.copy')}</span>
                                    </button>

                                    <button
                                        onClick={handleShare}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-purple-500/20"
                                    >
                                        <Icon name="share" className="w-5 h-5" />
                                        <span>{t('baro.share')}</span>
                                    </button>


                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Preview Modal */}
            {showPreviewModal && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowPreviewModal(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-300">
                        <div className="p-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                            <div className="flex items-center gap-2">
                                <Icon name="auto_awesome" />
                                <span className="font-bold">{t('baro.preview_title')}</span>
                            </div>
                            <button onClick={() => setShowPreviewModal(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="p-2 overflow-y-auto max-h-[80vh]">
                            <img 
                                src="/landing/baro weerbericht.jpg" 
                                alt="Voorbeeld Baro Weerbericht" 
                                className="w-full h-auto rounded-xl"
                            />
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-white/5 flex justify-center">
                            <button 
                                onClick={() => {
                                    setShowPreviewModal(false);
                                    onNavigate(ViewState.PRICING);
                                }}
                                className="px-6 py-2 bg-primary text-white rounded-xl font-bold shadow-lg hover:opacity-90 transition-all"
                            >
                                {t('credits.upgrade') || 'Opwaarderen'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};