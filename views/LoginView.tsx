
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { loadSettings, saveSettings } from '../services/storageService';
import { AppLanguage } from '../types';
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
  hero: '/images/landing/hero-weather.jpg',        // Large hero background or visual
  ensemble: '/images/landing/ensemble-chart.png',  // Screenshot of ensemble chart
  history: '/images/landing/history-graph.png',    // Screenshot of history view
  activities: '/images/landing/activities.jpg',    // Collage of biking/running/etc
  models: {
    ecmwf: '/images/logos/ecmwf.png',
    gfs: '/images/logos/gfs.png',
    icon: '/images/logos/dwd.png',
    meteofrance: '/images/logos/meteofrance.png'
  }
};

export const LoginView: React.FC = () => {
  const { signInWithGoogle, signInWithProvider } = useAuth();
  const [lang, setLang] = useState<AppLanguage>('en');
  const [scrolled, setScrolled] = useState(false);

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

  const toggleLanguage = () => {
    const newLang = lang === 'nl' ? 'en' : 'nl';
    setLang(newLang);
    const currentSettings = loadSettings();
    saveSettings({ ...currentSettings, language: newLang });
  };

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
      alert("Coming soon!");
  };

  const FeatureCard = ({ icon, title, desc, colorClass, delay, image }: { icon: string, title: string, desc: string, colorClass: string, delay: string, image?: string }) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
      green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
      orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
    };

    return (
      <div 
          className="group relative bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 border border-slate-100 dark:border-white/5 overflow-hidden"
          style={{ animationDelay: delay }}
      >
          {/* Optional Background Image Overlay on Hover */}
          {image && (
              <div 
                  className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-700 bg-cover bg-center"
                  style={{ backgroundImage: `url(${image})` }}
              />
          )}

        <div className={`w-14 h-14 rounded-2xl ${colors[colorClass]} flex items-center justify-center mb-6 text-2xl group-hover:scale-110 transition-transform duration-500 relative z-10`}>
          <Icon name={icon} />
        </div>
        <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white relative z-10">{title}</h3>
        <p className="text-slate-500 dark:text-slate-400 leading-relaxed relative z-10">{desc}</p>
        
        {/* Decorative gradient blob */}
        <div className={`absolute -bottom-8 -right-8 w-32 h-32 rounded-full opacity-10 blur-2xl transition-all duration-700 group-hover:scale-150 ${colorClass === 'blue' ? 'bg-blue-500' : colorClass === 'purple' ? 'bg-purple-500' : colorClass === 'green' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
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
              <div className="size-10 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30 transform hover:rotate-12 transition-transform duration-300">
                <Icon name="cloud" className="text-2xl" />
              </div>
              <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300">
                EdwinWeer
              </span>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleLanguage}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-all text-sm font-medium border border-transparent hover:border-slate-300 dark:hover:border-white/20"
              >
                <Icon name="language" className="text-lg" />
                <span>{lang.toUpperCase()}</span>
              </button>
              
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider mb-8 border border-blue-100 dark:border-blue-500/20 shadow-sm hover:shadow-md transition-shadow cursor-default animate-fade-in-down">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            v2.0 Professional
          </div>
          
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
          <div className="mt-24 relative mx-auto max-w-6xl perspective-1000 animate-fade-in-up delay-300">
             {/* Main Dashboard Image Placeholder */}
             <div className="relative bg-slate-900 rounded-2xl shadow-2xl border-4 border-slate-200 dark:border-slate-700 overflow-hidden transform rotate-x-12 hover:rotate-x-0 transition-transform duration-700 ease-out group">
                <div className="aspect-[16/9] bg-gradient-to-br from-slate-800 to-slate-900 relative flex items-center justify-center">
                    {/* Placeholder content if no image */}
                    <div className="text-center p-10">
                        <Icon name="dashboard" className="text-6xl text-blue-500 mb-4 mx-auto" />
                        <h3 className="text-2xl font-bold text-white mb-2">Interactive Dashboard</h3>
                        <p className="text-slate-400">Place 'hero-weather.jpg' in /public/images/landing/</p>
                    </div>
                    {/* Overlay Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent"></div>
                </div>
                
                {/* Floating Elements */}
                <div className="absolute -right-10 top-10 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl border border-slate-100 dark:border-white/10 transform translate-x-8 group-hover:translate-x-4 transition-transform duration-500">
                    <div className="flex items-center gap-3">
                        <div className="bg-orange-100 dark:bg-orange-900/50 p-2 rounded-lg text-orange-500"><Icon name="sunny" /></div>
                        <div>
                            <p className="text-xs text-slate-500">UV Index</p>
                            <p className="font-bold">8.2 (High)</p>
                        </div>
                    </div>
                </div>

                <div className="absolute -left-10 bottom-20 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl border border-slate-100 dark:border-white/10 transform -translate-x-8 group-hover:-translate-x-4 transition-transform duration-500">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg text-blue-500"><Icon name="water_drop" /></div>
                        <div>
                            <p className="text-xs text-slate-500">Precipitation</p>
                            <p className="font-bold">0.0 mm</p>
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
                Everything you need to plan your day, week, or month with confidence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard 
                icon="stacked_line_chart" 
                title={t('landing.feature_ensemble')} 
                desc={t('landing.feature_ensemble_desc')}
                colorClass="blue"
                delay="0ms"
            />
            <FeatureCard 
                icon="history" 
                title={t('landing.feature_history')} 
                desc={t('landing.feature_history_desc')}
                colorClass="purple"
                delay="100ms"
            />
            <FeatureCard 
                icon="directions_bike" 
                title={t('landing.feature_activities')} 
                desc={t('landing.feature_activities_desc')}
                colorClass="green"
                delay="200ms"
            />
            <FeatureCard 
                icon="auto_awesome" 
                title={t('landing.feature_ai')} 
                desc={t('landing.feature_ai_desc')}
                colorClass="orange"
                delay="300ms"
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

      {/* Footer */}
      <footer className="py-12 bg-slate-900 text-white border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
                <Icon name="cloud" className="text-blue-400" />
                <span className="font-bold">EdwinWeer</span>
            </div>
            <p className="text-slate-400 text-sm">
                {t('landing.copyright')}
            </p>
            <div className="flex gap-6 text-sm text-slate-400">
                <a href="#" className="hover:text-white transition-colors">Privacy</a>
                <a href="#" className="hover:text-white transition-colors">Terms</a>
                <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>
        </div>
      </footer>
    </div>
  );
};
