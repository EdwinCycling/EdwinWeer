import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, Location } from '../types';
import { Icon } from '../components/Icon';
import { searchCityByName } from '../services/geoService';
import { getTranslation } from '../services/translations';
import { getUsage, deductBaroCredit, decrementLocalBaroCredit } from '../services/usageService';
import { fetchHistorical, mapWmoCodeToText, calculateComfortScore } from '../services/weatherService';
import { generateVintageNewspaper } from '../services/geminiService';
import { VintageNewspaper } from '../components/VintageNewspaper';

interface Props {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
}

export const BaroTimeMachineView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
    const t = (key: string) => getTranslation(key, settings.language);
    
    const [baroCredits, setBaroCredits] = useState<number>(0);
    const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
    const [citySearch, setCitySearch] = useState('');
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loadingCity, setLoadingCity] = useState(false);

    // Date State
    const [day, setDay] = useState<string>(new Date().getDate().toString().padStart(2, '0'));
    const [month, setMonth] = useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [year, setYear] = useState<string>((new Date().getFullYear() - 10).toString());

    const [isGenerating, setIsGenerating] = useState(false);
    const [showNewspaper, setShowNewspaper] = useState(false);
    const [newspaperData, setNewspaperData] = useState<any>(null);
    const [weatherContext, setWeatherContext] = useState<any>(null);

    useEffect(() => {
        const usage = getUsage();
        setBaroCredits(usage.baroCredits);
        
        // Load default location if available
        const savedLocation = localStorage.getItem('last_location');
        if (savedLocation) {
            try {
                setSelectedLocation(JSON.parse(savedLocation));
            } catch (e) {
                console.error("Failed to parse saved location", e);
            }
        }
    }, []);

    const handleCitySearch = async (query: string) => {
        setCitySearch(query);
        if (query.length < 2) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        setLoadingCity(true);
        try {
            const results = await searchCityByName(query);
            setSearchResults(results);
            setShowDropdown(true);
        } catch (error) {
            console.error("City search failed:", error);
        } finally {
            setLoadingCity(false);
        }
    };

    const handleSelectLocation = (loc: Location) => {
        setSelectedLocation(loc);
        setCitySearch('');
        setShowDropdown(false);
    };

    const handleGenerate = async () => {
        if (!selectedLocation) return;
        if (baroCredits < 1) return;

        setIsGenerating(true);
        try {
            const dateStr = `${year}-${month}-${day}`;
            
            // 1. Fetch historical data for the day
            const data = await fetchHistorical(selectedLocation.lat, selectedLocation.lon, dateStr, dateStr);
            
            if (!data.daily || !data.daily.time || data.daily.time.length === 0) {
                throw new Error("Geen weerdata gevonden voor deze datum.");
            }

            // 2. Fetch data for the week before
            const weekBefore = new Date(dateStr);
            weekBefore.setDate(weekBefore.getDate() - 7);
            const weekBeforeStr = weekBefore.toISOString().split('T')[0];
            
            const contextData = await fetchHistorical(selectedLocation.lat, selectedLocation.lon, weekBeforeStr, dateStr);

            // 3. Prepare data for newspaper
            const daily = data.daily;
            const weatherSummary = {
                maxTemp: daily.temperature_2m_max[0],
                minTemp: daily.temperature_2m_min[0],
                precipSum: daily.precipitation_sum[0],
                maxWind: daily.wind_speed_10m_max[0],
                morning: { temp: daily.temperature_2m_max[0] - 5, condition: mapWmoCodeToText(daily.weather_code[0], settings.language) },
                afternoon: { temp: daily.temperature_2m_max[0], condition: mapWmoCodeToText(daily.weather_code[0], settings.language) },
                evening: { temp: daily.temperature_2m_max[0] - 3, condition: mapWmoCodeToText(daily.weather_code[0], settings.language) },
                night: { temp: daily.temperature_2m_min[0], condition: mapWmoCodeToText(daily.weather_code[0], settings.language) }
            };

            const lastWeekWeather = [];
            if (contextData.daily) {
                for (let i = 0; i < 7; i++) {
                    if (contextData.daily.time[i]) {
                        lastWeekWeather.push({
                            date: contextData.daily.time[i],
                            maxTemp: contextData.daily.temperature_2m_max[i],
                            precipSum: contextData.daily.precipitation_sum[i],
                            condition: mapWmoCodeToText(contextData.daily.weather_code[i], settings.language)
                        });
                    }
                }
            }

            // 4. Calculate comfort score
            const comfortScore = calculateComfortScore({
                temperature_2m: (daily.temperature_2m_max[0] + daily.temperature_2m_min[0]) / 2,
                wind_speed_10m: daily.wind_speed_10m_max[0],
                relative_humidity_2m: 50,
                precipitation_sum: daily.precipitation_sum[0],
                cloud_cover: daily.weather_code[0] <= 1 ? 0 : 100,
                weather_code: daily.weather_code[0]
            });

            // 5. Generate with Gemini
            const result = await generateVintageNewspaper(
                weatherSummary,
                selectedLocation.name,
                dateStr,
                lastWeekWeather,
                settings.language
            );

            // 6. Deduct credit (Local update only, backend handles real deduction)
            decrementLocalBaroCredit();
            const usage = getUsage();
            setBaroCredits(usage.baroCredits);

            // 7. Show newspaper
            setWeatherContext({
                date: dateStr,
                location: selectedLocation.name,
                maxTemp: daily.temperature_2m_max[0],
                weatherCode: daily.weather_code[0],
                windSpeed: daily.wind_speed_10m_max[0],
                windDirection: daily.wind_direction_10m_dominant ? daily.wind_direction_10m_dominant[0] : 0,
                weatherScore: comfortScore.score
            });
            setNewspaperData(result);
            setShowNewspaper(true);

        } catch (error: any) {
            console.error("Time Machine Error:", error);
            alert(t('baro_time_machine.error') + " " + error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const months = Array.from({ length: 12 }, (_, i) => ({
        value: (i + 1).toString().padStart(2, '0'),
        label: t(`month.${['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][i]}`)
    }));

    const years = Array.from({ length: new Date().getFullYear() - 1940 + 1 }, (_, i) => (new Date().getFullYear() - i).toString());

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-4 mb-2">
                <button 
                    onClick={() => onNavigate(ViewState.CURRENT)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
                >
                    <Icon name="arrow_back" className="w-6 h-6" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold">{t('baro_time_machine.title')}</h1>
                    <p className="text-slate-500 dark:text-white/60">{t('baro_time_machine.subtitle')}</p>
                </div>
            </div>

            {/* Info Box */}
            <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-3xl p-6">
                <div className="flex gap-4">
                    <div className="size-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                        <Icon name="history_edu" className="text-2xl" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <h2 className="text-lg font-bold text-indigo-900 dark:text-indigo-300">{t('baro_time_machine.info_title')}</h2>
                        <p className="text-sm text-indigo-800/80 dark:text-indigo-300/60 leading-relaxed">
                            {t('baro_time_machine.info_text')}
                        </p>
                        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-indigo-100 dark:bg-indigo-500/20 rounded-full text-xs font-bold text-indigo-700 dark:text-indigo-400 w-fit">
                            <Icon name="stars" className="w-4 h-4" />
                            {t('baro_time_machine.cost')}
                        </div>
                    </div>
                </div>
            </div>

            {/* Credit Balance */}
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-3xl p-6 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                        <Icon name="toll" />
                    </div>
                    <div>
                        <span className="block text-xs text-slate-500 dark:text-white/40 font-bold uppercase tracking-wider">{t('baro_time_machine.credits_balance')}</span>
                        <span className="text-xl font-black">{baroCredits} Credits</span>
                    </div>
                </div>
                {baroCredits === 0 && (
                    <button 
                        onClick={() => onNavigate(ViewState.PRICING)}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-amber-500/20"
                    >
                        {t('baro_time_machine.get_credits')}
                    </button>
                )}
            </div>

            {/* Main Form */}
            <div className="bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-3xl p-6 md:p-8 space-y-8 shadow-xl shadow-slate-200/50 dark:shadow-none">
                {/* City Selection */}
                <div className="space-y-3">
                    <label className="text-sm font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider px-1">{t('baro_time_machine.select_city')}</label>
                    <div className="relative">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                <Icon name="location_on" />
                            </div>
                            <input
                                type="text"
                                value={selectedLocation ? selectedLocation.name : citySearch}
                                onChange={(e) => {
                                    if (selectedLocation) setSelectedLocation(null);
                                    handleCitySearch(e.target.value);
                                }}
                                placeholder={t('city_search.placeholder')}
                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                            />
                            {loadingCity && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                    <div className="size-5 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                                </div>
                            )}
                        </div>

                        {showDropdown && searchResults.length > 0 && (
                            <div className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                {searchResults.map((loc) => (
                                    <button
                                        key={`${loc.lat}-${loc.lon}`}
                                        onClick={() => handleSelectLocation(loc)}
                                        className="w-full px-6 py-4 text-left hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between transition-colors border-b border-slate-100 dark:border-white/5 last:border-0"
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900 dark:text-white">{loc.name}</span>
                                            <span className="text-xs text-slate-500 dark:text-white/40">{loc.admin1}{loc.country ? `, ${loc.country}` : ''}</span>
                                        </div>
                                        <Icon name="chevron_right" className="text-slate-300" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Date Selection */}
                <div className="space-y-3">
                    <label className="text-sm font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider px-1">{t('baro_time_machine.select_date')}</label>
                    <div className="grid grid-cols-3 gap-3 md:gap-4">
                        <div className="space-y-2">
                            <span className="text-[10px] font-bold uppercase text-slate-400 px-1">{t('baro_time_machine.day')}</span>
                            <div className="relative">
                                <select 
                                    value={day}
                                    onChange={(e) => setDay(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl px-4 py-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold appearance-none cursor-pointer text-slate-900 dark:text-white"
                                >
                                    {Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0')).map(d => (
                                        <option key={d} value={d} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{d}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <Icon name="expand_more" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <span className="text-[10px] font-bold uppercase text-slate-400 px-1">{t('baro_time_machine.month')}</span>
                            <div className="relative">
                                <select 
                                    value={month}
                                    onChange={(e) => setMonth(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl px-4 py-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold appearance-none cursor-pointer text-slate-900 dark:text-white"
                                >
                                    {months.map(m => (
                                        <option key={m.value} value={m.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{m.label}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <Icon name="expand_more" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <span className="text-[10px] font-bold uppercase text-slate-400 px-1">{t('baro_time_machine.year')}</span>
                            <div className="relative">
                                <select 
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl px-4 py-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold appearance-none cursor-pointer text-slate-900 dark:text-white"
                                >
                                    {years.map(y => (
                                        <option key={y} value={y} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{y}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <Icon name="expand_more" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Start Button or No Credits Warning */}
                {baroCredits > 0 ? (
                    <button
                        onClick={handleGenerate}
                        disabled={!selectedLocation || isGenerating}
                        className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-xl ${
                            !selectedLocation || isGenerating 
                            ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed shadow-none' 
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                    >
                        {isGenerating ? (
                            <>
                                <div className="size-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                                {t('baro_time_machine.generating')}
                            </>
                        ) : (
                            <>
                                <Icon name="print" className="text-2xl" />
                                {t('baro_time_machine.start_printing')}
                            </>
                        )}
                    </button>
                ) : (
                    <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl p-6 flex flex-col items-center text-center gap-3">
                        <div className="size-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                            <Icon name="error_outline" className="text-2xl" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-bold text-red-900 dark:text-red-300">{t('baro_time_machine.no_credits_title')}</h3>
                            <p className="text-sm text-red-800/60 dark:text-red-300/60">{t('baro_time_machine.no_credits_text')}</p>
                        </div>
                        <button 
                            onClick={() => onNavigate(ViewState.PRICING)}
                            className="mt-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors shadow-lg shadow-red-600/20"
                        >
                            {t('baro_time_machine.get_credits')}
                        </button>
                    </div>
                )}
            </div>

            {/* Newspaper Component */}
            {showNewspaper && newspaperData && (
                <VintageNewspaper 
                    data={newspaperData} 
                    onClose={() => setShowNewspaper(false)}
                    weatherData={weatherContext}
                    lang={settings.language}
                />
            )}
        </div>
    );
};
