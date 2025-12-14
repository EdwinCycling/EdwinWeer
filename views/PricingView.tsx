
import React from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings } from '../types';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const PricingView: React.FC<Props> = ({ onNavigate, settings }) => {
  const t = (key: string) => getTranslation(key, settings.language);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark p-6 pb-24 text-slate-800 dark:text-white overflow-y-auto">
       <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-3xl font-bold">{t('pricing.title')}</h1>
        </div>

        <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">{t('pricing.subtitle')}</h2>
            <p className="text-slate-500 dark:text-white/60">{t('pricing.subtitle_desc')}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Tier */}
            <div className="bg-white dark:bg-card-dark rounded-3xl p-8 border border-slate-200 dark:border-white/5 shadow-sm relative overflow-hidden">
                <h3 className="text-2xl font-bold mb-2">{t('pricing.free_name')}</h3>
                <p className="text-slate-500 dark:text-white/60 mb-2">{t('pricing.free_description')}</p>
                <p className="text-[11px] font-medium text-slate-400 dark:text-white/40 mb-6 uppercase tracking-wide">
                    {t('pricing.free_limits')}
                </p>
                <div className="text-4xl font-bold mb-8">
                    €0
                    <span className="text-lg font-normal text-slate-400">{t('pricing.per_month')}</span>
                </div>

                <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-3">
                        <Icon name="check_circle" className="text-green-500" />
                        <span>{t('pricing.free_feature_traffic')}</span>
                    </li>
                </ul>

                <button className="w-full py-3 rounded-xl bg-slate-100 dark:bg-white/10 font-bold text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-white/20 transition-colors">
                    {t('pricing.free_button')}
                </button>
            </div>

            {/* Pro Tier */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-3xl p-8 border border-slate-200 dark:border-white/10 shadow-xl relative overflow-hidden text-white">
                <div className="absolute top-0 right-0 bg-gradient-to-l from-yellow-400 to-orange-500 text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                    {t('pricing.pro_badge')}
                </div>
                
                <h3 className="text-2xl font-bold mb-2">{t('pricing.pro_name')}</h3>
                <p className="text-slate-300 mb-2">{t('pricing.pro_description')}</p>
                <p className="text-[11px] font-medium text-slate-400 mb-4 uppercase tracking-wide">
                    {t('pricing.pro_limits')}
                </p>
                <div className="text-2xl font-bold mb-8">{t('pricing.pro_price')}</div>

                <ul className="space-y-2 mb-8">
                    <li className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name="network_check" className="text-blue-400" />
                        <span>{t('pricing.pro_feature_traffic')}</span>
                    </li>
                </ul>

                <button disabled className="w-full py-3 rounded-xl bg-primary text-white font-bold opacity-50 cursor-not-allowed">
                    {t('pricing.pro_button')}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
