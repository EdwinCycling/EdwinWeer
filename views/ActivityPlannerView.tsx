import React, { useState, useEffect, useRef } from 'react';
import { ViewState, AppSettings, ActivityType, ActivityPlannerSettings, Location, BaroProfile } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { loadCurrentLocation, saveCurrentLocation } from '../services/storageService';
import { fetchForecast } from '../services/weatherService';
import { generateBaroWeatherReport } from '../services/geminiService';
import { getUsage } from '../services/usageService';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
}

const ACTIVITIES: ActivityType[] = [
  'bbq', 'cycling', 'walking', 'sailing', 'running', 
  'beach', 'gardening', 'stargazing', 'golf', 'padel', 'field_sports', 'tennis'
];

const getActivityIcon = (type: ActivityType) => {
    switch (type) {
        case 'bbq': return 'outdoor_grill';
        case 'cycling': return 'directions_bike';
        case 'walking': return 'hiking';
        case 'sailing': return 'sailing';
        case 'running': return 'directions_run';
        case 'padel': return 'sports_tennis';
        case 'tennis': return 'sports_tennis';
        case 'field_sports': return 'sports_soccer';
        case 'golf': return 'sports_golf';
        case 'gardening': return 'yard';
        case 'beach': return 'beach_access';
        case 'stargazing': return 'nights_stay';
        default: return 'help';
    }
};

