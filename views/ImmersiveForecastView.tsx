
import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse } from '../types';
import { Icon } from '../components/Icon';
import { loadCurrentLocation, saveSettings } from '../services/storageService';
import { ImmersiveForecast } from '../components/immersive/ImmersiveForecast';
import { fetchForecast } from '../services/weatherService';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const ImmersiveForecastView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [weatherData, setWeatherData] = useState<OpenMeteoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [startWithImmersive, setStartWithImmersive] = useState(settings.startWithImmersive || false);

  useEffect(() => {
    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchForecast(location.lat, location.lon);
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
                <p className="text-xs opacity-70 uppercase tracking-wider">Vooruitblik</p>
             </div>

             <button 
               onClick={toggleStartWithImmersive}
               className="flex flex-row-reverse items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors text-xs font-medium bg-black/20 border border-white/10 backdrop-blur-sm text-right"
             >
                <div className={`w-3 h-3 rounded-full border border-white/60 flex items-center justify-center flex-shrink-0 ${startWithImmersive ? 'bg-blue-500 border-blue-400' : ''}`}>
                   {startWithImmersive && <Icon name="check" className="text-[10px]" />}
                </div>
                <span className="leading-tight">Start Baro op<br/>in deze modus</span>
             </button>
          </div>
       </header>

       {loading || !weatherData ? (
           <div className="flex flex-col items-center justify-center h-full text-white bg-slate-900">
               <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
               <p className="animate-pulse opacity-80">Weer laden...</p>
           </div>
       ) : (
           <ImmersiveForecast data={weatherData} settings={settings} location={location} />
       )}
    </div>
  );
};
