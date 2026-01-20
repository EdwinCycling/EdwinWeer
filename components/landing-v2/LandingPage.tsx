import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { CloudSun, Brain, Activity, Calendar, Wind, Sparkles, 
  TrendingUp, Clock, Globe, Zap, MessageCircle, Smartphone,
  Star, Music, Database, Palette, Bell, Map, ArrowRight, History } from "lucide-react";
import { Button } from "./ui/button";
import { FloatingWeatherIcons } from "./FloatingWeatherIcons";
import { AnimatedGradientOrb } from "./AnimatedGradientOrb";
import { DynamicWeatherEffect } from "./DynamicWeatherEffect";
import { ParticleField } from "./ParticleField";
import { WeatherPhotoShowcase } from "./WeatherPhotoShowcase";

// Imports for Navbar (from existing project)
import { useAuth } from "../../hooks/useAuth";
import { Icon } from "../../components/Icon";
import { FlagIcon } from "../../components/FlagIcon";
import { getTranslation } from "../../services/translations";
import { loadSettings, saveSettings } from "../../services/storageService";
import { AppLanguage, ViewState } from "../../types";
import { twitterProvider, facebookProvider, microsoftProvider, db } from "../../services/firebase";
import { doc, getDoc } from "firebase/firestore";
import { SystemConfig } from "../../types";

interface LandingPageProps {
  onNavigate: (view: ViewState) => void;
}

const IMAGES = {
  hero: '/landing/hero-weather.jpg',
  ensemble: '/landing/ensemble-chart.png',
  history: '/landing/inzichten.png',
  activities: '/landing/vakantie-weer-planner.png',
  personalized: '/landing/baro weerbericht.jpg',
  models: {
    ecmwf: '/images/logos/ecmwf.png',
    gfs: '/images/logos/gfs.png',
    icon: '/images/logos/dwd.png',
    meteofrance: '/images/logos/meteofrance.png'
  }
};

const FeatureSection = ({ icon: Icon, title, desc, image, reversed, onLogin }: { icon: any, title: string, desc: string, image: string, reversed?: boolean, onLogin: () => void }) => (
  <motion.div 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8 }}
      className={`flex flex-col lg:flex-row items-center gap-12 py-24 ${reversed ? 'lg:flex-row-reverse' : ''}`}
  >
      <div className="flex-1 w-full group perspective-1000">
          <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-black/50 border border-white/10 transform transition-transform duration-700 hover:rotate-y-2 hover:scale-[1.02] bg-slate-900/50 backdrop-blur-sm">
          <img 
              src={image} 
              alt={title} 
              className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          </div>
      </div>
      <div className="flex-1 text-left">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 text-blue-400 mb-6 border border-white/10 shadow-lg shadow-blue-500/10 backdrop-blur-md">
              <Icon className="w-8 h-8" />
          </div>
          <h3 className="text-3xl md:text-4xl font-bold mb-6 text-white leading-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              {title}
          </h3>
          <p className="text-lg text-white/60 leading-relaxed mb-8">
              {desc}
          </p>
          <Button 
              onClick={onLogin}
              variant="outline"
              className="group border-white/10 hover:bg-white/10 text-white gap-2 pl-6 pr-4 rounded-full"
          >
              Start Direct <Icon name="arrow_forward" className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Button>
      </div>
  </motion.div>
);

