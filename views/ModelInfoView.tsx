import React from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings } from '../types';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  previousView?: ViewState;
}

export const ModelInfoView: React.FC<Props> = ({ onNavigate, settings, previousView }) => {
  const t = (key: string) => getTranslation(key, settings.language);

  const handleBack = () => {
    onNavigate(previousView || ViewState.CURRENT);
  };

  const renderSection = (title: string, content: React.ReactNode) => (
    <div className="mb-8">
      <h3 className="text-xl font-bold mb-3 text-slate-800 dark:text-white">{title}</h3>
      <div className="space-y-3 text-slate-600 dark:text-white/80 leading-relaxed">
        {content}
      </div>
    </div>
  );

  const renderModelItem = (key: string) => {
    const text = t(key);
    const parts = text.split('**:');
    if (parts.length === 2) {
      return (
        <p key={key}>
          <span className="font-bold text-primary dark:text-blue-400">{parts[0].replace('**', '')}:</span>
          {parts[1]}
        </p>
      );
    }
    return <p key={key}>{text}</p>;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark p-6 pb-24 text-slate-800 dark:text-white overflow-y-auto transition-colors duration-300">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={handleBack} 
            className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            <Icon name="arrow_back_ios_new" />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold">{t('model_info.title')}</h1>
        </div>

        <div className="bg-white dark:bg-card-dark rounded-3xl p-6 md:p-8 shadow-lg border border-slate-100 dark:border-white/5">
          <p className="text-lg mb-8 leading-relaxed">
            {t('model_info.intro')}
          </p>

          {renderSection(
            t('model_info.eu_title'),
            <>
              {renderModelItem('model_info.eu_ecmwf')}
              {renderModelItem('model_info.eu_dwd')}
            </>
          )}

          {renderSection(
            t('model_info.ai_title'),
            <>
              {renderModelItem('model_info.ai_ecmwf')}
            </>
          )}

          {renderSection(
            t('model_info.us_title'),
            <>
              {renderModelItem('model_info.us_gfs')}
            </>
          )}

          {renderSection(
            t('model_info.ens_title'),
            <>
              <p className="mb-2">{t('model_info.ens_intro')}</p>
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div className="bg-green-50 dark:bg-green-500/10 p-4 rounded-xl border border-green-100 dark:border-green-500/20">
                  <div className="flex items-center gap-2 mb-2 text-green-700 dark:text-green-400 font-bold">
                    <Icon name="check_circle" />
                    <span>Voordeel / Pro</span>
                  </div>
                  <p className="text-sm">{t('model_info.ens_pro')}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-500/10 p-4 rounded-xl border border-red-100 dark:border-red-500/20">
                  <div className="flex items-center gap-2 mb-2 text-red-700 dark:text-red-400 font-bold">
                    <Icon name="warning" />
                    <span>Nadeel / Con</span>
                  </div>
                  <p className="text-sm">{t('model_info.ens_con')}</p>
                </div>
              </div>
            </>
          )}

          {renderSection(
            t('model_info.spec_title'),
            <>
              {renderModelItem('model_info.spec_uk')}
              {renderModelItem('model_info.spec_swiss')}
              {renderModelItem('model_info.spec_bom')}
            </>
          )}

          <div className="mt-8 bg-slate-100 dark:bg-white/5 p-6 rounded-2xl">
            <h3 className="text-xl font-bold mb-4">{t('model_info.summary_title')}</h3>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <Icon name="check" className="text-green-500 shrink-0 mt-1" />
                <span>{t('model_info.sum_daily')}</span>
              </li>
              <li className="flex gap-3">
                <Icon name="trending_up" className="text-blue-500 shrink-0 mt-1" />
                <span>{t('model_info.sum_long')}</span>
              </li>
              <li className="flex gap-3">
                <Icon name="science" className="text-purple-500 shrink-0 mt-1" />
                <span>{t('model_info.sum_tech')}</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 flex justify-center">
            <button 
              onClick={handleBack} 
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 transition-colors font-bold"
            >
              <Icon name="arrow_back" />
              {t('back')}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
