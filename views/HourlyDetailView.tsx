import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings, Location, OpenMeteoResponse } from '../types';
import { fetchForecast, convertTemp, convertWind, convertPressure, getBeaufort } from '../services/weatherService';
import { loadCurrentLocation } from '../services/storageService';
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, ReferenceLine } from 'recharts';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const HourlyDetailView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location] = useState<Location>(loadCurrentLocation());
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFeelsLike, setShowFeelsLike] = useState(false);
  
  const t = (key: string) => getTranslation(key, settings.language);

  useEffect(() => {
    const load = async () => {
        try {
            const forecast: OpenMeteoResponse = await fetchForecast(location.lat, location.lon);
            
            const now = new Date();
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const destTime = new Date(utc + (forecast.utc_offset_seconds * 1000));
            
            const pad = (n: number) => n.toString().padStart(2, '0');
            const nowIso = `${destTime.getFullYear()}-${pad(destTime.getMonth()+1)}-${pad(destTime.getDate())}T${pad(destTime.getHours())}`;
            
            let startIndex = forecast.hourly.time.findIndex(timeStr => timeStr.startsWith(nowIso));
            if (startIndex === -1) startIndex = 0;

            const slicedTime = forecast.hourly.time.slice(startIndex, startIndex + 48);
            
            const processed = slicedTime.map((timeStr, i) => {
                const idx = startIndex + i;
                const date = new Date(timeStr);
                const windSpeed = forecast.hourly.wind_speed_10m[idx];
                return {
                    time: date.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' }),
                    temp: convertTemp(forecast.hourly.temperature_2m[idx], settings.tempUnit),
                    feelsLike: convertTemp(forecast.hourly.apparent_temperature[idx], settings.tempUnit),
                    humidity: forecast.hourly.relative_humidity_2m[idx],
                    pressure: convertPressure(forecast.hourly.surface_pressure[idx], settings.pressureUnit),
                    uv: forecast.hourly.uv_index[idx],
                    wind: convertWind(windSpeed, settings.windUnit),
                    beaufort: getBeaufort(windSpeed),
                };
            });
            setData(processed);
            
            // Check condition: Current feels like < 10
            if (processed.length > 0 && processed[0].feelsLike < 10) {
                setShowFeelsLike(true);
            } else {
                setShowFeelsLike(false);
            }

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

  const getTempTicks = (dataKey: string) => {
    if (!data.length) return [];
    const vals = data.map(d => d[dataKey]);
    const min = Math.floor(Math.min(...vals));
    const max = Math.ceil(Math.max(...vals));
    const start = min - 1;
    const end = max + 1;
    const ticks = [];
    for (let i = start; i <= end; i++) {
        ticks.push(i);
    }
    return ticks;
  };

  const tempTicks = getTempTicks('temp');
  const feelsTicks = getTempTicks('feelsLike');

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-background-dark pb-24 overflow-y-auto text-slate-800 dark:text-white transition-colors">
      <div className="flex items-center p-4 pt-8 sticky top-0 bg-white/95 dark:bg-[#101d22]/95 backdrop-blur z-20 border-b border-slate-200 dark:border-white/5">
        <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 mr-2">
            <Icon name="arrow_back_ios_new" />
        </button>
        <div>
            <h1 className="text-lg font-bold">{t('hourly.title')}</h1>
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
                    <div className="h-96 bg-white dark:bg-card-dark rounded-2xl p-4 border border-slate-200 dark:border-white/5 relative shadow-sm w-full">
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
                                {/* Custom Grid Lines */}
                                {tempTicks.map(tick => (
                                    <ReferenceLine 
                                        key={tick} 
                                        y={tick} 
                                        stroke={tick % 5 === 0 ? "rgba(128,128,128,0.4)" : "rgba(128,128,128,0.1)"} 
                                        strokeWidth={tick % 5 === 0 ? 1.5 : 1}
                                    />
                                ))}
                                <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={false} stroke="rgba(128,128,128,0.1)" />
                                <XAxis dataKey="time" tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} interval={2} />
                                <YAxis 
                                    tick={{fill: '#888', fontSize: 10}} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    width={30} 
                                    domain={[tempTicks[0], tempTicks[tempTicks.length - 1]]} 
                                    ticks={tempTicks}
                                    interval={0}
                                    allowDecimals={false} 
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="temp" stroke="#13b6ec" fillOpacity={1} fill="url(#colorTempDetail)" unit={`°${settings.tempUnit}`} strokeWidth={3} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Feels Like Graph (Conditional) */}
                    {showFeelsLike && (
                        <div className="h-64 bg-white dark:bg-card-dark rounded-2xl p-4 border border-slate-200 dark:border-white/5 relative shadow-sm w-full">
                            <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                                <Icon name="thermostat" className="text-orange-400" />
                                <span className="text-sm font-bold">{t('feels_like')}</span>
                            </div>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorFeelsLike" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#fb923c" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    {/* Custom Grid Lines */}
                                    {feelsTicks.map(tick => (
                                        <ReferenceLine 
                                            key={tick} 
                                            y={tick} 
                                            stroke={tick % 5 === 0 ? "rgba(128,128,128,0.4)" : "rgba(128,128,128,0.1)"} 
                                            strokeWidth={tick % 5 === 0 ? 1.5 : 1}
                                        />
                                    ))}
                                    <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={false} stroke="rgba(128,128,128,0.1)" />
                                    <XAxis dataKey="time" tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} interval={2} />
                                    <YAxis 
                                        tick={{fill: '#888', fontSize: 10}} 
                                        axisLine={false} 
                                        tickLine={false} 
                                        width={30} 
                                        domain={[feelsTicks[0], feelsTicks[feelsTicks.length - 1]]} 
                                        ticks={feelsTicks}
                                        interval={0}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="feelsLike" stroke="#fb923c" fillOpacity={1} fill="url(#colorFeelsLike)" unit={`°${settings.tempUnit}`} strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Wind Speed (Beaufort) */}
                    <div className="h-48 bg-white dark:bg-card-dark rounded-2xl p-4 border border-slate-200 dark:border-white/5 relative shadow-sm w-full">
                        <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="air" className="text-green-500" />
                            <span className="text-sm font-bold">{t('wind')} (Bft)</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis dataKey="time" tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} interval={2} />
                                <YAxis tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} width={30} allowDecimals={false} domain={[0, 'auto']} />
                                <Tooltip cursor={{fill: 'rgba(128,128,128,0.1)'}} content={<CustomTooltip />} />
                                <Bar dataKey="beaufort" fill="#4ade80" radius={[4, 4, 0, 0]} unit=" Bft" barSize={10} />
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
                            <span className="text-sm font-bold">{t('pressure')} ({settings.pressureUnit})</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis dataKey="time" tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} interval={2} />
                                <YAxis tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} width={40} domain={['dataMin - 5', 'dataMax + 5']} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="pressure" stroke="#c084fc" fill="transparent" unit={` ${settings.pressureUnit}`} strokeWidth={2} />
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
