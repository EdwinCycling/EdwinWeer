
import React, { useState, useEffect } from 'react';
import { CurrentWeatherView } from './views/CurrentWeatherView';
import { HistoricalWeatherView } from './views/HistoricalWeatherView';
import { StravaWeatherView } from './views/StravaWeatherView';
import { HourlyDetailView } from './views/HourlyDetailView';
import { MapView } from './views/MapView';
import { SettingsView } from './views/SettingsView';
import { Footer } from './components/Footer';
import { ViewState, AppSettings } from './types';
import { loadSettings, saveSettings } from './services/storageService';
import { getTranslation } from './services/translations';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.CURRENT);
  const [settings, setSettings] = useState<AppSettings>(loadSettings());

  useEffect(() => {
      saveSettings(settings);
      
      // Apply Theme
      const html = document.documentElement;
      if (settings.theme === 'dark') {
          html.classList.add('dark');
      } else {
          html.classList.remove('dark');
      }
  }, [settings]);

  // Helper for translations in this component
  const t = (key: string) => getTranslation(key, settings.language);

  // Dynamic Title Update
  useEffect(() => {
      const viewKey = currentView === ViewState.HOURLY_DETAIL ? 'nav.current' : `nav.${currentView.toLowerCase()}`;
      const viewName = t(viewKey);
      document.title = `Weer & Rit - ${viewName}`;
  }, [currentView, settings.language]);

  const renderView = () => {
    switch (currentView) {
      case ViewState.CURRENT:
        return <CurrentWeatherView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.MAP:
        return <MapView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.HOURLY_DETAIL:
        return <HourlyDetailView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.HISTORICAL:
        return <HistoricalWeatherView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.STRAVA:
        return <StravaWeatherView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.SETTINGS:
        return <SettingsView settings={settings} onUpdateSettings={setSettings} onNavigate={setCurrentView} />;
      default:
        return <CurrentWeatherView onNavigate={setCurrentView} settings={settings} />;
    }
  };

  return (
    <div className="min-h-screen w-full bg-background-dark text-slate-800 dark:text-white relative flex flex-col transition-colors duration-300">
        <div className="flex-grow pb-4">
            {renderView()}
        </div>

        {/* Global Footer (Disclaimer/Cookies) - Hide on Map and Settings */}
        {currentView !== ViewState.SETTINGS && currentView !== ViewState.MAP && <Footer settings={settings} />}

        {/* Bottom Navigation */}
        {
            <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#101d22]/90 backdrop-blur-xl border-t border-slate-200 dark:border-white/10 p-2 flex justify-around z-50 shadow-2xl pb-4 transition-colors duration-300">
                <button 
                    onClick={() => setCurrentView(ViewState.CURRENT)}
                    className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.CURRENT || currentView === ViewState.HOURLY_DETAIL ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                >
                    <span className="material-symbols-outlined">sunny</span>
                    <span className="text-[10px] font-medium uppercase mt-1">{t('nav.current')}</span>
                </button>
                <button 
                    onClick={() => setCurrentView(ViewState.MAP)}
                    className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.MAP ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                >
                    <span className="material-symbols-outlined">map</span>
                    <span className="text-[10px] font-medium uppercase mt-1">{t('nav.map')}</span>
                </button>
                <button 
                    onClick={() => setCurrentView(ViewState.HISTORICAL)}
                    className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.HISTORICAL ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                >
                    <span className="material-symbols-outlined">calendar_month</span>
                    <span className="text-[10px] font-medium uppercase mt-1">{t('nav.historical')}</span>
                </button>
                <button 
                    onClick={() => setCurrentView(ViewState.STRAVA)}
                    className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.STRAVA ? 'text-strava scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                >
                    <span className="material-symbols-outlined">directions_bike</span>
                    <span className="text-[10px] font-medium uppercase mt-1">{t('nav.strava')}</span>
                </button>
                <button 
                    onClick={() => setCurrentView(ViewState.SETTINGS)}
                    className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.SETTINGS ? 'text-slate-800 dark:text-white scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                >
                    <span className="material-symbols-outlined">settings</span>
                    <span className="text-[10px] font-medium uppercase mt-1">{t('nav.settings')}</span>
                </button>
            </div>
        }
    </div>
  );
};

export default App;
