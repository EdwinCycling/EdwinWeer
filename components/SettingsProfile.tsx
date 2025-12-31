import React, { useEffect, useState, useRef } from 'react';
import { BaroProfile, ActivityType, Location, AppLanguage, EmailScheduleDay } from '../types';
import { Icon } from './Icon';
import { useAuth } from '../contexts/AuthContext';
import { searchCityByName } from '../services/geoService';
import { getTranslation } from '../services/translations';

interface Props {
    profile: BaroProfile | undefined;
    profiles?: BaroProfile[];
    onUpdate: (profile: BaroProfile) => void;
    onSelectProfile?: (profile: BaroProfile) => void;
    onCreateProfile?: () => void;
    onDeleteProfile?: (id: string) => void;
    currentLocationName?: string;
    language?: AppLanguage;
    showScheduleConfig?: boolean;
}

const DEFAULT_PROFILE: BaroProfile = {
    id: 'default',
    name: 'Mijn Profiel',
    activities: [],
    location: '',
    timeOfDay: [],
    transport: [],
    hobbies: '',
    otherInstructions: '',
    daysAhead: 3,
    reportStyle: ['enthousiast'],
    hayFever: false
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
        'enthousiast', 'wetenschappelijk', 'emoji-rijk', 'waarschuwend'
    ];

