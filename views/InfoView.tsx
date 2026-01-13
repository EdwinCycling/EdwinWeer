
import React from 'react';
import { Icon } from '../components/Icon';
import { AppSettings, ViewState } from '../types';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const InfoView: React.FC<Props> = ({ onNavigate, settings }) => {
  const t = (key: string) => getTranslation(key, settings.language);

  return (
    <div className="min-h-screen bg-bg-page p-6 pb-24 text-text-main overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-bg-card transition-colors">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-3xl font-bold">{t('info.title')}</h1>
        </div>

        <div className="space-y-12">
            <section className="text-center">
                <h2 className="text-4xl font-display font-bold mb-4 bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">
                    {t('info.hero_title')}
                </h2>
                <p className="text-xl text-text-muted leading-relaxed">
                    {t('info.hero_desc')}
                </p>
            </section>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-bg-card p-6 rounded-3xl border border-border-color">
                    <div className="size-12 rounded-2xl bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center text-orange-500 mb-4">
                        <Icon name="history" className="text-2xl" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{t('info.card.historical_title')}</h3>
                    <p className="text-text-muted">
                        {t('info.card.historical_desc')}
                    </p>
                </div>

                <div className="bg-bg-card p-6 rounded-3xl border border-border-color">
                    <div className="size-12 rounded-2xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-500 mb-4">
                        <Icon name="model_training" className="text-2xl" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{t('info.card.ensembles_title')}</h3>
                    <p className="text-text-muted">
                        {t('info.card.ensembles_desc')}
                    </p>
                </div>

                <div className="bg-bg-card p-6 rounded-3xl border border-border-color">
                    <div className="size-12 rounded-2xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-500 mb-4">
                        <Icon name="grass" className="text-2xl" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{t('info.card.soil_title')}</h3>
                    <p className="text-text-muted">
                        {t('info.card.soil_desc')}
                    </p>
                </div>

                <div className="bg-bg-card p-6 rounded-3xl border border-border-color">
                    <div className="size-12 rounded-2xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-500 mb-4">
                        <Icon name="analytics" className="text-2xl" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{t('info.card.privacy_title')}</h3>
                    <p className="text-text-muted">
                        {t('info.card.privacy_desc')}
                    </p>
                </div>
            </div>

            <section className="bg-bg-page rounded-3xl p-8 border border-border-color">
                <h3 className="text-2xl font-bold mb-4">{t('info.unique_title')}</h3>
                <p className="text-text-muted mb-4">
                    {t('info.unique_p1')}
                </p>
                <p className="text-text-muted">
                    {t('info.unique_p2')}
                </p>
            </section>

            <div className="bg-amber-50 dark:bg-amber-500/10 p-6 rounded-3xl border border-amber-100 dark:border-amber-500/20">
                <div className="flex items-start gap-4">
                    <div className="text-amber-500 mt-1">
                        <Icon name="info" className="text-2xl" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold mb-2 text-amber-800 dark:text-amber-200">{t('info.sources_title')}</h3>
                        <p className="text-amber-700 dark:text-amber-200/80 mb-3">
                            {t('info.sources_p1')}
                        </p>
                        <p className="text-amber-700 dark:text-amber-200/80 text-sm">
                            {t('info.sources_p2')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-500/10 p-6 rounded-3xl border border-blue-100 dark:border-blue-500/20 text-center">
                 <h3 className="text-xl font-bold mb-2 text-blue-800 dark:text-blue-200">{t('info.contact_title')}</h3>
                 <p className="text-blue-700 dark:text-blue-200/80">
                    {t('info.contact_desc')} <a href="mailto:askbaro@gmail.com" className="font-bold underline hover:text-blue-900 dark:hover:text-blue-100">askbaro@gmail.com</a>
                 </p>
            </div>
        </div>
      </div>
    </div>
  );
};