export function LandingPage({ onNavigate }: LandingPageProps) {
  // Navbar State
  const { signInWithGoogle } = useAuth();
  const [lang, setLang] = useState<AppLanguage>('en');
  const [langOpen, setLangOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Load settings
  useEffect(() => {
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
        // Check system config for block
        const docRef = doc(db, 'system', 'config');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const config = docSnap.data() as SystemConfig;
            
            // Check active & disable_app
            // Note: If include_landing_page is true, the overlay prevents clicking anyway.
            // But if include_landing_page is false, the overlay is hidden, so we must block here.
            const isActive = config.active === true || String(config.active).toLowerCase() === 'true';
            const isHardBlock = config.disable_app === true || String(config.disable_app).toLowerCase() === 'true';
            
            if (isActive && isHardBlock) {
                // Check time window
                const now = new Date();
                
                // Helper for CET/CEST offset
                const getCETOffset = (date: Date) => {
                    const year = date.getFullYear();
                    const startDST = new Date(year, 2, 31);
                    startDST.setHours(2, 0, 0, 0);
                    startDST.setDate(31 - startDST.getDay());
                    const endDST = new Date(year, 9, 31);
                    endDST.setHours(3, 0, 0, 0);
                    endDST.setDate(31 - endDST.getDay());
                    return (date >= startDST && date < endDST) ? "+02:00" : "+01:00";
                };

                const parseDate = (dateStr: string | undefined) => {
                    if (!dateStr) return null;
                    try {
                        if (dateStr.includes('Z') || dateStr.includes('+')) {
                            return new Date(dateStr);
                        }
                        const tempDate = new Date(dateStr + "+01:00");
                        const offset = getCETOffset(tempDate);
                        return new Date(dateStr + offset);
                    } catch (e) {
                        return null;
                    }
                };

                const startDate = parseDate(config.start_time);
                const isStarted = !startDate || isNaN(startDate.getTime()) || now >= startDate;

                const endDate = parseDate(config.end_time);
                const isEnded = endDate && !isNaN(endDate.getTime()) && now > endDate;

                if (isStarted && !isEnded) {
                    alert(config.maintenance_message || "De applicatie is momenteel niet beschikbaar wegens onderhoud.");
                    return;
                }
            }
        }

      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const languages: { code: AppLanguage; label: string }[] = [
      { code: 'nl', label: 'NL' },
      { code: 'en', label: 'EN' },
      { code: 'fr', label: 'FR' },
      { code: 'de', label: 'DE' },
      { code: 'es', label: 'ES' },
  ];

  // Data Arrays (Mocked/Inferred)
  const coreFeatures = [
    {
      icon: CloudSun,
      title: t('landing.feature_1_title'),
      description: t('landing.feature_1_desc'),
      baroTouch: t('landing.feature_1_baro'),
      quote: t('landing.feature_1_quote'),
      author: t('landing.feature_1_author'),
      gradient: "from-blue-500 to-cyan-500",
      image: "https://images.unsplash.com/photo-1592210454359-9043f067919b?auto=format&fit=crop&q=80&w=1080",
    },
    {
      icon: TrendingUp,
      title: t('landing.feature_2_title'),
      description: t('landing.feature_2_desc'),
      baroTouch: t('landing.feature_2_baro'),
      quote: t('landing.feature_2_quote'),
      author: t('landing.feature_2_author'),
      gradient: "from-purple-500 to-pink-500",
      image: "https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?auto=format&fit=crop&q=80&w=1080",
    },
    {
        icon: Activity,
        title: t('landing.feature_3_title'),
        description: t('landing.feature_3_desc'),
        baroTouch: t('landing.feature_3_baro'),
        quote: t('landing.feature_3_quote'),
        author: t('landing.feature_3_author'),
        gradient: "from-orange-500 to-red-500",
        image: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&q=80&w=1080",
    },
    {
        icon: Brain,
        title: t('landing.feature_4_title'),
        description: t('landing.feature_4_desc'),
        baroTouch: t('landing.feature_4_baro'),
        quote: t('landing.feature_4_quote'),
        author: t('landing.feature_4_author'),
        gradient: "from-green-500 to-emerald-500",
        image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&q=80&w=1080",
    }
  ];

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 font-sans text-white">
      {/* Background Effects Layer */}
      <AnimatedGradientOrb position={{ x: "-10%", y: "-10%" }} colors={["#6366f1", "#8b5cf6", "#3b82f6"]} size="700px" />
      <AnimatedGradientOrb delay={2} position={{ x: "70%", y: "40%" }} colors={["#3b82f6", "#06b6d4", "#8b5cf6"]} size="600px" />
      <AnimatedGradientOrb delay={4} position={{ x: "30%", y: "80%" }} colors={["#ec4899", "#f97316", "#6366f1"]} size="550px" />
      
      <FloatingWeatherIcons />
      <DynamicWeatherEffect />
      <ParticleField />
      <WeatherPhotoShowcase />

      {/* Content Layer */}
      <div className="relative z-10">
        
        {/* Navbar (Copied & Adapted) */}
        <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-black/30 backdrop-blur-md shadow-lg' : 'bg-transparent'}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-20">
                {/* Logo */}
                <div className="flex items-center gap-3">
                <img src="/icons/baro-icon-192.png" alt="Baro Logo" className="size-10 rounded-xl shadow-lg shadow-blue-500/30 transform hover:rotate-12 transition-transform duration-300" />
                <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                    Baro
                </span>
                </div>

                {/* Right Side Actions */}
                <div className="flex items-center gap-4">
                <div className="relative">
                    <button 
                    onClick={() => setLangOpen(!langOpen)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-all text-sm font-medium border border-white/10 text-white"
                    >
                    <FlagIcon countryCode={lang} className="w-6 h-4 rounded-sm shadow-sm" />
                    <span>{lang.toUpperCase()}</span>
                    <Icon name="expand_more" className="text-sm" />
                    </button>
                    
                    {langOpen && (
                        <div className="absolute top-full right-0 mt-2 bg-slate-900/90 backdrop-blur-xl rounded-xl shadow-xl border border-white/10 p-2 min-w-[150px] z-50">
                            {languages.map(l => (
                                <button 
                                    key={l.code}
                                    onClick={() => {
                                        setLang(l.code);
                                        const currentSettings = loadSettings();
                                        saveSettings({ ...currentSettings, language: l.code });
                                        setLangOpen(false);
                                    }}
                                    className={`flex items-center gap-3 w-full p-2 hover:bg-white/10 rounded-lg text-left transition-colors ${lang === l.code ? 'bg-white/5' : ''} text-white`}
                                >
                                    <FlagIcon countryCode={l.code} className="w-6 h-4 rounded-sm shadow-sm" />
                                    <span className="font-medium">{l.label}</span>
                                    {lang === l.code && <Icon name="check" className="ml-auto text-blue-400 text-sm" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                
                <button 
                    onClick={handleLogin}
                    className="hidden md:flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2.5 rounded-full font-bold hover:opacity-90 transition-all hover:shadow-lg hover:scale-105 active:scale-95 shadow-blue-500/20"
                >
                    <Icon name="login" />
                    {t('landing.login_google')}
                </button>
                </div>
            </div>
            </div>
        </nav>

        {/* 1. Hero Section */}
        <section className="min-h-screen flex items-center justify-center relative pt-20">
            <div className="max-w-7xl mx-auto px-4 text-center">
                <motion.h1 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="text-4xl sm:text-6xl md:text-8xl font-extrabold tracking-tight mb-8 leading-tight"
                >
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                        {t('landing.hero_title_1')}
                    </span>
                    <br />
                    <span className="text-white">
                        {t('landing.hero_title_2')}
                    </span>
                </motion.h1>
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="text-xl md:text-2xl text-white/70 max-w-3xl mx-auto mb-12 leading-relaxed"
                >
                    {t('landing.hero_subtitle')}
                </motion.p>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="flex flex-col sm:flex-row gap-4 justify-center"
                >
                    <button 
                        onClick={handleLogin}
                        className="group relative px-8 py-4 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl font-bold text-lg shadow-xl shadow-white/10 transition-all transform hover:scale-105 hover:-translate-y-1 active:translate-y-0 overflow-hidden border border-slate-200 h-14 flex items-center justify-center"
                    >
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-slate-400/10 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
                        <span className="flex items-center gap-2 relative z-10">
                            <Icon name="rocket_launch" className="text-blue-600" />
                            {t('landing.start_now')}
                        </span>
                    </button>
                    <Button 
                        size="lg" 
                        variant="outline" 
                        className="border-white/20 text-white hover:bg-white/10 text-lg h-14 px-8 rounded-full bg-transparent"
                        onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                    >
                        {t('landing.discover_features')}
                    </Button>
                </motion.div>
            </div>
        </section>

        {/* 2. Core Features Section */}
        <section id="features" className="py-32 px-4">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-4xl md:text-5xl font-bold text-center mb-20 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                    Core Features
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {coreFeatures.map((feature, index) => (
                        <motion.div 
                            key={index}
                            initial={{ opacity: 0, y: 50 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8 hover:bg-white/10 transition-colors group"
                        >
                            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                                <feature.icon className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                            <p className="text-white/70 mb-6 text-lg">{feature.description}</p>
                            <div className="bg-black/20 rounded-xl p-6 border border-white/5">
                                <p className="text-white/90 italic mb-4">"{feature.quote}"</p>
                                <p className="text-sm text-white/50 font-medium">— {feature.author}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>

        {/* Detailed Features Sections */}
        <section className="py-20 px-4 relative">
             <div className="max-w-7xl mx-auto">
                <FeatureSection 
                    icon={TrendingUp}
                    title={t('landing.feature_ensemble')}
                    desc={t('landing.feature_ensemble_desc')}
                    image={IMAGES.ensemble}
                    onLogin={handleLogin}
                />

                <FeatureSection 
                    icon={History}
                    title={t('landing.feature_history')}
                    desc={t('landing.feature_history_desc')}
                    image={IMAGES.history}
                    reversed
                    onLogin={handleLogin}
                />

                <FeatureSection 
                    icon={Activity}
                    title={t('landing.feature_activities')}
                    desc={t('landing.feature_activities_desc')}
                    image={IMAGES.activities}
                    onLogin={handleLogin}
                />

                <FeatureSection 
                    icon={Sparkles}
                    title={t('landing.feature_personalized')}
                    desc={t('landing.feature_personalized_desc')}
                    image={IMAGES.personalized}
                    reversed
                    onLogin={handleLogin}
                />
             </div>
        </section>

        {/* Models Section */}
        <section className="py-24 bg-white/5 backdrop-blur-md border-y border-white/10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                 <h2 className="text-3xl font-bold mb-12 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                    {t('landing.models_title')}
                 </h2>
                 <div className="flex flex-wrap justify-center items-center gap-12 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
                    {['ECMWF', 'GFS', 'ICON', 'METEO FRANCE', 'GEM', 'UKMO'].map((model) => (
                        <div key={model} className="text-2xl font-black text-white/40 hover:text-white transition-colors cursor-default">
                            {model}
                        </div>
                    ))}
                 </div>
                 <p className="mt-8 text-white/50 max-w-2xl mx-auto">
                    {t('landing.models_desc')}
                 </p>
            </div>
        </section>

        {/* 6. Final CTA */}
        <section className="py-32 px-4">
            <div className="max-w-4xl mx-auto text-center bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-xl rounded-3xl p-12 border border-white/10">
                <h2 className="text-4xl md:text-5xl font-bold mb-8">{t('landing.ready_title')}</h2>
                <p className="text-xl text-white/70 mb-12">
                    {t('landing.ready_desc')}
                </p>
                <Button size="lg" className="bg-white text-slate-900 hover:bg-slate-100 text-lg h-14 px-12 rounded-full" onClick={handleLogin}>
                    {t('landing.start_free')}
                </Button>
            </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white/5 backdrop-blur-md rounded-3xl p-12 border border-white/10"
            >
              <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white">{t('landing.faq_title')}</h2>
              <p className="text-white/60 text-lg mb-10">
                {t('landing.faq_desc')}
              </p>
              <Button 
            size="lg" 
            className="bg-white text-slate-900 hover:bg-slate-100 rounded-full"
            onClick={() => onNavigate(ViewState.FAQ)}
        >
            {t('landing.faq_button')}
        </Button>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 bg-slate-950 text-white border-t border-white/10 relative z-10 pb-24 md:pb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                  <img src="/icons/baro-icon-192.png" alt="Baro Logo" className="size-6 rounded-lg" />
                  <span className="text-xl font-bold">Baro</span>
              </div>
              <div className="flex gap-8 text-sm text-white/40">
                  <a href="#" className="hover:text-white transition-colors">Privacy</a>
                  <a href="#" className="hover:text-white transition-colors">Terms</a>
                  <a href="#" className="hover:text-white transition-colors">Cookies</a>
              </div>
              <p className="text-sm text-white/40">
                  © {new Date().getFullYear()} Baro Weather. All rights reserved.
              </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
