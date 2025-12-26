import React, { useState, useEffect, useRef } from 'react';
import { ViewState, AppSettings, Location, ActivityType } from '../types';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { loadCurrentLocation } from '../services/storageService';
import { searchCityByName } from '../services/geoService';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, ReferenceArea, Bar } from 'recharts';
import { fetchHistoricalRange, fetchHistoricalRangePastYears } from '../services/weatherService';
import { calculateActivityScore } from '../services/activityService';
import { CircleMarker, LayersControl, MapContainer, TileLayer, ZoomControl } from 'react-leaflet';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const HolidayReportView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [rainViewerTileUrl, setRainViewerTileUrl] = useState<string | null>(null);
  const [mapError, setMapError] = useState('');
  const [rainThreshold, setRainThreshold] = useState(2);
  
  // Photo feature state
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const t = (key: string) => getTranslation(key, settings.language);

  const parseIsoDateUTC = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) {
        throw new Error('Error: Invalid date format. Expected YYYY-MM-DD.');
    }
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
        throw new Error('Error: Invalid date format. Expected YYYY-MM-DD.');
    }
    return new Date(Date.UTC(y, m - 1, d));
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = parseIsoDateUTC(dateStr);
    const day = d.getUTCDate();
    const month = d.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short', timeZone: 'UTC' });
    const year = d.getUTCFullYear();
    const cleanMonth = month.replace('.', '').slice(0, 3);
    return `${day}-${cleanMonth}-${year}`;
  };

  useEffect(() => {
    const fetchRadarTile = async () => {
        setMapError('');
        setRainViewerTileUrl(null);
        try {
            const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            if (!res.ok) {
                throw new Error(`Error: RainViewer request failed (${res.status}).`);
            }
            const json = await res.json();
            const host: string = json.host || 'https://tilecache.rainviewer.com';
            const frames = [...(json.radar?.past || []), ...(json.radar?.nowcast || [])];
            const latest = frames.length ? frames[frames.length - 1] : null;
            const path: string | null = latest?.path || (latest?.time ? `/v2/radar/${latest.time}` : null);
            if (!path) {
                throw new Error('Error: No radar frames available.');
            }
            setRainViewerTileUrl(`${host}${path}/256/{z}/{x}/{y}/2/1_1.png`);
        } catch (e: any) {
            setMapError(e?.message || 'Error: Could not load radar overlay.');
        }
    };

    if (isMapOpen) {
        fetchRadarTile();
    }
  }, [isMapOpen]);

  // Auto-fill end date logic
  useEffect(() => {
    if (startDate && !endDate) {
      const start = new Date(startDate);
      const nextDay = new Date(start);
      nextDay.setDate(start.getDate() + 1);
      setEndDate(nextDay.toISOString().split('T')[0]);
    }
  }, [startDate]);

    // Draw canvas when image or data changes
    useEffect(() => {
        if (uploadedImage && reportData && canvasRef.current) {
            drawCanvas();
        }
    }, [uploadedImage, reportData]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => setUploadedImage(img);
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const drawCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !uploadedImage || !reportData) return;

        // Set canvas dimensions to match image
        canvas.width = uploadedImage.width;
        canvas.height = uploadedImage.height;
        const w = canvas.width;
        const h = canvas.height;
        
        // Scale factor for text sizing based on image width (normalized to 1080p width)
        const s = (w / 1080) * 0.8; 

        // 1. Draw Image
        ctx.drawImage(uploadedImage, 0, 0);

        // 2. Overlays
        // Top Gradient
        const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.3);
        topGrad.addColorStop(0, 'rgba(0,0,0,0.7)');
        topGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, w, h * 0.3);

        // Bottom Gradient
        const botGrad = ctx.createLinearGradient(0, h * 0.5, 0, h);
        botGrad.addColorStop(0, 'rgba(0,0,0,0)');
        botGrad.addColorStop(0.5, 'rgba(0,0,0,0.5)');
        botGrad.addColorStop(1, 'rgba(0,0,0,0.9)');
        ctx.fillStyle = botGrad;
        ctx.fillRect(0, h * 0.5, w, h * 0.5);

        // 3. Text Settings
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10 * s;

        // Header
        ctx.textAlign = 'left';
        ctx.font = `bold ${25 * s}px sans-serif`;
        if (title) ctx.fillText(title, 40 * s, 80 * s);

        // Location & Date (Top Right)
        ctx.textAlign = 'right';
        ctx.font = `bold ${25 * s}px sans-serif`;
        ctx.fillText(location.name, w - 40 * s, 80 * s);
        ctx.font = `${18 * s}px sans-serif`;
        const dateStr = `${formatDate(startDate)} - ${formatDate(endDate)}`;
        ctx.fillText(dateStr, w - 40 * s, 120 * s);

        // Vibe Score (Center/Bottom)
        ctx.textAlign = 'center';

        const vibeScoreText = `${reportData.vibe.score}/10`;
        const vibeText = String(reportData.vibe.text || '');

        ctx.font = `bold ${100 * s}px sans-serif`;
        ctx.fillText(vibeScoreText, w / 2, h * 0.60);

        ctx.font = `bold ${45 * s}px sans-serif`;
        ctx.fillText(vibeText, w / 2, h * 0.60 + 80 * s);

        // Stats Grid (Bottom)
        const statsY = h - 80 * s;
        const colW = w / 4;
        ctx.textAlign = 'center';
        
        const drawStat = (label: string, value: string, iconText: string, x: number) => {
            ctx.font = `bold ${24 * s}px sans-serif`;
            ctx.fillText(iconText, x, statsY - 50 * s);
            
            ctx.font = `bold ${30 * s}px sans-serif`;
            ctx.fillText(value, x, statsY);
            
            ctx.font = `${18 * s}px sans-serif`;
            ctx.fillStyle = '#DDDDDD';
            ctx.fillText(label, x, statsY + 30 * s);
            ctx.fillStyle = '#FFFFFF';
        };

        drawStat(t('holiday_report.stat.warmest_day'), `${Math.round(reportData.stats.maxTemp)}°C`, 'MAX', colW * 0.5);
        drawStat(t('holiday_report.stat.coldest_night'), `${Math.round(reportData.stats.coldestNight)}°C`, 'MIN', colW * 1.5);
        drawStat(t('holiday_report.stat.total_rain'), `${Math.round(reportData.stats.totalRain)}mm`, 'RAIN', colW * 2.5);
        drawStat(t('holiday_report.stat.total_sun'), `${Math.round(reportData.stats.totalSun)}u`, 'SUN', colW * 3.5);
    };

    const handleCopy = async () => {
        if (!canvasRef.current) return;
        try {
            const blob = await new Promise<Blob | null>(resolve => canvasRef.current!.toBlob(resolve));
            if (blob) {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                alert(t('holiday_report.copy_success'));
            }
        } catch (e) {
            console.error(e);
            alert(t('holiday_report.copy_error'));
        }
    };

    const handleDownload = () => {
        if (!canvasRef.current) return;
        const link = document.createElement('a');
        link.download = `${t('holiday_report.download_filename_prefix')}-${location.name}.png`;
        link.href = canvasRef.current.toDataURL('image/png');
        link.click();
    };

    const handleShare = async () => {
        if (!canvasRef.current) return;
        try {
            const blob = await new Promise<Blob | null>(resolve => canvasRef.current!.toBlob(resolve));
            if (blob && navigator.share) {
                const file = new File([blob], 'holiday-report.png', { type: 'image/png' });
                await navigator.share({
                    title: t('holiday_report.share_title'),
                    text: `${t('holiday_report.share_text_prefix')} ${location.name}! ${reportData.vibe.text}`,
                    files: [file]
                });
            } else {
                alert(t('holiday_report.share_not_supported'));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handlePrint = () => {
        if (!canvasRef.current) return;
        const dataUrl = canvasRef.current.toDataURL();
        const windowContent = '<!DOCTYPE html>';
        const printWin = window.open('', '', 'width=800,height=600');
        printWin?.document.open();
        printWin?.document.write(`${windowContent}<html><body><img src="${dataUrl}" style="width:100%"></body></html>`);
        printWin?.document.close();
        printWin?.focus();
        printWin?.print();
    };

  // Search logic
  useEffect(() => {
    const search = async () => {
      if (searchQuery.length < 3) {
        setSearchResults([]);
        return;
      }
      try {
        const results = await searchCityByName(searchQuery, settings.language);
        setSearchResults(results);
      } catch (e) {
        console.error(e);
      }
    };
    const debounce = setTimeout(search, 500);
    return () => clearTimeout(debounce);
  }, [searchQuery, settings.language]);

  const validateDates = () => {
    if (!startDate || !endDate) return false;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    
    if (end > now) {
      setError('Einddatum mag niet in de toekomst liggen');
      return false;
    }
    if (start > end) {
      setError('Startdatum moet voor einddatum liggen');
      return false;
    }
    
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    if (diffDays > 90) {
      setError('Periode mag maximaal 3 maanden zijn');
      return false;
    }
    
    return true;
  };

  const calculateVibe = (data: any) => {
    // Simple vibe calculation based on stats
    const avgTemp = data.avgTemp;
    const totalRain = data.totalRain;
    const sunHours = data.totalSun;
    
    if (avgTemp > 28 && totalRain < 5) return { text: "Bakoven", score: 10 };
    if (avgTemp > 22 && totalRain < 10 && sunHours > 50) return { text: "Perfect zomers", score: 9 };
    if (avgTemp > 18 && totalRain < 20) return { text: "Aangenaam", score: 7 };
    if (totalRain > 50) return { text: "Verregend", score: 3 };
    if (avgTemp < 5) return { text: "Bibberen", score: 4 };
    if (avgTemp < 15 && totalRain > 20) return { text: "Wisselvallig", score: 5 };
    if (avgTemp > 25 && totalRain > 50) return { text: "Tropisch vochtig", score: 6 };
    return { text: "Gemiddeld", score: 6 };
  };

  const handleGenerate = async () => {
    setError('');
    if (!validateDates()) return;
    
    setLoading(true);
    try {
        const [data, pastYears] = await Promise.all([
            fetchHistoricalRange(location.lat, location.lon, startDate, endDate),
            fetchHistoricalRangePastYears(location.lat, location.lon, startDate, endDate, 5)
        ]);

        const shiftDateStringYear = (dateStr: string, yearsBack: number) => {
            const parts = dateStr.split('-');
            if (parts.length !== 3) {
                throw new Error('Error: Invalid date format. Expected YYYY-MM-DD.');
            }
            const y = Number(parts[0]);
            const m = Number(parts[1]);
            const d = Number(parts[2]);
            if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
                throw new Error('Error: Invalid date format. Expected YYYY-MM-DD.');
            }

            const dt = new Date(Date.UTC(y - yearsBack, m - 1, d));
            if (dt.getUTCMonth() !== m - 1) {
                dt.setUTCDate(0);
            }
            return dt.toISOString().slice(0, 10);
        };

        const pastPrecipByDate = (pastYears || []).map((res: any) => {
            const map: Record<string, number> = {};
            const times: string[] = res?.daily?.time || [];
            const vals: number[] = res?.daily?.precipitation_sum || [];
            for (let i = 0; i < times.length; i++) {
                map[times[i]] = vals[i] ?? 0;
            }
            return map;
        });
        
        // Process data
        const daily = data.daily;
        const yearsCount = pastPrecipByDate.length;
        const days = daily.time.map((t: string, i: number) => {
            const rain = daily.precipitation_sum[i];
            const sunSeconds = daily.sunshine_duration?.[i] || 0;
            const daylightSeconds = daily.daylight_duration?.[i] || 0;
            const sunChance = daylightSeconds > 0 ? Math.max(0, Math.min(100, (sunSeconds / daylightSeconds) * 100)) : 0;
            const gusts = daily.wind_gusts_10m_max?.[i] ?? 0;

            let wetYears = 0;
            if (yearsCount > 0) {
                for (let y = 0; y < yearsCount; y++) {
                    const shifted = shiftDateStringYear(t, y + 1);
                    const pastRain = pastPrecipByDate[y][shifted] ?? 0;
                    if (pastRain > 2) wetYears++;
                }
            }
            const rainChanceGt2mm = yearsCount > 0 ? (wetYears / yearsCount) * 100 : 0;

            return {
                date: t,
                max: daily.temperature_2m_max[i],
                min: daily.temperature_2m_min[i],
                rain: rain,
                sun: sunSeconds / 3600,
                code: daily.weather_code[i],
                windMax: daily.wind_speed_10m_max?.[i] ?? 0,
                gustsMax: gusts,
                sunChance,
                rainChanceGt2mm
            };
        });
        
        const maxTemp = Math.max(...days.map((d: any) => d.max));
        const minTemp = Math.min(...days.map((d: any) => d.min));
        const totalRain = days.reduce((a: number, b: any) => a + b.rain, 0);
        const totalSun = days.reduce((a: number, b: any) => a + b.sun, 0);
        const sunlessDays = days.filter((d: any) => d.sun < 1).length;
        const avgTemp = days.reduce((a: number, b: any) => a + b.max, 0) / days.length;
        
        // New stats
        const avgSunPerDay = totalSun / days.length;
        const rainDays = days.filter((d: any) => d.rain >= 0.2).length;
        const rainChanceDays = days.filter((d: any) => d.rainChanceGt2mm >= 20).length;
        const avgRainChanceGt2mm = days.reduce((a: number, b: any) => a + b.rainChanceGt2mm, 0) / days.length;
        const lowestMax = Math.min(...days.map((d: any) => d.max));
        const coldestNight = Math.min(...days.map((d: any) => d.min));
        const avgNightTemp = days.reduce((a: number, b: any) => a + b.min, 0) / days.length;

        const vibe = calculateVibe({ avgTemp, totalRain, totalSun });

        const allActivities: ActivityType[] = ['bbq', 'cycling', 'walking', 'sailing', 'running', 'beach', 'gardening', 'stargazing', 'golf', 'drone'];
        const enabledActivities = allActivities.filter(a => settings.enabledActivities?.[a] !== false);
        const activitySums: Partial<Record<ActivityType, number>> = {};
        enabledActivities.forEach(a => { activitySums[a] = 0; });

        days.forEach((day: any) => {
            const activityData = {
                tempFeelsLike: (day.max + day.min) / 2,
                windKmh: day.windMax,
                precipMm: day.rain,
                precipProb: day.rainChanceGt2mm,
                gustsKmh: day.gustsMax,
                weatherCode: day.code,
                sunChance: day.sunChance,
                cloudCover: 100 - day.sunChance,
                visibility: 10000
            };

            enabledActivities.forEach(type => {
                const score = calculateActivityScore(activityData, type, settings.language);
                activitySums[type] = (activitySums[type] || 0) + score.score10;
            });
        });

        const activityAverages = enabledActivities.map(type => {
            const avgScore10 = days.length ? (activitySums[type] || 0) / days.length : 0;
            return {
                type,
                score10: avgScore10,
                stars: avgScore10 / 2
            };
        });
        
        setReportData({
            days,
            stats: {
                maxTemp,
                minTemp,
                totalRain,
                totalSun,
                sunlessDays,
                avgSunPerDay,
                rainDays,
                rainChanceDays,
                avgRainChanceGt2mm,
                lowestMax,
                coldestNight,
                avgTemp,
                avgNightTemp
            },
            vibe,
            activityAverages,
            period: {
                start: startDate,
                end: endDate,
                days: days.length
            }
        });
        
    } catch (e) {
        console.error(e);
        setError('Kon gegevens niet ophalen');
    } finally {
        setLoading(false);
    }
  };

  const getActivityIcon = (type: ActivityType) => {
      switch(type) {
          case 'bbq': return 'outdoor_grill';
          case 'cycling': return 'directions_bike';
          case 'walking': return 'directions_walk';
          case 'sailing': return 'sailing';
          case 'running': return 'directions_run';
          case 'beach': return 'beach_access';
          case 'gardening': return 'yard';
          case 'stargazing': return 'auto_awesome';
          case 'golf': return 'golf_course';
          case 'drone': return 'flight';
          default: return 'sports_score';
      }
  };

  const getScoreColor = (score: number) => {
      if (score >= 8) return "text-green-500 dark:text-green-400";
      if (score >= 6) return "text-lime-500 dark:text-lime-400";
      if (score >= 4) return "text-orange-500 dark:text-orange-400";
      return "text-red-500 dark:text-red-400";
  };

  const yTicks = reportData ? (() => {
      const min = Math.floor(reportData.stats.minTemp - 2);
      const max = Math.ceil(reportData.stats.maxTemp + 2);
      const ticks = [];
      for (let i = min; i <= max; i++) {
          ticks.push(i);
      }
      return ticks;
  })() : [];

  return (
    <div className="relative min-h-screen flex flex-col pb-20 overflow-y-auto overflow-x-hidden text-slate-800 dark:text-white bg-slate-50 dark:bg-background-dark transition-colors duration-300">
        
        {/* Header */}
        <div className="flex flex-col pt-8 pb-4 relative z-10">
            <div className="flex items-center justify-center relative px-4 mb-2">
                <button onClick={() => onNavigate(ViewState.CURRENT)} className="absolute left-6 text-slate-400 dark:text-white/60 hover:text-slate-800 dark:hover:text-white transition-colors p-2">
                    <Icon name="arrow_back_ios_new" />
                </button>
                <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-md dark:drop-shadow-md text-slate-800 dark:text-white">
                    <Icon name="flight" className="text-primary" />
                    Vakantie Overzicht
                </h2>
            </div>
        </div>

        <div className="px-6 relative z-10 w-full max-w-4xl mx-auto">
            {!reportData ? (
                <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-2xl rounded-3xl p-6 shadow-lg border border-slate-200 dark:border-white/10">
                    <div className="flex flex-col gap-4">
                        {/* Title */}
                        <div>
                            <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">Titel (optioneel)</label>
                            <input 
                                type="text" 
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Mijn vakantie..."
                                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        
                        {/* Location & Map */}
                        <div className="relative">
                            <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">Locatie</label>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setShowSearch(!showSearch)}
                                    className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-left flex items-center gap-2"
                                >
                                    <Icon name="location_on" className="text-primary" />
                                    <span className="truncate">{location.name}, {location.country}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsMapOpen(true)}
                                    className="shrink-0 w-12 flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    title="Open Kaart"
                                >
                                    <Icon name="public" className="text-slate-500 dark:text-slate-400 text-xl" />
                                </button>
                            </div>
                            
                            {showSearch && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 z-50 p-2">
                                    <div className="flex items-center gap-2 mb-2">
                                        <input 
                                            autoFocus
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Zoek stad..."
                                            className="w-full bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 outline-none"
                                        />
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        {searchResults.map((loc, i) => (
                                            <button 
                                                key={i}
                                                onClick={() => {
                                                    setLocation(loc);
                                                    setShowSearch(false);
                                                    setSearchQuery('');
                                                }}
                                                className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-sm"
                                            >
                                                {loc.name}, {loc.country}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">{t('holiday_report.label.start_date')}</label>
                                <input 
                                    type="date" 
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">{t('holiday_report.label.end_date')}</label>
                                <input 
                                    type="date" 
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors dark:text-white"
                                />
                            </div>
                        </div>
                        
                        {/* Rain Threshold Selector */}
                        <div>
                            <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">{t('holiday_report.label.rain_threshold')}</label>
                            <div className="flex gap-2">
                                {[1, 2, 5].map(val => (
                                    <button
                                        key={val}
                                        onClick={() => setRainThreshold(val)}
                                        className={`flex-1 py-2 px-3 rounded-xl border transition-colors text-sm font-medium ${
                                            rainThreshold === val 
                                            ? 'bg-blue-500 text-white border-blue-500' 
                                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        &gt; {val}mm
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium">
                                {error}
                            </div>
                        )}
                        
                        <button 
                            onClick={handleGenerate}
                            disabled={loading}
                            className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                        >
                            {loading ? t('holiday_report.button.analyzing') : t('holiday_report.button.generate')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-6 animate-in slide-in-from-bottom duration-500">
                    {/* Header Card */}
                    <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-2xl rounded-3xl p-6 shadow-lg border border-slate-200 dark:border-white/10 text-center">
                        <h1 className="text-2xl font-bold mb-1">{title || t('holiday_report.title_default')}</h1>
                        <p className="text-slate-500 dark:text-slate-400">
                            {location.name} • {reportData.period.days} {t('holiday_report.days')}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                        
                        <div className="my-8 flex flex-col items-center justify-center">
                            <div className="w-40 h-40 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl mb-4 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-white/20 blur-xl group-hover:bg-white/30 transition-colors"></div>
                                <span className="text-6xl relative z-10 drop-shadow-md">
                                    {reportData.vibe.score}
                                </span>
                            </div>
                            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
                                {reportData.vibe.text}
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">{t('holiday_report.vibe_score')}: {reportData.vibe.score}/10</p>
                        </div>
                    </div>
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <Icon name="thermostat" className="text-3xl text-red-500" />
                            <span className="text-2xl font-bold">{Math.round(reportData.stats.maxTemp)}°C</span>
                            <span className="text-xs text-slate-500 uppercase tracking-wider text-center">{t('holiday_report.stat.warmest_day')}</span>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <Icon name="ac_unit" className="text-3xl text-blue-500" />
                            <span className="text-2xl font-bold">{Math.round(reportData.stats.coldestNight)}°C</span>
                            <span className="text-xs text-slate-500 uppercase tracking-wider text-center">{t('holiday_report.stat.coldest_night')}</span>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <Icon name="water_drop" className="text-3xl text-blue-400" />
                            <span className="text-2xl font-bold">{Math.round(reportData.stats.totalRain)}mm</span>
                            <div className="flex flex-col items-center">
                                <span className="text-xs text-slate-500 uppercase tracking-wider text-center">
                                    {reportData.stats.rainChanceDays} {t('holiday_report.days')} {t('holiday_report.rain_chance_gt')} 2mm
                                </span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center">
                                    {t('holiday_report.avg_prefix')} {Math.round(reportData.stats.avgRainChanceGt2mm)}%
                                </span>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <Icon name="wb_sunny" className="text-3xl text-orange-500" />
                            <span className="text-2xl font-bold">{Math.round(reportData.stats.avgSunPerDay)}u</span>
                            <span className="text-xs text-slate-500 uppercase tracking-wider text-center">
                                {t('holiday_report.stat.avg_sun_per_day')}
                            </span>
                        </div>

                        {/* Extended Stats */}
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <span className="text-xl font-bold">{Math.round(reportData.stats.lowestMax)}°C</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center">{t('holiday_report.stat.lowest_max')}</span>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <span className="text-xl font-bold">{Math.round(reportData.stats.avgTemp)}°C</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center">{t('holiday_report.stat.avg_day')}</span>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <span className="text-xl font-bold">{Math.round(reportData.stats.avgNightTemp)}°C</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center">{t('holiday_report.stat.avg_night')}</span>
                        </div>
                         <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <span className="text-xl font-bold">{Math.round(reportData.stats.totalSun)}u</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center">{t('holiday_report.stat.total_sun')}</span>
                        </div>
                    </div>
                    
                    {/* Graph */}
                    <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-white/10 h-80">
                         <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">{t('holiday_report.chart.trend')}</h3>
                         <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={reportData.days}>
                                <defs>
                                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                {reportData.days.map((day: any) => {
                                    const d = parseIsoDateUTC(day.date);
                                    const dayOfWeek = d.getUTCDay();
                                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                                        return <ReferenceArea key={day.date} x1={day.date} x2={day.date} fill="#94a3b8" fillOpacity={0.1} />;
                                    }
                                    return null;
                                })}
                                <CartesianGrid vertical={false} horizontal={false} />
                                {yTicks.map(tick => (
                                    <ReferenceLine 
                                        key={tick} 
                                        y={tick} 
                                        yAxisId="temp"
                                        stroke="#94a3b8"
                                        strokeOpacity={tick % 5 === 0 ? 0.3 : 0.1} 
                                        strokeWidth={tick % 5 === 0 ? 2 : 1}
                                    />
                                ))}
                                <XAxis 
                                    dataKey="date" 
                                    tickFormatter={(str) => formatDate(str)}
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis 
                                    yAxisId="temp"
                                    hide={false} 
                                    domain={[yTicks[0], yTicks[yTicks.length - 1]]} 
                                    ticks={yTicks.filter(t => t % 5 === 0)}
                                    tick={{fontSize: 10}} 
                                    width={30} 
                                    tickLine={false} 
                                    axisLine={false} 
                                />
                                <YAxis
                                    yAxisId="chance"
                                    orientation="right"
                                    domain={[0, 100]}
                                    ticks={[0, 25, 50, 75, 100]}
                                    tick={{fontSize: 10}}
                                    width={40}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(v) => `${v}%`}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    labelFormatter={(label) => formatDate(label)}
                                    formatter={(value: any, name: any) => {
                                        if (name === `Kans >${rainThreshold}mm`) return [`${Math.round(value)}%`, name];
                                        if (name === 'Max Temp' || name === 'Min Temp') return [`${Math.round(value)}°C`, name];
                                        return [value, name];
                                    }}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" />
                                <Area yAxisId="temp" name="Max Temp" type="monotone" dataKey="max" stroke="#f59e0b" fillOpacity={1} fill="url(#colorTemp)" strokeWidth={3} />
                                <Area yAxisId="temp" name="Min Temp" type="monotone" dataKey="min" stroke="#3b82f6" fillOpacity={0} strokeWidth={2} strokeDasharray="5 5" />
                                <Bar yAxisId="chance" name={`Kans >${rainThreshold}mm`} dataKey="rainChance" fill="#38bdf8" opacity={0.55} barSize={8} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Daily Summary Table */}
                    <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-white/10">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Dagelijks Overzicht</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                                    <tr>
                                        <th className="px-4 py-3 rounded-tl-lg">{t('share.date')}</th>
                                        <th className="px-4 py-3">Max/Min</th>
                                        <th className="px-4 py-3">Zon</th>
                                        <th className="px-4 py-3">Regen</th>
                                        <th className="px-4 py-3 rounded-tr-lg">Kans &gt;{rainThreshold}mm</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.days.map((day: any) => (
                                        <tr key={day.date} className="border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3 font-medium">{formatDate(day.date)}</td>
                                            <td className="px-4 py-3">
                                                <span className="text-orange-500 font-bold">{Math.round(day.max)}°</span>
                                                <span className="text-slate-400 mx-1">/</span>
                                                <span className="text-blue-500">{Math.round(day.min)}°</span>
                                            </td>
                                            <td className="px-4 py-3 text-orange-400">
                                                <div className="flex items-center gap-1">
                                                    <Icon name="wb_sunny" className="text-xs" />
                                                    {Math.round(day.sun)}u
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-blue-400">
                                                <div className="flex items-center gap-1">
                                                    <Icon name="water_drop" className="text-xs" />
                                                    {day.rain > 0 ? `${day.rain.toFixed(1)}mm` : '-'}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden min-w-[60px]">
                                                        <div 
                                                            className="h-full bg-blue-400 rounded-full" 
                                                            style={{ width: `${day.rainChance}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-medium w-8 text-right">{Math.round(day.rainChance)}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {reportData.activityAverages && reportData.activityAverages.length > 0 && (
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-white/10">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Activiteiten</h3>
                            <p className="text-xs text-slate-500 dark:text-white/60 mb-4 italic">Gemiddelde scores van de gekozen periode</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {reportData.activityAverages.map((a: any) => {
                                    const score10 = a.score10 || 0;
                                    const stars = a.stars || 0;
                                    const fullStars = Math.floor(stars);
                                    const hasHalf = stars - fullStars >= 0.5;
                                    return (
                                        <div key={a.type} className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-200 dark:border-white/5 flex items-center justify-between shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg bg-white dark:bg-white/5 ${getScoreColor(score10)}`}>
                                                    <Icon name={getActivityIcon(a.type)} className="text-xl" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm capitalize">{t('activity.' + a.type)}</p>
                                                    <div className="flex gap-0.5 mt-1">
                                                        {[1,2,3,4,5].map(s => {
                                                            const iconName = s <= fullStars ? 'star' : (s === fullStars + 1 && hasHalf ? 'star_half' : 'star_outline');
                                                            return <Icon key={s} name={iconName} className={`text-sm ${getScoreColor(score10)}`} />;
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className={`text-xl font-bold ${getScoreColor(score10)}`}>{score10.toFixed(1)}</span>
                                                <span className="text-[10px] text-slate-500 dark:text-white/50 uppercase tracking-wider">{t('average')}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Photo Upload & Overlay */}
                    <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-white/10 mb-6">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">{t('share_experience')}</h3>
                        
                        {!uploadedImage ? (
                            <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-white/20 rounded-xl p-8 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer relative">
                                <input 
                                    type="file" 
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                                <Icon name="add_a_photo" className="text-4xl text-slate-400 mb-2" />
                                <span className="text-sm font-medium text-slate-500">{t('upload_holiday_photo')}</span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="relative rounded-xl overflow-hidden shadow-lg">
                                    <canvas ref={canvasRef} className="w-full h-auto" />
                                </div>
                                
                                <div className="grid grid-cols-4 gap-2">
                                    <button 
                                        onClick={handleCopy}
                                        className="flex flex-col items-center justify-center p-3 bg-slate-100 dark:bg-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <Icon name="content_copy" className="text-xl mb-1 text-slate-500" />
                                        <span className="text-xs font-medium">Kopieer</span>
                                    </button>
                                    <button 
                                        onClick={handleDownload}
                                        className="flex flex-col items-center justify-center p-3 bg-slate-100 dark:bg-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <Icon name="download" className="text-xl mb-1 text-blue-500" />
                                        <span className="text-xs font-medium">{t('download')}</span>
                                    </button>
                                    <button 
                                        onClick={handleShare}
                                        className="flex flex-col items-center justify-center p-3 bg-slate-100 dark:bg-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <Icon name="share" className="text-xl mb-1 text-green-500" />
                                        <span className="text-xs font-medium">{t('share')}</span>
                                    </button>
                                    <button 
                                        onClick={handlePrint}
                                        className="flex flex-col items-center justify-center p-3 bg-slate-100 dark:bg-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <Icon name="print" className="text-xl mb-1 text-purple-500" />
                                        <span className="text-xs font-medium">{t('print')}</span>
                                    </button>
                                </div>
                                
                                <button 
                                    onClick={() => setUploadedImage(null)}
                                    className="w-full py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                >
                                    Foto verwijderen
                                </button>
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={() => {
                            setReportData(null);
                            setTitle('');
                            setUploadedImage(null);
                        }}
                        className="w-full bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white font-bold py-3 rounded-xl hover:bg-slate-300 dark:hover:bg-white/20 transition-colors mb-8"
                    >
                        Nieuw Rapport
                    </button>
                </div>
            )}
        </div>

        {isMapOpen && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
                        <div className="flex flex-col">
                            <div className="font-bold">{location.name}, {location.country}</div>
                            <div className="text-xs text-slate-500 dark:text-white/60">{t('map_overlay')}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsMapOpen(false)}
                            className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                            aria-label="Sluit kaart"
                        >
                            <Icon name="close" />
                        </button>
                    </div>

                    {mapError && (
                        <div className="px-5 pt-4">
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-xl text-sm font-medium">
                                {mapError}
                            </div>
                        </div>
                    )}

                    <div className="h-[65vh]">
                        <MapContainer
                            center={[location.lat, location.lon]}
                            zoom={9}
                            zoomControl={false}
                            style={{ height: '100%', width: '100%' }}
                            whenReady={(e) => {
                                setTimeout(() => e.target.invalidateSize(), 150);
                            }}
                        >
                            <LayersControl position="bottomright">
                                <LayersControl.BaseLayer checked={settings.theme !== 'dark'} name="Kaart (Licht)">
                                    <TileLayer
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer checked={settings.theme === 'dark'} name="Kaart (Donker)">
                                    <TileLayer
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Satelliet">
                                    <TileLayer
                                        attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                    />
                                </LayersControl.BaseLayer>
                                <LayersControl.BaseLayer name="Topo">
                                    <TileLayer
                                        attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                        url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                                    />
                                </LayersControl.BaseLayer>

                                <LayersControl.Overlay name="Neerslag radar" checked={false}>
                                    {rainViewerTileUrl ? (
                                        <TileLayer
                                            url={rainViewerTileUrl}
                                            opacity={0.6}
                                        />
                                    ) : (
                                        <></>
                                    )}
                                </LayersControl.Overlay>
                                <LayersControl.Overlay name="Hillshade" checked={false}>
                                    <TileLayer
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                        url="https://tiles.wmflabs.org/hillshading/{z}/{x}/{y}.png"
                                        opacity={0.35}
                                    />
                                </LayersControl.Overlay>
                                <LayersControl.Overlay name="Spoorwegen" checked={false}>
                                    <TileLayer
                                        attribution='&copy; OpenRailwayMap contributors'
                                        url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
                                        opacity={0.55}
                                    />
                                </LayersControl.Overlay>
                            </LayersControl>

                            <ZoomControl position="bottomright" />
                            <CircleMarker
                                center={[location.lat, location.lon]}
                                radius={8}
                                pathOptions={{ color: '#13b6ec', fillColor: '#13b6ec', fillOpacity: 0.7 }}
                            />
                        </MapContainer>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
