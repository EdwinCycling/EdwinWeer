import React, { useEffect, useState } from 'react';
import { getUsage, API_LIMITS } from '../services/usageService';
import { useAuth } from '../hooks/useAuth';
import { Icon } from './Icon';
import { ViewState, AppSettings } from '../types';
import { getTranslation } from '../services/translations';

// Internal Modal
const CreditModal: React.FC<{ onBuy: () => void, settings: AppSettings }> = ({ onBuy, settings }) => {
    const t = (key: string) => getTranslation(key, settings.language);
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-bg-card border border-border-color rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
                <div className="text-center">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon name="cloud_off" className="text-3xl text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-text-main mb-2">
                        {t('credits.empty_title')}
                    </h2>
                    <p className="text-text-muted mb-6">
                        {t('credits.empty_desc')}
                    </p>
                    <button 
                        onClick={onBuy}
                        className="w-full py-3 bg-accent-primary hover:bg-accent-secondary text-white font-bold rounded-xl transition-colors mb-3"
                    >
                        {t('credits.buy_pro')}
                    </button>
                    {/* Allow temporary dismissal to not block app completely if needed, but requirements say "cannot do anything" */}
                    {/* However, navigation to pricing is allowed. */}
                </div>
            </div>
        </div>
    );
};

// Internal Toast
const CreditToast: React.FC<{ message: string, onClose: () => void }> = ({ message, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 6000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className="fixed top-24 right-6 left-6 md:left-auto md:w-80 z-[100] animate-in slide-in-from-top-4 duration-500">
            <div className="bg-yellow-500/10 backdrop-blur-xl border border-yellow-500/50 rounded-2xl p-4 shadow-2xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 shrink-0">
                    <Icon name="warning" className="text-xl" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-text-main text-sm">
                        Credit Warning
                    </h4>
                    <p className="text-xs text-text-muted mt-1">
                        {message}
                    </p>
                </div>
                <button onClick={onClose} className="text-text-muted hover:text-text-main">
                    <Icon name="close" />
                </button>
            </div>
        </div>
    );
};

export const CreditMonitor: React.FC<{ currentView: ViewState, onNavigate: (view: ViewState) => void, settings: AppSettings }> = ({ currentView, onNavigate, settings }) => {
    const { user } = useAuth();
    const t = (key: string) => getTranslation(key, settings.language);
    const [showModal, setShowModal] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!user || currentView === ViewState.PRICING) {
            setShowModal(false);
            return;
        }

        const checkCredits = () => {
            const stats = getUsage();
            const credits = stats.weatherCredits;
            
            // 1. Zero Credits Check
            if (credits <= 0) {
                setShowModal(true);
            } else {
                setShowModal(false);
            }

            // 2. Low Credits Warning (Toast)
            const freeDaily = API_LIMITS.CREDITS?.FREE_DAILY || 10;
            const maxDaily = API_LIMITS.CREDITS?.MAX_DAILY || 250;
            
            if (credits > freeDaily && credits < maxDaily) {
                const hasShown = sessionStorage.getItem('credit_warning_shown');
                if (!hasShown) {
                    setToastMessage(t('credits.low_warning'));
                    sessionStorage.setItem('credit_warning_shown', 'true');
                }
            }
        };

        checkCredits();

        const handleUsageUpdate = () => checkCredits();
        window.addEventListener('usage:updated', handleUsageUpdate);

        return () => window.removeEventListener('usage:updated', handleUsageUpdate);
    }, [user, t, currentView, settings.language]);

    if (currentView === ViewState.PRICING) return null;

    return (
        <>
            {showModal && <CreditModal onBuy={() => onNavigate(ViewState.PRICING)} settings={settings} />}
            {toastMessage && (
                <CreditToast 
                    message={toastMessage} 
                    onClose={() => setToastMessage(null)} 
                />
            )}
        </>
    );
};
