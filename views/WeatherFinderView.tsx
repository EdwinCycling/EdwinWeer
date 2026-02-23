import React, { useState, useEffect, useMemo } from 'react';
import { ViewState, AppSettings, Location, TempUnit, WindUnit, PrecipUnit } from '../types';
import { Icon } from '../components/Icon';
import { searchCityByName } from '../services/geoService';
import { loadCurrentLocation } from '../services/storageService';
import { getUsage } from '../services/usageService';
import { getTranslation } from '../services/translations';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
}

type Parameter = 'temperature_2m_max' | 'temperature_2m_min' | 'precipitation_sum' | 'precipitation_hours' | 'wind_speed_10m_max' | 'wind_gusts_10m_max' | 'sunshine_duration' | 'precipDurationPercent';
type Operator = '>' | '<' | '=' | 'between';

interface Rule {
  id: string;
  parameter: Parameter;
  operator: Operator;
  value: number;
  value2?: number; // For 'between'
}

interface Scenario {
  id: string;
  rules: Rule[];
}

interface DailyData {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  apparent_temperature_max: number[];
  apparent_temperature_min: number[];
  precipitation_sum: number[];
  precipitation_hours: number[];
  wind_speed_10m_max: number[];
  wind_gusts_10m_max: number[];
  sunshine_duration: number[];
  daylight_duration: number[];
}

interface MatchResult {
  date: string;
  data: {
    [key in Parameter]: number;
  } & {
    apparent_temperature_max: number;
    apparent_temperature_min: number;
    temperature_2m_min: number;
  };
}

const PARAM_LABELS: Record<Parameter, string> = {
  temperature_2m_max: 'Max Temp',
  temperature_2m_min: 'Min Temp',
  precipitation_sum: 'Neerslaghoeveelheid',
  precipitation_hours: 'Neerslagduur',
  wind_speed_10m_max: 'Windkracht (max)',
  wind_gusts_10m_max: 'Windstoten',
  sunshine_duration: 'Zonneschijn (%)',
  precipDurationPercent: 'Neerslagduur (%)'
};

const kmhToBft = (kmh: number) => {
  if (kmh < 1) return 0;
  if (kmh < 6) return 1;
  if (kmh < 12) return 2;
  if (kmh < 20) return 3;
  if (kmh < 29) return 4;
  if (kmh < 39) return 5;
  if (kmh < 50) return 6;
  if (kmh < 62) return 7;
  if (kmh < 75) return 8;
  if (kmh < 89) return 9;
  if (kmh < 103) return 10;
  if (kmh < 118) return 11;
  return 12;
};

const convertValue = (val: number, param: Parameter, settings: AppSettings): number => {
  if (param.startsWith('temperature')) {
    if (settings.tempUnit === TempUnit.FAHRENHEIT) return (val * 9/5) + 32;
  }
  if (param.startsWith('precipitation')) {
    if (param === 'precipitation_hours') return val;
    if (settings.precipUnit === PrecipUnit.INCH) return val / 25.4;
  }
  if (param.startsWith('wind')) {
    switch (settings.windUnit) {
      case WindUnit.BFT: return kmhToBft(val);
      case WindUnit.MS: return val / 3.6;
      case WindUnit.MPH: return val / 1.60934;
      case WindUnit.KNOTS: return val / 1.852;
      default: return val;
    }
  }
  return val;
};

const getUnitLabel = (param: Parameter, settings: AppSettings): string => {
  if (param.startsWith('temperature')) return settings.tempUnit === TempUnit.FAHRENHEIT ? '°F' : '°C';
  if (param.startsWith('precipitation')) {
    if (param === 'precipitation_hours') return 'uur';
    return settings.precipUnit === PrecipUnit.INCH ? 'inch' : 'mm';
  }
  if (param.startsWith('wind')) return settings.windUnit;
  if (param === 'sunshine_duration') return '%';
  return '';
};

