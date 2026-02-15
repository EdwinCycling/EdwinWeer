
import React, { useState, useEffect, Suspense } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from './services/firebase';
import { CurrentWeatherView } from './views/CurrentWeatherView';
import { FAQView } from './views/FAQView';
import { LoadingSpinner } from './components/LoadingSpinner';

// Lazy load views to improve initial load time
const ForecastWeatherView = React.lazy(() => import('./views/ForecastWeatherView').then(module => ({ default: module.ForecastWeatherView })));
const HistoricalWeatherView = React.lazy(() => import('./views/HistoricalWeatherView').then(module => ({ default: module.HistoricalWeatherView })));
const StravaWeatherView = React.lazy(() => import('./views/StravaWeatherView').then(module => ({ default: module.StravaWeatherView })));
const HourlyDetailView = React.lazy(() => import('./views/HourlyDetailView').then(module => ({ default: module.HourlyDetailView })));
const MapView = React.lazy(() => import('./views/MapView').then(module => ({ default: module.MapView })));
const SettingsView = React.lazy(() => import('./views/SettingsView').then(module => ({ default: module.SettingsView })));
const EnsembleWeatherView = React.lazy(() => import('./views/EnsembleWeatherView').then(module => ({ default: module.EnsembleWeatherView })));
const HolidayWeatherView = React.lazy(() => import('./views/HolidayWeatherView').then(module => ({ default: module.HolidayWeatherView })));
const HolidayReportView = React.lazy(() => import('./views/HolidayReportView').then(module => ({ default: module.HolidayReportView })));
const TeamView = React.lazy(() => import('./views/TeamView').then(module => ({ default: module.TeamView })));
const PricingView = React.lazy(() => import('./views/PricingView').then(module => ({ default: module.PricingView })));
const InfoView = React.lazy(() => import('./views/InfoView').then(module => ({ default: module.InfoView })));
const ModelInfoView = React.lazy(() => import('./views/ModelInfoView').then(module => ({ default: module.ModelInfoView })));
const CountryMapView = React.lazy(() => import('./views/CountryMapView').then(module => ({ default: module.CountryMapView })));
const UserAccountView = React.lazy(() => import('./views/UserAccountView').then(module => ({ default: module.UserAccountView })));
const RecordsWeatherView = React.lazy(() => import('./views/RecordsWeatherView').then(module => ({ default: module.RecordsWeatherView })));
const ShareWeatherView = React.lazy(() => import('./views/ShareWeatherView').then(module => ({ default: module.ShareWeatherView })));
const BarometerView = React.lazy(() => import('./views/BarometerView').then(module => ({ default: module.BarometerView })));
const ClimateChangeView = React.lazy(() => import('./views/ClimateChangeView').then(module => ({ default: module.ClimateChangeView })));
const ThisDayView = React.lazy(() => import('./views/ThisDayView').then(module => ({ default: module.ThisDayView })));
const YourDayView = React.lazy(() => import('./views/YourDayView').then(module => ({ default: module.YourDayView })));
const EmailSettingsView = React.lazy(() => import('./views/EmailSettingsView').then(module => ({ default: module.EmailSettingsView })));
const MessengerView = React.lazy(() => import('./views/MessengerView').then(module => ({ default: module.MessengerView })));
const NotificationsView = React.lazy(() => import('./views/NotificationsView').then(module => ({ default: module.NotificationsView })));
const ActivityPlannerView = React.lazy(() => import('./views/ActivityPlannerView').then(module => ({ default: module.ActivityPlannerView })));
const WeatherFinderView = React.lazy(() => import('./views/WeatherFinderView').then(module => ({ default: module.WeatherFinderView })));
const TripPlannerView = React.lazy(() => import('./views/TripPlannerView').then(module => ({ default: module.TripPlannerView })));
const ProfilesView = React.lazy(() => import('./views/ProfilesView').then(module => ({ default: module.ProfilesView })));
const CyclingView = React.lazy(() => import('./views/CyclingView').then(module => ({ default: module.CyclingView })));
const BaroWeermanView = React.lazy(() => import('./views/BaroWeermanView').then(module => ({ default: module.BaroWeermanView })));
const BaroTimeMachineView = React.lazy(() => import('./views/BaroTimeMachineView').then(module => ({ default: module.BaroTimeMachineView })));
const BaroStorytellerView = React.lazy(() => import('./views/BaroStorytellerView').then(module => ({ default: module.BaroStorytellerView })));
const SongWriterView = React.lazy(() => import('./views/SongWriterView').then(module => ({ default: module.SongWriterView })));
const ImmersiveForecastView = React.lazy(() => import('./views/ImmersiveForecastView').then(module => ({ default: module.ImmersiveForecastView })));
const GlobeView = React.lazy(() => import('./views/GlobeView').then(module => ({ default: module.GlobeView })));
import { BigBenView } from './views/BigBenView';
import { RadioProvider } from './contexts/RadioContext';
import { FloatingRadioPlayer } from './components/FloatingRadioPlayer';
import { WinnerConfetti } from './components/WinnerConfetti';
import { LandingPageV2 } from './views/LandingPageV2';
const BaroRitAdviesView = React.lazy(() => import('./views/BaroRitAdviesView').then(module => ({ default: module.BaroRitAdviesView })));
const GameDashboardView = React.lazy(() => import('./views/GameDashboardView').then(module => ({ default: module.GameDashboardView })));
const AmbientView = React.lazy(() => import('./views/AmbientView').then(module => ({ default: module.AmbientView })));
import { ViewState, AppSettings } from './types';
import { loadSettings, saveSettings, saveCurrentLocation } from './services/storageService';
import { getTranslation } from './services/translations';
import { Icon } from './components/Icon';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './contexts/ThemeContext';
import { LimitReachedModal } from './components/LimitReachedModal';
import { CreditMonitor } from './components/CreditMonitor';
import ReloadPrompt from './components/ReloadPrompt';
import { useScrollLock } from './hooks/useScrollLock';
import { LoginToast } from './components/LoginToast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { checkLimit, getUsage, API_LIMITS, loadRemoteUsage, checkAndResetDailyCredits } from './services/usageService';
import { GlobalBanner } from './components/GlobalBanner';
import { useGeoBlock } from './hooks/useGeoBlock';
import { AccessDenied } from './components/AccessDenied';
import packageJson from './package.json';

