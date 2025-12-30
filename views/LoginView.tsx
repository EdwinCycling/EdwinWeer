
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';
import { FlagIcon } from '../components/FlagIcon';
import { Modal } from '../components/Modal';
import { getTranslation } from '../services/translations';
import { useScrollLock } from '../hooks/useScrollLock';
import { loadSettings, saveSettings } from '../services/storageService';
import { AppLanguage, ViewState } from '../types';
import { twitterProvider, facebookProvider, microsoftProvider } from '../services/firebase';

  /* 
  PLACEHOLDER IMAGES GUIDE
  ------------------------
  To replace the placeholders with real images, place files in your public folder 
  (e.g., /public/images/landing/) and update the paths below.
  
  REQUIRED ASSETS:
  1. hero-weather.jpg - High quality atmospheric weather photo (dark/stormy or sunny/blue sky)
  2. ensemble-chart.png - Screenshot of the ensemble graph view
  3. history-graph.png - Screenshot of the historical comparison view
  4. activities.jpg - Collage or single photo of outdoor activities (cycling, running)
  */
  const IMAGES = {
  hero: '/landing/hero-weather.jpg',        // Large hero background or visual
  ensemble: '/landing/ensemble-chart.png',  // Screenshot of ensemble chart
  history: '/landing/inzichten.png',    // Screenshot of history view
  activities: '/landing/vakantie-weer-planner.png',    // Collage of biking/running/etc
  personalized: '/landing/baro weerbericht.jpg',     // Personalized AI report image
  models: {
    ecmwf: '/images/logos/ecmwf.png',
    gfs: '/images/logos/gfs.png',
    icon: '/images/logos/dwd.png',
    meteofrance: '/images/logos/meteofrance.png'
  }
};

interface Props {
  onNavigate: (view: ViewState) => void;
}

