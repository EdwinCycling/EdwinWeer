import React, { useEffect, useState, useRef } from 'react';
import { AIProfile, ActivityType, Location } from '../types';
import { Icon } from './Icon';
import { useAuth } from '../contexts/AuthContext';
import { searchCityByName } from '../services/geoService';

interface Props {
    profile: AIProfile | undefined;
    profiles?: AIProfile[];
    onUpdate: (profile: AIProfile) => void;
    onSelectProfile?: (profile: AIProfile) => void;
    onCreateProfile?: () => void;
    onDeleteProfile?: (id: string) => void;
    currentLocationName?: string;
}

const DEFAULT_PROFILE: AIProfile = {
    id: 'default',
    name: 'Mijn Profiel',
    activities: [],
    location: '',
    timeOfDay: [],
    transport: [],
    hobbies: '',
    otherInstructions: '',
    daysAhead: 3,
    reportStyle: ['enthousiast']
};

const activityIcons: Record<ActivityType, string> = {
    bbq: 'outdoor_grill',
    cycling: 'directions_bike',
    walking: 'directions_walk',
    sailing: 'sailing',
    running: 'directions_run',
    beach: 'beach_access',
    gardening: 'yard',
    stargazing: 'auto_awesome',
    golf: 'golf_course',
    drone: 'flight',
    home: 'home',
    work: 'work'
};

const activityLabels: Record<ActivityType, string> = {
    bbq: 'BBQ',
    cycling: 'Fietsen',
    walking: 'Wandelen',
    sailing: 'Zeilen',
    running: 'Hardlopen',
    beach: 'Strand',
    gardening: 'Tuinieren',
    stargazing: 'Sterrenkijken',
    golf: 'Golf',
    drone: 'Drone Vliegen',
    home: 'Thuis',
    work: 'Werk'
};

const styles = [
    'zakelijk', 'makkelijk leesbaar', 'humor', 'sarcastisch', 'poëtisch',
    'enthousiast', 'wetenschappelijk', 'kort', 'uitgebreid', 'emoji-rijk', 'waarschuwend'
];

