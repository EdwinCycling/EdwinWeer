import React from 'react';
import { AppSettings } from '../types';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
}

export const ClimateScoreModal: React.FC<Props> = ({ isOpen, onClose, settings }) => {
  if (!isOpen) return null;

  const t = (key: string) => getTranslation(key, settings.language);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Blur Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-bg-page rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 border border-border-color">
        {/* Header */}
        <div className="p-4 border-b border-border-color flex justify-between items-center bg-bg-card/50">
          <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
            <Icon name="thermostat" className="text-accent-primary" />
            {t('climate.modal.title')}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-bg-card transition-colors text-text-muted hover:text-text-main"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          <p className="text-sm text-text-muted italic">
            {t('climate.modal.intro')}
          </p>

          {/* Hellmann (Winter) */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
            <h3 className="text-lg font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2 mb-2">
              <Icon name="ac_unit" />
              {t('climate.modal.hellmann_title')}
            </h3>
            <p className="text-sm text-text-main mb-2">
              {t('climate.modal.hellmann_desc')}
            </p>
            <div className="text-xs text-text-muted bg-white/50 dark:bg-black/20 p-3 rounded-lg mb-3 font-mono">
              {t('climate.modal.hellmann_example')}
            </div>
            
            <div className="space-y-1">
              <p className="text-xs font-bold text-text-muted uppercase mb-1">{t('climate.modal.score_meaning')}:</p>
              <div className="grid grid-cols-[60px_1fr] gap-2 text-xs">
                <span className="font-mono font-bold text-blue-500">&lt; 40</span>
                <span>{t('climate.modal.hellmann_soft')}</span>
                
                <span className="font-mono font-bold text-blue-500">&lt; 100</span>
                <span>{t('climate.modal.hellmann_moderate')}</span>
                
                <span className="font-mono font-bold text-blue-500">&gt; 100</span>
                <span>{t('climate.modal.hellmann_cold')}</span>
                
                <span className="font-mono font-bold text-blue-500">&gt; 300</span>
                <span>{t('climate.modal.hellmann_very_cold')}</span>
              </div>
            </div>
          </div>

          {/* Warmtegetal (Summer) */}
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-100 dark:border-orange-800">
            <h3 className="text-lg font-bold text-orange-600 dark:text-orange-400 flex items-center gap-2 mb-2">
              <Icon name="local_fire_department" />
              {t('climate.modal.heat_title')}
            </h3>
            <p className="text-sm text-text-main mb-2">
              {t('climate.modal.heat_desc')}
            </p>
            <div className="text-xs text-text-muted bg-white/50 dark:bg-black/20 p-3 rounded-lg mb-3 font-mono">
              {t('climate.modal.heat_example')}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold text-text-muted uppercase mb-1">{t('climate.modal.score_meaning')}:</p>
              <div className="grid grid-cols-[60px_1fr] gap-2 text-xs">
                <span className="font-mono font-bold text-orange-500">&lt; 50</span>
                <span>{t('climate.modal.heat_moderate')}</span>
                
                <span className="font-mono font-bold text-orange-500">&lt; 100</span>
                <span>{t('climate.modal.heat_average')}</span>
                
                <span className="font-mono font-bold text-orange-500">&gt; 100</span>
                <span>{t('climate.modal.heat_good')}</span>
                
                <span className="font-mono font-bold text-orange-500">&gt; 300</span>
                <span>{t('climate.modal.heat_top')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
