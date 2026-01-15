
import React from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings } from '../types';
import { getTranslation } from '../services/translations';
import { StaticWeatherBackground } from '../components/StaticWeatherBackground';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings?: AppSettings; // Optional to avoid breaking if not passed immediately, but we will pass it
}

export const TeamView: React.FC<Props> = ({ onNavigate, settings }) => {
  // Fallback if settings not passed (though we will update App.tsx)
  const lang = settings?.language || 'en';
  const t = (key: string) => getTranslation(key, lang);

  return (
    <div className="relative min-h-screen flex flex-col pb-24 overflow-y-auto text-text-main bg-bg-page transition-colors duration-300">
      {/* Background Layer */}
      <div className="absolute top-0 left-0 right-0 h-[50vh] z-0 overflow-hidden rounded-b-[3rem]">
          <StaticWeatherBackground 
              weatherCode={0} 
              isDay={1} 
              className="absolute inset-0 w-full h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg-page" />
      </div>

      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent dark:from-black/60 dark:via-black/5 dark:to-bg-page/90 z-0 pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full bg-bg-card/50 backdrop-blur text-text-main hover:bg-bg-card transition-colors">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-3xl font-bold drop-shadow-md">{t('team.title')}</h1>
        </div>

        <div className="bg-bg-card/80 backdrop-blur-md rounded-3xl p-8 shadow-sm border border-border-color space-y-6">
            <div className="flex justify-center mb-6">
                <div className="size-24 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white shadow-lg">
                    <Icon name="groups" className="text-5xl" />
                </div>
            </div>

            <h2 className="text-2xl font-bold text-center text-text-main">{t('team.subtitle')}</h2>
            
            <p className="text-lg text-text-muted leading-relaxed text-center">
                {t('team.desc')}
            </p>

            <div className="grid gap-6 md:grid-cols-2 mt-8">
                <div className="p-4 bg-bg-subtle/50 rounded-2xl border border-border-color">
                    <Icon name="public" className="text-3xl text-primary mb-2" />
                    <h3 className="font-bold mb-1 text-text-main">{t('team.free_data')}</h3>
                    <p className="text-sm text-text-muted opacity-70">{t('team.free_data_desc')}</p>
                </div>
                <div className="p-4 bg-bg-subtle/50 rounded-2xl border border-border-color">
                    <Icon name="favorite" className="text-3xl text-red-400 mb-2" />
                    <h3 className="font-bold mb-1 text-text-main">{t('team.community')}</h3>
                    <p className="text-sm text-text-muted opacity-70">{t('team.community_desc')}</p>
                </div>
            </div>

            <p className="text-text-muted leading-relaxed mt-4">
                {t('team.mission')}
            </p>

            <div className="bg-accent-primary/10 p-6 rounded-2xl border border-accent-primary/20 mt-8">
                <h3 className="font-bold text-accent-primary mb-2 flex items-center gap-2">
                    <Icon name="volunteer_activism" /> {t('team.support')}
                </h3>
                <p className="text-sm text-text-muted">
                    {t('team.support_desc')}
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};
