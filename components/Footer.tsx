
import React, { useState } from 'react';
import { AppSettings } from '../types';
import { getTranslation } from '../services/translations';

interface Props {
    settings: AppSettings;
}

export const Footer: React.FC<Props> = ({ settings }) => {
    const [modal, setModal] = useState<'disclaimer' | 'cookies' | null>(null);

    const t = (key: string) => getTranslation(key, settings.language);
    const closeModal = () => setModal(null);

    return (
        <>
            {/* Footer Bar - Static at bottom of content, above nav */}
            <div className="w-full text-center py-8 px-6 pb-28 opacity-50 hover:opacity-100 transition-opacity">
                <div className="flex justify-center gap-6 text-xs text-slate-500 dark:text-white/40 mb-3 font-medium">
                    <button onClick={() => setModal('disclaimer')} className="hover:text-primary transition-colors underline decoration-dotted decoration-2 underline-offset-4">
                        {t('footer.disclaimer')}
                    </button>
                    <button onClick={() => setModal('cookies')} className="hover:text-primary transition-colors underline decoration-dotted decoration-2 underline-offset-4">
                        {t('footer.cookies')}
                    </button>
                </div>
                <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-400 dark:text-white/20 hover:text-slate-600 dark:hover:text-white/40 transition-colors block">
                    Weather data by Open-Meteo.com (CC BY 4.0)
                </a>
            </div>

            {/* Modals */}
            {modal && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={closeModal}>
                    <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative text-slate-800 dark:text-white" onClick={e => e.stopPropagation()}>
                        <button onClick={closeModal} className="absolute top-4 right-4 text-slate-400 dark:text-white/50 hover:text-primary dark:hover:text-white">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                        
                        {modal === 'disclaimer' && (
                            <>
                                <h3 className="text-xl font-bold mb-4">{t('footer.disclaimer_title')}</h3>
                                <div className="space-y-4 text-sm text-slate-600 dark:text-white/70">
                                    <p>{t('footer.text_weather')}</p>
                                    <p>{t('footer.text_strava')}</p>
                                    <p>{t('footer.text_liability')}</p>
                                </div>
                            </>
                        )}

                        {modal === 'cookies' && (
                            <>
                                <h3 className="text-xl font-bold mb-4">{t('footer.cookies_title')}</h3>
                                <div className="space-y-4 text-sm text-slate-600 dark:text-white/70">
                                    <p>{t('footer.text_privacy')}</p>
                                    <p>{t('footer.text_storage')}</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
