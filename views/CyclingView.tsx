import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getUsage } from '../services/usageService';
import { getTranslation } from '../services/translations';
import { Toast } from '../components/Toast';

interface Props {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
}

export const CyclingView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
    const { user } = useAuth();
    const t = (key: string) => getTranslation(key, settings.language);
    const [baroCredits, setBaroCredits] = useState<number>(0);
    const [enabled, setEnabled] = useState<boolean>(settings.cycling_updates?.enabled || false);
    const [channel, setChannel] = useState<'email' | 'telegram'>(settings.cycling_updates?.channel || 'email');
    const [loading, setLoading] = useState(false);
    const [telegramLinked, setTelegramLinked] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    useEffect(() => {
        const fetchCreditsAndTelegram = async () => {
            if (user) {
                const usage = await getUsage();
                setBaroCredits(usage.baroCredits || 0);

                // Check if telegram is linked (check user document for telegramId or similar)
                // Assuming telegramId is stored in user document root or settings
                // Based on MessengerView logic, usually we check if telegramId exists
                try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        setTelegramLinked(!!data.telegramChatId);
                    }
                } catch (e) {
                    console.error("Error fetching user data", e);
                }
            }
        };
        fetchCreditsAndTelegram();
    }, [user]);

    const handleSave = async (newEnabled: boolean, newChannel: 'email' | 'telegram') => {
        if (!user) return;
        setLoading(true);
        
        if (newEnabled && baroCredits <= 0) {
            setToast({ message: "Geen credits meer. Waardeer je saldo op om deze functie te gebruiken.", type: 'error' });
            setLoading(false);
            return; 
        }

        const newSettings = {
            ...settings,
            cycling_updates: {
                enabled: newEnabled,
                channel: newChannel
            }
        };

        try {
            await updateDoc(doc(db, 'users', user.uid), {
                'settings.cycling_updates': {
                    enabled: newEnabled,
                    channel: newChannel
                }
            });
            onUpdateSettings(newSettings);
            setEnabled(newEnabled);
            setChannel(newChannel);
            if (newEnabled) {
                setToast({ message: "Instellingen succesvol opgeslagen!", type: 'success' });
            }
        } catch (error) {
            console.error("Error updating settings:", error);
            setToast({ message: "Er is een fout opgetreden bij het opslaan.", type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-bg-page overflow-y-auto text-text-main">
            {/* Header */}
            <div className="flex-none p-4 md:p-6 bg-bg-card border-b border-border-color flex items-center gap-4 sticky top-0 z-10 shadow-sm">
                <button 
                    onClick={() => onNavigate(ViewState.CURRENT)}
                    className="p-2 -ml-2 rounded-full hover:bg-bg-page transition-colors text-text-muted"
                >
                    <Icon name="arrow_back" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-text-main flex items-center gap-2">
                        <span className="text-2xl">🚴</span> {t('cycling.title')}
                    </h1>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary/10 rounded-full border border-accent-primary/20">
                    <Icon name="token" className="text-accent-primary text-sm" />
                    <span className="text-sm font-bold text-accent-primary">
                        {baroCredits} {t('cycling.credits')}
                    </span>
                </div>
            </div>

            <div className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full space-y-6">
                
                {/* Intro Card */}
                <div className="bg-bg-card rounded-2xl p-6 border border-border-color shadow-sm">
                    <h2 className="text-lg font-bold mb-4 text-text-main">{t('cycling.intro.title')}</h2>
                    <p className="text-text-muted leading-relaxed">
                        {t('cycling.intro.description')}
                    </p>
                </div>

                {/* Settings Form */}
                <div className="bg-bg-card rounded-2xl p-6 border border-border-color shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-text-main">{t('cycling.receive_updates')}</h3>
                            <p className="text-sm text-text-muted">
                                {t('cycling.cost_info')}
                            </p>
                        </div>
                        <div className="flex items-center">
                            <button
                                onClick={() => {
                                    if (baroCredits <= 0 && !enabled) {
                                        setToast({ message: t('cycling.no_credits_alert'), type: 'error' });
                                        return;
                                    }
                                    handleSave(!enabled, channel);
                                }}
                                disabled={loading}
                                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 ${
                                    enabled ? 'bg-accent-primary' : 'bg-text-muted/20'
                                }`}
                            >
                                <span
                                    className={`${
                                        enabled ? 'translate-x-7' : 'translate-x-1'
                                    } inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform`}
                                />
                            </button>
                        </div>
                    </div>

                    {enabled && (
                        <div className="pt-4 border-t border-border-color">
                            <label className="block text-sm font-medium text-text-muted mb-3">
                                {t('cycling.channel_select')}
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${channel === 'email' ? 'bg-accent-primary/10 border-accent-primary/30' : 'border-border-color hover:bg-bg-page'}`}>
                                    <input
                                        type="radio"
                                        name="channel"
                                        value="email"
                                        checked={channel === 'email'}
                                        onChange={() => handleSave(enabled, 'email')}
                                        className="w-4 h-4 text-accent-primary focus:ring-accent-primary border-gray-300"
                                    />
                                    <span className="text-xl">📨</span>
                                    <span className="font-medium text-text-main">{t('cycling.settings.channel_email')}</span>
                                </label>

                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${!telegramLinked ? 'opacity-50 cursor-not-allowed' : ''} ${channel === 'telegram' ? 'bg-accent-primary/10 border-accent-primary/30' : 'border-border-color hover:bg-bg-page'}`}>
                                    <input
                                        type="radio"
                                        name="channel"
                                        value="telegram"
                                        checked={channel === 'telegram'}
                                        onChange={() => handleSave(enabled, 'telegram')}
                                        disabled={!telegramLinked}
                                        className="w-4 h-4 text-accent-primary focus:ring-accent-primary border-gray-300"
                                    />
                                    <span className="text-xl">✈️</span>
                                    <div className="flex-1 min-w-0">
                                        <span className="font-medium text-text-main block truncate">{t('cycling.settings.channel_telegram')}</span>
                                    </div>
                                </label>
                            </div>
                            {!telegramLinked && (
                                <p className="text-[10px] text-red-500 mt-2 flex items-center gap-1">
                                    <Icon name="info" className="text-xs" />
                                    {t('cycling.settings.link_telegram_first')}
                                </p>
                            )}
                        </div>
                    )}


                </div>

                <div className="text-center text-xs text-text-muted">
                    <p>{t('cycling.only_if_race')}</p>
                    <p className="mt-4 opacity-60">{t('common.autosave')}</p>
                </div>

            </div>

            {toast && (
                <Toast 
                    message={toast.message} 
                    type={toast.type} 
                    onClose={() => setToast(null)} 
                />
            )}
        </div>
    );
};
