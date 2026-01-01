
import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings, Location } from '../types';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchHistorical, convertTemp, convertWind, convertPrecip, mapWmoCodeToIcon, mapWmoCodeToText } from '../services/weatherService';
import { loadCurrentLocation, saveCurrentLocation, saveHistoricalLocation } from '../services/storageService';
import { searchCityByName, reverseGeocode } from '../services/geoService';
import { getTranslation } from '../services/translations';
import { HistoricalDashboard } from './HistoricalDashboard';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
  initialParams?: { date1?: Date; date2?: Date; location?: Location };
}

export const HistoricalWeatherView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings, initialParams }) => {
  const [location1, setLocation1] = useState<Location>(() => initialParams?.location || loadCurrentLocation());
  const [location2, setLocation2] = useState<Location>(() => initialParams?.location || loadCurrentLocation());
  
  // Date 1: 1 Year Ago (Default) or from params
  const [date1, setDate1] = useState<Date>(() => {
      if (initialParams?.date1) return initialParams.date1;
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return d;
  });
  
  // Date 2: Today (Default) or from params
  const [date2, setDate2] = useState<Date>(() => initialParams?.date2 || new Date());

  const [pickerOpen, setPickerOpen] = useState<null | 'date1' | 'date2'>(null);
  const [dashboardOpen, setDashboardOpen] = useState<{date: Date, location: Location} | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const [pendingLocation, setPendingLocation] = useState<Location | null>(null);
  const [syncLocation, setSyncLocation] = useState<boolean>(true);
  const [syncDates, setSyncDates] = useState<boolean>(true); // Twin date shifting
  const [isMapOpen, setIsMapOpen] = useState(false);
  
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
    windDirAvg1: 0,
    windDirAvg2: 0,
    code1: 0,
    code2: 0,
    codeText1: '',
    codeText2: '',
  });

  const [context1, setContext1] = useState<any>(null);
  const [context2, setContext2] = useState<any>(null);

  const t = (key: string) => getTranslation(key, settings.language);

  const historicalMode = settings.historicalMode || 'single';

  const updateHistoricalMode = (mode: 'single' | 'compare') => {
    if (!onUpdateSettings) return;
    if (mode === historicalMode) return;
    onUpdateSettings({ ...settings, historicalMode: mode });
  };

  const cycleFavorite = (direction: 'next' | 'prev') => {
      if (settings.favorites.length === 0) return;
      const currentIndex = settings.favorites.findIndex(f => f.name === location1.name);
      let nextIndex = 0;
      if (currentIndex === -1) {
          nextIndex = 0;
      } else {
          if (direction === 'next') {
              nextIndex = (currentIndex + 1) % settings.favorites.length;
          } else {
              nextIndex = (currentIndex - 1 + settings.favorites.length) % settings.favorites.length;
          }
      }
      const newLoc = settings.favorites[nextIndex];
      setLocation1(newLoc);
      if (syncLocation) {
          setLocation2(newLoc);
      }
  };

  useEffect(() => {
    saveCurrentLocation(location1);
    saveHistoricalLocation(location2);
    fetchData();
  }, [location1, location2, date1, date2, settings.tempUnit, settings.windUnit, settings.precipUnit, historicalMode]);

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

  const isSameDay = (d1: Date, d2: Date) => {
      return d1.getFullYear() === d2.getFullYear() &&
             d1.getMonth() === d2.getMonth() &&
             d1.getDate() === d2.getDate();
  };

  const isFuture = (d: Date) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const check = new Date(d);
    check.setHours(0,0,0,0);
    return check > today;
  };

  const isTooFarFuture = (d: Date) => {
    const max = new Date();
    max.setDate(max.getDate() + 7);
    max.setHours(0,0,0,0);
    const check = new Date(d);
    check.setHours(0,0,0,0);
    return check > max;
  };

  const handleShiftBoth = (days: number) => {
    if (!syncDates) {
        // If not synced, this function shouldn't be called for "both", but we handle logic at call site
        return;
    }

    const t1 = new Date(date1);
    t1.setDate(t1.getDate() + days);
    
    const t2 = new Date(date2);
    t2.setDate(t2.getDate() + days);

    // Check constraint: max 7 days future
    if (isTooFarFuture(t1) || isTooFarFuture(t2)) return;
    
    setDate1(t1);
    setDate2(t2);
  };

  const handleShiftSingle = (target: 'date1' | 'date2', days: number) => {
      if (syncDates) {
          handleShiftBoth(days);
          return;
      }

      if (target === 'date1') {
          const t1 = new Date(date1);
          t1.setDate(t1.getDate() + days);
          if (isTooFarFuture(t1)) return;
          setDate1(t1);
      } else {
          const t2 = new Date(date2);
          t2.setDate(t2.getDate() + days);
          if (isTooFarFuture(t2)) return;
          setDate2(t2);
      }
  };

  const canShiftNext = (target?: 'date1' | 'date2') => {
     if (syncDates) {
        const t1 = new Date(date1); t1.setDate(t1.getDate() + 1);
        const t2 = new Date(date2); t2.setDate(t2.getDate() + 1);
        return !isTooFarFuture(t1) && !isTooFarFuture(t2);
     } else {
         if (target === 'date1') {
             const t1 = new Date(date1); t1.setDate(t1.getDate() + 1);
             return !isTooFarFuture(t1);
         } else {
             const t2 = new Date(date2); t2.setDate(t2.getDate() + 1);
             return !isTooFarFuture(t2);
         }
     }
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

  const formatUnderSlider = (date: Date) => {
    const locale = settings.language === 'nl' ? 'nl-NL' : 'en-GB';
    const y = date.getFullYear();
    const monShort = date.toLocaleDateString(locale, { month: 'short' }).replace(/[^a-zA-Z]/g, '').slice(0, 3);
    const d = date.getDate();
    const wk = date.toLocaleDateString(locale, { weekday: 'long' });
    return `${y} - ${monShort} - ${d} • ${wk}`;
  };

  const getDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const date1Color = 'rgba(128,128,128,1)';
  const date2Color = '#13b6ec';
  
  const getWindCardinal = (deg: number) => {
    const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
    return t(`dir.${dirs[Math.round(deg / 45) % 8]}`);
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
        
        const p1 = fetchHistorical(location1.lat, location1.lon, d1, d1);

        const c1Start = new Date(date1);
        c1Start.setDate(c1Start.getDate() - 6);
        const c1End = new Date(date1);
        c1End.setDate(c1End.getDate() + 1);
        const cp1 = fetchHistorical(location1.lat, location1.lon, getDateString(c1Start), getDateString(c1End));

        if (historicalMode === 'single') {
          const [data1, ctx1] = await Promise.all([p1, cp1]);
          setContext1(ctx1);
          setContext2(null);

          const currentHour = new Date().getHours();
          const today = new Date();
          const isToday1 = isSameDay(date1, today);
          const isFuture1 = isFuture(date1);

          const hours = Array.from({ length: 24 }, (_, i) => i);

          const getLineData = (h: number, val: number, isFut: boolean, isTod: boolean) => {
            let solid = null;
            let dash = null;
            if (isFut) {
              dash = val;
            } else if (isTod) {
              if (h <= currentHour) solid = val;
              if (h >= currentHour) dash = val;
            } else {
              solid = val;
            }
            return { solid, dash };
          };

          let processed = hours.map((h) => {
            const temp1Val = convertTemp((data1.hourly.temperature_2m[h] || 0), settings.tempUnit);
            const l1 = getLineData(h, temp1Val, isFuture1, isToday1);
            return {
              hour: `${h}:00`,
              temp1: temp1Val,
              temp1_solid: l1.solid,
              temp1_dash: l1.dash,
              wind1: convertWind((data1.hourly.wind_speed_10m?.[h] || 0), settings.windUnit),
              rain1: convertPrecip((data1.hourly.precipitation?.[h] || 0), settings.precipUnit),
              windDir1: data1.hourly.wind_direction_10m?.[h] || 0,
            };
          });

          if (processed.length > 0) {
            const last = processed[processed.length - 1];
            processed = [...processed, { ...last, hour: '24:00' }];
          }

          setData(processed);

          const avg1 = processed.slice(0, 24).reduce((acc, curr) => acc + curr.temp1, 0) / 24;

          const tempMax1 = data1.daily?.temperature_2m_max?.[0] ?? Math.max(...processed.slice(0, 24).map((p) => p.temp1));
          const tMax1 = settings.tempUnit === 'fahrenheit' ? parseFloat(((tempMax1 * 9) / 5 + 32).toFixed(1)) : parseFloat(tempMax1.toFixed(1));

          setStats({ diff: 0, currentAvg: tMax1, pastAvg: 0 });

          const rainRaw1 = data1.daily?.precipitation_sum?.[0] ?? data1.hourly.precipitation.reduce((a: any, b: any) => a + (b || 0), 0);
          const windRaw1 = data1.daily?.wind_speed_10m_max?.[0] ?? Math.max(...(data1.hourly.wind_speed_10m || []));

          const vecAvg = (arr: number[]) => {
            let sinSum = 0;
            let cosSum = 0;
            arr.forEach((d) => {
              sinSum += Math.sin((d * Math.PI) / 180);
              cosSum += Math.cos((d * Math.PI) / 180);
            });
            return (Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360;
          };

          const windDirAvg1 = Math.round(vecAvg(processed.slice(0, 24).map((p) => p.windDir1 || 0)) % 360);

          setDetail({
            tempAvg1: parseFloat(avg1.toFixed(1)),
            tempAvg2: 0,
            tempMin1: convertTemp((data1.daily?.temperature_2m_min?.[0] || Math.min(...processed.slice(0, 24).map((p) => p.temp1))), settings.tempUnit),
            tempMin2: 0,
            tempMax1: convertTemp((data1.daily?.temperature_2m_max?.[0] || Math.max(...processed.slice(0, 24).map((p) => p.temp1))), settings.tempUnit),
            tempMax2: 0,
            rainSum1: convertPrecip(rainRaw1, settings.precipUnit),
            rainSum2: 0,
            windMax1: convertWind(windRaw1, settings.windUnit),
            windMax2: 0,
            windDirAvg1,
            windDirAvg2: 0,
            code1: data1.daily?.weather_code?.[0] || 0,
            code2: 0,
            codeText1: mapWmoCodeToText(data1.daily?.weather_code?.[0] || 0, settings.language),
            codeText2: '',
          });

          const hasData1 = !!(data1?.hourly?.temperature_2m?.length);
          if (!hasData1) {
            const avail1 = await findFirstAvailableYear(location1, date1.getMonth(), date1.getDate());
            setNoDataInfo1(avail1);
          } else {
            setNoDataInfo1(null);
          }
          setNoDataInfo2(null);
          return;
        }

        const p2 = fetchHistorical(location2.lat, location2.lon, d2, d2);

        const c2Start = new Date(date2);
        c2Start.setDate(c2Start.getDate() - 6);
        const c2End = new Date(date2);
        c2End.setDate(c2End.getDate() + 1);
        const cp2 = fetchHistorical(location2.lat, location2.lon, getDateString(c2Start), getDateString(c2End));

        const [data1, data2, ctx1, ctx2] = await Promise.all([p1, p2, cp1, cp2]);

        setContext1(ctx1);
        setContext2(ctx2);

        const currentHour = new Date().getHours();
        const today = new Date();
        const isToday1 = isSameDay(date1, today);
        const isFuture1 = isFuture(date1);
        const isToday2 = isSameDay(date2, today);
        const isFuture2 = isFuture(date2);

        const hours = Array.from({length: 24}, (_, i) => i);
        
        const getLineData = (h: number, val: number, isFut: boolean, isTod: boolean) => {
             let solid = null;
             let dash = null;
             if (isFut) {
                 dash = val;
             } else if (isTod) {
                 if (h <= currentHour) solid = val;
                 if (h >= currentHour) dash = val;
             } else {
                 solid = val;
             }
             return { solid, dash };
        };

        let processed = hours.map(h => {
            const temp1Val = convertTemp((data1.hourly.temperature_2m[h] || 0), settings.tempUnit);
            const temp2Val = convertTemp((data2.hourly.temperature_2m[h] || 0), settings.tempUnit);
            
            const l1 = getLineData(h, temp1Val, isFuture1, isToday1);
            const l2 = getLineData(h, temp2Val, isFuture2, isToday2);

            return {
                hour: `${h}:00`,
                temp1: temp1Val,
                temp2: temp2Val,
                temp1_solid: l1.solid,
                temp1_dash: l1.dash,
                temp2_solid: l2.solid,
                temp2_dash: l2.dash,
                wind1: convertWind((data1.hourly.wind_speed_10m?.[h] || 0), settings.windUnit),
                wind2: convertWind((data2.hourly.wind_speed_10m?.[h] || 0), settings.windUnit),
                rain1: convertPrecip((data1.hourly.precipitation?.[h] || 0), settings.precipUnit),
                rain2: convertPrecip((data2.hourly.precipitation?.[h] || 0), settings.precipUnit),
                windDir1: data1.hourly.wind_direction_10m?.[h] || 0,
                windDir2: data2.hourly.wind_direction_10m?.[h] || 0,
            };
        });
        
        if (processed.length > 0) {
          const last = processed[processed.length - 1];
          processed = [...processed, { ...last, hour: '24:00' }];
        }

        setData(processed);
        
        // Stats calculations
        const avg1 = processed.reduce((acc, curr) => acc + curr.temp1, 0) / 24;
        const avg2 = processed.reduce((acc, curr) => acc + curr.temp2, 0) / 24;
        
        // Date 1 (Today) vs Date 2 (Last Year)
        // User wants compare Date 1 vs Date 2? 
        // Typically we compare Current (Date 1) vs Past (Date 2).
        // Let's assume Date 1 is the reference for "Today" and Date 2 is "Reference/Past".
        
        const formatTempDecimal = (t: number) => {
            if (settings.tempUnit === 'fahrenheit') {
                return parseFloat(((t * 9/5) + 32).toFixed(1));
            }
            return parseFloat(t.toFixed(1));
        };

        const tempMax1 = data1.daily?.temperature_2m_max?.[0] ?? Math.max(...processed.map(p => p.temp1));
        const tempMax2 = data2.daily?.temperature_2m_max?.[0] ?? Math.max(...processed.map(p => p.temp2));
        
        const tMax1 = formatTempDecimal(tempMax1);
        const tMax2 = formatTempDecimal(tempMax2);

        setStats({
            currentAvg: tMax1, // Date 1 (Today)
            pastAvg: tMax2,    // Date 2 (Past)
            diff: parseFloat((tMax1 - tMax2).toFixed(1))
        });

        // Rain (mm raw) -> convert
        const rainRaw1 = data1.daily?.precipitation_sum?.[0] ?? data1.hourly.precipitation.reduce((a:any, b:any) => a + (b||0), 0);
        const rainRaw2 = data2.daily?.precipitation_sum?.[0] ?? data2.hourly.precipitation.reduce((a:any, b:any) => a + (b||0), 0);
        
        // Wind Max (km/h raw) -> convert
        const windRaw1 = data1.daily?.wind_speed_10m_max?.[0] ?? Math.max(...(data1.hourly.wind_speed_10m || []));
        const windRaw2 = data2.daily?.wind_speed_10m_max?.[0] ?? Math.max(...(data2.hourly.wind_speed_10m || []));

        const vecAvg = (arr: number[]) => {
          let sinSum = 0; let cosSum = 0;
          arr.forEach(d => { sinSum += Math.sin(d * Math.PI/180); cosSum += Math.cos(d * Math.PI/180); });
          return (Math.atan2(sinSum, cosSum) * 180 / Math.PI + 360) % 360;
        };

        const windDirAvg1 = Math.round(vecAvg(processed.map(p => p.windDir1||0)));
        const windDirAvg2 = Math.round(vecAvg(processed.map(p => p.windDir2||0)));
        
        setDetail({
          tempAvg1: parseFloat(avg1.toFixed(1)),
          tempAvg2: parseFloat(avg2.toFixed(1)),
          tempMin1: convertTemp((data1.daily?.temperature_2m_min?.[0] || Math.min(...processed.map(p=>p.temp1))), settings.tempUnit),
          tempMin2: convertTemp((data2.daily?.temperature_2m_min?.[0] || Math.min(...processed.map(p=>p.temp2))), settings.tempUnit),
          tempMax1: convertTemp((data1.daily?.temperature_2m_max?.[0] || Math.max(...processed.map(p=>p.temp1))), settings.tempUnit),
          tempMax2: convertTemp((data2.daily?.temperature_2m_max?.[0] || Math.max(...processed.map(p=>p.temp2))), settings.tempUnit),
          rainSum1: convertPrecip(rainRaw1, settings.precipUnit),
          rainSum2: convertPrecip(rainRaw2, settings.precipUnit),
          windMax1: convertWind(windRaw1, settings.windUnit),
          windMax2: convertWind(windRaw2, settings.windUnit),
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

  const getDaysAgoText = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - d.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return settings.language === 'nl' ? 'Vandaag' : 'Today';
    if (diffDays === 1) return settings.language === 'nl' ? 'Gisteren' : 'Yesterday';
    if (diffDays < 0) {
         const absDays = Math.abs(diffDays);
         if (absDays === 1) return settings.language === 'nl' ? 'Morgen' : 'Tomorrow';
         return settings.language === 'nl' ? `Over ${absDays} dagen` : `In ${absDays} days`;
    }
    return settings.language === 'nl' ? `${diffDays} dagen geleden` : `${diffDays} days ago`;
   };

   const allTemps = data.flatMap(d => [d.temp1, d.temp2].filter(v => v !== undefined && v !== null));
   let yTicks: number[] | undefined = undefined;
   let yDomain: [number, number] | ['auto', 'auto'] = ['auto', 'auto'];
    
   if (allTemps.length > 0) {
        const minT = Math.floor(Math.min(...allTemps));
        const maxT = Math.ceil(Math.max(...allTemps));
        if (maxT - minT <= 15) { 
             const start = minT - 1;
             const end = maxT + 1;
             yTicks = Array.from({length: end - start + 1}, (_, i) => start + i);
             yDomain = [start, end];
        }
   }
 
   const getInsights = () => {
        const insights: { icon: string; title: string; desc: string; color: string }[] = [];
        const isNL = settings.language === 'nl';
        
        const formatSystemDate = (d: Date) => {
            return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', day: 'numeric', month: 'long' });
         };
        
        const d1Name = formatSystemDate(date1);
        const d2Name = formatSystemDate(date2);

        // 1. Temperature Feeling
        const diffTemp = detail.tempMax1 - detail.tempMax2;
        if (Math.abs(diffTemp) >= 2) {
            insights.push({
                icon: 'device_thermostat',
                title: isNL ? 'Temperatuurverschil' : 'Temp Difference',
                desc: isNL 
                    ? `${Math.abs(diffTemp).toFixed(1)}°C ${diffTemp > 0 ? 'warmer' : 'kouder'} op ${d1Name} vergeleken met ${d2Name}.`
                    : `${Math.abs(diffTemp).toFixed(1)}°C ${diffTemp > 0 ? 'warmer' : 'colder'} on ${d1Name} compared to ${d2Name}.`,
                color: diffTemp > 0 ? 'text-orange-500' : 'text-blue-500'
            });
        } else {
             insights.push({
                icon: 'device_thermostat',
                title: isNL ? 'Temperatuur' : 'Temperature',
                desc: isNL ? 'De temperatuur is nagenoeg gelijk op beide dagen.' : 'Temperatures are very similar on both days.',
                color: 'text-slate-500'
            });
        }

        // 2. Rain / Umbrella
        const rainDiff = detail.rainSum1 - detail.rainSum2;
        if (detail.rainSum1 > 1 || detail.rainSum2 > 1) {
             if (detail.rainSum1 > detail.rainSum2 + 2) {
                 insights.push({
                     icon: 'umbrella',
                     title: isNL ? 'Neerslag' : 'Precipitation',
                     desc: isNL ? `Veel natter op ${d1Name} (${detail.rainSum1}mm) dan op ${d2Name}.` : `Much wetter on ${d1Name}.`,
                     color: 'text-blue-600'
                 });
             } else if (detail.rainSum2 > detail.rainSum1 + 2) {
                 insights.push({
                     icon: 'umbrella',
                     title: isNL ? 'Neerslag' : 'Precipitation',
                     desc: isNL ? `Droger op ${d1Name}! ${d2Name} had ${detail.rainSum2}mm regen.` : `Drier on ${d1Name}.`,
                     color: 'text-green-600'
                 });
             } else {
                 insights.push({
                     icon: 'rainy',
                     title: isNL ? 'Neerslag' : 'Precipitation',
                     desc: isNL ? 'Beide dagen regenachtig.' : 'Both days rainy.',
                     color: 'text-blue-400'
                 });
             }
        } else {
            insights.push({
                icon: 'check_circle',
                title: isNL ? 'Droog' : 'Dry',
                desc: isNL ? 'Op beide dagen geen noemenswaardige neerslag.' : 'No significant rain on either day.',
                color: 'text-green-500'
            });
        }

        // 3. Sunshine / Solar - REMOVED

        // 4. Wind
        const windDiff = detail.windMax1 - detail.windMax2;
        if (Math.abs(windDiff) > 10) {
             insights.push({
                icon: 'air',
                title: isNL ? 'Wind' : 'Wind',
                desc: isNL 
                    ? `Het waaide aanzienlijk ${windDiff > 0 ? 'harder' : 'minder hard'} op ${d1Name}.`
                    : `Wind was significantly ${windDiff > 0 ? 'stronger' : 'weaker'} on ${d1Name}.`,
                color: 'text-slate-600'
            });
        } else {
            insights.push({
                icon: 'air',
                title: isNL ? 'Wind' : 'Wind',
                desc: isNL ? 'Vergelijkbare windkracht op beide dagen.' : 'Similar wind speeds.',
                color: 'text-slate-400'
            });
        }

        // 5. Clothing Advice
        let clothing1 = '';
        if (detail.tempMax1 < 10) clothing1 = isNL ? 'Winterjas' : 'Winter Coat';
        else if (detail.tempMax1 < 16) clothing1 = isNL ? 'Jas/Trui' : 'Jacket/Sweater';
        else if (detail.tempMax1 < 22) clothing1 = isNL ? 'T-shirt & Vest' : 'Light layers';
        else clothing1 = isNL ? 'Korte broek' : 'Shorts';

        let clothing2 = '';
        if (detail.tempMax2 < 10) clothing2 = isNL ? 'Winterjas' : 'Winter Coat';
        else if (detail.tempMax2 < 16) clothing2 = isNL ? 'Jas/Trui' : 'Jacket/Sweater';
        else if (detail.tempMax2 < 22) clothing2 = isNL ? 'T-shirt & Vest' : 'Light layers';
        else clothing2 = isNL ? 'Korte broek' : 'Shorts';

        insights.push({
            icon: 'checkroom',
            title: isNL ? 'Kledingadvies' : 'Clothing',
            desc: isNL ? `${d1Name}: ${clothing1}. ${d2Name}: ${clothing2}.` : `${d1Name}: ${clothing1}. ${d2Name}: ${clothing2}.`,
            color: 'text-purple-500'
        });

        // 6. Cycling Score
        const calcCycleScore = (w: number, r: number, t: number) => {
            let s = 10;
            s -= (w / 10);
            s -= (r * 2);
            if (t < 5) s -= 2;
            if (t > 30) s -= 1;
            return Math.max(1, Math.min(10, s));
        };
        const score1 = calcCycleScore(detail.windMax1, detail.rainSum1, detail.tempMax1);
        const score2 = calcCycleScore(detail.windMax2, detail.rainSum2, detail.tempMax2);
        
        insights.push({
            icon: 'directions_bike',
            title: isNL ? 'Fietsweer' : 'Cycling',
            desc: isNL 
                ? `Fietsrapport: ${score1.toFixed(0)}/10 voor ${d1Name} vs ${score2.toFixed(0)}/10 voor ${d2Name}.`
                : `Cycling Score: ${score1.toFixed(0)}/10 vs ${score2.toFixed(0)}/10.`,
            color: score1 >= 7 ? 'text-green-600' : 'text-orange-600'
        });

        // 7. Solar Panels - REMOVED

        // 8. Temp Variation
        const range1 = detail.tempMax1 - detail.tempMin1;
        const range2 = detail.tempMax2 - detail.tempMin2;
        if (Math.abs(range1 - range2) > 5) {
            insights.push({
                icon: 'timeline',
                title: isNL ? 'Temp. Verloop' : 'Temp Variation',
                desc: isNL 
                    ? `${range1 > range2 ? d1Name : d2Name} had grotere temperatuurschommelingen (${Math.max(range1, range2).toFixed(1)}° verschil).`
                    : `Larger temp swings on ${range1 > range2 ? d1Name : d2Name}.`,
                color: 'text-indigo-500'
            });
        } else {
             insights.push({
                icon: 'timeline',
                title: isNL ? 'Temp. Verloop' : 'Temp Variation',
                desc: isNL ? 'Beide dagen hadden een stabiel temperatuurverloop.' : 'Both days had stable temperature ranges.',
                color: 'text-indigo-400'
            });
        }

        // 9. Frost or Tropical
        let extremeMsg = '';
        if (detail.tempMin1 < 0) extremeMsg = isNL ? `Vorst op ${d1Name}!` : `Frost on ${d1Name}!`;
        if (detail.tempMax1 > 30) extremeMsg = isNL ? `Tropisch warm op ${d1Name}!` : `Tropical heat on ${d1Name}!`;
        
        if (extremeMsg) {
             insights.push({
                icon: 'ac_unit',
                title: isNL ? 'Extremen' : 'Extremes',
                desc: extremeMsg,
                color: 'text-red-500'
            });
        } else {
             insights.push({
                icon: 'thermostat',
                title: isNL ? 'Geen Extremen' : 'No Extremes',
                desc: isNL ? 'Geen vorst of tropische hitte op deze dagen.' : 'No frost or tropical heat.',
                color: 'text-slate-500'
            });
        }

        // 10. The Verdict (Winner)
        const scoreDay = (t: number, r: number, w: number) => {
            return (t/3) - (r*1.5) - (w/10);
        };
        const s1 = scoreDay(detail.tempMax1, detail.rainSum1, detail.windMax1);
        const s2 = scoreDay(detail.tempMax2, detail.rainSum2, detail.windMax2);
        
        insights.push({
            icon: 'emoji_events',
            title: isNL ? 'De Winnaar' : 'The Winner',
            desc: isNL 
                ? `Alles meegerekend was ${s1 > s2 ? d1Name : d2Name} de aangenamere dag.`
                : `Overall, ${s1 > s2 ? d1Name : d2Name} was the more pleasant day.`,
            color: 'text-amber-500'
        });

        // --- NEW SEQUENTIAL INSIGHTS (11-20) ---
        if (context1?.daily && context2?.daily) {
             // 11. Rain Streak (Regenreeks)
             // Check last 3 days before date1
             // context1.daily.time has list of dates. Find index of date1.
             // Usually date1 is index 6 (since we fetch date-6 to date+1, 8 days, date1 is 2nd to last)
             // Let's rely on array indices assuming api returns sorted.
             
             const getPrecip = (ctx: any, idx: number) => ctx?.daily?.precipitation_sum?.[idx] || 0;
             const getTMax = (ctx: any, idx: number) => convertTemp(ctx?.daily?.temperature_2m_max?.[idx] || 0, settings.tempUnit);

             // Index 6 is the target date (date1/date2). 0-5 are previous days. 7 is next day.
             // Verify dates? Assuming API is consistent.
             const targetIdx = 6; 
             
             // Insight 11: Rain Streak
             const rainStreak1 = getPrecip(context1, targetIdx-1) > 0.5 && getPrecip(context1, targetIdx-2) > 0.5 && getPrecip(context1, targetIdx-3) > 0.5;
             const rainStreak2 = getPrecip(context2, targetIdx-1) > 0.5 && getPrecip(context2, targetIdx-2) > 0.5 && getPrecip(context2, targetIdx-3) > 0.5;
             
             if (rainStreak1) {
                  insights.push({
                      icon: 'water_drop',
                      title: isNL ? 'Regenreeks' : 'Rain Streak',
                      desc: isNL ? `${d1Name} viel midden in een regenachtige periode.` : `${d1Name} was part of a rainy streak.`,
                      color: 'text-blue-500'
                  });
             } else if (rainStreak2) {
                  insights.push({
                      icon: 'water_drop',
                      title: isNL ? 'Regenreeks' : 'Rain Streak',
                      desc: isNL ? `${d2Name} viel midden in een regenachtige periode.` : `${d2Name} was part of a rainy streak.`,
                      color: 'text-blue-500'
                  });
             } else {
                 insights.push({
                      icon: 'water_drop',
                      title: isNL ? 'Regen' : 'Rain',
                      desc: isNL ? `Geen langdurige regenreeksen rond ${d1Name} of ${d2Name}.` : `No long rain streaks around ${d1Name} or ${d2Name}.`,
                      color: 'text-blue-300'
                  });
             }

             // 12. Heat Trend (Warmte Trend)
             // Check if temp rising last 3 days
             const rising1 = getTMax(context1, targetIdx) > getTMax(context1, targetIdx-1) && getTMax(context1, targetIdx-1) > getTMax(context1, targetIdx-2);
             const rising2 = getTMax(context2, targetIdx) > getTMax(context2, targetIdx-1) && getTMax(context2, targetIdx-1) > getTMax(context2, targetIdx-2);
             
             if (rising1) {
                 insights.push({
                      icon: 'trending_up',
                      title: isNL ? 'Opwarming' : 'Warming Up',
                      desc: isNL ? `De temperatuur zat in een stijgende lijn richting ${d1Name}.` : `Temperatures were rising leading up to ${d1Name}.`,
                      color: 'text-red-500'
                  });
             } else if (rising2) {
                 insights.push({
                      icon: 'trending_up',
                      title: isNL ? 'Opwarming' : 'Warming Up',
                      desc: isNL ? `De temperatuur zat in een stijgende lijn richting ${d2Name}.` : `Temperatures were rising leading up to ${d2Name}.`,
                      color: 'text-red-500'
                  });
             } else {
                 insights.push({
                      icon: 'trending_flat',
                      title: isNL ? 'Temp Trend' : 'Temp Trend',
                      desc: isNL ? `Wisselvallig of stabiel verloop voorafgaand aan ${d1Name} en ${d2Name}.` : `Variable or stable trends leading up to ${d1Name} and ${d2Name}.`,
                      color: 'text-slate-400'
                  });
             }

             // 13. Weekly Peak (Week Piek)
             // Check if target date is max of the window (0-6)
             const max1 = Math.max(...[0,1,2,3,4,5,6].map(i => getTMax(context1, i)));
             const isPeak1 = getTMax(context1, targetIdx) >= max1;
             
             if (isPeak1) {
                 insights.push({
                      icon: 'flag',
                      title: isNL ? 'Week Piek' : 'Weekly Peak',
                      desc: isNL ? `${d1Name} was de warmste dag van de week!` : `${d1Name} was the warmest day of the week!`,
                      color: 'text-orange-600'
                  });
             } else {
                 insights.push({
                      icon: 'calendar_today',
                      title: isNL ? 'Week Context' : 'Week Context',
                      desc: isNL ? `${d1Name} was niet de warmste dag van die week.` : `${d1Name} was not the warmest day of that week.`,
                      color: 'text-slate-500'
                  });
             }

             // 14. Weekend
             const isWeekend1 = date1.getDay() === 0 || date1.getDay() === 6;
             const isWeekend2 = date2.getDay() === 0 || date2.getDay() === 6;
             
             insights.push({
                  icon: 'event',
                  title: isNL ? 'Weekend' : 'Weekend',
                  desc: isNL 
                    ? `${d1Name} was een ${isWeekend1 ? 'weekenddag' : 'doordeweekse dag'}.` 
                    : `${d1Name} was a ${isWeekend1 ? 'weekend day' : 'weekday'}.`,
                  color: isWeekend1 ? 'text-purple-500' : 'text-slate-500'
             });

             // 15. Cold Snap (Koudegolf)
             // 3 days < 0 min temp
             const getTMin = (ctx: any, idx: number) => convertTemp(ctx?.daily?.temperature_2m_min?.[idx] || 0, settings.tempUnit);
             const cold1 = getTMin(context1, targetIdx) < 0 && getTMin(context1, targetIdx-1) < 0 && getTMin(context1, targetIdx-2) < 0;
             
             if (cold1) {
                  insights.push({
                      icon: 'snowflake',
                      title: isNL ? 'Koudegolf' : 'Cold Snap',
                      desc: isNL ? `${d1Name} was onderdeel van een koude periode.` : `${d1Name} was part of a cold snap.`,
                      color: 'text-cyan-500'
                  });
             } else {
                 insights.push({
                      icon: 'wb_sunny', // reusing sunny as opposite of cold snap generic
                      title: isNL ? 'Geen Koudegolf' : 'No Cold Snap',
                      desc: isNL ? 'Geen aanhoudende vorst rondom deze data.' : 'No persistent frost around these dates.',
                      color: 'text-slate-400'
                  });
             }

             // 16. Sun Streak - REMOVED

             // 17. Stability
             // check variance of max temp
             const temps1 = [0,1,2,3,4,5,6].map(i => getTMax(context1, i));
             const variance1 = Math.max(...temps1) - Math.min(...temps1);
             if (variance1 < 3) {
                  insights.push({
                      icon: 'horizontal_rule',
                      title: isNL ? 'Stabiel Weer' : 'Stable Weather',
                      desc: isNL ? `Zeer stabiele temperaturen in de week van ${d1Name}.` : `Very stable temperatures in the week of ${d1Name}.`,
                      color: 'text-green-500'
                  });
             } else {
                 insights.push({
                      icon: 'waves',
                      title: isNL ? 'Wisselvallig' : 'Changeable',
                      desc: isNL ? `Temperaturen schommelden flink rond ${d1Name}.` : `Temperatures fluctuated significantly around ${d1Name}.`,
                      color: 'text-slate-500'
                  });
             }

             // 18. Relative Comfort
             // Compare target to average of previous 5 days
             const avgPrev1 = [1,2,3,4,5].reduce((a, i) => a + getTMax(context1, targetIdx-i), 0) / 5;
             const diffAvg1 = getTMax(context1, targetIdx) - avgPrev1;
             
             if (diffAvg1 > 3) {
                  insights.push({
                      icon: 'sentiment_satisfied',
                      title: isNL ? 'Uitschieter' : 'Outlier',
                      desc: isNL ? `${d1Name} was opvallend warmer dan de dagen ervoor.` : `${d1Name} was notably warmer than preceding days.`,
                      color: 'text-orange-500'
                  });
             } else if (diffAvg1 < -3) {
                 insights.push({
                      icon: 'sentiment_dissatisfied',
                      title: isNL ? 'Dipje' : 'Dip',
                      desc: isNL ? `${d1Name} was een stuk koeler dan de dagen ervoor.` : `${d1Name} was much cooler than preceding days.`,
                      color: 'text-blue-500'
                  });
             } else {
                 insights.push({
                      icon: 'sentiment_neutral',
                      title: isNL ? 'Normaal' : 'Normal',
                      desc: isNL ? `${d1Name} week qua temperatuur niet veel af.` : `${d1Name} was typical for the week.`,
                      color: 'text-slate-400'
                  });
             }

             // 19. Outdoor Activity
             // Good if rain < 1, wind < 20, temp > 15 && temp < 25
             const isGood1 = getPrecip(context1, targetIdx) < 1 && getTMax(context1, targetIdx) > 15 && getTMax(context1, targetIdx) < 25;
             insights.push({
                 icon: isGood1 ? 'park' : 'home',
                 title: isNL ? 'Buitenactiviteit' : 'Outdoor Activity',
                 desc: isNL 
                    ? (isGood1 ? `Perfect weer om naar buiten te gaan op ${d1Name}.` : `Misschien beter binnen blijven op ${d1Name}.`)
                    : (isGood1 ? `Great weather for outdoors on ${d1Name}.` : `Maybe stay inside on ${d1Name}.`),
                 color: isGood1 ? 'text-green-600' : 'text-slate-500'
             });

             // 20. Pressure / Stability Guess
             // Since we don't have pressure, use "Change"
             // If temp drops > 5 degrees in 1 day (tomorrow vs today) -> Cold Front
             const drop1 = getTMax(context1, targetIdx) - getTMax(context1, targetIdx+1); // Today - Tomorrow
             if (drop1 > 5) {
                 insights.push({
                     icon: 'arrow_downward',
                     title: isNL ? 'Koufront' : 'Cold Front',
                     desc: isNL ? `Na ${d1Name} kelderde de temperatuur flink!` : `Temps plummeted after ${d1Name}!`,
                     color: 'text-blue-600'
                 });
             } else {
                 insights.push({
                     icon: 'arrow_forward',
                     title: isNL ? 'Vooruitzicht' : 'Outlook',
                     desc: isNL ? `Geen grote temperatuurval direct na ${d1Name}.` : `No major temp drop immediately after ${d1Name}.`,
                     color: 'text-slate-400'
                 });
             }

             // 21. Weekly Average Temp
             // Compare avg max temp of the whole 7-day context
             const avgMax1 = [0,1,2,3,4,5,6].reduce((a, i) => a + getTMax(context1, i), 0) / 7;
             const avgMax2 = [0,1,2,3,4,5,6].reduce((a, i) => a + getTMax(context2, i), 0) / 7;
             const diffAvgWeek = avgMax1 - avgMax2;
             
             if (Math.abs(diffAvgWeek) > 2) {
                 insights.push({
                      icon: 'date_range',
                      title: isNL ? 'Weekgemiddelde' : 'Weekly Average',
                      desc: isNL 
                        ? `De week rond ${d1Name} was gemiddeld ${Math.abs(diffAvgWeek).toFixed(1)}°C ${diffAvgWeek > 0 ? 'warmer' : 'kouder'} dan de week rond ${d2Name}.`
                        : `The week around ${d1Name} was on average ${Math.abs(diffAvgWeek).toFixed(1)}°C ${diffAvgWeek > 0 ? 'warmer' : 'colder'} than the week around ${d2Name}.`,
                      color: diffAvgWeek > 0 ? 'text-orange-500' : 'text-blue-500'
                  });
             }

             // 22. Weekly Rain Total
             const sumRain1 = [0,1,2,3,4,5,6].reduce((a, i) => a + getPrecip(context1, i), 0);
             const sumRain2 = [0,1,2,3,4,5,6].reduce((a, i) => a + getPrecip(context2, i), 0);
             
             if (sumRain1 > 10 && sumRain1 > sumRain2 + 5) {
                 insights.push({
                      icon: 'umbrella',
                      title: isNL ? 'Natte Week' : 'Wet Week',
                      desc: isNL ? `Een regenachtige week rond ${d1Name} (${sumRain1.toFixed(1)}mm totaal).` : `A rainy week around ${d1Name} (${sumRain1.toFixed(1)}mm total).`,
                      color: 'text-blue-600'
                  });
             } else if (sumRain1 < 2 && sumRain2 > 10) {
                 insights.push({
                      icon: 'check_circle',
                      title: isNL ? 'Droge Week' : 'Dry Week',
                      desc: isNL ? `Opvallend droge week rond ${d1Name} vergeleken met ${d2Name}.` : `Notably dry week around ${d1Name} compared to ${d2Name}.`,
                      color: 'text-green-600'
                  });
             }

             // 23. Dry Spell (Droogte) - 5+ days < 0.1
             const isDrySpell1 = [2,3,4,5,6].every(i => getPrecip(context1, i) < 0.1);
             if (isDrySpell1) {
                 insights.push({
                      icon: 'grass',
                      title: isNL ? 'Droge Periode' : 'Dry Spell',
                      desc: isNL ? `Al minstens 5 dagen droog rond ${d1Name}.` : `At least 5 dry days leading up to ${d1Name}.`,
                      color: 'text-amber-600'
                  });
             }

             // 24. Windy Spell - 3+ days wind > 25
             const getWindMax = (ctx: any, idx: number) => convertWind(ctx?.daily?.wind_speed_10m_max?.[idx] || 0, settings.windUnit);
             const windy1 = getWindMax(context1, targetIdx) > 25 && getWindMax(context1, targetIdx-1) > 25 && getWindMax(context1, targetIdx-2) > 25;
             if (windy1) {
                 insights.push({
                      icon: 'air',
                      title: isNL ? 'Onstuimig' : 'Windy Spell',
                      desc: isNL ? `Een winderige periode rond ${d1Name}.` : `A windy period around ${d1Name}.`,
                      color: 'text-slate-600'
                  });
             }

             // 25. Heating Advice
             if (avgMax1 < 12) {
                 insights.push({
                      icon: 'hvac',
                      title: isNL ? 'Verwarming' : 'Heating',
                      desc: isNL ? `De verwarming moest waarschijnlijk aan in de week van ${d1Name}.` : `Heating was likely needed in the week of ${d1Name}.`,
                      color: 'text-orange-700'
                  });
             }

             // 26. Garden / Watering
             if (isDrySpell1 && avgMax1 > 20) {
                  insights.push({
                      icon: 'water_drop',
                      title: isNL ? 'Tuin Sproeien' : 'Water Garden',
                      desc: isNL ? `Planten hadden water nodig rond ${d1Name}.` : `Plants likely needed water around ${d1Name}.`,
                      color: 'text-blue-500'
                  });
             }

             // 27. Night Cold Trend (Min Temp Decreasing)
             const minFalling1 = getTMin(context1, targetIdx) < getTMin(context1, targetIdx-1) && getTMin(context1, targetIdx-1) < getTMin(context1, targetIdx-2);
             if (minFalling1) {
                 insights.push({
                      icon: 'bedtime',
                      title: isNL ? 'Koudere Nachten' : 'Colder Nights',
                      desc: isNL ? `De nachten werden steeds kouder richting ${d1Name}.` : `Nights were getting colder leading to ${d1Name}.`,
                      color: 'text-indigo-500'
                  });
             }

             // 28. Sun Consistency - REMOVED

             // 29. Weather Monotony (Same Weather Code)
             const codes1 = [3,4,5,6].map(i => context1?.daily?.weather_code?.[i]);
             const uniqueCodes = new Set(codes1);
             if (uniqueCodes.size === 1 && codes1[0] !== undefined) {
                  insights.push({
                      icon: 'repeat',
                      title: isNL ? 'Stabiel Weerbeeld' : 'Consistent Weather',
                      desc: isNL ? `Dagenlang hetzelfde weertype rond ${d1Name}.` : `Days of identical weather type around ${d1Name}.`,
                      color: 'text-slate-500'
                  });
             }

             // 30. Volatile Temp (High Day-to-Day Fluctuation)
             // Sum of absolute differences between consecutive days
             let volatility1 = 0;
             for(let i=1; i<=6; i++) {
                 volatility1 += Math.abs(getTMax(context1, i) - getTMax(context1, i-1));
             }
             if (volatility1 > 15) { // Avg > 2.5 deg change per day
                  insights.push({
                      icon: 'show_chart',
                      title: isNL ? 'Grillig Verloop' : 'Volatile Temps',
                      desc: isNL ? `Sterk wisselende temperaturen in de week van ${d1Name}.` : `Highly fluctuating temperatures in the week of ${d1Name}.`,
                      color: 'text-red-400'
                  });
             }
        }

        return insights;
   };

   const insightsList = getInsights();

  return (
    <div className="flex flex-col min-h-screen pb-24 bg-slate-50 dark:bg-background-dark overflow-y-auto text-slate-800 dark:text-white transition-colors">
      <div className="relative flex items-center justify-center p-4 pt-8 mb-2">
          {/* Title & Navigation */}
          <div className="flex items-center gap-4">
               <button onClick={() => cycleFavorite('prev')} className="p-2 rounded-full bg-white/30 dark:bg-black/20 backdrop-blur-md text-slate-700 dark:text-white/90 hover:bg-white/50 dark:hover:bg-black/40 transition-all shadow-sm disabled:opacity-0" disabled={settings.favorites.length === 0}>
                  <Icon name="chevron_left" className="text-xl" />
              </button>

              <h1 className="text-lg font-bold line-clamp-1 text-center px-2 drop-shadow-sm">
                  {historicalMode === 'single' ? t('historical.title.single') : t('historical.title.compare')}
              </h1>

               <button onClick={() => cycleFavorite('next')} className="p-2 rounded-full bg-white/30 dark:bg-black/20 backdrop-blur-md text-slate-700 dark:text-white/90 hover:bg-white/50 dark:hover:bg-black/40 transition-all shadow-sm disabled:opacity-0" disabled={settings.favorites.length === 0}>
                  <Icon name="chevron_right" className="text-xl" />
              </button>
          </div>
      </div>

      <div className="px-4">
        <div className="inline-flex rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-1">
          <button
            type="button"
            onClick={() => updateHistoricalMode('single')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${historicalMode === 'single' ? 'bg-primary text-white' : 'text-slate-600 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10'}`}
          >
            {t('historical.mode.single')}
          </button>
          <button
            type="button"
            onClick={() => updateHistoricalMode('compare')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${historicalMode === 'compare' ? 'bg-primary text-white' : 'text-slate-600 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10'}`}
          >
            {t('historical.mode.compare')}
          </button>
        </div>
      </div>

      <div className={historicalMode === 'single' ? 'flex flex-col items-center gap-2 px-4 py-2' : 'flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2'}>
        {/* Date 1 Card */}
        <div 
            className="w-full relative rounded-xl p-3 flex flex-col gap-1 border transition-colors cursor-pointer group" 
            style={{ 
                backgroundColor: 'rgba(128,128,128,0.05)', 
                borderColor: 'rgba(128,128,128,0.3)' 
            }}
            onClick={() => setPickerOpen('date1')} 
            role="button"
        >
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase" style={{ color: date1Color }}>{t('date_1')}</span>
                    <span className="text-[10px] opacity-70" style={{ color: date1Color }}>{getDaysAgoText(date1)}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsMapOpen(true); }}
                        className="size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: date1Color }}
                        title={t('tooltip.map')}
                    >
                        <Icon name="public" className="text-sm" />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setPickerOpen('date1'); }}
                        className="size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: date1Color }}
                        title={t('tooltip.edit')}
                    >
                        <Icon name="edit" className="text-sm" />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setDashboardOpen({date: date1, location: location1}); }}
                        className="size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: date1Color }}
                        title={t('tooltip.dashboard')}
                    >
                        <Icon name="analytics" className="text-sm" />
                    </button>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <button 
                    onClick={(e) => { e.stopPropagation(); handleShiftSingle('date1', -1); }} 
                    className="size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all"
                    style={{ color: date1Color }}
                >
                    <Icon name="chevron_left" className="text-lg" />
                </button>
                <span className="font-bold truncate text-sm" style={{ color: date1Color }}>{formatCardDate(date1)}</span>
                <button 
                    onClick={(e) => { e.stopPropagation(); handleShiftSingle('date1', 1); }} 
                    disabled={!canShiftNext('date1')}
                    className={`size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all ${!canShiftNext('date1') ? 'opacity-20 cursor-not-allowed' : ''}`}
                    style={{ color: date1Color }}
                >
                    <Icon name="chevron_right" className="text-lg" />
                </button>
            </div>
            <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1 text-xs" style={{ color: date1Color }}>
                    <Icon name="location_on" className="text-xs" /> <span className="truncate max-w-[100px]">{location1.name}</span>
                </div>
                {historicalMode === 'compare' && (
                    <div 
                        onClick={(e) => { e.stopPropagation(); setSyncDates(!syncDates); }}
                        className="flex items-center justify-center p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
                    >
                         <Icon name={syncDates ? "check_box" : "check_box_outline_blank"} className="text-sm" style={{ color: date1Color }} />
                    </div>
                )}
            </div>
        </div>

        {historicalMode === 'compare' && (
          <>
            <Icon name="compare_arrows" className="text-slate-300 dark:text-white/30 text-3xl rotate-90 md:rotate-0" />

            {/* Date 2 Card */}
            <div 
                className="w-full relative rounded-xl p-3 flex flex-col gap-1 border transition-colors cursor-pointer group" 
                style={{ 
                    backgroundColor: date2Color + '10', 
                    borderColor: date2Color + '50' 
                }}
                onClick={() => setPickerOpen('date2')} 
                role="button"
            >
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase" style={{ color: date2Color }}>{t('date_2')}</span>
                        <span className="text-[10px] opacity-70" style={{ color: date2Color }}>{getDaysAgoText(date2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsMapOpen(true); }}
                            className="size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: date2Color }}
                            title={t('tooltip.map')}
                        >
                            <Icon name="public" className="text-sm" />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setPickerOpen('date2'); }}
                            className="size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: date2Color }}
                            title={t('tooltip.edit')}
                        >
                            <Icon name="edit" className="text-sm" />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDashboardOpen({date: date2, location: location2}); }}
                            className="size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: date2Color }}
                            title={t('tooltip.dashboard')}
                        >
                            <Icon name="analytics" className="text-sm" />
                        </button>
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleShiftSingle('date2', -1); }} 
                        className="size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all"
                        style={{ color: date2Color }}
                    >
                        <Icon name="chevron_left" className="text-lg" />
                    </button>
                    <span className="font-bold truncate text-sm" style={{ color: date2Color }}>{formatCardDate(date2)}</span>
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleShiftSingle('date2', 1); }} 
                        disabled={!canShiftNext('date2')}
                        className={`size-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all ${!canShiftNext('date2') ? 'opacity-20 cursor-not-allowed' : ''}`}
                        style={{ color: date2Color }}
                    >
                        <Icon name="chevron_right" className="text-lg" />
                    </button>
                </div>
                <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1 text-xs" style={{ color: date2Color }}>
                        <Icon name="location_on" className="text-xs" /> <span className="truncate max-w-[100px]">{location2.name}</span>
                    </div>
                    <div 
                        onClick={(e) => { e.stopPropagation(); setSyncDates(!syncDates); }}
                        className="flex items-center justify-center p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
                    >
                         <Icon name={syncDates ? "check_box" : "check_box_outline_blank"} className="text-sm" style={{ color: date2Color }} />
                    </div>
                </div>
            </div>
          </>
        )}
      </div>

      {historicalMode === 'compare' && (
        <div className="px-4">
          <div className="flex justify-end gap-2">
              <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setDate2(d); }} className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-primary/30">{t('quick.yesterday')}</button>
              <button onClick={() => { const d = new Date(); d.setMonth(d.getMonth() - 1); setDate2(d); }} className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-primary/30">{t('quick.last_month')}</button>
              <button onClick={() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); setDate2(d); }} className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-primary/30">{t('quick.last_year')}</button>
              <button onClick={() => { const d = new Date(); d.setFullYear(d.getFullYear() - 10); setDate2(d); }} className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:border-primary/30">{t('quick.ten_years')}</button>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="px-4 py-2">
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-white/50 mb-1">{t('historical.year')}</p>
                <input type="range" min={1900} max={new Date().getFullYear() + 1} step={1} value={(pendingDate||new Date()).getFullYear()} onInput={(e) => {
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
                <p className="text-xs font-bold text-slate-500 dark:text-white/50 mb-1">{t('historical.month')}</p>
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
                <p className="text-xs font-bold text-slate-500 dark:text-white/50 mb-1">{t('historical.day')}</p>
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
              {pendingDate && isTooFarFuture(pendingDate) && (
                  <p className="text-xs text-red-500 font-bold mt-1">{t('historical.error_date_too_far_future')}</p>
              )}
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Icon name="search" />
              <input value={searchQuery} onChange={async (e) => { setSearchQuery(e.target.value); try { const res = await searchCityByName(e.target.value); setSearchResults(res); } catch { setSearchResults([]); } }} className="flex-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg px-2 py-1 text-sm" placeholder={t('historical.search_city')} />
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
              <div className="mb-3 text-xs text-slate-600 dark:text-white/70">
                <span className="font-bold">{t('historical.selected')}</span> {pendingLocation.name}{pendingLocation.country?`, ${pendingLocation.country}`:''}
              </div>
            )}

            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-white/70">
                <input type="checkbox" checked={syncLocation} onChange={(e) => setSyncLocation(e.target.checked)} />
                {t('sync_location')}
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setPickerOpen(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10">{t('discard')}</button>
              <button 
                type="button" 
                onClick={(ev) => { 
                    ev.preventDefault(); 
                    if (!pendingDate) { setPickerOpen(null); return; } 
                    if (isTooFarFuture(pendingDate)) return;

                    if (pickerOpen==='date1') { 
                        setDate1(pendingDate); 
                        if (pendingLocation) { 
                            setLocation1(pendingLocation); 
                            if (syncLocation) setLocation2(pendingLocation); 
                        } 
                    } else if (pickerOpen==='date2') { 
                        setDate2(pendingDate); 
                        if (pendingLocation) { 
                            setLocation2(pendingLocation); 
                            if (syncLocation) setLocation1(pendingLocation); 
                        } 
                    } 
                    setPickerOpen(null); 
                }} 
                className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50"
                disabled={pendingDate ? isTooFarFuture(pendingDate) : false}
            >
                {t('apply')}
            </button>
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
                        <p className="text-xs text-slate-500 dark:text-white/60 font-medium">{formatLegendDate(date1)}</p>
                        <p className="text-2xl font-bold" style={{ color: date1Color }}>{stats.currentAvg.toFixed(1)}°</p>
                      </div>
                    </div>
                    {historicalMode === 'compare' && (
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-white/60 font-medium">{formatLegendDate(date2)}</p>
                          <p className="text-2xl font-bold" style={{ color: date2Color }}>{stats.pastAvg.toFixed(1)}°</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {historicalMode === 'compare' && (
                    <div>
                      <p className="text-slate-500 dark:text-white/60 text-xs font-medium">{t('temp_diff')}</p>
                      <p className={`text-xl font-bold ${stats.diff >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{stats.diff > 0 ? '+' : ''}{stats.diff.toFixed(1)}°</p>
                    </div>
                  )}
                </div>

                <div className="h-[260px] w-full">
                    {data.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke="rgba(128,128,128,0.1)" />
                                <XAxis dataKey="hour" tick={{fill: '#888', fontSize: 10}} tickLine={false} axisLine={false} interval={3} />
                                <YAxis tick={{fill: '#888', fontSize: 10}} tickLine={false} axisLine={false} ticks={yTicks} domain={yDomain} interval={0} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: settings.theme === 'dark' ? '#1d2b32' : '#ffffff', border: '1px solid rgba(128,128,128,0.1)', borderRadius: '8px', color: settings.theme === 'dark' ? '#fff' : '#000' }}
                                    itemStyle={{ fontSize: '12px' }}
                                    labelStyle={{ color: '#aaa', marginBottom: '4px', fontSize: '12px' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '10px' }} />
                                <Line type="monotone" dataKey="temp1_solid" name={`${t('temp')} (${formatLegendDate(date1)})`} stroke={date1Color} strokeWidth={3} dot={false} connectNulls={false} />
                                <Line type="monotone" dataKey="temp1_dash" name={`${t('temp')} (${formatLegendDate(date1)}) ${t('historical.forecast')}`} stroke={date1Color} strokeWidth={3} dot={false} strokeDasharray="5 5" connectNulls={false} legendType="none" />

                                {historicalMode === 'compare' && (
                                  <>
                                    <Line type="monotone" dataKey="temp2_solid" name={`${t('temp')} (${formatLegendDate(date2)})`} stroke={date2Color} strokeWidth={3} dot={false} connectNulls={false} />
                                    <Line type="monotone" dataKey="temp2_dash" name={`${t('temp')} (${formatLegendDate(date2)}) ${t('historical.forecast')}`} stroke={date2Color} strokeWidth={3} dot={false} strokeDasharray="5 5" connectNulls={false} legendType="none" />
                                  </>
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full w-full flex items-center justify-center text-slate-400">
                            {t('no_data_available')}
                        </div>
                    )}
                </div>
                {/* ... Rest of stats ... */}
                {noDataInfo1 && (
                  <div className="mt-3 text-xs text-slate-600 dark:text-white/70">
                    <span className="font-bold">{t('no_data_available')}</span> • {t('date_1')}: {t('data_from_year').replace('{year}', String(noDataInfo1))}
                  </div>
                )}
                {historicalMode === 'compare' && noDataInfo2 && (
                  <div className="mt-1 text-xs text-slate-600 dark:text-white/70">
                    <span className="font-bold">{t('no_data_available')}</span> • {t('date_2')}: {t('data_from_year').replace('{year}', String(noDataInfo2))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  {/* ... Cards ... */}
                  <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                    <p className="text-xs text-slate-500 dark:text-white/60 uppercase font-bold mb-2">{t('weather')}</p>
                    <div className={historicalMode === 'single' ? 'flex items-center justify-start' : 'flex items-center justify-between'}>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-4">{formatLegendDate(date1)}</span>
                        <div className="flex items-center gap-3">
                            <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                            <div className="flex items-center gap-2 text-sm">
                            <span className="material-symbols-outlined" style={{ color: date1Color }}>{mapWmoCodeToIcon(detail.code1)}</span>
                            <span>{detail.codeText1}</span>
                            </div>
                        </div>
                      </div>
                      {historicalMode === 'compare' && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-4">{formatLegendDate(date2)}</span>
                          <div className="flex items-center gap-3">
                              <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                              <div className="flex items-center gap-2 text-sm">
                              <span className="material-symbols-outlined" style={{ color: date2Color }}>{mapWmoCodeToIcon(detail.code2)}</span>
                              <span>{detail.codeText2}</span>
                              </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* ... Temp Card ... */}
                   <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                   <p className="text-xs text-slate-500 dark:text-white/60 uppercase font-bold mb-2">{t('temp')}</p>
                    <div className={historicalMode === 'single' ? 'flex items-center justify-start' : 'flex items-center justify-between'}>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-4">{formatLegendDate(date1)}</span>
                        <div className="flex items-center gap-3">
                            <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                            <div className="text-sm">
                            <div>{t('historical.avg')} <b>{detail.tempAvg1}°</b></div>
                            <div>{t('historical.min')} <b>{detail.tempMin1}°</b></div>
                            <div>{t('historical.max')} <b>{detail.tempMax1}°</b></div>
                            </div>
                        </div>
                      </div>
                      {historicalMode === 'compare' && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-4">{formatLegendDate(date2)}</span>
                          <div className="flex items-center gap-3">
                              <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                              <div className="text-sm">
                              <div>{t('historical.avg')} <b>{detail.tempAvg2}°</b></div>
                              <div>{t('historical.min')} <b>{detail.tempMin2}°</b></div>
                              <div>{t('historical.max')} <b>{detail.tempMax2}°</b></div>
                              </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ... Wind Card ... */}
                   <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                   <p className="text-xs text-slate-500 dark:text-white/60 uppercase font-bold mb-2">{t('wind')}</p>
                    <div className={historicalMode === 'single' ? 'flex items-center justify-start' : 'flex items-center justify-between'}>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-4">{formatLegendDate(date1)}</span>
                        <div className="flex items-center gap-3">
                            <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                            <div className="text-sm">
                            <div>{t('historical.max')} <b>{detail.windMax1} {settings.windUnit}</b></div>
                            <div>{t('historical.dir')} <b>{getWindCardinal(detail.windDirAvg1)}</b></div>
                            </div>
                        </div>
                      </div>
                      {historicalMode === 'compare' && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-4">{formatLegendDate(date2)}</span>
                          <div className="flex items-center gap-3">
                              <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                              <div className="text-sm">
                              <div>{t('historical.max')} <b>{detail.windMax2} {settings.windUnit}</b></div>
                              <div>{t('historical.dir')} <b>{getWindCardinal(detail.windDirAvg2)}</b></div>
                              </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ... Rain Card ... */}
                   <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                   <p className="text-xs text-slate-500 dark:text-white/60 uppercase font-bold mb-2">{t('rain')}</p>
                    <div className={historicalMode === 'single' ? 'flex items-center justify-start' : 'flex items-center justify-between'}>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-4">{formatLegendDate(date1)}</span>
                        <div className="flex items-center gap-3">
                            <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                            <div className="text-sm">
                            <div>{t('historical.total')} <b>{detail.rainSum1} {settings.precipUnit}</b></div>
                            </div>
                        </div>
                      </div>
                      {historicalMode === 'compare' && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-4">{formatLegendDate(date2)}</span>
                          <div className="flex items-center gap-3">
                              <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                              <div className="text-sm">
                              <div>{t('historical.total')} <b>{detail.rainSum2} {settings.precipUnit}</b></div>
                              </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ... Sun Card ... */}
                   <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                   <p className="text-xs text-slate-500 dark:text-white/60 uppercase font-bold mb-2">{t('sunshine')}</p>
                    <div className={historicalMode === 'single' ? 'flex items-center justify-start' : 'flex items-center justify-between'}>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-4">{formatLegendDate(date1)}</span>
                        <div className="flex items-center gap-3">
                            <span className="size-3 rounded-full" style={{ backgroundColor: date1Color }}></span>
                            <div className="text-sm">
                            <div>{t('historical.total')} <b>{formatDuration(detail.sunTotal1)}</b></div>
                            </div>
                        </div>
                      </div>
                      {historicalMode === 'compare' && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-4">{formatLegendDate(date2)}</span>
                          <div className="flex items-center gap-3">
                              <span className="size-3 rounded-full" style={{ backgroundColor: date2Color }}></span>
                              <div className="text-sm">
                              <div>{t('historical.total')} <b>{formatDuration(detail.sunTotal2)}</b></div>
                              </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
            </>
        )}
      </div>

      {historicalMode === 'compare' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 mt-4">
              {insightsList.map((insight, idx) => (
                  <div key={idx} className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                      <div className={`size-12 rounded-full flex items-center justify-center bg-slate-50 dark:bg-white/5 ${insight.color}`}>
                          <Icon name={insight.icon} />
                      </div>
                      <div className="flex-1">
                          <p className="text-xs uppercase font-bold text-slate-700 dark:text-white/60 mb-1">{insight.title}</p>
                          <p className="text-sm leading-snug">
                              {insight.desc}
                          </p>
                      </div>
                  </div>
              ))}
        </div>
      )}
      
      {dashboardOpen && (
        <HistoricalDashboard 
            date={dashboardOpen.date} 
            location={dashboardOpen.location} 
            settings={settings} 
            onClose={() => setDashboardOpen(null)} 
        />
      )}

      {isMapOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="w-full max-w-4xl h-[80vh] bg-white dark:bg-slate-900 rounded-3xl overflow-hidden relative shadow-2xl flex flex-col">
                  <div className="absolute top-4 right-4 z-[500]">
                      <button 
                          onClick={() => setIsMapOpen(false)}
                          className="p-2 bg-white dark:bg-slate-800 rounded-full shadow-lg hover:scale-110 transition-transform text-slate-800 dark:text-white"
                      >
                          <Icon name="close" />
                      </button>
                  </div>
                  
                  <MapContainer 
                      center={[location1.lat, location1.lon]} 
                      zoom={4} 
                      className="w-full h-full z-0"
                  >
                      <LayersControl position="topright">
                          <LayersControl.BaseLayer checked name="OpenStreetMap">
                              <TileLayer
                                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                              />
                          </LayersControl.BaseLayer>
                          <LayersControl.BaseLayer name="Satellite">
                              <TileLayer
                                  attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                              />
                          </LayersControl.BaseLayer>
                      </LayersControl>

                      <CircleMarker 
                          center={[location1.lat, location1.lon]}
                          radius={10}
                          pathOptions={{ color: date1Color, fillColor: date1Color, fillOpacity: 0.7 }}
                      >
                          <Popup>
                              <div className="text-center text-slate-800">
                                  <strong>{location1.name}</strong><br/>
                                  {formatCardDate(date1)}
                              </div>
                          </Popup>
                      </CircleMarker>

                      {/* Only show second marker if location is different */}
                      {historicalMode === 'compare' && (location1.lat !== location2.lat || location1.lon !== location2.lon) && (
                          <CircleMarker 
                              center={[location2.lat, location2.lon]}
                              radius={10}
                              pathOptions={{ color: date2Color, fillColor: date2Color, fillOpacity: 0.7 }}
                          >
                              <Popup>
                                  <div className="text-center text-slate-800">
                                      <strong>{location2.name}</strong><br/>
                                      {formatCardDate(date2)}
                                  </div>
                              </Popup>
                          </CircleMarker>
                      )}
                  </MapContainer>
              </div>
          </div>
      )}
    </div>
  );
};
