import React, { useState, useEffect, useRef } from 'react';
import { ViewState, AppSettings, BaroWeermanSettings, TripPlannerSettings, Location } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getUsage } from '../services/usageService';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { loadCurrentLocation } from '../services/storageService';

interface Props {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
}

export const BaroWeermanView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
    const { user } = useAuth();
    const t = (key: string) => getTranslation(key, settings.language);
    
    // State
    const [baroCredits, setBaroCredits] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [telegramLinked, setTelegramLinked] = useState(false);
    
    // Form State
    const [enabled, setEnabled] = useState<boolean>(false);
    const [channel, setChannel] = useState<'email' | 'telegram'>('email');
    const [selectedDays, setSelectedDays] = useState<string[]>([]);
    
    // Trip Settings State
    const [tripSettings, setTripSettings] = useState<TripPlannerSettings>({
        activity: 'cycling',
        startTime: '08:00', // Default morning commute
        marginBefore: 0,
        marginAfter: 1,
        duration: 1
    });
    
    // Location State
    const [location, setLocation] = useState<Location>(loadCurrentLocation());
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Load initial data
    useEffect(() => {
        const init = async () => {
            if (user) {
                // 1. Get Credits
                const usage = await getUsage();
                setBaroCredits(usage.baroCredits || 0);

                // 2. Get User Settings (Baro Weerman)
                try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        setTelegramLinked(!!data.telegramChatId);
                        
                        const savedSettings = data.baro_weerman as BaroWeermanSettings | undefined;
                        if (savedSettings) {
                            setEnabled(savedSettings.enabled);
                            setChannel(savedSettings.channel);
                            setSelectedDays(savedSettings.days || []);
                            if (savedSettings.trip_settings) {
                                setTripSettings(savedSettings.trip_settings);
                            }
                            if (savedSettings.location) {
                                setLocation(savedSettings.location);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error fetching user data", e);
                }
            }
        };
        init();
    }, [user]);

    // Focus search input
    useEffect(() => {
        if (isSearchOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isSearchOpen]);

    // Search Logic
    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }

        setLoadingSearch(true);
        try {
            const results = await searchCityByName(query);
            setSearchResults(results);
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            setLoadingSearch(false);
        }
    };

    const selectLocation = (loc: Location) => {
        setLocation(loc);
        setIsSearchOpen(false);
        setSearchQuery('');
    };

    // Save Logic
    const handleSave = async (newEnabled: boolean) => {
        if (!user) return;
        
        // Validation
        if (newEnabled) {
            if (baroCredits <= 0) {
                alert(t('cycling.no_credits_alert'));
                return;
            }
            if (selectedDays.length === 0) {
                alert("Selecteer minimaal 1 dag.");
                return;
            }
        }

        setLoading(true);
        
        const newSettings: BaroWeermanSettings = {
            enabled: newEnabled,
            channel,
            days: selectedDays,
            trip_settings: tripSettings,
            location
        };

        try {
            await updateDoc(doc(db, 'users', user.uid), {
                'baro_weerman': newSettings
            });
            
            // Update local settings context if needed
            onUpdateSettings({
                ...settings,
                baro_weerman: newSettings
            });
            
            setEnabled(newEnabled);
            alert(t('baro_weerman.saved'));

        } catch (error) {
            console.error("Error updating settings:", error);
            alert("Er is een fout opgetreden bij het opslaan.");
        } finally {
            setLoading(false);
        }
    };

    // Toggle Day Logic
    const toggleDay = (day: string) => {
        if (selectedDays.includes(day)) {
            setSelectedDays(selectedDays.filter(d => d !== day));
        } else {
            if (selectedDays.length >= 3) {
                alert(t('baro_weerman.limit_reached'));
                return;
            }
            setSelectedDays([...selectedDays, day]);
        }
    };

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

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
                        <Icon name="face" className="text-2xl" /> {t('share.photo_weather')}
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
                    <h2 className="text-lg font-bold mb-2 text-slate-800 dark:text-white">{t('baro_weerman.intro_title')}</h2>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
                        {t('baro_weerman.intro_desc')}
                    </p>
                </div>

                {/* Settings Form */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/5 shadow-sm space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
                        <h3 className="font-bold text-lg text-slate-800 dark:text-white">{t('baro_weerman.settings_title')}</h3>
                        
                        {/* Master Toggle */}
                        <button
                            onClick={() => handleSave(!enabled)}
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

                    {/* Location Search */}
                    <div className="relative">
                        <label className="text-sm font-medium text-slate-500 dark:text-white/60 mb-1 block">{t('trip_planner.location')}</label>
                        <div 
                            onClick={() => setIsSearchOpen(true)}
                            className="flex items-center bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                        >
                            <Icon name="location_on" className="text-primary mr-2" />
                            <span className="font-bold truncate flex-1">{location.name}, {location.country}</span>
                            <Icon name="search" className="text-slate-400" />
                        </div>

                        {/* Search Dropdown */}
                        {isSearchOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1e293b] rounded-xl shadow-xl border border-slate-200 dark:border-white/10 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-2 border-b border-slate-100 dark:border-white/5 flex items-center gap-2">
                                    <Icon name="search" className="text-slate-400 ml-2" />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder={t('trip_planner.search_location')}
                                        className="w-full bg-transparent p-2 outline-none text-slate-800 dark:text-white placeholder:text-slate-400"
                                        value={searchQuery}
                                        onChange={(e) => handleSearch(e.target.value)}
                                    />
                                    <button onClick={() => setIsSearchOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg">
                                        <Icon name="close" />
                                    </button>
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                    {loadingSearch ? (
                                        <div className="p-4 text-center text-slate-400 text-sm">Loading...</div>
                                    ) : searchResults.length > 0 ? (
                                        searchResults.map((loc, i) => (
                                            <button
                                                key={i}
                                                onClick={() => selectLocation(loc)}
                                                className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-3 transition-colors border-b border-slate-50 dark:border-white/5 last:border-0"
                                            >
                                                <div className="size-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                                                    <Icon name="location_city" className="text-slate-500 dark:text-white/60 text-sm" />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm">{loc.name}</div>
                                                    <div className="text-xs text-slate-500 dark:text-white/50">{loc.country}</div>
                                                </div>
                                            </button>
                                        ))
                                    ) : searchQuery.length > 1 ? (
                                        <div className="p-4 text-center text-slate-400 text-sm">{t('city_not_found')}</div>
                                    ) : null}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Activity Toggle */}
                    <div>
                        <label className="text-sm font-medium text-slate-500 dark:text-white/60 mb-2 block">{t('trip_planner.activity')}</label>
                        <div className="flex bg-slate-100 dark:bg-white/5 rounded-lg p-1 w-fit">
                            <button 
                                onClick={() => setTripSettings({ ...tripSettings, activity: 'cycling' })}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tripSettings.activity === 'cycling' ? 'bg-white dark:bg-white/10 shadow text-primary' : 'text-slate-500 dark:text-white/50'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <Icon name="directions_bike" className="text-lg" />
                                    {t('trip_planner.cycling')}
                                </div>
                            </button>
                            <button 
                                onClick={() => setTripSettings({ ...tripSettings, activity: 'walking' })}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tripSettings.activity === 'walking' ? 'bg-white dark:bg-white/10 shadow text-primary' : 'text-slate-500 dark:text-white/50'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <Icon name="directions_walk" className="text-lg" />
                                    {t('trip_planner.walking')}
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Start Time & Duration */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-500 dark:text-white/60">{t('trip_planner.start_time')}</label>
                            <input 
                                type="time" 
                                value={tripSettings.startTime}
                                onChange={(e) => setTripSettings({ ...tripSettings, startTime: e.target.value })}
                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-3 text-lg font-bold outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <label className="text-sm font-medium text-slate-500 dark:text-white/60">{t('trip_planner.duration')}</label>
                                <span className="font-bold">{tripSettings.duration} {t('trip_planner.duration_hours')}</span>
                            </div>
                            <input 
                                type="range" 
                                min="1" 
                                max="4" 
                                step="1"
                                value={tripSettings.duration}
                                onChange={(e) => setTripSettings({ ...tripSettings, duration: parseInt(e.target.value) })}
                                className="w-full accent-primary h-2 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Schedule (Days) */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-slate-500 dark:text-white/60">{t('baro_weerman.schedule')}</label>
                            <span className={`text-xs font-bold ${selectedDays.length === 3 ? 'text-orange-500' : 'text-slate-400'}`}>
                                {selectedDays.length}/3
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {days.map(day => {
                                const isSelected = selectedDays.includes(day);
                                return (
                                    <button
                                        key={day}
                                        onClick={() => toggleDay(day)}
                                        className={`px-3 py-2 rounded-lg text-sm font-bold transition-all border ${
                                            isSelected 
                                                ? 'bg-primary text-white border-primary shadow-md' 
                                                : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        {t(`days.${day}`).substring(0, 2)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Channels */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                            {t('baro_weerman.channel_select')}
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${channel === 'email' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                <input
                                    type="radio"
                                    name="channel"
                                    value="email"
                                    checked={channel === 'email'}
                                    onChange={() => setChannel('email')}
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
                                    onChange={() => setChannel('telegram')}
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

                    {/* Credits Info */}
                    <div className="text-center text-xs text-slate-400 dark:text-slate-600 pt-4 border-t border-slate-100 dark:border-white/5">
                        <p>{t('baro_weerman.credits_info')}</p>
                    </div>

                    {/* Save Button (Explicit save if user made changes but didn't toggle master switch) */}
                    {enabled && (
                        <button
                            onClick={() => handleSave(true)}
                            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                        >
                            <Icon name="save" />
                            {t('baro_weerman.save')}
                        </button>
                    )}

                </div>
            </div>
        </div>
    );
};
