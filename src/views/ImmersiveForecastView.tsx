
import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse } from '../types';
import { Icon } from '../components/Icon';
import { loadCurrentLocation } from '../services/storageService';
import { ImmersiveForecast } from '../components/immersive/ImmersiveForecast';
import { fetchWeather } from '../services/weatherService';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const ImmersiveForecastView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [weatherData, setWeatherData] = useState<OpenMeteoResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchWeather(location.lat, location.lon, settings);
            setWeatherData(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    loadData();
  }, [location.lat, location.lon, settings]);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col h-[100dvh]">
       {/* Sticky Header */}
       <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-black/30 backdrop-blur-md text-white border-b border-white/10">
          <button 
            onClick={() => onNavigate(ViewState.CURRENT)} 
            className="p-2 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center w-10 h-10"
          >
             <Icon name="arrow_back" className="text-2xl" />
          </button>
          <div className="text-center">
             <h2 className="text-lg font-bold drop-shadow-md">{location.name}</h2>
             <p className="text-xs opacity-70 uppercase tracking-wider">48 Uur</p>
          </div>
          <div className="w-10" /> {/* Spacer to center title */}
       </header>

       {loading || !weatherData ? (
           <div className="flex flex-col items-center justify-center h-full text-white bg-slate-900">
               <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
               <p className="animate-pulse opacity-80">Weer laden...</p>
           </div>
       ) : (
           <ImmersiveForecast weatherData={weatherData} settings={settings} />
       )}
    </div>
  );
};