export const SettingsProfile: React.FC<Props> = ({ 
    profile, 
    profiles,
    onUpdate, 
    onSelectProfile,
    onCreateProfile,
    onDeleteProfile,
    currentLocationName
}) => {
    const { user } = useAuth();
    
    // Local state for immediate feedback
    const [localProfile, setLocalProfile] = useState<AIProfile>(DEFAULT_PROFILE);
    
    // Location Search State
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loadingCity, setLoadingCity] = useState(false);

    // Sync local state when prop changes (e.g. switching profiles)
    useEffect(() => {
        if (profile) {
            let finalProfile = { ...profile };
            if (!finalProfile.name && user?.email) {
                const nameFromEmail = user.email.split('@')[0];
                finalProfile.name = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
            }
            setLocalProfile(finalProfile);
        } else {
            let defaultName = 'Mijn Profiel';
            if (user?.email) {
                 const nameFromEmail = user.email.split('@')[0];
                 defaultName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
            }
            setLocalProfile({ ...DEFAULT_PROFILE, name: defaultName });
        }
    }, [profile, user?.email]); 

    // Handle change with optional immediate save
    const handleChange = (field: keyof AIProfile, value: any, immediate = false) => {
        const updated = { ...localProfile, [field]: value };
        setLocalProfile(updated);
        
        if (immediate) {
            onUpdate(updated);
        }
    };

    // Save on blur for text inputs
    const handleBlur = () => {
        onUpdate(localProfile);
        // Delay hiding dropdown to allow click
        setTimeout(() => setShowDropdown(false), 200);
    };

    const handleLocationSearch = async (query: string) => {
        handleChange('location', query);
        if (!query.trim()) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }
        
        setLoadingCity(true);
        try {
            const results = await searchCityByName(query, 'nl');
            setSearchResults(results);
            setShowDropdown(results.length > 0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingCity(false);
        }
    };

    const selectCity = (city: Location) => {
        handleChange('location', city.name, true);
        setSearchResults([]);
        setShowDropdown(false);
    };

    const toggleArrayItem = (field: keyof AIProfile, item: string) => {
        const current = (localProfile[field] as string[]) || [];
        let newValue;
        
        // Mandatory check for reportStyle
        if (field === 'reportStyle' && current.length === 1 && current.includes(item)) {
            return; // Cannot uncheck the last item
        }

        if (current.includes(item)) {
            newValue = current.filter(i => i !== item);
        } else {
            newValue = [...current, item];
        }
        handleChange(field, newValue, true); // Immediate save for toggles
    };

    const toggleActivity = (activity: ActivityType) => {
        let currentActivities: ActivityType[] = [];
        if (Array.isArray(localProfile.activities)) {
            currentActivities = [...localProfile.activities];
        } else if (typeof localProfile.activities === 'string') {
            currentActivities = [];
        }

        let newValue;
        if (currentActivities.includes(activity)) {
            newValue = currentActivities.filter(a => a !== activity);
        } else {
            newValue = [...currentActivities, activity];
        }
        handleChange('activities', newValue, true); // Immediate save for toggles
    };

    const isActivitySelected = (activity: ActivityType): boolean => {
        if (Array.isArray(localProfile.activities)) {
            return localProfile.activities.includes(activity);
        }
        return false; 
    };
    
    const isEdwin = user?.email === 'edwin@editsolutions.nl';
    const canCreateProfile = isEdwin && (profiles?.length || 0) < 3;

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-slate-600 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">
                    Persoonlijk AI Profiel
                </h2>
                {profiles && profiles.length > 0 && (
                     <div className="flex gap-2">
                        {profiles.map((prof, index) => (
                            <button
                                key={`${prof.id}-${index}`}
                                onClick={() => onSelectProfile && onSelectProfile(prof)}
                                className={`px-3 py-1 text-xs rounded-lg transition-colors border ${
                                    prof.id === localProfile.id 
                                    ? 'bg-primary text-white border-primary' 
                                    : 'bg-transparent text-slate-500 dark:text-white/50 border-slate-200 dark:border-white/10'
                                }`}
                            >
                                {prof.id === localProfile.id ? (localProfile.name || 'Naamloos') : (prof.name || 'Naamloos')}
                            </button>
                        ))}
                        {canCreateProfile && onCreateProfile && (
                            <button
                                onClick={onCreateProfile}
                                className="px-3 py-1 text-xs rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                            >
                                + Nieuw
                            </button>
                        )}
                     </div>
                )}
            </div>
            
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm p-4 space-y-6">
                
                {/* Profile Name (Mandatory) */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                        Profiel Naam <span className="text-red-400">*</span>
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={localProfile.name || ''}
                            onChange={(e) => handleChange('name', e.target.value)}
                            onBlur={handleBlur}
                            placeholder="Mijn Weerbericht"
                            className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm border-none focus:ring-2 focus:ring-primary outline-none"
                        />
                        {profiles && profiles.length > 1 && onDeleteProfile && (
                            <button 
                                onClick={() => localProfile.id && onDeleteProfile(localProfile.id)}
                                className="px-4 py-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                                title="Verwijder profiel"
                            >
                                <Icon name="delete" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Activities (Toggles) */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                        Belangrijke Activiteiten
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {(Object.keys(activityIcons) as ActivityType[]).map((activity) => (
                            <button
                                key={activity}
                                onClick={() => toggleActivity(activity)}
                                className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all border ${
                                    isActivitySelected(activity)
                                        ? 'bg-primary/10 border-primary text-primary'
                                        : 'bg-slate-50 dark:bg-slate-800/50 border-transparent text-slate-500 dark:text-white/50 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                <Icon name={activityIcons[activity]} className="text-2xl mb-2" />
                                <span className="text-xs font-medium">{activityLabels[activity]}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Location */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                        Locatie / Woonplaats
                    </label>
                    <div className="flex gap-2 relative">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={localProfile.location}
                                onChange={(e) => handleLocationSearch(e.target.value)}
                                onBlur={handleBlur}
                                placeholder="Bijv. Amsterdam"
                                className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm border-none focus:ring-2 focus:ring-primary outline-none"
                            />
                            {loadingCity && (
                                <div className="absolute right-3 top-3">
                                    <Icon name="sync" className="animate-spin text-slate-400" />
                                </div>
                            )}
                            
                            {/* Dropdown */}
                            {showDropdown && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
                                    {searchResults.map((city, index) => (
                                        <button
                                            key={`${city.name}-${city.country}-${index}`}
                                            onClick={() => selectCity(city)}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 text-sm border-b border-slate-100 dark:border-white/5 last:border-0"
                                        >
                                            <span className="font-bold block text-slate-800 dark:text-white">{city.name}</span>
                                            <span className="text-xs text-slate-500 dark:text-white/50">{city.country}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {currentLocationName && (
                            <button
                                onClick={() => handleChange('location', currentLocationName, true)}
                                className="bg-slate-100 dark:bg-slate-800 px-4 rounded-xl text-slate-600 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                title="Gebruik huidige locatie"
                            >
                                <Icon name="my_location" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Time of Day */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                        Belangrijke Dagdelen
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {['ochtend', 'middag', 'avond', 'nacht'].map(t => (
                            <button
                                key={t}
                                onClick={() => toggleArrayItem('timeOfDay', t)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    localProfile.timeOfDay?.includes(t)
                                        ? 'bg-primary text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Transport */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                        Vervoer
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {['lopen', 'fiets', 'motor', 'auto', 'OV', 'onbelangrijk'].map(t => (
                            <button
                                key={t}
                                onClick={() => toggleArrayItem('transport', t)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    localProfile.transport?.includes(t)
                                        ? 'bg-primary text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Report Style */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                        Stijl Weerbericht
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {styles.map(s => (
                            <button
                                key={s}
                                onClick={() => toggleArrayItem('reportStyle', s)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    localProfile.reportStyle?.includes(s)
                                        ? 'bg-purple-500 text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Other Instructions */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                        Andere Instructies (Optioneel)
                    </label>
                    <textarea
                        value={localProfile.otherInstructions}
                        onChange={(e) => handleChange('otherInstructions', e.target.value)}
                        onBlur={handleBlur}
                        placeholder="Bijv. ik hou niet van kou, waarschuw me extra..."
                        className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm border-none focus:ring-2 focus:ring-primary outline-none min-h-[60px]"
                    />
                </div>

                {/* Days Ahead */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                        Dagen Vooruit
                    </label>
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
                        {[1, 2, 3, 7, 14].map(d => (
                            <button
                                key={d}
                                onClick={() => handleChange('daysAhead', d, true)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                                    localProfile.daysAhead === d
                                        ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm'
                                        : 'text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white'
                                }`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>

            </div>
        </section>
    );
};