export const SettingsProfile: React.FC<Props> = ({ 
    profile, 
    profiles,
    onUpdate, 
    onSelectProfile,
    onCreateProfile,
    onDeleteProfile,
    currentLocationName,
    language,
    showScheduleConfig = false
}) => {
    const { user } = useAuth();
    const t = (key: string) => getTranslation(key, language || 'nl');
    
    // Local state for immediate feedback
    const [localProfile, setLocalProfile] = useState<BaroProfile>(DEFAULT_PROFILE);
    
    // Location Search State
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loadingCity, setLoadingCity] = useState(false);
    const timerRef = useRef<any>(null);

    // Sync local state when prop changes (e.g. switching profiles)
    useEffect(() => {
        if (profile) {
            let finalProfile = { ...profile };
            if (!finalProfile.name && user?.email) {
                const nameFromEmail = user.email.split('@')[0];
                finalProfile.name = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
            }
            if (typeof finalProfile.isGeneralReport === 'undefined') {
                finalProfile.isGeneralReport = false;
            }
            setLocalProfile(finalProfile);
        } else {
            let defaultName = 'Mijn Profiel';
            if (user?.email) {
                 const nameFromEmail = user.email.split('@')[0];
                 defaultName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
            }
            setLocalProfile({ ...DEFAULT_PROFILE, name: defaultName, isGeneralReport: false });
        }
    }, [profile, user?.email]); 

    // Handle change with optional immediate save
    const handleChange = (field: keyof BaroProfile, value: any, immediate = false) => {
        // Max length validation
        if (field === 'name' && typeof value === 'string' && value.length > 40) {
            value = value.substring(0, 40);
        }
        if (field === 'location' && typeof value === 'string' && value.length > 60) {
            value = value.substring(0, 60);
        }
        if (field === 'hobbies' && typeof value === 'string' && value.length > 200) {
            value = value.substring(0, 200);
        }
        if (field === 'otherInstructions' && typeof value === 'string' && value.length > 500) {
            value = value.substring(0, 500);
        }

        const updated = { ...localProfile, [field]: value };
        setLocalProfile(updated);
        
        // Use debounce for text fields unless immediate
        if (immediate) {
            onUpdate(updated);
        } else {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                onUpdate(updated);
            }, 1000);
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

    const toggleArrayItem = (field: keyof BaroProfile, item: string) => {
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

    // Email Schedule Logic
    const schedule = localProfile.emailSchedule || { enabled: false, days: [] };
    const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    useEffect(() => {
        if (schedule.enabled && (!schedule.days || schedule.days.length === 0)) {
            const defaultDays = daysOfWeek.map(d => ({
                day: d,
                breakfast: false,
                lunch: false,
                dinner: false
            }));
            handleChange('emailSchedule', { ...schedule, days: defaultDays }, true);
        }
    }, [schedule.enabled]);

    const countTotalScheduled = () => {
        if (!schedule.days) return 0;
        return schedule.days.reduce((acc, day) => 
            acc + (day.breakfast ? 1 : 0) + (day.lunch ? 1 : 0) + (day.dinner ? 1 : 0), 0);
    };

    const totalScheduled = countTotalScheduled();
    const isLimitReached = totalScheduled >= 5;

    const toggleScheduleDay = (dayIndex: number, slot: 'breakfast' | 'lunch' | 'dinner') => {
        const newDays = [...(schedule.days || [])];
        const currentVal = newDays[dayIndex][slot];
        
        // Check limit if turning ON
        if (!currentVal && isLimitReached) return;

        // If turning ON, disable other slots for this day (Exclusive Selection)
        if (!currentVal) {
            newDays[dayIndex] = {
                ...newDays[dayIndex],
                breakfast: false,
                lunch: false,
                dinner: false,
                [slot]: true
            };
        } else {
            // If turning OFF, just toggle
            newDays[dayIndex] = { ...newDays[dayIndex], [slot]: false };
        }

        handleChange('emailSchedule', { ...schedule, days: newDays }, true);
    };
    
    const canCreateProfile = (profiles?.length || 0) < 3;

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-slate-600 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">
                    Persoonlijk Baro Profiel
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

                {/* Location */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                        Locatie / Woonplaats <span className="text-red-400">*</span>
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

                {/* Length Report */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                        Lengte Bericht
                    </label>
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
                        {([
                            { id: 'factual', label: 'Feitelijk' },
                            { id: 'standard', label: 'Standaard' },
                            { id: 'extended', label: 'Uitgebreid' }
                        ]).map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => handleChange('reportLength', opt.id, true)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                                    (localProfile.reportLength || 'standard') === opt.id
                                        ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm'
                                        : 'text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-white/40 mt-1">
                        {(localProfile.reportLength || 'standard') === 'factual' && "Kort en bondig, weinig tekst, vooral data."}
                        {(localProfile.reportLength || 'standard') === 'standard' && "Een gebalanceerd weerbericht."}
                        {(localProfile.reportLength || 'standard') === 'extended' && "Een uitgebreid verhaal met veel details."}
                    </p>
                </div>

                {/* General Report Checkbox */}
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-white/5">
                    <button
                        onClick={() => handleChange('isGeneralReport', !localProfile.isGeneralReport, true)}
                        className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                            localProfile.isGeneralReport 
                                ? 'bg-primary text-white' 
                                : 'bg-white dark:bg-slate-700 border border-slate-300 dark:border-white/20'
                        }`}
                    >
                        {localProfile.isGeneralReport && <Icon name="check" className="text-sm" />}
                    </button>
                    <div className="flex-1">
                        <span className="text-sm font-medium text-slate-800 dark:text-white block">Algemeen weerbericht</span>
                        <span className="text-xs text-slate-500 dark:text-white/50 block">Negeer activiteiten en persoonlijke voorkeuren</span>
                    </div>
                </div>

                {!localProfile.isGeneralReport && (
                    <>
                        {/* Activities (Toggles) */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                                Belangrijke Activiteiten
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                {(Object.keys(activityIcons) as ActivityType[])
                                    .filter(activity => activity !== 'home' && activity !== 'work')
                                    .map((activity) => (
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
                                                ? 'bg-primary text-white'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Health */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2">
                                Gezondheid
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => handleChange('hayFever', !localProfile.hayFever, true)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                                        localProfile.hayFever
                                            ? 'bg-primary text-white'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    <Icon name="grain" className="text-lg" />
                                    Hooikoorts
                                </button>
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
                    </>
                )}

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

                {/* Email Schedule */}
                {showScheduleConfig && (
                <div className="border-t border-slate-200 dark:border-white/5 pt-6 mt-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-medium text-slate-800 dark:text-white">
                                {t('profile.schedule.title')}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-white/50">
                                {t('profile.schedule.max_limit')}
                            </p>
                        </div>
                        <button
                            onClick={() => handleChange('emailSchedule', { ...schedule, enabled: !schedule.enabled }, true)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                schedule.enabled ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    schedule.enabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>

                    {schedule.enabled && schedule.days && (
                        <div className="space-y-3">
                            {/* Header */}
                            <div className="grid grid-cols-4 gap-2 text-xs font-medium text-slate-500 dark:text-white/50 mb-2">
                                <div>{t('profile.schedule.days')}</div>
                                <div className="text-center">🥞 {t('profile.schedule.breakfast').split(' ')[0]}</div>
                                <div className="text-center">🥪 {t('profile.schedule.lunch').split(' ')[0]}</div>
                                <div className="text-center">🍖 {t('profile.schedule.dinner').split(' ')[0]}</div>
                            </div>

                            {/* Days */}
                            {schedule.days.map((day, index) => (
                                <div key={day.day} className="grid grid-cols-4 gap-2 items-center">
                                    <div className="text-sm text-slate-700 dark:text-white capitalize">
                                        {t(`days.${day.day}`) === `days.${day.day}` ? day.day : t(`days.${day.day}`)}
                                    </div>
                                    {['breakfast', 'lunch', 'dinner'].map((slot) => {
                                        const isChecked = (day as any)[slot];
                                        const disabled = !isChecked && isLimitReached;
                                        return (
                                            <div key={slot} className="flex justify-center">
                                                <button
                                                    onClick={() => toggleScheduleDay(index, slot as any)}
                                                    disabled={disabled}
                                                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                                        isChecked 
                                                            ? 'bg-primary border-primary text-white' 
                                                            : disabled
                                                                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed'
                                                                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-white/20 hover:border-primary'
                                                    }`}
                                                >
                                                    {isChecked && <Icon name="check" className="text-xs" />}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}

                            <div className="pt-2 text-right">
                                <span className={`text-xs font-medium ${isLimitReached ? 'text-red-500' : 'text-slate-500 dark:text-white/50'}`}>
                                    {t('profile.schedule.total')}: {totalScheduled}/5
                                </span>
                            </div>
                        </div>
                    )}
                </div>
                )}

            </div>
        </section>
    );
};
