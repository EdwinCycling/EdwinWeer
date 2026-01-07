import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getUsage } from '../services/usageService';
import { getTranslation } from '../services/translations';

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
            alert("Geen credits meer. Waardeer je saldo op om deze functie te gebruiken.");
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
        } catch (error) {
            console.error("Error updating settings:", error);
            alert("Er is een fout opgetreden bij het opslaan.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto">
            {/* Header */}
            <div className="flex-none p-4 md:p-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/5 flex items-center gap-4 sticky top-0 z-10 shadow-sm">
                <button 
                    onClick={() => onNavigate(ViewState.CURRENT)}
                    className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-500 dark:text-white/60"
                >
                    <Icon name="arrow_back" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="text-2xl">🚴</span> {t('cycling.title')}
                    </h1>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-full border border-indigo-100 dark:border-indigo-500/20">
                    <Icon name="token" className="text-indigo-600 dark:text-indigo-400 text-sm" />
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                        {baroCredits} {t('cycling.credits')}
                    </span>
                </div>
            </div>

            <div className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full space-y-6">
                
                {/* Intro Card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-sm">
                    <h2 className="text-lg font-bold mb-4 text-slate-800 dark:text-white">{t('cycling.intro.title')}</h2>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        {t('cycling.intro.description')}
                    </p>
                </div>

                {/* Settings Form */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-slate-800 dark:text-white">{t('cycling.receive_updates')}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {t('cycling.cost_info')}
                            </p>
                        </div>
                        <div className="flex items-center">
                            <button
                                onClick={() => {
                                    if (baroCredits <= 0 && !enabled) {
                                        alert(t('cycling.no_credits_alert'));
                                        return;
                                    }
                                    handleSave(!enabled, channel);
                                }}
                                disabled={loading}
                                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                                    enabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                                }`}
                            >
                                <span
                                    className={`${
                                        enabled ? 'translate-x-7' : 'translate-x-1'
                                    } inline-block h-6 w-6 transform rounded-full bg-white transition-transform`}
                                />
                            </button>
                        </div>
                    </div>

                    {enabled && (
                        <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                                {t('cycling.channel_select')}
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${channel === 'email' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                    <input
                                        type="radio"
                                        name="channel"
                                        value="email"
                                        checked={channel === 'email'}
                                        onChange={() => handleSave(enabled, 'email')}
                                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                    />
                                    <span className="text-xl">📨</span>
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{t('cycling.settings.channel_email')}</span>
                                </label>

                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${!telegramLinked ? 'opacity-50 cursor-not-allowed' : ''} ${channel === 'telegram' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                    <input
                                        type="radio"
                                        name="channel"
                                        value="telegram"
                                        checked={channel === 'telegram'}
                                        onChange={() => handleSave(enabled, 'telegram')}
                                        disabled={!telegramLinked}
                                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                    />
                                    <span className="text-xl">✈️</span>
                                    <div className="flex-1 min-w-0">
                                        <span className="font-medium text-slate-700 dark:text-slate-200 block truncate">{t('cycling.settings.channel_telegram')}</span>
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

                <div className="text-center text-xs text-slate-400 dark:text-slate-600">
                    <p>{t('cycling.only_if_race')}</p>
                </div>

            </div>
        </div>
    );
};
