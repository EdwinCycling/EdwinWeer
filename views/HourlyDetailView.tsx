import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings, Location, OpenMeteoResponse } from '../types';
import { fetchForecast, convertTemp, convertWind, convertPressure, getBeaufort, getWindDirection } from '../services/weatherService';
import { loadCurrentLocation } from '../services/storageService';
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, ReferenceLine, ScatterChart, Scatter, Line } from 'recharts';
import { CompactHourlyChart } from '../components/CompactHourlyChart';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  initialParams?: any;
}

export const HourlyDetailView: React.FC<Props> = ({ onNavigate, settings, initialParams }) => {
  const [location] = useState<Location>(loadCurrentLocation());
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFeelsLike, setShowFeelsLike] = useState(false);
  const [viewMode, setViewMode] = useState<'details' | 'compact'>(() => {
      if (typeof window !== 'undefined') {
          return (localStorage.getItem('hourlyViewMode') as 'details' | 'compact') || 'details';
      }
      return 'details';
  });

  useEffect(() => {
      if (typeof window !== 'undefined') {
          localStorage.setItem('hourlyViewMode', viewMode);
      }
  }, [viewMode]);
  
  const t = (key: string) => getTranslation(key, settings.language);
  const mode = initialParams?.mode || 'forecast';
  const title = mode === 'history' ? t('past_24h') : (initialParams?.title || t('hourly.title'));
  const subtitle = initialParams?.subtitle;

  useEffect(() => {
    const load = async () => {
        try {
            // Fetch with past days if history mode
            const forecast: OpenMeteoResponse = await fetchForecast(location.lat, location.lon, undefined, mode === 'history' ? 2 : 0);
            
            const now = new Date();
            const destTime = new Date(now.getTime() + (forecast.utc_offset_seconds * 1000));
            
            const pad = (n: number) => n.toString().padStart(2, '0');
            const nowIso = `${destTime.getUTCFullYear()}-${pad(destTime.getUTCMonth()+1)}-${pad(destTime.getUTCDate())}T${pad(destTime.getUTCHours())}`;
            
            let startIndex = forecast.hourly.time.findIndex(timeStr => timeStr.startsWith(nowIso));
            let endIndex = 0;

            if (mode === 'history') {
                if (startIndex !== -1) {
                    // Show past 24 hours including current hour
                    endIndex = startIndex + 1;
                    startIndex = Math.max(0, startIndex - 23);
                } else {
                    // Fallback
                    startIndex = 0;
                    endIndex = 24;
                }
            } else {
                if (startIndex === -1) startIndex = 0;
                endIndex = startIndex + 48;
            }

            const slicedTime = forecast.hourly.time.slice(startIndex, endIndex);
            
            const processed = slicedTime.map((timeStr, i) => {
                const idx = startIndex + i;
                const date = new Date(timeStr + 'Z');
                const windSpeed = forecast.hourly.wind_speed_10m[idx];
                const sunDuration = forecast.hourly.sunshine_duration ? forecast.hourly.sunshine_duration[idx] : 0;
                const windDir = forecast.hourly.wind_direction_10m[idx] || 0;
                
                return {
                    time: date.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        hour12: settings.timeFormat === '12h',
                        timeZone: 'UTC'
                    }),
                    timestamp: date.getTime(), // Use timestamp for unique XAxis key
                    fullDate: date, // Keep full date for day detection
                    weatherCode: forecast.hourly.weather_code[idx], // Added for Compact Chart
                    temp: convertTemp(forecast.hourly.temperature_2m[idx], settings.tempUnit),
                    feelsLike: convertTemp(forecast.hourly.apparent_temperature[idx], settings.tempUnit),
                    humidity: forecast.hourly.relative_humidity_2m[idx],
                    pressure: convertPressure(forecast.hourly.surface_pressure[idx], settings.pressureUnit),
                    uv: forecast.hourly.uv_index[idx],
                    wind: convertWind(windSpeed, settings.windUnit),
                    windDir,
                    windDirText: getWindDirection(windDir, settings.language),
                    beaufort: getBeaufort(windSpeed),
                    precipProb: forecast.hourly.precipitation_probability ? forecast.hourly.precipitation_probability[idx] : 0,
                    precipAmount: forecast.hourly.precipitation ? forecast.hourly.precipitation[idx] : 0,
                    sunshine: Math.min(100, Math.round((sunDuration / 3600) * 100)),
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
      const dataPoint = payload[0].payload;
      const now = new Date();
      // Calculate hours difference
      const diffMs = now.getTime() - dataPoint.fullDate.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      
      return (
        <div className="bg-bg-card p-2 border border-border-color rounded-lg shadow-lg z-50 text-text-main">
          <p className="text-xs font-bold mb-1">{dataPoint.time}</p>
          {mode === 'history' && diffHours > 0 && (
            <p className="text-[10px] text-text-muted mb-1">
              {t('time.hours_ago').replace('{count}', diffHours.toString())}
            </p>
          )}
          <p className="text-sm">
            {payload[0].name ? <span className="opacity-70 mr-1">{payload[0].name}:</span> : null}
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

  // Find day boundaries (where time is 00:00)
  const dayBoundaries = data.filter(d => d.time === '00:00' || d.time === '00:00 AM' || d.time === '12:00 AM').map(d => d.timestamp);

  const getXAxisTicks = () => {
    if (!data.length) return [];
    // Filter timestamps for every 2 hours (even hours)
    return data
        .filter(d => {
            const date = new Date(d.timestamp);
            return date.getHours() % 2 === 0;
        })
        .map(d => d.timestamp);
  };
  const xAxisTicks = getXAxisTicks();

  const DaySeparator = () => (
      <>
        {dayBoundaries.map((ts, i) => (
            <ReferenceLine key={i} x={ts} stroke="#000" strokeOpacity={1} strokeWidth={4} label={{ value: t('new_day'), position: 'insideTopRight', fill: '#444', fontSize: 12, fontWeight: 'bold' }} />
        ))}
      </>
  );

  const initialDate = initialParams?.date ? new Date(initialParams.date) : new Date();

  return (
    <div className="flex flex-col min-h-screen bg-bg-page pb-24 overflow-y-auto text-text-main transition-colors">
      <div className="flex items-center p-4 pt-20 md:pt-8 fixed top-0 left-0 right-0 bg-bg-card/95 backdrop-blur z-50 border-b border-border-color">
        <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-bg-page mr-2">
            <Icon name="arrow_back_ios_new" />
        </button>
        <div>
            <h1 className="text-lg font-bold">{title}</h1>
            {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
            <div className="flex items-center gap-1 text-xs opacity-50">
                 <Icon name="location_on" className="text-xs" /> {location.name}
            </div>
        </div>
        
        {/* View Toggle */}
        <div className="ml-auto flex bg-bg-card rounded-lg p-1 border border-border-color mr-2 md:mr-6">
            <button
                onClick={() => setViewMode('details')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    viewMode === 'details' 
                        ? 'bg-primary text-white shadow-sm' 
                        : 'text-text-muted hover:bg-bg-page'
                }`}
            >
                Details
            </button>
            <button
                onClick={() => setViewMode('compact')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    viewMode === 'compact' 
                        ? 'bg-primary text-white shadow-sm' 
                        : 'text-text-muted hover:bg-bg-page'
                }`}
            >
                Compact
            </button>
        </div>
      </div>

      {loading ? (
           <div className="flex-grow flex items-center justify-center pt-44 md:pt-28">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
           </div>
      ) : (
        viewMode === 'compact' ? (
            <div className="pt-44 md:pt-28 pb-4 px-4">
                 <div className="bg-bg-card rounded-xl p-4 border border-border-color overflow-x-auto shadow-sm">
                    <div className="min-w-[800px] md:min-w-full">
                        <CompactHourlyChart data={data} settings={settings} />
                    </div>
                 </div>
            </div>
        ) : (
        <div className="flex flex-col gap-8 p-4 pt-44 md:pt-28">
            
            <div className="w-full overflow-x-auto pb-4">
                <div className="min-w-[600px] md:min-w-full flex flex-col gap-8 pr-4">
                    

                    
                    {/* Temperature Graph */}
                    <div className="h-96 bg-bg-card rounded-2xl p-4 border border-border-color relative shadow-sm w-full">
                        <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="thermostat" className="text-primary" />
                            <span className="text-sm font-bold">{t('temp')}</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <AreaChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }} syncId="hourly-sync">
                                <defs>
                                    <linearGradient id="colorTempDetail" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#13b6ec" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#13b6ec" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <DaySeparator />
                                <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={false} stroke="rgba(128,128,128,0.1)" />
                                {/* Custom Grid Lines */}
                                {tempTicks.map(tick => (
                                    <ReferenceLine 
                                        key={tick} 
                                        y={tick} 
                                        stroke={tick % 5 === 0 ? "rgba(128,128,128,0.4)" : "rgba(128,128,128,0.1)"} 
                                        strokeWidth={tick % 5 === 0 ? 1.5 : 1}
                                    />
                                ))}
                                <XAxis 
                                    dataKey="timestamp" 
                                    tickFormatter={(ts) => {
                                        const d = data.find(item => item.timestamp === ts);
                                        return d ? d.time : '';
                                    }}
                                    tick={{fill: '#888', fontSize: 10}} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    ticks={xAxisTicks}
                                    interval={0} 
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                />
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
                                <Area type="monotone" dataKey="temp" stroke="#13b6ec" fillOpacity={1} fill="url(#colorTempDetail)" unit={`°${settings.tempUnit}`} strokeWidth={3} name={t('temp')} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Feels Like Graph (Conditional) */}
                    {showFeelsLike && (
                        <div className="h-64 bg-bg-card rounded-2xl p-4 border border-border-color relative shadow-sm w-full">
                            <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                                <Icon name="thermostat" className="text-orange-400" />
                                <span className="text-sm font-bold">{t('feels_like')}</span>
                            </div>
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <AreaChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }} syncId="hourly-sync">
                                    <defs>
                                        <linearGradient id="colorFeelsLike" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#fb923c" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <DaySeparator />
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
                                    <XAxis 
                                        dataKey="timestamp" 
                                        tickFormatter={(ts) => {
                                            const d = data.find(item => item.timestamp === ts);
                                            return d ? d.time : '';
                                        }}
                                        tick={{fill: '#888', fontSize: 10}} 
                                        axisLine={false} 
                                        tickLine={false} 
                                        ticks={xAxisTicks}
                                        interval={0} 
                                        type="number"
                                        domain={['dataMin', 'dataMax']}
                                    />
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
                                    <Area type="monotone" dataKey="feelsLike" stroke="#fb923c" fillOpacity={1} fill="url(#colorFeelsLike)" unit={`°${settings.tempUnit}`} strokeWidth={3} name={t('feels_like')} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Precipitation Graph */}
                    <div className="h-48 bg-bg-card rounded-2xl p-4 border border-border-color relative shadow-sm w-full">
                        <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="umbrella" className="text-blue-500" />
                            <span className="text-sm font-bold">
                                {mode === 'history' ? `${t('precip_amount')} (mm)` : `${t('precip_prob')} (%)`}
                            </span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <AreaChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }} syncId="hourly-sync">
                                <defs>
                                    <linearGradient id="colorPrecipProb" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorPrecipAmount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                    </linearGradient>
                                </defs>
                                <DaySeparator />
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis 
                                    dataKey="timestamp" 
                                    tickFormatter={(ts) => {
                                        const d = data.find(item => item.timestamp === ts);
                                        return d ? d.time : '';
                                    }}
                                    tick={{fill: '#888', fontSize: 10}} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    ticks={xAxisTicks}
                                    interval={0} 
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                />
                                <YAxis 
                                    tick={{fill: '#888', fontSize: 10}} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    width={30} 
                                    domain={mode === 'history' ? [0, 5] : [0, 100]} 
                                    allowDataOverflow={mode === 'history'}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                {mode === 'history' ? (
                                    <Area 
                                        type="monotone" 
                                        dataKey="precipAmount" 
                                        stroke="#3b82f6" 
                                        fillOpacity={1} 
                                        fill="url(#colorPrecipAmount)" 
                                        unit=" mm" 
                                        strokeWidth={2}
                                        name={t('precip_amount')}
                                        dot={(props: any) => {
                                            if (props.payload.precipAmount > 5) {
                                                return <circle cx={props.cx} cy={props.cy} r={4} fill="#ef4444" stroke="none" />
                                            }
                                            return <></>;
                                        }}
                                    />
                                ) : (
                                    <Area type="monotone" dataKey="precipProb" stroke="#3b82f6" fillOpacity={1} fill="url(#colorPrecipProb)" unit="%" strokeWidth={2} />
                                )}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Sunshine Percentage Graph (New) */}
                    <div className="h-48 bg-bg-card rounded-2xl p-4 border border-border-color relative shadow-sm w-full">
                        <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="wb_sunny" className="text-yellow-500" />
                            <span className="text-sm font-bold">{t('sunshine')} (%)</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <AreaChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }} syncId="hourly-sync">
                                <defs>
                                    <linearGradient id="colorSunshine" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#eab308" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <DaySeparator />
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis 
                                    dataKey="timestamp" 
                                    tickFormatter={(ts) => {
                                        const d = data.find(item => item.timestamp === ts);
                                        return d ? d.time : '';
                                    }}
                                    tick={{fill: '#888', fontSize: 10}} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    ticks={xAxisTicks}
                                    interval={0} 
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                />
                                <YAxis tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="sunshine" stroke="#eab308" fillOpacity={1} fill="url(#colorSunshine)" unit="%" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Wind Speed (Beaufort) */}
                    <div className="h-48 bg-bg-card rounded-2xl p-4 border border-border-color relative shadow-sm w-full">
                        <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="air" className="text-green-500" />
                            <span className="text-sm font-bold">{t('wind')} (Bft)</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <BarChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }} syncId="hourly-sync">
                                <DaySeparator />
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis 
                                    dataKey="timestamp" 
                                    tickFormatter={(ts) => {
                                        const d = data.find(item => item.timestamp === ts);
                                        return d ? d.time : '';
                                    }}
                                    tick={{fill: '#888', fontSize: 10}} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    ticks={xAxisTicks}
                                    interval={0} 
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                />
                                <YAxis tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} width={30} allowDecimals={false} domain={[0, 'auto']} />
                                <Tooltip cursor={{fill: 'rgba(128,128,128,0.1)'}} content={<CustomTooltip />} />
                                <Bar dataKey="beaufort" fill="#4ade80" radius={[4, 4, 0, 0]} unit=" Bft" barSize={10} name={t('wind')} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Wind Direction Graph (New) */}
                    <div className="h-48 bg-bg-card rounded-2xl p-4 border border-border-color relative shadow-sm w-full">
                        <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="explore" className="text-text-muted" />
                            <span className="text-sm font-bold">{t('wind_direction') || 'Windrichting'}</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <ScatterChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }} syncId="hourly-sync">
                                <DaySeparator />
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis 
                                    dataKey="timestamp" 
                                    tickFormatter={(ts) => {
                                        const d = data.find(item => item.timestamp === ts);
                                        return d ? d.time : '';
                                    }}
                                    tick={{fill: '#888', fontSize: 10}} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    ticks={xAxisTicks}
                                    interval={0} 
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                />
                                <YAxis 
                                    dataKey="windDir" 
                                    tick={{fill: '#888', fontSize: 10}} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    width={30} 
                                    domain={[0, 360]} 
                                    ticks={[0, 45, 90, 135, 180, 225, 270, 315, 360]}
                                    tickFormatter={(val) => {
                                        const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW', 'N'];
                                        return dirs[val / 45] || '';
                                    }}
                                />
                                <Tooltip 
                                    cursor={{strokeDasharray: '3 3'}}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const d = payload[0].payload;
                                            return (
                                                <div className="bg-bg-card p-2 border border-border-color rounded-lg shadow-lg z-50 text-text-main">
                                                    <p className="text-xs font-bold mb-1">{d.time}</p>
                                                    <p className="text-sm flex items-center gap-1">
                                                        <Icon name="navigation" className="text-xs" style={{ transform: `rotate(${d.windDir}deg)` }} />
                                                        {d.windDirText} ({d.windDir}°)
                                                    </p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Scatter dataKey="windDir" fill="#8884d8" line={false} shape="circle" />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Humidity */}
                    <div className="h-48 bg-bg-card rounded-2xl p-4 border border-border-color relative shadow-sm w-full">
                         <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="humidity_percentage" className="text-blue-400" />
                            <span className="text-sm font-bold">{t('humidity')} (%)</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <AreaChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }} syncId="hourly-sync">
                                <defs>
                                    <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <DaySeparator />
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis 
                                    dataKey="timestamp" 
                                    tickFormatter={(ts) => {
                                        const d = data.find(item => item.timestamp === ts);
                                        return d ? d.time : '';
                                    }}
                                    tick={{fill: '#888', fontSize: 10}} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    ticks={xAxisTicks}
                                    interval={0} 
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                />
                                <YAxis tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="humidity" stroke="#60a5fa" fillOpacity={1} fill="url(#colorHum)" unit="%" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Pressure */}
                    <div className="h-32 bg-bg-card rounded-2xl p-4 border border-border-color relative shadow-sm w-full">
                        <div className="flex items-center gap-2 mb-4 absolute top-4 left-4 z-10">
                            <Icon name="compress" className="text-purple-400" />
                            <span className="text-sm font-bold">{t('pressure')} ({settings.pressureUnit})</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <AreaChart data={data} margin={{ top: 30, right: 10, left: 0, bottom: 0 }} syncId="hourly-sync">
                                <DaySeparator />
                                <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="rgba(128,128,128,0.1)" />
                                <XAxis 
                                    dataKey="timestamp" 
                                    tickFormatter={(ts) => {
                                        const d = data.find(item => item.timestamp === ts);
                                        return d ? d.time : '';
                                    }}
                                    tick={{fill: '#888', fontSize: 10}} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    ticks={xAxisTicks}
                                    interval={0} 
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                />
                                <YAxis tick={{fill: '#888', fontSize: 10}} axisLine={false} tickLine={false} width={40} domain={['dataMin - 5', 'dataMax + 5']} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="pressure" stroke="#c084fc" fill="transparent" unit={` ${settings.pressureUnit}`} strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                </div>
            </div>
            
        </div>
        )
      )}
    </div>
  );
};
