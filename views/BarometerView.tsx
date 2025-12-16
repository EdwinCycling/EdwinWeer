import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings } from '../types';
import { Icon } from '../components/Icon';
import { loadCurrentLocation } from '../services/storageService';
import { fetchForecast, fetchHistorical } from '../services/weatherService';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const BarometerView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [loading, setLoading] = useState(true);
  const [currentPressure, setCurrentPressure] = useState<number | null>(null);
  const [yesterdayPressure, setYesterdayPressure] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Logic to fetch data
  useEffect(() => {
    const loadData = async () => {
        try {
            setLoading(true);
            const loc = loadCurrentLocation();
            if (!loc) throw new Error('No location');

            // 1. Fetch Current Forecast (for current pressure)
            const forecast = await fetchForecast(loc.lat, loc.lon);
            const currentP = forecast.current?.pressure_msl || forecast.hourly?.pressure_msl?.[0]; // Fallback
            setCurrentPressure(currentP);

            // Determine current hour from forecast time (local to location) to ensure matching index
            let currentHour = new Date().getHours();
            if (forecast.current?.time) {
                // Parse "YYYY-MM-DDTHH:mm" -> get HH
                try {
                    const timeStr = forecast.current.time;
                    const hourStr = timeStr.split('T')[1]?.split(':')[0];
                    if (hourStr) {
                        currentHour = parseInt(hourStr, 10);
                    }
                } catch (e) {
                    console.warn('Could not parse forecast time', e);
                }
            }

            // 2. Fetch Yesterday's Data
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const dateStr = yesterday.toISOString().split('T')[0];
            
            const history = await fetchHistorical(loc.lat, loc.lon, dateStr, dateStr);
            
            // Get pressure at same hour as now
            const yesterdayP = history.hourly?.pressure_msl?.[currentHour];
            setYesterdayPressure(yesterdayP);

        } catch (err) {
            console.error(err);
            setError('Failed to load barometer data');
        } finally {
            setLoading(false);
        }
    };
    loadData();
  }, []);

  // Calculate angles
  // 960 = -70, 1060 = +70
  // deg = 1.4 * pressure - 1414
  const getAngle = (p: number) => Math.min(Math.max(1.4 * p - 1414, -70), 70);

  const currentAngle = currentPressure ? getAngle(currentPressure) : -70;
  const yesterdayAngle = yesterdayPressure ? getAngle(yesterdayPressure) : -70;

  // Forecast Text
  const getForecastText = () => {
      if (!currentPressure || !yesterdayPressure) return settings.language === 'nl' ? "Laden..." : "Loading...";
      const diff = currentPressure - yesterdayPressure;
      const isNL = settings.language === 'nl';

      if (diff > 1) return isNL ? "Luchtdruk stijgt: Weer verbetert" : "Pressure rising: Weather improving";
      if (diff < -1) return isNL ? "Luchtdruk daalt: Weer verslechtert" : "Pressure falling: Weather worsening";
      return isNL ? "Luchtdruk stabiel: Weer blijft gelijk" : "Pressure stable: Weather remains similar";
  };
  
  const forecastText = getForecastText();

  return (
    <div className="flex flex-col min-h-screen bg-[#f0f0f0] dark:bg-slate-900 transition-colors">
       {/* Header */}
       <div className="flex items-center p-4 pt-8 sticky top-0 z-20">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full bg-white/50 hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/40 mr-2 backdrop-blur-md transition-colors shadow-sm text-slate-700 dark:text-white">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">De Barometer</h1>
       </div>

       <div className="flex-1 flex flex-col items-center justify-center p-4">
          {loading ? (
             <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
          ) : (
            <div className="barometer-container scale-100 sm:scale-125 transition-transform my-8">
                 <div className="barometer-case">
                     <div className="barometer-face">
                         <div className="scale-markings"></div>
                         
                         <div className="weather-text text-storm">Storm</div>
                         <div className="weather-text text-rain">Rain</div>
                         <div className="weather-text text-change">Change</div>
                         <div className="weather-text text-fair">Fair</div>
                         <div className="weather-text text-dry">Very Dry</div>
             
                         {/* Black Needle (Current) */}
                         <div className="needle" style={{ transform: `translateX(-50%) rotate(${currentAngle}deg)` }}></div>
                         
                         {/* Gold Needle (Yesterday) */}
                         <div className="needle reference-needle" style={{ transform: `translateX(-50%) rotate(${yesterdayAngle}deg)` }}></div>
             
                         <div className="digital-readout">{currentPressure} hPa</div>
                         <div className="center-knob"></div>
                     </div>
                 </div>
             </div>
          )}
          
          {!loading && (
              <div className="mt-8 text-center p-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-2xl shadow-xl w-full max-w-sm mx-auto border border-slate-200 dark:border-white/10">
                  <h2 className="text-lg font-bold mb-2 text-slate-800 dark:text-white">{settings.language === 'nl' ? 'Verwachting' : 'Forecast'}</h2>
                  <p className="text-slate-600 dark:text-slate-300 font-medium mb-4">{forecastText}</p>
                  <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-white/10 pt-4">
                      <div className="flex flex-col items-center">
                          <span>{settings.language === 'nl' ? 'Gisteren' : 'Yesterday'}</span>
                          <span className="font-bold text-slate-800 dark:text-white">{yesterdayPressure} hPa</span>
                      </div>
                      <div className="flex flex-col items-center">
                          <span>{settings.language === 'nl' ? 'Vandaag' : 'Today'}</span>
                          <span className="font-bold text-slate-800 dark:text-white">{currentPressure} hPa</span>
                      </div>
                  </div>
              </div>
          )}
       </div>

       <style>{`
         /* Barometer CSS */
         .barometer-container { display: flex; justify-content: center; padding: 20px; }
         .barometer-case {
             width: 300px; height: 300px; border-radius: 50%;
             background: radial-gradient(circle at 30% 30%, #8b5a2b, #5c3a1e);
             box-shadow: 0 10px 20px rgba(0,0,0,0.4), inset 0 0 0 10px #b8860b, inset 0 0 0 12px #4a3c31;
             display: flex; align-items: center; justify-content: center; position: relative;
         }
         .barometer-face {
             width: 240px; height: 240px;
             background: radial-gradient(circle at 30% 30%, #fdfbf7, #e6e2d8);
             border-radius: 50%; box-shadow: inset 0 2px 10px rgba(0,0,0,0.2);
             position: relative; border: 2px solid #333;
         }
         .weather-text {
             position: absolute; width: 100%; text-align: center;
             font-family: 'Times New Roman', serif; font-weight: bold; font-size: 14px;
             color: #333; top: 50%; left: 0; transform-origin: center;
         }
         .text-storm  { transform: rotate(-60deg) translateY(-85px); }
         .text-rain   { transform: rotate(-30deg) translateY(-85px); }
         .text-change { transform: rotate(0deg)   translateY(-85px); font-size: 16px; }
         .text-fair   { transform: rotate(30deg)  translateY(-85px); }
         .text-dry    { transform: rotate(60deg)  translateY(-85px); }
         
         .needle {
             position: absolute; bottom: 50%; left: 50%; width: 4px; height: 100px;
             background: #222; transform-origin: bottom center;
             transition: transform 1.5s cubic-bezier(0.4, 2.5, 0.6, 0.8);
             border-radius: 50% 50% 0 0; z-index: 10;
         }
         .needle::after {
             content: ''; position: absolute; top: -5px; left: -3px;
             border-left: 5px solid transparent; border-right: 5px solid transparent;
             border-bottom: 10px solid #222;
         }
         .reference-needle {
             height: 95px; width: 3px; z-index: 5;
             background: repeating-linear-gradient(to bottom, rgba(218, 165, 32, 0.8), rgba(218, 165, 32, 0.8) 5px, transparent 5px, transparent 8px);
         }
         .center-knob {
             position: absolute; top: 50%; left: 50%; width: 16px; height: 16px;
             background: radial-gradient(circle at 30% 30%, #ffd700, #b8860b);
             border-radius: 50%; transform: translate(-50%, -50%);
             box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 20;
         }
         .digital-readout {
             position: absolute; bottom: 40px; width: 100%; text-align: center;
             font-family: monospace; color: #666; font-size: 12px;
         }
         .scale-markings {
             position: absolute; inset: 10px; border-radius: 50%;
             background: repeating-conic-gradient(from 0deg, transparent 0deg 2deg, #333 2.1deg 2.4deg, transparent 2.5deg 5deg);
             mask: radial-gradient(transparent 70%, black 70%);
             -webkit-mask: radial-gradient(transparent 70%, black 70%);
             opacity: 0.15;
             transform: rotate(-70deg); 
             /* range is -70 to +70 = 140 deg. mask needs to handle this. 
                Simpler approach: just some ticks around the circle */
         }
       `}</style>
    </div>
  );
};
