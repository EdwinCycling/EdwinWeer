import React from 'react';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';
import { AppSettings } from '../types';
import { useScrollLock } from '../hooks/useScrollLock';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
}

export const ModelInfoModal: React.FC<Props> = ({ isOpen, onClose, settings }) => {
    useScrollLock(isOpen);

    if (!isOpen) return null;

    const t = (key: string) => getTranslation(key, settings.language);
    const isNl = settings.language === 'nl';

    // Helper to render bold text from **text**
    const renderText = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <span key={i} className="font-bold text-text-main">{part.slice(2, -2)}</span>;
            }
            return part;
        });
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-bg-card w-full h-full shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-6 border-b border-border-color flex items-center justify-between shrink-0">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-text-main">
                        <Icon name="info" className="text-primary" />
                        {t('model_info.title')}
                    </h2>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-bg-page transition-colors"
                    >
                        <Icon name="close" className="text-text-muted" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 overflow-y-auto text-text-muted space-y-6 text-sm leading-relaxed">
                    
                    <p className="italic opacity-80 text-base">
                        {t('model_info.intro')}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-500/20">
                            <h3 className="text-base font-bold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
                                <span>🇪🇺</span> {t('model_info.eu_title')}
                            </h3>
                            <ul className="space-y-3">
                                <li>{renderText(t('model_info.eu_ecmwf'))}</li>
                                <li>{renderText(t('model_info.eu_dwd'))}</li>
                            </ul>
                        </div>

                        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-500/20">
                            <h3 className="text-base font-bold text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-2">
                                <span>🤖</span> {t('model_info.ai_title')}
                            </h3>
                            <p>{renderText(t('model_info.baro_aifs'))}</p>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-base font-bold text-text-main mb-2 flex items-center gap-2">
                            <span>🇺🇸</span> {t('model_info.us_title')}
                        </h3>
                        <p>{renderText(t('model_info.us_gfs'))}</p>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-500/20">
                        <h3 className="text-base font-bold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
                            <span>🌍</span> {t('model_info.ens_title')}
                        </h3>
                        <p className="mb-2">
                            {t('model_info.ens_intro')}
                        </p>
                        <ul className="space-y-1 list-disc list-inside">
                            <li><span className="font-bold text-green-600 dark:text-green-400">{t('model_info.pro')}:</span> {t('model_info.ens_pro')}</li>
                            <li><span className="font-bold text-red-600 dark:text-red-400">{t('model_info.con')}:</span> {t('model_info.ens_con')}</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-base font-bold text-text-main mb-2 flex items-center gap-2">
                            <span>📍</span> {t('model_info.spec_title')}
                        </h3>
                        <ul className="space-y-2">
                            <li>{renderText(t('model_info.spec_uk'))}</li>
                            <li>{renderText(t('model_info.spec_swiss'))}</li>
                            <li>{renderText(t('model_info.spec_bom'))}</li>
                        </ul>
                    </div>

                    <div className="bg-bg-page p-4 rounded-xl text-center">
                        <h3 className="font-bold text-lg mb-2">{t('model_info.summary_title')}</h3>
                        <div className="space-y-2 text-sm">
                            <p>{t('model_info.sum_daily')} <span className="font-bold text-primary">DWD ICON / ECMWF IFS</span></p>
                            <p>{t('model_info.sum_long')} <span className="font-bold text-primary">Ensemble (EPS)</span></p>
                            <p>{t('model_info.sum_tech')} <span className="font-bold text-primary">ECMWF AIFS</span></p>
                        </div>
                    </div>

                </div>

                {/* Footer with Close Button */}
                <div className="p-4 border-t border-border-color shrink-0 flex justify-center">
                    <button 
                        onClick={onClose}
                        className="bg-primary text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg shadow-primary/20 hover:bg-primary-dark transition-colors w-full md:w-auto"
                    >
                        {isNl ? 'Sluiten' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
};
