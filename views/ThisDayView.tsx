import React, { useState, useEffect, useRef } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { AppSettings, Location, TempUnit, WindUnit, PrecipUnit, ViewState } from '../types';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { loadClimateData, saveClimateData } from '../services/storageService';
import { convertTempPrecise, convertWind, convertPrecip } from '../services/weatherService';

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

  // Initial Fetch Check (reuse cache logic from ClimateChangeView)
  useEffect(() => {
      const locKey = `${selectedLocation.lat}-${selectedLocation.lon}`;
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
      
      const locKey = `${selectedLocation.lat}-${selectedLocation.lon}`;
      
      const cached = loadClimateData(locKey);
      if (cached) {
           setRawDailyData(cached);
           setLastFetchedLocation(locKey);
           processData(cached);
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
          
          // Added wind_gusts_10m_max
          const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${selectedLocation.lat}&longitude=${selectedLocation.lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max&timezone=auto`;
          
          const response = await fetch(url);
          
          if (fetchIdRef.current !== currentFetchId) return;

          if (response.status === 429) {
              setShowLimitModal(true);
              setLoading(false);
              return;
          }

          if (!response.ok) throw new Error(`Failed to fetch climate data`);
          
          const data = await response.json();
          
          saveClimateData(locKey, data);
          
          setRawDailyData(data);
          setLastFetchedLocation(locKey);
          processData(data);
      } catch (err) {
          if (fetchIdRef.current !== currentFetchId) return;
          console.error(err);
          setError('Kon data niet ophalen. Probeer het later opnieuw.');
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
                      gust: gusts ? gusts[i] || 0 : 0
                  });
              }
          }
      });

      // Sort by year for chart
      yearsFound.sort((a, b) => a.year - b.year);
      setYearData(yearsFound);

      // Calculate Top 3s
      if (yearsFound.length > 0) {
          const sortedMax = [...yearsFound].sort((a, b) => b.max - a.max);
          const sortedMinMax = [...yearsFound].sort((a, b) => a.max - b.max);
          const sortedMin = [...yearsFound].sort((a, b) => a.min - b.min);
          const sortedMaxMin = [...yearsFound].sort((a, b) => b.min - a.min);
          const sortedRain = [...yearsFound].sort((a, b) => b.rain - a.rain);
          const sortedWind = [...yearsFound].sort((a, b) => b.gust - a.gust);

          setTopStats({
              warmestMax: sortedMax.slice(0, 3),
              coldestMax: sortedMinMax.slice(0, 3),
              coldestMin: sortedMin.slice(0, 3),
              warmestMin: sortedMaxMin.slice(0, 3),
              wettest: sortedRain.slice(0, 3),
              windiest: sortedWind.slice(0, 3)
          });
      }
  };

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
              labels: { color: settings.theme === 'dark' ? '#fff' : '#333' }
          },
          title: {
              display: false,
          },
          tooltip: {
              mode: 'index' as const,
              intersect: false,
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
                  color: settings.theme === 'dark' ? '#ccc' : '#666' 
              },
              grid: {
                  color: (context: any) => {
                      if (context.tick.value % 5 === 0) {
                          return settings.theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
                      }
                      return settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
                  },
                  lineWidth: (context: any) => {
                      if (context.tick.value % 5 === 0) return 5;
                      return 1;
                  }
              }
          },
          x: {
              ticks: { color: settings.theme === 'dark' ? '#ccc' : '#666' },
              grid: { display: false }
          }
      }
  };

  const renderStatCard = (title: string, stats: YearStats[], type: 'temp' | 'rain' | 'wind', valueField: 'max' | 'min' | 'rain' | 'gust') => {
        const currentYear = new Date().getFullYear();
        
        return (
            <div className="bg-white dark:bg-white/5 rounded-xl p-3 border border-slate-200 dark:border-white/10 shadow-sm">
                <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-white/60 mb-2">{title}</h3>
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
                        else if (type === 'wind') valStr = `${convertWind(val, settings.windUnit)} ${settings.windUnit}`; // Wind unit added below in the span to match request better or just here?
                        // User said: "bij wind altijd de snelheid km/hr of miles/hr erbij zetten tussen haakjes)"
                        // So: "50 (km/h)" or "50 km/h". The current code does `${val} ${unit}`.
                        // Let's adjust to match "erbij zetten tussen haakjes". 
                        // Actually, existing code was `${convertWind(...)} ${settings.windUnit}`.
                        // User wants: `speed (unit)`.
                        
                        if (type === 'wind') {
                            let unitStr = settings.windUnit as string;
                            if (unitStr === 'km/h') unitStr = 'km/hr';
                            if (unitStr === 'mph') unitStr = 'miles/hr';
                            valStr = `${convertWind(val, settings.windUnit)} (${unitStr})`;
                        }

                        return (
                            <div 
                                key={i} 
                                className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 p-1 rounded transition-colors"
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
                                <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
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
    <div className="h-full flex flex-col">
      {/* Header - Copied from ClimateChangeView */}
      <div className="flex-none p-4 space-y-4">
          <div className="flex items-center gap-2 mb-4">
              <button onClick={() => onNavigate('CURRENT')} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full">
                  <Icon name="arrow_back" />
              </button>
              <h1 className="text-2xl font-bold">Deze Dag in de Geschiedenis</h1>
          </div>

          <div className="bg-white dark:bg-white/5 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10 space-y-4">
              {/* Location Search */}
              <div className="relative z-50">
                  <div className="flex items-center bg-slate-100 dark:bg-black/20 rounded-xl px-3 py-2">
                      <Icon name="search" className="text-slate-400" />
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
                        className="bg-transparent border-none outline-none ml-2 w-full text-slate-800 dark:text-white placeholder-slate-400"
                        onFocus={() => setShowFavorites(true)}
                    />
                      {searchQuery && (
                          <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="p-1">
                              <Icon name="close" className="text-slate-400" />
                          </button>
                      )}
                  </div>

                  {/* Dropdown Results */}
                  {(isSearching || (showFavorites && !searchQuery && settings.favorites.length > 0) || searchResults.length > 0) && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden max-h-60 overflow-y-auto">
                          {searchResults.length > 0 ? (
                              searchResults.map((loc, i) => (
                                  <button
                                      key={i}
                                      onClick={() => selectLocation(loc)}
                                      className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between border-b border-slate-100 dark:border-white/5 last:border-0"
                                  >
                                      <span className="font-medium">{loc.name}, {loc.country}</span>
                                      <span className="text-xs text-slate-400">
                                          {Math.round(loc.lat*10)/10}, {Math.round(loc.lon*10)/10}
                                      </span>
                                  </button>
                              ))
                          ) : showFavorites && settings.favorites.length > 0 ? (
                              <>
                                  <div className="px-4 py-2 text-xs font-bold uppercase text-slate-400 bg-slate-50 dark:bg-white/5">
                                      {t('favorites')}
                                  </div>
                                  {settings.favorites.map((loc, i) => (
                                      <button
                                          key={i}
                                          onClick={() => selectLocation(loc)}
                                          className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between border-b border-slate-100 dark:border-white/5 last:border-0"
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
              <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[120px]">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                          {t('tab.day')}
                      </label>
                      <div className="flex items-center gap-2">
                          <select 
                              value={day} 
                              onChange={(e) => setDay(parseInt(e.target.value))}
                              className="bg-slate-100 dark:bg-black/20 rounded-lg px-3 py-2 w-20 outline-none focus:ring-2 focus:ring-blue-500"
                          >
                              {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                                  <option key={d} value={d}>{d}</option>
                              ))}
                          </select>
                          <select 
                              value={month} 
                              onChange={(e) => setMonth(parseInt(e.target.value))}
                              className="bg-slate-100 dark:bg-black/20 rounded-lg px-3 py-2 flex-1 outline-none focus:ring-2 focus:ring-blue-500"
                          >
                              {months.slice(1).map((m, i) => (
                                  <option key={i} value={i + 1}>{m}</option>
                              ))}
                          </select>
                      </div>
                  </div>

                  <button 
                      onClick={calculateStats}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  </div>

                  {/* Top Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {renderStatCard('Top 3 Warmste Jaren (Max)', topStats.warmestMax, 'temp', 'max')}
                      {renderStatCard('Top 3 Koudste Jaren (Max)', topStats.coldestMax, 'temp', 'max')}
                      {renderStatCard('Top 3 Koudste Nachten (Min)', topStats.coldestMin, 'temp', 'min')}
                      {renderStatCard('Top 3 Warmste Nachten (Min)', topStats.warmestMin, 'temp', 'min')}
                      {renderStatCard('Top 3 Natste Jaren', topStats.wettest, 'rain', 'rain')}
                      {renderStatCard('Top 3 Hardste Windstoten', topStats.windiest, 'wind', 'gust')}
                  </div>

                  {/* Chart */}
                  <div className="bg-white dark:bg-white/5 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-white/10">
                      <div className="h-[400px]">
                          <Bar data={chartData} options={chartOptions} />
                      </div>
                      
                      {/* Chart Controls */}
                      <div className="flex justify-center items-center gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                          <button 
                              onClick={() => setChartView('all')}
                              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors ${chartView === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20'}`}
                          >
                              Alles
                          </button>

                          <button 
                              onClick={() => setChartView('paged')}
                              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors ${chartView === 'paged' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20'}`}
                          >
                              10 Jaar
                          </button>
                          
                          <div className="w-px h-6 bg-slate-200 dark:bg-white/10" />
                          
                          <div className="flex items-center gap-2">
                              <button 
                                  onClick={() => { setChartView('paged'); setPageIndex(prev => prev + 1); }} 
                                  disabled={filteredYearData.length === 0 || (filteredYearData[0] && filteredYearData[0].year <= 1950)}
                                  className={`p-2 rounded-lg transition-colors ${chartView === 'paged' ? 'bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20' : 'opacity-30'}`}
                              >
                                  <Icon name="chevron_left" />
                              </button>
                              
                              <span className="text-sm font-bold min-w-[100px] text-center">
                                  {chartView === 'all' ? 'Alle Jaren' : `${currentYear - (pageIndex * 10) - 9} - ${currentYear - (pageIndex * 10)}`}
                              </span>

                              <button 
                                  onClick={() => { setChartView('paged'); setPageIndex(prev => Math.max(0, prev - 1)); }} 
                                  disabled={pageIndex === 0}
                                  className={`p-2 rounded-lg transition-colors ${chartView === 'paged' ? 'bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20' : 'opacity-30'}`}
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
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              <p className="text-center text-slate-600 dark:text-slate-300">
                  {loadingProgress}
              </p>
          </div>
      </Modal>

      {/* Limit Modal */}
      {showLimitModal && (
          <Modal isOpen={true} onClose={() => setShowLimitModal(false)} title="Limiet Bereikt">
             <div className="p-4">
                  <p>U heeft de dagelijkse limiet voor data-aanvragen bereikt. Probeer het morgen opnieuw.</p>
                  <button onClick={() => setShowLimitModal(false)} className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg">Sluiten</button>
             </div>
          </Modal>
      )}
    </div>
  );
};
