import React, { useEffect } from 'react';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';
import { AppSettings } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
}

export const ComfortScoreModal: React.FC<Props> = ({ isOpen, onClose, settings }) => {
  const t = (key: string) => getTranslation(key, settings.language);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-white/10">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          <Icon name="close" className="text-slate-600 dark:text-white" />
        </button>

        <div className="pr-8">
          <h2 className="text-2xl font-bold mb-4 text-slate-800 dark:text-white">
            {t('comfort.modal.title')}
          </h2>
          
          <div className="space-y-4 text-slate-700 dark:text-white/80">
            <p className="text-lg">
              {t('comfort.modal.intro')}
            </p>
            
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Icon name="psychology" className="text-xl text-purple-500" /> {t('comfort.modal.recipe.title')}
              </h3>
              <p className="mb-3">{t('comfort.modal.recipe.intro')}</p>
              
              <ul className="space-y-2 ml-2">
                <li className="flex items-start gap-2">
                  <Icon name="thermostat" className="text-blue-500" />
                  <span>{t('comfort.modal.recipe.temperature')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon name="air" className="text-slate-400" />
                  <span>{t('comfort.modal.recipe.wind')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon name="water_drop" className="text-blue-400" />
                  <span>{t('comfort.modal.recipe.precipitation')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon name="opacity" className="text-orange-400" />
                  <span>{t('comfort.modal.recipe.humidity')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon name="wb_sunny" className="text-yellow-500" />
                  <span>{t('comfort.modal.recipe.sun')}</span>
                </li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-2">
                {t('comfort.modal.meaning.title')}
              </h3>
              
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="px-2 py-1 rounded-md bg-green-500 flex items-center justify-center text-white font-bold text-xs min-w-[40px]">8-10</div>
                  <span>{t('comfort.modal.meaning.excellent')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-2 py-1 rounded-md bg-amber-500 flex items-center justify-center text-white font-bold text-xs min-w-[40px]">6-7</div>
                  <span>{t('comfort.modal.meaning.good')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-2 py-1 rounded-md bg-orange-500 flex items-center justify-center text-white font-bold text-xs min-w-[40px]">4-5</div>
                  <span>{t('comfort.modal.meaning.fair')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-2 py-1 rounded-md bg-red-500 flex items-center justify-center text-white font-bold text-xs min-w-[40px]">1-3</div>
                  <span>{t('comfort.modal.meaning.poor')}</span>
                </div>
              </div>
            </div>
            
            <p className="text-lg font-medium text-center bg-slate-100 dark:bg-slate-700 rounded-lg p-3">
              {t('comfort.modal.summary')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};