
import React, { useState } from 'react';
import { ViewState, AppSettings, TempUnit, WindUnit, PrecipUnit, PressureUnit, Location, AppTheme, AppLanguage, ActivityType } from '../types';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { getUsage, UsageStats, getLimit } from '../services/usageService';

interface Props {
    settings: AppSettings;
    onUpdateSettings: (newSettings: AppSettings) => void;
    onNavigate: (view: ViewState) => void;
}

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
    drone: 'flight'
};

export const SettingsView: React.FC<Props> = ({ settings, onUpdateSettings, onNavigate }) => {
    const [newCity, setNewCity] = useState('');
    const [loadingCity, setLoadingCity] = useState(false);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

    React.useEffect(() => {
        setUsageStats(getUsage());
    }, []);

    const t = (key: string) => getTranslation(key, settings.language);

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
        setDraggedItemIndex(null);
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-background-dark pb-24 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 text-slate-800 dark:text-white transition-colors duration-300">
            {/* Header */}
            <div className="flex items-center p-4 pt-8 sticky top-0 bg-white/95 dark:bg-[#101d22]/95 backdrop-blur z-20 border-b border-slate-200 dark:border-white/5 transition-colors">
                <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 mr-2">
                    <Icon name="arrow_back_ios_new" />
                </button>
                <h1 className="text-lg font-bold">{t('nav.settings')}</h1>
            </div>

            <div className="p-4 space-y-8 max-w-lg mx-auto w-full">
                
                {/* Appearance Section */}
                <section>
                     <h2 className="text-slate-600 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">{t('settings.theme')} & {t('settings.language')}</h2>
                     <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm transition-colors">
                        
                        {/* Theme Toggle */}
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="contrast" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">{t('settings.theme')}</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-black/40 rounded-lg p-1">
                                <button onClick={() => updateSetting('theme', 'light')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.theme === 'light' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 dark:text-white/40'}`}>
                                    <Icon name="light_mode" className="text-sm mr-1 inline" /> {t('theme.light')}
                                </button>
                                <button onClick={() => updateSetting('theme', 'dark')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.theme === 'dark' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-600 dark:text-white/40'}`}>
                                    <Icon name="dark_mode" className="text-sm mr-1 inline" /> {t('theme.dark')}
                                </button>
                            </div>
                        </div>

                        {/* Language Toggle */}
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="language" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">{t('settings.language')}</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-black/40 rounded-lg p-1">
                                <button onClick={() => updateSetting('language', 'en')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.language === 'en' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-white/40'}`}>
                                    EN
                                </button>
                                <button onClick={() => updateSetting('language', 'nl')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.language === 'nl' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-white/40'}`}>
                                    NL
                                </button>
                            </div>
                        </div>

                        {/* Time Format Toggle */}
                        <div className="p-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <Icon name="schedule" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">{t('settings.time_format')}</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-black/40 rounded-lg p-1">
                                <button onClick={() => updateSetting('timeFormat', '24h')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.timeFormat === '24h' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-white/40'}`}>
                                    24h
                                </button>
                                <button onClick={() => updateSetting('timeFormat', '12h')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.timeFormat === '12h' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-white/40'}`}>
                                    12h
                                </button>
                            </div>
                        </div>

                     </div>
                </section>

                {/* Units Section */}
                <section>
                    <h2 className="text-slate-600 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">{t('settings.units')}</h2>
                    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm transition-colors">
                        
                        {/* Temp */}
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="thermostat" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">{t('temp')}</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-black/40 rounded-lg p-1">
                                {Object.values(TempUnit).map(u => (
                                    <button
                                        key={u}
                                        onClick={() => updateSetting('tempUnit', u)}
                                        className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.tempUnit === u ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-white/40'}`}
                                    >
                                        °{u}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Wind */}
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="air" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">{t('wind')}</span>
                            </div>
                            <select 
                                value={settings.windUnit} 
                                onChange={(e) => updateSetting('windUnit', e.target.value)}
                                className="bg-slate-100 dark:bg-black/40 text-slate-800 dark:text-white text-sm rounded-lg px-3 py-1.5 border-none focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                            >
                                {Object.values(WindUnit).map(u => (
                                    <option key={u} value={u}>{u}</option>
                                ))}
                            </select>
                        </div>

                        {/* Precip */}
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="water_drop" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">{t('precip')}</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-black/40 rounded-lg p-1">
                                {Object.values(PrecipUnit).map(u => (
                                    <button
                                        key={u}
                                        onClick={() => updateSetting('precipUnit', u)}
                                        className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.precipUnit === u ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600 dark:text-white/40'}`}
                                    >
                                        {u}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Pressure */}
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="compress" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">Druk</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-black/40 rounded-lg p-1">
                                {Object.values(PressureUnit).map(u => (
                                    <button
                                        key={u}
                                        onClick={() => updateSetting('pressureUnit', u)}
                                        className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.pressureUnit === u ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600 dark:text-white/40'}`}
                                    >
                                        {u}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Activities Section */}
                <section>
                    <h2 className="text-slate-600 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">{t('settings.activities_title')}</h2>
                    <p className="text-xs text-slate-500 dark:text-white/40 mb-3">{t('settings.activities_desc')}</p>
                    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm transition-colors">
                        {settings.enabledActivities && Object.entries(settings.enabledActivities).map(([key, enabled], index) => {
                             const activityKey = key as ActivityType;
                             const isLocked = activityKey === 'cycling' || activityKey === 'walking';
                             return (
                                 <div key={key} className={`p-4 flex items-center justify-between ${index !== 0 ? 'border-t border-slate-100 dark:border-white/5' : ''}`}>
                                     <div className="flex items-center gap-3">
                                         <Icon name={activityIcons[activityKey] || 'sports_score'} className="text-slate-600 dark:text-white/60" />
                                         <span className="font-medium">{t(`activity.${activityKey}`)}</span>
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
                                             className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-primary' : 'bg-slate-300 dark:bg-white/10'} ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                         >
                                             <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${enabled ? 'translate-x-6' : ''}`} />
                                         </button>
                                     </div>
                                 </div>
                             );
                        })}
                    </div>
                </section>

                {/* Favorites Section */}
                <section>
                    <h2 className="text-slate-600 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">{t('settings.favorites')}</h2>
                    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden p-4 shadow-sm transition-colors">
                        
                        <div className="relative mb-4">
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={newCity}
                                    onChange={(e) => {
                                        setNewCity(e.target.value);
                                        searchCities();
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && addFavorite()}
                                    placeholder={t('settings.add_city')}
                                    className="flex-1 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-slate-800 dark:text-white placeholder-slate-600 dark:placeholder-white/30 focus:outline-none focus:border-primary transition-colors"
                                />
                                <button 
                                    onClick={addFavorite}
                                    disabled={loadingCity || !newCity.trim()}
                                    className="bg-slate-200 dark:bg-white/10 hover:bg-primary hover:text-white text-slate-600 dark:text-white/70 rounded-xl px-4 flex items-center justify-center transition-colors disabled:opacity-50"
                                >
                                    {loadingCity ? <span className="animate-spin size-4 border-2 border-slate-600 dark:border-white border-t-transparent rounded-full"></span> : <Icon name="add" />}
                                </button>
                            </div>
                            
                            {/* Search Results Dropdown */}
                            {showDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
                                    {searchResults.map((city, index) => (
                                        <button
                                            key={`${city.name}-${city.lat}-${city.lon}`}
                                            onClick={() => handleSelectCity(city)}
                                            className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/10 text-left transition-colors"
                                        >
                                            <span className="text-slate-800 dark:text-white">{city.name}</span>
                                            <span className="text-xs text-slate-500 dark:text-white/60">{city.country}</span>
                                        </button>
                                    ))}
                                    {searchResults.length === 0 && (
                                        <div className="px-4 py-2 text-slate-500 dark:text-white/60 text-sm">
                                            {t('no_data_available')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            {settings.favorites.map((fav, i) => (
                                <div 
                                    key={`${fav.name}-${i}`} 
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, i)}
                                    onDragOver={(e) => handleDragOver(e, i)}
                                    onDragEnd={handleDragEnd}
                                    className={`flex items-center justify-between bg-slate-50 dark:bg-white/10 rounded-xl p-3 group border border-slate-100 dark:border-transparent cursor-grab active:cursor-grabbing transition-all ${draggedItemIndex === i ? 'opacity-40 scale-95' : 'opacity-100'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="text-slate-600 dark:text-white/30 cursor-grab">
                                            <Icon name="drag_indicator" className="text-lg" />
                                        </div>
                                        <div className="size-8 rounded-full bg-white dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-white/50 border border-slate-100 dark:border-transparent">
                                            <Icon name="location_on" className="text-sm" />
                                        </div>
                                        <div>
                                            <p className="text-slate-800 dark:text-white font-medium text-sm">{fav.name}</p>
                                            <p className="text-slate-600 dark:text-white/40 text-xs">{fav.country}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => removeFavorite(i)}
                                        className="size-8 flex items-center justify-center text-slate-600 dark:text-white/20 hover:text-red-400 transition-colors"
                                    >
                                        <Icon name="delete" />
                                    </button>
                                </div>
                            ))}
                            {settings.favorites.length === 0 && (
                                <p className="text-center text-slate-600 dark:text-white/30 text-sm py-2">{t('settings.no_favs')}</p>
                            )}
                        </div>

                    </div>
                </section>

                {/* Usage Section */}
                <section>
                    <h2 className="text-slate-600 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">{t('settings.usage')}</h2>
                    <p className="text-xs text-slate-500 dark:text-white/40 mb-3">{t('usage.desc')}</p>
                    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm transition-colors">
                        {usageStats && (
                            <>
                                <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Icon name="analytics" className="text-slate-600 dark:text-white/60" />
                                        <span className="font-medium">{t('usage.total')}</span>
                                    </div>
                                    <div className="font-bold text-slate-800 dark:text-white">
                                        {usageStats.totalCalls}
                                    </div>
                                </div>
                                <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Icon name="today" className="text-slate-600 dark:text-white/60" />
                                        <span className="font-medium">{t('usage.today')}</span>
                                    </div>
                                    <div className="font-bold text-slate-800 dark:text-white">
                                        {usageStats.dayCount} / {getLimit()}
                                    </div>
                                </div>
                                <div className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Icon name="verified_user" className="text-slate-600 dark:text-white/60" />
                                        <span className="font-medium">{t('usage.status')}</span>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                                        usageStats.dayCount >= getLimit() 
                                            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' 
                                            : usageStats.dayCount >= getLimit() * 0.8
                                            ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                                            : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                    }`}>
                                        {usageStats.dayCount >= getLimit() 
                                            ? t('usage.limit_reached')
                                            : usageStats.dayCount >= getLimit() * 0.8
                                            ? t('usage.warning')
                                            : t('usage.ok')
                                        }
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </section>

                <div className="text-center text-xs text-slate-400 dark:text-white/20 pb-4">
                    v0.9251212.1
                </div>

            </div>
        </div>
    );
};
