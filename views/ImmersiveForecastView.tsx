
import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse } from '../types';
import { Icon } from '../components/Icon';
import { loadCurrentLocation, saveSettings } from '../services/storageService';
import { ImmersiveForecast } from '../components/immersive/ImmersiveForecast';
import { fetchForecast, convertWind } from '../services/weatherService';
import { CompactHourlyChart } from '../components/CompactHourlyChart';
import { getTranslation } from '../services/translations';
import { Toast } from '../components/Toast';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const ImmersiveForecastView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [weatherData, setWeatherData] = useState<OpenMeteoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [startWithImmersive, setStartWithImmersive] = useState(settings.startWithImmersive || false);
  
  // Side panel state
  const [sidePanel, setSidePanel] = useState<'outlook' | 'history' | null>(null);
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  useEffect(() => {
    // Show swipe hint on mobile only
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        // Delay slightly
        const timer = setTimeout(() => setShowSwipeHint(true), 2000);
        return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
        setLoading(true);
        try {
            // Fetch with past days to support history view
            const data = await fetchForecast(location.lat, location.lon, undefined, 2);
            setWeatherData(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    loadData();
  }, [location.lat, location.lon, settings]);

  const toggleStartWithImmersive = () => {
      const newState = !startWithImmersive;
      setStartWithImmersive(newState);
      saveSettings({ ...settings, startWithImmersive: newState });
  };

  const getChartData = (type: 'outlook' | 'history') => {
      if (!weatherData) return [];

      const currentHourIndex = getCurrentHourIndex(weatherData);
      let startIndex, endIndex;

      if (type === 'outlook') {
          startIndex = currentHourIndex;
          endIndex = Math.min(startIndex + 48, weatherData.hourly.time.length);
      } else {
          startIndex = Math.max(0, currentHourIndex - 24);
          endIndex = currentHourIndex;
      }

      const slicedTimes = weatherData.hourly.time.slice(startIndex, endIndex);
      
      return slicedTimes.map((t, i) => {
          const idx = startIndex + i;
          const rawWind = weatherData.hourly.wind_speed_10m[idx];
          const convertedWind = typeof convertWind === 'function' ? convertWind(rawWind, settings.windUnit) : rawWind;

          return {
              timestamp: t,
              temp: weatherData.hourly.temperature_2m[idx],
              wind: convertedWind,
              windDir: weatherData.hourly.wind_direction_10m[idx],
              precipAmount: weatherData.hourly.precipitation[idx],
          };
      });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col h-[100dvh]">
       {/* Sticky Header */}
       <header className="absolute top-0 left-0 right-0 z-50 pointer-events-none flex justify-center">
          <div className="w-full max-w-5xl mx-auto flex items-center justify-between p-4 pointer-events-auto bg-black/30 backdrop-blur-md text-white border-b border-white/10 shadow-lg">
             <button 
               onClick={() => onNavigate(ViewState.CURRENT)} 
               className="p-2 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center w-10 h-10"
             >
                <Icon name="arrow_back" className="text-2xl" />
             </button>
             
             <div className="text-center">
                <h2 className="text-lg font-bold drop-shadow-md max-w-[150px] truncate">{location.name}</h2>
                <p className="text-xs opacity-70 uppercase tracking-wider">{getTranslation('immersive.title', settings.language)}</p>
             </div>

             <button 
               onClick={toggleStartWithImmersive}
               className="flex flex-row-reverse items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors text-xs font-medium bg-black/20 border border-white/10 backdrop-blur-sm text-right"
             >
                <div className={`w-3 h-3 rounded-full border border-white/60 flex items-center justify-center flex-shrink-0 ${startWithImmersive ? 'bg-blue-500 border-blue-400' : ''}`}>
                   {startWithImmersive && <Icon name="check" className="text-[10px]" />}
                </div>
                <span className="leading-tight">{getTranslation('immersive.start_baro', settings.language)}</span>
             </button>
          </div>
       </header>

       <div className="hidden md:block fixed inset-0 z-50 pointer-events-none">
            <div className="relative w-full max-w-5xl mx-auto h-full pointer-events-none">
                <div className="absolute top-32 right-0 flex flex-col gap-4 pointer-events-auto">
                    <button
                        onClick={() => setSidePanel(sidePanel === 'outlook' ? null : 'outlook')}
                        className={`flex flex-col items-center justify-center w-36 h-24 rounded-l-2xl backdrop-blur-md border border-r-0 shadow-[-10px_0_20px_rgba(0,0,0,0.4)] transition-all duration-300 group ${
                            sidePanel === 'outlook' 
                            ? 'bg-slate-900/95 border-white/20 text-white translate-x-0' 
                            : 'bg-black/80 border-white/10 text-white/70 hover:bg-slate-900 hover:text-white translate-x-2 hover:translate-x-0'
                        }`}
                    >
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 group-hover:scale-105 transition-transform">{getTranslation('immersive.outlook', settings.language)}</span>
                        <Icon name="bar_chart" className="text-2xl group-hover:scale-110 transition-transform" />
                    </button>

                    <button
                        onClick={() => setSidePanel(sidePanel === 'history' ? null : 'history')}
                        className={`flex flex-col items-center justify-center w-36 h-24 rounded-l-2xl backdrop-blur-md border border-r-0 shadow-[-10px_0_20px_rgba(0,0,0,0.4)] transition-all duration-300 group ${
                            sidePanel === 'history' 
                            ? 'bg-purple-900/90 border-purple-500/30 text-white translate-x-0' 
                            : 'bg-black/80 border-white/10 text-white/70 hover:bg-slate-900 hover:text-white translate-x-2 hover:translate-x-0'
                        }`}
                    >
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 group-hover:scale-105 transition-transform">{getTranslation('immersive.history', settings.language)}</span>
                        <Icon name="history" className="text-2xl group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </div>
       </div>

       {/* Side Panel (Drawer) with Attached Tabs */}
       <div 
            className={`fixed inset-y-0 right-0 z-40 w-[75vw] bg-slate-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] transform overflow-visible ${
                sidePanel ? 'translate-x-0' : 'translate-x-full'
            }`}
       >
            <div className="flex flex-col h-full pt-24 pb-8 px-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white">
                        {sidePanel === 'outlook' ? getTranslation('immersive.outlook_title', settings.language) : getTranslation('immersive.history_title', settings.language)}
                    </h3>
                    <button onClick={() => setSidePanel(null)} className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white">
                        <Icon name="close" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-hidden relative">
                    {weatherData && sidePanel && (
                        <div className="h-[300px] w-full">
                             <CompactHourlyChart 
                                data={getChartData(sidePanel)} 
                                settings={settings} 
                             />
                             <div className="mt-4 text-sm text-white/50 text-center">
                                 {sidePanel === 'outlook' 
                                    ? getTranslation('immersive.outlook_desc', settings.language) 
                                    : getTranslation('immersive.history_desc', settings.language)}
                             </div>
                        </div>
                    )}
                </div>
            </div>
       </div>
       
       {/* Click outside to close */}
       {sidePanel && (
           <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]" onClick={() => setSidePanel(null)} />
       )}

       {loading || !weatherData ? (
           <div className="flex flex-col items-center justify-center h-full text-white bg-slate-900">
               <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
               <p className="animate-pulse opacity-80">{getTranslation('immersive.loading', settings.language)}</p>
           </div>
       ) : (
           <ImmersiveForecast data={weatherData} settings={settings} location={location} />
       )}

       {showSwipeHint && (
         <Toast 
            message={getTranslation('immersive.swipe_hint', settings.language)} 
            type="info" 
            onClose={() => setShowSwipeHint(false)} 
            duration={5000}
         />
       )}
    </div>
  );
};

function getCurrentHourIndex(data: OpenMeteoResponse): number {
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const locationTimeMs = utcMs + (data.utc_offset_seconds * 1000);
    const locationDate = new Date(locationTimeMs);
    
    const year = locationDate.getFullYear();
    const month = String(locationDate.getMonth() + 1).padStart(2, '0');
    const day = String(locationDate.getDate()).padStart(2, '0');
    const hour = String(locationDate.getHours()).padStart(2, '0');
    const targetTime = `${year}-${month}-${day}T${hour}:00`;
    
    const index = data.hourly.time.findIndex(t => t === targetTime);
    
    if (index === -1) {
        return Math.max(0, data.hourly.time.findIndex(t => t >= targetTime));
    }
    return index;
}
