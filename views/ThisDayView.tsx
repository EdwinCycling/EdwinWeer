import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { AppSettings, Location, TempUnit, WindUnit, PrecipUnit, ViewState } from '../types';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { ThisDayHistoryTable } from '../components/ThisDayHistoryTable';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { loadClimateData, saveClimateData } from '../services/storageService';
import { convertTempPrecise, convertWind, convertPrecip, throttledFetch } from '../services/weatherService';
import { getUsage, trackCall } from '../services/usageService';
import { useThemeColors } from '../hooks/useThemeColors';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

interface ThisDayViewProps {
  onNavigate: (view: any) => void;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
}

interface YearStats {
    year: number;
    max: number;
    min: number;
    rain: number;
    gust: number;
    windSpeed: number;
}

interface TopStats {
    warmestMax: YearStats[];
    coldestMax: YearStats[];
    coldestMin: YearStats[];
    warmestMin: YearStats[];
    wettest: YearStats[];
    windiest: YearStats[];
}

export const ThisDayView: React.FC<ThisDayViewProps> = ({ onNavigate, settings, onUpdateSettings }) => {
  const colors = useThemeColors();
  const [selectedLocation, setSelectedLocation] = useState<Location>(() => {
      return settings.favorites.length > 0 ? settings.favorites[0] : {
          name: 'Utrecht', country: 'NL', lat: 52.09, lon: 5.12, isCurrentLocation: false
      };
  });
  
  const [day, setDay] = useState(new Date().getDate());
  const [month, setMonth] = useState(new Date().getMonth() + 1); // 1-12
  
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const [yearData, setYearData] = useState<YearStats[]>([]);
  const [topStats, setTopStats] = useState<TopStats | null>(null);
  
  const [rawDailyData, setRawDailyData] = useState<any>(null);
  const [lastFetchedLocation, setLastFetchedLocation] = useState<string>('');
  
  // Chart View State
  const [chartView, setChartView] = useState<'all' | 'paged'>('paged');
  const [pageIndex, setPageIndex] = useState(0);
  
  const fetchIdRef = useRef<number>(0);

  const t = (key: string) => getTranslation(key, settings.language);

  const months = [
      t('tab.month'), 
      "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"
  ];
  
  // Use a map for full names for the title
  const monthNamesFull = [
      "", "Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"
  ];

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showHistoryTable, setShowHistoryTable] = useState(false);
  const [selectedRange, setSelectedRange] = useState<'all' | number | string>('all');

  // Generate decades
  const decades = useMemo(() => {
      const currentYear = new Date().getFullYear();
      const startYear = 1950;
      const decadeList: number[] = [];
      for (let y = startYear; y < currentYear; y += 10) {
          decadeList.push(y);
      }
      return decadeList.reverse(); // Newest decades first
  }, []);

  // Initial Fetch Check (reuse cache logic from ClimateChangeView)
  useEffect(() => {
      const locKey = `${selectedLocation.lat}-${selectedLocation.lon}-history`;
      const cached = loadClimateData(locKey);
      if (cached) {
          setRawDailyData(cached);
          setLastFetchedLocation(locKey);
          // Do NOT auto process here, wait for user to click calculate or if they want to see prev results?
          // User said "Daronder als bereken knop is ingedrukt halen we ... data op".
          // So maybe wait for button press. But if data is there, we could show it?
          // Let's stick to "Calculate" button trigger for clarity, or auto-calc if data is present to be nice.
          // I will auto-calc if data is present to match ClimateChangeView behavior which feels smoother.
          processData(cached); 
          return;
      }

      if (rawDailyData && lastFetchedLocation === locKey) {
          processData(rawDailyData);
      } else {
          setYearData([]);
          setTopStats(null);
          setRawDailyData(null);
      }
  }, [selectedLocation]);

  const calculateStats = async () => {
      const currentFetchId = fetchIdRef.current + 1;
      fetchIdRef.current = currentFetchId;
      
      const locKey = `${selectedLocation.lat}-${selectedLocation.lon}-history`;

      // 1. Check cache first
      const cached = loadClimateData(locKey);
      
      // Check if cached data has wind speed (new requirement), if not, re-fetch
      if (cached && cached.daily && cached.daily.wind_speed_10m_max) {
           setRawDailyData(cached);
           setLastFetchedLocation(locKey);
           processData(cached);
           setError(null);
           return;
      }

      // 2. Check credits ONLY if we need to fetch
      const usage = getUsage();
      if (usage.weatherCredits < 150) {
        setError('Je hebt minimaal 150 weather credits nodig om deze functie te gebruiken.');
        return;
      }
      
      // Daily limit check
      const lastUse = localStorage.getItem('this_day_last_use');
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
          const endYear = new Date().getFullYear() - 1;
          const startDate = '1950-01-01';
          const endDate = `${endYear}-12-31`;
          
          setLoadingProgress(`Data ophalen (1950-${endYear})...`);
          
          // Added wind_gusts_10m_max and wind_speed_10m_max
          const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${selectedLocation.lat}&longitude=${selectedLocation.lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max&timezone=auto`;
          
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
          
          saveClimateData(locKey, data);
          
          // Mark as used today
          localStorage.setItem('this_day_last_use', new Date().toISOString().split('T')[0]);
          
          setRawDailyData(data);
          setLastFetchedLocation(locKey);
          processData(data);
      } catch (err) {
          if (fetchIdRef.current !== currentFetchId) return;
          console.error(err);
          setError(t('history.fetch_error'));
      } finally {
          if (fetchIdRef.current === currentFetchId) {
              setLoading(false);
              setLoadingProgress('');
          }
      }
  };

  const processData = (data: any) => {
      if (!data.daily || !data.daily.time) return;

      const dates = data.daily.time as string[];
      const maxs = data.daily.temperature_2m_max as number[];
      const mins = data.daily.temperature_2m_min as number[];
      const precips = data.daily.precipitation_sum as number[];
      const gusts = data.daily.wind_gusts_10m_max as number[];
      const windSpeeds = data.daily.wind_speed_10m_max as number[];

      const yearsFound: YearStats[] = [];

      dates.forEach((dateStr, i) => {
          const d = new Date(dateStr);
          // Check if day and month match
          if (d.getDate() === day && (d.getMonth() + 1) === month) {
              if (maxs[i] !== null && mins[i] !== null) {
                  yearsFound.push({
                      year: d.getFullYear(),
                      max: maxs[i],
                      min: mins[i],
                      rain: precips ? precips[i] || 0 : 0,
                      gust: gusts ? gusts[i] || 0 : 0,
                      windSpeed: windSpeeds ? windSpeeds[i] || 0 : 0
                  });
              }
          }
      });

      // Filter based on selected range
      let filteredYears = yearsFound;
      const currentYear = new Date().getFullYear();
      
      if (selectedRange !== 'all') {
          if (typeof selectedRange === 'number') {
              const minYear = currentYear - selectedRange;
              filteredYears = yearsFound.filter(y => y.year >= minYear);
          } else if (typeof selectedRange === 'string' && selectedRange.startsWith('decade-')) {
              const startDecade = parseInt(selectedRange.split('-')[1]);
              filteredYears = yearsFound.filter(y => y.year >= startDecade && y.year < startDecade + 10);
          }
      }

      // Sort by year for chart
      filteredYears.sort((a, b) => a.year - b.year);
      setYearData(filteredYears);

      // Calculate Top 3s
      if (filteredYears.length > 0) {
          const sortedMax = [...filteredYears].sort((a, b) => b.max - a.max);
          const sortedMinMax = [...filteredYears].sort((a, b) => a.max - b.max);
          const sortedMin = [...filteredYears].sort((a, b) => a.min - b.min);
          const sortedMaxMin = [...filteredYears].sort((a, b) => b.min - a.min);
          const sortedRain = [...filteredYears].sort((a, b) => b.rain - a.rain);
          const sortedWind = [...filteredYears].sort((a, b) => b.gust - a.gust);

          setTopStats({
              warmestMax: sortedMax.slice(0, 3),
              coldestMax: sortedMinMax.slice(0, 3),
              coldestMin: sortedMin.slice(0, 3),
              warmestMin: sortedMaxMin.slice(0, 3),
              wettest: sortedRain.slice(0, 3),
              windiest: sortedWind.slice(0, 3)
          });
      } else {
          setTopStats(null);
      }
  };

  // Re-process when range changes
  useEffect(() => {
    if (rawDailyData) {
        processData(rawDailyData);
    }
  }, [selectedRange]);

  const handleSearch = async (query: string) => {
      setSearchQuery(query);
      if (query.length < 3) {
          setSearchResults([]);
          return;
      }
      setIsSearching(true);
      try {
          const results = await searchCityByName(query, settings.language);
          setSearchResults(results);
      } catch (error) {
          console.error('Search failed', error);
      } finally {
          setIsSearching(false);
      }
  };

  const selectLocation = (loc: Location) => {
      setSelectedLocation(loc);
      setSearchQuery(`${loc.name}, ${loc.country}`);
      setSearchResults([]);
      setYearData([]);
      setTopStats(null);
  };

  // Chart
  const currentYear = new Date().getFullYear();
  const filteredYearData = React.useMemo(() => {
      if (chartView === 'all') return yearData;
      
      const endYear = currentYear - (pageIndex * 10);
      const startYear = endYear - 9;
      
      return yearData.filter(d => d.year >= startYear && d.year <= endYear);
  }, [yearData, chartView, pageIndex]);

  const chartData = {
      labels: filteredYearData.map(d => d.year),
      datasets: [
          {
              label: t('climate.max'),
              data: filteredYearData.map(d => convertTempPrecise(d.max, settings.tempUnit)),
              backgroundColor: '#ef4444',
              borderRadius: 2,
          },
          {
              label: t('climate.min'),
              data: filteredYearData.map(d => convertTempPrecise(d.min, settings.tempUnit)),
              backgroundColor: '#3b82f6',
              borderRadius: 2,
          }
      ]
  };

  const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
          legend: {
              position: 'top' as const,
              labels: { color: colors.textMain }
          },
          title: {
              display: false,
          },
          tooltip: {
              mode: 'index' as const,
              intersect: false,
              backgroundColor: colors.bgCard,
              titleColor: colors.textMain,
              bodyColor: colors.textMain,
              borderColor: colors.borderColor,
              borderWidth: 1
          }
      },
      animation: {
        onComplete: (animation: any) => {
            const chart = animation.chart;
            const ctx = chart.ctx;
            const datasetMax = chart.data.datasets[0]; // Max Temp (Red)
            const datasetMin = chart.data.datasets[1]; // Min Temp (Blue)
            
            // Helper to find index of max/min value in filtered data
            // Note: chart.data.datasets data matches the filteredYearData order
            
            let maxVal = -Infinity;
            let maxIndex = -1;
            datasetMax.data.forEach((val: number, i: number) => {
                if (val > maxVal) {
                    maxVal = val;
                    maxIndex = i;
                }
            });

            let minVal = Infinity;
            let minIndex = -1;
            datasetMin.data.forEach((val: number, i: number) => {
                if (val < minVal) {
                    minVal = val;
                    minIndex = i;
                }
            });

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.font = 'bold 12px sans-serif';

            // Draw Max Label
            if (maxIndex !== -1) {
                const meta = chart.getDatasetMeta(0);
                const point = meta.data[maxIndex];
                if (point) {
                    ctx.fillStyle = '#ef4444'; // Red
                    ctx.fillText(`${maxVal.toFixed(1)}°`, point.x, point.y - 10);
                }
            }

            // Draw Min Label
            if (minIndex !== -1) {
                const meta = chart.getDatasetMeta(1);
                const point = meta.data[minIndex];
                if (point) {
                    ctx.textBaseline = 'top';
                    ctx.fillStyle = '#3b82f6'; // Blue
                    ctx.fillText(`${minVal.toFixed(1)}°`, point.x, point.y + 10);
                }
            }

            ctx.restore();
        }
      },
      scales: {
          y: {
              ticks: { 
                  stepSize: 1,
                  color: colors.textMuted
              },
              grid: {
                  color: (context: any) => {
                      if (context.tick.value % 5 === 0) {
                          return colors.borderColor;
                      }
                      return 'transparent';
                  },
                  lineWidth: (context: any) => {
                      if (context.tick.value % 5 === 0) return 1;
                      return 0;
                  }
              }
          },
          x: {
              ticks: { color: colors.textMuted },
              grid: { display: false }
          }
      }
  };

  // Calculate Averages
  const averageStats = React.useMemo(() => {
    if (yearData.length === 0) return null;

    const totalMax = yearData.reduce((acc, curr) => acc + curr.max, 0);
    const totalMin = yearData.reduce((acc, curr) => acc + curr.min, 0);
    const rainDays = yearData.filter(d => d.rain >= 2).length;
    
    // Heat Chances (Dynamic Thresholds)
    let t1 = 20, t2 = 25, t3 = 30;
    let c1 = 0, c2 = 0, c3 = 0;

    // Loop to find suitable thresholds
    // "als deze alle drie 0% zijn, verlaag dan de grenzen met 5 graden... totdat er minimaal 2 meer dan 0% hebben"
    while (true) {
        c1 = yearData.filter(d => d.max > t1).length;
        c2 = yearData.filter(d => d.max > t2).length;
        c3 = yearData.filter(d => d.max > t3).length;

        const nonZeroCount = (c1 > 0 ? 1 : 0) + (c2 > 0 ? 1 : 0) + (c3 > 0 ? 1 : 0);

        if (nonZeroCount >= 2) break;
        
        // Safety break
        if (t1 <= -50) break;

        t1 -= 5;
        t2 -= 5;
        t3 -= 5;
    }

    // Cold & Wind Chances
    const chanceMinLT0 = yearData.filter(d => d.min < 0).length;
    const chanceMaxLT0 = yearData.filter(d => d.max < 0).length;
    const chanceGustGT6Bft = yearData.filter(d => d.gust > 49).length; // > 6 Bft means >= 7 Bft (min 50 km/h)

    return {
        avgMax: totalMax / yearData.length,
        avgMin: totalMin / yearData.length,
        rainChance: (rainDays / yearData.length) * 100,
        heatThresholds: [t1, t2, t3],
        chanceMaxGTLow: (c1 / yearData.length) * 100,
        chanceMaxGTMid: (c2 / yearData.length) * 100,
        chanceMaxGTHigh: (c3 / yearData.length) * 100,
        chanceMinLT0: (chanceMinLT0 / yearData.length) * 100,
        chanceMaxLT0: (chanceMaxLT0 / yearData.length) * 100,
        chanceGustGT6Bft: (chanceGustGT6Bft / yearData.length) * 100
    };
  }, [yearData]);

  const renderStatCard = (title: string, stats: YearStats[], type: 'temp' | 'rain' | 'wind', valueField: 'max' | 'min' | 'rain' | 'gust') => {
        const currentYear = new Date().getFullYear();
        
        return (
            <div className="bg-bg-card rounded-xl p-3 border border-border-color shadow-sm">
                <h3 className="text-xs font-bold uppercase text-text-muted mb-2">{title}</h3>
                <div className="space-y-2">
                    {stats.map((s, i) => {
                        let val = 0;
                        if (valueField === 'max') val = s.max;
                        else if (valueField === 'min') val = s.min;
                        else if (valueField === 'rain') val = s.rain;
                        else if (valueField === 'gust') val = s.gust;
                        
                        let valStr = '';
                        if (type === 'temp') valStr = `${convertTempPrecise(val, settings.tempUnit).toFixed(1)}°`;
                        else if (type === 'rain') valStr = `${convertPrecip(val, settings.precipUnit)} ${settings.precipUnit}`;
                        else if (type === 'wind') valStr = `${convertWind(val, settings.windUnit)} ${settings.windUnit}`;
                        
                        if (type === 'wind') {
                            if (settings.windUnit === WindUnit.BFT) {
                                const bftVal = convertWind(val, WindUnit.BFT);
                                valStr = `${bftVal} Bft (${Math.round(val)} km/hr)`;
                            } else {
                                let unitStr = settings.windUnit as string;
                                if (unitStr === 'km/h') unitStr = 'km/hr';
                                if (unitStr === 'mph') unitStr = 'miles/hr';
                                valStr = `${convertWind(val, settings.windUnit)} ${unitStr}`;
                            }
                        }

                        return (
                            <div 
                                key={i} 
                                className="flex justify-between items-center text-sm cursor-pointer hover:bg-bg-page p-1 rounded transition-colors text-text-main"
                                onClick={() => {
                                    // Navigate to Historical View with specific date
                                    const targetDate = new Date(s.year, month - 1, day);
                                    onNavigate(ViewState.HISTORICAL, { 
                                        date1: targetDate, 
                                        date2: targetDate, // Set both dates to the target for now, or let view handle it
                                        location: selectedLocation 
                                    });
                                }}
                            >
                                <span className="font-bold">{valStr}</span>
                                <div className="flex items-center gap-1 text-xs text-text-muted">
                                    <span>{s.year}</span>
                                    <span>({currentYear - s.year}j)</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

  return (
    <div className="h-full flex flex-col relative bg-bg-page">
      {/* Header - Copied from ClimateChangeView */}
      <div className="flex-none p-4 space-y-4 relative z-40 bg-bg-page transition-colors duration-300 shadow-sm">
          <div className="flex items-center justify-center mb-4">
              <h1 className="text-2xl font-bold text-text-main">Deze Dag in de Geschiedenis</h1>
          </div>

          <div className="bg-bg-card rounded-2xl p-4 shadow-sm border border-border-color space-y-4">
              {/* Location Search */}
              <div className="relative z-50">
                  <div className="flex items-center bg-bg-page rounded-xl px-3 py-2 border border-border-color">
                      <Icon name="search" className="text-text-muted" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && searchResults.length > 0) {
                                selectLocation(searchResults[0]);
                            }
                        }}
                        placeholder={t('search_placeholder')}
                        className="bg-transparent border-none outline-none ml-2 w-full text-text-main placeholder-text-muted"
                        onFocus={() => setShowFavorites(true)}
                    />
                      {searchQuery && (
                          <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="p-1">
                              <Icon name="close" className="text-text-muted" />
                          </button>
                      )}
                  </div>

                  {/* Dropdown Results */}
                  {(isSearching || (showFavorites && !searchQuery && settings.favorites.length > 0) || searchResults.length > 0) && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-bg-card rounded-xl shadow-xl border border-border-color overflow-hidden max-h-60 overflow-y-auto z-50">
                          {searchResults.length > 0 ? (
                              searchResults.map((loc, i) => (
                                  <button
                                      key={i}
                                      onClick={() => selectLocation(loc)}
                                      className="w-full text-left px-4 py-3 hover:bg-bg-page flex items-center justify-between border-b border-border-color last:border-0 text-text-main"
                                  >
                                      <span className="font-medium">{loc.name}, {loc.country}</span>
                                      <span className="text-xs text-text-muted">
                                          {Math.round(loc.lat*10)/10}, {Math.round(loc.lon*10)/10}
                                      </span>
                                  </button>
                              ))
                          ) : showFavorites && settings.favorites.length > 0 ? (
                              <>
                                  <div className="px-4 py-2 text-xs font-bold uppercase text-text-muted bg-bg-page">
                                      {t('favorites')}
                                  </div>
                                  {settings.favorites.map((loc, i) => (
                                      <button
                                          key={i}
                                          onClick={() => selectLocation(loc)}
                                          className="w-full text-left px-4 py-3 hover:bg-bg-page flex items-center justify-between border-b border-border-color last:border-0 text-text-main"
                                      >
                                          <span className="font-medium">{loc.name}</span>
                                      </button>
                                  ))}
                              </>
                          ) : null}
                      </div>
                  )}
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-end gap-4 relative z-10">
                  <div className="flex-1 min-w-[120px]">
                      <label className="text-xs font-medium text-text-muted mb-1 block">
                          {t('tab.day')}
                      </label>
                      <div className="flex items-center gap-2">
                          <select 
                              value={day} 
                              onChange={(e) => setDay(parseInt(e.target.value))}
                              className="bg-bg-page text-text-main border border-border-color rounded-lg px-3 py-2 w-20 outline-none focus:ring-2 focus:ring-accent-primary"
                          >
                              {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                                  <option key={d} value={d} className="bg-bg-page text-text-main">{d}</option>
                              ))}
                          </select>
                          <select 
                              value={month} 
                              onChange={(e) => setMonth(parseInt(e.target.value))}
                              className="bg-bg-page text-text-main border border-border-color rounded-lg px-3 py-2 flex-1 outline-none focus:ring-2 focus:ring-accent-primary"
                          >
                              {months.slice(1).map((m, i) => (
                                  <option key={i} value={i + 1} className="bg-bg-page text-text-main">{m}</option>
                              ))}
                          </select>
                      </div>
                  </div>

                  <button 
                      onClick={calculateStats}
                      disabled={loading || (searchQuery.length > 0 && searchQuery !== `${selectedLocation.name}, ${selectedLocation.country}`)}
                      className={`bg-accent-primary text-text-inverse px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 ${loading || (searchQuery.length > 0 && searchQuery !== `${selectedLocation.name}, ${selectedLocation.country}`) ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
                  >
                      {loading ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                          <Icon name="calculate" />
                      )}
                      <span>Bereken</span>
                  </button>
              </div>
          </div>
      </div>

      {/* Content */}
      <div className="flex-grow overflow-y-auto px-4 pb-20">
          {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6">
                  {error}
              </div>
          )}

          {topStats && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="text-center">
                      <h2 className="text-xl font-bold">{day} {monthNamesFull[month]}</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{selectedLocation.name}</p>
                      
                      {/* Range Filter */}
                      <div className="mt-2 flex justify-center relative z-10">
                          <select 
                              value={selectedRange} 
                              onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'all') setSelectedRange('all');
                                  else if (val.startsWith('decade-')) setSelectedRange(val);
                                  else setSelectedRange(Number(val));
                              }}
                              className="bg-bg-card text-text-main text-sm border border-border-color rounded-lg px-3 py-1 outline-none focus:ring-2 focus:ring-blue-500"
                          >
                              <option value="all" className="bg-bg-card text-text-main">{t('history.range_all')} (1950 - Nu)</option>
                              {Array.from({length: 7}, (_, i) => {
                                  const years = (i + 1) * 10;
                                  return (
                                      <option key={years} value={years} className="bg-bg-card text-text-main">{t('history.range_last')} {years} {t('history.range_years')}</option>
                                  );
                              }).reverse()}
                              <option disabled className="bg-bg-card text-text-main">──────────</option>
                              {decades.map(d => (
                                  <option key={d} value={`decade-${d}`} className="bg-bg-card text-text-main">{t('history.range_decade')} {d.toString().slice(2)} ({d}-{d+9})</option>
                              ))}
                          </select>
                      </div>
                  </div>

                  {/* Top Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Averages Card */}
                      {averageStats && (
                          <div className="bg-bg-card rounded-xl p-3 border border-border-color shadow-sm">
                              <h3 className="text-xs font-bold uppercase text-text-muted mb-2">{t('history.averages_chance')}</h3>
                              <div className="space-y-2">
                                  <div className="flex justify-between items-center text-sm p-1">
                                      <span>{t('history.avg_max')}</span>
                                      <span className="font-bold">{convertTempPrecise(averageStats.avgMax, settings.tempUnit).toFixed(1)}°</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm p-1">
                                      <span>{t('history.avg_min')}</span>
                                      <span className="font-bold">{convertTempPrecise(averageStats.avgMin, settings.tempUnit).toFixed(1)}°</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm p-1">
                                      <span>{t('history.chance_precip')}</span>
                                      <span className="font-bold">{Math.round(averageStats.rainChance)}%</span>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* Heat Chances Card */}
                      {averageStats && (
                          <div className="bg-bg-card rounded-xl p-3 border border-border-color shadow-sm">
                              <h3 className="text-xs font-bold uppercase text-text-muted mb-2">{t('history.heat_chance')}</h3>
                              <div className="space-y-2">
                                  <div className="flex justify-between items-center text-sm p-1">
                                      <span>Max {'>'} {averageStats.heatThresholds[0]}°</span>
                                      <span className="font-bold">{Math.round(averageStats.chanceMaxGTLow)}%</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm p-1">
                                      <span>Max {'>'} {averageStats.heatThresholds[1]}°</span>
                                      <span className="font-bold">{Math.round(averageStats.chanceMaxGTMid)}%</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm p-1">
                                      <span>Max {'>'} {averageStats.heatThresholds[2]}°</span>
                                      <span className="font-bold">{Math.round(averageStats.chanceMaxGTHigh)}%</span>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* Cold & Wind Chances Card */}
                      {averageStats && (
                          <div className="bg-bg-card rounded-xl p-3 border border-border-color shadow-sm">
                              <h3 className="text-xs font-bold uppercase text-text-muted mb-2">{t('history.cold_wind')}</h3>
                              <div className="space-y-2">
                                  <div className="flex justify-between items-center text-sm p-1">
                                      <span>{t('history.min_lt_0')}</span>
                                      <span className="font-bold">{Math.round(averageStats.chanceMinLT0)}%</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm p-1">
                                      <span>{t('history.max_lt_0')}</span>
                                      <span className="font-bold">{Math.round(averageStats.chanceMaxLT0)}%</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm p-1">
                                      <span>{t('history.gust_gt_6bft')}</span>
                                      <span className="font-bold">{Math.round(averageStats.chanceGustGT6Bft)}%</span>
                                  </div>
                              </div>
                          </div>
                      )}

                      {renderStatCard(t('history.top_warmest_max'), topStats.warmestMax, 'temp', 'max')}
                      {renderStatCard(t('history.top_coldest_max'), topStats.coldestMax, 'temp', 'max')}
                      {renderStatCard(t('history.top_coldest_min'), topStats.coldestMin, 'temp', 'min')}
                      {renderStatCard(t('history.top_warmest_min'), topStats.warmestMin, 'temp', 'min')}
                      {renderStatCard(t('history.top_wettest'), topStats.wettest, 'rain', 'rain')}
                      {renderStatCard(t('history.top_windiest'), topStats.windiest, 'wind', 'gust')}
                  </div>

                  {/* Day Overview Button */}
                  <div className="flex justify-center">
                      <button 
                          onClick={() => setShowHistoryTable(true)}
                          className="bg-bg-card hover:bg-bg-page text-blue-600 dark:text-blue-400 border border-border-color px-6 py-3 rounded-xl font-bold shadow-sm flex items-center gap-2 transition-all active:scale-95"
                      >
                          <Icon name="list" />
                          <span>{t('history.overview')}</span>
                      </button>
                  </div>

                  {/* Chart */}
                  <div className="bg-bg-card rounded-2xl p-4 shadow-sm border border-border-color">
                      <div className="h-[400px]">
                          <Bar data={chartData} options={chartOptions} />
                      </div>
                      
                      {/* Chart Controls */}
                      <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-4 mt-4 pt-4 border-t border-border-color">
                          <button 
                              onClick={() => setChartView('all')}
                              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase transition-colors ${chartView === 'all' ? 'bg-blue-600 text-white' : 'bg-bg-page text-text-muted hover:bg-bg-card'}`}
                          >
                              Alles
                          </button>

                          <button 
                              onClick={() => setChartView('paged')}
                              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase transition-colors ${chartView === 'paged' ? 'bg-blue-600 text-white' : 'bg-bg-page text-text-muted hover:bg-bg-card'}`}
                          >
                              10 Jaar
                          </button>
                          
                          <div className="w-px h-6 bg-border-color" />
                          
                          <div className="flex items-center gap-2">
                              <button 
                                  onClick={() => { setChartView('paged'); setPageIndex(prev => prev + 1); }} 
                                  disabled={filteredYearData.length === 0 || (filteredYearData[0] && filteredYearData[0].year <= 1950)}
                                  className={`p-2 rounded-lg transition-colors ${chartView === 'paged' ? 'bg-bg-page hover:bg-bg-card' : 'opacity-30'}`}
                              >
                                  <Icon name="chevron_left" />
                              </button>
                              
                              <span className="text-sm font-bold min-w-[100px] text-center">
                                  {chartView === 'all' ? t('history.chart_all_years') : `${currentYear - (pageIndex * 10) - 9} - ${currentYear - (pageIndex * 10)}`}
                              </span>

                              <button 
                                  onClick={() => { setChartView('paged'); setPageIndex(prev => Math.max(0, prev - 1)); }} 
                                  disabled={pageIndex === 0}
                                  className={`p-2 rounded-lg transition-colors ${chartView === 'paged' ? 'bg-bg-page hover:bg-bg-card' : 'opacity-30'}`}
                              >
                                  <Icon name="chevron_right" />
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          )}
      </div>

      {/* Loading Modal */}
      <Modal isOpen={loading && !showLimitModal} onClose={() => {}} title="Even geduld">
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-primary border-t-transparent"></div>
              <p className="text-center text-text-muted">
                  {loadingProgress}
              </p>
          </div>
      </Modal>

      {/* Limit Modal */}
      {showLimitModal && (
          <Modal isOpen={true} onClose={() => setShowLimitModal(false)} title="Limiet Bereikt">
             <div className="p-4">
                  <p className="text-text-main">U heeft de dagelijkse limiet voor data-aanvragen bereikt. Probeer het morgen opnieuw.</p>
                  <button onClick={() => setShowLimitModal(false)} className="mt-4 w-full bg-accent-primary text-text-inverse py-2 rounded-lg">{t('close')}</button>
             </div>
          </Modal>
      )}

      {/* History Table Overlay */}
      {showHistoryTable && (
          <ThisDayHistoryTable
              data={yearData}
              onClose={() => setShowHistoryTable(false)}
              settings={settings}
              title={`${day} ${monthNamesFull[month]}`}
              subTitle={selectedLocation.name}
          />
      )}
    </div>
  );
};
