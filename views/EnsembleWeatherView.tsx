import React, { useState, useEffect, useMemo } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse, EnsembleModel, TempUnit } from '../types';
import { Icon } from '../components/Icon';
import { 
    fetchForecast, 
    fetchEnsemble, 
    mapWmoCodeToIcon, 
    mapWmoCodeToText, 
    convertTemp, 
    convertWind, 
    convertPrecip, 
    convertPressure,
    getWindDirection,
    ENSEMBLE_VARS_HOURLY_BASIC,
    ENSEMBLE_VARS_HOURLY_PRO,
    ENSEMBLE_VARS_DAILY_BASIC,
    ENSEMBLE_VARS_DAILY_PRO
} from '../services/weatherService';
import { 
    loadCurrentLocation, 
    saveEnsembleModel, 
    loadEnsembleModel, 
    saveEnsembleViewMode, 
    loadEnsembleViewMode,
    saveEnsembleTimeStep,
    loadEnsembleTimeStep,
    saveEnsembleProMode,
    loadEnsembleProMode
} from '../services/storageService';
import { WeatherBackground } from '../components/WeatherBackground';
import { getTranslation } from '../services/translations';
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine, ReferenceArea } from 'recharts';
import { ModelInfoModal } from '../components/ModelInfoModal';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

const ENSEMBLE_MODELS: {id: EnsembleModel, name: string}[] = [
    { id: 'icon_seamless', name: 'DWD ICON EPS Seamless' },
    { id: 'icon_global', name: 'DWD ICON EPS Global' },
    { id: 'icon_eu', name: 'DWD ICON EPS EU' },
    { id: 'icon_d2', name: 'DWD ICON EPS D2' },
    { id: 'gfs_seamless', name: 'GFS Ensemble Seamless' },
    { id: 'gfs025', name: 'GFS Ensemble 0.25°' },
    { id: 'gfs05', name: 'GFS Ensemble 0.5°' },
    { id: 'ecmwf_ifs025', name: 'ECMWF IFS 0.25°' },
    { id: 'ecmwf_aifs025', name: 'ECMWF AIFS 0.25°' },
    { id: 'gem_global', name: 'GEM Global Ensemble' },
    { id: 'bom_access_global', name: 'BOM ACCESS Global' },
    { id: 'metoffice_global', name: 'UK MetOffice Global 20km' },
    { id: 'metoffice_uk', name: 'UK MetOffice UK 2km' },
    { id: 'icon_ch1_eps', name: 'MeteoSwiss ICON CH1' },
    { id: 'icon_ch2_eps', name: 'MeteoSwiss ICON CH2' },
];

