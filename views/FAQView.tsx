import React, { useState, useMemo } from 'react';
import { ViewState, AppSettings } from '../types';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

interface FAQItem {
  id: string;
  category: string;
  questionKey: string;
  answerKey: string;
}

export const FAQView: React.FC<Props> = ({ onNavigate, settings }) => {
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
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-white/90 dark:bg-[#101d22]/90 backdrop-blur-md z-30 border-b border-slate-200 dark:border-white/5">
        <div className="max-w-3xl mx-auto p-4 flex items-center gap-4">
          <button 
            onClick={() => onNavigate(ViewState.CURRENT)} 
            className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-800 dark:text-white"
          >
            <Icon name="arrow_back_ios_new" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Icon name="help" className="text-primary" />
              Ask Baro
            </h1>
            <p className="text-xs text-slate-500 dark:text-white/60">
              {t('faq.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {/* Search */}
        <div className="relative mb-6">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon name="search" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('faq.search_placeholder')}
            className="w-full bg-white dark:bg-card-dark border border-slate-200 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all shadow-sm"
          />
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-2 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-primary text-white shadow-lg shadow-primary/30'
                  : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/5'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="size-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Icon name="search_off" className="text-2xl" />
              </div>
              <p className="text-slate-500 dark:text-white/60 font-medium">
                {t('faq.no_results')}
              </p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div 
                key={item.id}
                className="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden transition-all duration-300"
              >
                <button
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="w-full text-left p-5 flex items-start justify-between gap-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="font-bold text-slate-800 dark:text-white leading-relaxed">
                    {t(item.questionKey)}
                  </span>
                  <div className={`mt-0.5 transition-transform duration-300 ${expandedId === item.id ? 'rotate-180' : ''} text-slate-400`}>
                    <Icon name="expand_more" />
                  </div>
                </button>
                
                <div 
                  className={`grid transition-all duration-300 ease-in-out ${
                    expandedId === item.id ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="p-5 pt-0 text-slate-600 dark:text-slate-300 leading-relaxed text-sm whitespace-pre-line border-t border-slate-100 dark:border-white/5 mt-2">
                      {t(item.answerKey)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>


      </div>
    </div>
  );
};
