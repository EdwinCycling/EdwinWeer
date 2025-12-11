
import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings, Location, OpenMeteoResponse } from '../types';
import { fetchForecast, convertTemp, convertWind } from '../services/weatherService';
import { loadCurrentLocation } from '../services/storageService';
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const HourlyDetailView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location] = useState<Location>(loadCurrentLocation());
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const t = (key: string) => getTranslation(key, settings.language);

  useEffect(() => {
    const load = async () => {
        try {
            const forecast: OpenMeteoResponse = await fetchForecast(location.lat, location.lon);
            const nowIso = new Date().toISOString().slice(0, 13);
            let startIndex = forecast.hourly.time.findIndex(timeStr => timeStr.startsWith(nowIso));
            if (startIndex === -1) startIndex = 0;

            const slicedTime = forecast.hourly.time.slice(startIndex, startIndex + 48);
            
            const processed = slicedTime.map((timeStr, i) => {
                const idx = startIndex + i;
                const date = new Date(timeStr);
                return {
                    time: date.getHours().toString().padStart(2, '0') + ':00',
                    temp: convertTemp(forecast.hourly.temperature_2m[idx], settings.tempUnit),
                    humidity: forecast.hourly.relative_humidity_2m[idx],
                    pressure: Math.round(forecast.hourly.surface_pressure[idx]),
                    uv: forecast.hourly.uv_index[idx],
                    wind: convertWind(forecast.hourly.wind_speed_10m[idx], settings.windUnit),
                };
            });
            setData(processed);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    load();
  }, [location, settings]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-card-dark p-2 border border-slate-200 dark:border-white/10 rounded-lg shadow-lg z-50 text-slate-800 dark:text-white">
          <p className="text-xs font-bold mb-1">{label}</p>
          <p className="text-sm">
            {payload[0].value} {payload[0].unit}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-dark pb-24 overflow-y-auto text-slate-800 dark:text-white transition-colors">
      <div className="flex items-center p-4 pt-8 sticky top-0 bg-white/95 dark:bg-[#101d22]/95 backdrop-blur z-20 border-b border-slate-200 dark:border-white/5">
        <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 mr-2">
            <Icon name="arrow_back_ios_new" />
        </button>
        <div>
            <h1 className="text-lg font-bold">48-Hour Detail</h1>
            <div className="flex items-center gap-1 text-xs opacity-50">
                 <Icon name="location_on" className="text-xs" /> {location.name}
            </div>
        </div>
      </div>

      {loading ? (
           <div className="flex-grow flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
           </div>
      ) : (
        <div className="flex flex-col gap-8 p-4">
            
            <div className="w-full overflow-x-auto pb-4">
                <div className="min-w-[600px] md:min-w-full flex flex-col gap-8 pr-4">
                    
                    {/* Temperature Graph */}
                    <div className="h-64 bg-white dark:bg-card-dark rounded-2xl p-4 border border-slate-200 dark:border-white/5 relative shadow-sm w-full">
                        <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="thermostat" className="text-primary" />
                            <span className="text-sm font-bold">{t('temp')}</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorTempDetail" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#13b6ec" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#13b6ec" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis dataKey="time" tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} interval={2} />
                                <YAxis tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} width={30} domain={['dataMin - 2', 'dataMax + 2']} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="temp" stroke="#13b6ec" fillOpacity={1} fill="url(#colorTempDetail)" unit={`°${settings.tempUnit}`} strokeWidth={3} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Wind Speed */}
                    <div className="h-48 bg-white dark:bg-card-dark rounded-2xl p-4 border border-slate-200 dark:border-white/5 relative shadow-sm w-full">
                        <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="air" className="text-green-500" />
                            <span className="text-sm font-bold">{t('wind')} ({settings.windUnit})</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis dataKey="time" tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} interval={2} />
                                <YAxis tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} width={30} />
                                <Tooltip cursor={{fill: 'rgba(128,128,128,0.1)'}} content={<CustomTooltip />} />
                                <Bar dataKey="wind" fill="#4ade80" radius={[4, 4, 0, 0]} unit={` ${settings.windUnit}`} barSize={10} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Humidity */}
                    <div className="h-48 bg-white dark:bg-card-dark rounded-2xl p-4 border border-slate-200 dark:border-white/5 relative shadow-sm w-full">
                         <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="humidity_percentage" className="text-blue-400" />
                            <span className="text-sm font-bold">{t('humidity')} (%)</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis dataKey="time" tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} interval={2} />
                                <YAxis tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="humidity" stroke="#60a5fa" fillOpacity={1} fill="url(#colorHum)" unit="%" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Pressure */}
                    <div className="h-32 bg-white dark:bg-card-dark rounded-2xl p-4 border border-slate-200 dark:border-white/5 relative shadow-sm w-full">
                        <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="compress" className="text-purple-400" />
                            <span className="text-sm font-bold">{t('pressure')} (hPa)</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis dataKey="time" tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} interval={2} />
                                <YAxis tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} width={40} domain={['dataMin - 5', 'dataMax + 5']} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="pressure" stroke="#c084fc" fill="transparent" unit=" hPa" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                </div>
            </div>
            
            <p className="text-center text-xs opacity-30 italic pb-8">Scroll horizontally for more data</p>
        </div>
      )}
    </div>
  );
};
