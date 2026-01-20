import React from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings } from '../types';
import { getTranslation } from '../services/translations';
import { StaticWeatherBackground } from '../components/StaticWeatherBackground';

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
      <h3 className="text-xl font-bold mb-3 text-text-main">{title}</h3>
      <div className="space-y-3 text-text-muted leading-relaxed">
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
    <div className="relative min-h-screen flex flex-col pb-24 overflow-y-auto text-text-main bg-bg-page transition-colors duration-300">
      <div className="relative z-10 max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={handleBack} 
            className="size-10 flex items-center justify-center rounded-full bg-bg-card/50 backdrop-blur text-text-main hover:bg-bg-card transition-colors"
          >
            <Icon name="arrow_back_ios_new" />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold drop-shadow-md">{t('model_info.title')}</h1>
        </div>

        <div className="bg-bg-card/80 backdrop-blur-md rounded-3xl p-6 md:p-8 shadow-lg border border-border-color">
          <p className="text-lg mb-8 leading-relaxed text-text-main">
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
            t('model_info.baro_title'),
            <>
              {renderModelItem('model_info.baro_aifs')}
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
                <div className="bg-green-500/10 p-4 rounded-xl border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2 text-green-600 dark:text-green-400 font-bold">
                    <Icon name="check_circle" />
                    <span>{t('model_info.pro')}</span>
                  </div>
                  <p className="text-sm">{t('model_info.ens_pro')}</p>
                </div>
                <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                  <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400 font-bold">
                    <Icon name="warning" />
                    <span>{t('model_info.con')}</span>
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

          <div className="mt-8 bg-bg-subtle p-6 rounded-2xl">
            <h3 className="text-xl font-bold mb-4 text-text-main">{t('model_info.summary_title')}</h3>
            <ul className="space-y-3 text-text-muted">
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
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-bg-subtle hover:bg-bg-card transition-colors font-bold text-text-main"
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
