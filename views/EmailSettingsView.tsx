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
        <div className="flex flex-col min-h-screen bg-bg-page pb-24 animate-in fade-in slide-in-from-bottom-4 text-text-main transition-colors duration-300">
            {/* Header */}
            <div className="flex flex-col sticky top-0 bg-bg-card/95 backdrop-blur z-20 border-b border-border-color transition-colors">
                <div className="flex items-center p-4">
                    <button 
                        onClick={() => onNavigate(ViewState.CURRENT)} 
                        className="size-10 flex items-center justify-center rounded-full hover:bg-bg-page mr-2"
                    >
                        <Icon name="arrow_back_ios_new" />
                    </button>
                    <h1 className="text-lg font-bold">Baro weerberichten : mail</h1>
                </div>
            </div>

            <div className="p-4 max-w-lg mx-auto w-full space-y-6">
                
                {/* Intro Card */}
                <div className="bg-bg-card w-full p-6 rounded-2xl shadow-sm border border-border-color">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="size-12 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                            <Icon name="mail" className="text-2xl" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">{t('email.intro.title')}</h2>
                            <p className="text-sm text-text-muted">{t('email.intro.subtitle')}</p>
                        </div>
                    </div>

                    <div className="text-sm leading-relaxed mb-6 space-y-4">
                        <p>
                            {t('email.intro.body1')}
                        </p>
                        <p className="text-text-muted text-xs bg-bg-page p-3 rounded-lg">
                            <strong>{t('email.intro.body2_bold')}</strong><br />
                            {t('email.intro.body2_text')}
                        </p>
                    </div>
                </div>

                {profiles.length === 0 && (
                    <div className="text-center p-8 text-text-muted">
                        <p>{t('email.no_profiles')}</p>
                        <button 
                            onClick={() => onNavigate(ViewState.PROFILES)}
                            className="mt-4 text-accent-primary font-bold hover:underline"
                        >
                            {t('email.create_profile')}
                        </button>
                    </div>
                )}

                {profiles.length > 0 && (
                    <>
                        {baroCredits <= 0 ? (
                            <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20 text-center mb-6">
                                <p className="text-red-600 font-bold mb-2">{t('messenger.schedule.no_credits_title')}</p>
                                <p className="text-sm text-red-500 mb-4">
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
                            <div className="bg-accent-primary/10 p-3 rounded-xl border border-accent-primary/20 mb-6 flex items-center justify-between">
                                <span className="text-sm text-accent-primary font-medium">
                                    {t('email.credits.available')} <strong>{baroCredits}</strong>
                                </span>
                            </div>
                        )}

                         {/* Profile Selector */}
                        <div>
                            <label className="block text-sm font-medium text-text-main mb-2">
                                {t('email.profile.select')}
                            </label>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {profiles.map((p, idx) => (
                                    <button
                                        key={p.id || `profile-${idx}`}
                                        onClick={() => setSelectedProfileId(p.id)}
                                        className={`px-4 py-2 rounded-xl whitespace-nowrap transition-colors border ${
                                            selectedProfileId === p.id
                                                ? 'bg-accent-primary border-accent-primary text-text-inverse shadow-md'
                                                : 'bg-bg-card border-border-color text-text-muted hover:border-accent-primary/50'
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
                
                <p className="text-center text-xs text-text-muted mt-6 italic">
                    {t('common.autosave')}
                </p>
            </div>
        </div>
    );
};
