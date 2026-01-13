import React, { useState, useEffect, useRef } from 'react';
import { ViewState, AppSettings, TripPlannerSettings, OpenMeteoResponse, Location } from '../types';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { calculateTripOptions, TripOption } from '../services/tripPlannerService';
import { fetchForecast } from '../services/weatherService';
import { loadCurrentLocation } from '../services/storageService';
import { searchCityByName } from '../services/geoService';
import { parseGpx, GPXPoint } from '../services/gpxService';
import { TripDetailModal } from '../components/TripDetailModal';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
}

export const TripPlannerView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
    const t = (key: string) => getTranslation(key, settings.language);
    
    // Default Settings
    const defaultPlannerSettings: TripPlannerSettings = {
        activity: 'cycling',
        startTime: '10:00',
        marginBefore: 1,
        marginAfter: 3,
        duration: 3,
        speed: 25,
        useGpxSpeed: false
    };

    const [plannerSettings, setPlannerSettings] = useState<TripPlannerSettings>(() => {
        const saved = settings.trip_planner || {};
        return {
            ...defaultPlannerSettings,
            ...saved,
            marginBefore: saved.marginBefore ?? defaultPlannerSettings.marginBefore,
            marginAfter: saved.marginAfter ?? defaultPlannerSettings.marginAfter,
            speed: saved.speed ?? defaultPlannerSettings.speed,
            useGpxSpeed: saved.useGpxSpeed ?? defaultPlannerSettings.useGpxSpeed
        };
    });

    const [targetDay, setTargetDay] = useState<'today' | 'tomorrow'>('today');
    const [results, setResults] = useState<TripOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [forecast, setForecast] = useState<OpenMeteoResponse | null>(null);
    
    // Local Location State
    const [location, setLocation] = useState<Location>(loadCurrentLocation());
    
    // Search State
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // GPX State
    const [gpxRoute, setGpxRoute] = useState<GPXPoint[]>([]);
    const [gpxName, setGpxName] = useState<string>('');
    const [selectedOption, setSelectedOption] = useState<TripOption | null>(null);

    // Focus search input when opening
    useEffect(() => {
        if (isSearchOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isSearchOpen]);

    // Handle Search
    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }

        setLoadingSearch(true);
        try {
            const results = await searchCityByName(query);
            setSearchResults(results);
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            setLoadingSearch(false);
        }
    };

    const selectLocation = (loc: Location) => {
        setLocation(loc);
        setIsSearchOpen(false);
        setSearchQuery('');
        setResults([]); // Clear results on location change
        setForecast(null); // Clear forecast
        // Clear GPX if manually selecting location
        setGpxRoute([]);
        setGpxName('');
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            try {
                const points = parseGpx(text);
                if (points.length > 0) {
                    setGpxRoute(points);
                    setGpxName(file.name.replace('.gpx', ''));
                    // Set location to start point
                    setLocation({
                        name: file.name.replace('.gpx', ''),
                        country: 'GPX Start',
                        lat: points[0].lat,
                        lon: points[0].lon,
                        timezone: 'Europe/Amsterdam' // Default or fetch?
                    });
                    // Reset results to force reload
                    setResults([]);
                    setForecast(null);
                }
            } catch (err) {
                console.error(err);
                setError(t('strava.error_no_points'));
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    // Save settings when they change
    const updatePlannerSettings = (newSettings: Partial<TripPlannerSettings>) => {
        const updated = { ...plannerSettings, ...newSettings };
        setPlannerSettings(updated);
        setResults([]); // Clear results on settings change
        onUpdateSettings({
            ...settings,
            trip_planner: updated
        });
    };

    const loadData = async (dayOverride?: 'today' | 'tomorrow') => {
        setLoading(true);
        setError('');
        const currentTargetDay = dayOverride || targetDay;
        try {
            let data = forecast;
            if (!data) {
                data = await fetchForecast(location.lat, location.lon);
                setForecast(data);
            }
            if (data) {
                const options = calculateTripOptions(data, plannerSettings, currentTargetDay, settings.language);
                setResults(options);
            }
        } catch (err) {
            console.error(err);
            setError(t('error_fetching_weather'));
        } finally {
            setLoading(false);
        }
    };

    // Auto-calculate when GPX is loaded
    // Removed auto-calc per user request


    // Helper to check if all results are "best" (low variance)
    const areAllResultsGood = () => {
        if (results.length < 2) return false;
        const scores = results.map(r => r.score);
        const max = Math.max(...scores);
        const min = Math.min(...scores);
        return max >= 8 && (max - min) < 1.5; // High scores and little difference
    };

    const StarRating = ({ score }: { score: number }) => {
        const stars = score / 2; // Convert 10-scale to 5-scale
        const fullStars = Math.floor(stars);
        const hasHalf = stars % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

        return (
            <div className="flex items-center gap-0.5" title={`Score: ${score}/10`}>
                {[...Array(fullStars)].map((_, i) => <Icon key={`f${i}`} name="star" className="text-lg text-amber-400" />)}
                {hasHalf && <Icon name="star_half" className="text-lg text-amber-400" />}
                {[...Array(emptyStars)].map((_, i) => <Icon key={`e${i}`} name="star" className="text-lg text-slate-200 dark:text-slate-700" />)}
            </div>
        );
    };

    const handleResultClick = (option: TripOption) => {
        if (gpxRoute.length > 0) {
            setSelectedOption(option);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-bg-page pb-24 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 text-text-main transition-colors duration-300">
             {/* Header */}
             <div className="sticky top-0 bg-bg-card/95 backdrop-blur z-20 border-b border-border-color transition-colors p-4 flex items-center justify-between">
                <div className="flex items-center">
                    <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-bg-page mr-2 transition-colors">
                        <Icon name="arrow_back_ios_new" />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold">{t('trip_planner.title')}</h1>
                    </div>
                </div>
            </div>

            <div className="p-4 space-y-6 max-w-3xl mx-auto w-full">
                
                {/* Settings Card */}
                <div className="bg-bg-card rounded-2xl p-5 shadow-sm border border-border-color space-y-5">
                    
                    {/* Location Search / GPX Upload */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
                            <label className="text-sm font-medium text-text-muted mb-1 block">{t('trip_planner.location')}</label>
                            <div 
                                onClick={() => setIsSearchOpen(true)}
                                className="flex items-center bg-bg-page border border-border-color rounded-xl p-3 cursor-pointer hover:bg-bg-page/80 transition-colors"
                            >
                                <Icon name="location_on" className="text-primary mr-2" />
                                <span className="font-bold truncate flex-1 text-text-main">{location.name}, {location.country}</span>
                                <Icon name="search" className="text-text-muted" />
                            </div>

                            {/* Search Dropdown */}
                            {isSearchOpen && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-bg-card rounded-xl shadow-xl border border-border-color z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    <div className="p-2 border-b border-border-color flex items-center gap-2">
                                        <Icon name="search" className="text-text-muted ml-2" />
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            placeholder={t('trip_planner.search_location')}
                                            className="w-full bg-transparent p-2 outline-none text-text-main placeholder:text-text-muted"
                                            value={searchQuery}
                                            onChange={(e) => handleSearch(e.target.value)}
                                        />
                                        <button onClick={() => setIsSearchOpen(false)} className="p-2 hover:bg-bg-page rounded-lg text-text-main">
                                            <Icon name="close" />
                                        </button>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto">
                                        {loadingSearch ? (
                                            <div className="p-4 text-center text-text-muted text-sm">Loading...</div>
                                        ) : searchResults.length > 0 ? (
                                            searchResults.map((loc, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => selectLocation(loc)}
                                                    className="w-full text-left p-3 hover:bg-bg-page flex items-center gap-3 transition-colors border-b border-border-color last:border-0"
                                                >
                                                    <div className="size-8 rounded-full bg-bg-page flex items-center justify-center flex-shrink-0">
                                                        <Icon name="location_city" className="text-text-muted text-sm" />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm text-text-main">{loc.name}</div>
                                                        <div className="text-xs text-text-muted">{loc.country}</div>
                                                    </div>
                                                </button>
                                            ))
                                        ) : searchQuery.length > 1 ? (
                                            <div className="p-4 text-center text-text-muted text-sm">{t('city_not_found')}</div>
                                        ) : null}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* GPX Upload */}
                        <div className="relative">
                             <label className="text-sm font-medium text-text-muted mb-1 block">{t('upload_gpx_short')} (Optioneel)</label>
                             <label className={`flex items-center justify-center border-2 border-dashed ${gpxRoute.length > 0 ? 'border-green-500 bg-green-50 dark:bg-green-500/10' : 'border-border-color hover:border-primary'} rounded-xl p-3 cursor-pointer transition-colors h-[50px]`}>
                                <input type="file" accept=".gpx" onChange={handleFileUpload} className="hidden" />
                                <div className="flex items-center gap-2 truncate">
                                    <Icon name={gpxRoute.length > 0 ? "check_circle" : "upload_file"} className={gpxRoute.length > 0 ? "text-green-500" : "text-text-muted"} />
                                    <span className={`text-sm font-bold truncate ${gpxRoute.length > 0 ? "text-green-700 dark:text-green-400" : "text-text-muted"}`}>
                                        {gpxRoute.length > 0 ? gpxName : t('select_gpx')}
                                    </span>
                                </div>
                             </label>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border-color">
                        <h2 className="font-bold text-lg flex items-center gap-2 text-text-main">
                            <Icon name="tune" className="text-primary" />
                            {t('trip_planner.settings')}
                        </h2>
                        
                        {/* Activity Toggle */}
                        <div className="flex bg-bg-page rounded-lg p-1">
                            <button 
                                onClick={() => {
                                    const newSpeed = 25;
                                    const dist = gpxRoute.length > 0 ? gpxRoute[gpxRoute.length - 1].distFromStart : 0;
                                    const newDuration = dist > 0 ? dist / newSpeed : plannerSettings.duration;
                                    updatePlannerSettings({ activity: 'cycling', speed: newSpeed, duration: newDuration });
                                }}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${plannerSettings.activity === 'cycling' ? 'bg-bg-card shadow text-primary' : 'text-text-muted'}`}
                            >
                                <div className="flex items-center gap-1">
                                    <Icon name="directions_bike" className="text-lg" />
                                    {t('trip_planner.cycling')}
                                </div>
                            </button>
                            <button 
                                onClick={() => {
                                    const newSpeed = 5;
                                    const dist = gpxRoute.length > 0 ? gpxRoute[gpxRoute.length - 1].distFromStart : 0;
                                    const newDuration = dist > 0 ? dist / newSpeed : plannerSettings.duration;
                                    updatePlannerSettings({ activity: 'walking', speed: newSpeed, duration: newDuration });
                                }}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${plannerSettings.activity === 'walking' ? 'bg-bg-card shadow text-primary' : 'text-text-muted'}`}
                            >
                                <div className="flex items-center gap-1">
                                    <Icon name="directions_walk" className="text-lg" />
                                    {t('trip_planner.walking')}
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Start Time */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-muted">{t('trip_planner.start_time')}</label>
                            <input 
                                type="time" 
                                value={plannerSettings.startTime}
                                onChange={(e) => updatePlannerSettings({ startTime: e.target.value })}
                                className="w-full bg-bg-page border border-border-color rounded-xl p-3 text-lg font-bold outline-none focus:ring-2 focus:ring-primary/50 text-text-main"
                            />
                        </div>

                        {/* Duration or Speed */}
                        <div className="space-y-2">
                            {gpxRoute.length > 0 ? (
                                <>
                                    <div className="flex justify-between">
                                        <label className="text-sm font-medium text-text-muted">
                                            {t('trip_planner.speed')} <span className="text-xs font-normal opacity-70">({t('trip_planner.speed_hint')})</span>
                                        </label>
                                        <span className="font-bold text-text-main">{plannerSettings.speed} km/u</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max={plannerSettings.activity === 'cycling' ? 45 : 10} 
                                        step="1"
                                        value={plannerSettings.speed}
                                        onChange={(e) => {
                                            const newSpeed = parseInt(e.target.value);
                                            const dist = gpxRoute[gpxRoute.length - 1].distFromStart;
                                            const newDuration = dist / newSpeed;
                                            updatePlannerSettings({ speed: newSpeed, duration: newDuration });
                                        }}
                                        className="w-full accent-primary h-2 bg-border-color rounded-lg appearance-none cursor-pointer relative z-10"
                                    />
                                    <div className="text-xs text-right text-text-muted">
                                        {t('trip_planner.calculated_duration')}: {Math.floor(plannerSettings.duration)}u {Math.round((plannerSettings.duration % 1) * 60)}m ({Math.round(gpxRoute[gpxRoute.length - 1].distFromStart)} km)
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex justify-between">
                                        <label className="text-sm font-medium text-text-muted">{t('trip_planner.duration')}</label>
                                        <span className="font-bold text-text-main">{plannerSettings.duration} {t('trip_planner.duration_hours')}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0.5" 
                                        max="8" 
                                        step="0.5"
                                        value={plannerSettings.duration}
                                        onChange={(e) => updatePlannerSettings({ duration: parseFloat(e.target.value) })}
                                        className="w-full accent-primary h-2 bg-border-color rounded-lg appearance-none cursor-pointer relative z-10"
                                    />
                                </>
                            )}
                        </div>

                        {/* Margins */}
                        <div className="space-y-4 md:col-span-2 pt-2">
                            {/* Margin Before */}
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <label className="text-sm font-medium text-text-muted">{t('trip_planner.margin_before')}</label>
                                    <span className="font-bold text-text-main">{plannerSettings.marginBefore ?? 1} {t('trip_planner.margin_hours')}</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="4" 
                                    step="1"
                                    value={plannerSettings.marginBefore ?? 1}
                                    onChange={(e) => updatePlannerSettings({ marginBefore: parseInt(e.target.value) })}
                                    className="w-full accent-primary h-2 bg-border-color rounded-lg appearance-none cursor-pointer relative z-10"
                                />
                            </div>

                            {/* Margin After */}
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <label className="text-sm font-medium text-text-muted">{t('trip_planner.margin_after')}</label>
                                    <span className="font-bold text-text-main">{plannerSettings.marginAfter ?? 3} {t('trip_planner.margin_hours')}</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="4" 
                                    step="1"
                                    value={plannerSettings.marginAfter ?? 3}
                                    onChange={(e) => updatePlannerSettings({ marginAfter: parseInt(e.target.value) })}
                                    className="w-full accent-primary h-2 bg-border-color rounded-lg appearance-none cursor-pointer relative z-10"
                                />
                            </div>

                            <p className="text-xs text-center text-text-muted mt-2">
                                {t('trip_planner.searching_text')} <span className="font-bold text-primary">{
                                    (() => {
                                        const [h, m] = plannerSettings.startTime.split(':').map(Number);
                                        const start = Math.max(0, h - (plannerSettings.marginBefore ?? 1));
                                        return `${String(start).padStart(2, '0')}:00`;
                                    })()
                                }</span> {t('trip_planner.and')} <span className="font-bold text-primary">{
                                    (() => {
                                        const [h, m] = plannerSettings.startTime.split(':').map(Number);
                                        const end = Math.min(23, h + (plannerSettings.marginAfter ?? 3));
                                        return `${String(end).padStart(2, '0')}:00`;
                                    })()
                                }</span>
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={loadData}
                        className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                    >
                        {loading ? <Icon name="refresh" className="animate-spin" /> : <Icon name="bolt" />}
                        {t('trip_planner.calculate')}
                    </button>
                </div>

                {/* Results Section */}
                <div className="space-y-4">
                    {/* Tabs */}
                    <div className="flex p-1 bg-bg-page rounded-xl border border-border-color">
                        <button 
                            onClick={() => { setTargetDay('today'); setResults([]); loadData('today'); }} 
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${targetDay === 'today' ? 'bg-bg-card shadow text-primary' : 'text-text-muted hover:text-text-main'}`}
                        >
                            {t('trip_planner.tab_today')}
                        </button>
                        <button 
                            onClick={() => { setTargetDay('tomorrow'); setResults([]); loadData('tomorrow'); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${targetDay === 'tomorrow' ? 'bg-bg-card shadow text-primary' : 'text-text-muted hover:text-text-main'}`}
                        >
                            {t('trip_planner.tab_tomorrow')}
                        </button>
                    </div>
                    
                    {results.length > 0 && areAllResultsGood() && (
                         <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-3 rounded-xl shadow-lg flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-2">
                            <Icon name="verified" />
                            <span className="font-bold">{t('trip_planner.all_good')}</span>
                         </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                            <Icon name="refresh" className="animate-spin text-3xl mb-2" />
                            <p>{t('loading')}</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="text-center py-12 text-text-muted">
                            <Icon name="event_busy" className="text-4xl mb-2 opacity-50" />
                            <p>{t('trip_planner.no_results')}</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {results.map((option, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => handleResultClick(option)}
                                    className={`w-full text-left relative bg-bg-card rounded-2xl p-4 border transition-all cursor-pointer group ${option.isBest && !areAllResultsGood() ? 'border-amber-400 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400' : option.isTargetTime ? 'border-primary shadow-lg shadow-primary/10' : 'border-border-color hover:border-text-muted'}`}
                                >
                                    {option.isBest && !areAllResultsGood() && (
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm flex items-center gap-1">
                                            <Icon name="emoji_events" className="text-sm" />
                                            {t('trip_planner.best_time')}
                                        </div>
                                    )}

                                    {option.isTargetTime && !option.isBest && (
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm flex items-center gap-1">
                                            <Icon name="check_circle" className="text-sm" />
                                            {t('trip_planner.your_choice')}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between mb-3 mt-2">
                                        <div className="flex items-center gap-3">
                                            <div className={`px-3 py-1.5 rounded-lg font-mono font-bold text-lg text-text-main ${option.isTargetTime ? 'bg-primary/10 text-primary' : 'bg-bg-page'}`}>
                                                {option.startTime} <span className="text-text-muted text-sm font-normal mx-1">-</span> {option.endTime}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <StarRating score={option.score} />
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{t('trip_planner.baro_index')}: {option.score}</span>
                                                <div className="group relative">
                                                    <Icon name="help_outline" className="text-[10px] text-text-muted cursor-help" />
                                                <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block bg-bg-card border border-border-color text-text-main text-[10px] p-2 rounded shadow-lg w-40 z-10">
                                                    {t('trip_planner.stars_hint')}
                                                </div>
                                            </div>
                                        </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 mb-4 text-text-main">
                                        <div className="flex items-center gap-1.5" title={t('wind_direction')}>
                                            <div 
                                                className="bg-bg-page size-8 rounded-full flex items-center justify-center"
                                                style={{ transform: `rotate(${option.windDirection}deg)` }}
                                            >
                                                <Icon name="arrow_downward" className="text-sm" />
                                            </div>
                                            <div className="flex flex-col leading-none">
                                                <span className="font-bold text-sm">{option.windDirectionText}</span>
                                                <span className="text-[10px] opacity-70">
                                                    {Math.round(option.minWind) === Math.round(option.maxWind) 
                                                        ? `${Math.round(option.maxWind)} km/u` 
                                                        : `${Math.round(option.minWind)}-${Math.round(option.maxWind)} km/u`}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="h-8 w-px bg-border-color" />

                                        <div className="flex items-center gap-1.5">
                                            <Icon name="thermostat" className="text-text-muted" />
                                            <span className="font-bold">{Math.round(option.avgTemp)}°</span>
                                        </div>

                                        <div className="h-8 w-px bg-border-color" />

                                        <div className="flex items-center gap-1.5">
                                            <Icon name="water_drop" className={option.maxRain > 30 ? 'text-blue-500' : 'text-text-muted'} />
                                            <span className="font-bold">{Math.round(option.maxRain)}%</span>
                                        </div>

                                        <div className="h-8 w-px bg-border-color" />

                                        <div className="flex items-center gap-1.5" title="Zonkans">
                                            <Icon name="wb_sunny" className={option.avgSunChance > 50 ? 'text-orange-500' : 'text-text-muted'} />
                                            <span className="font-bold">{Math.round(option.avgSunChance)}%</span>
                                        </div>
                                    </div>

                                    {/* Warnings / Details */}
                                    {(option.details.length > 0 || option.windVariation) && (
                                        <div className="space-y-1 pt-3 border-t border-border-color">
                                            {option.windVariation && (
                                                <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                                                    <Icon name="rotate_right" className="text-sm mt-0.5" />
                                                    <span>{option.windVariationText}</span>
                                                </div>
                                            )}
                                            {option.details.map((detail, i) => (
                                                <div key={i} className="flex items-start gap-2 text-xs text-text-muted">
                                                    <Icon name="info" className="text-sm mt-0.5 opacity-70" />
                                                    <span>{detail}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Detail Button */}
                                    {gpxRoute.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-border-color flex justify-end">
                                            <button className="bg-bg-page hover:bg-bg-page/80 text-text-main font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2 transition-colors">
                                                <Icon name="visibility" className="text-lg" />
                                                Detail
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Modal */}
            {selectedOption && forecast && (
                <TripDetailModal
                    isOpen={!!selectedOption}
                    onClose={() => setSelectedOption(null)}
                    tripOption={selectedOption}
                    gpxRoute={gpxRoute}
                    gpxName={gpxName}
                    settings={settings}
                    forecast={forecast}
                    speedKmH={plannerSettings.speed || (plannerSettings.activity === 'cycling' ? 25 : 5)}
                />
            )}
        </div>
    );
};
