
import React, { useState, useEffect } from 'react';
import { CurrentWeatherView } from './views/CurrentWeatherView';
import { ForecastWeatherView } from './views/ForecastWeatherView';
import { HistoricalWeatherView } from './views/HistoricalWeatherView';
import { StravaWeatherView } from './views/StravaWeatherView';
import { HourlyDetailView } from './views/HourlyDetailView';
import { MapView } from './views/MapView';
import { SettingsView } from './views/SettingsView';
import { EnsembleWeatherView } from './views/EnsembleWeatherView';
import { HolidayWeatherView } from './views/HolidayWeatherView';
import { TeamView } from './views/TeamView';
import { PricingView } from './views/PricingView';
import { InfoView } from './views/InfoView';
import { ModelInfoView } from './views/ModelInfoView';
import { CountryMapView } from './views/CountryMapView';
import { ViewState, AppSettings } from './types';
import { loadSettings, saveSettings } from './services/storageService';
import { getTranslation } from './services/translations';
import { Icon } from './components/Icon';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.CURRENT);
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<'disclaimer' | 'cookies' | null>(null);

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
      let viewKey = `nav.${currentView.toLowerCase()}`;
      if (currentView === ViewState.HOURLY_DETAIL) viewKey = 'nav.current';
      
      const viewName = t(viewKey) || currentView; // Fallback if translation missing
      document.title = `${t('app.title_prefix')} - ${viewName}`;
  }, [currentView, settings.language]);

  const renderView = () => {
    switch (currentView) {
      case ViewState.CURRENT:
        return <CurrentWeatherView onNavigate={setCurrentView} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.FORECAST:
        return <ForecastWeatherView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.MAP:
        return <MapView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.HOURLY_DETAIL:
        return <HourlyDetailView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.ENSEMBLE:
        return <EnsembleWeatherView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.HOLIDAY:
        return <HolidayWeatherView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.HISTORICAL:
        return <HistoricalWeatherView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.STRAVA:
        return <StravaWeatherView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.SETTINGS:
        return <SettingsView settings={settings} onUpdateSettings={setSettings} onNavigate={setCurrentView} />;
      case ViewState.TEAM:
        return <TeamView onNavigate={setCurrentView} />;
      case ViewState.PRICING:
        return <PricingView onNavigate={setCurrentView} />;
      case ViewState.MODEL_INFO:
        return <ModelInfoView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.COUNTRY_MAP:
        return <CountryMapView onNavigate={setCurrentView} settings={settings} />;
      case ViewState.INFO:
        return <InfoView onNavigate={setCurrentView} />;
      default:
        return <CurrentWeatherView onNavigate={setCurrentView} settings={settings} onUpdateSettings={setSettings} />;
    }
  };

  const closeModal = () => setModal(null);

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-background-dark text-slate-800 dark:text-white relative flex flex-col transition-colors duration-300">
        <div className="flex-grow pb-4">
            {renderView()}
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#101d22]/90 backdrop-blur-xl border-t border-slate-200 dark:border-white/10 p-2 flex justify-around z-50 shadow-2xl pb-4 transition-colors duration-300">
            <button 
                onClick={() => setCurrentView(ViewState.CURRENT)}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.CURRENT || currentView === ViewState.HOURLY_DETAIL ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="sunny" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.current')}</span>
            </button>
            <button 
                onClick={() => setCurrentView(ViewState.FORECAST)}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.FORECAST ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="date_range" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">Vooruitzicht</span>
            </button>
            <button 
                onClick={() => setCurrentView(ViewState.ENSEMBLE)}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.ENSEMBLE ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="ssid_chart" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.ensemble')}</span>
            </button>
            <button 
                onClick={() => setCurrentView(ViewState.MAP)}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.MAP ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="map" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.map')}</span>
            </button>
            <button 
                onClick={() => setCurrentView(ViewState.HISTORICAL)}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.HISTORICAL ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="calendar_month" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.historical')}</span>
            </button>
            <button 
                onClick={() => setCurrentView(ViewState.HOLIDAY)}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.HOLIDAY ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="flight" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.holiday')}</span>
            </button>
            <button 
                onClick={() => setCurrentView(ViewState.STRAVA)}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.STRAVA ? 'text-strava scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="directions_bike" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.strava')}</span>
            </button>
            
            {/* Hamburger Menu Button */}
            <button 
                onClick={() => setMenuOpen(true)}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${menuOpen ? 'text-slate-800 dark:text-white scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="menu" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('menu')}</span>
            </button>
        </div>

        {/* Hamburger Menu Overlay */}
        {menuOpen && (
            <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setMenuOpen(false)}>
                <div 
                    className="absolute bottom-0 left-0 right-0 bg-white dark:bg-card-dark rounded-t-[32px] p-6 pb-28 animate-in slide-in-from-bottom duration-300 border-t border-slate-200 dark:border-white/10 shadow-2xl" 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="w-12 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full mx-auto mb-8" />
                    
                    <div className="grid grid-cols-2 gap-4 mb-8">
                         <button onClick={() => { setCurrentView(ViewState.SETTINGS); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-white">
                                <Icon name="settings" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">{t('nav.settings')}</span>
                         </button>
                         <button onClick={() => { setCurrentView(ViewState.TEAM); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <Icon name="groups" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">Het Team</span>
                         </button>
                         <button onClick={() => { setCurrentView(ViewState.PRICING); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400">
                                <Icon name="payments" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">Pricing</span>
                         </button>
                         <button onClick={() => { setCurrentView(ViewState.MODEL_INFO); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-cyan-100 dark:bg-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                                <Icon name="model_training" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">Weermodellen</span>
                         </button>
                         <button onClick={() => { setCurrentView(ViewState.INFO); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                <Icon name="info" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">Info</span>
                         </button>
                    </div>
                    
                    <div className="flex justify-center gap-8 text-xs font-medium text-slate-500 dark:text-white/40">
                         <button onClick={() => setModal('disclaimer')} className="hover:text-primary transition-colors hover:underline">Disclaimer</button>
                         <button onClick={() => setModal('cookies')} className="hover:text-primary transition-colors hover:underline">Cookies</button>
                    </div>
                </div>
            </div>
        )}

        {/* Modals */}
        {modal && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={closeModal}>
                <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative text-slate-800 dark:text-white" onClick={e => e.stopPropagation()}>
                    <button onClick={closeModal} className="absolute top-4 right-4 text-slate-400 dark:text-white/50 hover:text-primary dark:hover:text-white">
                        <Icon name="close" />
                    </button>
                    
                    {modal === 'disclaimer' && (
                        <>
                            <h3 className="text-xl font-bold mb-4">{t('footer.disclaimer_title')}</h3>
                            <div className="space-y-4 text-sm text-slate-600 dark:text-white/70">
                                <p>{t('footer.text_weather')}</p>
                                <p>{t('footer.text_strava')}</p>
                                <p>{t('footer.text_liability')}</p>
                            </div>
                        </>
                    )}

                    {modal === 'cookies' && (
                        <>
                            <h3 className="text-xl font-bold mb-4">{t('footer.cookies_title')}</h3>
                            <div className="space-y-4 text-sm text-slate-600 dark:text-white/70">
                                <p>{t('footer.text_privacy')}</p>
                                <p>{t('footer.text_storage')}</p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}

    </div>
  );
};

export default App;
