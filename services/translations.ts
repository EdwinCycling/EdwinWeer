import { AppLanguage, Dictionary } from '../types';
import { en } from './locales/en';

// Initialiseer met Engels (altijd beschikbaar als fallback en default)
const dictionaries: Record<string, Dictionary> = {
    en
};

// Map van import functies voor lazy loading
const loaders: Record<string, () => Promise<any>> = {
    nl: () => import('./locales/nl'),
    fr: () => import('./locales/fr'),
    de: () => import('./locales/de'),
    es: () => import('./locales/es'),
    it: () => import('./locales/it'),
    pt: () => import('./locales/pt'),
    no: () => import('./locales/no'),
    sv: () => import('./locales/sv'),
    da: () => import('./locales/da'),
    fi: () => import('./locales/fi'),
    pl: () => import('./locales/pl')
};

/**
 * Laadt asynchroon een taalbestand.
 * Geeft true terug als de taal succesvol is geladen (of al geladen was).
 */
export const loadLanguage = async (lang: AppLanguage): Promise<boolean> => {
    // Engels is altijd geladen
    if (lang === 'en') return true;

    // Als de taal al in het geheugen zit, hoeven we niets te doen
    if (dictionaries[lang]) return true;

    const loader = loaders[lang];
    if (!loader) {
        console.warn(`No loader found for language: ${lang}`);
        return false;
    }

    try {
        const module = await loader();
        // De taalbestanden exporteren een const met de naam van de taal (bijv. export const nl = { ... })
        // We halen deze op uit de module.
        if (module[lang]) {
            dictionaries[lang] = module[lang];
            return true;
        } else {
            console.error(`Module for ${lang} does not export '${lang}'`);
            return false;
        }
    } catch (error) {
        console.error(`Failed to load language: ${lang}`, error);
        return false;
    }
};

export const getTranslation = (key: string, lang: AppLanguage, params?: Record<string, string | number>): string => {
    // Gebruik de gevraagde taal als die geladen is, anders fallback naar Engels
    const dict = dictionaries[lang] || en;
    
    // Zoek de vertaling: 1. In gevraagde taal, 2. In Engels, 3. Toon de key zelf
    let text = dict[key] || en[key] || key;

    if (params) {
        Object.entries(params).forEach(([paramKey, value]) => {
            text = text.replace(`{${paramKey}}`, String(value));
        });
    }

    return text;
};

export const getLocale = (lang: string): string => {
    const locales: Record<string, string> = { 
        nl: 'nl-NL', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES',
        it: 'it-IT', pt: 'pt-PT', no: 'no-NO', sv: 'sv-SE', da: 'da-DK', fi: 'fi-FI', pl: 'pl-PL'
    };
    return locales[lang] || 'en-GB';
};
