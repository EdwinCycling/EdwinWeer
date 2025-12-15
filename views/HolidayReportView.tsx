import React, { useState, useEffect, useRef } from 'react';
import { ViewState, AppSettings, Location, TempUnit } from '../types';
import { Icon } from '../components/Icon';
import { WeatherBackground } from '../components/WeatherBackground';
import { getTranslation } from '../services/translations';
import { loadCurrentLocation, saveCurrentLocation } from '../services/storageService';
import { reverseGeocode, searchCityByName } from '../services/geoService';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, ReferenceArea } from 'recharts';
import { fetchHistoricalRange } from '../services/weatherService';

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
  
  // Photo feature state
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const t = (key: string) => getTranslation(key, settings.language);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = d.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short' });
    const year = d.getFullYear();
    const cleanMonth = month.replace('.', '');
    return `${day}-${cleanMonth}-${year}`;
  };

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
        // Emoji
        const vibeEmoji = reportData.vibe.text.split(' ').pop();
        const vibeText = reportData.vibe.text.replace(vibeEmoji, '').trim();
        
        ctx.font = `${100 * s}px sans-serif`;
        ctx.fillText(vibeEmoji, w / 2, h * 0.60);
        
        ctx.font = `bold ${50 * s}px sans-serif`;
        ctx.fillText(vibeText, w / 2, h * 0.60 + 80 * s);

        // Stats Grid (Bottom)
        const statsY = h - 80 * s;
        const colW = w / 4;
        ctx.textAlign = 'center';
        
        const drawStat = (label: string, value: string, icon: string, x: number) => {
            ctx.font = `${30 * s}px sans-serif`; // Icon placeholder or emoji
            // For icons we might use emojis since standard icons aren't available in canvas easily without loading images
            // Let's use emojis for simplicity as requested "icon overlay"
            ctx.fillText(icon, x, statsY - 50 * s);
            
            ctx.font = `bold ${30 * s}px sans-serif`;
            ctx.fillText(value, x, statsY);
            
            ctx.font = `${18 * s}px sans-serif`;
            ctx.fillStyle = '#DDDDDD';
            ctx.fillText(label, x, statsY + 30 * s);
            ctx.fillStyle = '#FFFFFF';
        };

        drawStat('Warmste Dag', `${Math.round(reportData.stats.maxTemp)}°C`, '🌡️', colW * 0.5);
        drawStat('Koudste Nacht', `${Math.round(reportData.stats.coldestNight)}°C`, '❄️', colW * 1.5);
        drawStat('Totaal Regen', `${Math.round(reportData.stats.totalRain)}mm`, '☔', colW * 2.5);
        drawStat('Totaal Zon', `${Math.round(reportData.stats.totalSun)}u`, '☀️', colW * 3.5);
    };

    const handleCopy = async () => {
        if (!canvasRef.current) return;
        try {
            const blob = await new Promise<Blob | null>(resolve => canvasRef.current!.toBlob(resolve));
            if (blob) {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                alert('Foto gekopieerd naar klembord!');
            }
        } catch (e) {
            console.error(e);
            alert('Kon foto niet kopiëren');
        }
    };

    const handleDownload = () => {
        if (!canvasRef.current) return;
        const link = document.createElement('a');
        link.download = `Vakantie-${location.name}.png`;
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
                    title: 'Mijn Vakantie Overzicht',
                    text: `Kijk eens naar mijn vakantie in ${location.name}! ${reportData.vibe.text}`,
                    files: [file]
                });
            } else {
                alert("Delen wordt niet ondersteund op dit apparaat.");
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
    
    if (avgTemp > 28 && totalRain < 5) return { text: "Bakoven 🔥", score: 10 };
    if (avgTemp > 22 && totalRain < 10 && sunHours > 50) return { text: "Perfect Zomers 😎", score: 9 };
    if (avgTemp > 18 && totalRain < 20) return { text: "Aangenaam 🌤️", score: 7 };
    if (totalRain > 50) return { text: "Verregend 🌧️", score: 3 };
    if (avgTemp < 5) return { text: "Bibberen 🥶", score: 4 };
    if (avgTemp < 15 && totalRain > 20) return { text: "Wisselvallig 🌦️", score: 5 };
    if (avgTemp > 25 && totalRain > 50) return { text: "Tropisch Vochtig 🌴", score: 6 };
    return { text: "Gemiddeld 🙂", score: 6 };
  };

  const handleGenerate = async () => {
    setError('');
    if (!validateDates()) return;
    
    setLoading(true);
    try {
        const data = await fetchHistoricalRange(location.lat, location.lon, startDate, endDate);
        
        // Process data
        const daily = data.daily;
        const days = daily.time.map((t: string, i: number) => ({
            date: t,
            max: daily.temperature_2m_max[i],
            min: daily.temperature_2m_min[i],
            rain: daily.precipitation_sum[i],
            sun: (daily.sunshine_duration[i] || 0) / 3600,
            code: daily.weather_code[i]
        }));
        
        const maxTemp = Math.max(...days.map((d: any) => d.max));
        const minTemp = Math.min(...days.map((d: any) => d.min));
        const totalRain = days.reduce((a: number, b: any) => a + b.rain, 0);
        const totalSun = days.reduce((a: number, b: any) => a + b.sun, 0);
        const sunlessDays = days.filter((d: any) => d.sun < 1).length;
        const avgTemp = days.reduce((a: number, b: any) => a + b.max, 0) / days.length;
        
        // New stats
        const avgSunPerDay = totalSun / days.length;
        const rainDays = days.filter((d: any) => d.rain >= 0.2).length;
        const lowestMax = Math.min(...days.map((d: any) => d.max));
        const coldestNight = Math.min(...days.map((d: any) => d.min));
        const avgNightTemp = days.reduce((a: number, b: any) => a + b.min, 0) / days.length;

        const vibe = calculateVibe({ avgTemp, totalRain, totalSun });
        
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
                lowestMax,
                coldestNight,
                avgTemp,
                avgNightTemp
            },
            vibe,
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
                                className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors"
                            />
                        </div>
                        
                        {/* Location */}
                        <div className="relative">
                            <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">Locatie</label>
                            <button 
                                onClick={() => setShowSearch(!showSearch)}
                                className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-left flex items-center gap-2"
                            >
                                <Icon name="location_on" className="text-primary" />
                                {location.name}, {location.country}
                            </button>
                            
                            {showSearch && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 z-50 p-2">
                                    <input 
                                        autoFocus
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Zoek stad..."
                                        className="w-full bg-slate-100 dark:bg-black/20 rounded-lg px-3 py-2 mb-2 outline-none"
                                    />
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
                                <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">Start datum</label>
                                <input 
                                    type="date" 
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">Eind datum</label>
                                <input 
                                    type="date" 
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors dark:text-white"
                                />
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
                            {loading ? 'Analyseren...' : 'Genereer Rapport'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-6 animate-in slide-in-from-bottom duration-500">
                    {/* Header Card */}
                    <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-2xl rounded-3xl p-6 shadow-lg border border-slate-200 dark:border-white/10 text-center">
                        <h1 className="text-2xl font-bold mb-1">{title || 'Vakantie Rapport'}</h1>
                        <p className="text-slate-500 dark:text-slate-400">
                            {location.name} • {reportData.period.days} dagen
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                        
                        <div className="my-8 flex flex-col items-center justify-center">
                            <div className="w-40 h-40 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl mb-4 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-white/20 blur-xl group-hover:bg-white/30 transition-colors"></div>
                                <span className="text-6xl relative z-10 drop-shadow-md">
                                    {reportData.vibe.text.split(' ').pop()}
                                </span>
                            </div>
                            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
                                {reportData.vibe.text.replace(/ .*/,'')}
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">Vibe Score: {reportData.vibe.score}/10</p>
                        </div>
                    </div>
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <Icon name="thermostat" className="text-3xl text-red-500" />
                            <span className="text-2xl font-bold">{Math.round(reportData.stats.maxTemp)}°C</span>
                            <span className="text-xs text-slate-500 uppercase tracking-wider text-center">Warmste Dag</span>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <Icon name="ac_unit" className="text-3xl text-blue-500" />
                            <span className="text-2xl font-bold">{Math.round(reportData.stats.coldestNight)}°C</span>
                            <span className="text-xs text-slate-500 uppercase tracking-wider text-center">Koudste Nacht</span>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <Icon name="water_drop" className="text-3xl text-blue-400" />
                            <span className="text-2xl font-bold">{Math.round(reportData.stats.totalRain)}mm</span>
                            <span className="text-xs text-slate-500 uppercase tracking-wider text-center">
                                {reportData.stats.rainDays} regendagen
                            </span>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <Icon name="wb_sunny" className="text-3xl text-orange-500" />
                            <span className="text-2xl font-bold">{Math.round(reportData.stats.avgSunPerDay)}u</span>
                            <span className="text-xs text-slate-500 uppercase tracking-wider text-center">
                                Gem. zon per dag
                            </span>
                        </div>

                        {/* Extended Stats */}
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <span className="text-xl font-bold">{Math.round(reportData.stats.lowestMax)}°C</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center">Laagste Max</span>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <span className="text-xl font-bold">{Math.round(reportData.stats.avgTemp)}°C</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center">Gem. Dag</span>
                        </div>
                        <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <span className="text-xl font-bold">{Math.round(reportData.stats.avgNightTemp)}°C</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center">Gem. Nacht</span>
                        </div>
                         <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                            <span className="text-xl font-bold">{Math.round(reportData.stats.totalSun)}u</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center">Totaal Zon</span>
                        </div>
                    </div>
                    
                    {/* Graph */}
                    <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-white/10 h-80">
                         <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Verloop</h3>
                         <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={reportData.days}>
                                <defs>
                                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                {reportData.days.map((day: any) => {
                                    const d = new Date(day.date);
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
                                        stroke="#94a3b8"
                                        strokeOpacity={tick % 5 === 0 ? 0.3 : 0.1} 
                                        strokeWidth={tick % 5 === 0 ? 2 : 1}
                                    />
                                ))}
                                <XAxis 
                                    dataKey="date" 
                                    tickFormatter={(str) => {
                                        const d = new Date(str);
                                        return `${d.getDate()}/${d.getMonth()+1}`;
                                    }}
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis 
                                    hide={false} 
                                    domain={[yTicks[0], yTicks[yTicks.length - 1]]} 
                                    ticks={yTicks.filter(t => t % 5 === 0)}
                                    tick={{fontSize: 10}} 
                                    width={30} 
                                    tickLine={false} 
                                    axisLine={false} 
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    labelFormatter={(label) => formatDate(label)}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" />
                                <Area name="Max Temp" type="monotone" dataKey="max" stroke="#f59e0b" fillOpacity={1} fill="url(#colorTemp)" strokeWidth={3} />
                                <Area name="Min Temp" type="monotone" dataKey="min" stroke="#3b82f6" fillOpacity={0} strokeWidth={2} strokeDasharray="5 5" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Photo Upload & Overlay */}
                    <div className="bg-white dark:bg-[#1e293b]/90 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-white/10 mb-6">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Deel je ervaring</h3>
                        
                        {!uploadedImage ? (
                            <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-white/20 rounded-xl p-8 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer relative">
                                <input 
                                    type="file" 
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                                <Icon name="add_a_photo" className="text-4xl text-slate-400 mb-2" />
                                <span className="text-sm font-medium text-slate-500">Upload een vakantiefoto</span>
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
                                        <span className="text-xs font-medium">Download</span>
                                    </button>
                                    <button 
                                        onClick={handleShare}
                                        className="flex flex-col items-center justify-center p-3 bg-slate-100 dark:bg-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <Icon name="share" className="text-xl mb-1 text-green-500" />
                                        <span className="text-xs font-medium">Delen</span>
                                    </button>
                                    <button 
                                        onClick={handlePrint}
                                        className="flex flex-col items-center justify-center p-3 bg-slate-100 dark:bg-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        <Icon name="print" className="text-xl mb-1 text-purple-500" />
                                        <span className="text-xs font-medium">Print</span>
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
    </div>
  );
};
