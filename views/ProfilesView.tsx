import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, BaroProfile } from '../types';
import { Icon } from '../components/Icon';
import { SettingsProfile } from '../components/SettingsProfile';
import { getTranslation } from '../services/translations';
import { useAuth } from '../contexts/AuthContext';
import { getUsage } from '../services/usageService';

interface Props {
    settings: AppSettings;
    onUpdateSettings: (newSettings: AppSettings) => void;
    onNavigate: (view: ViewState) => void;
}

export const ProfilesView: React.FC<Props> = ({ settings, onUpdateSettings, onNavigate }) => {
    const t = (key: string) => getTranslation(key, settings.language);
    const { user } = useAuth();
    const [baroCredits, setBaroCredits] = useState(getUsage().baroCredits);

    useEffect(() => {
        const interval = setInterval(() => {
            setBaroCredits(getUsage().baroCredits);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

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
                    <h1 className="text-lg font-bold">{t('settings.baro_profile')}</h1>
                </div>
            </div>

            <div className="p-4 max-w-lg mx-auto w-full">
                {/* Intro Card */}
                <div className="bg-white dark:bg-card-dark w-full p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 mb-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="size-12 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-500">
                            <Icon name="person" className="text-2xl" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">{t('profile.info.title')}</h2>
                            <p className="text-sm text-slate-500 dark:text-white/60">{t('profile.info.subtitle')}</p>
                        </div>
                    </div>
                    
                    <div className="text-sm leading-relaxed mb-6 space-y-4">
                        <p>
                            {t('profile.info.body1')}
                        </p>
                        <p>
                            {t('profile.info.body2')}
                        </p>
                         <p className="text-slate-500 dark:text-white/60 text-xs bg-slate-50 dark:bg-white/5 p-3 rounded-lg">
                            <strong>{t('profile.info.credits')}</strong>
                        </p>
                    </div>

                    <button 
                        onClick={() => onNavigate(ViewState.PRICING)}
                        className="w-full py-3 px-4 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 font-bold"
                    >
                        <Icon name="payments" />
                        {t('profile.info.pricing_link')}
                    </button>
                </div>

                <SettingsProfile 
                    profile={settings.baroProfile} 
                    profiles={settings.baroProfiles || (settings.baroProfile ? [settings.baroProfile] : [])}
                    onUpdate={(updatedProfile) => {
                        const currentList = settings.baroProfiles || [];
                        const index = currentList.findIndex(p => p.id === updatedProfile.id);
                        
                        let newList;
                        if (index >= 0) {
                            newList = [...currentList];
                            newList[index] = updatedProfile;
                        } else {
                            // If not in list (e.g. migration), add it or replace if we treat it as single source
                            if (currentList.length === 0) {
                                newList = [updatedProfile];
                            } else {
                                newList = [...currentList, updatedProfile];
                            }
                        }

                        onUpdateSettings({ 
                            ...settings, 
                            baroProfile: updatedProfile,
                            baroProfiles: newList
                        });
                    }}
                    onSelectProfile={(profile) => {
                        onUpdateSettings({ ...settings, baroProfile: profile });
                    }}
                    onCreateProfile={() => {
                        if (baroCredits <= 0) {
                            alert('Geen Baro Credits beschikbaar. Koop nieuwe credits om een profiel aan te maken.');
                            return;
                        }

                        let defaultName = `Nieuw Profiel ${settings.baroProfiles ? settings.baroProfiles.length + 1 : 1}`;
                        if (user?.email) {
                            const nameFromEmail = user.email.split('@')[0];
                            const capitalized = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
                            const count = (settings.baroProfiles || []).filter(p => p.name && p.name.startsWith(capitalized)).length;
                            defaultName = count === 0 ? capitalized : `${capitalized} ${count + 1}`;
                        }

                        const newProfile: BaroProfile = {
                            id: Date.now().toString(),
                            name: defaultName,
                            activities: [],
                            location: settings.favorites[0]?.name || '',
                            timeOfDay: [],
                            transport: [],
                            daysAhead: 3,
                            reportStyle: ['enthousiast'],
                            hayFever: false
                        };
                        const currentList = settings.baroProfiles || [];
                        // Limit to 3 profiles
                        if (currentList.length >= 3) return;

                        const newList = [...currentList, newProfile];
                        onUpdateSettings({
                            ...settings,
                            baroProfiles: newList,
                            baroProfile: newProfile
                        });
                    }}
                    onDeleteProfile={(id) => {
                        const currentList = settings.baroProfiles || [];
                        const newList = currentList.filter(p => p.id !== id);
                        const nextActive = settings.baroProfile?.id === id ? (newList.length > 0 ? newList[0] : undefined) : settings.baroProfile;

                        onUpdateSettings({
                            ...settings,
                            baroProfiles: newList,
                            baroProfile: nextActive
                        });
                    }}
                    currentLocationName={settings.favorites.find(f => f.isCurrentLocation)?.name || settings.favorites[0]?.name}
                    language={settings.language}
                />
            </div>
        </div>
    );
};
