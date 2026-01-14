import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, CustomEvent, Location } from '../types';
import { Icon } from '../components/Icon';
import { saveCustomEvents, loadCustomEvents } from '../services/storageService';
import { searchCityByName } from '../services/geoService';
import { getTranslation } from '../services/translations';
import { useAuth } from '../hooks/useAuth';
import { getUsage, UsageStats } from '../services/usageService';
import { Modal } from '../components/Modal';

interface Props {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
}

const MAX_EVENTS = 10;

const DateSelector = ({ value, onChange, label, optional = false, t }: { value: string, onChange: (val: string) => void, label: string, optional?: boolean, t: (key: string) => string }) => {
    const [month, setMonth] = useState('');
    const [day, setDay] = useState('');

    const months = [
        t('month.jan'), t('month.feb'), t('month.mar'), t('month.apr'), 
        t('month.may'), t('month.jun'), t('month.jul'), t('month.aug'), 
        t('month.sep'), t('month.oct'), t('month.nov'), t('month.dec')
    ];

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
                    className="flex-1 bg-bg-input rounded-xl px-4 py-3 text-text-main"
                >
                    <option value="" disabled={!optional}>{t('date.month')}</option>
                    {optional && <option value="">- {t('none')} -</option>}
                    {months.map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                    ))}
                </select>
                <select 
                    value={day} 
                    onChange={(e) => {
                        setDay(e.target.value);
                        handleUpdate(month, e.target.value);
                    }}
                    className="w-24 bg-bg-input rounded-xl px-4 py-3 text-text-main"
                >
                    <option value="" disabled={!optional}>{t('date.day')}</option>
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
    const t = (key: string) => getTranslation(key, settings.language);
    
    const [events, setEvents] = useState<CustomEvent[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [currentEvent, setCurrentEvent] = useState<Partial<CustomEvent>>({});
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [baroCredits, setBaroCredits] = useState<number>(0);
    
    // Location Search State
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loadingCity, setLoadingCity] = useState(false);
    
    useEffect(() => {
        const loadedEvents = loadCustomEvents();
        setEvents(loadedEvents);
        
        const usage = getUsage();
        setBaroCredits(usage.baroCredits);
        
        // Listen for usage updates if needed, but simple load on mount is usually enough
        // or we could interval check if we expect it to change
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
            duration: 1,
            location: { name: '', country: '', lat: 0, lon: 0 },
            recurring: false,
            year: new Date().getFullYear()
        });
        setIsEditing(true);
    };

    const handleEdit = (event: CustomEvent) => {
        setCurrentEvent({ ...event, duration: event.duration || 1 });
        setIsEditing(true);
    };

    const handleDelete = (id: string) => {
        setDeleteId(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = () => {
        if (deleteId) {
            const newEvents = events.filter(e => e.id !== deleteId);
            handleSaveEvents(newEvents);
            setShowDeleteModal(false);
            setDeleteId(null);
        }
    };

    const handleSaveCurrent = () => {
        if (!currentEvent.name || !currentEvent.date || !currentEvent.location?.name) {
            alert(t('yourday.fill_required'));
            return;
        }

        const newEvent = currentEvent as CustomEvent;
        // Ensure duration is set
        if (!newEvent.duration) newEvent.duration = 1;
        // Clear endDate if we use duration
        delete newEvent.endDate;
        
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

    return (
        <div className="space-y-6 pb-24 animate-in fade-in bg-bg-page min-h-screen">
            {/* Header */}
            <div className="flex items-center justify-between sticky top-0 bg-bg-card z-10 py-4 px-4 border-b border-border-color">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => onNavigate(ViewState.SETTINGS)} 
                        className="p-2 -ml-2 hover:bg-bg-page rounded-full transition-colors text-text-main"
                    >
                        <Icon name="arrow_back" className="text-xl" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-text-main">{t('yourday.title')}</h1>
                    </div>
                </div>
                <button 
                    onClick={() => setShowInfoModal(true)}
                    className="p-2 hover:bg-bg-page rounded-full transition-colors text-accent-primary"
                >
                    <Icon name="info" className="text-xl" />
                </button>
            </div>

            <div className="px-4 space-y-6">

            {/* Explanation / Credit Status */}
            <div className="bg-accent-primary/10 p-4 rounded-xl border border-accent-primary/20">
                <p className="text-sm text-text-muted">
                    {t('yourday.explanation')}
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm font-bold text-text-main">
                    <Icon name="diamond" className="text-accent-primary" />
                    <span>{t('yourday.credits')}: {baroCredits}</span>
                    {baroCredits <= 0 && (
                        <button 
                            onClick={() => onNavigate(ViewState.PRICING)}
                            className="text-accent-primary underline ml-2 hover:text-accent-primary/80"
                        >
                            {t('yourday.buy_credits')}
                        </button>
                    )}
                </div>
            </div>

            {isEditing ? (
                        <div className="bg-bg-card rounded-3xl p-6 shadow-sm border border-border-color space-y-6">
                            <h2 className="text-lg font-bold text-text-main">{currentEvent.id ? t('yourday.edit_day') : t('yourday.new_day')}</h2>
                            
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium mb-2 text-text-main">{t('yourday.name_label')}</label>
                                <input
                                    type="text"
                                    maxLength={40}
                                    value={currentEvent.name || ''}
                                    onChange={e => setCurrentEvent({ ...currentEvent, name: e.target.value })}
                                    className="w-full bg-bg-input rounded-xl px-4 py-3 border border-border-color text-text-main"
                                    placeholder={t('yourday.name_placeholder')}
                                />
                            </div>

                            {/* Date Selector */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-text-main">
                                <div className="space-y-4">
                                    <DateSelector 
                                        label={t('yourday.date_label')}
                                        value={currentEvent.date || ''} 
                                        onChange={val => setCurrentEvent({ ...currentEvent, date: val })}
                                        t={t}
                                    />
                                    
                                    {/* Recurring & Year */}
                                    <div className="flex items-center gap-4 bg-bg-page p-3 rounded-xl border border-border-color">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="recurring"
                                                checked={currentEvent.recurring || false}
                                                onChange={e => setCurrentEvent({ ...currentEvent, recurring: e.target.checked })}
                                                className="w-5 h-5 rounded text-accent-primary focus:ring-accent-primary bg-bg-input border-border-color"
                                            />
                                            <label htmlFor="recurring" className="text-sm font-medium text-text-main">
                                                {t('yourday.recurring') || 'Herhalend per kalenderjaar'}
                                            </label>
                                        </div>
                                        
                                        {!currentEvent.recurring && (
                                            <div className="flex items-center gap-2 ml-auto">
                                                <label className="text-sm text-text-muted">{t('yourday.year') || 'Jaar'}:</label>
                                                <input
                                                    type="number"
                                                    min="1900"
                                                    max="2100"
                                                    value={currentEvent.year || new Date().getFullYear()}
                                                    onChange={e => setCurrentEvent({ ...currentEvent, year: parseInt(e.target.value) })}
                                                    className="w-20 bg-bg-input rounded-lg px-2 py-1 text-sm border border-border-color text-text-main"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Duration Slider */}
                                <div>
                                    <label className="block text-sm font-medium mb-2 text-text-main">
                                        {t('yourday.duration_label')}: {currentEvent.duration || 1} {t('holiday_report.days')}
                                    </label>
                                    <div className="flex items-center gap-4 bg-bg-input rounded-xl px-4 py-3 h-[48px] border border-border-color">
                                        <span className="text-xs text-text-muted">1</span>
                                        <input 
                                            type="range"
                                            min="1"
                                            max="14"
                                            value={currentEvent.duration || 1}
                                            onChange={(e) => setCurrentEvent({ ...currentEvent, duration: parseInt(e.target.value) })}
                                            className="w-full accent-accent-primary"
                                        />
                                        <span className="text-xs text-text-muted">14</span>
                                    </div>
                                </div>
                            </div>

                            {/* Location */}
                            <div>
                                <label className="block text-sm font-medium mb-2 text-text-main">{t('yourday.location_label')}</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={currentEvent.location?.name || ''}
                                        onChange={e => handleLocationSearch(e.target.value)}
                                        className="w-full bg-bg-input rounded-xl px-4 py-3 border border-border-color focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all text-text-main"
                                        placeholder={t('yourday.search_location')}
                                    />
                                    {loadingCity && (
                                        <div className="absolute right-3 top-3">
                                            <Icon name="sync" className="animate-spin text-text-muted" />
                                        </div>
                                    )}
                                    {showDropdown && searchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border-color rounded-xl shadow-lg max-h-48 overflow-y-auto z-50">
                                            {searchResults.map((city, index) => (
                                                <button
                                                    key={`${city.name}-${index}`}
                                                    onClick={() => selectCity(city)}
                                                    className="w-full text-left px-4 py-3 hover:bg-bg-page text-sm border-b border-border-color last:border-0"
                                                >
                                                    <span className="font-bold block text-text-main">{city.name}</span>
                                                    <span className="text-xs text-text-muted">{city.country}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Active */}
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-medium text-text-main">{t('yourday.active')}</label>
                                <button
                                    onClick={() => setCurrentEvent({ ...currentEvent, active: !currentEvent.active })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                        currentEvent.active ? 'bg-accent-primary' : 'bg-bg-input'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-bg-card transition-transform ${
                                            currentEvent.active ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={handleSaveCurrent}
                                    className="flex-1 bg-accent-primary text-text-inverse font-bold py-3 rounded-xl hover:bg-accent-primary/90 transition-colors"
                                >
                                    {t('yourday.save')}
                                </button>
                                <button
                                    onClick={() => { setIsEditing(false); setCurrentEvent({}); }}
                                    className="flex-1 bg-bg-input text-text-main font-bold py-3 rounded-xl hover:bg-bg-page transition-colors"
                                >
                                    {t('yourday.cancel')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {events.map(event => (
                                <div key={event.id} className="bg-bg-card p-4 rounded-2xl border border-border-color flex items-center justify-between">
                                    <div>
                                        <h3 className="font-bold text-lg text-text-main">{event.name}</h3>
                                        <p className="text-sm text-text-muted">
                                            {event.date} • {event.duration || 1} {t('holiday_report.days')} • {event.location.name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-xs px-2 py-0.5 rounded-md ${event.active ? 'bg-green-500/10 text-green-600' : 'bg-bg-input text-text-muted'}`}>
                                                {event.active ? t('yourday.active') : t('yourday.inactive')}
                                            </span>
                                            <span className="text-xs text-text-muted">
                                                {event.recurring ? t('yourday.recurring') : `${t('yourday.year')}: ${event.year}`}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleEdit(event)}
                                            className="p-2 bg-bg-input rounded-xl hover:bg-bg-page text-text-main"
                                        >
                                            <Icon name="edit" className="text-lg" />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(event.id)}
                                            className="p-2 bg-red-500/10 text-red-600 rounded-xl hover:bg-red-500/20"
                                        >
                                            <Icon name="delete" className="text-lg" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            
                            {events.length < MAX_EVENTS && (
                                <button
                                    onClick={handleAddNew}
                                    className="w-full py-4 border-2 border-dashed border-border-color rounded-2xl text-text-muted font-bold hover:border-accent-primary hover:text-accent-primary transition-colors flex items-center justify-center gap-2"
                                >
                                    <Icon name="add" />
                                    <span>{t('yourday.new_day')}</span>
                                </button>
                            )}
                        </div>
                    )}
            </div>

            {showDeleteModal && (
                <Modal isOpen={true} onClose={() => setShowDeleteModal(false)} title={t('yourday.delete_title')}>
                    <div className="space-y-4">
                        <p>{t('yourday.delete_confirm')}</p>
                        <div className="flex gap-4">
                            <button
                                onClick={confirmDelete}
                                className="flex-1 bg-red-600 text-white font-bold py-2 rounded-xl hover:bg-red-700 transition-colors"
                            >
                                {t('yourday.delete_title')}
                            </button>
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 bg-bg-input text-text-main font-bold py-2 rounded-xl hover:bg-bg-page transition-colors"
                            >
                                {t('yourday.cancel')}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {showInfoModal && (
                <Modal onClose={() => setShowInfoModal(false)} title={t('yourday.title')}>
                    <div className="space-y-4">
                        <p>{t('yourday.explanation')}</p>
                    </div>
                </Modal>
            )}
        </div>
    );
};