export const ActivityPlannerView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
  const { user } = useAuth();
  const t = (key: string) => getTranslation(key, settings.language);
  
  const daysList = [
      { val: 1, label: t('days.short.ma') },
      { val: 2, label: t('days.short.di') },
      { val: 3, label: t('days.short.wo') },
      { val: 4, label: t('days.short.do') },
      { val: 5, label: t('days.short.vr') },
      { val: 6, label: t('days.short.za') },
      { val: 0, label: t('days.short.zo') },
  ];

  const [telegramConnected, setTelegramConnected] = useState(false);
  const [plannerSettings, setPlannerSettings] = useState<ActivityPlannerSettings>({});
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baroCredits, setBaroCredits] = useState(getUsage().baroCredits);

  useEffect(() => {
    const interval = setInterval(() => {
        setBaroCredits(getUsage().baroCredits);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          setTelegramConnected(!!data.telegramChatId);
          if (data.activity_settings) {
            setPlannerSettings(data.activity_settings);
          }
          if (data.activity_location) {
              setLocation(data.activity_location);
          }
        }
      } catch (e) {
        console.error("Error loading user data", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  const handleToggle = (activity: ActivityType) => {
    setPlannerSettings(prev => {
      const isEnabled = prev[activity]?.enabled;
      
      // If turning on, disable all others (only 1 allowed)
      if (!isEnabled) {
        const newSettings: ActivityPlannerSettings = {};
        // Keep existing settings but disable them
        Object.keys(prev).forEach(key => {
            if (prev[key]) {
                newSettings[key] = { ...prev[key], enabled: false };
            }
        });
        
        // Enable the selected one
        newSettings[activity] = {
            enabled: true,
            min_score: prev[activity]?.min_score || 7,
            days: prev[activity]?.days || [1, 6, 0],
            channels: { telegram: true, email: false }
        };
        return newSettings;
      } else {
        // Just disable this one
        return {
            ...prev,
            [activity]: { ...prev[activity], enabled: false }
        };
      }
    });
  };

  const handleUpdate = (activity: ActivityType, updates: Partial<ActivityPlannerSettings[string]>) => {
    setPlannerSettings(prev => ({
        ...prev,
        [activity]: {
            ...(prev[activity] || { 
                enabled: false, 
                min_score: 7, 
                days: [1, 6, 0], 
                channels: { telegram: true, email: false } 
            }),
            ...updates
        }
    }));
  };

  const toggleDay = (activity: ActivityType, day: number) => {
    const currentDays = plannerSettings[activity]?.days || [];
    const newDays = currentDays.includes(day)
        ? currentDays.filter(d => d !== day)
        : [...currentDays, day];
    handleUpdate(activity, { days: newDays });
  };

  useEffect(() => {
    const saveAuto = async () => {
      if (!user || !telegramConnected || loading || baroCredits <= 0) return;
      
      setSaving(true);
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, {
            activity_settings: plannerSettings,
            activity_location: location
        });
        if (onUpdateSettings) {
             onUpdateSettings({ ...settings, activity_settings: plannerSettings });
        }
      } catch (e) {
        console.error("Error saving", e);
      } finally {
        setSaving(false);
      }
    };

    const timeoutId = setTimeout(saveAuto, 1000);
    return () => clearTimeout(timeoutId);
  }, [plannerSettings, location, user, telegramConnected, loading]);

  // Count enabled activities
  const enabledCount = Object.values(plannerSettings).filter((s: any) => s.enabled).length;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-background-dark pb-24 text-slate-800 dark:text-white transition-colors duration-300">
      {/* Header */}
      <div className="flex flex-col sticky top-0 bg-white/95 dark:bg-[#101d22]/95 backdrop-blur z-20 border-b border-slate-200 dark:border-white/5 transition-colors">
        <div className="flex items-center p-4">
          <button 
            onClick={() => onNavigate(ViewState.CURRENT)} 
            className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 mr-2"
          >
            <Icon name="arrow_back_ios_new" />
          </button>
          <h1 className="text-lg font-bold">{t('planner.title')}</h1>
        </div>
      </div>

      <div className="p-4 flex-grow flex flex-col items-center max-w-lg mx-auto w-full space-y-6">
        
        {/* Intro Box */}
        <div className="bg-white dark:bg-card-dark w-full p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="size-12 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-500">
              <Icon name="event_available" className="text-2xl" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{t('planner.subtitle')}</h2>
              <p className="text-sm text-slate-500 dark:text-white/60">{t('planner.intro')}</p>
            </div>
          </div>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg font-medium">
             <Icon name="info" className="inline text-sm mr-1" />
             {t('planner.intro.note')}
          </p>
        </div>

        {baroCredits <= 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 w-full p-4 rounded-xl border border-red-100 dark:border-red-900/50 text-center">
                <p className="text-red-800 dark:text-red-200 font-bold mb-2">{t('planner.no_credits_title')}</p>
                <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                    {t('planner.no_credits_desc')}
                </p>
                <button
                    onClick={() => onNavigate(ViewState.PRICING)}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors"
                >
                    {t('planner.buy_credits')}
                </button>
            </div>
        )}

        {/* Location Selection */}
        <div className="w-full bg-white dark:bg-card-dark p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 relative z-30">
             <h3 className="font-bold mb-3 flex items-center gap-2">
                 <Icon name="location_on" className="text-indigo-500" />
                 {t('planner.location_label')} <span className="text-red-500">*</span>
             </h3>
             
             <div className="relative">
                 <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-xl px-3 border border-slate-200 dark:border-white/10 focus-within:border-indigo-500 transition-colors">
                     <Icon name="search" className="text-slate-400" />
                     <input 
                         ref={searchInputRef}
                         type="text" 
                         value={isSearchOpen ? searchQuery : location.name}
                         onChange={(e) => {
                             setSearchQuery(e.target.value);
                             setIsSearchOpen(true);
                             if (e.target.value.length > 2) {
                                 setLoadingSearch(true);
                                 // Debounce search
                                 const timer = setTimeout(async () => {
                                     try {
                                         const results = await searchCityByName(e.target.value);
                                         setSearchResults(results);
                                     } catch (err) {
                                         console.error(err);
                                     } finally {
                                         setLoadingSearch(false);
                                     }
                                 }, 500);
                                 return () => clearTimeout(timer);
                             } else {
                                 setSearchResults([]);
                             }
                         }}
                         onFocus={() => {
                             setIsSearchOpen(true);
                             setSearchQuery(location.name);
                             setSearchResults([]);
                         }}
                         placeholder={t('planner.search_placeholder')}
                         className="w-full bg-transparent border-none py-3 px-2 outline-none text-sm font-medium"
                     />
                     {loadingSearch && <Icon name="sync" className="animate-spin text-indigo-500" />}
                 </div>

                 {/* Search Results Dropdown */}
                 {isSearchOpen && searchResults.length > 0 && (
                     <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1e293b] rounded-xl shadow-xl border border-slate-200 dark:border-white/10 max-h-[200px] overflow-y-auto z-50">
                         {searchResults.map((res, i) => (
                             <button
                                 key={i}
                                 onClick={() => {
                                     setLocation(res);
                                     setIsSearchOpen(false);
                                     setSearchQuery('');
                                 }}
                                 className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 last:border-0 flex items-center gap-2"
                             >
                                 <Icon name="location_on" className="text-slate-400" />
                                 <div>
                                     <p className="font-bold text-sm">{res.name}</p>
                                     <p className="text-xs text-slate-500">{res.country} {res.admin1}</p>
                                 </div>
                             </button>
                         ))}
                     </div>
                 )}
                 {isSearchOpen && (
                     <div 
                         className="fixed inset-0 z-40" 
                         onClick={() => {
                             setIsSearchOpen(false);
                             setSearchQuery('');
                         }} 
                     />
                 )}
             </div>
        </div>

        {/* Telegram Warning */}
        {!telegramConnected && !loading && (
             <div className="bg-red-50 dark:bg-red-900/20 w-full p-4 rounded-xl border border-red-100 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm font-medium flex items-start gap-3">
                <Icon name="warning" className="text-xl mt-0.5" />
                <div>
                    {t('planner.warning.telegram')}
                    <button 
                        onClick={() => onNavigate(ViewState.MESSENGER)}
                        className="block mt-2 text-red-800 dark:text-red-200 underline"
                    >
                        {t('planner.goto_messenger')}
                    </button>
                </div>
             </div>
        )}

        {/* Limit Info */}
        <div className="flex justify-between w-full px-2 text-xs font-bold uppercase text-slate-400">
            <span>{t('settings.activities_title')}</span>
            <span className={enabledCount > 1 ? 'text-red-500' : 'text-green-500'}>
                {enabledCount}/1 Actief
            </span>
        </div>

        {/* Activity List */}
        <div className="w-full space-y-4">
            {ACTIVITIES.map(activity => {
                const config = plannerSettings[activity] || { enabled: false, min_score: 7, days: [1, 6, 0], channels: { telegram: true, email: false } };
                const isEnabled = config.enabled;

                return (
                    <div key={activity} className={`w-full bg-white dark:bg-card-dark rounded-xl border transition-all duration-300 overflow-hidden ${
                        isEnabled 
                            ? 'border-indigo-500 dark:border-indigo-500 shadow-md ring-1 ring-indigo-500/20' 
                            : 'border-slate-200 dark:border-white/5 opacity-80'
                    }`}>
                        {/* Header Row */}
                        <div className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-white/5">
                            <div className="flex items-center gap-3">
                                <div className={`size-10 rounded-full flex items-center justify-center transition-colors ${
                                    isEnabled ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-white/40'
                                }`}>
                                    <Icon name={getActivityIcon(activity)} />
                                </div>
                                <span className="font-bold capitalize">{t('activity.' + activity)}</span>
                            </div>
                            <button 
                                onClick={() => handleToggle(activity)}
                                className={`w-12 h-7 rounded-full transition-colors relative ${
                                    isEnabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-white/20'
                                }`}
                            >
                                <div className={`absolute top-1 size-5 bg-white rounded-full shadow transition-transform duration-200 ${
                                    isEnabled ? 'left-6' : 'left-1'
                                }`} />
                            </button>
                        </div>

                        {/* Settings (Expandable) */}
                        {isEnabled && (
                            <div className="p-4 space-y-6 animate-in slide-in-from-top-2">
                                
                                {/* Min Score */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-sm font-medium">{t('planner.min_score')}</label>
                                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{config.min_score}/10</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="10" 
                                        step="1"
                                        value={config.min_score}
                                        onChange={(e) => handleUpdate(activity, { min_score: parseInt(e.target.value) })}
                                        className="w-full accent-indigo-500 h-2 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                        <span>1 ({t('planner.score_bad')})</span>
                                        <span>10 ({t('planner.score_perfect')})</span>
                                    </div>
                                </div>

                                {/* Days */}
                                <div>
                                    <label className="block text-sm font-medium mb-2">{t('planner.days')}</label>
                                    <div className="flex justify-between gap-1">
                                        {daysList.map(day => {
                                            const active = config.days.includes(day.val);
                                            return (
                                                <button
                                                    key={day.val}
                                                    onClick={() => toggleDay(activity, day.val)}
                                                    className={`flex-1 h-10 rounded-lg text-xs font-bold transition-all ${
                                                        active 
                                                            ? 'bg-indigo-500 text-white shadow-md' 
                                                            : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/10'
                                                    }`}
                                                >
                                                    {day.label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Channels */}
                                <div>
                                    <label className="block text-sm font-medium mb-2">{t('planner.channels')}</label>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2 opacity-100">
                                            <div className="size-5 rounded bg-indigo-500 flex items-center justify-center text-white text-xs">
                                                <Icon name="check" />
                                            </div>
                                            <span className="text-sm font-medium">{t('planner.channel.telegram')}</span>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                                            <div className="size-5 rounded border border-slate-300 dark:border-white/20 flex items-center justify-center">
                                            </div>
                                            <span className="text-sm font-medium">{t('planner.channel.email')}</span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        {/* Save Button Removed - Auto Save Implemented */}
        <div className="sticky bottom-4 w-full pt-4 space-y-2 pointer-events-none">
             {/* Status Indicator for Saving */}
             <div className={`transition-all duration-300 flex justify-center ${saving ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                 <div className="bg-white/90 dark:bg-card-dark/90 backdrop-blur shadow-lg border border-indigo-100 dark:border-indigo-500/30 px-4 py-2 rounded-full flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                     <Icon name="sync" className="animate-spin text-sm" />
                     {t('planner.saving')}
                 </div>
             </div>
        </div>

      </div>
    </div>
  );
};
