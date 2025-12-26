
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
import { HolidayReportView } from './views/HolidayReportView';
import { TeamView } from './views/TeamView';
import { PricingView } from './views/PricingView';
import { InfoView } from './views/InfoView';
import { ModelInfoView } from './views/ModelInfoView';
import { CountryMapView } from './views/CountryMapView';
import { LoginView } from './views/LoginView';
import { UserAccountView } from './views/UserAccountView';
import { RecordsWeatherView } from './views/RecordsWeatherView';
import { ShareWeatherView } from './views/ShareWeatherView';
import { BarometerView } from './views/BarometerView';
import { ClimateChangeView } from './views/ClimateChangeView';
import { ThisDayView } from './views/ThisDayView';
import { ViewState, AppSettings } from './types';
import pkg from './package.json';
import { loadSettings, saveSettings } from './services/storageService';
import { getTranslation } from './services/translations';
import { Icon } from './components/Icon';
import { useAuth } from './contexts/AuthContext';
import { LimitReachedModal } from './components/LimitReachedModal';

const App: React.FC = () => {
  const { user, loading, logout, sessionExpiry } = useAuth();
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.CURRENT);
  const [previousView, setPreviousView] = useState<ViewState | null>(null);
  const [viewParams, setViewParams] = useState<any>(null);

  // Load Settings
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [menuOpen, setMenuOpen] = useState(false);
  const [extraMenuOpen, setExtraMenuOpen] = useState(false);
  const [modal, setModal] = useState<'disclaimer' | 'cookies' | null>(null);
  const [usageWarning, setUsageWarning] = useState<null | { scope: 'minute' | 'hour' | 'day' | 'month'; current: number; limit: number }>(null);
  const [limitReached, setLimitReached] = useState<null | { scope: 'minute' | 'hour' | 'day' | 'month'; limit: number }>(null);
  
  // PWA State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPWABanner, setShowPWABanner] = useState(false);

  const navigate = (view: ViewState, params?: any) => {
      setPreviousView(currentView);
      setCurrentView(view);
      setViewParams(params || null);
  };

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

  // PWA Logic
  useEffect(() => {
    // Check if PWA
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (!isPWA && !isMobile) {
        // Increment count
        const count = parseInt(localStorage.getItem('pwa_login_count') || '0') + 1;
        localStorage.setItem('pwa_login_count', count.toString());

        // Check if we should show banner (between 2 and 5 logins)
        if (count >= 2 && count <= 5) {
            setShowPWABanner(true);
        }
    }

    const handler = (e: any) => {
        e.preventDefault();
        setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const installPWA = () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult: any) => {
            if (choiceResult.outcome === 'accepted') {
                setShowPWABanner(false);
            }
            setDeferredPrompt(null);
        });
    }
  };

  // Helper for translations in this component
  const t = (key: string) => getTranslation(key, settings.language);

  const getUsageScopeLabel = (scope: 'minute' | 'hour' | 'day' | 'month') => {
      if (scope === 'minute') return t('usage.scope.minute');
      if (scope === 'hour') return t('usage.scope.hour');
      if (scope === 'day') return t('usage.scope.day');
      return t('usage.scope.month');
  };

  useEffect(() => {
      const handler = (event: Event) => {
          const custom = event as CustomEvent<any>;
          if (!custom.detail) return;
          const { scope, stats, limits } = custom.detail as { scope: 'minute' | 'hour' | 'day' | 'month'; stats: any; limits: any };
          let current = 0;
          let limit = 0;
          if (scope === 'minute') {
              current = stats.minuteCount;
              limit = limits.MINUTE;
          } else if (scope === 'hour') {
              current = stats.hourCount;
              limit = limits.HOUR;
          } else if (scope === 'day') {
              current = stats.dayCount;
              limit = limits.DAY;
          } else if (scope === 'month') {
              current = stats.monthCount;
              limit = limits.MONTH;
          }
          if (!limit || current < 0.8 * limit) return;
          setUsageWarning({ scope, current, limit });
      };
      
      const limitHandler = (event: Event) => {
          const custom = event as CustomEvent<any>;
          if (custom.detail) {
              setLimitReached(custom.detail);
          }
      };

      window.addEventListener('usage:warning', handler);
      window.addEventListener('usage:limit_reached', limitHandler);
      
      return () => {
          window.removeEventListener('usage:warning', handler);
          window.removeEventListener('usage:limit_reached', limitHandler);
      };
  }, [settings.language]);

  // Dynamic Title Update
  useEffect(() => {
      let viewKey = `nav.${currentView.toLowerCase()}`;
      if (currentView === ViewState.HOURLY_DETAIL) viewKey = 'nav.current';
      
      const viewName = t(viewKey) || currentView; // Fallback if translation missing
      document.title = `${t('app.title_prefix')} - ${viewName}`;
  }, [currentView, settings.language]);

  // Reload settings when user logs in to capture any changes made on Landing Page (e.g. language)
  useEffect(() => {
      if (user) {
          setSettings(loadSettings());
      }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-50 dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const renderView = () => {
    switch (currentView) {
      case ViewState.CURRENT:
        return <CurrentWeatherView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.FORECAST:
        return <ForecastWeatherView onNavigate={navigate} settings={settings} />;
      case ViewState.MAP:
        return <MapView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.RECORDS:
        return <RecordsWeatherView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.HOURLY_DETAIL:
        return <HourlyDetailView onNavigate={navigate} settings={settings} />;
      case ViewState.ENSEMBLE:
        return <EnsembleWeatherView onNavigate={navigate} settings={settings} />;
      case ViewState.HOLIDAY:
        return <HolidayWeatherView onNavigate={navigate} settings={settings} />;
      case ViewState.HOLIDAY_REPORT:
        return <HolidayReportView onNavigate={navigate} settings={settings} />;
      case ViewState.HISTORICAL:
        return <HistoricalWeatherView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} initialParams={viewParams} />;
      case ViewState.STRAVA:
        return <StravaWeatherView onNavigate={navigate} settings={settings} />;
      case ViewState.SHARE:
        return <ShareWeatherView onNavigate={navigate} settings={settings} />;
      case ViewState.BAROMETER:
        return <BarometerView onNavigate={navigate} settings={settings} />;
      case ViewState.CLIMATE_CHANGE:
        return <ClimateChangeView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.THIS_DAY:
        return <ThisDayView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.SETTINGS:
        return <SettingsView settings={settings} onUpdateSettings={setSettings} onNavigate={navigate} />;
      case ViewState.TEAM:
        return <TeamView onNavigate={navigate} />;
      case ViewState.PRICING:
        return <PricingView onNavigate={navigate} settings={settings} />;
      case ViewState.MODEL_INFO:
        return <ModelInfoView onNavigate={navigate} settings={settings} previousView={previousView} />;
      case ViewState.COUNTRY_MAP:
        return <CountryMapView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.USER_ACCOUNT:
        return <UserAccountView onNavigate={navigate} settings={settings} installPWA={installPWA} canInstallPWA={!!deferredPrompt} />;
      case ViewState.INFO:
        return <InfoView onNavigate={navigate} settings={settings} />;
      default:
        return <CurrentWeatherView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
    }
  };

  const closeModal = () => setModal(null);

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-background-dark text-slate-800 dark:text-white relative flex flex-col transition-colors duration-300">
        <div className="flex-grow pb-4 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8">
            {renderView()}
        </div>

        {usageWarning && (
            <div className="fixed top-4 inset-x-0 flex justify-center z-[3000] px-4 pointer-events-none">
                <div className="max-w-xl w-full bg-yellow-50 dark:bg-yellow-900/40 border border-yellow-200 dark:border-yellow-700 text-yellow-900 dark:text-yellow-100 rounded-2xl shadow-lg px-4 py-3 flex items-start gap-3 pointer-events-auto">
                    <div className="mt-0.5">
                        <Icon name="warning" className="text-lg text-yellow-500 dark:text-yellow-300" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold">
                            {t('usage.warning_title')}
                        </p>
                        <p className="text-xs mt-0.5">
                            {(() => {
                                const percent = Math.round((usageWarning.current / usageWarning.limit) * 100);
                                const scopeLabel = getUsageScopeLabel(usageWarning.scope);
                                return t('usage.warning_message')
                                    .replace('{percent}', percent.toString())
                                    .replace('{scope}', scopeLabel)
                                    .replace('{current}', usageWarning.current.toString())
                                    .replace('{limit}', usageWarning.limit.toString());
                            })()}
                        </p>
                    </div>
                    <button
                        onClick={() => setUsageWarning(null)}
                        className="text-xs text-yellow-700 dark:text-yellow-200 hover:text-yellow-900 dark:hover:text-white px-1"
                    >
                        <Icon name="close" className="text-sm" />
                    </button>
                </div>
            </div>
        )}

        {showPWABanner && deferredPrompt && (
            <div className={`fixed inset-x-0 flex justify-center z-[2900] px-4 pointer-events-none transition-all duration-300 ${usageWarning ? 'top-32' : 'top-4'}`}>
                <div className="max-w-xl w-full bg-blue-600 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center justify-between gap-3 pointer-events-auto">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg">
                            <Icon name="download" className="text-xl" />
                        </div>
                        <div>
                            <p className="font-bold text-sm">Install App</p>
                            <p className="text-xs opacity-90">{t('pwa.install_desc')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setShowPWABanner(false)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <Icon name="close" />
                        </button>
                        <button 
                            onClick={installPWA}
                            className="px-3 py-1.5 bg-white text-blue-600 rounded-lg text-xs font-bold hover:bg-white/90 transition-colors"
                        >
                            Install
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#101d22]/90 backdrop-blur-xl border-t border-slate-200 dark:border-white/10 z-50 shadow-2xl transition-colors duration-300 print:hidden">
            <div className="max-w-5xl mx-auto flex justify-around p-2 pb-4">
            <button 
                onClick={() => { navigate(ViewState.CURRENT); setMenuOpen(false); setExtraMenuOpen(false); }}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.CURRENT || currentView === ViewState.HOURLY_DETAIL ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="sunny" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.current')}</span>
            </button>
            <button 
                onClick={() => { navigate(ViewState.FORECAST); setMenuOpen(false); setExtraMenuOpen(false); }}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.FORECAST ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="date_range" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.forecast')}</span>
            </button>
            <button 
                onClick={() => { navigate(ViewState.ENSEMBLE); setMenuOpen(false); setExtraMenuOpen(false); }}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.ENSEMBLE ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="ssid_chart" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.ensemble')}</span>
            </button>
            <button 
                onClick={() => { navigate(ViewState.RECORDS); setMenuOpen(false); setExtraMenuOpen(false); }}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.RECORDS ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="bar_chart" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.records')}</span>
            </button>
            <button 
                onClick={() => { navigate(ViewState.THIS_DAY); setMenuOpen(false); setExtraMenuOpen(false); }}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.THIS_DAY ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="calendar_today" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('this_day.title')}</span>
            </button>
            <button 
                onClick={() => { navigate(ViewState.HISTORICAL); setMenuOpen(false); setExtraMenuOpen(false); }}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.HISTORICAL ? 'text-primary scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="calendar_month" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.historical')}</span>
            </button>
            <button 
                onClick={() => { setExtraMenuOpen(!extraMenuOpen); setMenuOpen(false); }}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${extraMenuOpen ? 'text-slate-800 dark:text-white scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="add_circle" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('share.extra_menu')}</span>
            </button>
            
            {/* Hamburger Menu Button */}
            <button 
                onClick={() => { setMenuOpen(!menuOpen); setExtraMenuOpen(false); }}
                className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${menuOpen ? 'text-slate-800 dark:text-white scale-110' : 'text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
            >
                <Icon name="menu" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('menu')}</span>
            </button>
        </div>
        </div>

        {/* Extra Menu Overlay */}
        {extraMenuOpen && (
            <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setExtraMenuOpen(false)}>
                <div 
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-5xl bg-white dark:bg-card-dark rounded-t-[32px] p-4 pb-24 md:p-6 md:pb-28 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 border-t border-slate-200 dark:border-white/10 shadow-2xl no-scrollbar" 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="w-12 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full mx-auto mb-6 sticky top-0" />
                    
                    <div className="space-y-3 md:space-y-4">
                         <button onClick={() => { navigate(ViewState.CLIMATE_CHANGE); setExtraMenuOpen(false); }} className="w-full flex items-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-slate-100 dark:border-white/5 text-left group">
                            <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                                <Icon name="thermostat" className="text-xl md:text-2xl" />
                            </div>
                            <div className="flex flex-col items-start min-w-0 flex-1">
                                <span className="font-bold text-base md:text-lg truncate w-full">{t('climate.title')}</span>
                                <span className="text-xs text-slate-500 dark:text-white/60 text-left line-clamp-1">{t('climate.subtitle')}</span>
                            </div>
                         </button>

                         <button onClick={() => { navigate(ViewState.THIS_DAY); setExtraMenuOpen(false); }} className="w-full flex items-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-slate-100 dark:border-white/5 text-left group">
                            <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                <Icon name="calendar_today" className="text-xl md:text-2xl" />
                            </div>
                            <div className="flex flex-col items-start min-w-0 flex-1">
                                <span className="font-bold text-base md:text-lg truncate w-full">{t('this_day.title')}</span>
                                <span className="text-xs text-slate-500 dark:text-white/60 text-left line-clamp-1">{t('this_day.subtitle')}</span>
                            </div>
                         </button>

                         <button onClick={() => { navigate(ViewState.BAROMETER); setExtraMenuOpen(false); }} className="w-full flex items-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-slate-100 dark:border-white/5 text-left group">
                            <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                <Icon name="speed" className="text-xl md:text-2xl" />
                            </div>
                            <div className="flex flex-col items-start min-w-0 flex-1">
                                <span className="font-bold text-base md:text-lg truncate w-full">{t('barometer.title')}</span>
                                <span className="text-xs text-slate-500 dark:text-white/60 text-left line-clamp-1">{t('barometer.subtitle')}</span>
                            </div>
                         </button>

                         <button onClick={() => { navigate(ViewState.HOLIDAY_REPORT); setExtraMenuOpen(false); }} className="w-full flex items-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-slate-100 dark:border-white/5 text-left group">
                            <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                <Icon name="flight_takeoff" className="text-xl md:text-2xl" />
                            </div>
                            <div className="flex flex-col items-start min-w-0 flex-1">
                                <span className="font-bold text-base md:text-lg truncate w-full">{t('holiday_report.title_default')}</span>
                                <span className="text-xs text-slate-500 dark:text-white/60 text-left line-clamp-1">{t('holiday_report.menu_subtitle')}</span>
                            </div>
                         </button>

                         <button onClick={() => { navigate(ViewState.STRAVA); setExtraMenuOpen(false); }} className="w-full flex items-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-slate-100 dark:border-white/5 text-left group">
                            <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                                <Icon name="directions_bike" className="text-xl md:text-2xl" />
                            </div>
                            <div className="flex flex-col items-start min-w-0 flex-1">
                                <span className="font-bold text-base md:text-lg truncate w-full">{t('nav.strava')}</span>
                                <span className="text-xs text-slate-500 dark:text-white/60 text-left line-clamp-1">{t('share.strava')}</span>
                            </div>
                         </button>

                         <button onClick={() => { navigate(ViewState.SHARE); setExtraMenuOpen(false); }} className="w-full flex items-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-slate-100 dark:border-white/5 text-left group">
                            <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <Icon name="add_a_photo" className="text-xl md:text-2xl" />
                            </div>
                            <div className="flex flex-col items-start min-w-0 flex-1">
                                <span className="font-bold text-base md:text-lg truncate w-full">{t('share.photo_weather')}</span>
                                <span className="text-xs text-slate-500 dark:text-white/60 text-left line-clamp-1">{t('share.title')}</span>
                            </div>
                         </button>
                    </div>
                </div>
            </div>
        )}

        {/* Hamburger Menu Overlay */}
        {menuOpen && (
            <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setMenuOpen(false)}>
                <div 
                    className="absolute bottom-0 left-0 right-0 bg-white dark:bg-card-dark rounded-t-[32px] p-4 pb-24 md:p-6 md:pb-28 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 border-t border-slate-200 dark:border-white/10 shadow-2xl no-scrollbar" 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="w-12 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full mx-auto mb-6 sticky top-0" />
                    
                    <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6 md:mb-8">
                         <button onClick={() => { navigate(ViewState.SETTINGS); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-white">
                                <Icon name="settings" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">{t('nav.settings')}</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.TEAM); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <Icon name="groups" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">{t('nav.team')}</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.PRICING); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400">
                                <Icon name="payments" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">{t('nav.pricing')}</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.MODEL_INFO); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-cyan-100 dark:bg-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                                <Icon name="model_training" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">{t('nav.model_info')}</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.INFO); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                <Icon name="info" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">{t('nav.info')}</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.USER_ACCOUNT); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-slate-100 dark:border-white/5">
                            <div className="size-10 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-600 dark:text-white/60">
                                <Icon name="account_circle" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm">{t('nav.user_account')}</span>
                         </button>
                    </div>
                    
                    {sessionExpiry && (
                         <div className="text-center mb-8">
                            
                         </div>
                    )}
                    
                    <div className="relative flex justify-center gap-8 text-xs font-medium text-slate-500 dark:text-white/40">
                         <button onClick={() => setModal('disclaimer')} className="hover:text-primary transition-colors hover:underline">{t('footer.disclaimer')}</button>
                         <button onClick={() => setModal('cookies')} className="hover:text-primary transition-colors hover:underline">{t('footer.cookies')}</button>
                         <span className="absolute right-0 top-0">v{pkg.version}</span>
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

        {/* Limit Reached Modal */}
        {limitReached && (
            <LimitReachedModal
                isOpen={!!limitReached}
                onClose={() => setLimitReached(null)}
                onNavigate={navigate}
                limit={limitReached.limit}
                scope={limitReached.scope}
            />
        )}

    </div>
  );
};

export default App;
