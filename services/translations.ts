import { AppLanguage } from '../types';
import { en } from './locales/en';
import { nl } from './locales/nl';
import { fr } from './locales/fr';
import { de } from './locales/de';
import { es } from './locales/es';

const dictionaries = {
    en,
    nl,
    fr,
    de,
    es
};

export const getTranslation = (key: string, lang: AppLanguage, params?: Record<string, string | number>): string => {
    const dict = dictionaries[lang] || en;
    let text = dict[key] || en[key] || key;

    if (params) {
        Object.entries(params).forEach(([paramKey, value]) => {
            text = text.replace(`{${paramKey}}`, String(value));
        });
    }

    return text;
};
