
import React, { useState } from 'react';
import { ViewState, AppSettings, TempUnit, WindUnit, PrecipUnit, Location, AppTheme, AppLanguage } from '../types';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';

interface Props {
    settings: AppSettings;
    onUpdateSettings: (newSettings: AppSettings) => void;
    onNavigate: (view: ViewState) => void;
}

export const SettingsView: React.FC<Props> = ({ settings, onUpdateSettings, onNavigate }) => {
    const [newCity, setNewCity] = useState('');
    const [loadingCity, setLoadingCity] = useState(false);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

    const t = (key: string) => getTranslation(key, settings.language);

    const updateSetting = (key: keyof AppSettings, value: any) => {
        onUpdateSettings({ ...settings, [key]: value });
    };

    const removeFavorite = (index: number) => {
        const newFavs = [...settings.favorites];
        newFavs.splice(index, 1);
        updateSetting('favorites', newFavs);
    };

    const addFavorite = async () => {
        if (!newCity.trim()) return;
        setLoadingCity(true);
        try {
            const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(newCity)}&count=1&language=${settings.language}&format=json`);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                const loc: Location = {
                    name: result.name,
                    country: result.country_code?.toUpperCase() || '',
                    lat: result.latitude,
                    lon: result.longitude
                };
                updateSetting('favorites', [...settings.favorites, loc]);
                setNewCity('');
            } else {
                alert(t('city_not_found'));
            }
        } catch (e) {
            console.error(e);
            alert(t('error'));
        } finally {
            setLoadingCity(false);
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
        <div className="flex flex-col min-h-screen bg-background-dark pb-24 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 text-slate-800 dark:text-white transition-colors duration-300">
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
                     <h2 className="text-slate-500 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">{t('settings.theme')} & {t('settings.language')}</h2>
                     <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm transition-colors">
                        
                        {/* Theme Toggle */}
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="contrast" className="text-slate-400 dark:text-white/60" />
                                <span className="font-medium">{t('settings.theme')}</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-black/40 rounded-lg p-1">
                                <button onClick={() => updateSetting('theme', 'light')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.theme === 'light' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 dark:text-white/40'}`}>
                                    <Icon name="light_mode" className="text-sm mr-1 inline" /> {t('theme.light')}
                                </button>
                                <button onClick={() => updateSetting('theme', 'dark')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.theme === 'dark' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 dark:text-white/40'}`}>
                                    <Icon name="dark_mode" className="text-sm mr-1 inline" /> {t('theme.dark')}
                                </button>
                            </div>
                        </div>

                         {/* Language Toggle */}
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="language" className="text-slate-400 dark:text-white/60" />
                                <span className="font-medium">{t('settings.language')}</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-black/40 rounded-lg p-1">
                                <button onClick={() => updateSetting('language', 'en')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.language === 'en' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 dark:text-white/40'}`}>
                                    EN
                                </button>
                                <button onClick={() => updateSetting('language', 'nl')} className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.language === 'nl' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 dark:text-white/40'}`}>
                                    NL
                                </button>
                            </div>
                        </div>

                     </div>
                </section>

                {/* Units Section */}
                <section>
                    <h2 className="text-slate-500 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">{t('settings.units')}</h2>
                    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm transition-colors">
                        
                        {/* Temp */}
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="thermostat" className="text-slate-400 dark:text-white/60" />
                                <span className="font-medium">{t('temp')}</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-black/40 rounded-lg p-1">
                                {Object.values(TempUnit).map(u => (
                                    <button
                                        key={u}
                                        onClick={() => updateSetting('tempUnit', u)}
                                        className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.tempUnit === u ? 'bg-primary text-white shadow-sm' : 'text-slate-400 dark:text-white/40'}`}
                                    >
                                        °{u}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Wind */}
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="air" className="text-slate-400 dark:text-white/60" />
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
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="water_drop" className="text-slate-400 dark:text-white/60" />
                                <span className="font-medium">{t('precip')}</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-black/40 rounded-lg p-1">
                                {Object.values(PrecipUnit).map(u => (
                                    <button
                                        key={u}
                                        onClick={() => updateSetting('precipUnit', u)}
                                        className={`px-3 py-1 rounded-md text-sm font-bold transition-colors ${settings.precipUnit === u ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-400 dark:text-white/40'}`}
                                    >
                                        {u}
                                    </button>
                                ))}
                            </div>
                        </div>

                    </div>
                </section>

                {/* Favorites Section */}
                <section>
                    <h2 className="text-slate-500 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">{t('settings.favorites')}</h2>
                    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden p-4 shadow-sm transition-colors">
                        
                        <div className="flex gap-2 mb-4">
                            <input 
                                type="text" 
                                value={newCity}
                                onChange={(e) => setNewCity(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addFavorite()}
                                placeholder={t('settings.add_city')}
                                className="flex-1 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:outline-none focus:border-primary transition-colors"
                            />
                            <button 
                                onClick={addFavorite}
                                disabled={loadingCity || !newCity.trim()}
                                className="bg-slate-200 dark:bg-white/10 hover:bg-primary hover:text-white text-slate-500 dark:text-white/70 rounded-xl px-4 flex items-center justify-center transition-colors disabled:opacity-50"
                            >
                                {loadingCity ? <span className="animate-spin size-4 border-2 border-slate-500 dark:border-white border-t-transparent rounded-full"></span> : <Icon name="add" />}
                            </button>
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
                                        <div className="text-slate-300 dark:text-white/30 cursor-grab">
                                            <Icon name="drag_indicator" className="text-lg" />
                                        </div>
                                        <div className="size-8 rounded-full bg-white dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-white/50 border border-slate-100 dark:border-transparent">
                                            <Icon name="location_on" className="text-sm" />
                                        </div>
                                        <div>
                                            <p className="text-slate-800 dark:text-white font-medium text-sm">{fav.name}</p>
                                            <p className="text-slate-400 dark:text-white/40 text-xs">{fav.country}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => removeFavorite(i)}
                                        className="size-8 flex items-center justify-center text-slate-300 dark:text-white/20 hover:text-red-400 transition-colors"
                                    >
                                        <Icon name="delete" />
                                    </button>
                                </div>
                            ))}
                            {settings.favorites.length === 0 && (
                                <p className="text-center text-slate-400 dark:text-white/30 text-sm py-2">{t('settings.no_favs')}</p>
                            )}
                        </div>

                    </div>
                </section>

            </div>
        </div>
    );
};