export const EnsembleWeatherView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [currentWeather, setCurrentWeather] = useState<OpenMeteoResponse | null>(null);
  const [ensembleData, setEnsembleData] = useState<any | null>(null);
  const [selectedModel, setSelectedModel] = useState<EnsembleModel>(loadEnsembleModel());
  const [viewMode, setViewMode] = useState<'all' | 'main' | 'avg' | 'spread' | 'density'>(loadEnsembleViewMode() as any);
  const [timeStep, setTimeStep] = useState<'hourly' | 'daily'>(loadEnsembleTimeStep());
  const [proMode, setProMode] = useState<boolean>(loadEnsembleProMode());
  
  // Default variables based on mode
  const initialVar = timeStep === 'hourly' ? 'temperature_2m' : 'temperature_2m_max';
  const [selectedVariable, setSelectedVariable] = useState<string>(initialVar);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isModelInfoOpen, setIsModelInfoOpen] = useState(false);
  
  const t = (key: string) => getTranslation(key, settings.language);

  useEffect(() => {
      saveEnsembleViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
      saveEnsembleTimeStep(timeStep);
  }, [timeStep]);

  useEffect(() => {
      saveEnsembleProMode(proMode);
  }, [proMode]);

  // Update selected variable when switching timeStep if current variable is invalid
  useEffect(() => {
      const vars = timeStep === 'hourly' 
          ? (proMode ? ENSEMBLE_VARS_HOURLY_PRO : ENSEMBLE_VARS_HOURLY_BASIC)
          : (proMode ? ENSEMBLE_VARS_DAILY_PRO : ENSEMBLE_VARS_DAILY_BASIC);
      
      const exists = vars.find(v => v.key === selectedVariable);
      if (!exists) {
          setSelectedVariable(vars[0].key);
      }
  }, [timeStep, proMode]);

  // Load standard forecast for header
  useEffect(() => {
    const loadHeaderData = async () => {
        try {
            const data = await fetchForecast(location.lat, location.lon);
            setCurrentWeather(data);
        } catch (e) {
            console.error("Failed to load header weather", e);
        }
    };
    loadHeaderData();
  }, [location]);

    // Load ensemble data
    useEffect(() => {
        const loadEnsemble = async () => {
            // Validate variable against current mode to prevent 400 errors
            const currentVars = timeStep === 'hourly' 
                ? (proMode ? ENSEMBLE_VARS_HOURLY_PRO : ENSEMBLE_VARS_HOURLY_BASIC)
                : (proMode ? ENSEMBLE_VARS_DAILY_PRO : ENSEMBLE_VARS_DAILY_BASIC);
            
            const isValidVar = currentVars.find(v => v.key === selectedVariable);
            if (!isValidVar) {
                // If invalid, we wait for the other effect to update selectedVariable
                return;
            }

            setLoading(true);
            setError('');
            try {
                // Fetch only the selected variable
                const data = await fetchEnsemble(location.lat, location.lon, selectedModel, [selectedVariable], timeStep === 'daily');
                setEnsembleData(data);
            } catch (e) {
                console.error(e);
                setError(t('error'));
            } finally {
                setLoading(false);
            }
        };
        loadEnsemble();
        saveEnsembleModel(selectedModel);
    }, [location, selectedModel, selectedVariable, timeStep, proMode]); // Added proMode to dependency to be safe

  // Helper to determine value conversion
  const getValue = (val: number, variable: string) => {
      if (val === null || val === undefined) return null;
      if (variable.includes('temperature') || variable.includes('dewpoint')) return convertTemp(val, settings.tempUnit);
      if (variable.includes('wind_speed') || variable.includes('gusts')) return convertWind(val, settings.windUnit);
      if (variable.includes('rain') || variable.includes('precipitation') || variable.includes('snow') || variable.includes('evapotranspiration')) return convertPrecip(val, settings.precipUnit);
      if (variable.includes('visibility')) return val / 1000; // Convert to km for display
      if (variable.includes('pressure')) return convertPressure(val, settings.pressureUnit);
      return val;
  };

  const getUnitLabel = (variable: string) => {
      if (variable.includes('temperature') || variable.includes('dewpoint')) return settings.tempUnit === TempUnit.CELSIUS ? '°C' : '°F';
      if (variable.includes('wind_speed') || variable.includes('gusts')) return settings.windUnit;
      if (variable.includes('rain') || variable.includes('precipitation') || variable.includes('snow') || variable.includes('evapotranspiration')) return settings.precipUnit;
      if (variable.includes('pressure')) return settings.pressureUnit;
      if (variable.includes('cloud') || variable.includes('humidity')) return '%';
      if (variable.includes('direction')) return '°';
      if (variable.includes('cape')) return 'J/kg';
      if (variable.includes('radiation')) return 'MJ/m²';
      if (variable.includes('visibility')) return 'km';
      if (variable.includes('vapour_pressure')) return 'kPa';
      return '';
  };

  const processChartData = useMemo(() => {
      const isDaily = timeStep === 'daily';
      const source = isDaily ? ensembleData?.daily : ensembleData?.hourly;
      
      if (!source) return { data: [], memberKeys: [] };
      
      const time = source.time;
      const data: any[] = [];
      
      // Find all member keys for this variable
      // Include keys that are just the variable name (deterministic run often) or have _member suffix
      const memberKeys = Object.keys(source).filter(k => 
          k === selectedVariable || 
          k.startsWith(selectedVariable + '_member')
      );
      
      const cleanKeys = memberKeys.map(k => k === selectedVariable ? 'member0' : k.replace(selectedVariable + '_', ''));

      for (let i = 0; i < time.length; i++) {
          const point: any = { time: time[i] };
          const values: number[] = [];

          // Add value for each member
          memberKeys.forEach(k => {
              const memberId = k === selectedVariable ? 'member0' : k.replace(selectedVariable + '_', ''); // e.g., member0
              let val = source[k][i];
              
              val = getValue(val, selectedVariable);
              
              point[memberId] = val;
              if (typeof val === 'number' && !isNaN(val)) values.push(val);
          });

          // Calculate stats
          if (values.length > 0) {
              if (selectedVariable.includes('direction')) {
                 // Vector average for direction
                 let sumSin = 0;
                 let sumCos = 0;
                 values.forEach(v => {
                     const rad = v * Math.PI / 180;
                     sumSin += Math.sin(rad);
                     sumCos += Math.cos(rad);
                 });
                 const avgRad = Math.atan2(sumSin / values.length, sumCos / values.length);
                 let avgDeg = avgRad * 180 / Math.PI;
                 if (avgDeg < 0) avgDeg += 360;
                 point.avg = avgDeg;
                 point.min = Math.min(...values); 
                 point.max = Math.max(...values);
              } else {
                 point.avg = values.reduce((a, b) => a + b, 0) / values.length;
                 point.min = Math.min(...values);
                 point.max = Math.max(...values);

                 // Calculate quantiles for density view
                 const sorted = [...values].sort((a, b) => a - b);
                 const getQ = (p: number) => sorted[Math.floor(p * (sorted.length - 1))];
                 
                 point.q20 = getQ(0.2);
                 point.q40 = getQ(0.4);
                 point.q60 = getQ(0.6);
                 point.q80 = getQ(0.8);
                 
                 // Ranges for density bands
                 point.density1 = [point.min, point.q20];
                 point.density2 = [point.q20, point.q40];
                 point.density3 = [point.q40, point.q60];
                 point.density4 = [point.q60, point.q80];
                 point.density5 = [point.q80, point.max];
              }
              point.range = [point.min, point.max];
          }

          data.push(point);
      }
      return { data, memberKeys: cleanKeys };
  }, [ensembleData, selectedVariable, timeStep, settings]);

  const weekendAreas = useMemo(() => {
      if (!processChartData.data.length) return [];
      const areas: { x1: string, x2: string }[] = [];
      let start: string | null = null;
      
      processChartData.data.forEach((d: any, i: number) => {
          const date = new Date(d.time);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          
          if (isWeekend && !start) {
              start = d.time;
          } else if (!isWeekend && start) {
              // End of weekend block
              const prev = processChartData.data[i - 1];
              areas.push({ x1: start, x2: prev.time });
              start = null;
          }
      });
      
      if (start) {
          areas.push({ x1: start, x2: processChartData.data[processChartData.data.length - 1].time });
      }
      return areas;
  }, [processChartData.data]);

  const dayTicks = useMemo(() => {
      if (timeStep === 'daily' || !processChartData.data.length) return undefined;
      return processChartData.data
          .filter((d: any) => new Date(d.time).getHours() === 0)
          .map((d: any) => d.time);
  }, [processChartData.data, timeStep]);

  const CustomEnsembleTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    // Sort: Main member first, then others
    const sortedPayload = [...payload].sort((a, b) => {
        if (a.dataKey === 'avg') return -1;
        if (b.dataKey === 'avg') return 1;
        if (a.dataKey === 'range') return 1;
        if (b.dataKey === 'range') return -1;

        const aIsMain = a.dataKey === 'member0' || a.dataKey === 'member';
        const bIsMain = b.dataKey === 'member0' || b.dataKey === 'member';
        if (aIsMain) return -1;
        if (bIsMain) return 1;
        const aNum = parseInt(a.dataKey.replace('member', '')) || 999;
        const bNum = parseInt(b.dataKey.replace('member', '')) || 999;
        return aNum - bNum;
    });

    const isDaily = timeStep === 'daily';

    return (
        <div className={`bg-white dark:bg-[#1d2b32] p-3 rounded-xl border border-slate-200 dark:border-white/10 shadow-xl text-xs max-w-[400px]`}>
            <p className="font-bold mb-2 pb-1 border-b border-slate-100 dark:border-white/10 text-slate-500 dark:text-white/60">
                {new Date(label).toLocaleString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { 
                    weekday: 'short', 
                    day: 'numeric', 
                    month: 'short', 
                    ...(isDaily ? {} : { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' })
                })}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {sortedPayload.map((entry: any) => {
                    if (entry.dataKey === 'range' || entry.dataKey.startsWith('density')) return null;
                    
                    const isMain = entry.dataKey === 'member0' || entry.dataKey === 'member';
                    const isAvg = entry.dataKey === 'avg';
                    
                    const valueDisplay = selectedVariable.includes('direction') && !isAvg
                        ? getWindDirection(entry.value, settings.language) 
                        : (typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value);
                    
                    let name = entry.dataKey;
                    if (isMain) name = 'Main';
                    if (isAvg) name = 'Avg';
                    if (entry.dataKey.startsWith('member')) name = entry.dataKey.replace('member', '#');

                    return (
                        <div key={entry.dataKey} className="flex items-center gap-2">
                            <div 
                                className="w-2 h-2 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: entry.stroke }}
                            />
                            <span className={`opacity-60 ${isMain || isAvg ? 'font-bold text-primary' : ''}`}>
                                {name}
                            </span>
                            <span className={`font-mono font-bold ml-auto ${isMain || isAvg ? 'text-base' : ''}`}>
                                {valueDisplay} {getUnitLabel(selectedVariable)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
  };

  const currentTemp = currentWeather ? convertTemp(currentWeather.current.temperature_2m, settings.tempUnit) : 0;
  const highTemp = currentWeather ? convertTemp(currentWeather.daily.temperature_2m_max[0], settings.tempUnit) : 0;
  const lowTemp = currentWeather ? convertTemp(currentWeather.daily.temperature_2m_min[0], settings.tempUnit) : 0;

  const availableVariables = timeStep === 'hourly' 
      ? (proMode ? ENSEMBLE_VARS_HOURLY_PRO : ENSEMBLE_VARS_HOURLY_BASIC)
      : (proMode ? ENSEMBLE_VARS_DAILY_PRO : ENSEMBLE_VARS_DAILY_BASIC);

  const chartColor = '#3b82f6'; // Default blueish
  const isDirection = selectedVariable.includes('direction');

  // Generate ticks for 00, 06, 12, 18 hours if hourly
  const xTicks = useMemo(() => {
      if (timeStep === 'daily' || !processChartData.data.length) return undefined;
      
      return processChartData.data
          .filter(d => {
              const h = new Date(d.time).getHours();
              return h % 6 === 0; // 0, 6, 12, 18
          })
          .map(d => d.time);
  }, [processChartData.data, timeStep]);
  
  return (
    <div className="relative min-h-screen flex flex-col pb-20 overflow-y-auto overflow-x-hidden text-slate-800 dark:text-white bg-slate-50 dark:bg-background-dark transition-colors duration-300">
      
      {/* Background from Current Weather */}
      {currentWeather && (
        <div className="hidden dark:block absolute inset-0 z-0">
            <WeatherBackground 
                weatherCode={currentWeather.current.weather_code} 
                isDay={currentWeather.current.is_day} 
            />
        </div>
      )}

      <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/10 to-background-dark/90 z-0 pointer-events-none hidden dark:block" />
      
      <div className="relative z-10 flex flex-col h-full w-full">
        {/* Header */}
        <div className="flex flex-col pt-8 pb-4">
            <div className="flex items-center justify-center relative px-4 mb-2">
                <button onClick={() => onNavigate(ViewState.CURRENT)} className="absolute left-6 text-slate-400 dark:text-white/60 hover:text-slate-800 dark:hover:text-white transition-colors p-2">
                    <Icon name="arrow_back_ios_new" />
                </button>
                <div className="flex flex-col items-center">
                    <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-md dark:drop-shadow-md text-slate-800 dark:text-white">
                        <Icon name="location_on" className="text-primary" />
                        {location.name}, {location.country}
                    </h2>
                </div>
                <div className="absolute right-6 size-10" /> 
            </div>

            {/* Favorite Cities Selector */}
            <div className="w-full overflow-x-auto scrollbar-hide pl-4 mt-2">
                <div className="flex gap-3 pr-4">
                    <button 
                         onClick={() => {
                             const geo = navigator.geolocation;
                             if (geo) {
                                 setLoading(true);
                                 geo.getCurrentPosition((pos) => {
                                     setLocation({name: t('my_location'), country: "", lat: pos.coords.latitude, lon: pos.coords.longitude});
                                     setLoading(false);
                                 }, () => setLoading(false));
                             }
                         }}
                         className="flex items-center gap-1 px-4 py-2 rounded-full bg-white/60 dark:bg-white/10 hover:bg-white dark:hover:bg-primary/20 text-slate-800 dark:text-white hover:text-primary dark:hover:text-primary transition-colors border border-slate-200 dark:border-white/5 whitespace-nowrap backdrop-blur-md shadow-sm"
                    >
                        <Icon name="my_location" className="text-sm" />
                        <span className="text-sm font-medium">{t('my_location')}</span>
                    </button>
                    {settings.favorites.map((fav, i) => (
                        <button 
                            key={i}
                            onClick={() => setLocation(fav)}
                            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border backdrop-blur-md shadow-sm ${location.name === fav.name ? 'bg-primary text-white dark:bg-white dark:text-slate-800 font-bold' : 'bg-white/60 dark:bg-white/10 text-slate-800 dark:text-white hover:bg-white dark:hover:bg-white/20 border-slate-200 dark:border-white/5'}`}
                        >
                            {fav.name}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {/* Current Weather Display */}
        {currentWeather && (
            <div className="flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in duration-500 text-slate-800 dark:text-white">
                <div className="flex items-center gap-4">
                    <h1 className="text-[80px] font-bold leading-none tracking-tighter drop-shadow-2xl font-display">
                        {currentTemp}°
                    </h1>
                </div>
                <p className="text-xl font-medium tracking-wide drop-shadow-md mt-2 flex items-center gap-2">
                        <Icon name={mapWmoCodeToIcon(currentWeather.current.weather_code, currentWeather.current.is_day === 0)} className="text-2xl" />
                    {mapWmoCodeToText(currentWeather.current.weather_code, settings.language)}
                </p>
                <p className="text-slate-500 dark:text-white/80 text-base font-normal drop-shadow-md mt-1">
                    H:{highTemp}° L:{lowTemp}°
                </p>
            </div>
        )}

        {/* Ensemble Content */}
        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-2xl rounded-t-[40px] border-t border-slate-200 dark:border-white/10 p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom duration-500 text-slate-800 dark:text-white transition-colors min-h-[60vh]">
            
            <div className="mb-6 space-y-4">
                {/* Top Controls Row */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    {/* Model Select */}
                    <div className="w-full md:w-auto flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-white/60">{t('ensemble.model')}</label>
                            <button 
                                onClick={() => setIsModelInfoOpen(true)}
                                className="text-primary hover:text-primary/80 transition-colors"
                            >
                                <Icon name="info" className="text-lg" />
                            </button>
                        </div>
                        <select 
                            value={selectedModel} 
                            onChange={(e) => setSelectedModel(e.target.value as EnsembleModel)}
                            className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 appearance-none font-bold text-sm outline-none focus:border-primary transition-colors"
                        >
                            {ENSEMBLE_MODELS.map(m => (
                                <option key={m.id} value={m.id} className="text-slate-800 bg-white">
                                    {m.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Toggles */}
                    <div className="flex gap-4 w-full md:w-auto">
                        {/* Hourly/Daily Toggle */}
                        <div className="flex-1 md:flex-none">
                             <label className="block text-xs font-bold uppercase text-slate-500 dark:text-white/60 mb-2">{t('forecast_type')}</label>
                             <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                                <button
                                    onClick={() => setTimeStep('hourly')}
                                    className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${timeStep === 'hourly' ? 'bg-white dark:bg-white/20 shadow-sm text-primary' : 'text-slate-500'}`}
                                >
                                    Hourly
                                </button>
                                <button
                                    onClick={() => setTimeStep('daily')}
                                    className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${timeStep === 'daily' ? 'bg-white dark:bg-white/20 shadow-sm text-primary' : 'text-slate-500'}`}
                                >
                                    Daily
                                </button>
                             </div>
                        </div>

                        {/* Pro Mode Toggle */}
                        <div className="flex flex-col items-center">
                             <label className="block text-xs font-bold uppercase text-slate-500 dark:text-white/60 mb-2">Pro Mode</label>
                             <button
                                onClick={() => setProMode(!proMode)}
                                className={`w-12 h-8 rounded-full transition-colors relative ${proMode ? 'bg-primary' : 'bg-slate-300 dark:bg-white/10'}`}
                             >
                                <div className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${proMode ? 'translate-x-4' : ''}`} />
                             </button>
                        </div>
                    </div>
                </div>

                {/* Variable Selector */}
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-white/60 mb-2">Variable</label>
                    <select 
                        value={selectedVariable} 
                        onChange={(e) => setSelectedVariable(e.target.value)}
                        className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 appearance-none font-bold text-sm outline-none focus:border-primary transition-colors"
                    >
                        {availableVariables.map(v => (
                            <option key={v.key} value={v.key} className="text-slate-800 bg-white">
                                {v.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* View Mode Selector */}
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-white/60 mb-2">{t('view_mode')}</label>
                    <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl overflow-x-auto">
                        {[
                            { id: 'all', label: t('all') },
                            { id: 'main', label: t('ensemble.main') },
                            { id: 'avg', label: t('average') },
                            { id: 'spread', label: t('spread') },
                            { id: 'density', label: t('density') }
                        ].map(mode => (
                            <button
                                key={mode.id}
                                onClick={() => setViewMode(mode.id as any)}
                                className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                                    viewMode === mode.id 
                                        ? 'bg-white dark:bg-white/20 shadow-sm text-primary dark:text-white' 
                                        : 'text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/60'
                                }`}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
            ) : ensembleData ? (
                <div className="w-full h-[400px]">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Icon name="show_chart" className="text-primary" />
                        {availableVariables.find(v => v.key === selectedVariable)?.label}
                    </h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={processChartData.data}>
                            <defs>
                                <linearGradient id="gradientGrid" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#888" stopOpacity={0.1}/>
                                    <stop offset="100%" stopColor="#888" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={timeStep === 'daily'} horizontal={true} stroke="rgba(128,128,128,0.2)" />
                            
                            {/* Vertical lines for each day in hourly mode */}
                            {timeStep === 'hourly' && dayTicks?.map((tick: any) => (
                                <ReferenceLine key={tick} x={tick} stroke="rgba(128,128,128,0.2)" strokeDasharray="3 3" />
                            ))}
                            
                            {/* Weekend Highlighting */}
                            {weekendAreas.map((area, index) => (
                                <ReferenceArea 
                                    key={`weekend-${index}`} 
                                    x1={area.x1} 
                                    x2={area.x2} 
                                    fill="#fbbf24" 
                                    fillOpacity={0.05} 
                                    ifOverflow="extendDomain"
                                />
                            ))}

                            <XAxis 
                                dataKey="time" 
                                ticks={xTicks} // Use explicit ticks if calculated
                                tickFormatter={(val) => {
                                    const date = new Date(val);
                                    if (timeStep === 'daily') {
                                        return date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short' });
                                    }
                                    return date.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
                                }}
                                minTickGap={10} // Reduced gap to allow more ticks
                                stroke="rgba(128,128,128,0.5)"
                                tick={{ fontSize: 10 }}
                            />
                            {/* Additional Day Axis for Hourly View */}
                            {timeStep === 'hourly' && (
                                <XAxis 
                                    xAxisId="days"
                                    dataKey="time"
                                    ticks={dayTicks}
                                    tickFormatter={(val) => {
                                        const date = new Date(val);
                                        return date.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short' });
                                    }}
                                    orientation="bottom"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }}
                                    height={30}
                                    stroke="rgba(128,128,128,0)"
                                />
                            )}
                            <YAxis 
                                stroke="rgba(128,128,128,0.5)"
                                tick={{ fontSize: 10 }}
                                unit={getUnitLabel(selectedVariable)}
                                width={40}
                            />
                            <Tooltip content={<CustomEnsembleTooltip />} />
                            
                            {/* Range Area (Spread Mode) - Disable for Direction */}
                            {viewMode === 'spread' && !isDirection && (
                               <Area 
                                  type="monotone"
                                  dataKey="range"
                                  stroke="none"
                                  fill={chartColor}
                                  fillOpacity={0.2}
                               />
                            )}

                            {/* Density Mode Bands - Disable for Direction */}
                            {viewMode === 'density' && !isDirection && (
                               <>
                                  <Area type="monotone" dataKey="density1" stroke="none" fill={chartColor} fillOpacity={0.1} isAnimationActive={false} />
                                  <Area type="monotone" dataKey="density5" stroke="none" fill={chartColor} fillOpacity={0.1} isAnimationActive={false} />
                                  <Area type="monotone" dataKey="density2" stroke="none" fill={chartColor} fillOpacity={0.3} isAnimationActive={false} />
                                  <Area type="monotone" dataKey="density4" stroke="none" fill={chartColor} fillOpacity={0.3} isAnimationActive={false} />
                                  <Area type="monotone" dataKey="density3" stroke="none" fill={chartColor} fillOpacity={0.6} isAnimationActive={false} />
                                  <Line type="monotone" dataKey="min" stroke={chartColor} strokeWidth={1} dot={false} opacity={0.5} isAnimationActive={false} />
                                  <Line type="monotone" dataKey="max" stroke={chartColor} strokeWidth={1} dot={false} opacity={0.5} isAnimationActive={false} />
                               </>
                            )}

                            {/* Individual Members - Show all for Density/Spread if Direction */}
                            {(viewMode === 'all' || viewMode === 'main' || (isDirection && (viewMode === 'density' || viewMode === 'spread'))) && processChartData.memberKeys.map((key: string) => {
                                const num = parseInt(key.replace(/[^0-9]/g, ''), 10);
                                const isMainMember = key === 'member0' || key === 'member' || (!isNaN(num) && num === 0); 
                                
                                if (viewMode === 'main' && !isMainMember) return null;

                                return (
                                    <Line 
                                      key={key} 
                                      type="monotone" 
                                      dataKey={key} 
                                      stroke={isMainMember ? '#ef4444' : chartColor} 
                                      strokeWidth={isMainMember ? 3 : 1} 
                                      dot={false} 
                                      opacity={viewMode === 'main' ? 1 : (isMainMember ? 1 : 0.3)} 
                                      isAnimationActive={false}
                                      style={{ zIndex: isMainMember ? 100 : 1 }}
                                    />
                                );
                            })}

                            {/* Average Line */}
                            {(viewMode === 'avg' || viewMode === 'spread' || viewMode === 'density') && (
                                <Line 
                                  type="monotone" 
                                  dataKey="avg" 
                                  stroke="#ef4444" 
                                  strokeWidth={3} 
                                  dot={false} 
                                  isAnimationActive={false}
                                  style={{ zIndex: 100 }}
                                />
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center opacity-60 py-20">
                    <Icon name="cloud_off" className="text-6xl mb-4" />
                    <p>{error || t('loading')}</p>
                </div>
            )}
            
            <ModelInfoModal isOpen={isModelInfoOpen} onClose={() => setIsModelInfoOpen(false)} settings={settings} />
        </div>
      </div>
    </div>
  );
};