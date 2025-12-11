
import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings, Location } from '../types';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Area } from 'recharts';
import { fetchHistorical, fetchForecast, convertTemp, convertWind, convertPrecip, mapWmoCodeToIcon, mapWmoCodeToText } from '../services/weatherService';
import { loadCurrentLocation, saveHistoricalLocation } from '../services/storageService';
import { searchCityByName } from '../services/geoService';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const HistoricalWeatherView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location1, setLocation1] = useState<Location>(loadCurrentLocation());
  const [location2, setLocation2] = useState<Location>(loadCurrentLocation());
  const [date1, setDate1] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setFullYear(d.getFullYear() - 1); return d; });
  const [date2, setDate2] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; });
  const [pickerOpen, setPickerOpen] = useState<null | 'date1' | 'date2'>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const [pendingLocation, setPendingLocation] = useState<Location | null>(null);
  const [syncLocation, setSyncLocation] = useState<boolean>(true);
  
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ diff: 0, currentAvg: 0, pastAvg: 0 });
  const [noDataInfo1, setNoDataInfo1] = useState<number | null>(null);
  const [noDataInfo2, setNoDataInfo2] = useState<number | null>(null);
  const [detail, setDetail] = useState({
    tempAvg1: 0,
    tempAvg2: 0,
    tempMin1: 0,
    tempMin2: 0,
    tempMax1: 0,
    tempMax2: 0,
    rainSum1: 0,
    rainSum2: 0,
    windMax1: 0,
    windMax2: 0,
    sunTotal1: 0,
    sunTotal2: 0,
    windDirAvg1: 0,
    windDirAvg2: 0,
    code1: 0,
    code2: 0,
    codeText1: '',
    codeText2: '',
  });

  const t = (key: string) => getTranslation(key, settings.language);

  useEffect(() => {
    saveHistoricalLocation(location1);
    saveHistoricalLocation(location2);
    fetchData();
  }, [location1, location2, date1, date2, settings.tempUnit]);

  useEffect(() => {
    if (pickerOpen === 'date1') {
      setPendingDate(new Date(date1));
      setPendingLocation(location1);
    } else if (pickerOpen === 'date2') {
      setPendingDate(new Date(date2));
      setPendingLocation(location2);
    } else {
      setPendingDate(null);
      setPendingLocation(null);
    }
  }, [pickerOpen]);

  const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  };

  const isFutureOrToday = (d: Date) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const check = new Date(d);
    check.setHours(0,0,0,0);
    return check >= today;
  };

  const shiftDate = (currentDate: Date, days: number): Date => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    
    // Check constraint: max yesterday
    if (isFutureOrToday(newDate)) {
        return getYesterday();
    }
    return newDate;
  };
  
  const handleShiftBoth = (days: number) => {
    const t1 = new Date(date1);
    t1.setDate(t1.getDate() + days);
    
    const t2 = new Date(date2);
    t2.setDate(t2.getDate() + days);

    // If moving forward, check if either hits the future wall
    if (days > 0) {
        if (isFutureOrToday(t1) || isFutureOrToday(t2)) return;
    }
    
    // Apply shift
    setDate1(t1);
    setDate2(t2);
  };

  const canShiftNext = () => {
     const t1 = new Date(date1); t1.setDate(t1.getDate() + 1);
     const t2 = new Date(date2); t2.setDate(t2.getDate() + 1);
     return !isFutureOrToday(t1) && !isFutureOrToday(t2);
  };


  const formatShortDate = (date: Date) => {
    const locale = settings.language === 'nl' ? 'nl-NL' : 'en-GB';
    const day = date.toLocaleDateString(locale, { day: '2-digit' });
    const mon = date.toLocaleDateString(locale, { month: 'short' });
    return `${day} ${mon}`;
  };

  const formatVeryShortDate = (date: Date) => {
    const locale = settings.language === 'nl' ? 'nl-NL' : 'en-GB';
    const day = date.toLocaleDateString(locale, { day: '2-digit' });
    const monShort = date.toLocaleDateString(locale, { month: 'short' });
    const mon3 = monShort.replace(/[^a-zA-Z]/g, '').slice(0, 3);
    return `${day} ${mon3}`;
  };

  const formatUnderSlider = (date: Date) => {
    const locale = settings.language === 'nl' ? 'nl-NL' : 'en-GB';
    const y = date.getFullYear();
    const monShort = date.toLocaleDateString(locale, { month: 'short' }).replace(/[^a-zA-Z]/g, '').slice(0, 3);
    const d = date.getDate();
    const wk = date.toLocaleDateString(locale, { weekday: 'long' });
    return `${y} - ${monShort} - ${d} • ${wk}`;
  };

  const formatCardDate = (date: Date) => {
    const locale = settings.language === 'nl' ? 'nl-NL' : 'en-GB';
    const y = date.getFullYear();
    const monShort = date.toLocaleDateString(locale, { month: 'short' }).replace(/[^a-zA-Z]/g, '').slice(0, 3);
    const d = date.getDate();
    const wk = date.toLocaleDateString(locale, { weekday: 'long' });
    return `${d} - ${monShort} - ${y} • ${wk}`;
  };

  const formatLegendDate = (date: Date) => {
    const locale = settings.language === 'nl' ? 'nl-NL' : 'en-GB';
    const y = date.getFullYear();
    const monShort = date.toLocaleDateString(locale, { month: 'short' }).replace(/[^a-zA-Z]/g, '').slice(0, 3);
    const d = date.getDate();
    return `${y} - ${monShort} - ${d}`;
  };

  const getDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const date1Color = 'rgba(128,128,128,1)';
  const date2Color = '#13b6ec';
  const date1Fill = 'rgba(128,128,128,0.15)';
  const date2Fill = 'rgba(19,182,236,0.20)';

  const getWindCardinal = (deg: number) => {
    const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  };

  const formatDuration = (seconds: number) => {
    const totalMinutes = Math.round(seconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
        const d1 = getDateString(date1);
        const d2 = getDateString(date2);
        const data1 = await fetchHistorical(location1.lat, location1.lon, d1, d1);
        const data2 = await fetchHistorical(location2.lat, location2.lon, d2, d2);

        const hours = Array.from({length: 24}, (_, i) => i);
        let processed = hours.map(h => ({
            hour: `${h}:00`,
            temp1: convertTemp((data1.hourly.temperature_2m[h] || 0), settings.tempUnit),
            temp2: convertTemp((data2.hourly.temperature_2m[h] || 0), settings.tempUnit),
            wind1: convertWind((data1.hourly.wind_speed_10m?.[h] || 0), settings.windUnit),
            wind2: convertWind((data2.hourly.wind_speed_10m?.[h] || 0), settings.windUnit),
            rain1: convertPrecip((data1.hourly.precipitation?.[h] || 0), settings.precipUnit),
            rain2: convertPrecip((data2.hourly.precipitation?.[h] || 0), settings.precipUnit),
            windDir1: data1.hourly.wind_direction_10m?.[h] || 0,
            windDir2: data2.hourly.wind_direction_10m?.[h] || 0,
            sun1: (data1.hourly.sunshine_duration?.[h] || 0) / 60,
            sun2: (data2.hourly.sunshine_duration?.[h] || 0) / 60,
        }));
        if (processed.length > 0) {
          const last = processed[processed.length - 1];
          processed = [...processed, { ...last, hour: '24:00' }];
        }

        setData(processed);
        
        const avg1 = processed.reduce((acc, curr) => acc + curr.temp1, 0) / 24;
        const avg2 = processed.reduce((acc, curr) => acc + curr.temp2, 0) / 24;
        
        setStats({
            currentAvg: Math.round(avg2),
            pastAvg: Math.round(avg1),
            diff: parseFloat((avg2 - avg1).toFixed(1))
        });

        // Calculations using daily data for better accuracy where available
        // Sunshine (seconds)
        const sunSec1 = data1.daily?.sunshine_duration?.[0] ?? processed.reduce((a,c)=> a + ((c.sun1||0)*60), 0);
        const sunSec2 = data2.daily?.sunshine_duration?.[0] ?? processed.reduce((a,c)=> a + ((c.sun2||0)*60), 0);
        
        // Rain (mm raw) -> convert
        const rainRaw1 = data1.daily?.precipitation_sum?.[0] ?? data1.hourly.precipitation.reduce((a:any, b:any) => a + (b||0), 0);
        const rainRaw2 = data2.daily?.precipitation_sum?.[0] ?? data2.hourly.precipitation.reduce((a:any, b:any) => a + (b||0), 0);
        
        // Wind Max (km/h raw) -> convert
        const windRaw1 = data1.daily?.wind_speed_10m_max?.[0] ?? Math.max(...(data1.hourly.wind_speed_10m || []));
        const windRaw2 = data2.daily?.wind_speed_10m_max?.[0] ?? Math.max(...(data2.hourly.wind_speed_10m || []));

        // Temp Max for stats (use convertTemp locally with float or manual)
        const tempMax1 = data1.daily?.temperature_2m_max?.[0] ?? Math.max(...processed.map(p => data1.hourly.temperature_2m[parseInt(p.hour)] || 0));
        const tempMax2 = data2.daily?.temperature_2m_max?.[0] ?? Math.max(...processed.map(p => data2.hourly.temperature_2m[parseInt(p.hour)] || 0));

        // Use custom conversion for 1 decimal precision in stats
        const formatTempDecimal = (t: number) => {
            if (settings.tempUnit === 'fahrenheit') {
                return parseFloat(((t * 9/5) + 32).toFixed(1));
            }
            return parseFloat(t.toFixed(1));
        };

        const tMax1 = formatTempDecimal(tempMax1);
        const tMax2 = formatTempDecimal(tempMax2);

        const vecAvg = (arr: number[]) => {
          let sinSum = 0; let cosSum = 0;
          arr.forEach(d => { sinSum += Math.sin(d * Math.PI/180); cosSum += Math.cos(d * Math.PI/180); });
          return (Math.atan2(sinSum, cosSum) * 180 / Math.PI + 360) % 360;
        };

        const windDirAvg1 = Math.round(vecAvg(processed.map(p => p.windDir1||0)));
        const windDirAvg2 = Math.round(vecAvg(processed.map(p => p.windDir2||0)));
        
        setStats({
            currentAvg: tMax2,
            pastAvg: tMax1,
            diff: parseFloat((tMax2 - tMax1).toFixed(1))
        });

        setDetail({
          tempAvg1: Math.round(avg1),
          tempAvg2: Math.round(avg2),
          tempMin1: convertTemp((data1.daily?.temperature_2m_min?.[0] || Math.min(...processed.map(p=>p.temp1))), settings.tempUnit),
          tempMin2: convertTemp((data2.daily?.temperature_2m_min?.[0] || Math.min(...processed.map(p=>p.temp2))), settings.tempUnit),
          tempMax1: convertTemp((data1.daily?.temperature_2m_max?.[0] || Math.max(...processed.map(p=>p.temp1))), settings.tempUnit),
          tempMax2: convertTemp((data2.daily?.temperature_2m_max?.[0] || Math.max(...processed.map(p=>p.temp2))), settings.tempUnit),
          rainSum1: convertPrecip(rainRaw1, settings.precipUnit),
          rainSum2: convertPrecip(rainRaw2, settings.precipUnit),
          windMax1: convertWind(windRaw1, settings.windUnit),
          windMax2: convertWind(windRaw2, settings.windUnit),
          sunTotal1: sunSec1,
          sunTotal2: sunSec2,
          windDirAvg1,
          windDirAvg2,
          code1: data1.daily?.weather_code?.[0] || 0,
          code2: data2.daily?.weather_code?.[0] || 0,
          codeText1: mapWmoCodeToText(data1.daily?.weather_code?.[0] || 0, settings.language),
          codeText2: mapWmoCodeToText(data2.daily?.weather_code?.[0] || 0, settings.language),
        });

        const hasData1 = !!(data1?.hourly?.temperature_2m?.length);
        const hasData2 = !!(data2?.hourly?.temperature_2m?.length);
        if (!hasData1) {
          const avail1 = await findFirstAvailableYear(location1, date1.getMonth(), date1.getDate());
          setNoDataInfo1(avail1);
        } else {
          setNoDataInfo1(null);
        }
        if (!hasData2) {
          const avail2 = await findFirstAvailableYear(location2, date2.getMonth(), date2.getDate());
          setNoDataInfo2(avail2);
        } else {
          setNoDataInfo2(null);
        }

    } catch (e) {
        console.error("Error fetching historical comparison", e);
    } finally {
        setLoading(false);
    }
  };

  const hasDataFor = async (loc: Location, year: number, monthIndex: number, dayNum: number) => {
    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(dayNum).padStart(2, '0');
    const ds = `${year}-${mm}-${dd}`;
    try {
      const res = await fetchHistorical(loc.lat, loc.lon, ds, ds);
      return !!(res?.hourly?.temperature_2m?.length);
    } catch {
      return false;
    }
  };

  const findFirstAvailableYear = async (loc: Location, monthIndex: number, dayNum: number) => {
    const start = 1900;
    const end = new Date().getFullYear();
    let step = 20;
    let cur = start;
    let found = -1;
    while (cur <= end) {
      const ok = await hasDataFor(loc, cur, monthIndex, dayNum);
      if (ok) { found = cur; break; }
      cur += step;
    }
    if (found === -1) return null;
    let low = Math.max(start, found - step);
    for (let y = low; y < found; y++) {
      const ok = await hasDataFor(loc, y, monthIndex, dayNum);
      if (ok) { return y; }
    }
    return found;
  };

  return (
    <div className="flex flex-col min-h-screen pb-24 bg-background-dark overflow-y-auto text-slate-800 dark:text-white transition-colors">
      <div className="flex items-center justify-between p-4 pt-8">
        <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10">
            <Icon name="arrow_back_ios_new" />
        </button>
        <h1 className="text-lg font-bold">{t('compare')}</h1>
        <button className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10">
            <Icon name="more_vert" />
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2">
        <div className="bg-white dark:bg-white/5 rounded-xl p-3 flex flex-col gap-1 border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors cursor-pointer" onClick={() => setPickerOpen('date1')} role="button">
            <span className="text-xs opacity-50 font-bold uppercase">{t('date_1')}</span>
            <div className="flex items-center justify-between">
                <button 
                    onClick={(e) => { e.stopPropagation(); handleShiftBoth(-1); }} 
                    className="size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all"
                >
                    <Icon name="chevron_left" className="text-lg" />
                </button>
                <span className="text-primary font-bold truncate text-sm">{formatCardDate(date1)}</span>
                <button 
                    onClick={(e) => { e.stopPropagation(); handleShiftBoth(1); }} 
                    disabled={!canShiftNext()}
                    className={`size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all ${!canShiftNext() ? 'opacity-20 cursor-not-allowed' : ''}`}
                >
                    <Icon name="chevron_right" className="text-lg" />
                </button>
            </div>
            <div className="flex items-center gap-1 text-xs opacity-60 justify-center">
                <Icon name="location_on" className="text-xs" /> <span className="truncate">{location1.name}</span>
            </div>
        </div>
        <Icon name="compare_arrows" className="opacity-30 text-3xl" />
        <div className="bg-white dark:bg-white/5 rounded-xl p-3 flex flex-col gap-1 border border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors cursor-pointer" onClick={() => setPickerOpen('date2')} role="button">
            <span className="text-xs opacity-50 font-bold uppercase">{t('date_2')}</span>
            <div className="flex items-center justify-between">
                <button 
                    onClick={(e) => { e.stopPropagation(); handleShiftBoth(-1); }} 
                    className="size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all"
                >
                    <Icon name="chevron_left" className="text-lg" />
                </button>
                <span className="font-bold text-sm">{formatCardDate(date2)}</span>
                <button 
                    onClick={(e) => { e.stopPropagation(); handleShiftBoth(1); }} 
                    disabled={!canShiftNext()}
                    className={`size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all ${!canShiftNext() ? 'opacity-20 cursor-not-allowed' : ''}`}
                >
                    <Icon name="chevron_right" className="text-lg" />
                </button>
            </div>
            <div className="flex items-center gap-1 text-xs opacity-60 justify-center">
                <Icon name="location_on" className="text-xs" /> <span className="truncate">{location2.name}</span>
            </div>
        </div>
      </div>

      <div className="px-4">
        <div className="flex justify-end gap-2">
            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setDate2(d); }} className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-primary/30">{t('quick.yesterday')}</button>
            <button onClick={() => { const d = new Date(); d.setMonth(d.getMonth() - 1); setDate2(d); }} className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-primary/30">{t('quick.last_month')}</button>
            <button onClick={() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); setDate2(d); }} className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-primary/30">{t('quick.last_year')}</button>
            <button onClick={() => { const d = new Date(); d.setFullYear(d.getFullYear() - 10); setDate2(d); }} className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-primary/30">{t('quick.ten_years')}</button>
        </div>
      </div>

      {pickerOpen && (
        <div className="px-4 py-2">
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs font-bold opacity-50 mb-1">Jaar</p>
                <input type="range" min={1900} max={new Date().getFullYear()} step={1} value={(pendingDate||new Date()).getFullYear()} onInput={(e) => {
                  const cur = pendingDate || new Date();
                  const newYear = parseInt((e.target as HTMLInputElement).value);
                  const m = cur.getMonth();
                  const day = cur.getDate();
                  const lastDay = new Date(newYear, m + 1, 0).getDate();
                  const d = new Date(newYear, m, Math.min(day, lastDay));
                  setPendingDate(d);
                }} onChange={(e) => {
                  const cur = pendingDate || new Date();
                  const newYear = parseInt((e.target as HTMLInputElement).value);
                  const m = cur.getMonth();
                  const day = cur.getDate();
                  const lastDay = new Date(newYear, m + 1, 0).getDate();
                  const d = new Date(newYear, m, Math.min(day, lastDay));
                  setPendingDate(d);
                }} className="w-full" />
              </div>
              <div>
                <p className="text-xs font-bold opacity-50 mb-1">Maand</p>
                <input type="range" min={1} max={12} step={1} value={(pendingDate||new Date()).getMonth()+1} onInput={(e) => {
                  const cur = pendingDate || new Date();
                  const newMonth = parseInt((e.target as HTMLInputElement).value) - 1;
                  const y = cur.getFullYear();
                  const day = cur.getDate();
                  const lastDay = new Date(y, newMonth + 1, 0).getDate();
                  const d = new Date(y, newMonth, Math.min(day, lastDay));
                  setPendingDate(d);
                }} onChange={(e) => {
                  const cur = pendingDate || new Date();
                  const newMonth = parseInt((e.target as HTMLInputElement).value) - 1;
                  const y = cur.getFullYear();
                  const day = cur.getDate();
                  const lastDay = new Date(y, newMonth + 1, 0).getDate();
                  const d = new Date(y, newMonth, Math.min(day, lastDay));
                  setPendingDate(d);
                }} className="w-full" />
              </div>
              <div>
                <p className="text-xs font-bold opacity-50 mb-1">Dag</p>
                <input type="range" min={1} max={new Date((pendingDate||new Date()).getFullYear(), (pendingDate||new Date()).getMonth()+1, 0).getDate()} step={1} value={(pendingDate||new Date()).getDate()} onInput={(e) => {
                  const d = new Date(pendingDate||new Date());
                  d.setDate(parseInt((e.target as HTMLInputElement).value));
                  setPendingDate(d);
                }} onChange={(e) => {
                  const d = new Date(pendingDate||new Date());
                  d.setDate(parseInt((e.target as HTMLInputElement).value));
                  setPendingDate(d);
                }} className="w-full" />
              </div>
            </div>

            <div className="text-center mb-4">
              <p className="text-2xl font-bold">{pendingDate ? formatUnderSlider(pendingDate) : ''}</p>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Icon name="search" />
              <input value={searchQuery} onChange={async (e) => { setSearchQuery(e.target.value); try { const res = await searchCityByName(e.target.value); setSearchResults(res); } catch { setSearchResults([]); } }} className="flex-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg px-2 py-1 text-sm" placeholder={settings.language==='nl'?'Zoek stad':'Search city'} />
            </div>
            {searchResults.length>0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                {searchResults.map((loc, i) => (
                  <button key={i} onClick={() => { setPendingLocation(loc); setSearchQuery(''); setSearchResults([]); }} className={`p-2 rounded-lg text-left border ${pendingLocation?.name===loc.name ? 'bg-primary/10 border-primary text-primary' : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/10'}`}>
                    {loc.name}{loc.country?`, ${loc.country}`:''}
                  </button>
                ))}
              </div>
            )}

            {pendingLocation && (
              <div className="mb-3 text-xs opacity-70">
                <span className="font-bold">Selected:</span> {pendingLocation.name}{pendingLocation.country?`, ${pendingLocation.country}`:''}
              </div>
            )}

            <p className="text-xs font-bold opacity-50 mb-1">Favorieten</p>
            <div className="flex gap-2 flex-wrap">
              {settings.favorites.map((fav, i) => (
                <button type="button" key={i} onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setPendingLocation(fav); setSearchQuery(''); setSearchResults([]); }} className={`px-3 py-1.5 rounded-full text-xs border cursor-pointer ${ pendingLocation?.name===fav.name ? 'bg-primary/20 border-primary text-primary font-bold' : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/10' }`}>
                  {fav.name}
                </button>
              ))}
            </div>

            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm opacity-70">
                <input type="checkbox" checked={syncLocation} onChange={(e) => setSyncLocation(e.target.checked)} />
                {t('sync_location')}
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setPickerOpen(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10">{t('discard')}</button>
              <button type="button" onClick={(ev) => { ev.preventDefault(); if (!pendingDate) { setPickerOpen(null); return; } if (pickerOpen==='date1') { setDate1(pendingDate); if (pendingLocation) { setLocation1(pendingLocation); if (syncLocation) setLocation2(pendingLocation); } } else if (pickerOpen==='date2') { setDate2(pendingDate); if (pendingLocation) { setLocation2(pendingLocation); if (syncLocation) setLocation1(pendingLocation); } } setPickerOpen(null); }} className="px-4 py-2 rounded-lg bg-primary text-white">{t('apply')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-2 min-h-[300px]">
        {loading ? (
             <div className="h-[250px] w-full flex items-center justify-center border border-dashed border-slate-300 dark:border-white/10 rounded-2xl">
                 <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
             </div>
        ) : (
            <>
                <div className="flex justify-between items-end mb-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                      <div>
                        <p className="text-xs opacity-60 font-medium">{formatLegendDate(date1)}</p>
                        <p className="text-2xl font-bold" style={{ color: date1Color }}>{stats.pastAvg.toFixed(1)}°</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                      <div>
                        <p className="text-xs opacity-60 font-medium">{formatLegendDate(date2)}</p>
                        <p className="text-2xl font-bold" style={{ color: date2Color }}>{stats.currentAvg.toFixed(1)}°</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="opacity-60 text-xs font-medium">{t('temp_diff')}</p>
                    <p className={`text-xl font-bold ${stats.diff >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{stats.diff > 0 ? '+' : ''}{stats.diff.toFixed(1)}°</p>
                  </div>
                </div>

                <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke="rgba(128,128,128,0.1)" />
                            <XAxis dataKey="hour" tick={{fill: '#888', fontSize: 10}} tickLine={false} axisLine={false} interval={3} />
                            <YAxis tick={{fill: '#888', fontSize: 10}} tickLine={false} axisLine={false} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: settings.theme === 'dark' ? '#1d2b32' : '#ffffff', border: '1px solid rgba(128,128,128,0.1)', borderRadius: '8px', color: settings.theme === 'dark' ? '#fff' : '#000' }}
                                itemStyle={{ fontSize: '12px' }}
                                labelStyle={{ color: '#aaa', marginBottom: '4px', fontSize: '12px' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '10px' }} />
                            <Line type="monotone" dataKey="temp1" name={`${t('temp')} (${formatLegendDate(date1)})`} stroke={date1Color} strokeWidth={3} dot={false} />
                            <Line type="monotone" dataKey="temp2" name={`${t('temp')} (${formatLegendDate(date2)})`} stroke={date2Color} strokeWidth={3} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                {noDataInfo1 && (
                  <div className="mt-3 text-xs opacity-70">
                    <span className="font-bold">{t('no_data_available')}</span> • {t('date_1')}: {t('data_from_year').replace('{year}', String(noDataInfo1))}
                  </div>
                )}
                {noDataInfo2 && (
                  <div className="mt-1 text-xs opacity-70">
                    <span className="font-bold">{t('no_data_available')}</span> • {t('date_2')}: {t('data_from_year').replace('{year}', String(noDataInfo2))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                    <p className="text-xs opacity-60 uppercase font-bold mb-2">{t('weather')}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="material-symbols-outlined" style={{ color: date1Color }}>{mapWmoCodeToIcon(detail.code1)}</span>
                          <span>{detail.codeText1}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="material-symbols-outlined" style={{ color: date2Color }}>{mapWmoCodeToIcon(detail.code2)}</span>
                          <span>{detail.codeText2}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                    <p className="text-xs opacity-60 uppercase font-bold mb-2">{t('temp')}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                        <div className="text-sm">
                          <div>Avg: <b>{detail.tempAvg1}°</b></div>
                          <div>Min: <b>{detail.tempMin1}°</b></div>
                          <div>Max: <b>{detail.tempMax1}°</b></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                        <div className="text-sm">
                          <div>Avg: <b>{detail.tempAvg2}°</b></div>
                          <div>Min: <b>{detail.tempMin2}°</b></div>
                          <div>Max: <b>{detail.tempMax2}°</b></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                    <p className="text-xs opacity-60 uppercase font-bold mb-2">{t('wind')}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                        <div className="text-sm">
                          <div>Max: <b>{detail.windMax1} {settings.windUnit}</b></div>
                          <div>Dir: <b>{getWindCardinal(detail.windDirAvg1)}</b></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                        <div className="text-sm">
                          <div>Max: <b>{detail.windMax2} {settings.windUnit}</b></div>
                          <div>Dir: <b>{getWindCardinal(detail.windDirAvg2)}</b></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                    <p className="text-xs opacity-60 uppercase font-bold mb-2">{t('rain')}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                        <div className="text-sm">
                          <div>Total: <b>{detail.rainSum1} {settings.precipUnit}</b></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                        <div className="text-sm">
                          <div>Total: <b>{detail.rainSum2} {settings.precipUnit}</b></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                    <p className="text-xs opacity-60 uppercase font-bold mb-2">{t('sunshine')}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                        <div className="text-sm">
                          <div>Total: <b>{formatDuration(detail.sunTotal1)}</b></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                        <div className="text-sm">
                          <div>Total: <b>{formatDuration(detail.sunTotal2)}</b></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 mt-4">
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                <div className="size-12 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-500 dark:text-blue-400">
                    <Icon name="history" />
                </div>
                <div className="flex-1">
                    <p className="text-sm opacity-60 mb-1">{t('insight')}</p>
                    <p>
                        {t('insight_desc')} <span className="font-bold">{Math.abs(stats.diff)}° {stats.diff >= 0 ? t('warmer') : t('colder')}</span> {t('than')} {getDateString(date1)}.
                    </p>
                </div>
            </div>
      </div>
    </div>
  );
};
