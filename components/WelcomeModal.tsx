import React, { useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { AppSettings, AppLanguage } from '../types';
import { FlagIcon } from './FlagIcon';
import { getTranslation } from '../services/translations';

interface WelcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings?: AppSettings;
    onUpdateSettings?: (settings: AppSettings) => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose, settings, onUpdateSettings }) => {
    const [isLangOpen, setIsLangOpen] = useState(false);
    
    // Default to 'nl' if settings not available yet, or use settings.language
    const language = settings?.language || 'nl';
    const t = (key: string) => getTranslation(key, language);

    const changeLanguage = (lang: AppLanguage) => {
        if (onUpdateSettings && settings) {
            onUpdateSettings({
                ...settings,
                language: lang
            });
        }
        setIsLangOpen(false);
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            className="max-w-xl !p-0 overflow-hidden"
        >
            <div className="relative h-48 w-full overflow-hidden">
                <img 
                    src="/landing/hero-weather.jpg" 
                    alt="Welcome" 
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-6">
                    <h2 className="text-3xl font-bold text-white">{t('welcome.title')}</h2>
                </div>

                {/* Language Selector inside Modal */}
                {settings && onUpdateSettings && (
                    <div className="absolute top-4 right-4 z-50">
                        <div className="relative">
                            <button 
                                onClick={() => setIsLangOpen(!isLangOpen)}
                                className="p-2 bg-white/20 backdrop-blur-md rounded-xl text-white hover:bg-white/30 transition-all active:scale-95 shadow-sm ring-1 ring-white/20 flex items-center gap-2"
                            >
                                <FlagIcon countryCode={language} className="w-6 h-4 rounded-sm shadow-sm" />
                                <span className="text-xs font-bold uppercase">{language}</span>
                                <Icon name="expand_more" className={`text-sm transition-transform ${isLangOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isLangOpen && (
                                <div className="absolute top-full right-0 mt-2 w-32 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    {(['nl', 'en', 'fr', 'de', 'es'] as AppLanguage[]).map((lang) => (
                                        <button
                                            key={lang}
                                            onClick={() => changeLanguage(lang)}
                                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${language === lang ? 'bg-primary/10 text-primary font-bold' : 'text-slate-700 dark:text-white/80'}`}
                                        >
                                            <FlagIcon countryCode={lang} className="w-5 h-3.5 rounded-sm shadow-sm" />
                                            <span className="uppercase">{lang}</span>
                                            {language === lang && <Icon name="check" className="ml-auto text-xs" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            <div className="p-6 space-y-6">
                <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed">
                    {t('welcome.subtitle')}
                </p>

                <div className="grid gap-4">
                    <div className="flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-500/20">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg text-blue-600 dark:text-blue-400">
                            <Icon name="block" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white mb-1">{t('welcome.ad_free_title')}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {t('welcome.ad_free_desc')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-500/20">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg text-purple-600 dark:text-purple-400">
                            <Icon name="verified" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white mb-1">{t('welcome.freemium_title')}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {t('welcome.freemium_desc')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                            <Icon name="tune" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white mb-1">{t('welcome.customizable_title')}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {t('welcome.customizable_desc')}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="pt-4">
                    <button 
                        onClick={onClose}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/30 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {t('welcome.start_button')}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
