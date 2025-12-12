
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { loadSettings, saveSettings } from '../services/storageService';
import { AppLanguage } from '../types';

export const LoginView: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [lang, setLang] = useState<AppLanguage>('en');

  useEffect(() => {
    // Load initial language preference
    const settings = loadSettings();
    if (settings && settings.language) {
      setLang(settings.language);
    }
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white overflow-x-hidden selection:bg-blue-500 selection:text-white font-sans">
      
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="size-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                <Icon name="cloud" className="text-xl" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-400 dark:to-cyan-300">
                EdwinWeer
              </span>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleLanguage}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-sm font-medium"
              >
                <Icon name="language" className="text-lg" />
                <span>{lang.toUpperCase()}</span>
              </button>
              
              <button 
                onClick={handleLogin}
                className="hidden md:flex items-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-5 py-2 rounded-full font-semibold hover:opacity-90 transition-opacity text-sm"
              >
                {t('landing.login_google')}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Background Blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none z-0">
            <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-pulse delay-700"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wide mb-6 border border-blue-100 dark:border-blue-500/20">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
            v2.0 Now Available
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
            {t('landing.hero_title')}
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
            {t('landing.hero_desc')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={handleLogin}
              className="w-full sm:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-500/20 transition-all transform hover:scale-105 flex items-center justify-center gap-3"
            >
              <Icon name="rocket_launch" />
              {t('landing.start')}
            </button>
          </div>

          {/* Hero Visual/Mockup */}
          <div className="mt-20 relative mx-auto max-w-5xl">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/5 p-4 md:p-8 transform rotate-1 hover:rotate-0 transition-transform duration-500">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Mock Weather Card */}
                  <div className="bg-blue-500 rounded-xl p-6 text-white flex flex-col justify-between h-48">
                     <div className="flex justify-between items-start">
                        <div>
                            <p className="font-medium opacity-80">Amsterdam</p>
                            <h3 className="text-4xl font-bold mt-1">18°</h3>
                        </div>
                        <Icon name="partly_cloudy_day" className="text-4xl" />
                     </div>
                     <div>
                        <div className="flex gap-2 text-sm opacity-90 mb-2">
                           <span className="flex items-center gap-1"><Icon name="water_drop" className="text-xs"/> 40%</span>
                           <span className="flex items-center gap-1"><Icon name="air" className="text-xs"/> 12 km/h</span>
                        </div>
                        <p className="text-sm font-medium">Partly cloudy throughout the day.</p>
                     </div>
                  </div>

                  {/* Mock Chart */}
                  <div className="md:col-span-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-100 dark:border-white/5 flex flex-col justify-center items-center relative overflow-hidden">
                     <div className="absolute inset-0 flex items-end justify-between px-6 pb-6 opacity-30">
                        <div className="w-4 h-12 bg-blue-500 rounded-t-lg"></div>
                        <div className="w-4 h-16 bg-blue-500 rounded-t-lg"></div>
                        <div className="w-4 h-10 bg-blue-500 rounded-t-lg"></div>
                        <div className="w-4 h-24 bg-blue-500 rounded-t-lg"></div>
                        <div className="w-4 h-20 bg-blue-500 rounded-t-lg"></div>
                        <div className="w-4 h-14 bg-blue-500 rounded-t-lg"></div>
                        <div className="w-4 h-8 bg-blue-500 rounded-t-lg"></div>
                     </div>
                     <div className="z-10 text-center">
                        <Icon name="ssid_chart" className="text-5xl text-blue-500 mb-2" />
                        <h4 className="font-bold text-lg">{t('landing.feature_ensemble')}</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Visualized 50+ Models</p>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-white dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            
            {/* Feature 1: Ensemble */}
            <div className="group p-8 rounded-3xl bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 hover:shadow-xl transition-all duration-300 border border-slate-100 dark:border-white/5">
              <div className="size-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Icon name="stacked_line_chart" className="text-3xl" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('landing.feature_ensemble')}</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                {t('landing.feature_ensemble_desc')}
              </p>
            </div>

            {/* Feature 2: History */}
            <div className="group p-8 rounded-3xl bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 hover:shadow-xl transition-all duration-300 border border-slate-100 dark:border-white/5">
              <div className="size-14 rounded-2xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Icon name="history" className="text-3xl" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('landing.feature_history')}</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                {t('landing.feature_history_desc')}
              </p>
            </div>

            {/* Feature 3: Activities */}
            <div className="group p-8 rounded-3xl bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 hover:shadow-xl transition-all duration-300 border border-slate-100 dark:border-white/5">
              <div className="size-14 rounded-2xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Icon name="directions_bike" className="text-3xl" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('landing.feature_activities')}</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                {t('landing.feature_activities_desc')}
              </p>
            </div>

            {/* Feature 4: AI */}
            <div className="group p-8 rounded-3xl bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 hover:shadow-xl transition-all duration-300 border border-slate-100 dark:border-white/5">
              <div className="size-14 rounded-2xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Icon name="auto_awesome" className="text-3xl" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('landing.feature_ai')}</h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                {t('landing.feature_ai_desc')}
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-white/5 text-center text-slate-500 dark:text-slate-500 text-sm">
        <p>&copy; {new Date().getFullYear()} EdwinWeer. Powered by Open-Meteo & AI.</p>
      </footer>
    </div>
  );
};
