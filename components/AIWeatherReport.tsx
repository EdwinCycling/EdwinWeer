import React, { useState, useEffect } from 'react';
import { OpenMeteoResponse, AIProfile, ViewState } from '../types';
import { generateAIWeatherReport } from '../services/geminiService';
import { Icon } from './Icon';
import { useAuth } from '../contexts/AuthContext';
import { trackAiCall, getUsage } from '../services/usageService';

interface Props {
    weatherData: OpenMeteoResponse;
    profile: AIProfile | undefined;
    profiles?: AIProfile[];
    onNavigate: (view: ViewState, params?: any) => void;
}

export const AIWeatherReport: React.FC<Props> = ({ weatherData, profile, profiles, onNavigate }) => {
    const { user } = useAuth();
    const [report, setReport] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
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

        if (!selectedProfile) {
            setError("Kies eerst een profiel.");
            return;
        }

        setLoading(true);
        setError(null);
        setIsCollapsed(false); // Auto expand when generating
        try {
            const text = await generateAIWeatherReport(weatherData, selectedProfile);
            setReport(text);
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
            // Optional: show toast or feedback
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleMail = () => {
        if (!report) return;
        const subject = encodeURIComponent(`Weerbericht voor ${profile?.location || 'jou'}`);
        const body = encodeURIComponent(report);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
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
             <div className="mx-4 mb-8 bg-gradient-to-r from-purple-900 to-indigo-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-white/10 p-2 rounded-bl-2xl">
                    <span className="text-xs font-bold uppercase tracking-wider">AI Feature</span>
                </div>
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-white/10 rounded-xl">
                        <Icon name="smart_toy" className="text-2xl text-purple-200" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">Persoonlijke Weerman</h3>
                        <p className="text-purple-200 text-sm">Coming Soon</p>
                    </div>
                </div>
                <p className="text-sm opacity-80 mb-4">
                    Binnenkort beschikbaar: Een persoonlijk weerbericht op maat gemaakt door AI, gebaseerd op jouw activiteiten en voorkeuren.
                </p>
                <button disabled className="px-4 py-2 bg-white/10 rounded-lg text-sm font-bold opacity-50 cursor-not-allowed">
                    Nog niet beschikbaar
                </button>
            </div>
        );
    }

    return (
        <div className="mx-4 mb-8 bg-white dark:bg-[#1e293b] rounded-3xl border border-purple-500/20 shadow-xl relative overflow-hidden transition-all">
             <div className="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider z-10">
                AI Powered
            </div>
            
            {/* Header / Toggle Area */}
            <div 
                className="p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl text-purple-600 dark:text-purple-400">
                        <Icon name="smart_toy" className="text-2xl" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white">Jouw Weerbericht</h3>
                        {!isCollapsed && (
                            <p className="text-slate-500 dark:text-white/60 text-sm">Gepersonaliseerd voor {profile?.location || 'jou'}</p>
                        )}
                    </div>
                </div>
                <div className="text-slate-400 dark:text-slate-500">
                    <Icon name={isCollapsed ? "expand_more" : "expand_less"} className="text-2xl" />
                </div>
            </div>

            {/* Collapsible Content */}
            {!isCollapsed && (
                <div className="px-6 pb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    {error && (
                        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm">
                            <div className="flex items-center gap-2 font-bold">
                                <Icon name="error" />
                                <span>Foutmelding</span>
                            </div>
                            <p className="mt-1">{error}</p>
                            <details className="mt-2 text-xs opacity-75 cursor-pointer">
                                <summary>Technische details</summary>
                                <pre className="mt-1 whitespace-pre-wrap">{error}</pre>
                            </details>
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
                                            key={`${p.id}-${index}`}
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleGenerate(p);
                                            }}
                                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-purple-500/30 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2"
                                        >
                                            <Icon name="person" className="text-lg" />
                                            {p.name || 'Naamloos'}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <button 
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        profile && handleGenerate(profile);
                                    }}
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

                    {report && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="prose dark:prose-invert max-w-none mb-6 text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                {report}
                            </div>
                            
                            <div className="flex flex-wrap justify-between gap-3 items-center pt-2 border-t border-slate-100 dark:border-slate-700/50">
                                <div className="flex gap-2">
                                    <button 
                                        onClick={handleCopy}
                                        className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:text-slate-400 dark:hover:text-purple-400 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                                        title="Kopieer tekst"
                                    >
                                        <Icon name="content_copy" />
                                    </button>
                                    <button 
                                        onClick={handleMail}
                                        className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:text-slate-400 dark:hover:text-purple-400 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                                        title="Verstuur per mail"
                                    >
                                        <Icon name="mail" />
                                    </button>
                                    <button 
                                        onClick={handleShare}
                                        className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:text-slate-400 dark:hover:text-purple-400 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                                        title="Delen"
                                    >
                                        <Icon name="share" />
                                    </button>
                                </div>

                                <div className="flex gap-2">
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onNavigate(ViewState.SETTINGS, { tab: 'profile' });
                                        }}
                                        className="px-3 py-2 text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white transition-colors text-sm font-medium flex items-center gap-1"
                                        title="Profiel instellingen"
                                    >
                                        <Icon name="person" />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setReport(null);
                                        }}
                                        className="px-4 py-2 text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white transition-colors text-sm font-medium"
                                    >
                                        Wissen
                                    </button>
                                    {profiles && profiles.length > 1 ? (
                                         <button 
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setReport(null);
                                            }}
                                            className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-bold hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors flex items-center gap-2"
                                        >
                                            <Icon name="refresh" />
                                            Nieuw
                                        </button>
                                    ) : (
                                        <button 
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                profile && handleGenerate(profile);
                                            }}
                                            className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-bold hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors flex items-center gap-2"
                                        >
                                            <Icon name="refresh" />
                                            Regenereren
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
