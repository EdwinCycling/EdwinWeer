import React, { useState, useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import { ViewState, AppSettings, Location } from '../types';
import { Icon } from '../components/Icon';
import { loadCurrentLocation, saveCurrentLocation, loadLastKnownMyLocation, saveLastKnownMyLocation } from '../services/storageService';
import { fetchForecast, fetchHistorical } from '../services/weatherService';
import { getTranslation } from '../services/translations';
import { VintageWeatherStation } from '../components/VintageWeatherStation';
import { reverseGeocode, searchCityByName } from '../services/geoService';
import { FavoritesList } from '../components/FavoritesList';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const BarometerView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [currentPressure, setCurrentPressure] = useState<number | null>(null);
  const [yesterdayPressure, setYesterdayPressure] = useState<number | null>(null);
  const [temp, setTemp] = useState<number | null>(null);
  const [humidity, setHumidity] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Header State
  const [localTime, setLocalTime] = useState<string>('');
  const [showFavorites, setShowFavorites] = useState(false);
  const [loadingCity, setLoadingCity] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const t = (key: string) => getTranslation(key, settings.language);

  // Update storage when location changes
  useEffect(() => {
      saveCurrentLocation(location);
      loadData();
  }, [location]);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
        searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const loadData = async () => {
    try {
        setLoading(true);
        setError(null);

        // 1. Fetch Current Forecast
        const forecast = await fetchForecast(location.lat, location.lon);
        
        // Extract Data
        const currentP = forecast.current?.pressure_msl || forecast.hourly?.pressure_msl?.[0];
        const currentT = forecast.current?.temperature_2m;
        const currentH = forecast.current?.relative_humidity_2m;
        
        setCurrentPressure(currentP);
        setTemp(currentT);
        setHumidity(currentH);

        // Calculate Local Time
        if (forecast.utc_offset_seconds !== undefined) {
            const now = new Date();
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const localDate = new Date(utc + (forecast.utc_offset_seconds * 1000));
            setLocalTime(localDate.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', {
                hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h'
            }));
        }

        // Determine current hour for historical comparison
        let currentHour = new Date().getHours();
        if (forecast.current?.time) {
            try {
                const timeStr = forecast.current.time;
                const hourStr = timeStr.split('T')[1]?.split(':')[0];
                if (hourStr) currentHour = parseInt(hourStr, 10);
            } catch (e) {
                console.warn('Could not parse forecast time', e);
            }
        }

        // 2. Fetch Yesterday's Data
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        
        const history = await fetchHistorical(location.lat, location.lon, dateStr, dateStr);
        const yesterdayP = history.hourly?.pressure_msl?.[currentHour];
        setYesterdayPressure(yesterdayP);

    } catch (err) {
        console.error(err);
        setError('Failed to load barometer data');
    } finally {
        setLoading(false);
    }
  };

  // --- Header Handlers ---
  const cycleFavorite = (direction: 'next' | 'prev') => {
      if (settings.favorites.length === 0) return;
      const currentIndex = settings.favorites.findIndex(f => f.name === location.name); // Simple match
      let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      
      if (nextIndex >= settings.favorites.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = settings.favorites.length - 1;
      
      setLocation(settings.favorites[nextIndex]);
  };

  const searchCities = async () => {
      if (!searchQuery.trim()) return;
      setLoadingSearch(true);
      const results = await searchCityByName(searchQuery);
      setSearchResults(results);
      setLoadingSearch(false);
  };

  const handleSelectSearchResult = (loc: Location) => {
      setLocation(loc);
      setIsSearchOpen(false);
      setSearchQuery('');
      setSearchResults([]);
  };

  // --- Forecast Logic ---
  const getForecastDetails = () => {
      if (!currentPressure || !yesterdayPressure) return { title: t('loading'), desc: '', diffType: 'none' };
      
      const diff = currentPressure - yesterdayPressure;
            let diffKey = 'barometer.diff.none';
            let expKey = 'barometer.explanation.stable';

            // Thresholds based on 24h change
            // < 0.7 hPa: Stable
            // 0.7 - 3.0 hPa: Small
            // 3.0 - 6.0 hPa: Large
            // > 6.0 hPa: Very Large

            if (diff > 6) {
                diffKey = 'barometer.diff.very_large_rise';
                expKey = 'barometer.explanation.rise';
            } else if (diff > 0.7) {
                diffKey = 'barometer.diff.large_rise';
                if (diff < 3.0) diffKey = 'barometer.diff.small_rise';
                expKey = 'barometer.explanation.rise';
            } else if (diff > -0.7) {
                diffKey = 'barometer.diff.none';
                expKey = 'barometer.explanation.stable';
            } else if (diff > -6) {
                diffKey = 'barometer.diff.large_fall';
                if (diff > -3.0) diffKey = 'barometer.diff.small_fall';
                expKey = 'barometer.explanation.fall';
            } else {
                diffKey = 'barometer.diff.very_large_fall';
                expKey = 'barometer.explanation.fall';
            }

      return {
          title: t(diffKey),
          desc: t(expKey),
          diffVal: diff.toFixed(1)
      };
  };
  
  const details = getForecastDetails();

  const handleDownload = async () => {
    if (contentRef.current) {
        try {
            const dataUrl = await toPng(contentRef.current, {
                backgroundColor: settings.theme === 'dark' ? '#000000' : '#ffffff',
                cacheBust: true,
                pixelRatio: 2,
            });
            const link = document.createElement('a');
            link.download = `barometer-${new Date().toISOString().split('T')[0]}.png`;
            link.href = dataUrl;
            link.click();
        } catch (e) {
            console.error('Download failed', e);
        }
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'EdwinWeer Barometer',
                text: `Barometer: ${currentPressure} hPa (${details.title})`,
                url: window.location.href
            });
        } catch (e) {
            console.error('Share failed', e);
        }
    } else {
        // Fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(`EdwinWeer Barometer: ${currentPressure} hPa - ${details.title}`);
            alert(t('copied_to_clipboard') || 'Copied to clipboard');
        } catch (e) {
            console.error('Clipboard failed', e);
        }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black transition-colors overflow-x-hidden">
       <style>{`
          @media print {
            .no-print { display: none !important; }
            @page { margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; zoom: 0.8; }
          }
        `}</style>
       
       {/* --- Top Navigation Buttons (Fixed) --- */}
       <div className="fixed top-4 left-4 z-50 no-print">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full bg-white/50 hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/40 backdrop-blur-md transition-colors shadow-sm text-slate-700 dark:text-white">
                <Icon name="arrow_back_ios_new" />
            </button>
       </div>

       {/* --- Main Content --- */}
       <div className="flex-1 flex flex-col items-center pt-8 pb-10">
          
          {/* Location Header */}
          <div className="relative z-10 w-full max-w-md mx-auto mb-6 px-4">
                <div className="flex items-center justify-center relative">
                    <div className="text-center">
                        {loadingCity ? (
                             <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                        ) : (
                            <div className="flex flex-col items-center">
                                <h2 className="text-xl font-bold leading-tight flex items-center gap-1 drop-shadow-md text-slate-800 dark:text-white">
                                    <Icon name="location_on" className="text-primary text-lg" />
                                    {location.name}, {location.country}
                                </h2>
                                {localTime && (
                                    <p className="text-slate-500 dark:text-white/80 text-xs font-medium mt-1 flex items-center gap-1">
                                        <Icon name="schedule" className="text-[10px]" />
                                        {localTime}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
          </div>

          {loading ? (
             <div className="flex-1 flex items-center justify-center">
                 <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
             </div>
          ) : (
             <div className="flex flex-col items-center w-full" ref={contentRef}>
                
                {/* Vintage Weather Station */}
                <div className="mb-8">
                    <VintageWeatherStation 
                        pressure={currentPressure}
                        prevPressure={yesterdayPressure}
                        temp={temp}
                        humidity={humidity}
                        tempUnit={settings.tempUnit}
                        language={settings.language}
                    />
                </div>

                {/* Detailed Info Box */}
                <div className="w-full max-w-md px-6">
                    <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 p-5">
                        <h3 className="text-center text-lg font-bold text-slate-800 dark:text-white mb-1">
                            {details.title}
                        </h3>
                        <p className="text-center text-slate-600 dark:text-slate-300 text-sm mb-4">
                            {details.desc}
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4 border-t border-slate-200 dark:border-white/10 pt-4">
                            <div className="flex flex-col items-center">
                                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">{t('today')}</span>
                                <span className="text-xl font-bold text-slate-800 dark:text-white font-mono">{currentPressure} <span className="text-xs font-normal">hPa</span></span>
                            </div>
                            <div className="flex flex-col items-center border-l border-slate-200 dark:border-white/10">
                                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold text-center">Reference</span>
                                <span className="text-xl font-bold text-amber-600 dark:text-amber-500 font-mono">{yesterdayPressure} <span className="text-xs font-normal">hPa</span></span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Export Buttons */}
                <div className="w-full max-w-md px-6 mt-6 mb-10 no-print">
                    <div className="grid grid-cols-3 gap-3">
                        <button 
                            onClick={handleDownload}
                            className="flex flex-col items-center justify-center p-3 bg-slate-100 dark:bg-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                        >
                            <Icon name="download" className="text-xl mb-1 text-blue-500" />
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Download</span>
                        </button>
                        <button 
                            onClick={handleShare}
                            className="flex flex-col items-center justify-center p-3 bg-slate-100 dark:bg-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                        >
                            <Icon name="share" className="text-xl mb-1 text-green-500" />
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{t('share')}</span>
                        </button>
                        <button 
                            onClick={handlePrint}
                            className="flex flex-col items-center justify-center p-3 bg-slate-100 dark:bg-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                        >
                            <Icon name="print" className="text-xl mb-1 text-purple-500" />
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{t('print')}</span>
                        </button>
                    </div>
                </div>

             </div>
          )}
       </div>

        {/* Search Modal */}
        {isSearchOpen && (
            <div className="fixed top-20 right-6 z-[60] w-[340px] max-w-[90vw] bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-3 backdrop-blur-md">
                <div className="flex gap-2">
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            searchCities();
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && searchCities()}
                        placeholder={t('search')}
                        className="flex-1 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-800 dark:text-white placeholder-slate-600 dark:placeholder-white/30 focus:outline-none focus:border-primary"
                    />
                    <button
                        onClick={searchCities}
                        disabled={loadingSearch || !searchQuery.trim()}
                        className="px-3 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                    >
                        <Icon name={loadingSearch ? 'hourglass_empty' : 'arrow_forward'} />
                    </button>
                </div>
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {searchResults.map((res, idx) => (
                        <button
                            key={`${res.name}-${idx}`}
                            onClick={() => handleSelectSearchResult(res)}
                            className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-left"
                        >
                            <span className="text-sm font-medium text-slate-800 dark:text-white">{res.name}, {res.country}</span>
                            <Icon name="chevron_right" className="text-xs text-slate-400" />
                        </button>
                    ))}
                </div>
            </div>
        )}

        {/* Favorites Modal */}
        <FavoritesList 
            isOpen={showFavorites} 
            onClose={() => setShowFavorites(false)}
            favorites={settings.favorites}
            myLocation={loadLastKnownMyLocation()} // Pass saved my location
            onSelectLocation={(loc) => {
                setLocation(loc);
                setShowFavorites(false);
            }}
            settings={settings}
        />

    </div>
  );
};
