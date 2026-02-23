import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';
import { AppSettings } from '../types';

import { COUNTRIES, Country } from '../services/countries';

interface Props {
    value: string;
    onChange: (code: string) => void;
    language: AppSettings['language'];
}

export const CountrySelector: React.FC<Props> = ({ value, onChange, language }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    const t = (key: string) => getTranslation(key, language);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const selectedCountry = COUNTRIES.find(c => c.code === value) || COUNTRIES.find(c => c.code === 'NL');

    const filteredCountries = COUNTRIES.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase()) || 
        c.code.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative" ref={dropdownRef}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <Icon name="flag" className="text-text-main/80" />
                    <span className="font-medium text-text-main">{t('settings.country')}</span>
                </div>
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-bg-page rounded-lg border border-border-color hover:border-accent-primary transition-colors min-w-[140px] justify-between"
                >
                    <span className="text-sm font-medium truncate max-w-[100px]">{selectedCountry?.name}</span>
                    <Icon name="expand_more" className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {isOpen && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-bg-card border border-border-color rounded-xl shadow-xl z-50 max-h-80 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-2 border-b border-border-color sticky top-0 bg-bg-card z-10 rounded-t-xl">
                        <div className="relative">
                            <Icon name="search" className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-sm" />
                            <input 
                                type="text" 
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Zoek land..."
                                className="w-full bg-bg-page pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-accent-primary text-text-main placeholder:text-text-muted"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 p-1 scrollbar-thin">
                        {filteredCountries.map(country => (
                            <button
                                key={country.code}
                                onClick={() => {
                                    onChange(country.code);
                                    setIsOpen(false);
                                    setSearch('');
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                                    value === country.code 
                                        ? 'bg-accent-primary/10 text-accent-primary font-bold' 
                                        : 'text-text-main hover:bg-bg-page'
                                }`}
                            >
                                <span>{country.name}</span>
                                {value === country.code && <Icon name="check" className="text-xs" />}
                            </button>
                        ))}
                        {filteredCountries.length === 0 && (
                            <div className="p-4 text-center text-xs text-text-muted">
                                Geen landen gevonden
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
