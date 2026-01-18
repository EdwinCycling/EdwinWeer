
import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, TempUnit, WindUnit, PrecipUnit, PressureUnit, Location, AppTheme, AppLanguage, ActivityType } from '../types';
import { Icon } from '../components/Icon';
import { CountrySelector } from '../components/CountrySelector';
import { getTranslation } from '../services/translations';
import { searchCityByName, reverseGeocodeFull } from '../services/geoService';
import { getUsage, UsageStats, getLimit } from '../services/usageService';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
    settings: AppSettings;
    onUpdateSettings: (newSettings: AppSettings) => void;
    onNavigate: (view: ViewState) => void;
    initialTab?: 'cities' | 'activities' | 'general' | 'records';
}


const activityIcons: Record<ActivityType, string> = {
    bbq: 'outdoor_grill',
    cycling: 'directions_bike',
    walking: 'directions_walk',
    sailing: 'sailing',
    running: 'directions_run',
    beach: 'beach_access',
    gardening: 'yard',
    stargazing: 'nights_stay',
    golf: 'sports_golf',
    padel: 'sports_tennis',
    field_sports: 'sports_soccer',
    tennis: 'sports_tennis',
    home: 'home',
    work: 'work'
};

export const SettingsView: React.FC<Props> = ({ settings, onUpdateSettings, onNavigate, initialTab }) => {
    const { user } = useAuth();
    const { theme, setTheme } = useTheme();
    const [newCity, setNewCity] = useState('');
    const [loadingCity, setLoadingCity] = useState(false);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
    const [localFavorites, setLocalFavorites] = useState<Location[]>(settings.favorites);
    
    // Tab State
    const [activeTab, setActiveTab] = useState<'cities' | 'activities' | 'general' | 'records'>('general');

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    React.useEffect(() => {
        setUsageStats(getUsage());
    }, []);

    // Sync local favorites when settings change (unless dragging)
    useEffect(() => {
        if (draggedItemIndex === null) {
            setLocalFavorites(settings.favorites);
        }
    }, [settings.favorites, draggedItemIndex]);

    const t = (key: string) => getTranslation(key, settings.language);

    const parseNumberInRange = (value: string, min: number, max: number): number | null => {
        if (!value.trim()) return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return null;
        if (parsed < min) return min;
        if (parsed > max) return max;
        return parsed;
    };

    const formatHeatwaveTempValue = (valueC: number): string => {
        if (settings.tempUnit === TempUnit.FAHRENHEIT) {
            const f = (valueC * 9) / 5 + 32;
            return String(Math.round(f));
        }
        return String(Math.round(valueC));
    };

    const formatRecordTempValue = (valueC: number): string => {
        if (settings.tempUnit === TempUnit.FAHRENHEIT) {
            const f = (valueC * 9) / 5 + 32;
            return String(Math.round(f));
        }
        return String(Math.round(valueC));
    };

    const updateRecordThresholdTemp = (
        field: 'summerStreakTemp' | 'niceStreakTemp' | 'coldStreakTemp' | 'iceStreakTemp',
        raw: string,
        minC: number,
        maxC: number
    ) => {
        const minInput = settings.tempUnit === TempUnit.FAHRENHEIT ? (minC * 9) / 5 + 32 : minC;
        const maxInput = settings.tempUnit === TempUnit.FAHRENHEIT ? (maxC * 9) / 5 + 32 : maxC;
        const parsed = parseNumberInRange(raw, minInput, maxInput);
        if (parsed === null) return;

        let valueC = parsed;
        if (settings.tempUnit === TempUnit.FAHRENHEIT) {
            valueC = ((parsed - 32) * 5) / 9;
        }

        const nextThresholds = {
            ...settings.recordThresholds,
            [field]: Math.round(valueC),
        };

        const summerC = nextThresholds.summerStreakTemp ?? 25;
        const niceC = nextThresholds.niceStreakTemp ?? 20;
        const coldC = nextThresholds.coldStreakTemp ?? 5;
        const iceC = nextThresholds.iceStreakTemp ?? 0;

        if (nextThresholds.niceStreakTemp !== undefined && nextThresholds.summerStreakTemp !== undefined) {
            if (niceC >= summerC) {
                if (field === 'summerStreakTemp') {
                    nextThresholds.niceStreakTemp = summerC - 1;
                } else {
                    return;
                }
            }
        }

        if (nextThresholds.iceStreakTemp !== undefined && nextThresholds.coldStreakTemp !== undefined) {
            if (iceC >= coldC) {
                if (field === 'coldStreakTemp') {
                    nextThresholds.iceStreakTemp = coldC - 1;
                } else {
                    return;
                }
            }
        }

        updateSetting('recordThresholds', nextThresholds);
    };

    const updateHeatwaveLength = (raw: string) => {
        const parsed = parseNumberInRange(raw, 1, 60);
        if (parsed === null) return;
        const next = {
            ...settings.heatwave,
            minLength: Math.round(parsed),
        };
        updateSetting('heatwave', next);
    };

    const updateHeatwaveThreshold = (field: 'lowerThreshold' | 'heatThreshold', raw: string) => {
        const parsed = parseNumberInRange(raw, -50, 60);
        if (parsed === null) return;
        let valueC = parsed;
        if (settings.tempUnit === TempUnit.FAHRENHEIT) {
            valueC = ((parsed - 32) * 5) / 9;
        }
        const next = {
            ...settings.heatwave,
            [field]: valueC,
        };
        updateSetting('heatwave', next);
    };

    const updateHeatwaveMinHeatDays = (raw: string) => {
        const parsed = parseNumberInRange(raw, 1, 60);
        if (parsed === null) return;
        const next = {
            ...settings.heatwave,
            minHeatDays: Math.round(parsed),
        };
        updateSetting('heatwave', next);
    };

    const updateSetting = (key: keyof AppSettings, value: any) => {
        onUpdateSettings({ ...settings, [key]: value });
    };

    const removeFavorite = (index: number) => {
        const newFavs = [...settings.favorites];
        newFavs.splice(index, 1);
        updateSetting('favorites', newFavs);
    };

    const searchCities = async () => {
        if (!newCity.trim()) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }
        setLoadingCity(true);
        try {
            const results = await searchCityByName(newCity, settings.language);
            setSearchResults(results);
            setShowDropdown(results.length > 0);
        } catch (e) {
            console.error(e);
            setSearchResults([]);
            setShowDropdown(false);
        } finally {
            setLoadingCity(false);
        }
    };

    const handleSelectCity = (loc: Location) => {
        updateSetting('favorites', [...settings.favorites, loc]);
        setNewCity('');
        setSearchResults([]);
        setShowDropdown(false);
    };

    const addFavorite = async () => {
        if (!newCity.trim() || searchResults.length === 0) return;
        // If there's only one result, add it directly
        if (searchResults.length === 1) {
            handleSelectCity(searchResults[0]);
        } else {
            // Otherwise, show the dropdown
            setShowDropdown(true);
        }
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedItemIndex(index);
        // Required for Firefox
        e.dataTransfer.effectAllowed = 'move'; 
        // Transparent drag image
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; 
        e.dataTransfer.setDragImage(img, 0, 0);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === index) return;

        const newFavs = [...settings.favorites];
        const draggedItem = newFavs[draggedItemIndex];
        
        // Remove item from old position
        newFavs.splice(draggedItemIndex, 1);
        // Insert at new position
        newFavs.splice(index, 0, draggedItem);

        updateSetting('favorites', newFavs);
        setDraggedItemIndex(index);
    };

    const handleDragEnd = () => {
        if (draggedItemIndex !== null) {
            updateSetting('favorites', localFavorites);
        }
        setDraggedItemIndex(null);
    };

    const moveFavorite = (index: number, direction: 'up' | 'down') => {
        const newFavs = [...settings.favorites];
        if (direction === 'up' && index > 0) {
            [newFavs[index], newFavs[index - 1]] = [newFavs[index - 1], newFavs[index]];
        } else if (direction === 'down' && index < newFavs.length - 1) {
            [newFavs[index], newFavs[index + 1]] = [newFavs[index + 1], newFavs[index]];
        }
        updateSetting('favorites', newFavs);
    };

    const tabs = [
        { id: 'cities', label: t('settings.favorites'), icon: 'location_city' },
        { id: 'activities', label: t('settings.activities_title'), icon: 'directions_bike' },
        { id: 'general', label: t('settings.general'), icon: 'tune' },
        { id: 'records', label: t('nav.records'), icon: 'equalizer' },
    ] as const;

    return (
        <div className="flex flex-col min-h-screen bg-bg-page pb-24 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 text-text-main transition-colors duration-300">
            {/* Header */}
            <div className="flex flex-col sticky top-0 bg-bg-card/95 backdrop-blur z-20 border-b border-border-color transition-colors">
                 <div className="flex items-center p-4">
                    <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-bg-page mr-2 text-text-main">
                        <Icon name="arrow_back_ios_new" />
                    </button>
                    <h1 className="text-lg font-bold">{t('nav.settings')}</h1>
                </div>
                
                {/* Tabs */}
                <div className="flex px-4 overflow-x-auto scrollbar-hide">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                                activeTab === tab.id 
                                    ? 'border-accent-primary text-accent-primary' 
                                    : 'border-transparent text-text-muted hover:text-text-main'
                            }`}
                        >
                            <Icon name={tab.icon} className="text-lg" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 space-y-8 max-w-lg mx-auto w-full mt-4">
                
                {/* Cities Tab */}
                {activeTab === 'cities' && (
                    <section>
                        <h2 className="text-text-muted text-xs font-bold uppercase tracking-wider mb-3">{t('settings.favorites')}</h2>
                        <div className="bg-bg-card border border-border-color rounded-2xl overflow-hidden p-4 shadow-sm transition-colors">
                            
                            <div className="relative mb-4">
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={newCity}
                                        onChange={(e) => setNewCity(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && searchCities()}
                                        placeholder={t('settings.add_city')}
                                        className="flex-1 bg-bg-input text-text-main text-sm rounded-xl px-4 py-3 border-none focus:ring-2 focus:ring-accent-primary outline-none"
                                    />
                                    <button 
                                        onClick={searchCities}
                                        disabled={loadingCity}
                                        className="bg-accent-primary hover:bg-accent-hover text-text-inverse px-4 rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        <Icon name={loadingCity ? "sync" : "search"} className={loadingCity ? "animate-spin" : ""} />
                                    </button>
                                </div>
                                
                                {/* Search Results Dropdown */}
                                {showDropdown && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border-color rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
                                        {searchResults.map((city, index) => (
                                            <button
                                                key={index}
                                                onClick={() => handleSelectCity(city)}
                                                className="w-full text-left px-4 py-3 hover:bg-bg-page text-sm border-b border-border-color last:border-0"
                                            >
                                                <span className="font-bold block">{city.name}</span>
                                                <span className="text-xs text-text-muted">{city.country}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Favorites List */}
                            <div className="space-y-2">
                                {localFavorites.length === 0 ? (
                                    <p className="text-center text-text-muted text-sm py-4">{t('settings.no_favs')}</p>
                                ) : (
                                    localFavorites.map((fav, index) => (
                                        <div 
                                            key={`${fav.name}-${index}`}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDragEnd={handleDragEnd}
                                            className={`flex items-center justify-between p-3 bg-bg-page rounded-xl group ${draggedItemIndex === index ? 'opacity-50' : ''} cursor-move`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Icon name="drag_indicator" className="text-text-muted/50 cursor-grab active:cursor-grabbing" />
                                                <div>
                                                    <div className="font-medium text-sm">{fav.name}</div>
                                                    <div className="text-xs text-text-muted">{fav.country}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="flex flex-col mr-2">
                                                    <button 
                                                        onClick={() => moveFavorite(index, 'up')} 
                                                        disabled={index === 0}
                                                        className="text-text-muted hover:text-text-main disabled:opacity-30 p-0.5"
                                                    >
                                                        <Icon name="keyboard_arrow_up" className="text-lg" />
                                                    </button>
                                                    <button 
                                                        onClick={() => moveFavorite(index, 'down')} 
                                                        disabled={index === localFavorites.length - 1}
                                                        className="text-text-muted hover:text-text-main disabled:opacity-30 p-0.5"
                                                    >
                                                        <Icon name="keyboard_arrow_down" className="text-lg" />
                                                    </button>
                                                </div>
                                                <button 
                                                    onClick={() => removeFavorite(index)}
                                                    className="text-text-muted hover:text-red-500 transition-colors p-2"
                                                >
                                                    <Icon name="delete" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {/* Activities Tab */}
                {activeTab === 'activities' && (
                     <section>
                        <h2 className="text-text-muted text-xs font-bold uppercase tracking-wider mb-3">{t('settings.activities_title')}</h2>
                        <p className="text-xs text-text-muted mb-3">{t('settings.activities_desc')}</p>
                        <div className="bg-bg-card border border-border-color rounded-2xl overflow-hidden shadow-sm transition-colors">
                            {settings.enabledActivities && Object.entries(settings.enabledActivities)
                                .filter(([key]) => key !== 'home' && key !== 'work')
                                .map(([key, enabled], index) => {
                                 const activityKey = key as ActivityType;
                                 const isLocked = activityKey === 'cycling' || activityKey === 'walking';
                                 return (
                                     <div key={key} className={`p-4 flex items-center justify-between ${index !== 0 ? 'border-t border-border-color' : ''}`}>
                                         <div className="flex items-center gap-3">
                                             <Icon name={activityIcons[activityKey] || 'sports_score'} className="text-text-main" />
                                             <span className="font-medium text-text-main">{t(`activity.${activityKey}`)}</span>
                                         </div>
                                         <div className="flex items-center">
                                             <button
                                                 onClick={() => {
                                                     if (isLocked) return;
                                                     updateSetting('enabledActivities', {
                                                         ...settings.enabledActivities,
                                                         [activityKey]: !enabled
                                                     });
                                                 }}
                                                 className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-accent-primary' : 'bg-text-muted/30'} ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                             >
                                                 <div className={`absolute top-1 left-1 bg-text-inverse w-4 h-4 rounded-full transition-transform ${enabled ? 'translate-x-6' : ''}`} />
                                             </button>
                                         </div>
                                     </div>
                                 );
                            })}
                        </div>
                    </section>
                )}

                {/* General Tab */}
                {activeTab === 'general' && (
                    <>
                        {/* Appearance Section */}
                        <section>
                             <h2 className="text-text-muted text-xs font-bold uppercase tracking-wider mb-3">{t('settings.theme')} & {t('settings.language')}</h2>
                             <div className="bg-bg-card border border-border-color rounded-2xl overflow-hidden shadow-sm transition-colors">
                                
                                {/* Theme Toggle */}
                                <div className="p-4 border-b border-border-color flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <Icon name="contrast" className="text-text-main" />
                                        <span className="font-medium text-text-main">{t('settings.theme')}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 bg-bg-page rounded-lg p-1">
                                        <button onClick={() => setTheme('light')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${theme === 'light' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
                                            <Icon name="light_mode" className="text-sm mr-1 inline" /> {t('theme.light')}
                                        </button>
                                        <button onClick={() => setTheme('dark')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${theme === 'dark' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
                                            <Icon name="dark_mode" className="text-sm mr-1 inline" /> {t('theme.dark')}
                                        </button>
                                        <button onClick={() => setTheme('neuro')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${theme === 'neuro' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
                                            <Icon name="psychology" className="text-sm mr-1 inline" /> Neuro
                                        </button>
                                        <button onClick={() => setTheme('iceland')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${theme === 'iceland' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
                                            <Icon name="ac_unit" className="text-sm mr-1 inline" /> Iceland
                                        </button>
                                        <button onClick={() => setTheme('retro')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${theme === 'retro' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
                                            <Icon name="music_note" className="text-sm mr-1 inline" /> Retro
                                        </button>
                                        <button onClick={() => setTheme('forest')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${theme === 'forest' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
                                            <Icon name="forest" className="text-sm mr-1 inline" /> Forest
                                        </button>
                                    </div>
                                </div>

                                {/* Language Toggle */}
                                <div className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Icon name="language" className="text-text-main" />
                                        <span className="font-medium text-text-main">{t('settings.language')}</span>
                                    </div>
                                    <div className="flex bg-bg-page rounded-lg p-1 overflow-x-auto max-w-[200px] scrollbar-hide">
                                        {(['en', 'nl', 'fr', 'de', 'es'] as AppLanguage[]).map((lang) => (
                                            <button 
                                                key={lang}
                                                onClick={() => updateSetting('language', lang)} 
                                                className={`px-3 py-1 rounded-md text-sm font-bold transition-colors uppercase ${settings.language === lang ? 'bg-accent-primary text-text-inverse shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                            >
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Time Format Toggle */}
                                <div className="p-4 flex items-center justify-between border-t border-border-color">
                                    <div className="flex items-center gap-3">
                                        <Icon name="schedule" className="text-text-main" />
                                        <span className="font-medium text-text-main">{t('settings.time_format')}</span>
                                    </div>
                                    <div className="flex bg-bg-page rounded-lg p-1">
                                        <button onClick={() => updateSetting('timeFormat', '24h')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.timeFormat === '24h' ? 'bg-accent-primary text-text-inverse shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
                                            24h
                                        </button>
                                        <button onClick={() => updateSetting('timeFormat', '12h')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.timeFormat === '12h' ? 'bg-accent-primary text-text-inverse shadow-sm' : 'text-text-muted hover:text-text-main'}`}>
                                            12h
                                        </button>
                                    </div>
                                </div>

                                {/* Country Selection */}
                                <div className="p-4 border-t border-border-color">
                                    <CountrySelector 
                                        value={settings.countryCode || 'US'} 
                                        onChange={(code) => updateSetting('countryCode', code)}
                                        language={settings.language}
                                    />
                                </div>

                                {/* Timezone */}
                                <div className="p-4 flex items-center justify-between border-t border-border-color">
                                    <div className="flex items-center gap-3">
                                        <Icon name="public" className="text-text-main/80" />
                                        <span className="font-medium text-text-main">{t('settings.timezone')}</span>
                                    </div>
                                    <select 
                                        value={settings.timezone || 'Europe/Amsterdam'}
                                        onChange={(e) => updateSetting('timezone', e.target.value)}
                                        className="bg-bg-page text-text-main text-sm rounded-lg px-3 py-1.5 border-none focus:ring-1 focus:ring-accent-primary outline-none cursor-pointer"
                                    >
                                        <option value="Europe/Amsterdam">Amsterdam (CET/CEST)</option>
                                        <option value="Europe/Brussels">Brussels</option>
                                        <option value="Europe/London">London (GMT/BST)</option>
                                        <option value="Europe/Paris">Paris</option>
                                        <option value="Europe/Berlin">Berlin</option>
                                        <option value="Europe/Madrid">Madrid</option>
                                        <option value="America/New_York">New York (EST/EDT)</option>
                                        <option value="UTC">UTC</option>
                                    </select>
                                </div>

                                {/* Week Start Day */}
                                <div className="p-4 flex items-center justify-between border-t border-border-color">
                                    <div className="flex items-center gap-3">
                                        <Icon name="calendar_today" className="text-text-main/80" />
                                        <span className="font-medium text-text-main">{t('settings.week_start')}</span>
                                    </div>
                                    <div className="flex bg-bg-page rounded-lg p-1">
                                        {(['monday', 'sunday', 'saturday'] as const).map(day => (
                                            <button
                                                key={day}
                                                onClick={() => updateSetting('weekStartDay', day)}
                                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                                    (settings.weekStartDay || 'monday') === day
                                                    ? 'bg-bg-card text-text-main shadow-sm'
                                                    : 'text-text-muted hover:text-text-main'
                                                }`}
                                            >
                                                {t(`settings.${day}`)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                             </div>
                        </section>

                        {/* Units Section */}
                        <section>
                            <h2 className="text-text-muted text-xs font-bold uppercase tracking-wider mb-3">{t('settings.units')}</h2>
                            <div className="bg-bg-card border border-border-color rounded-2xl overflow-hidden shadow-sm transition-colors">
                                
                                {/* Temp */}
                                <div className="p-4 border-b border-border-color flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Icon name="thermostat" className="text-text-muted" />
                                        <span className="font-medium text-text-main">{t('temp')}</span>
                                    </div>
                                    <div className="flex bg-bg-page rounded-lg p-1">
                                        {Object.values(TempUnit).map(u => (
                                            <button
                                                key={u}
                                                onClick={() => updateSetting('tempUnit', u)}
                                                className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.tempUnit === u ? 'bg-accent-primary text-text-inverse shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                            >
                                                °{u}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Wind */}
                                <div className="p-4 border-b border-border-color flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Icon name="air" className="text-text-muted" />
                                        <span className="font-medium text-text-main">{t('wind')}</span>
                                    </div>
                                    <select 
                                        value={settings.windUnit} 
                                        onChange={(e) => updateSetting('windUnit', e.target.value)}
                                        className="bg-bg-page text-text-main text-sm rounded-lg px-3 py-1.5 border-none focus:ring-1 focus:ring-accent-primary outline-none cursor-pointer"
                                    >
                                        {Object.values(WindUnit).map(u => (
                                            <option key={u} value={u} className="bg-bg-card text-text-main">{u}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Precip */}
                                <div className="p-4 border-b border-border-color flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Icon name="water_drop" className="text-text-muted" />
                                        <span className="font-medium text-text-main">{t('precip')}</span>
                                    </div>
                                    <div className="flex bg-bg-page rounded-lg p-1">
                                        {Object.values(PrecipUnit).map(u => (
                                            <button
                                                key={u}
                                                onClick={() => updateSetting('precipUnit', u)}
                                                className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.precipUnit === u ? 'bg-accent-primary text-text-inverse shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                            >
                                                {u}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Pressure */}
                                <div className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Icon name="compress" className="text-text-muted" />
                                        <span className="font-medium text-text-main">{t('pressure')}</span>
                                    </div>
                                    <div className="flex bg-bg-page rounded-lg p-1">
                                        {Object.values(PressureUnit).map(u => (
                                            <button
                                                key={u}
                                                onClick={() => updateSetting('pressureUnit', u)}
                                                className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.pressureUnit === u ? 'bg-accent-primary text-text-inverse shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                            >
                                                {u}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {/* Records Tab */}
                {activeTab === 'records' && (
                    <>
                        {/* Record Thresholds Section */}
                        <section>
                            <h2 className="text-text-muted text-xs font-bold uppercase tracking-wider mb-3">
                                {t('settings.records_title')}
                            </h2>
                            <div className="bg-bg-card border border-border-color rounded-2xl overflow-hidden shadow-sm transition-colors">
                                {/* Summer Streak */}
                                <div className="p-4 border-b border-border-color flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm text-text-main">
                                            {t('settings.records.summer_streak')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={settings.tempUnit === TempUnit.FAHRENHEIT ? (15 * 9) / 5 + 32 : 15}
                                            max={settings.tempUnit === TempUnit.FAHRENHEIT ? (40 * 9) / 5 + 32 : 40}
                                            value={formatRecordTempValue(settings.recordThresholds?.summerStreakTemp ?? 25)}
                                            onChange={(e) => updateRecordThresholdTemp('summerStreakTemp', e.target.value, 15, 40)}
                                            className="w-20 bg-bg-page text-text-main text-right text-sm rounded-lg px-3 py-1.5 border border-border-color focus:outline-none focus:ring-1 focus:ring-accent-primary"
                                        />
                                        <span className="text-sm font-medium text-text-main">°{settings.tempUnit}</span>
                                    </div>
                                </div>

                                 {/* Nice Streak */}
                                 <div className="p-4 border-b border-border-color flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm text-text-main">
                                            {t('settings.records.nice_streak')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={settings.tempUnit === TempUnit.FAHRENHEIT ? (10 * 9) / 5 + 32 : 10}
                                            max={settings.tempUnit === TempUnit.FAHRENHEIT ? (35 * 9) / 5 + 32 : 35}
                                            value={formatRecordTempValue(settings.recordThresholds?.niceStreakTemp ?? 20)}
                                            onChange={(e) => updateRecordThresholdTemp('niceStreakTemp', e.target.value, 10, 35)}
                                            className="w-20 bg-bg-page text-text-main text-right text-sm rounded-lg px-3 py-1.5 border border-border-color focus:outline-none focus:ring-1 focus:ring-accent-primary"
                                        />
                                        <span className="text-sm font-medium text-text-main">°{settings.tempUnit}</span>
                                    </div>
                                </div>

                                {/* Cold Streak */}
                                <div className="p-4 border-b border-border-color flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm text-text-main">
                                            {t('settings.records.cold_streak')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={settings.tempUnit === TempUnit.FAHRENHEIT ? (-30 * 9) / 5 + 32 : -30}
                                            max={settings.tempUnit === TempUnit.FAHRENHEIT ? (15 * 9) / 5 + 32 : 15}
                                            value={formatRecordTempValue(settings.recordThresholds?.coldStreakTemp ?? 5)}
                                            onChange={(e) => updateRecordThresholdTemp('coldStreakTemp', e.target.value, -30, 15)}
                                            className="w-20 bg-bg-page text-text-main text-right text-sm rounded-lg px-3 py-1.5 border border-border-color focus:outline-none focus:ring-1 focus:ring-accent-primary"
                                        />
                                        <span className="text-sm font-medium text-text-main">°{settings.tempUnit}</span>
                                    </div>
                                </div>

                                 {/* Ice Streak */}
                                 <div className="p-4 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm text-text-main">
                                            {t('settings.records.ice_streak')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={settings.tempUnit === TempUnit.FAHRENHEIT ? (-40 * 9) / 5 + 32 : -40}
                                            max={settings.tempUnit === TempUnit.FAHRENHEIT ? (10 * 9) / 5 + 32 : 10}
                                            value={formatRecordTempValue(settings.recordThresholds?.iceStreakTemp ?? 0)}
                                            onChange={(e) => updateRecordThresholdTemp('iceStreakTemp', e.target.value, -40, 10)}
                                            className="w-20 bg-bg-page text-text-main text-right text-sm rounded-lg px-3 py-1.5 border border-border-color focus:outline-none focus:ring-1 focus:ring-accent-primary"
                                        />
                                        <span className="text-sm font-medium text-text-main">°{settings.tempUnit}</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Heatwave Section */}
                        <section>
                            <h2 className="text-text-muted text-xs font-bold uppercase tracking-wider mb-3">
                                {t('settings.heatwave')}
                            </h2>
                            <div className="bg-bg-card border border-border-color rounded-2xl overflow-hidden shadow-sm transition-colors">
                                <div className="p-4 border-b border-border-color flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Icon name="local_fire_department" className="text-text-muted" />
                                        <span className="font-medium text-text-main">{t('settings.heatwave')}</span>
                                    </div>
                                </div>
                                
                                {/* Grid Layout for alignment */}
                                <div className="divide-y divide-border-color">
                                    <div className="p-4 flex items-center justify-between gap-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm text-text-main">
                                                {t('settings.heatwave.length')}
                                            </span>
                                            <span className="text-xs text-text-muted">
                                                {t('settings.heatwave.length_desc')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={1}
                                                max={60}
                                                value={settings.heatwave.minLength}
                                                onChange={(e) => updateHeatwaveLength(e.target.value)}
                                                className="w-16 bg-bg-page text-text-main text-right text-sm rounded-lg px-2 py-1.5 border border-border-color focus:outline-none focus:ring-1 focus:ring-accent-primary"
                                            />
                                            <span className="text-sm font-medium w-8 text-text-main">
                                                {t('days')}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-4 flex items-center justify-between gap-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm text-text-main">
                                                {t('settings.heatwave.lower')}
                                            </span>
                                            <span className="text-xs text-text-muted">
                                                {t('settings.heatwave.lower_desc')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={-50}
                                                max={60}
                                                value={formatHeatwaveTempValue(settings.heatwave.lowerThreshold)}
                                                onChange={(e) => updateHeatwaveThreshold('lowerThreshold', e.target.value)}
                                                className="w-16 bg-bg-page text-text-main text-right text-sm rounded-lg px-2 py-1.5 border border-border-color focus:outline-none focus:ring-1 focus:ring-accent-primary"
                                            />
                                            <span className="text-sm font-medium w-8 text-text-main">
                                                °{settings.tempUnit}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-4 flex items-center justify-between gap-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm text-text-main">
                                                {t('settings.heatwave.heat')}
                                            </span>
                                            <span className="text-xs text-text-muted">
                                                {t('settings.heatwave.heat_desc')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={-50}
                                                max={60}
                                                value={formatHeatwaveTempValue(settings.heatwave.heatThreshold)}
                                                onChange={(e) => updateHeatwaveThreshold('heatThreshold', e.target.value)}
                                                className="w-16 bg-bg-page text-text-main text-right text-sm rounded-lg px-2 py-1.5 border border-border-color focus:outline-none focus:ring-1 focus:ring-accent-primary"
                                            />
                                            <span className="text-sm font-medium w-8 text-text-main">
                                                °{settings.tempUnit}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-4 flex items-center justify-between gap-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm text-text-main">
                                                {t('settings.heatwave.heat_days')}
                                            </span>
                                            <span className="text-xs text-text-muted">
                                                {t('settings.heatwave.heat_days_desc')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={1}
                                                max={60}
                                                value={settings.heatwave.minHeatDays ?? 3}
                                                onChange={(e) => updateHeatwaveMinHeatDays(e.target.value)}
                                                className="w-16 bg-bg-page text-text-main text-right text-sm rounded-lg px-2 py-1.5 border border-border-color focus:outline-none focus:ring-1 focus:ring-accent-primary"
                                            />
                                            <span className="text-sm font-medium w-8 text-text-main">
                                                {t('days')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </>
                )}


            </div>
        </div>
    );
};
