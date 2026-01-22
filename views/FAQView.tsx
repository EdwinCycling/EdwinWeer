import React, { useState, useMemo } from 'react';
import { ViewState, AppSettings } from '@/types';
import { Icon } from '@/components/Icon';
import { getTranslation } from '@/services/translations';
import { StaticWeatherBackground } from '@/components/StaticWeatherBackground';
import { AnimatedGradientOrb } from '@/components/landing-v2/AnimatedGradientOrb';
import { FloatingWeatherIcons } from '@/components/landing-v2/FloatingWeatherIcons';
import { DynamicWeatherEffect } from '@/components/landing-v2/DynamicWeatherEffect';
import { ParticleField } from '@/components/landing-v2/ParticleField';
import { WeatherPhotoShowcase } from '@/components/landing-v2/WeatherPhotoShowcase';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  isLandingV2?: boolean;
}

interface FAQItem {
  id: string;
  category: string;
  questionKey: string;
  answerKey: string;
}

export const FAQView: React.FC<Props> = ({ onNavigate, settings, isLandingV2 }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const t = (key: string) => getTranslation(key, settings.language);

  const categories = [
    { id: 'all', label: t('faq.cat.all') },
    { id: 'general', label: t('faq.cat.general') },
    { id: 'features', label: t('faq.cat.features') },
    { id: 'models', label: t('faq.cat.models') },
    { id: 'account', label: t('faq.cat.account') },
    { id: 'pricing', label: t('faq.cat.pricing') },
  ];

  const faqItems: FAQItem[] = [
    // General
    { id: 'what_is_baro', category: 'general', questionKey: 'faq.q.what_is_baro', answerKey: 'faq.a.what_is_baro' },
    { id: 'free', category: 'general', questionKey: 'faq.q.free', answerKey: 'faq.a.free' },
    { id: 'ads', category: 'general', questionKey: 'faq.q.ads', answerKey: 'faq.a.ads' },
    { id: 'install', category: 'general', questionKey: 'faq.q.install', answerKey: 'faq.a.install' },
    { id: 'offline', category: 'general', questionKey: 'faq.q.offline', answerKey: 'faq.a.offline' },
    
    // Features
    { id: 'messenger', category: 'features', questionKey: 'faq.q.messenger', answerKey: 'faq.a.messenger' },
    { id: 'email', category: 'features', questionKey: 'faq.q.email', answerKey: 'faq.a.email' },
    { id: 'push', category: 'features', questionKey: 'faq.q.push', answerKey: 'faq.a.push' },
    { id: 'yourday', category: 'features', questionKey: 'faq.q.yourday', answerKey: 'faq.a.yourday' },
    { id: 'planner', category: 'features', questionKey: 'faq.q.planner', answerKey: 'faq.a.planner' },
    { id: 'ai', category: 'features', questionKey: 'faq.q.ai', answerKey: 'faq.a.ai' },
    { id: 'barometer', category: 'features', questionKey: 'faq.q.barometer', answerKey: 'faq.a.barometer' },
    { id: 'climate', category: 'features', questionKey: 'faq.q.climate', answerKey: 'faq.a.climate' },
    { id: 'ensemble', category: 'features', questionKey: 'faq.q.ensemble', answerKey: 'faq.a.ensemble' },
    { id: 'history', category: 'features', questionKey: 'faq.q.history', answerKey: 'faq.a.history' },
    { id: 'strava', category: 'features', questionKey: 'faq.q.strava', answerKey: 'faq.a.strava' },
    { id: 'holiday', category: 'features', questionKey: 'faq.q.holiday', answerKey: 'faq.a.holiday' },
    { id: 'photo', category: 'features', questionKey: 'faq.q.photo', answerKey: 'faq.a.photo' },
    { id: 'profiles', category: 'features', questionKey: 'faq.q.profiles', answerKey: 'faq.a.profiles' },
    { id: 'alerts', category: 'features', questionKey: 'faq.q.alerts', answerKey: 'faq.a.alerts' },
    
    // Models
    { id: 'sources', category: 'models', questionKey: 'faq.q.sources', answerKey: 'faq.a.sources' },
    { id: 'accuracy', category: 'models', questionKey: 'faq.q.accuracy', answerKey: 'faq.a.accuracy' },
    { id: 'updates', category: 'models', questionKey: 'faq.q.updates', answerKey: 'faq.a.updates' },
    
    // Account
    { id: 'privacy', category: 'account', questionKey: 'faq.q.privacy', answerKey: 'faq.a.privacy' },
    { id: 'data', category: 'account', questionKey: 'faq.q.data', answerKey: 'faq.a.data' },
    { id: 'delete', category: 'account', questionKey: 'faq.q.delete', answerKey: 'faq.a.delete' },
    
    // Pricing
    { id: 'credits', category: 'pricing', questionKey: 'faq.q.credits', answerKey: 'faq.a.credits' },
    { id: 'premium', category: 'pricing', questionKey: 'faq.q.premium', answerKey: 'faq.a.premium' },
  ];

  const filteredItems = useMemo(() => {
    return faqItems.filter(item => {
      const question = t(item.questionKey).toLowerCase();
      const answer = t(item.answerKey).toLowerCase();
      const query = searchQuery.toLowerCase();
      
      const matchesSearch = question.includes(query) || answer.includes(query);
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory, settings.language]);

  return (
    <div className={`relative min-h-screen flex flex-col pb-24 overflow-y-auto transition-colors duration-300 ${
        isLandingV2 
            ? 'bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 text-white' 
            : 'text-text-main bg-bg-page'
    }`}>
      {/* Background Layer */}
      {isLandingV2 ? (
          <>
            <div className="fixed inset-0 z-0">
                <AnimatedGradientOrb position={{ x: "-10%", y: "-10%" }} colors={["#6366f1", "#8b5cf6", "#3b82f6"]} size="700px" />
                <AnimatedGradientOrb delay={2} position={{ x: "70%", y: "40%" }} colors={["#3b82f6", "#06b6d4", "#8b5cf6"]} size="600px" />
                <AnimatedGradientOrb delay={4} position={{ x: "30%", y: "80%" }} colors={["#ec4899", "#f97316", "#6366f1"]} size="550px" />
                <FloatingWeatherIcons />
                <DynamicWeatherEffect />
                <ParticleField />
                <WeatherPhotoShowcase />
            </div>
          </>
      ) : (
          <>
            <div className="absolute top-0 left-0 right-0 h-[50vh] z-0 overflow-hidden rounded-b-[3rem]">
                <StaticWeatherBackground 
                    weatherCode={0} 
                    isDay={1} 
                    className="absolute inset-0 w-full h-full"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg-page" />
            </div>
            <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent dark:from-black/60 dark:via-black/5 dark:to-bg-page/90 z-0 pointer-events-none" />
          </>
      )}

      {/* Header */}
      <div className={`sticky top-0 z-30 border-b ${
          isLandingV2 
            ? 'bg-black/20 backdrop-blur-xl border-white/10' 
            : 'bg-bg-page/90 backdrop-blur-md border-border-color'
      }`}>
        <div className="max-w-3xl mx-auto p-4 flex items-center gap-4">
          <button 
            onClick={() => onNavigate(isLandingV2 ? ViewState.LANDING_V2 : ViewState.CURRENT)} 
            className={`size-10 flex items-center justify-center rounded-full transition-colors ${
                isLandingV2 ? 'hover:bg-white/10 text-white' : 'hover:bg-bg-subtle text-text-main'
            }`}
          >
            <Icon name="arrow_back_ios_new" />
          </button>
          <div>
            <h1 className={`text-xl font-bold flex items-center gap-2 ${
                isLandingV2 ? 'text-white' : 'text-text-main'
            }`}>
              <Icon name="help" className={isLandingV2 ? 'text-blue-400' : 'text-primary'} />
              {t('faq.subtitle')}
            </h1>
          </div>
        </div>
      </div>

      <div className="relative z-10 w-[90%] md:w-full max-w-3xl mx-auto p-4 space-y-6">
        {/* Search & Categories */}
        <div className={`backdrop-blur-md rounded-2xl p-4 shadow-sm border sticky top-[73px] z-20 ${
            isLandingV2 
                ? 'bg-white/5 border-white/10 shadow-black/20' 
                : 'bg-bg-card/80 border-border-color shadow-sm'
        }`}>
          <div className="relative mb-4">
            <Icon name="search" className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                isLandingV2 ? 'text-white/40' : 'text-text-muted'
            }`} />
            <input 
              type="text"
              placeholder={t('faq.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all ${
                isLandingV2 
                    ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:ring-blue-500/50' 
                    : 'bg-bg-page border-border-color text-text-main placeholder:text-text-muted focus:ring-primary/50'
              }`}
            />
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat.id 
                    ? (isLandingV2 ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-primary text-white shadow-md')
                    : (isLandingV2 ? 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10' : 'bg-bg-page text-text-muted hover:bg-bg-subtle border border-border-color')
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ List */}
        <div className="space-y-3">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const isExpanded = expandedId === item.id;
              return (
                <div 
                  key={item.id} 
                  className={`backdrop-blur-md rounded-2xl border transition-all duration-300 overflow-hidden ${
                    isLandingV2
                        ? (isExpanded ? 'bg-white/10 border-blue-500/50 shadow-lg shadow-blue-500/10' : 'bg-white/5 border-white/10 hover:border-white/20')
                        : (isExpanded ? 'bg-bg-card/80 border-primary shadow-md ring-1 ring-primary/20' : 'bg-bg-card/80 border-border-color hover:border-primary/30')
                  }`}
                >
                  <button 
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="w-full p-4 flex items-start justify-between text-left gap-4"
                  >
                    <span className={`font-bold transition-colors ${
                        isExpanded 
                            ? (isLandingV2 ? 'text-blue-400' : 'text-primary') 
                            : (isLandingV2 ? 'text-white' : 'text-text-main')
                    }`}>
                      {t(item.questionKey)}
                    </span>
                    <Icon 
                      name="expand_more" 
                      className={`transition-transform duration-300 ${
                        isExpanded ? 'rotate-180' : ''
                      } ${isLandingV2 ? 'text-white/40' : 'text-text-muted'}`} 
                    />
                  </button>
                  
                  <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden">
                      <div className={`p-4 pt-0 leading-relaxed border-t mt-2 ${
                          isLandingV2 
                            ? 'text-white/70 border-white/5' 
                            : 'text-text-muted border-border-color/50'
                      }`}>
                         {t(item.answerKey)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={`text-center py-12 ${isLandingV2 ? 'text-white/40' : 'text-text-muted'}`}>
              <Icon name="search_off" className="text-4xl mb-2 opacity-50" />
              <p>{t('faq.no_results')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
