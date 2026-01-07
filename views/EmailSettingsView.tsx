import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, BaroProfile } from '../types';
import { Icon } from '../components/Icon';
import { ScheduleConfig } from '../components/ScheduleConfig';
import { getTranslation } from '../services/translations';
import { getUsage } from '../services/usageService';

interface Props {
    settings: AppSettings;
    onUpdateSettings: (newSettings: AppSettings) => void;
    onNavigate: (view: ViewState) => void;
}

export const EmailSettingsView: React.FC<Props> = ({ settings, onUpdateSettings, onNavigate }) => {
    const t = (key: string) => getTranslation(key, settings.language);
    const profiles = settings.baroProfiles || (settings.baroProfile ? [settings.baroProfile] : []);
    const [selectedProfileId, setSelectedProfileId] = useState<string>(settings.baroProfile?.id || (profiles.length > 0 ? profiles[0].id : ''));

    const selectedProfile = profiles.find(p => p.id === selectedProfileId);
    const [baroCredits, setBaroCredits] = useState(getUsage().baroCredits);

    useEffect(() => {
        const interval = setInterval(() => {
            setBaroCredits(getUsage().baroCredits);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const updateProfile = (updatedProfile: BaroProfile) => {
        const index = profiles.findIndex(p => p.id === updatedProfile.id);
        if (index === -1) return;

        const newList = [...profiles];
        newList[index] = updatedProfile;

        onUpdateSettings({
            ...settings,
            baroProfiles: newList,
            baroProfile: settings.baroProfile?.id === updatedProfile.id ? updatedProfile : settings.baroProfile
        });
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-background-dark pb-24 animate-in fade-in slide-in-from-bottom-4 text-slate-800 dark:text-white transition-colors duration-300">
            {/* Header */}
            <div className="flex flex-col sticky top-0 bg-white/95 dark:bg-[#101d22]/95 backdrop-blur z-20 border-b border-slate-200 dark:border-white/5 transition-colors">
                <div className="flex items-center p-4">
                    <button 
                        onClick={() => onNavigate(ViewState.CURRENT)} 
                        className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 mr-2"
                    >
                        <Icon name="arrow_back_ios_new" />
                    </button>
                    <h1 className="text-lg font-bold">Baro weerberichten : mail</h1>
                </div>
            </div>

            <div className="p-4 max-w-lg mx-auto w-full space-y-6">
                
                {/* Intro Card */}
                <div className="bg-white dark:bg-card-dark w-full p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="size-12 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-500">
                            <Icon name="mail" className="text-2xl" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">{t('email.intro.title')}</h2>
                            <p className="text-sm text-slate-500 dark:text-white/60">{t('email.intro.subtitle')}</p>
                        </div>
                    </div>

                    <div className="text-sm leading-relaxed mb-6 space-y-4">
                        <p>
                            {t('email.intro.body1')}
                        </p>
                        <p className="text-slate-500 dark:text-white/60 text-xs bg-slate-50 dark:bg-white/5 p-3 rounded-lg">
                            <strong>{t('email.intro.body2_bold')}</strong><br />
                            {t('email.intro.body2_text')}
                        </p>
                    </div>
                </div>

                {profiles.length === 0 && (
                    <div className="text-center p-8 text-slate-500 dark:text-white/50">
                        <p>{t('email.no_profiles')}</p>
                        <button 
                            onClick={() => onNavigate(ViewState.PROFILES)}
                            className="mt-4 text-primary font-bold hover:underline"
                        >
                            {t('email.create_profile')}
                        </button>
                    </div>
                )}

                {profiles.length > 0 && (
                    <>
                        {baroCredits <= 0 ? (
                            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-900/50 text-center mb-6">
                                <p className="text-red-800 dark:text-red-200 font-bold mb-2">{t('messenger.schedule.no_credits_title')}</p>
                                <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                                    {t('messenger.schedule.no_credits_desc')}
                                </p>
                                <button
                                    onClick={() => onNavigate(ViewState.PRICING)}
                                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors"
                                >
                                    {t('messenger.schedule.buy_credits')}
                                </button>
                            </div>
                        ) : (
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-900/50 mb-6 flex items-center justify-between">
                                <span className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                                    {t('email.credits.available')} <strong>{baroCredits}</strong>
                                </span>
                            </div>
                        )}

                         {/* Profile Selector */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                                {t('email.profile.select')}
                            </label>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {profiles.map((p, idx) => (
                                    <button
                                        key={p.id || `profile-${idx}`}
                                        onClick={() => setSelectedProfileId(p.id)}
                                        className={`px-4 py-2 rounded-xl whitespace-nowrap transition-colors border ${
                                            selectedProfileId === p.id
                                                ? 'bg-primary border-primary text-white shadow-md'
                                                : 'bg-white dark:bg-card-dark border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/70 hover:border-primary/50'
                                        }`}
                                    >
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {selectedProfile && (
                            <ScheduleConfig 
                                title={`Email Schema voor ${selectedProfile.name}`}
                                schedule={selectedProfile.emailSchedule}
                                onUpdate={(newSchedule) => {
                                    updateProfile({ ...selectedProfile, emailSchedule: newSchedule });
                                }}
                                language={settings.language}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
