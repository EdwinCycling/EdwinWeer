import React, { useState, useEffect, useRef } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { AppSettings, Location, TempUnit, WindUnit, PrecipUnit } from '../types';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { loadClimateData, saveClimateData } from '../services/storageService';
import { convertTempPrecise, convertWind, convertPrecip, throttledFetch } from '../services/weatherService';
import { getUsage, trackCall, consumeCredit } from '../services/usageService';
import { useThemeColors } from '../hooks/useThemeColors';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

interface ClimateChangeViewProps {
  onNavigate: (view: any) => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
}

interface ClimateData {
    period: string;
    max: number;
    min: number;
    rain: number; // Average monthly total (mm)
    wind: number; // Average daily max wind (km/h)
    sun: number; // Average daily sun (%)
    diffMax: number;
    diffMin: number;
    diffRain: number;
    diffWind: number;
    diffSun: number;
    pctRain?: number;
    pctWind?: number;
    pctSun?: number;
    pctMaxFirst?: number;
    pctMinFirst?: number;
    pctMaxPrev?: number;
    pctMinPrev?: number;
    isForecast?: boolean;
}

const getRainUnitLabel = (unit: PrecipUnit) => unit === PrecipUnit.INCH ? 'inch' : 'mm';
const getWindUnitLabel = (unit: WindUnit) => {
    switch (unit) {
        case WindUnit.BFT: return 'Bft';
        case WindUnit.MS: return 'm/s';
        case WindUnit.MPH: return 'mph';
        case WindUnit.KNOTS: return 'kn';
        default: return 'km/h';
    }
};