export const WeatherFinderView: React.FC<Props> = ({ onNavigate, settings }) => {
  const t = (key: string) => getTranslation(key, settings.language);
  
  const getLocale = () => {
      const locales: Record<string, string> = { 
        nl: 'nl-NL', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES',
        it: 'it-IT', pt: 'pt-PT', no: 'no-NO', sv: 'sv-SE', da: 'da-DK', fi: 'fi-FI', pl: 'pl-PL'
      };
      return locales[settings.language] || 'en-GB';
  };

  const getParamLabel = (param: Parameter) => {
    switch(param) {
        case 'temperature_2m_max': return t('finder.param.max_temp');
        case 'temperature_2m_min': return t('finder.param.min_temp');
        case 'precipitation_sum': return t('finder.param.precip_sum');
        case 'precipitation_hours': return t('finder.param.precip_hours');
        case 'wind_speed_10m_max': return t('finder.param.wind_max');
        case 'wind_gusts_10m_max': return t('finder.param.wind_gusts');
        case 'sunshine_duration': return t('finder.param.sun_duration');
        case 'precipDurationPercent': return t('finder.param.precip_duration_percent');
        default: return param;
    }
  };

  // State
  const [location, setLocation] = useState<Location | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { id: '1', rules: [{ id: '1', parameter: 'temperature_2m_max', operator: '>', value: 20 }] }
  ]);
  const [historicalData, setHistoricalData] = useState<DailyData | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  
  // Prediction State
  interface PredictionResult {
    startDate: string;
    endDate?: string;
    probability: number;
    isSequence: boolean;
    bonus: boolean; // Historically often a sequence
  }
  const [minProbability, setMinProbability] = useState<number>(25);
  const [chartView, setChartView] = useState<'day' | 'week' | 'month'>('month');
  const [toast, setToast] = useState<string | null>(null);

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const formatDateToMilestone = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
    return `${d.getFullYear()}-${months[d.getMonth()]}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Milestones Logic
  const milestones = useMemo(() => {
    if (matches.length === 0) return { earliest: null, latest: null };

    let earliestMatch = matches[0];
    let latestMatch = matches[0];
    let minDoy = 999;
    let maxDoy = -1;

    matches.forEach(m => {
      const d = new Date(m.date);
      // Use UTC to ensure consistent DOY calculation
      const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
      const doy = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      if (doy < minDoy) {
        minDoy = doy;
        earliestMatch = m;
      }
      if (doy > maxDoy) {
        maxDoy = doy;
        latestMatch = m;
      }
    });

    return { earliest: earliestMatch, latest: latestMatch };
  }, [matches]);

  // Prediction Logic
  const predictions = useMemo(() => {
    if (!matches || matches.length < 5 || !historicalData) {
      return [];
    }

    // Calculate occurrences of each DOY for 100% precision
    // We use 367 to handle index 366 safely (leap years)
    const doyOccurrence = new Array(367).fill(0);
    historicalData.time.forEach(timeStr => {
        const d = new Date(timeStr);
        // Use UTC to ensure consistent DOY calculation across all environments
        const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
        const doy = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (doy >= 0 && doy <= 366) doyOccurrence[doy]++;
    });

    // 1. Map matches to Day of Year (0-366) and check for historical sequences
    const matchesByDOY = new Array(367).fill(0);
    const matchDates = new Set(matches.map(m => m.date));
    let sequenceCount = 0;
    
    matches.forEach(m => {
      const d = new Date(m.date);
      const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
      const diff = d.getTime() - start.getTime();
      const oneDay = 1000 * 60 * 60 * 24;
      const doy = Math.floor(diff / oneDay);
      if (doy >= 0 && doy <= 366) matchesByDOY[doy]++;
      
      // Check if part of sequence (day before or after exists)
      const prevDay = new Date(d); prevDay.setDate(d.getDate() - 1);
      const nextDay = new Date(d); nextDay.setDate(d.getDate() + 1);
      const prevStr = prevDay.toISOString().split('T')[0];
      const nextStr = nextDay.toISOString().split('T')[0];
      
      if (matchDates.has(prevStr) || matchDates.has(nextStr)) {
        sequenceCount++;
      }
    });

    const historicalSequenceRate = matches.length > 0 ? sequenceCount / matches.length : 0;

    // 2. Scan next 365 days
    const today = new Date();
    // Use UTC for current DOY as well
    const startOfYear = new Date(Date.UTC(today.getFullYear(), 0, 0));
    const diff = today.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const currentDOY = Math.floor(diff / oneDay);

    const candidates: { date: Date, prob: number }[] = [];

    for (let i = 1; i <= 365; i++) {
        const targetDOY = (currentDOY + i);
        let lookupDOY = targetDOY % 366;
        if (lookupDOY === 0) lookupDOY = 366;

        // Use a small 3-day window to smooth and find the local probability
        let count = 0;
        let windowOccurrences = 0;
        for (let w = -1; w <= 1; w++) {
            let d = lookupDOY + w;
            if (d <= 0) d += 366;
            if (d > 366) d -= 366;
            count += matchesByDOY[d] || 0;
            windowOccurrences += doyOccurrence[d] || 0;
        }

        // Probability = (Matches in window / Total occurrences in window) * 100
        const prob = windowOccurrences > 0 ? Math.round((count / windowOccurrences) * 100) : 0;

        if (prob >= minProbability) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            candidates.push({ date, prob });
        }
    }

    // 3. Group into sequences
    const groupedPredictions: PredictionResult[] = [];
    if (candidates.length > 0) {
        let currentGroup = {
            start: candidates[0].date,
            end: candidates[0].date,
            maxProb: candidates[0].prob,
            days: 1
        };

        const pushGroup = (group: typeof currentGroup) => {
             groupedPredictions.push({
                startDate: group.start.toLocaleDateString(getLocale(), { day: 'numeric', month: 'long' }),
                endDate: group.days > 1 ? group.end.toLocaleDateString(getLocale(), { day: 'numeric', month: 'long' }) : undefined,
                probability: group.maxProb,
                isSequence: group.days > 1,
                bonus: historicalSequenceRate > 0.3 // Bonus if >30% of history was sequences
            });
        };

        for (let i = 1; i < candidates.length; i++) {
            const prev = candidates[i-1];
            const curr = candidates[i];
            
            // Check if consecutive days
            const dayDiff = Math.round((curr.date.getTime() - prev.date.getTime()) / (1000 * 3600 * 24));
            
            if (dayDiff === 1) {
                currentGroup.end = curr.date;
                currentGroup.maxProb = Math.max(currentGroup.maxProb, curr.prob);
                currentGroup.days++;
            } else {
                pushGroup(currentGroup);
                currentGroup = {
                    start: curr.date,
                    end: curr.date,
                    maxProb: curr.prob,
                    days: 1
                };
            }
        }
        pushGroup(currentGroup);
    }
    
    return groupedPredictions.slice(0, 9);
  }, [matches, historicalData, minProbability]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Initialize location
  useEffect(() => {
    const initLocation = async () => {
      const savedLoc = await loadCurrentLocation();
      if (savedLoc) {
        setLocation(savedLoc);
      }
    };
    initLocation();
  }, []);

  // Search Logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length > 2) {
        const results = await searchCityByName(searchQuery);
        setSearchResults(results);
        setIsSearchOpen(true);
      } else {
        setSearchResults([]);
        setIsSearchOpen(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSelectLocation = (loc: Location) => {
    setLocation(loc);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchOpen(false);
    setHistoricalData(null); // Reset data when location changes
    setMatches([]);
  };

  // Rule Management
  const addScenario = () => {
    const newId = (scenarios.length + 1).toString();
    setScenarios([...scenarios, { id: newId, rules: [{ id: `${newId}-1`, parameter: 'temperature_2m_max', operator: '>', value: 20 }] }]);
  };

  const removeScenario = (id: string) => {
    if (scenarios.length === 1) return;
    setScenarios(scenarios.filter(s => s.id !== id));
  };

  const addRule = (scenarioId: string) => {
    setScenarios(scenarios.map(s => {
      if (s.id === scenarioId) {
        const newRuleId = `${scenarioId}-${s.rules.length + 1}`;
        return { ...s, rules: [...s.rules, { id: newRuleId, parameter: 'temperature_2m_max', operator: '>', value: 20 }] };
      }
      return s;
    }));
  };

  const updateRule = (scenarioId: string, ruleId: string, field: keyof Rule, value: any) => {
    setScenarios(scenarios.map(s => {
      if (s.id === scenarioId) {
        return {
          ...s,
          rules: s.rules.map(r => {
            if (r.id === ruleId) {
              return { ...r, [field]: value };
            }
            return r;
          })
        };
      }
      return s;
    }));
  };

  const removeRule = (scenarioId: string, ruleId: string) => {
    setScenarios(scenarios.map(s => {
      if (s.id === scenarioId) {
        if (s.rules.length === 1) return s; // Don't remove last rule
        return { ...s, rules: s.rules.filter(r => r.id !== ruleId) };
      }
      return s;
    }));
  };

  // Data Fetching
  const fetchHistory = async () => {
    if (!location) return;
    setLoading(true);
    setError(null);

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // Yesterday
    const endDateStr = endDate.toISOString().split('T')[0];
    const startDateStr = '1999-01-01';
    
    const cacheKey = `weather_history_${location.lat}_${location.lon}_${startDateStr}_${endDateStr}`;
    const cachedData = localStorage.getItem(cacheKey);

    // 1. Try Cache first
    if (cachedData) {
        try {
            console.log('Using cached weather history');
            const data = JSON.parse(cachedData);
            setHistoricalData(data);
            setLoading(false);
            setToast('Gebruikt opgeslagen data (gratis)');
            return data;
        } catch (e) {
            console.warn('Cache read failed', e);
        }
    }

    // 2. Check Credits ONLY if we need to fetch
    const usage = getUsage();
    if (usage.weatherCredits < 150) {
        setError('Je hebt minimaal 150 weather credits nodig om nieuwe data op te halen. (Opgeslagen zoekopdrachten werken wel)');
        setLoading(false);
        return;
    }

    // Check Daily Limit
    const today = new Date().toISOString().split('T')[0];
    const lastUse = localStorage.getItem('weather_finder_last_use');

    if (lastUse === today) {
        setError('Je mag deze functie slechts 1x per dag gebruiken (tenzij data uit cache komt).');
        setLoading(false);
        return;
    }

    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${location.lat}&longitude=${location.lon}&start_date=${startDateStr}&end_date=${endDateStr}&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max,sunshine_duration,daylight_duration&timezone=auto`;

      const response = await fetch(url);
      
      if (response.status === 429) {
          throw new Error('Je hebt de dagelijkse limiet van de weer-data bereikt (Open-Meteo API). Probeer het morgen opnieuw.');
      }

      if (!response.ok) throw new Error('Failed to fetch historical data');
      
      const data = await response.json();
      
      // 2. Save to Cache
      try {
          // Cleanup old keys to save space
          const keysToRemove: string[] = [];
          for(let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if(key && key.startsWith('weather_history_') && key !== cacheKey) {
                  keysToRemove.push(key);
              }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
          
          localStorage.setItem(cacheKey, JSON.stringify(data.daily));
          
          // Update last use only on successful API fetch
          localStorage.setItem('weather_finder_last_use', today);
      } catch (e) {
          console.warn('Cache write failed', e);
      }

      setHistoricalData(data.daily);
      return data.daily;
    } catch (err: any) {
      setError(err.message || 'Er is een fout opgetreden bij het ophalen van de data.');
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Filter Logic
  const findMatchingDays = (data: DailyData) => {
    const matchedDates: MatchResult[] = [];
    const count = data.time.length;

    for (let i = 0; i < count; i++) {
      // Check if day matches ANY scenario (OR logic between scenarios)
      const dayMatchesAnyScenario = scenarios.some(scenario => {
        // Check if day matches ALL rules in scenario (AND logic within scenario)
        return scenario.rules.every(rule => {
          let val = data[rule.parameter][i];
          
          // Conversion for units if necessary
          if (rule.parameter === 'sunshine_duration') {
             const daylight = data.daylight_duration?.[i] || 1;
             val = (val / daylight) * 100;
          }

          // Convert API value (SI) to User Settings Unit for comparison
          const userVal = convertValue(val, rule.parameter, settings);

          switch (rule.operator) {
            case '>': return userVal > rule.value;
            case '<': return userVal < rule.value;
            case '=': return Math.abs(userVal - rule.value) < 0.1; // Float tolerance
            case 'between': return rule.value2 !== undefined && userVal >= rule.value && userVal <= rule.value2;
            default: return false;
          }
        });
      });

      if (dayMatchesAnyScenario) {
        matchedDates.push({
          date: data.time[i],
          data: {
            temperature_2m_max: data.temperature_2m_max[i],
            temperature_2m_min: data.temperature_2m_min[i],
            apparent_temperature_max: data.apparent_temperature_max[i],
            apparent_temperature_min: data.apparent_temperature_min[i],
            precipitation_sum: data.precipitation_sum[i],
            precipitation_hours: data.precipitation_hours[i],
            precipDurationPercent: (data.precipitation_hours[i] / 24) * 100,
            wind_speed_10m_max: data.wind_speed_10m_max[i],
            wind_gusts_10m_max: data.wind_gusts_10m_max[i],
            sunshine_duration: (data.sunshine_duration[i] / (data.daylight_duration?.[i] || 1)) * 100
          }
        });
      }
    }

    // Sort by date descending (newest first)
    matchedDates.reverse();
    
    setMatches(matchedDates);
    return matchedDates;
  };

  // Chart Logic
  const chartData = useMemo(() => {
    if (!historicalData || !matches || matches.length === 0) return [];
    
    // Calculate how many times each DOY appears in the historical data for 100% precision
    const doyOccurrence = new Array(367).fill(0);
    historicalData.time.forEach(timeStr => {
        const d = new Date(timeStr);
        const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
        const doy = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (doy >= 0 && doy <= 366) doyOccurrence[doy]++;
    });

    // 1. Calculate matches per Day of Year (DOY)
    const matchesByDOY = new Array(367).fill(0);
    const precipDurationByDOY = new Array(367).fill(0);

    matches.forEach(m => {
        const d = new Date(m.date);
        const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
        const diff = d.getTime() - start.getTime();
        const doy = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (doy >= 0 && doy <= 366) {
            matchesByDOY[doy]++;
            precipDurationByDOY[doy] += (m.data.precipitation_hours || 0);
        }
    });

    // 2. Calculate daily probability and precip percent
    const dailyStats = matchesByDOY.map((count, doy) => {
        const occurrences = doyOccurrence[doy] || 1;
        const prob = (count / occurrences) * 100;
        
        const avgDuration = count > 0 ? (precipDurationByDOY[doy] / count) : 0;
        const precipDurationPercent = (avgDuration / 24) * 100;

        return { prob, precipDurationPercent };
    });

    if (chartView === 'month') {
        const monthlyProbs = new Array(12).fill(0).map((_, monthIdx) => {
            let sumProb = 0;
            let sumPrecip = 0;
            let days = 0;
            for (let doy = 0; doy < 367; doy++) {
                const d = new Date(2000, 0, doy); // Using year 2000 as it's a leap year
                if (d.getMonth() === monthIdx) {
                    sumProb += dailyStats[doy].prob;
                    sumPrecip += dailyStats[doy].precipDurationPercent;
                    days++;
                }
            }
            return {
                name: new Date(2000, monthIdx, 1).toLocaleDateString(getLocale(), { month: 'short' }),
                percentage: days > 0 ? Math.round(sumProb / days) : 0,
                precipDurationPercent: days > 0 ? Math.round(sumPrecip / days) : 0
            };
        });
        return monthlyProbs;
    } else if (chartView === 'week') {
        const weeklyProbs = new Array(53).fill(0).map((_, weekIdx) => {
            const weekNum = weekIdx + 1;
            let sumProb = 0;
            let sumPrecip = 0;
            let days = 0;
            let firstDateInWeek: Date | null = null;
            let lastDateInWeek: Date | null = null;

            for (let doy = 0; doy < 367; doy++) {
                const d = new Date(2000, 0, doy);
                const start = new Date(d.getFullYear(), 0, 1);
                const week = Math.ceil((((d.getTime() - start.getTime()) / 86400000) + start.getDay() + 1) / 7);
                if (week === weekNum) {
                    sumProb += dailyStats[doy].prob;
                    sumPrecip += dailyStats[doy].precipDurationPercent;
                    days++;
                    if (!firstDateInWeek) firstDateInWeek = d;
                    lastDateInWeek = d;
                }
            }
            const dateRange = firstDateInWeek && lastDateInWeek 
                ? `${firstDateInWeek.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' })} - ${lastDateInWeek.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' })}`
                : '';

            return {
                name: `W${weekNum}`,
                range: dateRange,
                percentage: days > 0 ? Math.round(sumProb / days) : 0,
                precipDurationPercent: days > 0 ? Math.round(sumPrecip / days) : 0
            };
        }).filter(w => w.percentage > 0 || w.precipDurationPercent > 0 || w.name === 'W1' || w.name === 'W53');
        return weeklyProbs;
    } else {
        return dailyStats.map((stat, doy) => {
            if (stat.prob === 0 && stat.precipDurationPercent === 0) return null;
            const date = new Date(2000, 0, doy);
            return {
                name: date.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' }),
                percentage: Math.round(stat.prob),
                precipDurationPercent: Math.round(stat.precipDurationPercent)
            };
        }).filter(d => d !== null) as { name: string, percentage: number, precipDurationPercent: number }[];
    }
  }, [matches, historicalData, chartView]);


  const handleSearch = async () => {
    // Validate
    for (const s of scenarios) {
      // Check for simple conflicts like > 20 AND < 10
      const minMaxMap: Record<string, { min: number, max: number }> = {};
      
      for (const r of s.rules) {
        if (!minMaxMap[r.parameter]) minMaxMap[r.parameter] = { min: -Infinity, max: Infinity };
        
        if (r.operator === '>') minMaxMap[r.parameter].min = Math.max(minMaxMap[r.parameter].min, r.value);
        if (r.operator === '<') minMaxMap[r.parameter].max = Math.min(minMaxMap[r.parameter].max, r.value);
        if (r.operator === '=') {
            if (r.value < minMaxMap[r.parameter].min || r.value > minMaxMap[r.parameter].max) {
                setError(`${t('finder.error_conflict')}: ${getParamLabel(r.parameter)} ${t('finder.op.eq')} ${r.value}`);
                return;
            }
            minMaxMap[r.parameter].min = r.value;
            minMaxMap[r.parameter].max = r.value;
        }
        if (r.operator === 'between' && r.value2 !== undefined) {
             minMaxMap[r.parameter].min = Math.max(minMaxMap[r.parameter].min, r.value);
             minMaxMap[r.parameter].max = Math.min(minMaxMap[r.parameter].max, r.value2);
        }
      }

      for (const key in minMaxMap) {
        if (minMaxMap[key].min > minMaxMap[key].max) {
           setError(`${t('finder.error_logic')}: ${getParamLabel(key as Parameter)}`);
           return;
        }
      }
    }

    let data = historicalData;
    if (!data) {
      data = await fetchHistory();
    }

    if (data) {
      findMatchingDays(data);
    }
  };

  const handleExportCSV = () => {
    if (matches.length === 0) return;
    
    const headers = ['Datum', 'Max Temp', 'Min Temp', 'Neerslag', 'Neerslagduur (%)', 'Windstoot', 'Zonneschijn (%)'];
    const rows = matches.map(m => [
      m.date,
      m.data.temperature_2m_max.toFixed(1),
      m.data.temperature_2m_min.toFixed(1),
      m.data.precipitation_sum.toFixed(1),
      (m.data as any).precipDurationPercent.toFixed(0),
      m.data.wind_gusts_10m_max.toFixed(1),
      m.data.sunshine_duration.toFixed(0) // Percentage as integer or 1 decimal
    ]);
    
    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `weer_matches_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setToast('CSV succesvol lokaal opgeslagen');
  };

  return (
    <div className="w-full min-h-screen pb-80 p-4 md:p-6 bg-bg-page text-text-main">
      {/* Header */}
      <div className="bg-bg-card rounded-2xl p-4 shadow-sm mb-6 flex items-center gap-3 border border-border-color">
        <button onClick={() => onNavigate(ViewState.CURRENT)} className="p-2 hover:bg-bg-page rounded-full transition-colors">
            <Icon name="arrow_back" className="text-xl text-text-muted hover:text-text-main" />
        </button>
        <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                <Icon name="search" className="text-xl" />
            </div>
            <div>
                <h1 className="text-xl font-bold">Vind de Dag</h1>
                <p className="text-xs text-text-muted">Zoek in 25 jaar weerhistorie</p>
            </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Location Picker */}
        <div className="bg-bg-card rounded-3xl p-6 shadow-sm border border-border-color relative z-20">
             <h3 className="font-bold mb-3 flex items-center gap-2">
                 <Icon name="location_on" className="text-accent-primary" />
                 Locatie
             </h3>
             
             <div className="relative">
                 <div className="flex items-center bg-bg-page rounded-xl px-3 border border-border-color focus-within:border-accent-primary transition-colors">
                     <Icon name="search" className="text-text-muted" />
                     <input 
                         type="text" 
                         value={isSearchOpen ? searchQuery : (location ? `${location.name}, ${location.country}` : '')}
                         onChange={(e) => {
                             setSearchQuery(e.target.value);
                             setIsSearchOpen(true);
                         }}
                         placeholder="Zoek een locatie..."
                         className="w-full bg-transparent border-none p-3 focus:ring-0 outline-none font-medium text-text-main placeholder:text-text-muted"
                     />
                     {loading && <Icon name="sync" className="animate-spin text-accent-primary" />}
                 </div>

                 {isSearchOpen && searchResults.length > 0 && (
                     <div className="absolute top-full left-0 right-0 mt-2 bg-bg-card rounded-xl shadow-xl border border-border-color overflow-hidden z-50">
                         {searchResults.map((loc, idx) => (
                             <button
                                 key={`${loc.lat}-${idx}`}
                                 onClick={() => handleSelectLocation(loc)}
                                 className="w-full text-left px-4 py-3 hover:bg-bg-page flex items-center justify-between border-b border-border-color last:border-0 text-text-main"
                             >
                                 <span>{loc.name}, {loc.country}</span>
                             </button>
                         ))}
                     </div>
                 )}
             </div>
        </div>

        {/* Scenarios */}
        <div className="space-y-6">
            {scenarios.map((scenario, sIdx) => (
                <div key={scenario.id} className="bg-bg-card rounded-3xl p-6 shadow-sm border border-border-color relative">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg text-text-main">Scenario {sIdx + 1}</h3>
                        {scenarios.length > 1 && (
                            <button onClick={() => removeScenario(scenario.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors">
                                <Icon name="delete" />
                            </button>
                        )}
                    </div>

                    <div className="space-y-3">
                        {scenario.rules.map((rule) => (
                            <div key={rule.id} className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-bg-page p-3 rounded-xl">
                                <select 
                                    value={rule.parameter}
                                    onChange={(e) => updateRule(scenario.id, rule.id, 'parameter', e.target.value)}
                                    className="bg-bg-card border-none rounded-lg p-2 text-sm w-full md:w-auto focus:ring-2 focus:ring-accent-primary text-text-main"
                                >
                                    {(['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'precipitation_hours', 'wind_speed_10m_max', 'wind_gusts_10m_max', 'sunshine_duration', 'precipDurationPercent'] as Parameter[]).map((key) => (
                                        <option key={key} value={key}>{getParamLabel(key)}</option>
                                    ))}
                                </select>

                                <select 
                                    value={rule.operator}
                                    onChange={(e) => updateRule(scenario.id, rule.id, 'operator', e.target.value)}
                                    className="bg-bg-card border-none rounded-lg p-2 text-sm w-full md:w-auto focus:ring-2 focus:ring-accent-primary text-text-main"
                                >
                                    <option value=">">{t('finder.op.gt')}</option>
                                    <option value="<">{t('finder.op.lt')}</option>
                                    <option value="=">{t('finder.op.eq')}</option>
                                    <option value="between">{t('finder.op.between')}</option>
                                </select>

                                <div className="flex items-center gap-2 flex-1">
                                    <input 
                                        type="number"
                                        value={rule.value}
                                        onChange={(e) => updateRule(scenario.id, rule.id, 'value', parseFloat(e.target.value))}
                                        className="bg-bg-card border-none rounded-lg p-2 text-sm w-24 focus:ring-2 focus:ring-accent-primary text-text-main"
                                    />
                                    {rule.operator === 'between' && (
                                        <>
                                            <span className="text-sm text-text-main">{t('finder.and')}</span>
                                            <input 
                                                type="number"
                                                value={rule.value2 || rule.value + 1}
                                                onChange={(e) => updateRule(scenario.id, rule.id, 'value2', parseFloat(e.target.value))}
                                                className="bg-bg-card border-none rounded-lg p-2 text-sm w-24 focus:ring-2 focus:ring-accent-primary text-text-main"
                                            />
                                        </>
                                    )}
                                    <span className="text-sm font-bold text-text-muted">{getUnitLabel(rule.parameter, settings)}</span>
                                </div>

                                {scenario.rules.length > 1 && (
                                    <button onClick={() => removeRule(scenario.id, rule.id)} className="text-text-muted hover:text-red-500">
                                        <Icon name="close" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <button onClick={() => addRule(scenario.id)} className="mt-4 text-sm font-bold text-accent-primary hover:text-accent-hover flex items-center gap-1">
                        <Icon name="add" />
                        Regel toevoegen
                    </button>
                    
                    {sIdx < scenarios.length - 1 && (
                        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-border-color px-3 py-1 rounded-full text-xs font-bold text-text-muted z-10">
                            OF
                        </div>
                    )}
                </div>
            ))}

            <button onClick={addScenario} className="w-full py-3 border-2 border-dashed border-border-color rounded-2xl text-text-muted font-bold hover:border-accent-primary hover:text-accent-primary transition-colors flex items-center justify-center gap-2">
                <Icon name="add_circle_outline" />
                Nieuw Scenario (OF)
            </button>
        </div>

        {/* Min Probability Setting */}
        <div className="bg-bg-card rounded-3xl p-6 shadow-sm border border-border-color">
            <h3 className="font-bold mb-3 flex items-center gap-2 text-text-main">
                <Icon name="timeline" className="text-accent-primary" />
                Voorspelling Instellingen
            </h3>
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-text-muted mb-1">
                        Minimale Kans (%)
                    </label>
                    <input 
                        type="range" 
                        min="5" 
                        max="90" 
                        step="5"
                        value={minProbability}
                        onChange={(e) => setMinProbability(parseInt(e.target.value))}
                        className="w-full accent-accent-primary"
                    />
                </div>
                <div className="bg-bg-page px-4 py-2 rounded-xl font-bold min-w-[3rem] text-center text-text-main">
                    {minProbability}%
                </div>
            </div>
        </div>

        {/* Action Button */}
        <button 
            onClick={handleSearch}
            disabled={loading || !location}
            className="w-full bg-accent-primary hover:bg-accent-hover text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-accent-primary/30 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
            {loading ? <Icon name="sync" className="animate-spin" /> : <Icon name="search" />}
            Zoek Dagen
        </button>

        {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-2xl border border-red-100 dark:border-red-900/50 flex items-center gap-3">
                <Icon name="warning" />
                {error}
            </div>
        )}

        {/* Results */}
        {(matches.length > 0 || predictions.length > 0) && (
            <div className="space-y-8 animate-fade-in">
                {/* Predictions Section */}
                <div className="space-y-4">
                    <h3 className="font-bold text-xl mb-4 flex items-center gap-2 text-text-main">
                        <Icon name="calendar_month" className="text-accent-primary" />
                        Komende Kansen
                    </h3>
                    
                    {predictions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {predictions.map((pred, idx) => (
                                <div key={idx} className={`relative overflow-hidden rounded-2xl p-5 border ${pred.bonus ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-700' : 'bg-bg-card border-border-color'} shadow-sm`}>
                                    {pred.bonus && (
                                        <div className="absolute top-0 right-0 bg-amber-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
                                            BONUS: VAAK REEKS
                                        </div>
                                    )}
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="font-bold text-lg text-text-main">
                                                {pred.startDate}
                                            </div>
                                            {pred.endDate && (
                                                <div className="text-sm text-text-muted">
                                                    tot {pred.endDate}
                                                </div>
                                            )}
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-sm font-bold ${pred.probability > 75 ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : pred.probability > 50 ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' : 'bg-bg-page text-text-muted'}`}>
                                            {pred.probability}%
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        {pred.isSequence && (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400">
                                                <Icon name="history" className="text-sm" />
                                                Reeks
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 text-center bg-bg-page rounded-2xl border border-border-color text-text-muted">
                            <Icon name="search_off" className="text-4xl mb-2 mx-auto opacity-50" />
                            <p>Geen toekomstige dagen gevonden met &gt;{minProbability}% kans op basis van historie.</p>
                            <p className="text-sm mt-1">Probeer de minimale kans te verlagen.</p>
                        </div>
                    )}
                </div>

                {/* Statistics Chart */}
                {chartData.length > 0 && (
                    <div className="space-y-6 mb-10">
                        {/* Summary & Extremes Cards - Now above the chart */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-bg-card p-6 rounded-3xl border border-border-color shadow-sm">
                                <h3 className="text-sm font-bold text-text-main flex items-center gap-2 mb-4">
                                    <Icon name="history" className="text-purple-500" />
                                    Historische Markpunten
                                </h3>
                                <div className="space-y-4">
                                    <div className="p-3 bg-bg-page rounded-xl border border-border-color">
                                        <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-1">Vroegste match ooit</p>
                                        <p className="text-sm font-bold text-text-main">
                                            {milestones.earliest ? formatDateToMilestone(milestones.earliest.date) : '-'}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-bg-page rounded-xl border border-border-color">
                                        <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-1">Laatste match ooit</p>
                                        <p className="text-sm font-bold text-text-main">
                                            {milestones.latest ? formatDateToMilestone(milestones.latest.date) : '-'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-bg-card dark:bg-gradient-to-br dark:from-purple-500 dark:to-indigo-600 p-6 rounded-3xl text-text-main dark:text-white border border-border-color dark:border-none shadow-sm dark:shadow-lg dark:shadow-purple-500/20">
                                <h3 className="text-sm font-bold flex items-center gap-2 mb-4 opacity-90">
                                    <Icon name="analytics" />
                                    Statistieken
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider opacity-70 font-bold">totaal aantal dagen afgelopen 25 jaar die voldoen aan de zoek criteria</p>
                                        <p className="text-2xl font-black">{matches.length}</p>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border-color/10">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider opacity-70 font-bold">Laatste 12 maanden</p>
                                            <p className="text-xl font-bold">
                                                {(() => {
                                                    const twelveMonthsAgo = new Date();
                                                    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
                                                    const count = matches.filter(m => new Date(m.date) >= twelveMonthsAgo).length;
                                                    return `${count} dagen`;
                                                })()}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider opacity-70 font-bold">
                                                Eerste 12 maanden 
                                                <span className="block opacity-60 text-[8px]">
                                                    ({(() => {
                                                        if (matches.length === 0) return '';
                                                        const firstDate = new Date(matches[matches.length - 1].date);
                                                        const endDate = new Date(firstDate);
                                                        endDate.setFullYear(endDate.getFullYear() + 1);
                                                        return `${firstDate.getFullYear()} - ${endDate.getFullYear()}`;
                                                    })()})
                                                </span>
                                            </p>
                                            <p className="text-xl font-bold">
                                                {(() => {
                                                    if (matches.length === 0) return '0 dagen';
                                                    const firstDate = new Date(matches[matches.length - 1].date);
                                                    const endDate = new Date(firstDate);
                                                    endDate.setFullYear(endDate.getFullYear() + 1);
                                                    const count = matches.filter(m => {
                                                        const d = new Date(m.date);
                                                        return d >= firstDate && d <= endDate;
                                                    }).length;
                                                    return `${count} dagen`;
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Chart - Now full width below cards */}
                        <div className="bg-bg-card rounded-3xl p-6 shadow-sm border border-border-color">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                                <div>
                                    <h3 className="font-bold text-lg flex items-center gap-2">
                                        <Icon name="bar_chart" className="text-blue-500" />
                                        Historische Waarschijnlijkheid
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        Kans op een match gebaseerd op het aantal voorkomens per dag in de afgelopen 25 jaar.
                                    </p>
                                </div>
                                
                                <div className="flex bg-bg-subtle p-1 rounded-xl">
                                    {(['day', 'week', 'month'] as const).map((view) => (
                                        <button
                                            key={view}
                                            onClick={() => setChartView(view)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${chartView === view ? 'bg-white dark:bg-slate-700 shadow-sm text-purple-600 dark:text-purple-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                        >
                                            {view === 'day' ? 'Dag' : view === 'week' ? 'Week' : 'Maand'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    {(() => {
                                        const maxVal = Math.max(...chartData.map(d => d.percentage), 0);
                                        let yMax = 100;
                                        if (maxVal <= 25) yMax = 25;
                                        else if (maxVal <= 50) yMax = 50;
                                        else if (maxVal <= 75) yMax = 75;

                                        const ticks = [0, 25, 50, 75, 100].filter(t => t <= yMax);

                                        return (
                                            <BarChart data={chartData}>
                                                <CartesianGrid vertical={false} horizontal={false} />
                                                {Array.from({ length: 20 }, (_, i) => (i + 1) * 5).map((val) => {
                                                    const isMajor = val % 25 === 0;
                                                    return (
                                                        <ReferenceLine
                                                            key={val}
                                                            y={val}
                                                            stroke={isMajor ? "#94a3b8" : "#e2e8f0"}
                                                            strokeWidth={isMajor ? 2 : 1}
                                                            strokeDasharray={isMajor ? undefined : "3 3"}
                                                            opacity={yMax >= val ? 1 : 0}
                                                        />
                                                    );
                                                })}
                                                
                                                <XAxis 
                                                    dataKey="name" 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    tick={{ fill: '#94a3b8', fontSize: 10 }} 
                                                    dy={10}
                                                    interval={chartView === 'day' ? 5 : 0}
                                                    angle={chartView !== 'month' ? -45 : 0}
                                                    textAnchor={chartView !== 'month' ? "end" : "middle"}
                                                    height={chartView !== 'month' ? 60 : 30}
                                                />
                                                <YAxis 
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                                                    tickFormatter={(val) => `${val}%`}
                                                    domain={[0, yMax]}
                                                    ticks={ticks}
                                                />
                                                <Tooltip 
                                                    content={({ active, payload, label }) => {
                                                        if (active && payload && payload.length) {
                                                            return (
                                                                <div className="bg-bg-card/95 border border-border-color/20 p-3 rounded-lg shadow-xl backdrop-blur-sm">
                                                                    <p className="text-white font-medium mb-1">{label}</p>
                                                                    {payload[0].payload.range && (
                                                                        <p className="text-slate-400 text-xs mb-2">{payload[0].payload.range}</p>
                                                                    )}
                                                                    {payload.map((entry, idx) => {
                                                                        // Skip displaying precipDurationPercent if we only want to show Probability
                                                                        if (entry.dataKey === 'precipDurationPercent') return null;
                                                                        return (
                                                                            <div key={idx} className="flex items-center gap-2 mt-1">
                                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                                                                                <p className="text-slate-300 text-sm">
                                                                                    {entry.name}: <span className="text-white font-bold">{entry.value}%</span>
                                                                                </p>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Bar dataKey="percentage" name="Waarschijnlijkheid" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        );
                                    })()}
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* Historical Results */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-xl flex items-center gap-2">
                            <Icon name="history" className="text-slate-400" />
                            laatste 9 recente dagen die voldoen aan zoek criteria
                        </h3>
                        {matches.length > 0 && (
                            <button 
                                onClick={handleExportCSV}
                                className="flex items-center gap-2 px-4 py-2 bg-bg-card hover:bg-bg-subtle text-text-main rounded-xl border border-border-color text-sm font-bold transition-all shadow-sm"
                            >
                                <Icon name="download" className="text-lg" />
                                Export CSV
                            </button>
                        )}
                    </div>
                    
                    {matches.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {matches.slice(0, 9).map((match, idx) => {
                                const isRecent = idx === 0; // Assuming sorted by date desc
                                const daysAgo = Math.floor((new Date().getTime() - new Date(match.date).getTime()) / (1000 * 3600 * 24));
                                
                                return (
                                    <div key={match.date} className={`p-4 rounded-2xl border ${isRecent ? 'bg-bg-card border-accent-primary/30 ring-1 ring-accent-primary/20' : 'bg-bg-page border-transparent'} transition-all`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-bold text-text-main">
                                                {new Date(match.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </div>
                                            {isRecent && (
                                                <span className="bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                    Recent
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-400 mb-3">
                                            {daysAgo} dagen geleden
                                        </div>
                                        <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-sm">
                                            <div className="text-slate-500">Max Temp:</div>
                                            <div className="font-medium text-right">{convertValue(match.data.temperature_2m_max, 'temperature_2m_max', settings).toFixed(1)} {getUnitLabel('temperature_2m_max', settings)}</div>
                                            
                                            <div className="text-slate-500">Min Temp:</div>
                                            <div className="font-medium text-right">{convertValue(match.data.temperature_2m_min, 'temperature_2m_min', settings).toFixed(1)} {getUnitLabel('temperature_2m_min', settings)}</div>
                                            
                                            {match.data.temperature_2m_max > 25 && (
                                                <>
                                                    <div className="text-orange-500/80">Hitte index:</div>
                                                    <div className="font-medium text-right text-orange-600 dark:text-orange-400">
                                                        {convertValue(match.data.apparent_temperature_max, 'temperature_2m_max', settings).toFixed(1)} {getUnitLabel('temperature_2m_max', settings)}
                                                    </div>
                                                </>
                                            )}

                                            {match.data.temperature_2m_min < 10 && (
                                                <>
                                                    <div className="text-blue-500/80">Gevoelstemp:</div>
                                                    <div className="font-medium text-right text-blue-600 dark:text-blue-400">
                                                        {convertValue(match.data.apparent_temperature_min, 'temperature_2m_min', settings).toFixed(1)} {getUnitLabel('temperature_2m_min', settings)}
                                                    </div>
                                                </>
                                            )}

                                            <div className="text-slate-500">Neerslag:</div>
                                            <div className="font-medium text-right">{convertValue(match.data.precipitation_sum, 'precipitation_sum', settings).toFixed(1)} {getUnitLabel('precipitation_sum', settings)}</div>
                                            
                                            <div className="text-slate-500">Windstoot:</div>
                                            <div className="font-medium text-right">
                                                {convertValue(match.data.wind_gusts_10m_max, 'wind_gusts_10m_max', settings).toFixed(1)} {getUnitLabel('wind_gusts_10m_max', settings)}
                                                {settings.windUnit !== WindUnit.KMH && (
                                                    <span className="text-[10px] opacity-60 ml-1">({match.data.wind_gusts_10m_max.toFixed(0)} km/h)</span>
                                                )}
                                                {settings.windUnit === WindUnit.KMH && (
                                                    <span className="text-[10px] opacity-60 ml-1">({kmhToBft(match.data.wind_gusts_10m_max)} Bft)</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                         <div className="p-8 text-center bg-bg-subtle rounded-2xl border border-border-color/20 text-text-muted">
                            <p>Geen historische dagen gevonden die voldoen aan deze criteria.</p>
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>

      {/* Toast Notification */}
        {toast && (
            <div className="fixed bottom-[76px] md:bottom-24 left-1/2 transform -translate-x-1/2 z-[60] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="bg-bg-card/90 backdrop-blur-md text-text-main px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-border-color">
                <Icon name="check_circle" className="text-green-400" />
                <span className="font-bold text-sm">{toast}</span>
            </div>
        </div>
      )}
    </div>
  );
};
