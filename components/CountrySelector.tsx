import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';
import { AppSettings } from '../types';

interface Country {
    code: string;
    name: string;
}

const COUNTRIES: Country[] = [
    { code: 'US', name: 'United States' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'BE', name: 'Belgium' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' },
    { code: 'AT', name: 'Austria' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'PT', name: 'Portugal' },
    { code: 'GR', name: 'Greece' },
    { code: 'IE', name: 'Ireland' },
    { code: 'SE', name: 'Sweden' },
    { code: 'NO', name: 'Norway' },
    { code: 'DK', name: 'Denmark' },
    { code: 'FI', name: 'Finland' },
    { code: 'PL', name: 'Poland' },
    { code: 'CZ', name: 'Czech Republic' },
    { code: 'HU', name: 'Hungary' },
    { code: 'HR', name: 'Croatia' },
    { code: 'TR', name: 'Turkey' },
    { code: 'LU', name: 'Luxembourg' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
];

interface Props {
    value: string; // ISO code
    onChange: (code: string) => void;
    language: string;
}

export const CountrySelector: React.FC<Props> = ({ value, onChange, language }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const selectedCountry = COUNTRIES.find(c => c.code === value);

    const filteredCountries = COUNTRIES.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase()) || 
        c.code.toLowerCase().includes(search.toLowerCase())
    );

    const t = (key: string) => getTranslation(key, language as any);

    return (
        <div className="relative" ref={containerRef}>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">
                    {t('settings.country')}
                </label>
                <button
                    type="button"
                    onClick={() => {
                        setIsOpen(!isOpen);
                        if (!isOpen) setSearch('');
                    }}
                    className="w-full bg-bg-page border border-border-color rounded-xl px-4 py-3 text-left flex items-center justify-between hover:border-accent-primary/50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <Icon name="public" className="text-text-muted" />
                        <span className="font-medium text-text-main">
                            {selectedCountry ? selectedCountry.name : value || 'United States'}
                        </span>
                    </div>
                    <Icon name="expand_more" className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-bg-card border border-border-color rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-2 border-b border-border-color">
                        <div className="flex items-center gap-2 px-3 py-2 bg-bg-page rounded-lg">
                            <Icon name="search" className="text-text-muted text-sm" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search country..."
                                className="bg-transparent border-none outline-none text-sm w-full text-text-main placeholder-text-muted"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {filteredCountries.length > 0 ? (
                            filteredCountries.map(country => (
                                <button
                                    key={country.code}
                                    onClick={() => {
                                        onChange(country.code);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 text-sm hover:bg-bg-page transition-colors flex items-center justify-between ${
                                        value === country.code ? 'bg-accent-primary/10 text-accent-primary font-bold' : 'text-text-main'
                                    }`}
                                >
                                    <span>{country.name}</span>
                                    {value === country.code && <Icon name="check" className="text-accent-primary" />}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-sm text-text-muted text-center">
                                No countries found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
