import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, CustomEvent, Location } from '../types';
import { Icon } from '../components/Icon';
import { saveCustomEvents, loadCustomEvents } from '../services/storageService';
import { searchCityByName } from '../services/geoService';
import { getTranslation } from '../services/translations';
import { useAuth } from '../contexts/AuthContext';
import { getUsage } from '../services/usageService';
import { Modal } from '../components/Modal';

interface Props {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
}

const MAX_EVENTS = 10;
const MONTHS = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];

const DateSelector = ({ value, onChange, label, optional = false }: { value: string, onChange: (val: string) => void, label: string, optional?: boolean }) => {
    const [month, setMonth] = useState('');
    const [day, setDay] = useState('');

    useEffect(() => {
        if (value) {
            const [m, d] = value.split('-');
            setMonth(m);
            setDay(d);
        } else {
            setMonth('');
            setDay('');
        }
    }, [value]);

    const handleUpdate = (m: string, d: string) => {
        if (m && d) {
            onChange(`${m}-${d}`);
        } else if (optional && !m && !d) {
            onChange('');
        }
    };

    return (
        <div>
            <label className="block text-sm font-medium mb-2">{label}</label>
            <div className="flex gap-2">
                <select 
                    value={month} 
                    onChange={(e) => {
                        setMonth(e.target.value);
                        handleUpdate(e.target.value, day);
                    }}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3"
                >
                    <option value="" disabled={!optional}>Maand</option>
                    {optional && <option value="">- Geen -</option>}
                    {MONTHS.map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                    ))}
                </select>
                <select 
                    value={day} 
                    onChange={(e) => {
                        setDay(e.target.value);
                        handleUpdate(month, e.target.value);
                    }}
                    className="w-24 bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3"
                >
                    <option value="" disabled={!optional}>Dag</option>
                    {optional && <option value="">-</option>}
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export const YourDayView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
    const { user } = useAuth();
    const t = (key: string) => getTranslation(key, settings.language);
    
    const [events, setEvents] = useState<CustomEvent[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [currentEvent, setCurrentEvent] = useState<Partial<CustomEvent>>({});
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [baroCredits, setBaroCredits] = useState(0);
    
    // Location Search State
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loadingCity, setLoadingCity] = useState(false);
    
    const hasBaroProfile = settings.baroProfiles && settings.baroProfiles.length > 0;

    useEffect(() => {
        const loadedEvents = loadCustomEvents();
        setEvents(loadedEvents);
        
        const usage = getUsage();
        setBaroCredits(usage.baroCredits);
    }, []);

    const handleSaveEvents = (newEvents: CustomEvent[]) => {
        setEvents(newEvents);
        saveCustomEvents(newEvents);
    };

    const handleAddNew = () => {
        if (events.length >= MAX_EVENTS) return;
        setCurrentEvent({
            id: crypto.randomUUID(),
            active: true,
            date: '',
            location: settings.baroProfiles?.[0] ? { 
                name: settings.baroProfiles[0].location,
                country: '', 
                lat: 0, 
                lon: 0 
            } : { name: '', country: '', lat: 0, lon: 0 }
        });
        setIsEditing(true);
    };

    const handleEdit = (event: CustomEvent) => {
        setCurrentEvent({ ...event });
        setIsEditing(true);
    };

    const handleDelete = (id: string) => {
        if (confirm(t('Are you sure you want to delete this event?'))) {
            const newEvents = events.filter(e => e.id !== id);
            handleSaveEvents(newEvents);
        }
    };

    const handleSaveCurrent = () => {
        if (!currentEvent.name || !currentEvent.date || !currentEvent.profileId || !currentEvent.location?.name) {
            alert(t('Please fill in all required fields'));
            return;
        }

        const newEvent = currentEvent as CustomEvent;
        
        let newEvents = [...events];
        const index = newEvents.findIndex(e => e.id === newEvent.id);
        if (index >= 0) {
            newEvents[index] = newEvent;
        } else {
            newEvents.push(newEvent);
        }
        
        handleSaveEvents(newEvents);
        setIsEditing(false);
        setCurrentEvent({});
    };

    const handleLocationSearch = async (query: string) => {
        setCurrentEvent(prev => ({ ...prev, location: { ...prev.location!, name: query } }));
        if (!query.trim()) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }
        
        setLoadingCity(true);
        try {
            const results = await searchCityByName(query, settings.language);
            setSearchResults(results);
            setShowDropdown(results.length > 0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingCity(false);
        }
    };

    const selectCity = (city: Location) => {
        setCurrentEvent(prev => ({ ...prev, location: city }));
        setSearchResults([]);
        setShowDropdown(false);
    };

    const handleProfileChange = (profileId: string) => {
        const profile = settings.baroProfiles?.find(p => p.id === profileId);
        if (profile) {
            searchCityByName(profile.location, settings.language).then(results => {
                if (results.length > 0) {
                    setCurrentEvent(prev => ({
                        ...prev,
                        profileId,
                        location: results[0]
                    }));
                } else {
                    setCurrentEvent(prev => ({
                        ...prev,
                        profileId,
                        location: { name: profile.location, country: '', lat: 0, lon: 0 }
                    }));
                }
            });
        } else {
            setCurrentEvent(prev => ({ ...prev, profileId }));
        }
    };

    return (
        <div className="space-y-6 pb-24 animate-in fade-in">
            {/* Header */}
            <div className="flex items-center justify-between sticky top-0 bg-slate-50 dark:bg-background-dark z-10 py-4">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => onNavigate(ViewState.SETTINGS)} 
                        className="p-2 -ml-2 hover:bg-white dark:hover:bg-white/10 rounded-full transition-colors"
                    >
                        <Icon name="arrow_back" className="text-xl" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Weerbericht Jouw Dag</h1>
                    </div>
                </div>
                <button 
                    onClick={() => setShowInfoModal(true)}
                    className="p-2 hover:bg-white dark:hover:bg-white/10 rounded-full transition-colors text-primary"
                >
                    <Icon name="info" className="text-xl" />
                </button>
            </div>

            {/* Explanation / Credit Status */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                    Ontvang persoonlijke weerberichten voor speciale dagen (verjaardag, trouwdag, etc.).
                    Baro stuurt updates vanaf 10 dagen van tevoren.
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                    <Icon name="diamond" className="text-primary" />
                    <span>Baro Credits: {baroCredits}</span>
                    {baroCredits <= 0 && (
                        <a href="#" className="text-primary underline ml-2">Koop credits</a>
                    )}
                </div>
            </div>

            {!hasBaroProfile && (
                <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-xl border border-red-100 dark:border-red-800 text-center">
                    <h3 className="font-bold text-red-800 dark:text-red-200 mb-2">Baro Profiel Vereist</h3>
                    <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                        Om deze functie te gebruiken heb je een Baro profiel nodig.
                    </p>
                    <button
                        onClick={() => onNavigate(ViewState.SETTINGS)}
                        className="bg-primary text-white px-6 py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors"
                    >
                        Profiel Aanmaken
                    </button>
                </div>
            )}

            {hasBaroProfile && (
                <>
                    {isEditing ? (
                        <div className="bg-white dark:bg-card-dark rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-white/5 space-y-6">
                            <h2 className="text-lg font-bold">{currentEvent.id ? 'Bewerk Dag' : 'Nieuwe Dag'}</h2>
                            
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Naam (max 40 karakters) *</label>
                                <input
                                    type="text"
                                    maxLength={40}
                                    value={currentEvent.name || ''}
                                    onChange={e => setCurrentEvent({ ...currentEvent, name: e.target.value })}
                                    className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3"
                                    placeholder="Bijv. Verjaardag, Trouwdag..."
                                />
                            </div>

                            {/* Date Selector */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <DateSelector 
                                    label="Datum *" 
                                    value={currentEvent.date || ''} 
                                    onChange={val => setCurrentEvent({ ...currentEvent, date: val })} 
                                />
                                <DateSelector 
                                    label="Periode t/m (Optioneel)" 
                                    value={currentEvent.endDate || ''} 
                                    onChange={val => setCurrentEvent({ ...currentEvent, endDate: val })} 
                                    optional
                                />
                            </div>

                            {/* Profile */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Profiel Keuze *</label>
                                <select
                                    value={currentEvent.profileId || ''}
                                    onChange={e => handleProfileChange(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3"
                                >
                                    <option value="" disabled>Selecteer een profiel</option>
                                    {settings.baroProfiles?.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Location */}
                            <div>
                                <label className="block text-sm font-medium mb-2">Locatie *</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={currentEvent.location?.name || ''}
                                        onChange={e => handleLocationSearch(e.target.value)}
                                        className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3"
                                        placeholder="Zoek locatie..."
                                    />
                                    {loadingCity && (
                                        <div className="absolute right-3 top-3">
                                            <Icon name="sync" className="animate-spin text-slate-400" />
                                        </div>
                                    )}
                                    {showDropdown && searchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg max-h-48 overflow-y-auto z-50">
                                            {searchResults.map((city, index) => (
                                                <button
                                                    key={`${city.name}-${index}`}
                                                    onClick={() => selectCity(city)}
                                                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 text-sm border-b border-slate-100 dark:border-white/5"
                                                >
                                                    <span className="font-bold block">{city.name}</span>
                                                    <span className="text-xs text-slate-500">{city.country}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Active */}
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-medium">Actief</label>
                                <button
                                    onClick={() => setCurrentEvent({ ...currentEvent, active: !currentEvent.active })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                        currentEvent.active ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                            currentEvent.active ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={handleSaveCurrent}
                                    className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary/90 transition-colors"
                                >
                                    Opslaan
                                </button>
                                <button
                                    onClick={() => { setIsEditing(false); setCurrentEvent({}); }}
                                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-white font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors"
                                >
                                    Annuleren
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {events.map(event => (
                                <div key={event.id} className="bg-white dark:bg-card-dark p-4 rounded-2xl border border-slate-200 dark:border-white/5 flex items-center justify-between">
                                    <div>
                                        <h3 className="font-bold text-lg">{event.name}</h3>
                                        <p className="text-sm text-slate-500 dark:text-white/60">
                                            {event.date} {event.endDate ? `- ${event.endDate}` : ''} • {event.location.name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-xs px-2 py-0.5 rounded-md ${event.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500'}`}>
                                                {event.active ? 'Actief' : 'Inactief'}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                {settings.baroProfiles?.find(p => p.id === event.profileId)?.name || 'Onbekend profiel'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleEdit(event)}
                                            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-400 hover:text-primary transition-colors"
                                        >
                                            <Icon name="edit" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(event.id)}
                                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <Icon name="delete" />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {events.length === 0 && (
                                <div className="text-center py-12 text-slate-400">
                                    <Icon name="event" className="text-4xl mb-2 mx-auto opacity-50" />
                                    <p>Nog geen dagen ingesteld.</p>
                                </div>
                            )}

                            {events.length < MAX_EVENTS && (
                                <button
                                    onClick={handleAddNew}
                                    className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 text-slate-400 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2 font-bold"
                                >
                                    <Icon name="add" />
                                    Nieuwe Dag Toevoegen
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}

            <Modal isOpen={showInfoModal} onClose={() => setShowInfoModal(false)} title="Over Jouw Dag">
                <div className="space-y-4">
                    <p>
                        Met "Weerbericht Jouw Dag" ontvang je speciale weerberichten voor jouw belangrijke momenten.
                    </p>
                    
                    <div>
                        <h4 className="font-bold mb-1">Hoe het werkt:</h4>
                        <ul className="list-disc list-inside text-sm space-y-1 text-slate-600 dark:text-slate-300">
                            <li>Kies een datum en locatie.</li>
                            <li>Selecteer een Baro profiel.</li>
                            <li>Je ontvangt emails op specifieke momenten voor de dag.</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-bold mb-1">Email Schema:</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Baro stuurt updates op de volgende dagen voor het event:
                        </p>
                        <div className="grid grid-cols-5 gap-2 mt-2 text-center text-xs">
                            {[10, 7, 6, 5, 4, 3, 2, 1, 0].map(d => (
                                <div key={d} className="bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    {d === 0 ? 'Op de dag' : `${d} dagen`}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold mb-1">Credits:</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Voor elk verstuurd weerbericht wordt 1 Baro Credit afgeboekt.
                            Zorg dat je voldoende credits hebt!
                        </p>
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-white/10">
                        <button 
                            onClick={() => { setShowInfoModal(false); onNavigate(ViewState.PRICING); }}
                            className="block w-full bg-primary text-white text-center py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors"
                        >
                            Bekijk Prijzen & Credits
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
