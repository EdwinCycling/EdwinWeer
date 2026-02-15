import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { ViewState, AppSettings } from '../types';
import { getUsage, UsageStats } from '../services/usageService';
import { getTranslation } from '../services/translations';

interface Props {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
    className?: string; // Allow custom positioning
}

export const CreditFloatingButton: React.FC<Props> = ({ onNavigate, settings, className }) => {
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [showPopup, setShowPopup] = useState(false);
    
    const t = (key: string) => getTranslation(key, settings.language);

    useEffect(() => {
        setStats(getUsage());
        
        // Listen for storage changes and custom events
        const handler = () => setStats(getUsage());
        window.addEventListener('storage', handler);
        // We might need a custom event if storage event doesn't trigger on same tab
        window.addEventListener('usage_updated', handler); 
        
        // Poll every few seconds to be sure (since local storage doesn't always trigger in same tab)
        const interval = setInterval(() => setStats(getUsage()), 2000);

        return () => {
            window.removeEventListener('storage', handler);
            window.removeEventListener('usage_updated', handler);
            clearInterval(interval);
        };
    }, []);

    if (!stats) return null;
    
    const hasCredits = stats.weatherCredits > 0 || stats.baroCredits > 0;

    return (
        <>
            <button
                onClick={() => setShowPopup(!showPopup)}
                className={className || "fixed bottom-[100px] md:bottom-24 right-4 z-40 bg-bg-card text-text-main p-2 rounded-full shadow-lg border border-border-color flex items-center gap-2 hover:scale-105 transition-transform"}
            >
                {hasCredits ? (
                    <>
                         <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-full p-1">
                            <Icon name="stars" className="text-lg" />
                        </div>
                        <span className="text-xs font-bold pr-1">
                            {stats.weatherCredits + stats.baroCredits}
                        </span>
                    </>
                ) : (
                    <div className="bg-primary/10 text-primary dark:text-text-main rounded-full p-1">
                        <Icon name="shopping_cart" className="text-lg" />
                    </div>
                )}
            </button>

            {showPopup && (
                <>
                    <div 
                        className="fixed inset-0 z-40 bg-transparent" 
                        onClick={() => setShowPopup(false)}
                    />
                    <div className="fixed bottom-[128px] md:bottom-36 right-4 z-[105] bg-bg-card p-4 rounded-xl shadow-xl border border-border-color w-64 animate-in fade-in slide-in-from-bottom-4 duration-200">
                        <div className="flex justify-between items-start mb-3">
                             <h4 className="font-bold text-sm text-text-main">
                                {hasCredits ? t('credits.title') : t('credits.popup.title_upgrade')}
                             </h4>
                             <button onClick={() => setShowPopup(false)} className="text-text-muted hover:text-text-main">
                                <Icon name="close" className="text-base" />
                             </button>
                        </div>
                        
                        {hasCredits ? (
                            <>
                                {stats.weatherCredits > 0 && (
                                    <div className="flex justify-between items-center mb-2 text-sm text-text-muted">
                                        <span>{t('credits.weather')}</span>
                                        <span className="font-bold text-text-main">{stats.weatherCredits}</span>
                                    </div>
                                )}
                                
                                {stats.baroCredits > 0 && (
                                    <div className="flex justify-between items-center mb-4 text-sm text-text-muted">
                                        <span>{t('credits.baro')}</span>
                                        <span className="font-bold text-text-main">{stats.baroCredits}</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <ul className="space-y-2 mb-4">
                                <li className="flex items-center gap-2 text-xs text-text-muted">
                                    <Icon name="check_circle" className="text-green-500 text-sm" />
                                    {t('credits.popup.point1')}
                                </li>
                                <li className="flex items-center gap-2 text-xs text-text-muted">
                                    <Icon name="check_circle" className="text-green-500 text-sm" />
                                    {t('credits.popup.point2')}
                                </li>
                                <li className="flex items-center gap-2 text-xs text-text-muted">
                                    <Icon name="check_circle" className="text-green-500 text-sm" />
                                    {t('credits.popup.point3')}
                                </li>
                            </ul>
                        )}

                        <button
                            onClick={() => {
                                setShowPopup(false);
                                onNavigate(ViewState.PRICING);
                            }}
                            className="w-full py-2 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"
                        >
                            {hasCredits ? t('credits.upgrade') : t('credits.upgrade')}
                        </button>
                    </div>
                </>
            )}
        </>
    );
};