const App: React.FC = () => {
  const { isBlocked, loading: geoLoading } = useGeoBlock();
  const { user, loading, sessionExpiry, finishEmailSignIn } = useAuth();
  const { theme, setTheme } = useTheme();
  const appVersion = packageJson.version;

  const [isFinishingEmailSignIn, setIsFinishingEmailSignIn] = useState(false);

  // Gamification Button Logic
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);
  const [hasBetOnOpenRound, setHasBetOnOpenRound] = useState(false);

  useEffect(() => {
      const q = query(collection(db, 'game_rounds'), where('status', '==', 'open'));
      return onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
              setOpenRoundId(snapshot.docs[0].id);
          } else {
              setOpenRoundId(null);
          }
      });
  }, []);

  useEffect(() => {
      if (!user || !openRoundId) {
          setHasBetOnOpenRound(false);
          return;
      }
      return onSnapshot(doc(db, 'game_rounds', openRoundId, 'bets', user.uid), (snap) => {
          setHasBetOnOpenRound(snap.exists());
      });
  }, [user, openRoundId]);

  // Handle Email Magic Link Finish
  useEffect(() => {
    const handleFinishEmailSignIn = async () => {
      // Gebruik de Firebase helper om te checken of dit een login link is
      const { isSignInWithEmailLink } = await import('firebase/auth');
      const { auth } = await import('./services/firebase');
      
      if (isSignInWithEmailLink(auth, window.location.href)) {
        setIsFinishingEmailSignIn(true);
        try {
          // 1. Haal e-mail op uit storage
          let email = window.localStorage.getItem('emailForSignIn');
          
          // 2. Als leeg (ander apparaat), vraag de gebruiker
          if (!email) {
            email = window.prompt('Voer ter bevestiging je e-mailadres opnieuw in:');
          }
          
          if (email) {
            // 3. Voer de login uit
            await finishEmailSignIn(email, window.location.href);
            
            // 4. Na succes: URL opschonen en "redirect" naar home/dashboard
            // (De AuthContext update zorgt dat de app de ingelogde weergave toont)
            window.history.replaceState({}, document.title, '/');
          }
        } catch (error: any) {
          console.error("Fout bij afronden email login:", error);
          alert(`Inloggen mislukt: ${error.message}`);
          window.history.replaceState({}, document.title, '/');
        } finally {
          setIsFinishingEmailSignIn(false);
        }
      }
    };

    handleFinishEmailSignIn();
  }, []);

  const [currentView, setCurrentView] = useState<ViewState>(() => {
      // Check for persisted view from session (to handle first-load jumps)
      const persistedView = sessionStorage.getItem('baro_current_view');
      if (persistedView && Object.values(ViewState).includes(persistedView as ViewState)) {
          return persistedView as ViewState;
      }

      // Check if returning from Stripe payment
      const params = new URLSearchParams(window.location.search);
      if (params.get('success') === 'true') {
          return ViewState.PRICING;
      }

      // Check for immersive startup preference
      const savedSettings = loadSettings();
      if (savedSettings.startWithImmersive) {
          return ViewState.IMMERSIVE_FORECAST;
      }

      return ViewState.CURRENT;
  });

  // Persist view state to handle unexpected reloads/jumps
  useEffect(() => {
      if (currentView) {
          sessionStorage.setItem('baro_current_view', currentView);
      }
  }, [currentView]);
  const [previousView, setPreviousView] = useState<ViewState | null>(null);
  const [viewParams, setViewParams] = useState<any>(null);

  // Load Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    return loadSettings();
  });

  // Sync ThemeContext with Settings state (Context -> Settings)
  useEffect(() => {
    if (theme && theme !== settings.theme) {
        setSettings(prev => ({ ...prev, theme }));
    }
  }, [theme]);

  // RELOAD SETTINGS WHEN USER CHANGES (Fix for account switching issue)
  useEffect(() => {
      if (!loading) {
          // When auth loading finishes (whether user is null or logged in),
          // we should refresh settings from storage because loadRemoteData might have updated them.
          const current = loadSettings();
          // Only update if different to avoid loops (though setSettings does shallow compare usually, objects are new)
          // We can just set it, as it will trigger saveSettings which is fine as long as it's the correct data.
          setSettings(current);
      }
  }, [user, loading]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [extraMenuOpen, setExtraMenuOpen] = useState(false);
  const [baroMenuOpen, setBaroMenuOpen] = useState(false);
  const [modal, setModal] = useState<'disclaimer' | 'cookies' | null>(null);
  const [usageWarning, setUsageWarning] = useState<null | { scope: 'minute' | 'hour' | 'day' | 'month'; current: number; limit: number }>(null);
  const [limitReached, setLimitReached] = useState<null | { scope: 'minute' | 'hour' | 'day' | 'month'; limit: number }>(null);
  
  // PWA State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPWABanner, setShowPWABanner] = useState(false);
  const [showLoginToast, setShowLoginToast] = useState(false);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);

  useScrollLock(menuOpen || extraMenuOpen || baroMenuOpen || modal !== null);

  const [isRefreshingLimit, setIsRefreshingLimit] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const verifyLimit = async (forceRefresh: boolean = false) => {
      setIsRefreshingLimit(true);
      try {
          if (user) {
              await loadRemoteUsage(user.uid);
              await checkAndResetDailyCredits(getUsage(), user.uid);
          }
          checkLimit();
          setLimitReached(null);
          
          if (forceRefresh) {
              setRefreshKey(prev => prev + 1);
          }
      } catch (e) {
          // Event listener will handle setting limitReached
          // But we can also set it manually here if needed
          const stats = getUsage();
          const isPro = stats.weatherCredits > 0;
          const limits = isPro ? API_LIMITS.PRO : API_LIMITS.FREE;
          if (stats.dayStart === new Date().toISOString().split('T')[0] && stats.dayCount >= limits.DAY) {
               setLimitReached({ scope: 'day', limit: limits.DAY });
          }
      } finally {
          setIsRefreshingLimit(false);
      }
  };

  const navigate = (view: ViewState, params?: any) => {
      verifyLimit();
      setPreviousView(currentView);
      setCurrentView(view);
      setViewParams(params || null);
  };

  useEffect(() => {
      saveSettings(settings);
      // Theme application is now handled by ThemeContext
  }, [settings]);

  // Initial Limit Check
  useEffect(() => {
      verifyLimit();
  }, []);

  // PWA Logic
  useEffect(() => {
    // Check if PWA
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // Check for Mac Safari
    const isMac = /Macintosh/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isMac && isSafari && !isPWA) {
        setShowInstallInstructions(true);
    }

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

  if (loading || geoLoading || isFinishingEmailSignIn) {
    return (
      <>
        <GlobalBanner />
        <div className="min-h-screen w-full bg-slate-50 dark:bg-background-dark flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            {isFinishingEmailSignIn && (
              <p className="text-text-muted animate-pulse">Bezig met inloggen via e-mail link...</p>
            )}
          </div>
        </div>
      </>
    );
  }

  if (isBlocked) {
    return <AccessDenied />;
  }

  if (!user) {
    if (currentView === ViewState.FAQ) {
        return (
            <>
                <GlobalBanner />
                <FAQView onNavigate={navigate} settings={settings} isLandingV2={true} />
            </>
        );
    }
    return (
        <>
            <GlobalBanner />
            <LandingPageV2 onNavigate={navigate} />
        </>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case ViewState.CURRENT:
        return <CurrentWeatherView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.FORECAST:
        return <ForecastWeatherView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} isLimitReached={!!limitReached} />;
      case ViewState.MAP:
        return <MapView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.RECORDS:
        return <RecordsWeatherView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} initialParams={viewParams} />;
      case ViewState.HOURLY_DETAIL:
        return <HourlyDetailView onNavigate={navigate} settings={settings} initialParams={viewParams} />;
      case ViewState.ENSEMBLE:
        return <EnsembleWeatherView onNavigate={navigate} settings={settings} />;
      case ViewState.HOLIDAY:
        return <HolidayWeatherView onNavigate={navigate} settings={settings} />;
      case ViewState.HOLIDAY_REPORT:
        return <HolidayReportView onNavigate={navigate} settings={settings} />;
      case ViewState.HISTORICAL:
        return <HistoricalWeatherView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} initialParams={viewParams} isLimitReached={!!limitReached} />;
      case ViewState.STRAVA:
        return <StravaWeatherView onNavigate={navigate} settings={settings} />;
      case ViewState.AMBIENT:
        return <AmbientView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.SHARE:
        return <ShareWeatherView onNavigate={navigate} settings={settings} />;
      case ViewState.BAROMETER:
        return <BarometerView onNavigate={navigate} settings={settings} />;
      case ViewState.CLIMATE_CHANGE:
        return <ClimateChangeView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.THIS_DAY:
        return <ThisDayView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.YOUR_DAY:
        return <YourDayView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.EMAIL_SETTINGS:
        return <EmailSettingsView settings={settings} onUpdateSettings={setSettings} onNavigate={navigate} />;
      case ViewState.MESSENGER:
        return <MessengerView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.ACTIVITY_PLANNER:
        return <ActivityPlannerView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.NOTIFICATIONS:
        return <NotificationsView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.LANDING_V2:
        return <LandingPageV2 onNavigate={navigate} />;
      case ViewState.PROFILES:
        return <ProfilesView settings={settings} onUpdateSettings={setSettings} onNavigate={navigate} />;
      case ViewState.CYCLING:
        return <CyclingView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.IMMERSIVE_FORECAST:
        return <ImmersiveForecastView onNavigate={navigate} settings={settings} />;
      case ViewState.GLOBE:
        return <GlobeView 
            onNavigate={navigate} 
            settings={settings} 
            onSelectLocation={(loc) => {
                saveCurrentLocation(loc);
                navigate(ViewState.CURRENT);
            }} 
        />;
      case ViewState.BARO_WEERMAN:
        return <BaroWeermanView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} isLimitReached={!!limitReached} />;
      case ViewState.BARO_TIME_MACHINE:
        return <BaroTimeMachineView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} isLimitReached={!!limitReached} />;
      case ViewState.BARO_STORYTELLER:
        return <BaroStorytellerView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} isLimitReached={!!limitReached} />;
      case ViewState.BARO_RIT_ADVIES:
        return <BaroRitAdviesView onNavigate={navigate} />;
      case ViewState.SONG_WRITER:
        return <SongWriterView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} isLimitReached={!!limitReached} />;
      case ViewState.WEATHER_FINDER:
        return <WeatherFinderView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.TRIP_PLANNER:
        return <TripPlannerView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.SETTINGS:
        return <SettingsView settings={settings} onUpdateSettings={setSettings} onNavigate={navigate} initialTab={viewParams?.tab} />;
      case ViewState.TEAM:
        return <TeamView onNavigate={navigate} settings={settings} />;
      case ViewState.PRICING:
        return <PricingView onNavigate={navigate} settings={settings} />;
      case ViewState.MODEL_INFO:
        return <ModelInfoView onNavigate={navigate} settings={settings} previousView={previousView} />;
      case ViewState.COUNTRY_MAP:
        return <CountryMapView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.USER_ACCOUNT:
        return <UserAccountView onNavigate={navigate} settings={settings} installPWA={installPWA} canInstallPWA={!!deferredPrompt} showInstallInstructions={showInstallInstructions} />;
      case ViewState.INFO:
        return <InfoView onNavigate={navigate} settings={settings} />;
      case ViewState.FAQ:
        return <FAQView onNavigate={navigate} settings={settings} />;
      case ViewState.BIG_BEN:
        return <BigBenView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      case ViewState.GAME_DASHBOARD:
        return <GameDashboardView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
      default:
        return <CurrentWeatherView onNavigate={navigate} settings={settings} onUpdateSettings={setSettings} />;
    }
  };

  const closeModal = () => setModal(null);

  return (
    <RadioProvider>
    <div className="min-h-screen w-full bg-background-light dark:bg-background-dark">
        <GlobalBanner />
        <div className="max-w-5xl mx-auto px-0 lg:px-8 pb-32 w-full" key={refreshKey}>
            <ErrorBoundary settings={settings} onNavigate={navigate}>
                <Suspense fallback={<LoadingSpinner />}>
                    {renderView()}
                </Suspense>
            </ErrorBoundary>
        </div>

        {/* Game FAB */}
        {[
            ViewState.CURRENT, 
            ViewState.FORECAST, 
            ViewState.MAP, 
            ViewState.ENSEMBLE, 
            ViewState.RECORDS, 
            ViewState.HISTORICAL, 
            ViewState.HOURLY_DETAIL, 
            ViewState.THIS_DAY, 
            ViewState.YOUR_DAY,
            ViewState.IMMERSIVE_FORECAST,
            ViewState.BARO_WEERMAN,
            ViewState.BARO_STORYTELLER,
            ViewState.ACTIVITY_PLANNER,
            ViewState.CYCLING,
            ViewState.BARO_RIT_ADVIES,
            ViewState.WEATHER_FINDER,
            ViewState.LANDING_V2
        ].includes(currentView) && (
            <button
                onClick={() => navigate(ViewState.GAME_DASHBOARD)}
                className={`fixed bottom-[154px] md:bottom-40 right-4 z-[100] h-12 md:h-14 w-12 md:w-auto md:px-6 rounded-full shadow-lg flex items-center justify-center gap-3 hover:scale-110 transition-transform border border-white/20 group overflow-hidden ${
                    openRoundId && !hasBetOnOpenRound 
                        ? 'bg-purple-600 text-white' 
                        : (openRoundId && hasBetOnOpenRound 
                            ? 'bg-white text-purple-600' 
                            : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white')
                }`}
                aria-label="Play Beat Baro"
            >
                <span className="text-2xl transition-transform group-hover:rotate-12">🥊</span>
                <span className="hidden md:inline font-bold whitespace-nowrap tracking-wide">Beat Baro</span>
            </button>
        )}

        <WinnerConfetti settings={settings} />

        <FloatingRadioPlayer visible={currentView !== ViewState.BIG_BEN} />

        {showLoginToast && user && (
            <LoginToast userEmail={user.email} onClose={() => setShowLoginToast(false)} />
        )}

        {limitReached && currentView !== ViewState.PRICING && (
            <div className="fixed top-4 inset-x-0 flex justify-center z-[3000] px-4 pointer-events-none">
                <div className="max-w-xl w-full bg-amber-500 text-white border border-amber-600 rounded-2xl shadow-lg px-4 py-3 flex items-start gap-3 pointer-events-auto">
                    <div className="mt-0.5">
                        <Icon name="block" className="text-lg text-white" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold">
                            {t('usage.limit_reached')}
                        </p>
                        <p className="text-xs mt-0.5">
                             {t('usage.limit_reached_daily')}
                        </p>
                    </div>
                    <button
                        onClick={() => navigate(ViewState.PRICING)}
                        className="text-xs bg-bg-card/40 hover:bg-bg-card/60 rounded px-2 py-1 font-bold transition-colors border border-border-color/20"
                    >
                        {t('nav.pricing')}
                    </button>
                    <button
                        onClick={() => verifyLimit(true)}
                        disabled={isRefreshingLimit}
                        className={`text-xs bg-bg-card/40 hover:bg-bg-card/60 rounded px-2 py-1 font-bold transition-colors ml-2 border border-border-color/20 ${isRefreshingLimit ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <Icon name="refresh" className={`text-sm ${isRefreshingLimit ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>
        )}

        {usageWarning && !limitReached && (
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
                <div className="max-w-xl w-full bg-accent-primary text-text-inverse rounded-2xl shadow-xl px-4 py-3 flex items-center justify-between gap-3 pointer-events-auto">
                    <div className="flex items-center gap-3">
                        <div className="bg-bg-card/20 p-2 rounded-lg">
                            <Icon name="download" className="text-xl" />
                        </div>
                        <div>
                            <p className="font-bold text-sm">{t('install_app')}</p>
                            <p className="text-xs opacity-90">{t('pwa.install_desc')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setShowPWABanner(false)}
                            className="p-2 hover:bg-bg-card/10 rounded-lg transition-colors"
                        >
                            <Icon name="close" />
                        </button>
                        <button 
                            onClick={installPWA}
                            className="px-3 py-1.5 bg-bg-card text-accent-primary rounded-lg text-xs font-bold hover:bg-bg-card/90 transition-colors"
                        >
                            {t('install')}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-bg-card/90 backdrop-blur-xl border-t border-border-color z-[1600] shadow-2xl transition-colors duration-300 print:hidden">
            <div className="max-w-5xl mx-auto flex justify-around p-1.5 pb-3 md:p-2 md:pb-6" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
            <button 
                onClick={() => { navigate(ViewState.CURRENT); setMenuOpen(false); setExtraMenuOpen(false); setBaroMenuOpen(false); }}
                className={`flex flex-col items-center p-1.5 md:p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.CURRENT || currentView === ViewState.HOURLY_DETAIL ? 'text-primary scale-110' : 'text-text-muted hover:text-text-main'}`}
            >
                <Icon name="sunny" className="text-[20px] md:text-[24px]" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.current')}</span>
            </button>
            <button 
                onClick={() => { navigate(ViewState.FORECAST); setMenuOpen(false); setExtraMenuOpen(false); setBaroMenuOpen(false); }}
                className={`flex flex-col items-center p-1.5 md:p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.FORECAST ? 'text-primary scale-110' : 'text-text-muted hover:text-text-main'}`}
            >
                <Icon name="date_range" className="text-[20px] md:text-[24px]" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.forecast')}</span>
            </button>
            <button 
                onClick={() => { navigate(ViewState.ENSEMBLE); setMenuOpen(false); setExtraMenuOpen(false); setBaroMenuOpen(false); }}
                className={`flex flex-col items-center p-1.5 md:p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.ENSEMBLE ? 'text-primary scale-110' : 'text-text-muted hover:text-text-main'}`}
            >
                <Icon name="ssid_chart" className="text-[20px] md:text-[24px]" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.ensemble')}</span>
            </button>
            <button 
                onClick={() => { navigate(ViewState.RECORDS); setMenuOpen(false); setExtraMenuOpen(false); setBaroMenuOpen(false); }}
                className={`flex flex-col items-center p-1.5 md:p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.RECORDS ? 'text-primary scale-110' : 'text-text-muted hover:text-text-main'}`}
            >
                <Icon name="bar_chart" className="text-[20px] md:text-[24px]" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.records')}</span>
            </button>
            <button 
                onClick={() => { navigate(ViewState.HISTORICAL); setMenuOpen(false); setExtraMenuOpen(false); setBaroMenuOpen(false); }}
                className={`flex flex-col items-center p-1.5 md:p-2 rounded-xl transition-all duration-300 ${currentView === ViewState.HISTORICAL ? 'text-primary scale-110' : 'text-text-muted hover:text-text-main'}`}
            >
                <Icon name="calendar_month" className="text-[20px] md:text-[24px]" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('nav.historical')}</span>
            </button>
            <button 
                onClick={() => { setBaroMenuOpen(!baroMenuOpen); setMenuOpen(false); setExtraMenuOpen(false); }}
                className={`flex flex-col items-center p-1.5 md:p-2 rounded-xl transition-all duration-300 ${baroMenuOpen ? 'text-text-main scale-110' : 'text-text-muted hover:text-text-main'}`}
            >
                <Icon name="face" className="text-[20px] md:text-[24px]" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('menu.extra.baro_weerman')}</span>
            </button>
            <button 
                onClick={() => { setExtraMenuOpen(!extraMenuOpen); setMenuOpen(false); setBaroMenuOpen(false); }}
                className={`flex flex-col items-center p-1.5 md:p-2 rounded-xl transition-all duration-300 ${extraMenuOpen ? 'text-text-main scale-110' : 'text-text-muted hover:text-text-main'}`}
            >
                <Icon name="add_circle" className="text-[20px] md:text-[24px]" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('share.extra_menu')}</span>
            </button>
            
            {/* Hamburger Menu Button */}
            <button 
                onClick={() => { setMenuOpen(!menuOpen); setExtraMenuOpen(false); setBaroMenuOpen(false); }}
                className={`flex flex-col items-center p-1.5 md:p-2 rounded-xl transition-all duration-300 ${menuOpen ? 'text-text-main scale-110' : 'text-text-muted hover:text-text-main'}`}
            >
                <Icon name="menu" className="text-[20px] md:text-[24px]" />
                <span className="hidden lg:block text-[10px] font-medium uppercase mt-1">{t('menu')}</span>
            </button>
        </div>
        </div>

        {/* Baro Weerman Menu Overlay */}
        {baroMenuOpen && (
            <div className="fixed inset-0 z-[1500] bg-bg-page/60 backdrop-blur-sm animate-in fade-in" onClick={() => setBaroMenuOpen(false)}>
                <div 
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-5xl bg-bg-card rounded-t-[32px] p-4 md:p-6 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 border-t border-border-color shadow-2xl no-scrollbar" 
                    style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="w-12 h-1.5 bg-border-color rounded-full mx-auto mb-6 sticky top-0" />
                    
                    <div className="space-y-6">
                        <section>
                            <h3 className="text-text-muted text-xs font-bold uppercase tracking-wider mb-3 px-1">{t('menu.extra.baro_weerman')}</h3>
                            <div className="space-y-3 md:space-y-4">
                                {/* Profiles */}
                                <button onClick={() => { navigate(ViewState.PROFILES); setBaroMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                        <Icon name="person" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('menu.extra.profiles_title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('menu.extra.profiles_desc')}</span>
                                    </div>
                                </button>

                                {/* Email Settings */}
                                <button onClick={() => { navigate(ViewState.EMAIL_SETTINGS); setBaroMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                        <Icon name="mail" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('menu.extra.email_title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('menu.extra.email_desc')}</span>
                                    </div>
                                </button>

                                {/* Messenger */}
                                <button onClick={() => { navigate(ViewState.MESSENGER); setBaroMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400">
                                        <Icon name="chat" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('menu.extra.messenger_title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('menu.extra.messenger_desc')}</span>
                                    </div>
                                </button>

                                {/* Push Notifications */}
                                <button onClick={() => { navigate(ViewState.NOTIFICATIONS); setBaroMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-cyan-100 dark:bg-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                                        <Icon name="notifications" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('menu.extra.notifications_title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('menu.extra.notifications_desc')}</span>
                                    </div>
                                </button>

                                {/* Your Day */}
                                <button onClick={() => { navigate(ViewState.YOUR_DAY); setBaroMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-pink-100 dark:bg-pink-500/20 flex items-center justify-center text-pink-600 dark:text-pink-400">
                                        <Icon name="event_note" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('menu.extra.yourday_title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('menu.extra.yourday_desc')}</span>
                                    </div>
                                </button>

                                {/* Activity Planner */}
                                <button onClick={() => { navigate(ViewState.ACTIVITY_PLANNER); setBaroMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                        <Icon name="event_available" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('planner.title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('planner.subtitle')}</span>
                                    </div>
                                </button>

                                {/* Baro Weerman */}
                                <button onClick={() => { navigate(ViewState.BARO_WEERMAN); setBaroMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                        <Icon name="face" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('baro_weerman.title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('baro_weerman.subtitle')}</span>
                                    </div>
                                </button>

                                {/* Cycling Weather */}
                                <button onClick={() => { navigate(ViewState.CYCLING); setBaroMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-yellow-100 dark:bg-yellow-500/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                                        <span className="text-xl md:text-2xl">🚴</span>
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full">{t('wielerkoers_weerbericht.title')}</span>
                                        <span className="text-xs text-slate-500 dark:text-white/60 text-left line-clamp-1">{t('wielerkoers_weerbericht.subtitle')}</span>
                                    </div>
                                </button>

                                {/* Baro Route planner */}
                                <button onClick={() => { navigate(ViewState.BARO_RIT_ADVIES); setBaroMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                        <Icon name="directions_bike" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full">{t('baro_rit_advies.title')}</span>
                                        <span className="text-xs text-slate-500 dark:text-white/60 text-left line-clamp-1">{t('baro_rit_advies.subtitle')}</span>
                                    </div>
                                </button>
                            </div>
                        </section>
                    </div>

                    <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 relative text-xs font-medium text-text-muted">
                         <button onClick={() => setModal('disclaimer')} className="hover:text-text-main transition-colors hover:underline">{t('footer.disclaimer')}</button>
                         <button onClick={() => setModal('cookies')} className="hover:text-text-main transition-colors hover:underline">{t('footer.cookies')}</button>
                         <span className="md:absolute md:right-0 md:top-0">v{appVersion}</span>
                    </div>
                </div>
            </div>
        )}

        {/* Extra Menu Overlay */}
        {extraMenuOpen && (
            <div className="fixed inset-0 z-[1500] bg-bg-page/60 backdrop-blur-sm animate-in fade-in" onClick={() => setExtraMenuOpen(false)}>
                <div 
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-5xl bg-bg-card rounded-t-[32px] p-4 md:p-6 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 border-t border-border-color shadow-2xl no-scrollbar" 
                    style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="w-12 h-1.5 bg-border-color rounded-full mx-auto mb-6 sticky top-0" />
                    
                    <div className="space-y-6">
                        {/* Weer Extra's Section */}
                        <section>
                             <h3 className="text-text-muted text-xs font-bold uppercase tracking-wider mb-3 px-1">{t('menu.extra.extras')}</h3>
                             <div className="space-y-3 md:space-y-4">


                                <button onClick={() => { navigate(ViewState.WEATHER_FINDER); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                        <Icon name="search" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('vind_de_dag.title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('vind_de_dag.subtitle')}</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.BARO_TIME_MACHINE); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                        <Icon name="history_edu" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('menu.extra.baro_time_machine_title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('menu.extra.baro_time_machine_desc')}</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.BARO_STORYTELLER); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                        <Icon name="auto_stories" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('menu.extra.baro_storyteller_title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('menu.extra.baro_storyteller_desc')}</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.SONG_WRITER); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400">
                                        <Icon name="music_note" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('menu.extra.song_writer_title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('menu.extra.song_writer_desc')}</span>
                                    </div>
                                </button>

                                {/* This Day (Moved from Bottom Bar) */}
                                <button onClick={() => { navigate(ViewState.THIS_DAY); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                        <Icon name="calendar_today" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('this_day.title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('this_day.subtitle')}</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.AMBIENT); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                                        <Icon name="fireplace" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('menu.extra.ambient_title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('menu.extra.ambient_desc')}</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.CLIMATE_CHANGE); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                                        <Icon name="thermostat" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('climate.title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('climate.subtitle')}</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.BAROMETER); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                        <Icon name="speed" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('barometer.title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('barometer.subtitle')}</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.HOLIDAY); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400">
                                        <Icon name="beach_access" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('holiday.planner_title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">Plan je vakantie met weerdata</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.HOLIDAY_REPORT); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                        <Icon name="flight_takeoff" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('holiday_report.title_default')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('holiday_report.menu_subtitle')}</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.TRIP_PLANNER); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                        <Icon name="timer" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('trip_planner.title')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('trip_planner.subtitle')}</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.STRAVA); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                                        <Icon name="directions_bike" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('nav.strava')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('share.strava')}</span>
                                    </div>
                                </button>

                                <button onClick={() => { navigate(ViewState.SHARE); setExtraMenuOpen(false); }} className="w-full flex items-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-3 md:gap-4 transition-colors border border-border-color text-left group">
                                    <div className="size-10 md:size-12 flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                        <Icon name="add_a_photo" className="text-xl md:text-2xl" />
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 flex-1">
                                        <span className="font-bold text-base md:text-lg truncate w-full text-text-main">{t('share.photo_weather')}</span>
                                        <span className="text-xs text-text-muted text-left line-clamp-1">{t('share.title')}</span>
                                    </div>
                                </button>
                             </div>
                        </section>
                    </div>

                    <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 relative text-xs font-medium text-text-muted">
                         <button onClick={() => setModal('disclaimer')} className="hover:text-text-main transition-colors hover:underline">{t('footer.disclaimer')}</button>
                         <button onClick={() => setModal('cookies')} className="hover:text-text-main transition-colors hover:underline">{t('footer.cookies')}</button>
                         <span className="md:absolute md:right-0 md:top-0">v{appVersion}</span>
                    </div>
                </div>
            </div>
        )}

        {/* Hamburger Menu Overlay */}
        {menuOpen && (
            <div className="fixed inset-0 z-[1500] bg-bg-page/60 backdrop-blur-sm animate-in fade-in" onClick={() => setMenuOpen(false)}>
                <div 
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-5xl bg-bg-card rounded-t-[32px] p-4 md:p-6 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 border-t border-border-color shadow-2xl no-scrollbar" 
                    style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="w-12 h-1.5 bg-border-color rounded-full mx-auto mb-6 sticky top-0" />
                    
                    <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6 md:mb-8">
                         <button onClick={() => { navigate(ViewState.SETTINGS); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-border-color">
                            <div className="size-10 rounded-full bg-slate-100 dark:bg-slate-500/20 flex items-center justify-center text-slate-600 dark:text-slate-400">
                                <Icon name="settings" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm text-text-main">{t('nav.settings')}</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.FAQ); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-border-color">
                            <div className="size-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                <Icon name="help" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm text-text-main">Ask Baro</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.TEAM); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-border-color">
                            <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <Icon name="groups" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm text-text-main">{t('nav.team')}</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.PRICING); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-border-color">
                            <div className="size-10 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400">
                                <Icon name="payments" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm text-text-main">{t('nav.pricing')}</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.MODEL_INFO); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-border-color">
                            <div className="size-10 rounded-full bg-cyan-100 dark:bg-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                                <Icon name="model_training" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm text-text-main">{t('nav.model_info')}</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.INFO); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-border-color">
                            <div className="size-10 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                <Icon name="info" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm text-text-main">{t('nav.info')}</span>
                         </button>
                         <button onClick={() => { navigate(ViewState.USER_ACCOUNT); setMenuOpen(false); }} className="flex flex-col items-center justify-center bg-bg-page hover:bg-bg-page/80 p-3 md:p-4 rounded-2xl gap-2 transition-colors border border-border-color">
                            <div className="size-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                <Icon name="account_circle" className="text-xl" />
                            </div>
                            <span className="font-bold text-sm text-text-main">{t('nav.user_account')}</span>
                         </button>
                    </div>
                    
                    {sessionExpiry && (
                         <div className="text-center mb-8">
                            
                         </div>
                    )}
                    
                    <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 relative text-xs font-medium text-text-muted">
                         <button onClick={() => setModal('disclaimer')} className="hover:text-text-main transition-colors hover:underline">{t('footer.disclaimer')}</button>
                         <button onClick={() => setModal('cookies')} className="hover:text-text-main transition-colors hover:underline">{t('footer.cookies')}</button>
                         <span className="md:absolute md:right-0 md:top-0">v{appVersion}</span>
                    </div>
                </div>
            </div>
        )}

        {/* Modals */}
        {modal && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-bg-page/60 backdrop-blur-sm animate-in fade-in" onClick={closeModal}>
                <div className="bg-bg-card border border-border-color rounded-3xl p-6 max-w-md w-full shadow-2xl relative text-text-main" onClick={e => e.stopPropagation()}>
                    <button onClick={closeModal} className="absolute top-4 right-4 text-text-muted hover:text-text-main">
                        <Icon name="close" />
                    </button>
                    
                    {modal === 'disclaimer' && (
                        <>
                            <h3 className="text-xl font-bold mb-4">{t('footer.disclaimer_title')}</h3>
                            <div className="space-y-4 text-sm text-text-muted">
                                <p>{t('footer.text_weather')}</p>
                                <p>{t('footer.text_strava')}</p>
                                <p>{t('footer.text_liability')}</p>
                            </div>
                        </>
                    )}

                    {modal === 'cookies' && (
                        <>
                            <h3 className="text-xl font-bold mb-4">{t('footer.cookies_title')}</h3>
                            <div className="space-y-4 text-sm text-text-muted">
                                <p>{t('footer.text_privacy')}</p>
                                <p>{t('footer.text_storage')}</p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}

        {/* Limit Reached Modal - Replaced by Banner */}
        {import.meta.env.PROD && <ReloadPrompt />}
        
        <CreditMonitor currentView={currentView} onNavigate={navigate} settings={settings} />
    </div>
    </RadioProvider>
  );
};

export default App;