export const ClimateChangeView: React.FC<ClimateChangeViewProps> = ({ onNavigate, settings, onUpdateSettings }) => {
  const colors = useThemeColors();
  const [selectedLocation, setSelectedLocation] = useState<Location>(() => {
      // Default to first favorite or a default location
      return settings.favorites.length > 0 ? settings.favorites[0] : {
          name: 'Utrecht', country: 'NL', lat: 52.09, lon: 5.12, isCurrentLocation: false
      };
  });
  
  const [day, setDay] = useState(new Date().getDate());
  const [month, setMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [climateData, setClimateData] = useState<ClimateData[]>([]);
  const [currentNormal, setCurrentNormal] = useState<ClimateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Cache raw data to avoid refetching on every setting change
  const [rawDailyData, setRawDailyData] = useState<any>(null);
  const [lastFetchedLocation, setLastFetchedLocation] = useState<string>('');
  
  const fetchIdRef = useRef<number>(0);

  const t = (key: string) => getTranslation(key, settings.language);

  // Initial Fetch & Refetch on Location Change
  useEffect(() => {
      const locKey = `${selectedLocation.lat}-${selectedLocation.lon}`;
      
      // Check persistent cache first
      const cached = loadClimateData(locKey);
      if (cached) {
          setRawDailyData(cached);
          setLastFetchedLocation(locKey);
          processData(cached);
          setError(null); // Clear any credit error if we have cached data
          return;
      }

      // If not cached, we check credits
      const usage = getUsage();
      if (usage.weatherCredits < 150) {
          setError('Je hebt minimaal 150 weather credits nodig om deze functie te gebruiken.');
          setClimateData([]);
          setRawDailyData(null);
          setCurrentNormal(null);
          return;
      }

      if (rawDailyData && lastFetchedLocation === locKey) {
          // Data already available for this location, just recalc
          processData(rawDailyData);
      } else {
          // Do not auto-fetch. Reset data to indicate need for calculation.
          setClimateData([]);
          setRawDailyData(null);
          setCurrentNormal(null);
      }
  }, [selectedLocation]);

  // Recalculate on Settings/Date Change (without fetch)
  useEffect(() => {
      if (rawDailyData) {
          processData(rawDailyData);
      }
  }, [settings.climatePeriodType, settings.tempUnit, settings.windUnit, settings.precipUnit, day, month]);

  const months = [
      t('tab.month'), // Placeholder or just use index
      "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"
  ];
  
  // Fix for "Mrt" / "May" etc translation if needed, but for now hardcoded or simple array is fine.
  // Better to use a proper date formatter or the array from user input.
  const monthNames = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);

  const calculateClimate = async () => {
      // Increment fetch ID to invalidate previous running fetches
      const currentFetchId = fetchIdRef.current + 1;
      fetchIdRef.current = currentFetchId;
      
      const locKey = `${selectedLocation.lat}-${selectedLocation.lon}`;

      // 1. Check cache first (saving credits/avoiding block)
      const cached = loadClimateData(locKey);
      
      if (cached) {
           setRawDailyData(cached);
           setLastFetchedLocation(locKey);
           processData(cached);
           setError(null);
           // Toast could be added here if we had a toast state accessible, or just rely on UI state
           return;
      }

      // 2. Check credits ONLY if we need to fetch
      const usage = getUsage();
      if (usage.weatherCredits < 150) {
          setError('Je hebt minimaal 150 weather credits nodig om nieuwe klimaatdata op te halen. (Opgeslagen locaties werken wel)');
          return;
      }
      
      // Daily limit check
      const lastUse = localStorage.getItem('climate_change_last_use');
      const today = new Date().toISOString().split('T')[0];

      // If NOT cached, we need to fetch. Check if we already fetched today.
      if (lastUse === today) {
          setError('Je mag deze functie slechts 1x per dag gebruiken (nieuwe data ophalen). Probeer het morgen opnieuw.');
          return;
      }

      setLoading(true);
      setLoadingProgress('Initialiseren...');
      setError(null);
      try {
          // Optimization: Fetch all data in one go (approx 50kb)
          // From 1950 to last year
          const endYear = new Date().getFullYear() - 1;
          const startDate = '1950-01-01';
          const endDate = `${endYear}-12-31`;
          
          setLoadingProgress(`Data ophalen (1950-${endYear})...`);
          
          // Use the exact parameters needed for the view
          const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${selectedLocation.lat}&longitude=${selectedLocation.lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunshine_duration,daylight_duration&timezone=auto`;
          
          let data;
          try {
             data = await throttledFetch(url);
          } catch (e: any) {
             if (e.message && e.message.includes('429')) {
                  setShowLimitModal(true);
                  setLoading(false);
                  return;
             }
             throw e;
          }
          
          if (fetchIdRef.current !== currentFetchId) return;

          // Save to persistent cache
          saveClimateData(locKey, data);
          
          // Mark as used today
          localStorage.setItem('climate_change_last_use', new Date().toISOString().split('T')[0]);

          // Deduct extra credits (9 + 1 from trackCall = 10)
          consumeCredit('weather', 9);
          
          setRawDailyData(data);
          setLastFetchedLocation(locKey);
          processData(data);
      } catch (err) {
          if (fetchIdRef.current !== currentFetchId) return;
          console.error(err);
          setError('Kon klimaatdata niet ophalen. Probeer het later opnieuw.');
      } finally {
          if (fetchIdRef.current === currentFetchId) {
              setLoading(false);
              setLoadingProgress('');
          }
      }
  };

  const processData = (data: any) => {
      if (!data.daily || !data.daily.time) return;

      const daily = data.daily;
      const calculatedPeriods: ClimateData[] = [];

      // Logic: 10-year blocks (Decades) as requested
      const windowSize = 10;
      const endYear = new Date().getFullYear() - 1; 
      
      // Loop backwards from current endYear
      for (let y = endYear; y >= 1950 + (windowSize - 1); y -= 10) { 
          const startBlock = y - (windowSize - 1); 
          const endBlock = y; 
          
          if (startBlock < 1950) break;

          const label = `${startBlock}-${endBlock}`;
          const stats = calculatePeriodStats(daily, startBlock, endBlock, month, day);
          
          if (stats) {
              calculatedPeriods.push({
                  period: label,
                  max: convertTempPrecise(stats.avgMax, settings.tempUnit),
                  min: convertTempPrecise(stats.avgMin, settings.tempUnit),
                  rain: convertPrecip(stats.avgRain, settings.precipUnit),
                  wind: convertWind(stats.avgWind, settings.windUnit),
                  sun: stats.avgSun,
                  diffMax: 0,
                  diffMin: 0,
                  diffRain: 0,
                  diffWind: 0,
                  diffSun: 0
              });
          }
      }

      // Calculate Diffs
      if (calculatedPeriods.length > 0) {
          const oldest = calculatedPeriods[calculatedPeriods.length - 1];
          calculatedPeriods.forEach((p, index) => {
              // Temp: Absolute Diff (vs oldest)
              p.diffMax = parseFloat((p.max - oldest.max).toFixed(1));
              p.diffMin = parseFloat((p.min - oldest.min).toFixed(1));
              
              // Absolute diffs
              p.diffRain = parseFloat((p.rain - oldest.rain).toFixed(1));
              p.diffWind = parseFloat((p.wind - oldest.wind).toFixed(1));
              p.diffSun = parseFloat((p.sun - oldest.sun).toFixed(1));

              // Calculate percentages for Rain/Wind (vs oldest)
              if (oldest.rain > 0.1) {
                  p.pctRain = Math.round(((p.rain - oldest.rain) / oldest.rain) * 100);
              } else {
                  p.pctRain = p.rain > 0.1 ? 100 : 0;
              }

              if (oldest.wind > 0.1) {
                  p.pctWind = Math.round(((p.wind - oldest.wind) / oldest.wind) * 100);
              } else {
                  p.pctWind = 0;
              }

              if (oldest.sun > 0.1) {
                  p.pctSun = Math.round(((p.sun - oldest.sun) / oldest.sun) * 100);
              } else {
                  p.pctSun = 0;
              }

              // New: % vs First (Oldest)
              p.pctMaxFirst = oldest.max !== 0 ? Math.round(((p.max - oldest.max) / Math.abs(oldest.max)) * 100) : 0;
              p.pctMinFirst = oldest.min !== 0 ? Math.round(((p.min - oldest.min) / Math.abs(oldest.min)) * 100) : 0;

              // New: % vs Previous (Chronologically earlier -> index + 1)
              const prev = calculatedPeriods[index + 1];
              if (prev) {
                   p.pctMaxPrev = prev.max !== 0 ? Math.round(((p.max - prev.max) / Math.abs(prev.max)) * 100) : 0;
                   p.pctMinPrev = prev.min !== 0 ? Math.round(((p.min - prev.min) / Math.abs(prev.min)) * 100) : 0;
              } else {
                   // Oldest element
                   p.pctMaxPrev = 0;
                   p.pctMinPrev = 0;
              }
          });
      }
      
      // PREDICTION LOGIC (Only if we have enough data points)
      if (calculatedPeriods.length >= 3) {
          // Linear Regression on Max Temp
          // We use the index as x (0, 1, 2...) but reversed because calculatedPeriods is newest first.
          // Let's sort chronologically for calculation
          const chronological = [...calculatedPeriods].reverse();
          const n = chronological.length;
          
          let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
          
          chronological.forEach((p, i) => {
              sumX += i;
              sumY += p.max;
              sumXY += i * p.max;
              sumXX += i * i;
          });
          
          const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
          const intercept = (sumY - slope * sumX) / n;
          
          // Predict next period (index = n)
          const nextMax = intercept + slope * n;
          const nextDiffMax = nextMax - chronological[0].max; // vs oldest
          
          // Simple heuristic for other vars (can be refined)
          const nextMin = chronological[n-1].min + (slope * 0.8); // Min usually rises slower/faster? assume correlated.
          
          // Create Prediction Label
          // 1994-2023 -> next is 2004-2033
          const lastParts = chronological[n-1].period.split('-');
          const nextStart = parseInt(lastParts[0]) + 10;
          const nextEnd = parseInt(lastParts[1]) + 10;
          const predLabel = `${nextStart}-${nextEnd}`;

          const prediction: ClimateData = {
              period: predLabel,
              max: parseFloat(nextMax.toFixed(1)),
              min: parseFloat(nextMin.toFixed(1)),
              rain: chronological[n-1].rain, // No trend for now
              wind: chronological[n-1].wind,
              sun: chronological[n-1].sun,
              diffMax: parseFloat(nextDiffMax.toFixed(1)),
              diffMin: parseFloat((nextMin - chronological[0].min).toFixed(1)), // vs oldest
              diffRain: 0,
              diffWind: 0,
              diffSun: 0,
              pctRain: 0,
              pctWind: 0,
              pctSun: 0,
              pctMaxFirst: chronological[0].max !== 0 ? Math.round(((nextMax - chronological[0].max) / Math.abs(chronological[0].max)) * 100) : 0,
              pctMinFirst: chronological[0].min !== 0 ? Math.round(((nextMin - chronological[0].min) / Math.abs(chronological[0].min)) * 100) : 0,
              pctMaxPrev: chronological[n-1].max !== 0 ? Math.round(((nextMax - chronological[n-1].max) / Math.abs(chronological[n-1].max)) * 100) : 0,
              pctMinPrev: chronological[n-1].min !== 0 ? Math.round(((nextMin - chronological[n-1].min) / Math.abs(chronological[n-1].min)) * 100) : 0,
              isForecast: true
          };
          
          // Add prediction to the beginning (since we display newest first)
          calculatedPeriods.unshift(prediction);
      }

      setClimateData(calculatedPeriods);
      // Current normal is the first REAL period (not forecast)
      const current = calculatedPeriods.find(p => !p.isForecast);
      if (current) {
          setCurrentNormal(current);
      }
  };

  const calculatePeriodStats = (daily: any, startYear: number, endYear: number, targetMonth: number, targetDay: number) => {
      let sumMax = 0, sumMin = 0, count = 0;
      let totalRain = 0, countRainYears = 0;
      let totalWind = 0, countWind = 0;
      let totalSunPct = 0, countSun = 0;

      const dates = daily.time as string[];
      const maxs = daily.temperature_2m_max as number[];
      const mins = daily.temperature_2m_min as number[];
      
      // Additional arrays for other stats
      const precip = daily.precipitation_sum as number[];
      const winds = daily.wind_speed_10m_max as number[];
      const suns = daily.sunshine_duration as number[];
      const daylights = daily.daylight_duration as number[];

      dates.forEach((dateStr, i) => {
          const year = parseInt(dateStr.split('-')[0]);
          
          // Check if year is in block
          if (year >= startYear && year <= endYear) {
              const d = new Date(dateStr);
              // Temp: 7-day window (3 days before, target, 3 days after)
              // We create a checkDate for the target day in THIS year
              const checkDate = new Date(year, targetMonth - 1, targetDay);
              
              const diffTime = Math.abs(d.getTime() - checkDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

              if (diffDays <= 3) {
                  if (maxs[i] !== null && mins[i] !== null) {
                      sumMax += maxs[i];
                      sumMin += mins[i];
                      count++;
                  }
              }

              // Rain/Wind/Sun: Keep existing logic (Entire Month)
              // This provides better stats for "Month" context, but maybe we should align?
              // User instruction was specific about Temp. 
              // To match "climate of the day", month stats are still useful context.
              const month = parseInt(dateStr.split('-')[1]);
              if (month === targetMonth) {
                  // Rain
                  if (precip && precip[i] !== null) {
                       totalRain += precip[i];
                       // We count years, so we need to track this differently?
                       // Current logic accumulates ALL rain in the month for ALL years
                       // then divides by (years * 1) ? No, we want Average Monthly Rain.
                       // So sum all rain, divide by number of years.
                  }
                  
                  // Wind
                  if (winds && winds[i] !== null) {
                      totalWind += winds[i];
                      countWind++;
                  }

                  // Sun
                  if (suns && suns[i] !== null && daylights && daylights[i] !== null && daylights[i] > 0) {
                      const pct = (suns[i] / daylights[i]) * 100;
                      totalSunPct += pct;
                      countSun++;
                  }
              }
          }
      });
      
      // Calculate number of years in the block for Rain average
      const numberOfYears = endYear - startYear + 1;

      if (count === 0) return null;

      return {
          avgMax: parseFloat((sumMax / count).toFixed(1)),
          avgMin: parseFloat((sumMin / count).toFixed(1)),
          // Total rain in all months / number of years = Average Monthly Rain
          avgRain: parseFloat((totalRain / numberOfYears).toFixed(1)), 
          avgWind: countWind > 0 ? parseFloat((totalWind / countWind).toFixed(1)) : 0,
          avgSun: countSun > 0 ? parseFloat((totalSunPct / countSun).toFixed(0)) : 0
      };
  };

  // Search handler
  const handleSearch = async (query: string) => {
      setSearchQuery(query);
      if (query.length < 3) {
          setSearchResults([]);
          return;
      }

      setIsSearching(true);
      try {
          const results = await searchCityByName(query);
          setSearchResults(results);
      } catch (error) {
          console.error('Search failed', error);
      } finally {
          setIsSearching(false);
      }
  };

  const selectLocation = (loc: Location) => {
      setSelectedLocation(loc);
      setSearchQuery('');
      setSearchResults([]);
      // Reset data
      setClimateData([]);
      setCurrentNormal(null);
  };

  // Calculate Trend Line Helper
  const calculateTrendLine = (values: number[]) => {
      const n = values.length;
      if (n < 2) return Array(n).fill(null);

      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      values.forEach((y, x) => {
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumXX += x * x;
      });

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      return values.map((_, x) => slope * x + intercept);
  };

  // Chart data
  const chartData = {
      labels: climateData.map(d => d.period).reverse(),
      datasets: [
          {
              label: t('climate.max'),
              data: climateData.map(d => d.max).reverse(),
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.5)',
              tension: 0.4,
              segment: {
                borderDash: (ctx: any) => {
                    return ctx.p0DataIndex === climateData.length - 2 ? [6, 6] : undefined;
                }
              }
          },
          {
              label: t('climate.min'),
              data: climateData.map(d => d.min).reverse(),
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.5)',
              tension: 0.4,
              segment: {
                borderDash: (ctx: any) => {
                    return ctx.p0DataIndex === climateData.length - 2 ? [6, 6] : undefined;
                }
              }
          },
          // Trend Lines
          {
              label: 'Trend (Max)',
              data: calculateTrendLine(climateData.map(d => d.max).reverse()),
              borderColor: '#ef4444',
              borderWidth: 1,
              borderDash: [4, 4],
              pointRadius: 0,
              fill: false,
              tension: 0
          }
      ]
  };

  const chartOptions = {
      responsive: true,
      plugins: {
          legend: {
              position: 'top' as const,
              labels: {
                  color: colors.textMain
              }
          },
          title: {
              display: true,
              text: t('climate.chart_title'),
              color: colors.textMain
          }
      },
      scales: {
          y: {
              ticks: { color: colors.textMuted },
              grid: { color: colors.borderColor }
          },
          x: {
              ticks: { color: colors.textMuted },
              grid: { color: colors.borderColor }
          }
      }
  };

  const rainChartData = {
      labels: climateData.map(d => d.period).reverse(),
      datasets: [
        {
          label: t('climate.rain'),
          data: climateData.map(d => d.rain).reverse(),
          backgroundColor: '#3b82f6',
          borderRadius: 4,
          order: 2
        },
        {
            label: 'Trend',
            data: calculateTrendLine(climateData.map(d => d.rain).reverse()),
            borderColor: '#2563eb', // Darker blue
            borderWidth: 2,
            type: 'line' as const,
            pointRadius: 0,
            tension: 0,
            order: 1
        }
      ]
  };

  const otherChartData = {
      labels: climateData.map(d => d.period).reverse(),
      datasets: [
          {
              label: t('climate.wind'),
              data: climateData.map(d => d.wind).reverse(),
              borderColor: '#94a3b8',
              backgroundColor: 'rgba(148, 163, 184, 0.5)',
              tension: 0.4,
              yAxisID: 'y'
          },
          {
              label: t('climate.sun'),
              data: climateData.map(d => d.sun).reverse(),
              borderColor: '#fbbf24',
              backgroundColor: 'rgba(251, 191, 36, 0.5)',
              tension: 0.4,
              yAxisID: 'y1'
          }
      ]
  };

  const rainChartOptions = {
      ...chartOptions,
      plugins: {
          ...chartOptions.plugins,
          title: { ...chartOptions.plugins.title, text: t('climate.rain_title') }
      }
  };

  const otherChartOptions = {
      ...chartOptions,
      plugins: {
          ...chartOptions.plugins,
          title: { ...chartOptions.plugins.title, text: t('climate.wind_sun_title') }
      },
      scales: {
          x: chartOptions.scales.x,
          y: { 
              ...chartOptions.scales.y, 
              position: 'left' as const,
              title: { display: true, text: t('climate.wind') }
          },
          y1: { 
              ...chartOptions.scales.y, 
              position: 'right' as const, 
              grid: { drawOnChartArea: false },
              title: { display: true, text: t('climate.sun') }
          }
      }
  };



  return (
    <div className="w-full min-h-screen pb-20 bg-bg-page text-text-main">
      {/* Header */}
      <div className="bg-bg-card rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('CURRENT')} className="p-2 hover:bg-bg-page rounded-full transition-colors">
                <Icon name="arrow_back" className="text-xl text-text-muted" />
            </button>
            <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                    <Icon name="thermostat" className="text-orange-500" />
                    {t('climate.title')}
                </h1>
                <p className="text-xs text-text-muted">{t('climate.subtitle')}</p>
            </div>
        </div>
        
        <div className="flex-1 min-w-[200px] relative">
             <div className="flex items-center bg-bg-page rounded-xl px-3 py-2 border border-transparent focus-within:border-blue-500 transition-colors">
                <Icon name="search" className="text-text-muted mr-2" />
                <input
                    type="text"
                    value={searchQuery}
                    onFocus={() => setShowFavorites(true)}
                    onBlur={() => setTimeout(() => setShowFavorites(false), 200)}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder={t('search')}
                    className="bg-transparent border-none outline-none w-full text-sm placeholder:text-text-muted text-text-main"
                />
            </div>
            
            {/* Search Results & Favorites Dropdown */}
            {(searchResults.length > 0 || (showFavorites && settings.favorites.length > 0)) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-bg-card rounded-xl shadow-xl border border-border-color z-50 overflow-hidden max-h-60 overflow-y-auto">
                    {/* Favorites Section */}
                    {showFavorites && searchQuery.length === 0 && settings.favorites.length > 0 && (
                        <>
                            <div className="px-4 py-2 text-xs font-bold text-text-muted uppercase tracking-wider bg-bg-page">
                                {t('nav.favorites') || 'Favorieten'}
                            </div>
                            {settings.favorites.map((loc, idx) => (
                                <button
                                    key={`fav-${loc.lat}-${loc.lon}-${idx}`}
                                    onClick={() => selectLocation(loc)}
                                    className="w-full text-left px-4 py-3 hover:bg-bg-page flex items-center justify-between border-b border-border-color last:border-0 text-text-main"
                                >
                                    <span className="font-medium">{loc.name}, {loc.country}</span>
                                    <Icon name="star" className="text-xs text-yellow-400" />
                                </button>
                            ))}
                        </>
                    )}

                    {searchResults.map((loc, idx) => (
                        <button
                            key={`${loc.lat}-${loc.lon}-${idx}`}
                            onClick={() => selectLocation(loc)}
                            className="w-full text-left px-4 py-3 hover:bg-bg-page flex items-center justify-between border-b border-border-color last:border-0 text-text-main"
                        >
                            <span className="font-medium">{loc.name}, {loc.country}</span>
                            {loc.isCurrentLocation && <Icon name="my_location" className="text-xs text-blue-500" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
      </div>

      {/* Rate Limit Modal */}
      <Modal
          isOpen={showLimitModal}
          onClose={() => setShowLimitModal(false)}
          title={t('error.too_many_requests') || "Even geduld a.u.b."}
      >
          <div className="flex flex-col items-center gap-4 text-center">
              <div className="bg-orange-100 dark:bg-orange-900/30 p-4 rounded-full">
                  <Icon name="timer" className="text-3xl text-orange-500" />
              </div>
              <div>
                  <h3 className="text-lg font-bold mb-2">{t('error.too_many_requests') || "Het is momenteel erg druk"}</h3>
                  <p className="text-slate-600 dark:text-slate-300">
                      {t('error.too_many_requests.desc') || "We hebben het maximum aantal verzoeken voor historische data bereikt. Probeer het over een paar minuten nog eens."}
                  </p>
              </div>
              <button
                  onClick={() => setShowLimitModal(false)}
                  className="mt-2 px-6 py-2 bg-primary text-white rounded-full font-bold hover:opacity-90 transition-opacity"
              >
                  Begrepen
              </button>
          </div>
      </Modal>

      {/* Loading Progress Modal */}
      <Modal
          isOpen={loading}
          onClose={() => {}} // Prevent closing by user easily, or allow it but keep state? Better to keep it open.
          title="Gegevens ophalen"
      >
          <div className="flex flex-col items-center gap-6 text-center py-4">
              <div className="relative">
                  <div className="size-16 border-4 border-blue-100 dark:border-blue-900 rounded-full animate-spin border-t-blue-500"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                      <Icon name="hourglass_empty" className="text-2xl text-blue-500 animate-pulse" />
                  </div>
              </div>
              
              <div>
                  <h3 className="text-lg font-bold mb-2">Even geduld...</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-4">
                      We halen de historische weergegevens op in kleine blokken om de server niet te belasten.
                  </p>
                  <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-lg inline-block">
                      <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                          {loadingProgress}
                      </span>
                  </div>
              </div>
          </div>
      </Modal>

      <div className="max-w-3xl mx-auto space-y-6">
          {/* Location & Controls */}
          <div className="bg-white dark:bg-card-dark rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-white/5">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                  <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-500">
                          <Icon name="location_on" />
                      </div>
                      <div>
                          <h2 className="text-2xl font-bold">{selectedLocation.name}</h2>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{selectedLocation.country}</p>
                      </div>
                  </div>
                  
                  <div className="flex flex-col gap-3 items-end w-full md:w-auto">

                      <div className="flex flex-wrap items-center gap-2 bg-bg-page p-2 rounded-2xl w-full md:w-auto justify-end">
                          <select 
                            value={day} 
                            onChange={(e) => setDay(Number(e.target.value))}
                            className="bg-bg-card text-text-main font-medium p-2 outline-none text-center cursor-pointer hover:bg-bg-subtle rounded-xl transition-colors border border-border-color"
                          >
                              {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                                  <option key={d} value={d} className="bg-bg-card text-text-main">{d}</option>
                              ))}
                          </select>
                          <span className="text-text-muted">|</span>
                          <select 
                            value={month} 
                            onChange={(e) => setMonth(Number(e.target.value))}
                            className="bg-bg-card text-text-main font-medium p-2 outline-none text-center cursor-pointer hover:bg-bg-subtle rounded-xl transition-colors border border-border-color"
                          >
                              {monthNames.map((m, i) => (
                                  <option key={m} value={i + 1} className="bg-bg-card text-text-main">{m}</option>
                              ))}
                          </select>
                          <button 
                            onClick={calculateClimate}
                            disabled={loading}
                            className="ml-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                              <Icon name="calculate" />
                              {t('climate.calc')}
                          </button>
                      </div>
                  </div>
              </div>

              {error && (
                  <div className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-xl mb-4 text-sm flex items-center gap-2">
                      <Icon name="error" />
                      {error}
                  </div>
              )}

              {/* Hero Card: Current Normal */}
              {currentNormal && (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-lg shadow-orange-500/20 p-6 md:p-8 text-center mb-8">
                      <div className="relative z-10">
                          <h3 className="text-xl md:text-2xl font-bold mb-1 opacity-90">{t('climate.hero_title')}</h3>
                          <p className="text-sm font-medium opacity-75 mb-6">{currentNormal.period}</p>
                          
                          <div className="flex justify-center gap-8 md:gap-16">
                              <div className="text-center">
                                  <span className="block text-xs uppercase tracking-wider opacity-70 mb-1">{t('climate.max')}</span>
                                  <span className="text-4xl md:text-5xl font-bold tracking-tight">{currentNormal.max}°</span>
                              </div>
                              <div className="w-px bg-white/20"></div>
                              <div className="text-center">
                                  <span className="block text-xs uppercase tracking-wider opacity-70 mb-1">{t('climate.min')}</span>
                                  <span className="text-4xl md:text-5xl font-bold tracking-tight">{currentNormal.min}°</span>
                              </div>
                          </div>
                          
                          <div className="mt-6 pt-6 border-t border-white/10 text-xs md:text-sm opacity-70 flex items-center justify-center gap-2">
                              <Icon name="info" className="text-base" />
                              {t('climate.info')}
                          </div>
                      </div>
                      
                      {/* Decorative circles */}
                      <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                      <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-black/10 rounded-full blur-2xl"></div>
                  </div>
              )}
          </div>

          {/* Data Content */}
          {climateData.length > 0 && (
              <>
                {/* Temp Chart */}
                <div className="bg-bg-card rounded-3xl p-6 shadow-sm border border-border-color mb-6">
                    <Line data={chartData} options={chartOptions} />
                </div>

                {/* Rain Chart */}
                <div className="bg-bg-card rounded-3xl p-6 shadow-sm border border-border-color mb-6">
                    <Bar data={rainChartData} options={rainChartOptions} />
                </div>

                {/* Wind/Sun Chart */}
                <div className="bg-bg-card rounded-3xl p-6 shadow-sm border border-border-color mb-6">
                    <Line data={otherChartData} options={otherChartOptions} />
                </div>



                {/* Table */}
                <div className="bg-bg-card rounded-3xl overflow-hidden shadow-sm border border-border-color">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-bg-page border-b border-border-color">
                                <tr>

                                    <th className="p-4 font-semibold text-text-muted">
                                        {`${t('climate.period')} (10 jaar)`}
                                    </th>
                                    <th className="p-4 font-semibold text-text-muted">{t('climate.max')}</th>
                                    <th className="p-4 font-semibold text-text-muted">{t('climate.min')}</th>
                                    <th className="p-4 font-semibold text-text-muted">{t('climate.rain')}</th>
                                    <th className="p-4 font-semibold text-text-muted">{t('climate.wind')}</th>
                                    <th className="p-4 font-semibold text-text-muted">{t('climate.sun')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-color">
                                {climateData.map((row, i) => {
                                    const oldestYear = climateData[climateData.length - 1]?.period.split('-')[0];
                                    const isLast = i === climateData.length - 1;
                                    return (
                                    <tr key={row.period} className={`hover:bg-bg-page transition-colors text-text-main ${row.isForecast ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`}>
                                        <td className="p-4 font-medium">
                                            {row.period}
                                            {row.isForecast && (
                                                <span className="block text-[10px] uppercase tracking-wider text-blue-500 font-bold mt-1">
                                                    {t('climate.forecast')}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-orange-500 font-bold">
                                            {typeof row.max === 'number' ? row.max.toFixed(1) : row.max}°
                                            {row.isForecast && (
                                               <span className="block text-[10px] text-orange-400 font-normal">
                                                  +{row.diffMax}°
                                               </span>
                                            )}
                                            {!isLast && (
                                                <div className="mt-1 flex flex-col gap-0.5">
                                                    <span className="text-[9px] text-text-muted font-normal whitespace-nowrap">
                                                        {row.pctMaxFirst && row.pctMaxFirst > 0 ? '+' : ''}{row.pctMaxFirst || 0}% vs {oldestYear}
                                                    </span>
                                                    {i < climateData.length - 1 && (
                                                        <span className="text-[9px] text-text-muted font-normal whitespace-nowrap">
                                                            {row.pctMaxPrev && row.pctMaxPrev > 0 ? '+' : ''}{row.pctMaxPrev || 0}% vs vorig
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 text-blue-500 font-bold">
                                        {typeof row.min === 'number' ? row.min.toFixed(1) : row.min}°
                                        {row.isForecast && (
                                           <span className="block text-[10px] text-blue-400 font-normal">
                                              {row.diffMin > 0 ? '+' : ''}{row.diffMin}°
                                           </span>
                                        )}
                                        {!isLast && (
                                            <div className="mt-1 flex flex-col gap-0.5">
                                                <span className="text-[9px] text-text-muted font-normal whitespace-nowrap">
                                                    {row.pctMinFirst && row.pctMinFirst > 0 ? '+' : ''}{row.pctMinFirst || 0}% vs {oldestYear}
                                                </span>
                                                {i < climateData.length - 1 && (
                                                    <span className="text-[9px] text-text-muted font-normal whitespace-nowrap">
                                                        {row.pctMinPrev && row.pctMinPrev > 0 ? '+' : ''}{row.pctMinPrev || 0}% vs vorig
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 text-blue-400 font-bold">
                                        {row.rain}<span className="text-xs font-normal text-text-muted ml-0.5">{getRainUnitLabel(settings.precipUnit)}</span>
                                        {row.isForecast ? (
                                           <span className="block text-[10px] text-blue-300 font-normal">
                                              {row.diffRain > 0 ? '+' : ''}{row.diffRain}
                                           </span>
                                        ) : (
                                            <span className={`block text-[10px] font-normal ${row.pctRain && row.pctRain > 0 ? 'text-blue-500' : 'text-text-muted'}`}>
                                               {row.pctRain && row.pctRain > 0 ? '+' : ''}{row.pctRain || 0}% <span className="text-[9px] opacity-70">(vs {oldestYear})</span>
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-text-muted font-bold">
                                        {row.wind}<span className="text-xs font-normal text-text-muted ml-0.5">{getWindUnitLabel(settings.windUnit)}</span>
                                        {row.isForecast ? (
                                           <span className="block text-[10px] text-text-muted font-normal">
                                              {row.diffWind > 0 ? '+' : ''}{row.diffWind}
                                           </span>
                                        ) : (
                                            <span className={`block text-[10px] font-normal ${row.pctWind && row.pctWind > 0 ? 'text-text-muted' : 'text-text-muted'}`}>
                                               {row.pctWind && row.pctWind > 0 ? '+' : ''}{row.pctWind || 0}% <span className="text-[9px] opacity-70">(vs {oldestYear})</span>
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-yellow-500 font-bold">
                                        {row.sun}%
                                        {row.isForecast ? (
                                           <span className="block text-[10px] text-yellow-600 dark:text-yellow-400 font-normal">
                                              {row.diffSun > 0 ? '+' : ''}{row.diffSun}%
                                           </span>
                                        ) : (
                                            <span className={`block text-[10px] font-normal ${row.pctSun && row.pctSun > 0 ? 'text-yellow-600' : 'text-text-muted'}`}>
                                               {row.pctSun && row.pctSun > 0 ? '+' : ''}{row.pctSun || 0}% <span className="text-[9px] opacity-70">(vs {oldestYear})</span>
                                            </span>
                                        )}
                                    </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                </div>

              </>
          )}
      </div>
    </div>
  );
};
