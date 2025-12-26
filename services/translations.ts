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

export const getTranslation = (key: string, lang: AppLanguage): string => {
    const dict = dictionaries[lang] || en;
    return dict[key] || en[key] || key;
};
