import React, { useState } from 'react';
import { ViewState, AppSettings, BaroProfile } from '../types';
import { Icon } from '../components/Icon';
import { ScheduleConfig } from '../components/ScheduleConfig';
import { getTranslation } from '../services/translations';

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
                
                {profiles.length === 0 && (
                    <div className="text-center p-8 text-slate-500 dark:text-white/50">
                        <p>Je hebt nog geen profielen aangemaakt.</p>
                        <button 
                            onClick={() => onNavigate(ViewState.PROFILES)}
                            className="mt-4 text-primary font-bold hover:underline"
                        >
                            Maak eerst een profiel aan
                        </button>
                    </div>
                )}

                {profiles.length > 0 && (
                    <>
                         {/* Profile Selector */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                                Selecteer Profiel
                            </label>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {profiles.map(p => (
                                    <button
                                        key={p.id}
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
