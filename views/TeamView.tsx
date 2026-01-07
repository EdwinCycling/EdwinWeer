
import React from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings } from '../types';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings?: AppSettings; // Optional to avoid breaking if not passed immediately, but we will pass it
}

export const TeamView: React.FC<Props> = ({ onNavigate, settings }) => {
  // Fallback if settings not passed (though we will update App.tsx)
  const lang = settings?.language || 'en';
  const t = (key: string) => getTranslation(key, lang);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark p-6 pb-24 text-slate-800 dark:text-white overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-3xl font-bold">{t('team.title')}</h1>
        </div>

        <div className="bg-white dark:bg-card-dark rounded-3xl p-8 shadow-sm border border-slate-100 dark:border-white/5 space-y-6">
            <div className="flex justify-center mb-6">
                <div className="size-24 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white shadow-lg">
                    <Icon name="groups" className="text-5xl" />
                </div>
            </div>

            <h2 className="text-2xl font-bold text-center">{t('team.subtitle')}</h2>
            
            <p className="text-lg text-slate-600 dark:text-white/80 leading-relaxed text-center">
                {t('team.desc')}
            </p>

            <div className="grid gap-6 md:grid-cols-2 mt-8">
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                    <Icon name="public" className="text-3xl text-primary mb-2" />
                    <h3 className="font-bold mb-1">{t('team.free_data')}</h3>
                    <p className="text-sm opacity-70">{t('team.free_data_desc')}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                    <Icon name="favorite" className="text-3xl text-red-400 mb-2" />
                    <h3 className="font-bold mb-1">{t('team.community')}</h3>
                    <p className="text-sm opacity-70">{t('team.community_desc')}</p>
                </div>
            </div>

            <p className="text-slate-600 dark:text-white/80 leading-relaxed mt-4">
                {t('team.mission')}
            </p>

            <div className="bg-indigo-50 dark:bg-indigo-500/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 mt-8">
                <h3 className="font-bold text-indigo-600 dark:text-indigo-300 mb-2 flex items-center gap-2">
                    <Icon name="volunteer_activism" /> {t('team.support')}
                </h3>
                <p className="text-sm text-indigo-800 dark:text-indigo-200/80">
                    {t('team.support_desc')}
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};