export const LoginView: React.FC<Props> = ({ onNavigate }) => {
  const { signInWithGoogle, signInWithProvider } = useAuth();
  const [lang, setLang] = useState<AppLanguage>('en');
  const [langOpen, setLangOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [providerModalOpen, setProviderModalOpen] = useState(false);

  useScrollLock(providerModalOpen);

  const languages: { code: AppLanguage; label: string }[] = [
      { code: 'nl', label: 'NL' },
      { code: 'en', label: 'EN' },
      { code: 'fr', label: 'FR' },
      { code: 'de', label: 'DE' },
      { code: 'es', label: 'ES' },
  ];

  useEffect(() => {
    // Load initial language preference
    const settings = loadSettings();
    if (settings && settings.language) {
      setLang(settings.language);
    }

    const handleScroll = () => {
        setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const t = (key: string) => getTranslation(key, lang);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleSocialLogin = async (provider: any) => {
      // Temporary popup for other providers
      setProviderModalOpen(true);
  };

  const FeatureSection = ({ icon, title, desc, image, reversed }: { icon: string, title: string, desc: string, image: string, reversed?: boolean }) => {
    return (
      <div className={`flex flex-col lg:flex-row items-center gap-12 py-16 ${reversed ? 'lg:flex-row-reverse' : ''}`}>
          <div className="flex-1 w-full perspective-1000 group">
             <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700 transform transition-transform duration-700 hover:rotate-y-2 hover:scale-[1.02] bg-slate-800">
                <img 
                    src={image} 
                    alt={title} 
                    className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity" 
                />
                <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-2xl"></div>
                {/* Glare effect */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
             </div>
          </div>
          <div className="flex-1 text-left">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mb-6 shadow-lg shadow-blue-500/10">
                  <Icon name={icon} className="text-3xl" />
              </div>
              <h3 className="text-3xl md:text-4xl font-bold mb-6 text-slate-900 dark:text-white leading-tight">{title}</h3>
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed mb-8">
                  {desc}
              </p>
              <button onClick={handleLogin} className="group flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold hover:gap-3 transition-all">
                  {t('landing.start')} <Icon name="arrow_forward" />
              </button>
          </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white overflow-x-hidden selection:bg-blue-500 selection:text-white font-sans">
      
      {/* Navbar */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img src="/icons/baro-icon-192.png" alt="Baro Logo" className="size-10 rounded-xl shadow-lg shadow-blue-500/30 transform hover:rotate-12 transition-transform duration-300" />
              <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300">
                Baro
              </span>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <button 
                  onClick={() => setLangOpen(!langOpen)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-all text-sm font-medium border border-transparent hover:border-slate-300 dark:hover:border-white/20"
                >
                  <FlagIcon countryCode={lang} className="w-6 h-4 rounded-sm shadow-sm" />
                  <span>{lang.toUpperCase()}</span>
                  <Icon name="expand_more" className="text-sm" />
                </button>
                
                {langOpen && (
                    <div className="absolute top-full right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-white/10 p-2 min-w-[150px] z-50 animate-fade-in-up">
                        {languages.map(l => (
                            <button 
                                key={l.code}
                                onClick={() => {
                                    setLang(l.code);
                                    const currentSettings = loadSettings();
                                    saveSettings({ ...currentSettings, language: l.code });
                                    setLangOpen(false);
                                }}
                                className={`flex items-center gap-3 w-full p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-left transition-colors ${lang === l.code ? 'bg-slate-50 dark:bg-white/5' : ''}`}
                            >
                                <FlagIcon countryCode={l.code} className="w-6 h-4 rounded-sm shadow-sm" />
                                <span className="font-medium text-slate-700 dark:text-white">{l.label}</span>
                                {lang === l.code && <Icon name="check" className="ml-auto text-blue-500 text-sm" />}
                            </button>
                        ))}
                    </div>
                )}
              </div>
              
              <button 
                onClick={handleLogin}
                className="hidden md:flex items-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2.5 rounded-full font-bold hover:opacity-90 transition-all hover:shadow-lg hover:scale-105 active:scale-95"
              >
                <Icon name="login" />
                {t('landing.login_google')}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-32 lg:pt-56 lg:pb-40 overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
             <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-400/20 rounded-full blur-[100px] animate-pulse"></div>
             <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-400/20 rounded-full blur-[100px] animate-pulse delay-1000"></div>
             <div className="absolute top-[40%] left-[20%] w-[300px] h-[300px] bg-cyan-400/10 rounded-full blur-[80px] animate-bounce duration-[5000ms]"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-8 leading-tight animate-fade-in-up">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-800 to-slate-900 dark:from-white dark:via-blue-200 dark:to-white">
                {t('landing.hero_title')}
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto mb-12 leading-relaxed animate-fade-in-up delay-100">
            {t('landing.hero_desc')}
          </p>

          <div className="flex flex-col items-center justify-center gap-8 animate-fade-in-up delay-200">
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button 
                onClick={handleLogin}
                className="group relative px-6 py-4 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl font-bold text-lg shadow-xl shadow-slate-200/50 transition-all transform hover:scale-105 hover:-translate-y-1 active:translate-y-0 overflow-hidden border border-slate-200"
              >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-slate-400/10 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
                <span className="flex items-center gap-2 relative z-10">
                  <Icon name="rocket_launch" className="text-blue-600" />
                  Google
                </span>
              </button>

              <button onClick={() => handleSocialLogin(twitterProvider)} className="px-6 py-4 bg-[#1DA1F2] hover:bg-[#1a94df] text-white rounded-2xl font-bold text-lg shadow-xl shadow-[#1DA1F2]/30 transition-all transform hover:scale-105 hover:-translate-y-1 active:translate-y-0 flex items-center gap-2">
                 <Icon name="flutter_dash" /> Twitter
              </button>

              <button onClick={() => handleSocialLogin(facebookProvider)} className="px-6 py-4 bg-[#1877F2] hover:bg-[#166fe5] text-white rounded-2xl font-bold text-lg shadow-xl shadow-[#1877F2]/30 transition-all transform hover:scale-105 hover:-translate-y-1 active:translate-y-0 flex items-center gap-2">
                 <Icon name="facebook" /> Facebook
              </button>
              
              <button onClick={() => handleSocialLogin(microsoftProvider)} className="px-6 py-4 bg-[#2F2F2F] hover:bg-[#252525] text-white rounded-2xl font-bold text-lg shadow-xl shadow-[#2F2F2F]/30 transition-all transform hover:scale-105 hover:-translate-y-1 active:translate-y-0 flex items-center gap-2">
                 <Icon name="window" /> Microsoft
              </button>
            </div>
            
            <a href="#features" className="px-8 py-4 bg-transparent text-slate-500 dark:text-slate-400 font-bold text-lg hover:text-slate-800 dark:hover:text-white transition-all transform hover:scale-105 flex items-center gap-2">
                {t('landing.cta_title') || 'Learn More'}
                <Icon name="arrow_downward" className="text-sm" />
            </a>
          </div>

          {/* Hero Dashboard Visual Mockup */}
          <div className="mt-24 relative mx-auto max-w-6xl">
             <div className="relative group transition-all duration-500 hover:scale-[1.01]">
                {/* Main Dashboard Image Placeholder */}
                <div className="relative bg-slate-900 rounded-2xl shadow-2xl border-4 border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="aspect-[16/9] bg-slate-900 relative flex items-center justify-center overflow-hidden">
                        <img 
                            src={IMAGES.hero} 
                            alt="Weather Dashboard" 
                            className="w-full h-full object-cover opacity-90 transition-transform duration-700"
                        />
                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent"></div>
                    </div>
                </div>
                
                {/* Floating Elements - Scattered Data Points */}
                
                {/* 1. UV Index (Top Right) */}
                <div className="absolute -right-4 md:-right-10 top-10 bg-white dark:bg-slate-800 p-3 md:p-4 rounded-xl shadow-xl border border-slate-100 dark:border-white/10 transform translate-x-0 hover:-translate-y-2 transition-transform duration-500 z-10 hidden sm:block animate-fade-in-up delay-300">
                    <div className="flex items-center gap-3">
                        <div className="bg-orange-100 dark:bg-orange-900/50 p-2 rounded-lg text-orange-500"><Icon name="sunny" /></div>
                        <div>
                            <p className="text-xs text-slate-500">{t('share.fields.uv_index') || 'UV Index'}</p>
                            <p className="font-bold">8.2 (High)</p>
                        </div>
                    </div>
                </div>

                {/* 2. Precipitation (Bottom Left) */}
                <div className="absolute -left-4 md:-left-10 bottom-20 bg-white dark:bg-slate-800 p-3 md:p-4 rounded-xl shadow-xl border border-slate-100 dark:border-white/10 transform translate-x-0 hover:-translate-y-2 transition-transform duration-500 z-10 hidden sm:block animate-fade-in-up delay-500">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg text-blue-500"><Icon name="water_drop" /></div>
                        <div>
                            <p className="text-xs text-slate-500">{t('precipitation') || 'Precipitation'}</p>
                            <p className="font-bold">0.0 mm</p>
                        </div>
                    </div>
                </div>

                {/* 3. Temperature (Top Left) */}
                <div className="absolute left-4 md:-left-6 top-32 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-slate-100 dark:border-white/10 transform hover:scale-105 transition-all duration-300 z-10 hidden md:block animate-fade-in-up delay-200">
                     <div className="flex items-center gap-3">
                        <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-lg text-red-500"><Icon name="thermostat" /></div>
                        <div>
                            <p className="text-xs text-slate-500">{t('share.fields.temp') || 'Temperature'}</p>
                            <p className="font-bold text-lg">22.5°C</p>
                        </div>
                    </div>
                </div>

                {/* 4. Wind (Bottom Right) */}
                <div className="absolute right-10 md:-right-8 bottom-32 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-slate-100 dark:border-white/10 transform hover:scale-105 transition-all duration-300 z-10 hidden md:block animate-fade-in-up delay-400">
                     <div className="flex items-center gap-3">
                        <div className="bg-teal-100 dark:bg-teal-900/30 p-2 rounded-lg text-teal-500"><Icon name="air" /></div>
                        <div>
                            <p className="text-xs text-slate-500">{t('wind') || 'Wind'}</p>
                            <p className="font-bold">18 km/h SW</p>
                        </div>
                    </div>
                </div>

                 {/* 5. Pressure (Center Top) */}
                <div className="absolute left-1/2 -translate-x-1/2 top-6 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-2 px-4 rounded-full shadow-lg border border-slate-100 dark:border-white/10 transform hover:scale-105 transition-all duration-300 z-10 hidden lg:flex items-center gap-2 animate-fade-in-up delay-600">
                    <Icon name="compress" className="text-purple-500 text-sm" />
                    <span className="text-sm font-bold">1012 hPa</span>
                </div>
                
                {/* 6. Visibility (Center Bottom) */}
                 <div className="absolute left-1/4 bottom-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-2 px-4 rounded-xl shadow-lg border border-slate-100 dark:border-white/10 transform hover:scale-105 transition-all duration-300 z-10 hidden lg:block animate-fade-in-up delay-700">
                     <div className="flex items-center gap-2">
                        <Icon name="visibility" className="text-slate-500 text-lg" />
                         <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold">{t('visibility') || 'Visibility'}</p>
                            <p className="text-sm font-bold">10+ km</p>
                        </div>
                    </div>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 bg-slate-50 dark:bg-slate-900/50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">{t('detail_title')}</h2>
            <p className="text-xl text-slate-500 dark:text-slate-400">
                {t('landing.features_intro')}
            </p>
          </div>

          <div className="space-y-12">
            <FeatureSection 
                icon="stacked_line_chart" 
                title={t('landing.feature_ensemble')} 
                desc={t('landing.feature_ensemble_desc')}
                image={IMAGES.ensemble}
            />
            
            <FeatureSection 
                icon="history" 
                title={t('landing.feature_history')} 
                desc={t('landing.feature_history_desc')}
                image={IMAGES.history}
                reversed={true}
            />
            
            <FeatureSection 
                icon="directions_bike" 
                title={t('landing.feature_activities')} 
                desc={t('landing.feature_activities_desc')}
                image={IMAGES.activities}
            />

            <FeatureSection 
                icon="auto_awesome" 
                title={t('landing.feature_personalized') || 'Persoonlijke Weerberichten'} 
                desc={t('landing.feature_personalized_desc') || 'Ontvang unieke, door AI geschreven weerberichten die precies zijn afgestemd op jouw locatie, datum en persoonlijke activiteitenprofiel.'}
                image={IMAGES.personalized}
                reversed={true}
            />
          </div>
        </div>
      </section>

      {/* Models Section */}
      <section className="py-24 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
             <h2 className="text-3xl font-bold mb-12">{t('landing.models_title')}</h2>
             <div className="flex flex-wrap justify-center items-center gap-12 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
                {/* Placeholders for Model Logos */}
                {['ECMWF', 'GFS', 'ICON', 'METEO FRANCE', 'GEM', 'UKMO'].map((model) => (
                    <div key={model} className="text-2xl font-black text-slate-300 dark:text-slate-600 hover:text-slate-800 dark:hover:text-white transition-colors cursor-default">
                        {model}
                    </div>
                ))}
             </div>
             <p className="mt-8 text-slate-500">{t('landing.models_desc')}</p>
        </div>
      </section>

      {/* Privacy / Security Badge Section */}
      <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
          <div className="max-w-4xl mx-auto px-4 text-center">
              <div className="inline-flex items-center justify-center p-4 bg-green-100 dark:bg-green-900/20 rounded-full text-green-600 dark:text-green-400 mb-6">
                  <Icon name="security" className="text-3xl" />
              </div>
              <h2 className="text-3xl font-bold mb-4">{t('landing.privacy_title')}</h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
                  {t('landing.privacy_desc')}
              </p>
              <div className="flex justify-center gap-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1"><Icon name="check_circle" className="text-green-500" /> GDPR Compliant</span>
                  <span className="flex items-center gap-1"><Icon name="check_circle" className="text-green-500" /> No Ads</span>
                  <span className="flex items-center gap-1"><Icon name="check_circle" className="text-green-500" /> Encrypted</span>
              </div>
          </div>
      </section>

      {/* Ask Baro FAQ Section */}
      <section className="py-24 bg-gradient-to-br from-indigo-900 to-blue-900 text-white relative overflow-hidden">
          {/* Background blobs */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2"></div>

          <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
              <div className="inline-flex items-center justify-center p-4 bg-white/10 backdrop-blur-md rounded-2xl mb-8 border border-white/10 shadow-xl">
                  <Icon name="help" className="text-4xl text-indigo-300" />
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">Ask Baro</h2>
              <p className="text-xl text-indigo-100 mb-10 max-w-2xl mx-auto leading-relaxed">
                  {t('landing.faq_desc') || 'Heb je vragen over de app? Wij hebben de antwoorden. Ontdek alles over functies, modellen en meer.'}
              </p>
              <button 
                  onClick={() => onNavigate(ViewState.FAQ)}
                  className="inline-flex items-center gap-3 px-8 py-4 bg-white text-indigo-900 rounded-2xl font-bold text-lg hover:bg-indigo-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
              >
                  {t('landing.faq_button') || 'Ga naar FAQ'} <Icon name="arrow_forward" />
              </button>
          </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-slate-900 text-white border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
                <img src="/icons/baro-icon-192.png" alt="Baro Logo" className="size-6 rounded-lg" />
                <span className="font-bold">Baro</span>
            </div>
            <p className="text-slate-400 text-sm">
                {t('landing.copyright')}
            </p>
            <div className="flex gap-6 text-sm text-slate-400">
            </div>
        </div>
      </footer>

      {/* Provider Coming Soon Modal */}
      <Modal 
          isOpen={providerModalOpen} 
          onClose={() => setProviderModalOpen(false)}
          title="Coming Soon"
      >
          <div className="text-center p-4">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 dark:text-blue-400">
                  <Icon name="rocket_launch" className="text-3xl" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">
                  Provider Integration Underway
              </h3>
              <p className="text-slate-600 dark:text-slate-300 mb-6">
                  We are currently integrating this login provider. Please use Google Login for now.
              </p>
              <button 
                  onClick={() => setProviderModalOpen(false)}
                  className="w-full py-3 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:opacity-90 transition-all"
              >
                  Got it
              </button>
          </div>
      </Modal>
    </div>
  );
};
