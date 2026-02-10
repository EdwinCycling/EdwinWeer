import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ViewState, AppSettings, Location, WindUnit } from '../types';
import { Icon } from '../components/Icon';
import { fetchHistorical, convertTemp, convertTempPrecise, convertWind, convertPrecip, fetchForecast, fetchYearData, mapWmoCodeToIcon, mapWmoCodeToText, calculateComfortScore, calculateJagTi, calculateHeatIndex, fetchHolidays, fetchHolidaysSmart, Holiday } from '../services/weatherService';
import { loadCurrentLocation, saveCurrentLocation, DEFAULT_SETTINGS } from '../services/storageService';
import { HeatmapComponent } from '../components/HeatmapComponent';
import { TemperatureDistributionChart } from '../components/TemperatureDistributionChart';
import { BaroRibbonChart } from '../components/BaroRibbonChart';
import { SeasonalDistributionChart } from '../components/SeasonalDistributionChart';
import { TemperatureFrequencyChart } from '../components/TemperatureFrequencyChart';
import { RainProbabilityChart } from '../components/RainProbabilityChart';
import { StaticWeatherBackground } from '../components/StaticWeatherBackground';
import { CreditFloatingButton } from '../components/CreditFloatingButton';
import { WeatherRatingButton } from '../components/WeatherRatingButton';
import { ComfortScoreModal } from '../components/ComfortScoreModal';
import { FeelsLikeInfoModal } from '../components/FeelsLikeInfoModal';
import { ClimateScoreModal } from '../components/ClimateScoreModal';
import { getTranslation } from '../services/translations';
import { reverseGeocode, reverseGeocodeFull } from '../services/geoService';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
  Cell,
  LabelList
} from 'recharts';
import { Tooltip as UITooltip } from '../components/Tooltip';

import { VisualStatsBlocks } from '../components/VisualStatsBlocks';

import { MonthlyBoxPlotChart } from '../components/MonthlyBoxPlotChart';
import { MonthlyRainChart } from '../components/MonthlyRainChart';
import { MonthlySunChart } from '../components/MonthlySunChart';
import { ProgressBar } from '../components/ProgressBar';

interface Props {
  onNavigate: (view: ViewState, params?: any) => void;
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
  initialParams?: any;
}

export interface DailyData {
    day: number;
    date: string;
    maxTemp: number | null;
    minTemp: number | null;
    rain: number | null;
    sun: number | null;
    sunHours: number | null;
    daylightHours: number | null;
    cloudCover: number | null;
    windGust: number | null;
    windSpeed: number | null;
    isWeekend: boolean;
}

interface RecordEntry {
  value: number;
  date: string;
  meta?: any;
}

interface TimeTempDiffEntry {
  value: number;
  date: string;
  temp13: number;
  temp22: number;
}

interface YearlyCounts {
  warmDays: number;
  summerDays: number;
  tropicalDays: number;
  frostDays: number;
  iceDays: number;
  dryDays: number;
  rainDays: number;
  heavyRainDays: number;
  veryWetDays: number;
  sunnyDays: number;
  gloomyDays: number;
  stormDays: number;
}

interface FrostInfo {
  firstFrost: DateTemp | null;
  lastFrost: DateTemp | null;
}

interface Streak {
  length: number;
  start: string | null;
  end: string | null;
  temps?: number[];
  days?: string[];
}

interface HeatwaveStreak extends Streak {
  avgMax: number | null;
  avgMin: number | null;
  temps: number[];
}

interface YearlySequences {
  dry: Streak | null;
  wet: Streak | null;
  gloomy: Streak | null;
  heatwave: HeatwaveStreak | null;
  iceStreak: Streak | null;
  streakMaxBelowZero: Streak | null;
  streakMinBelowZero: Streak | null;
  streakMaxBelowFive: Streak | null;
  streakMaxAbove25: Streak | null;
  streakMaxAbove30: Streak | null;
  streakMaxAbove35: Streak | null;
  stableStreak: Streak | null;
}

interface ClimateSeasonStats {
    score: number;
    monthlyScores: { month: string; score: number }[];
    progression?: string;
    seasonState: 'future' | 'active' | 'finished';
    startDate: string;
    endDate: string;
}

interface ClimateNumbers {
    hellmann: ClimateSeasonStats;
    heat: ClimateSeasonStats;
}

interface DiverseRecord {
    value: number;
    day1: string;
    day2: string;
    temp1: number;
    temp2: number;
}

interface DateTemp {
    date: string;
    temp: number;
}

interface ExtremesInfo {
    firstWarm: DateTemp | null;
    lastWarm: DateTemp | null;
    firstNice: DateTemp | null;
    lastNice: DateTemp | null;
    firstSummer: DateTemp | null;
    lastSummer: DateTemp | null;
}

interface DiverseRecords {
    maxRise: DiverseRecord | null;
    maxDrop: DiverseRecord | null;
    maxMinToMaxRise: DiverseRecord | null;
    maxMaxToMinDrop: DiverseRecord | null;
    extremes: ExtremesInfo | null;
    risingStaircase: Streak | null;
    fallingStaircase: Streak | null;
    jojoStreak: Streak | null;
}

interface PeriodRecord {
    start: string;
    end: string;
    weekNr?: number;
    avgValue: number;
    temps: number[];
}

interface PeriodRecords {
    warmestWeekMax: PeriodRecord | null;
    warmestWeekMin: PeriodRecord | null;
    coldestWeekMax: PeriodRecord | null;
    coldestWeekMin: PeriodRecord | null;
    warmestWeekendMax: PeriodRecord | null;
    warmestWeekendMin: PeriodRecord | null;
    coldestWeekendMax: PeriodRecord | null;
    coldestWeekendMin: PeriodRecord | null;
}

interface MonthlyStats {
    maxTempHigh: { value: number, date: string } | null;
    maxTempLow: { value: number, date: string } | null;
    minTempLow: { value: number, date: string } | null;
    totalRain: number;
    totalSun: number;
    sunDays: number;
    frostDays: number;
    iceDays: number;
    summerDays: number;
    tropicalDays: number;
    dryDays: number;
    rainDays: number;
}

export const RecordsWeatherView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings, initialParams }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());

  const formatDateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = { 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long',
          hour: '2-digit',
          minute: '2-digit'
      };
      return now.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-US', options);
  };
  const [recordType, setRecordType] = useState<'12month' | 'yearly' | 'monthly' | 'calendar' | 'heatmap'>('yearly');
  const [heatmapData, setHeatmapData] = useState<{ dates: string[], maxTemps: (number|null)[], minTemps: (number|null)[], precip: (number|null)[], sun: (number|null)[], daylight: (number|null)[] } | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(() => {
      if (initialParams && initialParams.date) {
          return new Date(initialParams.date).getFullYear();
      }
      return new Date().getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
      if (initialParams && initialParams.date) {
          return new Date(initialParams.date).getMonth() + 1;
      }
      return new Date().getMonth() + 1;
  });
  const [externalMonthSelection, setExternalMonthSelection] = useState<boolean>(() => !!(initialParams && initialParams.date));

  const heatmapVisualData = useMemo(() => {
      if (!heatmapData || !heatmapData.dates || heatmapData.dates.length === 0) return null;
      return {
          time: heatmapData.dates,
          temperature_2m_max: heatmapData.maxTemps,
          temperature_2m_min: heatmapData.minTemps,
          precipitation_sum: heatmapData.precip,
          sunshine_duration: heatmapData.sun,
          daylight_duration: heatmapData.daylight
      };
  }, [heatmapData]);

  useEffect(() => {
      if (initialParams && initialParams.date) {
          const dt = new Date(initialParams.date);
          setSelectedYear(dt.getFullYear());
          setSelectedMonth(dt.getMonth() + 1);
          setRecordType('monthly');
          setExternalMonthSelection(true);
      }
  }, [initialParams]);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
      let interval: NodeJS.Timeout;
      if (loading) {
          setProgress(0);
          interval = setInterval(() => {
              setProgress(prev => {
                  if (prev >= 90) return 90; // Stall at 90% until done
                  // Slow down as we get higher
                  const increment = prev < 50 ? 10 : prev < 80 ? 5 : 1;
                  return prev + increment;
              });
          }, 200);
      } else {
          setProgress(100);
      }
      return () => clearInterval(interval);
  }, [loading]);

  const [error, setError] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const getWeekNumber = (d: Date) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
  };

  useEffect(() => {
    if (scrollContainerRef.current) {
        const activeBtn = scrollContainerRef.current.querySelector('[data-active="true"]');
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
  }, [location]);
  const [maxTempHigh, setMaxTempHigh] = useState<RecordEntry[]>([]);
  const [maxTempLow, setMaxTempLow] = useState<RecordEntry[]>([]);
  const [minTempHigh, setMinTempHigh] = useState<RecordEntry[]>([]);
  const [minTempLow, setMinTempLow] = useState<RecordEntry[]>([]);
  const [windGustMax, setWindGustMax] = useState<RecordEntry[]>([]);
  const [rainMax, setRainMax] = useState<RecordEntry[]>([]);
  const [maxAmplitude, setMaxAmplitude] = useState<RecordEntry[]>([]);
  const [minAmplitude, setMinAmplitude] = useState<RecordEntry[]>([]);
  const [monthAmplitude, setMonthAmplitude] = useState<{ value: number, max: number, min: number } | null>(null);
  const [colderAt13Than22, setColderAt13Than22] = useState<TimeTempDiffEntry[]>([]);
  const [yearlyCounts, setYearlyCounts] = useState<YearlyCounts | null>(null);
  const [frostInfo, setFrostInfo] = useState<FrostInfo | null>(null);
  const [yearlySequences, setYearlySequences] = useState<YearlySequences | null>(null);
  const [diverseRecords, setDiverseRecords] = useState<DiverseRecords | null>(null);
  const [periodRecords, setPeriodRecords] = useState<PeriodRecords | null>(null);
  const [heatwaves, setHeatwaves] = useState<HeatwaveStreak[]>([]);
  const [showHeatwaveInfo, setShowHeatwaveInfo] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [currentWeather, setCurrentWeather] = useState<any>(null);
  const [climateNumbers, setClimateNumbers] = useState<ClimateNumbers | null>(null);
  const [showComfortModal, setShowComfortModal] = useState(false);
  const [showFeelsLikeModal, setShowFeelsLikeModal] = useState(false);
  const [showClimateModal, setShowClimateModal] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  useEffect(() => {
    const loadCurrent = async () => {
      try {
        const data = await fetchForecast(location.lat, location.lon);
        setCurrentWeather(data);
      } catch (e) {
        console.error("Failed to load current weather for background", e);
      }
    };
    loadCurrent();
  }, [location]);

  const cycleFavorite = (direction: 'next' | 'prev') => {
      if (settings.favorites.length === 0) return;
      const currentIndex = settings.favorites.findIndex(f => f.name === location.name);
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
      setLocation(settings.favorites[nextIndex]);
  };

  useEffect(() => {
    saveCurrentLocation(location);
  }, [location]);

  useEffect(() => {
      if (recordType === 'monthly' || recordType === 'calendar') {
          if (externalMonthSelection) return;
          const now = new Date();
          setSelectedYear(now.getFullYear());
          setSelectedMonth(now.getMonth() + 1);
          return;
      }
      if (externalMonthSelection) {
          setExternalMonthSelection(false);
      }
  }, [recordType, externalMonthSelection]);

  const t = (key: string, params?: Record<string, string | number>) => getTranslation(key, settings.language, params);

  const currentTemp = currentWeather ? convertTemp(currentWeather.current.temperature_2m, settings.tempUnit) : 0;
  const highTemp = currentWeather ? convertTemp(currentWeather.daily.temperature_2m_max[0], settings.tempUnit) : 0;
  const lowTemp = currentWeather ? convertTemp(currentWeather.daily.temperature_2m_min[0], settings.tempUnit) : 0;

  const jagTi = currentWeather ? calculateJagTi(currentWeather.current.temperature_2m, currentWeather.current.wind_speed_10m) : null;
  const feelsLike = currentWeather 
    ? (jagTi !== null ? convertTempPrecise(jagTi, settings.tempUnit) : convertTempPrecise(currentWeather.current.apparent_temperature, settings.tempUnit))
    : 0;

  const heatIndexRaw = currentWeather ? calculateHeatIndex(currentWeather.current.temperature_2m, currentWeather.current.relative_humidity_2m) : 0;
  const heatIndex = convertTemp(heatIndexRaw, settings.tempUnit);

  const currentComfort = currentWeather ? calculateComfortScore({
      apparent_temperature: currentWeather.current.apparent_temperature,
      temperature_2m: currentWeather.current.temperature_2m,
      wind_speed_10m: currentWeather.current.wind_speed_10m,
      relative_humidity_2m: currentWeather.current.relative_humidity_2m,
      precipitation_sum: currentWeather.daily.precipitation_sum[0] || 0,
      cloud_cover: currentWeather.current.cloud_cover,
      precipitation_probability: currentWeather.daily.precipitation_probability_max?.[0] || 0,
      weather_code: currentWeather.current.weather_code,
      wind_gusts_10m: currentWeather.current.wind_gusts_10m,
      uv_index: currentWeather.daily.uv_index_max?.[0] || 0
  }) : null;

  const parseIsoDateLocal = (dateStr: string): Date | null => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  };

  const navigateToHistoricalSingle = (dateStr: string) => {
    const dt = parseIsoDateLocal(dateStr);
    if (!dt) return;
    saveCurrentLocation(location);
    if (onUpdateSettings) {
      onUpdateSettings({ ...settings, historicalMode: 'single' });
    }
    onNavigate(ViewState.HISTORICAL, { date1: dt });
  };

  const navigateToHistoricalCompare = (date1Str: string, date2Str: string) => {
    const d1 = parseIsoDateLocal(date1Str);
    const d2 = parseIsoDateLocal(date2Str);
    if (!d1 || !d2) return;
    saveCurrentLocation(location);
    if (onUpdateSettings) {
        onUpdateSettings({ ...settings, historicalMode: 'compare' });
    }
    onNavigate(ViewState.HISTORICAL, { date1: d1, date2: d2 });
  };

  const formatTempValue = (valueC: number): string => {
    if (settings.tempUnit === 'F') {
      const f = (valueC * 9) / 5 + 32;
      return f.toFixed(1);
    }
    return valueC.toFixed(1);
  };

  const formatTempDeltaValue = (deltaC: number): string => {
    if (settings.tempUnit === 'F') {
      const f = (deltaC * 9) / 5;
      return f.toFixed(1);
    }
    return deltaC.toFixed(1);
  };

  const formatDateWithDay = (dateStr: string) => {
      const date = new Date(dateStr);
      const lang = settings.language === 'nl' ? 'nl-NL' : 'en-US';
      const dayName = date.toLocaleDateString(lang, { weekday: 'long' });
      const dayNum = date.getDate();
      let suffix = '';
      
      if (settings.language === 'nl') {
          suffix = 'e';
      } else {
          const j = dayNum % 10, k = dayNum % 100;
          if (j === 1 && k !== 11) suffix = "st";
          else if (j === 2 && k !== 12) suffix = "nd";
          else if (j === 3 && k !== 13) suffix = "rd";
          else suffix = "th";
      }
      return `${dayName} ${dayNum}${suffix}`;
  };

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [recordType, selectedYear, selectedMonth, location.lat, location.lon]);

  const fetchRecords = async () => {
    setLoading(true);
    setError('');
    setMaxTempHigh([]);
    setMaxTempLow([]);
    setMinTempHigh([]);
    setMinTempLow([]);
    setRainMax([]);
    setMinAmplitude([]);
    setMonthAmplitude(null);
    setColderAt13Than22([]);
     setYearlyCounts(null);
    setFrostInfo(null);
    setYearlySequences(null);
    setDiverseRecords(null);
    setHeatwaves([]);
    setMonthlyStats(null);
    setDailyData([]);
    setHeatmapData(null);
    setHolidays([]);

    if (recordType === 'yearly') {
        fetchHolidays(selectedYear, settings.countryCode || 'NL').then(setHolidays);
    }
    
    if (recordType === '12month') {
        const now = new Date();
        const y1 = now.getFullYear();
        const y2 = y1 - 1;
        Promise.all([
            fetchHolidays(y1, settings.countryCode || 'NL'),
            fetchHolidays(y2, settings.countryCode || 'NL')
        ]).then(([h1, h2]) => {
            setHolidays([...h1, ...h2]);
        });
    }

    if (recordType === 'heatmap') {
        try {
             const data = await fetchYearData(location.lat, location.lon, selectedYear);
             if (data && data.daily && data.daily.time) {
                 setHeatmapData({
                     dates: data.daily.time,
                     maxTemps: data.daily.temperature_2m_max,
                     minTemps: data.daily.temperature_2m_min,
                     precip: data.daily.precipitation_sum,
                     sun: data.daily.sunshine_duration,
                     daylight: data.daily.daylight_duration
                 });
             } else {
                 setError(t('records.error_no_data_year'));
             }
        } catch (e) {
            console.error(e);
            setError(t('records.error_fetch_data'));
        }
        setLoading(false);
        return;
    }

    // try {
      let startDateStr = '';
      let endDateStr = '';

      if (recordType === '12month') {
        const today = new Date();
        const start = new Date(today);
        start.setFullYear(start.getFullYear() - 1);
        startDateStr = start.toISOString().split('T')[0];
        endDateStr = today.toISOString().split('T')[0];
      } else if (recordType === 'monthly' || recordType === 'calendar') {
        const year = selectedYear;
        const month = selectedMonth;
        const endOfMonth = new Date(year, month, 0);
        const today = new Date();
        
        startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
        
        if (year === today.getFullYear() && month === today.getMonth() + 1) {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            endDateStr = yesterday.toISOString().split('T')[0];
            
            // If today is the 1st, yesterday is previous month, so start > end.
            if (endDateStr < startDateStr) {
                 endDateStr = startDateStr; // Prevent error, but we'll handle empty data later
            }
        } else {
            endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;
        }
      } else {
        const today = new Date();
        const currentYearValue = today.getFullYear();
        const year = selectedYear > currentYearValue ? currentYearValue : selectedYear;
        startDateStr = `${year}-01-01`;
        if (year === currentYearValue) {
            // Use yesterday to avoid partial/forecast data for today
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            endDateStr = yesterday.toISOString().split('T')[0];
            
            // Handle Jan 1st edge case
            if (endDateStr < startDateStr) {
                endDateStr = startDateStr; 
            }
        } else {
          endDateStr = `${year}-12-31`;
        }
      }

      const data = await fetchHistorical(location.lat, location.lon, startDateStr, endDateStr);

      const daily = data?.daily;
      const times: string[] | undefined = daily?.time;
      const maxTemps: number[] | undefined = daily?.temperature_2m_max;
      const minTemps: number[] | undefined = daily?.temperature_2m_min;
      const windGustValues: number[] | undefined = daily?.wind_gusts_10m_max;
      const windSpeedValues: number[] | undefined = daily?.wind_speed_10m_mean;
      const rainValues: number[] | undefined = daily?.precipitation_sum;
      const sunshineValues: number[] | undefined = daily?.sunshine_duration;
      const daylightValues: number[] | undefined = daily?.daylight_duration;

      const hourly = data?.hourly;
      const hourlyTimes: string[] | undefined = hourly?.time;
      const hourlyTemps: number[] | undefined = hourly?.temperature_2m;
      const hourlyCloudCover: number[] | undefined = hourly?.cloud_cover;

      const cloudCoverMeanValues: number[] | undefined = daily?.cloud_cover_mean;

      if (recordType !== 'monthly' && recordType !== 'calendar' && (!times || !maxTemps || !minTemps || times.length === 0)) {
        setError(t('errors.no_data'));
        setLoading(false);
        return;
      }

      if (recordType === 'yearly' || recordType === '12month') {
          const dailyList: DailyData[] = [];
          if (times && maxTemps && minTemps) {
              for(let i=0; i<times.length; i++) {
                  const d = times[i];
                  const tMax = maxTemps[i];
                  const tMin = minTemps[i];
                  const rain = rainValues ? rainValues[i] : 0;
                  const sun = sunshineValues ? sunshineValues[i] : 0;
                  const daylight = daylightValues ? daylightValues[i] : 0;
                  const windGust = windGustValues ? windGustValues[i] : 0;
                  const windSpeed = windSpeedValues ? windSpeedValues[i] : 0;
                  
                  let cloudCover = cloudCoverMeanValues ? cloudCoverMeanValues[i] : null;
                  
                  // If not in daily, try to calculate from hourly
                  if (cloudCover === null && hourlyCloudCover && hourlyTimes) {
                      const dayStart = `${d}T00:00`;
                      const dayEnd = `${d}T23:59`;
                      let sum = 0;
                      let count = 0;
                      for (let j = 0; j < hourlyTimes.length; j++) {
                          if (hourlyTimes[j] >= dayStart && hourlyTimes[j] <= dayEnd) {
                              if (typeof hourlyCloudCover[j] === 'number') {
                                  sum += hourlyCloudCover[j];
                                  count++;
                              }
                          }
                      }
                      if (count > 0) cloudCover = sum / count;
                  }
                  
                  if (typeof tMax !== 'number' || typeof tMin !== 'number') continue;
                  
                  let sunPct = 0;
                  if (daylight > 0) {
                      sunPct = (sun / daylight) * 100;
                      if (sunPct > 100) sunPct = 100;
                  }
                  
                  dailyList.push({
                      day: parseInt(d.split('-')[2]),
                      date: d,
                      maxTemp: convertTemp(tMax, settings.tempUnit),
                      minTemp: convertTemp(tMin, settings.tempUnit),
                      rain: convertPrecip(rain || 0, settings.precipUnit),
                      sun: sunPct,
                      sunHours: sun / 3600,
                      daylightHours: daylight / 3600,
                      cloudCover: cloudCover,
                      windGust: windGust,
                      windSpeed: windSpeed,
                      isWeekend: new Date(d).getDay() === 0 || new Date(d).getDay() === 6
                  });
              }
          }
          setDailyData(dailyList);
      }

      if (recordType === 'monthly' || recordType === 'calendar') {
          const recordThresholds = settings.recordThresholds || DEFAULT_SETTINGS.recordThresholds || {
            summerStreakTemp: 25,
            niceStreakTemp: 20,
            coldStreakTemp: 5,
            iceStreakTemp: 0
          };
          const heatwaveSettings = { ...DEFAULT_SETTINGS.heatwave, ...(settings.heatwave || {}) };
          
          let maxTempHighVal = -Infinity;
          let maxTempHighDate = '';
          let maxTempLowVal = Infinity;
          let maxTempLowDate = '';
          let minTempLowVal = Infinity;
          let minTempLowDate = '';
          let totalRain = 0;
          let totalSun = 0;
          let sunDays = 0;
          let frostDays = 0;
          let iceDays = 0;
          let summerDays = 0;
          let tropicalDays = 0;
          let dryDays = 0;
          let rainDays = 0;
          
          const dailyDataList: DailyData[] = [];

          const dataMap = new Map<string, { tMax: number, tMin: number, rain: number, sun: number, cloudCover: number | null, daylight: number, windGust: number, windSpeed: number }>();
          if (times && maxTemps && minTemps) {
              for(let i=0; i<times.length; i++) {
                  const d = times[i];
                  let cloudCover = cloudCoverMeanValues ? cloudCoverMeanValues[i] : null;

                  // If not in daily, try to calculate from hourly
                  if (cloudCover === null && hourlyCloudCover && hourlyTimes) {
                      const dayStart = `${d}T00:00`;
                      const dayEnd = `${d}T23:59`;
                      let sum = 0;
                      let count = 0;
                      for (let j = 0; j < hourlyTimes.length; j++) {
                          if (hourlyTimes[j] >= dayStart && hourlyTimes[j] <= dayEnd) {
                              if (typeof hourlyCloudCover[j] === 'number') {
                                  sum += hourlyCloudCover[j];
                                  count++;
                              }
                          }
                      }
                      if (count > 0) cloudCover = sum / count;
                  }

                  dataMap.set(d, {
                      tMax: maxTemps[i],
                      tMin: minTemps[i],
                      rain: rainValues ? rainValues[i] : 0,
                      sun: sunshineValues ? sunshineValues[i] : 0,
                      cloudCover: cloudCover,
                      daylight: daylightValues ? daylightValues[i] : 0,
                      windGust: windGustValues ? windGustValues[i] : 0,
                      windSpeed: windSpeedValues ? windSpeedValues[i] : 0
                  });
              }
          }
          
          const year = selectedYear;
          const month = selectedMonth;
          const daysInMonth = new Date(year, month, 0).getDate();

          for (let d = 1; d <= daysInMonth; d++) {
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dateObj = new Date(dateStr);
              const entry = dataMap.get(dateStr);
              
              if (entry && typeof entry.tMax === 'number' && typeof entry.tMin === 'number') {
                  const { tMax, tMin, rain, sun, cloudCover, daylight, windGust, windSpeed } = entry;

                  if (tMax > maxTempHighVal) { maxTempHighVal = tMax; maxTempHighDate = dateStr; }
                  if (tMax < maxTempLowVal) { maxTempLowVal = tMax; maxTempLowDate = dateStr; }
                  if (tMin < minTempLowVal) { minTempLowVal = tMin; minTempLowDate = dateStr; }
                  
                  if (rain) totalRain += rain;
                  if (sun) totalSun += sun / 3600;
                  if (sun > 14400) sunDays++;
                  
                  if (tMin < 0) frostDays++;
                  if (tMax <= 0) iceDays++;
                  if (tMax >= recordThresholds.summerStreakTemp) summerDays++;
                  if (tMax >= heatwaveSettings.heatThreshold) tropicalDays++;
                  if ((rain || 0) < 0.2) dryDays++;
                  if ((rain || 0) >= 0.2) rainDays++;

                  let sunPct = 0;
                  if (daylight > 0) {
                      sunPct = (sun / daylight) * 100;
                      if (sunPct > 100) sunPct = 100;
                  }
                  
                  dailyDataList.push({
                      day: d,
                      date: dateStr,
                      maxTemp: convertTemp(tMax, settings.tempUnit),
                      minTemp: convertTemp(tMin, settings.tempUnit),
                      rain: convertPrecip(rain || 0, settings.precipUnit),
                      sun: sunPct,
                      sunHours: sun / 3600,
                      daylightHours: daylight / 3600,
                      cloudCover: cloudCover,
                      windGust: windGust,
                      windSpeed: windSpeed,
                      isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6
                  });
              } else {
                  dailyDataList.push({
                      day: d,
                      date: dateStr,
                      maxTemp: null,
                      minTemp: null,
                      rain: null,
                      sun: null,
                      sunHours: null,
                      daylightHours: null,
                      cloudCover: null,
                      windGust: null,
                      windSpeed: null,
                      isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6
                  });
              }
          }
          
          setMonthlyStats({
              maxTempHigh: maxTempHighVal > -Infinity ? { value: maxTempHighVal, date: maxTempHighDate } : null,
              maxTempLow: maxTempLowVal < Infinity ? { value: maxTempLowVal, date: maxTempLowDate } : null,
              minTempLow: minTempLowVal < Infinity ? { value: minTempLowVal, date: minTempLowDate } : null,
              totalRain,
              totalSun,
              sunDays,
              frostDays,
              iceDays,
              summerDays,
              tropicalDays,
              dryDays,
              rainDays
          });
          setDailyData(dailyDataList);
          setLoading(false);
          return;
      }

      const buildEntries = (values?: number[]): RecordEntry[] => {
        if (!values || !times) return [];
        const entries: RecordEntry[] = [];
        for (let i = 0; i < times.length; i++) {
          const v = values[i];
          const d = times[i];
          if (typeof v === 'number' && !Number.isNaN(v) && typeof d === 'string' && d) {
            entries.push({ value: v, date: d });
          }
        }
        return entries;
      };

      const sortDesc = (entries: RecordEntry[]): RecordEntry[] =>
        [...entries].sort((a, b) => b.value - a.value).slice(0, 3);

      const sortAsc = (entries: RecordEntry[]): RecordEntry[] =>
        [...entries].sort((a, b) => a.value - b.value).slice(0, 3);

      const maxTempEntries = buildEntries(maxTemps);
      const minTempEntries = buildEntries(minTemps);

      const windGustEntries = buildEntries(windGustValues);
      const rainEntries = buildEntries(rainValues);

      const amplitudeEntries: RecordEntry[] = [];
      for (let i = 0; i < times.length; i++) {
        const tMax = maxTemps[i];
        const tMin = minTemps[i];
        if (typeof tMax === 'number' && !Number.isNaN(tMax) && typeof tMin === 'number' && !Number.isNaN(tMin)) {
             amplitudeEntries.push({ 
                 value: tMax - tMin, 
                 date: times[i],
                 meta: { max: tMax, min: tMin }
             });
        }
      }

      if (maxTempEntries.length === 0 || minTempEntries.length === 0) {
        setError(t('errors.no_data'));
        return;
      }

      setMaxTempHigh(sortDesc(maxTempEntries));
      setMaxTempLow(sortAsc(maxTempEntries));
      setMinTempHigh(sortDesc(minTempEntries));
      setMinTempLow(sortAsc(minTempEntries));
      setWindGustMax(sortDesc(windGustEntries));
      setRainMax(sortDesc(rainEntries));
      setMaxAmplitude(sortDesc(amplitudeEntries));
      setMinAmplitude(sortAsc(amplitudeEntries));

      // Calculate Month Amplitude (Max of month - Min of month)
      // We use the absolute max and absolute min from the sorted lists
      // maxTempHigh is sorted Desc (index 0 is highest)
      // minTempLow is sorted Asc (index 0 is lowest)
      const highestMax = maxTempEntries.length > 0 ? Math.max(...maxTempEntries.map(e => e.value)) : null;
      const lowestMin = minTempEntries.length > 0 ? Math.min(...minTempEntries.map(e => e.value)) : null;
      
      if (highestMax !== null && lowestMin !== null) {
          setMonthAmplitude({
              value: highestMax - lowestMin,
              max: highestMax,
              min: lowestMin
          });
      }



      if (hourlyTimes && hourlyTemps && hourlyTimes.length === hourlyTemps.length) {
        const byDay = new Map<string, { t13?: number; t22?: number }>();
        for (let i = 0; i < hourlyTimes.length; i++) {
          const ts = hourlyTimes[i];
          const temp = hourlyTemps[i];
          if (typeof ts !== 'string' || ts.length < 13) continue;
          if (typeof temp !== 'number' || Number.isNaN(temp)) continue;

          const dateKey = ts.slice(0, 10);
          const hourStr = ts.slice(11, 13);
          const hour = Number(hourStr);
          if (!Number.isFinite(hour)) continue;

          if (hour !== 13 && hour !== 22) continue;
          const cur = byDay.get(dateKey) || {};
          if (hour === 13) cur.t13 = temp;
          if (hour === 22) cur.t22 = temp;
          byDay.set(dateKey, cur);
        }

        const entries: TimeTempDiffEntry[] = [];
        for (const [date, temps] of byDay.entries()) {
          if (typeof temps.t13 !== 'number' || typeof temps.t22 !== 'number') continue;
          if (!(temps.t13 < temps.t22)) continue;
          entries.push({
            date,
            value: temps.t22 - temps.t13,
            temp13: temps.t13,
            temp22: temps.t22,
          });
        }
        setColderAt13Than22([...entries].sort((a, b) => b.value - a.value).slice(0, 3));
      }

      // Calculate diverse records (rise/drop)
      let maxRiseVal = -Infinity;
      let maxRiseDay1 = '';
      let maxRiseDay2 = '';
      let maxRiseTemp1 = 0;
      let maxRiseTemp2 = 0;

      let maxDropVal = -Infinity;
      let maxDropDay1 = '';
      let maxDropDay2 = '';
      let maxDropTemp1 = 0;
      let maxDropTemp2 = 0;

      let maxMinToMaxRiseVal = -Infinity;
      let maxMinToMaxRiseDay1 = '';
      let maxMinToMaxRiseDay2 = '';
      let maxMinToMaxRiseTemp1 = 0;
      let maxMinToMaxRiseTemp2 = 0;

      let maxMaxToMinDropVal = -Infinity;
      let maxMaxToMinDropDay1 = '';
      let maxMaxToMinDropDay2 = '';
      let maxMaxToMinDropTemp1 = 0;
      let maxMaxToMinDropTemp2 = 0;

      for (let i = 0; i < times.length - 1; i++) {
        const tMax1 = maxTemps[i];
        const tMax2 = maxTemps[i+1];
        
        // Rise/Drop (Max vs Max)
        if (typeof tMax1 === 'number' && !Number.isNaN(tMax1) && typeof tMax2 === 'number' && !Number.isNaN(tMax2)) {
             const diff = tMax2 - tMax1;
             
             // Rise
             if (diff > maxRiseVal) {
                 maxRiseVal = diff;
                 maxRiseDay1 = times[i];
                 maxRiseDay2 = times[i+1];
                 maxRiseTemp1 = tMax1;
                 maxRiseTemp2 = tMax2;
             }

             // Drop
             const drop = tMax1 - tMax2;
             if (drop > maxDropVal) {
                 maxDropVal = drop;
                 maxDropDay1 = times[i];
                 maxDropDay2 = times[i+1];
                 maxDropTemp1 = tMax1;
                 maxDropTemp2 = tMax2;
             }
        }

        // Min to Max Rise (Min Day 1 to Max Day 2)
        const tMin1 = minTemps[i];
        if (typeof tMin1 === 'number' && !Number.isNaN(tMin1) && typeof tMax2 === 'number' && !Number.isNaN(tMax2)) {
            const rise = tMax2 - tMin1;
            if (rise > maxMinToMaxRiseVal) {
                maxMinToMaxRiseVal = rise;
                maxMinToMaxRiseDay1 = times[i];
                maxMinToMaxRiseDay2 = times[i+1];
                maxMinToMaxRiseTemp1 = tMin1;
                maxMinToMaxRiseTemp2 = tMax2;
            }
        }

        // Max to Min Drop (Max Day 1 to Min Day 2)
        const tMin2 = minTemps[i+1];
        if (typeof tMax1 === 'number' && !Number.isNaN(tMax1) && typeof tMin2 === 'number' && !Number.isNaN(tMin2)) {
            const drop = tMax1 - tMin2;
            if (drop > maxMaxToMinDropVal) {
                maxMaxToMinDropVal = drop;
                maxMaxToMinDropDay1 = times[i];
                maxMaxToMinDropDay2 = times[i+1];
                maxMaxToMinDropTemp1 = tMax1;
                maxMaxToMinDropTemp2 = tMin2;
            }
        }
      }

      setDiverseRecords({
          maxRise: maxRiseVal > -Infinity ? { value: maxRiseVal, day1: maxRiseDay1, day2: maxRiseDay2, temp1: maxRiseTemp1, temp2: maxRiseTemp2 } : null,
          maxDrop: maxDropVal > -Infinity ? { value: maxDropVal, day1: maxDropDay1, day2: maxDropDay2, temp1: maxDropTemp1, temp2: maxDropTemp2 } : null,
          maxMinToMaxRise: maxMinToMaxRiseVal > -Infinity ? { value: maxMinToMaxRiseVal, day1: maxMinToMaxRiseDay1, day2: maxMinToMaxRiseDay2, temp1: maxMinToMaxRiseTemp1, temp2: maxMinToMaxRiseTemp2 } : null,
          maxMaxToMinDrop: maxMaxToMinDropVal > -Infinity ? { value: maxMaxToMinDropVal, day1: maxMaxToMinDropDay1, day2: maxMaxToMinDropDay2, temp1: maxMaxToMinDropTemp1, temp2: maxMaxToMinDropTemp2 } : null,
          extremes: null,
          risingStaircase: null,
          fallingStaircase: null,
          jojoStreak: null
      });

      if (recordType === 'yearly' || recordType === '12month') {
        const recordThresholds = settings.recordThresholds || DEFAULT_SETTINGS.recordThresholds;
        const frostThreshold = settings.tempUnit === 'F' ? 32 : 0;
        const warmThreshold = convertTemp(20, settings.tempUnit);
        const summerThreshold = convertTemp(25, settings.tempUnit);
        const tropicalThreshold = convertTemp(30, settings.tempUnit);
        const niceThreshold = convertTemp(18, settings.tempUnit);
        const rainThreshold = convertPrecip(0.2, settings.precipUnit);
        const heavyRainThreshold = convertPrecip(10, settings.precipUnit);
        const veryWetThreshold = convertPrecip(20, settings.precipUnit);
        const dryThreshold = convertPrecip(0.2, settings.precipUnit);

        let longestDayIndex = -1;
        let longestDaySeconds = -1;

        if (daylightValues && daylightValues.length === times.length) {
          for (let i = 0; i < daylightValues.length; i++) {
            const v = daylightValues[i];
            if (typeof v === 'number' && !Number.isNaN(v) && v > longestDaySeconds) {
              longestDaySeconds = v;
              longestDayIndex = i;
            }
          }
        }

        if (longestDayIndex === -1 && times.length > 0) {
            // Fallback: approximate June 21st
            const target = '-06-21';
            const idx = times.findIndex(t => t.includes(target));
            if (idx !== -1) longestDayIndex = idx;
            else longestDayIndex = Math.floor(times.length / 2);
        }

        let warmDays = 0;
        let summerDays = 0;
        let tropicalDays = 0;
        let frostDays = 0;
        let iceDays = 0;
        let dryDays = 0;
        let rainDays = 0;
        let heavyRainDays = 0;
        let veryWetDays = 0;
        let sunnyDays = 0;
        let gloomyDays = 0;

        let firstFrost: { date: string, temp: number } | null = null;
        let lastFrost: { date: string, temp: number } | null = null;
        let firstFrostAfterLongest: { date: string, temp: number } | null = null;
        let lastFrostBeforeLongest: { date: string, temp: number } | null = null;
        
        // Absolute year records
        let absFirstFrost: { date: string, temp: number } | null = null;
        let absLastFrost: { date: string, temp: number } | null = null;
        let firstWarmDay: { date: string, temp: number } | null = null;
        let lastWarmDay: { date: string, temp: number } | null = null;
        let firstSummerDay: { date: string, temp: number } | null = null;
        let lastSummerDay: { date: string, temp: number } | null = null;
        // User request: "Last day of year warmer than (summer series) (use warm threshold)"
        // This is confusing. "Warmer than summer series" implies warmer than 25. "Use warm threshold" implies 20.
        // I will implement:
        // 1. Last/First day >= 20 (Warm)
        // 2. Last/First day >= 25 (Summer) - keeping it distinct for clarity, or following the "use warm threshold" strictly for the "summer series" label?
        // Let's stick to the definitions: Warm=20, Summer=25.
        // But I will add the specific requested "First/Last day warmer than X" cards.
        
        let firstNiceDay: { date: string, temp: number } | null = null;
        let lastNiceDay: { date: string, temp: number } | null = null;

        let stormDays = 0; // >= 9 Bft (approx 75 km/h)

        const maxTempsConverted: number[] = [];

        const minTempsConverted: number[] = [];
        const rainConverted: number[] = [];
        const sunshineHours: number[] = [];

        for (let i = 0; i < times.length; i++) {
          const loopTMax = maxTemps[i];
          const loopTMin = minTemps[i];
          const rain = rainValues ? rainValues[i] : null;
          const sun = sunshineValues ? sunshineValues[i] : null;
          const windGust = windGustValues ? windGustValues[i] : NaN;
          const date = times[i];
          
          // Storm Check: >= 9 Bft. 9 Bft starts at 75 km/h.
          if (typeof windGust === 'number' && !Number.isNaN(windGust)) {
              if (windGust >= 75) { // 9 Bft threshold
                  stormDays += 1;
              }
          }

          if (typeof loopTMax !== 'number' || Number.isNaN(loopTMax) || typeof loopTMin !== 'number' || Number.isNaN(loopTMin)) {
            maxTempsConverted.push(NaN);
            minTempsConverted.push(NaN);
            rainConverted.push(NaN);
            sunshineHours.push(NaN);
            continue;
          }

          const maxVal = convertTempPrecise(loopTMax, settings.tempUnit);
          const minVal = convertTempPrecise(loopTMin, settings.tempUnit);
          const rainVal =
            typeof rain === 'number' && !Number.isNaN(rain) ? convertPrecip(rain, settings.precipUnit) : NaN;
          const sunHours =
            typeof sun === 'number' && !Number.isNaN(sun) ? sun / 3600 : NaN;

          maxTempsConverted.push(maxVal);
          minTempsConverted.push(minVal);
          rainConverted.push(rainVal);
          sunshineHours.push(sunHours);

          if (maxVal >= warmThreshold) {
              warmDays += 1;
              if (!firstWarmDay) firstWarmDay = { date, temp: maxVal };
              lastWarmDay = { date, temp: maxVal };
          }
          if (maxVal >= niceThreshold) {
              if (!firstNiceDay) firstNiceDay = { date, temp: maxVal };
              lastNiceDay = { date, temp: maxVal };
          }
          if (maxVal >= summerThreshold) {
              summerDays += 1;
              if (!firstSummerDay) firstSummerDay = { date, temp: maxVal };
              lastSummerDay = { date, temp: maxVal };
          }
          if (maxVal >= tropicalThreshold) tropicalDays += 1;
          
          if (minVal < frostThreshold) {
            frostDays += 1;
            
            // Track absolute first/last frost for fallback
            if (!absFirstFrost) absFirstFrost = { date, temp: minVal };
            absLastFrost = { date, temp: minVal };

            if (longestDayIndex >= 0) {
              if (i > longestDayIndex) {
                if (!firstFrostAfterLongest) {
                  firstFrostAfterLongest = { date, temp: minVal };
                }
              } else if (i < longestDayIndex) {
                lastFrostBeforeLongest = { date, temp: minVal };
              }
            } else {
              if (!firstFrostAfterLongest) {
                firstFrostAfterLongest = { date, temp: minVal };
              }
              lastFrostBeforeLongest = { date, temp: minVal };
            }
          }
          if (maxVal <= frostThreshold) {
            iceDays += 1;
          }
          if (!Number.isNaN(rainVal)) {
            if (rainVal < dryThreshold) {
              dryDays += 1;
            }
            if (rainVal >= rainThreshold) {
              rainDays += 1;
            }
            if (rainVal >= heavyRainThreshold) {
              heavyRainDays += 1;
            }
            if (rainVal >= veryWetThreshold) {
              veryWetDays += 1;
            }
          }
          if (!Number.isNaN(sunHours)) {
            if (sunHours >= 8) {
              sunnyDays += 1;
            }
            if (sunHours <= 1) {
              gloomyDays += 1;
            }
          }
        }

        if (firstFrostAfterLongest || lastFrostBeforeLongest) {
             firstFrost = firstFrostAfterLongest;
             lastFrost = lastFrostBeforeLongest;
        } else {
             firstFrost = absFirstFrost;
             lastFrost = absLastFrost;
        }

        const findStreak = (
          values: number[],
          dates: string[],
          condition: (value: number) => boolean,
          minLength: number = 2
        ): Streak | null => {
          if (!values.length || values.length !== dates.length) return null;

          let bestLength = 0;
          let bestStartIndex = -1;
          let bestEndIndex = -1;
          let currentLength = 0;
          let currentStartIndex = -1;

          for (let i = 0; i < values.length; i++) {
            const v = values[i];
            const ok = typeof v === 'number' && !Number.isNaN(v) && condition(v);

            if (ok) {
              if (currentLength === 0) {
                currentStartIndex = i;
              }
              currentLength += 1;
            } else if (currentLength > 0) {
              if (currentLength > bestLength) {
                bestLength = currentLength;
                bestStartIndex = currentStartIndex;
                bestEndIndex = i - 1;
              }
              currentLength = 0;
              currentStartIndex = -1;
            }
          }

          if (currentLength > 0 && currentLength > bestLength) {
            bestLength = currentLength;
            bestStartIndex = currentStartIndex;
            bestEndIndex = values.length - 1;
          }

          if (bestLength < minLength || bestStartIndex < 0 || bestEndIndex < 0) {
            return null;
          }

          const startDate = dates[bestStartIndex] ?? null;
          const endDate = dates[bestEndIndex] ?? null;

          return {
            length: bestLength,
            start: startDate,
            end: endDate,
          };
        };

        const dryStreak = findStreak(rainConverted, times, v => v <= dryThreshold);
        const wetStreak = findStreak(rainConverted, times, v => v >= rainThreshold);
        const gloomyStreak = findStreak(sunshineHours, times, v => v <= 1);
        
        // Stable Streak (Max temp variation <= 2)
        const findStableStreak = (values: number[], dates: string[], maxDiff: number): Streak | null => {
            if (!values.length || values.length !== dates.length) return null;
            let bestLength = 0;
            let bestStart = -1;
            let bestEnd = -1;
            
            // Pre-round values to 1 decimal for stable calculation
            const roundedValues = values.map(v => typeof v === 'number' ? parseFloat(v.toFixed(1)) : v);

            for (let i = 0; i < roundedValues.length; i++) {
                let minVal = roundedValues[i];
                let maxVal = roundedValues[i];
                if (Number.isNaN(minVal)) continue;

                for (let j = i; j < roundedValues.length; j++) {
                    const v = roundedValues[j];
                    if (Number.isNaN(v)) break;
                    
                    minVal = Math.min(minVal, v);
                    maxVal = Math.max(maxVal, v);
                    
                    if (maxVal - minVal <= maxDiff) {
                        const len = j - i + 1;
                        if (len > bestLength) {
                            bestLength = len;
                            bestStart = i;
                            bestEnd = j;
                        }
                    } else {
                        break;
                    }
                }
            }
            
            if (bestLength < 3) return null;
            
            return {
                length: bestLength,
                start: dates[bestStart],
                end: dates[bestEnd],
                temps: roundedValues.slice(bestStart, bestEnd + 1),
                days: dates.slice(bestStart, bestEnd + 1)
            };
        };

        const stableStreak = findStableStreak(maxTempsConverted, times, 3);
        
        const iceStreak = findStreak(maxTempsConverted, times, v => v <= recordThresholds.iceStreakTemp);

        const streakMaxBelowZero = findStreak(maxTempsConverted, times, v => v <= (settings.tempUnit === 'F' ? 32 : 0));
        const streakMinBelowZero = findStreak(minTempsConverted, times, v => v <= (settings.tempUnit === 'F' ? 32 : 0));
        const streakMaxBelowFive = findStreak(maxTempsConverted, times, v => v <= (settings.tempUnit === 'F' ? 41 : 5));
        const streakMaxAbove25 = findStreak(maxTempsConverted, times, v => v >= (settings.tempUnit === 'F' ? 77 : 25));
        const streakMaxAbove30 = findStreak(maxTempsConverted, times, v => v >= (settings.tempUnit === 'F' ? 86 : 30));
        const streakMaxAbove35 = findStreak(maxTempsConverted, times, v => v >= (settings.tempUnit === 'F' ? 95 : 35));

        // Staircase streaks (Oplopende / Aflopende trap)
        const findStaircaseStreak = (values: number[], dates: string[], direction: 'up' | 'down'): Streak | null => {
            if (values.length < 2) return null;
            let bestLength = 0;
            let bestStart = -1;
            let bestEnd = -1;
            let currentLength = 1;
            let currentStart = 0;

            for (let i = 1; i < values.length; i++) {
                const prev = values[i-1];
                const curr = values[i];
                if (Number.isNaN(prev) || Number.isNaN(curr)) {
                    currentLength = 1;
                    currentStart = i;
                    continue;
                }

                const ok = direction === 'up' ? curr > prev : curr < prev;
                if (ok) {
                    currentLength++;
                    if (currentLength > bestLength) {
                        bestLength = currentLength;
                        bestStart = currentStart;
                        bestEnd = i;
                    }
                } else {
                    currentLength = 1;
                    currentStart = i;
                }
            }

            if (bestLength < 2) return null;
            return {
                length: bestLength,
                start: dates[bestStart],
                end: dates[bestEnd],
                temps: values.slice(bestStart, bestEnd + 1),
                days: dates.slice(bestStart, bestEnd + 1)
            };
        };

        const risingStaircase = findStaircaseStreak(maxTempsConverted, times, 'up');
        const fallingStaircase = findStaircaseStreak(maxTempsConverted, times, 'down');

        // JoJo Streak (Alternating warm/cold)
        const findJoJoStreak = (values: number[], dates: string[]): Streak | null => {
            if (values.length < 3) return null;
            let bestLength = 0;
            let bestStart = -1;
            let bestEnd = -1;
            let currentLength = 1;
            let currentStart = 0;
            // 0 = unknown, 1 = going up, -1 = going down
            let lastDirection = 0; 

            for (let i = 1; i < values.length; i++) {
                const prev = values[i-1];
                const curr = values[i];
                if (Number.isNaN(prev) || Number.isNaN(curr) || prev === curr) {
                    currentLength = 1;
                    currentStart = i;
                    lastDirection = 0;
                    continue;
                }

                const direction = curr > prev ? 1 : -1;
                
                if (lastDirection === 0) {
                     // Start of a potential sequence
                     lastDirection = direction;
                     currentLength++;
                } else if (direction !== lastDirection) {
                     // Alternated successfully
                     lastDirection = direction;
                     currentLength++;
                     if (currentLength > bestLength) {
                         bestLength = currentLength;
                         bestStart = currentStart;
                         bestEnd = i;
                     }
                } else {
                     // Same direction twice - sequence broken
                     // But the last two points form a valid start for a new sequence (length 2)
                     currentLength = 2;
                     currentStart = i - 1;
                     lastDirection = direction;
                }
            }

            if (bestLength < 3) return null;
            return {
                length: bestLength,
                start: dates[bestStart],
                end: dates[bestEnd],
                temps: values.slice(bestStart, bestEnd + 1),
                days: dates.slice(bestStart, bestEnd + 1)
            };
        };

        const jojoStreak = findJoJoStreak(maxTempsConverted, times);

        // Ensure we have all heatwave settings, falling back to defaults if missing
        const heatwaveSettings = { ...DEFAULT_SETTINGS.heatwave, ...(settings.heatwave || {}) };

        const foundHeatwaves: HeatwaveStreak[] = [];

        let currentLength = 0;
        let currentStartIndex = -1;
        let currentHeatDays = 0;
        let currentSumMax = 0;
        let currentSumMin = 0;
        let currentTemps: number[] = [];

        for (let i = 0; i < times.length; i++) {
          const tMax = maxTemps[i];
          const tMin = minTemps[i];

          const maxVal =
            typeof tMax === 'number' && !Number.isNaN(tMax) ? tMax : NaN;
          const minVal =
            typeof tMin === 'number' && !Number.isNaN(tMin) ? tMin : NaN;

          if (Number.isNaN(maxVal) || Number.isNaN(minVal)) {
            if (currentLength > 0) {
              if (
                currentLength >= heatwaveSettings.minLength &&
                currentHeatDays >= heatwaveSettings.minHeatDays
              ) {
                foundHeatwaves.push({
                  length: currentLength,
                  start: times[currentStartIndex],
                  end: times[i - 1],
                  avgMax: parseFloat((currentSumMax / currentLength).toFixed(1)),
                  avgMin: parseFloat((currentSumMin / currentLength).toFixed(1)),
                  temps: [...currentTemps],
                });
              }
              currentLength = 0;
              currentStartIndex = -1;
              currentHeatDays = 0;
              currentSumMax = 0;
              currentSumMin = 0;
              currentTemps = [];
            }
            continue;
          }

          if (maxVal >= heatwaveSettings.lowerThreshold) {
            if (currentLength === 0) {
              currentStartIndex = i;
            }
            currentLength += 1;
            currentSumMax += maxVal;
            currentSumMin += minVal;
            currentTemps.push(maxVal);
            if (maxVal >= heatwaveSettings.heatThreshold) {
              currentHeatDays += 1;
            }
          } else if (currentLength > 0) {
            if (
              currentLength >= heatwaveSettings.minLength &&
              currentHeatDays >= heatwaveSettings.minHeatDays
            ) {
              foundHeatwaves.push({
                length: currentLength,
                start: times[currentStartIndex],
                end: times[i - 1],
                avgMax: parseFloat((currentSumMax / currentLength).toFixed(1)),
                avgMin: parseFloat((currentSumMin / currentLength).toFixed(1)),
                temps: [...currentTemps],
              });
            }
            currentLength = 0;
            currentStartIndex = -1;
            currentHeatDays = 0;
            currentSumMax = 0;
            currentSumMin = 0;
            currentTemps = [];
          }
        }

        if (
          currentLength > 0 &&
          currentLength >= heatwaveSettings.minLength &&
          currentHeatDays >= heatwaveSettings.minHeatDays
        ) {
          foundHeatwaves.push({
            length: currentLength,
            start: times[currentStartIndex],
            end: times[times.length - 1],
            avgMax: parseFloat((currentSumMax / currentLength).toFixed(1)),
            avgMin: parseFloat((currentSumMin / currentLength).toFixed(1)),
            temps: [...currentTemps],
          });
        }

        // Sort by length (descending)
        foundHeatwaves.sort((a, b) => b.length - a.length);
        setHeatwaves(foundHeatwaves);

        setYearlyCounts({
          warmDays,
          summerDays,
          tropicalDays,
          frostDays,
          iceDays,
          dryDays,
          rainDays,
          heavyRainDays,
          veryWetDays,
          sunnyDays,
          gloomyDays,
          stormDays,
        });

        setDiverseRecords(prev => ({
            ...prev!,
            extremes: {
                firstWarm: firstWarmDay,
                lastWarm: lastWarmDay,
                firstNice: firstNiceDay,
                lastNice: lastNiceDay,
                firstSummer: firstSummerDay,
                lastSummer: lastSummerDay
            },
            risingStaircase,
            fallingStaircase,
            jojoStreak
        }));

        setFrostInfo({
          firstFrost,
          lastFrost,
        });

        setYearlySequences({
          dry: dryStreak,
          wet: wetStreak,
          gloomy: gloomyStreak,
          heatwave: null,
          iceStreak,
          streakMaxBelowZero,
          streakMinBelowZero,
          streakMaxBelowFive,
          streakMaxAbove25,
          streakMaxAbove30,
          streakMaxAbove35,
          stableStreak,
        });

        // Calculate Perioden (Weeks and Weekends)
        const weekStartDay = settings.weekStartDay === 'sunday' ? 0 : settings.weekStartDay === 'saturday' ? 6 : 1;
        
        const weeks: { [key: string]: { maxs: number[], mins: number[], start: string, end: string, weekNr: number } } = {};
        const weekends: { [key: string]: { maxs: number[], mins: number[], start: string, end: string } } = {};

        for (let i = 0; i < times.length; i++) {
            const date = new Date(times[i]);
            const dayOfWeek = date.getDay();
            const tMax = maxTemps[i];
            const tMin = minTemps[i];

            if (typeof tMax !== 'number' || Number.isNaN(tMax) || typeof tMin !== 'number' || Number.isNaN(tMin)) continue;

            // Weekly grouping
            const diff = (dayOfWeek - weekStartDay + 7) % 7;
            const startOfWeek = new Date(date);
            startOfWeek.setDate(date.getDate() - diff);
            const weekKey = startOfWeek.toISOString().split('T')[0];

            if (!weeks[weekKey]) {
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                weeks[weekKey] = {
                    maxs: [],
                    mins: [],
                    start: weekKey,
                    end: endOfWeek.toISOString().split('T')[0],
                    weekNr: getWeekNumber(startOfWeek)
                };
            }
            weeks[weekKey].maxs.push(tMax);
            weeks[weekKey].mins.push(tMin);

            // Weekend grouping (Saturday and Sunday only)
            if (dayOfWeek === 6 || dayOfWeek === 0) {
                const satDate = new Date(date);
                if (dayOfWeek === 0) satDate.setDate(date.getDate() - 1);
                const weekendKey = satDate.toISOString().split('T')[0];

                if (!weekends[weekendKey]) {
                    const sunDate = new Date(satDate);
                    sunDate.setDate(satDate.getDate() + 1);
                    weekends[weekendKey] = {
                        maxs: [],
                        mins: [],
                        start: weekendKey,
                        end: sunDate.toISOString().split('T')[0]
                    };
                }
                weekends[weekendKey].maxs.push(tMax);
                weekends[weekendKey].mins.push(tMin);
            }
        }

        const fullWeeks = Object.values(weeks).filter(w => w.maxs.length === 7);
        const fullWeekends = Object.values(weekends).filter(w => w.maxs.length === 2);

        const findExtremePeriod = (periods: any[], type: 'max' | 'min', extreme: 'warmest' | 'coldest') => {
            if (periods.length === 0) return null;
            
            let best: any = null;
            let bestVal = extreme === 'warmest' ? -Infinity : Infinity;

            periods.forEach(p => {
                const avg = p[type + 's'].reduce((a: number, b: number) => a + b, 0) / p[type + 's'].length;
                if (extreme === 'warmest') {
                    if (avg > bestVal) {
                        bestVal = avg;
                        best = { ...p, avgValue: avg, temps: p[type + 's'] };
                    }
                } else {
                    if (avg < bestVal) {
                        bestVal = avg;
                        best = { ...p, avgValue: avg, temps: p[type + 's'] };
                    }
                }
            });
            return best;
        };

        setPeriodRecords({
            warmestWeekMax: findExtremePeriod(fullWeeks, 'max', 'warmest'),
            warmestWeekMin: findExtremePeriod(fullWeeks, 'min', 'warmest'),
            coldestWeekMax: findExtremePeriod(fullWeeks, 'max', 'coldest'),
            coldestWeekMin: findExtremePeriod(fullWeeks, 'min', 'coldest'),
            warmestWeekendMax: findExtremePeriod(fullWeekends, 'max', 'warmest'),
            warmestWeekendMin: findExtremePeriod(fullWeekends, 'min', 'warmest'),
            coldestWeekendMax: findExtremePeriod(fullWeekends, 'max', 'coldest'),
            coldestWeekendMin: findExtremePeriod(fullWeekends, 'min', 'coldest')
        });

        // Climate Numbers Calculation
        if (recordType === 'yearly') {
            const isNorth = location.lat >= 0;
            const year = selectedYear;
            const prevYear = year - 1;
            
            // Define dates
            let hellmannStart, hellmannEnd, heatStart, heatEnd;
            
            if (isNorth) {
                hellmannStart = `${prevYear}-11-01`;
                hellmannEnd = `${year}-03-31`;
                heatStart = `${year}-04-15`;
                heatEnd = `${year}-10-15`;
            } else {
                // South
                // Hellmann (Winter): May 1 - Sep 30
                hellmannStart = `${year}-05-01`;
                hellmannEnd = `${year}-09-30`;
                // Heat (Summer): Nov 1 (prev) - Mar 31 (curr)
                heatStart = `${prevYear}-11-01`;
                heatEnd = `${year}-03-31`;
            }
            
            // We always need prev year Nov/Dec data if it's not in the current fetch range
            // Current fetch range for 'yearly' is YYYY-01-01 to YYYY-12-31.
            // So we need prev year data if start date is in prev year.
            
            const tempMap = new Map<string, number>();
            
            // Add current year data
            for(let i=0; i<times.length; i++) {
                const d = times[i];
                const tMean = (maxTemps[i] + minTemps[i]) / 2;
                 if (!Number.isNaN(tMean)) tempMap.set(d, tMean);
            }

            // Fetch extra data if needed
            const needsExtra = (isNorth) || (!isNorth); // Both scenarios might need prev year data
            // Actually, North Hellmann needs prev year. South Heat needs prev year.
            // So we can just fetch Nov/Dec of prev year blindly as it covers both cases.
            
            const extraStart = `${prevYear}-11-01`;
            const extraEnd = `${prevYear}-12-31`;
            
            try {
                // Only fetch if we don't have it (we don't for 'yearly' mode)
                const extraData = await fetchHistorical(location.lat, location.lon, extraStart, extraEnd);
                if (extraData && extraData.daily && extraData.daily.time) {
                    const extraDaily = extraData.daily;
                    for(let i=0; i<extraDaily.time.length; i++) {
                        const d = extraDaily.time[i];
                        const tMax = extraDaily.temperature_2m_max[i];
                        const tMin = extraDaily.temperature_2m_min[i];
                        if (typeof tMax === 'number' && typeof tMin === 'number') {
                            const tMean = (tMax + tMin) / 2;
                            tempMap.set(d, tMean);
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to fetch extra climate data", e);
            }
            
            const calcScore = (start: string, end: string, type: 'hellmann' | 'heat'): ClimateSeasonStats => {
                let score = 0;
                const monthly: Record<string, number> = {};
                let currentDate = new Date(start);
                const stopDate = new Date(end);
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                
                let state: 'future' | 'active' | 'finished' = 'future';
                let cappedEnd = stopDate;
                let progression = '';
                
                const startD = new Date(start);
                
                if (startD > yesterday) {
                     state = 'future';
                     progression = t('records.season_not_started');
                } else if (stopDate > yesterday) {
                     state = 'active';
                     cappedEnd = yesterday;
                     progression = t('records.season_progress');
                } else {
                     state = 'finished';
                }
                
                // Iterate
                const loopDate = new Date(start);
                // Ensure we don't go beyond available data or capped end
                while (loopDate <= cappedEnd) {
                    const dStr = loopDate.toISOString().split('T')[0];
                    const temp = tempMap.get(dStr);
                    
                    if (temp !== undefined) {
                        let val = 0;
                        if (type === 'hellmann') {
                            if (temp < 0) val = Math.abs(temp);
                        } else {
                            if (temp > 18) val = temp - 18;
                        }
                        
                        if (val > 0) {
                            score += val;
                            // Monthly breakdown
                            const monthKey = loopDate.toLocaleString(getLocale(), { month: 'short' });
                            monthly[monthKey] = (monthly[monthKey] || 0) + val;
                        }
                    }
                    
                    loopDate.setDate(loopDate.getDate() + 1);
                }
                
                // Format monthly - we want all months in range even if 0? 
                // User said "Toon voor beide een maand overzicht met de totaal scroe per maand."
                // Better to show all months in the season.
                
                const allMonths: { month: string, score: number }[] = [];
                const mLoop = new Date(start);
                while (mLoop <= stopDate) { // Iterate full season range for labels
                     const mKey = mLoop.toLocaleString(getLocale(), { month: 'short' });
                     if (!allMonths.find(m => m.month === mKey)) {
                         allMonths.push({ month: mKey, score: monthly[mKey] ? parseFloat(monthly[mKey].toFixed(1)) : 0.0 });
                     }
                     mLoop.setDate(mLoop.getDate() + 15); // Jump 15 days to ensure we hit next month
                }
                
                return {
                    score: parseFloat(score.toFixed(1)),
                    monthlyScores: allMonths,
                    progression: state === 'active' ? progression : undefined,
                    seasonState: state,
                    startDate: start,
                    endDate: end
                };
            };
            
            const hellmannStats = calcScore(hellmannStart, hellmannEnd, 'hellmann');
            const heatStats = calcScore(heatStart, heatEnd, 'heat');
            
            setClimateNumbers({
                hellmann: hellmannStats,
                heat: heatStats
            });
        } else {
            setClimateNumbers(null);
        }
      }
      setLoading(false);
  };

  const getLocale = () => {
    const map: Record<string, string> = {
        nl: 'nl-NL',
        de: 'de-DE',
        fr: 'fr-FR',
        es: 'es-ES',
        en: 'en-GB'
    };
    return map[settings.language] || 'en-GB';
  };

  const formatDateLabel = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(
      getLocale(),
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    );
  };

  const currentYear = new Date().getFullYear();
  // Open-Meteo Reanalysis data starts from 1940
  const years = React.useMemo(() => {
    const y: number[] = [];
    for (let i = currentYear; i >= 1940; i--) {
        y.push(i);
    }
    return y;
  }, [currentYear]);

  const months = React.useMemo(() => {
    return Array.from({length: 12}, (_, i) => i + 1);
  }, []);

  const getMonthName = (month: number) => {
      const date = new Date(2000, month - 1, 1);
      return date.toLocaleString(getLocale(), { month: 'long' });
  };

  const tempDomain = useMemo(() => {
    if (!dailyData.length) return { min: 0, max: 30, ticks: [], yAxisTicks: [] };
    const min = Math.floor(Math.min(...dailyData.map(d => d.minTemp)));
    const max = Math.ceil(Math.max(...dailyData.map(d => d.maxTemp)));
    const start = Math.floor(min / 5) * 5 - 5;
    const end = Math.ceil(max / 5) * 5 + 5;
    const ticks = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const yAxisTicks = ticks.filter(t => t % 5 === 0);
    return { min: start, max: end, ticks, yAxisTicks };
  }, [dailyData]);

  const calendarWeeks = useMemo(() => {
      if (!dailyData.length || recordType !== 'calendar') return [];
      
      const weeks: (DailyData | null)[][] = [];
      const year = selectedYear;
      const month = selectedMonth;
      
      const firstDayOfMonth = new Date(year, month - 1, 1);
      
      const weekStart = settings.weekStartDay || 'monday';
      const dayMap: Record<string, number> = { 'sunday': 0, 'monday': 1, 'saturday': 6 };
      const targetStart = dayMap[weekStart];

      let startDay = (firstDayOfMonth.getDay() - targetStart + 7) % 7;
      
      let currentWeek: (DailyData | null)[] = Array(startDay).fill(null);
      
      dailyData.forEach(day => {
          currentWeek.push(day);
          if (currentWeek.length === 7) {
              weeks.push(currentWeek);
              currentWeek = [];
          }
      });
      
      if (currentWeek.length > 0) {
          while (currentWeek.length < 7) currentWeek.push(null);
          weeks.push(currentWeek);
      }
      
      return weeks;
  }, [dailyData, selectedYear, selectedMonth, recordType, settings.weekStartDay]);

  const dayColors = useMemo(() => {
    if (!dailyData.length) return {};
    const valid = dailyData.filter(d => d.maxTemp !== null);
    
    // Warmest
    const sortedDesc = [...valid].sort((a, b) => (b.maxTemp!) - (a.maxTemp!));
    const warmColors = ['#FF0000', '#ED0012', '#DB0024'];
    
    // Coldest
    const sortedAsc = [...valid].sort((a, b) => (a.maxTemp!) - (b.maxTemp!));
    const coldColors = ['#0000FF', '#1200ED', '#2400DB'];
    
    const map: Record<string, string> = {};
    
    // Assign Warmest
    for(let i=0; i<3; i++) {
        if(i < sortedDesc.length) {
            map[sortedDesc[i].date] = warmColors[i];
        }
    }
    
    // Assign Coldest
    for(let i=0; i<3; i++) {
        if(i < sortedAsc.length) {
            map[sortedAsc[i].date] = coldColors[i];
        }
    }
    
    return map;
  }, [dailyData]);

  const getHeatmapStyle = (day: DailyData) => {
      // Check if heatmap is enabled (default true)
      if (settings.calendar?.showHeatmap === false) return {};

      if (!day || day.maxTemp === null) return {};

      const color = dayColors[day.date];
      if (!color) return {};
      
      const hexToRgb = (hex: string) => {
          const r = parseInt(hex.slice(1,3), 16);
          const g = parseInt(hex.slice(3,5), 16);
          const b = parseInt(hex.slice(5,7), 16);
          return [r, g, b];
      };

      const [r, g, b] = hexToRgb(color);
      
      return {
          backgroundColor: `rgba(${r}, ${g}, ${b}, 0.25)`,
          borderColor: `rgba(${r}, ${g}, ${b}, 0.7)`
      };
  };

  const renderRecordCard = (
    titleKey: string,
    icon: string,
    iconColor: string,
    entries: RecordEntry[],
    formatValue: (value: number) => React.ReactNode
  ) => {
    const medalClasses = [
      'bg-amber-500 text-text-inverse',
      'bg-gray-400 text-text-inverse',
      'bg-orange-400 text-text-inverse',
    ];

    return (
      <div className="w-full bg-bg-card rounded-2xl p-6 border border-border-color">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Icon name={icon} className={iconColor} />
            {t(titleKey)}
          </h3>
        </div>
        {entries.length ? (
          <ul className="mt-2 space-y-2">
            {entries.map((entry, index) => (
              <li key={`${entry.date}-${index}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigateToHistoricalSingle(entry.date)}
                    className="flex items-center gap-2 text-left hover:opacity-90"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border border-border-color/40 shadow-sm ${
                        medalClasses[index] ?? 'bg-bg-page text-text-main'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span className="text-sm text-text-muted underline-offset-2 hover:underline">
                      {formatDateLabel(entry.date)}
                    </span>
                  </button>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-sm font-bold text-text-main text-right">
                    {formatValue(entry.value)}
                  </div>
                  {entry.meta && typeof entry.meta.max === 'number' && typeof entry.meta.min === 'number' && (
                     <div className="text-[10px] text-text-muted">
                        Max: {formatTempValue(entry.meta.max)}° / Min: {formatTempValue(entry.meta.min)}°
                     </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">{t('no_data_available')}</p>
        )}
      </div>
    );
  };

  const renderTimeTempDiffCard = (
    titleKey: string,
    icon: string,
    iconColor: string,
    entries: TimeTempDiffEntry[]
  ) => {
    const medalClasses = [
      'bg-amber-500 text-text-inverse',
      'bg-gray-400 text-text-inverse',
      'bg-orange-400 text-text-inverse',
    ];

    return (
      <div className="w-full bg-bg-card rounded-2xl p-6 border border-border-color">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Icon name={icon} className={iconColor} />
            {t(titleKey)}
          </h3>
        </div>
        {entries.length ? (
          <ul className="mt-2 space-y-2">
            {entries.map((entry, index) => (
              <li key={`${entry.date}-${index}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigateToHistoricalSingle(entry.date)}
                    className="flex items-center gap-2 text-left hover:opacity-90"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border border-border-color/40 shadow-sm ${
                        medalClasses[index] ?? 'bg-bg-page text-text-main'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm text-text-muted underline-offset-2 hover:underline">{formatDateLabel(entry.date)}</span>
                      <span className="text-xs text-text-muted">
                        13:00 {formatTempValue(entry.temp13)}° {' • '}22:00 {formatTempValue(entry.temp22)}°
                      </span>
                    </div>
                  </button>
                </div>
                <div className="text-sm font-bold text-text-main text-right">{formatTempDeltaValue(entry.value)}°</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">{t('no_data_available')}</p>
        )}
      </div>
    );
  };

  return (
    <div className="relative min-h-screen flex flex-col pb-20 overflow-y-auto overflow-x-hidden text-text-main bg-bg-page transition-colors duration-300">
      
      {currentWeather && (
        <div className="absolute top-0 left-0 right-0 h-[80vh] z-0 overflow-hidden rounded-b-[3rem]">
            <StaticWeatherBackground 
                weatherCode={currentWeather.current.weather_code} 
                isDay={currentWeather.current.is_day}
                className="absolute inset-0 w-full h-full"
            />
        </div>
      )}

      <CreditFloatingButton onNavigate={onNavigate as any} settings={settings} />

      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent dark:from-black/60 dark:via-black/5 dark:to-bg-page/90 z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full w-full">
        <div className="flex flex-col pt-8 pb-4">
            <div className="flex items-center justify-center relative px-4 mb-2">
                <button onClick={() => cycleFavorite('prev')} className="absolute left-4 p-2 rounded-full bg-bg-card/20 backdrop-blur-md text-text-main hover:bg-bg-card/40 transition-all shadow-sm disabled:opacity-0" disabled={settings.favorites.length === 0}>
                    <Icon name="chevron_left" className="text-3xl" />
                </button>

                <div className="flex flex-col items-center bg-bg-card/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-border-color shadow-lg">
                    <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-xl text-text-main">
                        <span className="md:hidden">{location.name.length > 15 ? location.name.slice(0, 15) + '...' : location.name}</span>
                        <span className="hidden md:inline">{location.name}, {location.country}</span>
                    </h2>
                     <p className="text-xs text-text-muted mt-1 drop-shadow-md">
                        {t('records.title')}
                    </p>
                </div>

                <button onClick={() => cycleFavorite('next')} className="absolute right-4 p-2 rounded-full bg-bg-card/20 backdrop-blur-md text-text-main hover:bg-bg-card/40 transition-all shadow-sm disabled:opacity-0" disabled={settings.favorites.length === 0}>
                    <Icon name="chevron_right" className="text-3xl" />
                </button>
            </div>

          <div className="w-full overflow-x-auto scrollbar-hide pl-4 mt-2 transition-colors duration-300 no-swipe" data-no-swipe="true" ref={scrollContainerRef}>
            <div className="flex gap-3 pr-4">
              <button
                onClick={() => {
                  const geo = navigator.geolocation;
                  if (geo) {
                    setLoading(true);
                    geo.getCurrentPosition(
                      async pos => {
                        const lat = pos.coords.latitude;
                        const lon = pos.coords.longitude;
                        let name = t('my_location');
                        let countryCode = '';
                        
                        try {
                           const result = await reverseGeocodeFull(lat, lon);
                           if (result) {
                               name = result.name;
                               countryCode = result.countryCode;
                               
                               if (onUpdateSettings && countryCode && countryCode !== settings.countryCode) {
                                   onUpdateSettings({ ...settings, countryCode });
                               }
                           }
                        } catch (e) {
                           console.error(e);
                        }

                        setLocation({
                          name,
                          country: countryCode,
                          lat,
                          lon,
                          isCurrentLocation: true
                        });
                        setLoading(false);
                      },
                      () => setLoading(false)
                    );
                  }
                }}
                data-active={location.isCurrentLocation}
                className={`flex items-center gap-1 px-4 py-2 rounded-full whitespace-nowrap backdrop-blur-md shadow-sm transition-colors border ${
                  location.isCurrentLocation 
                    ? 'bg-accent-primary text-text-inverse font-bold border-accent-primary shadow-md' 
                    : 'bg-bg-card/60 text-text-main hover:bg-bg-card hover:text-accent-primary border-border-color'
                }`}
              >
                <Icon name="my_location" className="text-sm" />
                <span className="text-sm font-medium">{t('my_location')}</span>
              </button>
              {settings.favorites.map((fav, i) => {
                const isActive = !location.isCurrentLocation && 
                                 location.name === fav.name && 
                                 Math.abs(location.lat - fav.lat) < 0.01 && 
                                 Math.abs(location.lon - fav.lon) < 0.01;
                return (
                  <button
                    key={i}
                    data-active={isActive}
                    onClick={() => setLocation(fav)}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border backdrop-blur-md shadow-sm ${
                      isActive
                        ? 'bg-accent-primary text-text-inverse font-bold border-accent-primary shadow-md'
                        : 'bg-bg-card/60 text-text-main hover:bg-bg-card/80 border-border-color'
                    }`}
                  >
                    {fav.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Current Weather Display */}
        {currentWeather && (
            <div className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in duration-500 text-text-main">
                <div className="flex items-center gap-4">
                    <div className="bg-bg-card/40 backdrop-blur-md px-6 py-2 rounded-3xl border border-border-color/20 shadow-lg">
                        <h1 className="text-[80px] font-bold leading-none tracking-tighter drop-shadow-2xl font-display text-text-main">
                            {currentTemp}°
                        </h1>
                    </div>
                    
                    <div className="flex gap-3">
                        {currentWeather.current.temperature_2m < 10 && (
                            <div onClick={() => setShowFeelsLikeModal(true)} className="flex flex-col items-center justify-center bg-bg-card backdrop-blur-md rounded-xl p-2 border border-border-color shadow-sm min-w-[70px] h-[100px] cursor-pointer hover:scale-105 transition-transform group relative">
                                <Icon name="thermostat" className={`text-xl ${feelsLike < currentTemp ? 'text-blue-500 dark:text-blue-300' : 'text-orange-500 dark:text-orange-300'}`} />
                                <span className="text-lg font-bold leading-none mt-1">{feelsLike.toFixed(1)}°</span>
                                <span className="text-[9px] uppercase text-text-muted leading-none mt-1">{t('feels_like')}</span>
                            </div>
                        )}
                        
                        {currentWeather.current.temperature_2m > 25 && (
                            <div onClick={() => setShowFeelsLikeModal(true)} className="flex flex-col items-center justify-center bg-bg-card/60 backdrop-blur-md rounded-xl p-2 border border-border-color shadow-sm min-w-[70px] h-[100px] cursor-pointer hover:scale-105 transition-transform group relative">
                                <Icon name="thermostat" className="text-xl text-orange-500 dark:text-orange-300" />
                                <span className="text-lg font-bold leading-none mt-1">{heatIndex}°</span>
                                <span className="text-[9px] uppercase text-text-muted leading-none mt-1">{t('heat_index')}</span>
                            </div>
                        )}

                        {currentComfort && (
                            <WeatherRatingButton 
                                score={currentComfort} 
                                onClick={(e) => { e.stopPropagation(); setShowComfortModal(true); }} 
                                className="min-w-[70px] w-auto"
                            />
                        )}
                    </div>
                </div>
                
                <div className="bg-bg-card/40 backdrop-blur-md px-6 py-4 rounded-3xl border border-border-color/20 shadow-lg mt-4 flex flex-col items-center">
                    <p className="text-xl font-medium tracking-wide drop-shadow-md flex items-center gap-2 text-text-main">
                            <Icon name={mapWmoCodeToIcon(currentWeather.current.weather_code, currentWeather.current.is_day === 0)} className="text-2xl" />
                        {mapWmoCodeToText(currentWeather.current.weather_code, settings.language)}
                    </p>
                    <p className="text-text-main/80 text-base font-normal drop-shadow-md mt-1">
                        H:{highTemp}° L:{lowTemp}°
                    </p>
                    <p className="text-text-main/60 text-sm mt-2 font-normal drop-shadow-md">
                        {formatDateTime()}
                    </p>
                </div>
            </div>
        )}

        <div className="bg-bg-page/95 backdrop-blur-2xl rounded-t-[40px] border-t border-border-color p-6 shadow-2xl animate-in slide-in-from-bottom duration-500 text-text-main transition-colors min-h-[60vh]">
          <div className="flex flex-col md:flex-row justify-center items-center gap-4 mb-4 px-4">
            <div className="flex bg-bg-card rounded-full p-1 border border-border-color/50">
                <UITooltip content={t('records.12month')}>
                <button
                onClick={() => setRecordType('12month')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors flex items-center gap-2 ${
                    recordType === '12month'
                    ? 'bg-accent-primary text-text-inverse shadow-sm border-accent-primary dark:bg-text-inverse dark:text-text-main dark:border-text-inverse'
                    : 'text-text-muted hover:text-text-main border-transparent'
                }`}
                >
                <span className="hidden md:inline">{t('records.12month')}</span>
                <Icon name="date_range" className="md:hidden" />
                </button>
                </UITooltip>

                <UITooltip content={t('records.yearly')}>
                <button
                onClick={() => setRecordType('yearly')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors flex items-center gap-2 ${
                    recordType === 'yearly'
                    ? 'bg-accent-primary text-text-inverse shadow-sm border-accent-primary dark:bg-text-inverse dark:text-text-main dark:border-text-inverse'
                    : 'text-text-muted hover:text-text-main border-transparent'
                }`}
                >
                <span className="hidden md:inline">{t('records.yearly')}</span>
                <Icon name="calendar_today" className="md:hidden" />
                </button>
                </UITooltip>

                <UITooltip content={t('records.dashboard')}>
                 <button
                onClick={() => setRecordType('heatmap')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors flex items-center gap-2 ${
                    recordType === 'heatmap'
                    ? 'bg-accent-primary text-text-inverse shadow-sm border-accent-primary dark:bg-text-inverse dark:text-text-main dark:border-text-inverse'
                    : 'text-text-muted hover:text-text-main border-transparent'
                }`}
                >
                <span className="hidden md:inline">{t('records.dashboard')}</span>
                <Icon name="grid_on" className="md:hidden" />
                </button>
                </UITooltip>

                <UITooltip content={t('records.monthly')}>
                 <button
                onClick={() => setRecordType('monthly')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors flex items-center gap-2 ${
                    recordType === 'monthly'
                    ? 'bg-accent-primary text-white shadow-sm border-accent-primary dark:bg-text-inverse dark:text-text-main dark:border-text-inverse'
                    : 'text-text-muted hover:text-text-main border-transparent'
                }`}
                >
                <span className="hidden md:inline">{t('records.monthly')}</span>
                <Icon name="calendar_month" className="md:hidden" />
                </button>
                </UITooltip>

                <UITooltip content={t('records.calendar')}>
                 <button
                onClick={() => setRecordType('calendar')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors flex items-center gap-2 ${
                    recordType === 'calendar'
                    ? 'bg-accent-primary text-text-inverse shadow-sm border-accent-primary dark:bg-text-inverse dark:text-text-main dark:border-text-inverse'
                    : 'text-text-muted hover:text-text-main border-transparent'
                }`}
                >
                <span className="hidden md:inline">{t('records.calendar')}</span>
                <Icon name="event" className="md:hidden" />
                </button>
                </UITooltip>
            </div>

            {(recordType === 'yearly' || recordType === 'monthly' || recordType === 'calendar' || recordType === 'heatmap') && (
                <div className="flex gap-2">
                     <div className="relative min-w-[100px]">
                        <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                        className="w-full appearance-none bg-bg-card border border-border-color rounded-xl px-4 py-2 pr-10 text-sm font-bold text-text-main outline-none focus:border-accent-primary/50 cursor-pointer hover:border-accent-primary/50 transition-colors shadow-sm"
                        >
                        {years.map(year => (
                            <option key={year} value={year} className="text-text-main bg-bg-page">
                            {year}
                            </option>
                        ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">
                        <Icon name="expand_more" className="text-sm" />
                        </div>
                    </div>
                    
                    {(recordType === 'monthly' || recordType === 'calendar') && (
                         <div className="relative min-w-[120px]">
                            <select
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(parseInt(e.target.value, 10))}
                            className="w-full appearance-none bg-bg-card border border-border-color rounded-xl px-4 py-2 pr-10 text-sm font-bold text-text-main outline-none focus:border-accent-primary/50 cursor-pointer hover:border-accent-primary/50 transition-colors shadow-sm"
                            >
                            {months.map(month => (
                                <option key={month} value={month} className="text-text-main bg-bg-page" disabled={selectedYear === new Date().getFullYear() && month > new Date().getMonth() + 1}>
                                {getMonthName(month)}
                                </option>
                            ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">
                            <Icon name="expand_more" className="text-sm" />
                            </div>
                        </div>
                    )}
                </div>
            )}
          </div>

          {error && (
            <div className="px-4 mb-4">
              <div className="w-full max-w-md mx-auto bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-200 rounded-2xl px-4 py-3 text-sm">
                {error}
              </div>
            </div>
          )}

          {loading ? (
            <ProgressBar progress={progress} message={t('loading')} />
          ) : recordType === 'heatmap' ? (
              <div className="px-4 pb-10 w-full max-w-5xl mx-auto flex flex-col gap-8">
                 {heatmapData && (
                    <>
                        <HeatmapComponent data={heatmapData} year={selectedYear} settings={settings} onDayClick={navigateToHistoricalSingle} />

                        <div className="bg-bg-card rounded-2xl p-4 md:p-6 border border-border-color">
                            <h3 className="text-lg font-bold mb-4 text-text-main flex items-center gap-2">
                                <Icon name="grid_view" className="text-accent-primary" />
                                {t('month_stats.visual') || 'Visueel Overzicht'}
                            </h3>
                            {heatmapVisualData ? (
                                <>
                                <VisualStatsBlocks 
                                    data={heatmapVisualData}
                                    settings={settings}
                                    columns={10}
                                    variant="compact"
                                    excludedCategories={['cloudy', 'windy']}
                                    onDayClick={navigateToHistoricalSingle}
                                />
                                <div className="mt-4 p-4 bg-bg-subtle rounded-xl text-xs text-text-muted flex flex-wrap gap-4 justify-center w-full">
                                    <p className="flex items-center gap-1 w-full justify-center text-center font-bold mb-1"><Icon name="info" className="text-sm"/> {t('month_stats.visual.explanation_title')}</p>
                                    <p className="text-center opacity-80 leading-relaxed max-w-4xl">{t('month_stats.visual.explanation_legend')}</p>
                                </div>
                                </>
                            ) : (
                                <div className="py-8 text-center text-text-muted text-sm">No data available</div>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                              <TemperatureDistributionChart data={heatmapData} settings={settings} />
                              <SeasonalDistributionChart data={heatmapData} settings={settings} lat={location.lat} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                              <TemperatureFrequencyChart data={heatmapData.maxTemps} title={t('records.frequency_max_title')} settings={settings} />
                              <TemperatureFrequencyChart data={heatmapData.minTemps} title={t('records.frequency_min_title')} settings={settings} />
                        </div>

                        <RainProbabilityChart data={heatmapData} settings={settings} />

                        <BaroRibbonChart data={heatmapData} settings={settings} onPointClick={navigateToHistoricalSingle} />
                    </>
                 )}
              </div>
          ) : recordType === 'monthly' ? (
              <div className="flex flex-col gap-6 px-4 pb-10 w-full max-w-4xl mx-auto">
                  {monthlyStats && (
                      <div className="bg-bg-card rounded-2xl p-4 sm:p-6 border border-border-color">
                          <h3 className="text-lg sm:text-xl font-bold mb-4 text-text-main flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                            <span>{t('records.monthly_summary')}</span>
                            {selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth() + 1 && (
                                <span className="text-xs sm:text-sm font-normal text-text-muted bg-bg-card/50 px-3 py-1 rounded-full self-start sm:self-auto">
                                    {t('records.intermediate_status')}
                                </span>
                            )}
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                              {/* Temperature Group */}
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                  <span className="text-text-muted text-xs sm:text-sm">{t('records.max_temp_high')}</span>
                                  <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.maxTempHigh ? `${formatTempValue(monthlyStats.maxTempHigh.value)}° (${formatDateWithDay(monthlyStats.maxTempHigh.date)})` : '-'}</span>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                  <span className="text-text-muted text-xs sm:text-sm">{t('records.max_temp_low')}</span>
                                  <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.maxTempLow ? `${formatTempValue(monthlyStats.maxTempLow.value)}° (${formatDateWithDay(monthlyStats.maxTempLow.date)})` : '-'}</span>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                  <span className="text-text-muted text-xs sm:text-sm">{t('records.min_temp_low')}</span>
                                  <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.minTempLow ? `${formatTempValue(monthlyStats.minTempLow.value)}° (${formatDateWithDay(monthlyStats.minTempLow.date)})` : '-'}</span>
                              </div>

                              {/* Precipitation & Sun Group */}
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                  <span className="text-text-muted text-xs sm:text-sm">{t('records.total_rain')}</span>
                                  <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.totalRain.toFixed(1)} {settings.precipUnit}</span>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                  <span className="text-text-muted text-xs sm:text-sm">{t('records.sun_days')}</span>
                                  <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.sunDays}</span>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                  <span className="text-text-muted text-xs sm:text-sm">{t('records.rain_days')}</span>
                                  <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.rainDays}</span>
                              </div>

                              {/* Days Count Group */}
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                  <span className="text-text-muted text-xs sm:text-sm">{t('records.dry_days')}</span>
                                  <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.dryDays}</span>
                              </div>
                              {monthlyStats.frostDays > 0 && (
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                      <span className="text-text-muted text-xs sm:text-sm">{t('records.frost_days')}</span>
                                      <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.frostDays}</span>
                                  </div>
                              )}
                              {monthlyStats.iceDays > 0 && (
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                      <span className="text-text-muted text-xs sm:text-sm">{t('records.ice_days')}</span>
                                      <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.iceDays}</span>
                                  </div>
                              )}
                              {monthlyStats.summerDays > 0 && (
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                      <span className="text-text-muted text-xs sm:text-sm">{t('records.summer_days')}</span>
                                      <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.summerDays}</span>
                                  </div>
                              )}
                              {monthlyStats.tropicalDays > 0 && (
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-bg-page rounded-xl border border-border-color h-full gap-1">
                                      <span className="text-text-muted text-xs sm:text-sm">{t('records.tropical_days')}</span>
                                      <span className="font-bold text-text-main text-sm sm:text-base">{monthlyStats.tropicalDays}</span>
                                  </div>
                              )}
                          </div>
                      </div>
                  )}
                  
                  {/* Temp Chart */}
                  <div className="bg-bg-card rounded-2xl p-2 sm:p-4 border border-border-color h-96 flex flex-col">
                      <h3 className="text-lg font-bold mb-2 text-text-main px-2 sm:px-0">{t('records.temperature_graph')}</h3>
                      <div className="flex-1 w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <ComposedChart data={dailyData} margin={{top: 5, right: 5, bottom: 5, left: 20}} syncId="monthlyGraph">
                             {/* Custom Grid Lines */}
                             {tempDomain.ticks.map((tick) => (
                                 <ReferenceLine 
                                    key={`grid-${tick}`} 
                                    y={tick} 
                                    stroke={tick % 5 === 0 ? "rgba(128,128,128,0.3)" : "rgba(128,128,128,0.1)"} 
                                    strokeWidth={tick % 5 === 0 ? 2 : 1}
                                />
                             ))}
                             
                             {/* Weekend highlights */}
                             {dailyData.map((entry, index) => (
                                entry.isWeekend ? (
                                    <ReferenceLine key={`weekend-${index}`} x={entry.day} stroke="rgba(128,128,128,0.1)" strokeWidth={20} />
                                ) : null
                             ))}
                            <XAxis 
                                dataKey="day" 
                                stroke="#888888" 
                                tick={{fontSize: 10}} 
                                interval={0} 
                                angle={isMobile ? -45 : 0}
                                textAnchor={isMobile ? 'end' : 'middle'}
                                height={isMobile ? 50 : 30}
                            />
                            <YAxis 
                                domain={[tempDomain.min, tempDomain.max]} 
                                ticks={tempDomain.yAxisTicks}
                                interval={0}
                                tickCount={tempDomain.yAxisTicks.length}
                                allowDecimals={false}
                                stroke="var(--text-muted)"
                                tick={{fontSize: 10, fill: 'var(--text-muted)'}}
                                tickMargin={8}
                                width={50}
                            />
                            <YAxis 
                                yAxisId="right" 
                                orientation="right" 
                                width={5} 
                                tick={false} 
                                axisLine={false} 
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-main)' }}
                                itemStyle={{ color: 'var(--text-main)' }}
                                labelStyle={{ color: 'var(--text-muted)' }}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="maxTemp" 
                                stroke="#ef4444" 
                                strokeWidth={2} 
                                dot={(props: any) => {
                                    const isMax = props.payload.date === monthlyStats?.maxTempHigh?.date;
                                    if (isMax) {
                                        return (
                                            <g>
                                                <circle cx={props.cx} cy={props.cy} r={6} fill="#ef4444" stroke="var(--bg-card)" strokeWidth={2} />
                                                <text x={props.cx} y={props.cy - 10} textAnchor="middle" fill="#ef4444" fontSize={10} fontWeight="bold">
                                                    {formatTempValue(props.payload.maxTemp)}°
                                                </text>
                                            </g>
                                        );
                                    }
                                    return <circle cx={props.cx} cy={props.cy} r={0} />;
                                }}
                                activeDot={{r: 5}} 
                                name={t('max_temp')} 
                            />
                            <Line 
                                type="monotone" 
                                dataKey="minTemp" 
                                stroke="#3b82f6" 
                                strokeWidth={2} 
                                dot={(props: any) => {
                                    const isMin = props.payload.date === monthlyStats?.minTempLow?.date;
                                    if (isMin) {
                                        return (
                                            <g>
                                                <circle cx={props.cx} cy={props.cy} r={6} fill="#3b82f6" stroke="var(--bg-card)" strokeWidth={2} />
                                                <text x={props.cx} y={props.cy + 15} textAnchor="middle" fill="#3b82f6" fontSize={10} fontWeight="bold">
                                                    {formatTempValue(props.payload.minTemp)}°
                                                </text>
                                            </g>
                                        );
                                    }
                                    return <circle cx={props.cx} cy={props.cy} r={0} />;
                                }}
                                activeDot={{r: 5}} 
                                name={t('min_temp')} 
                            />
                        </ComposedChart>
                      </ResponsiveContainer>
                  </div>
                  </div>

                  {/* Rain/Sun Chart */}
                  <div className="bg-bg-card rounded-2xl p-2 sm:p-4 border border-border-color h-96 flex flex-col">
                      <h3 className="text-lg font-bold mb-2 text-text-main px-2 sm:px-0">{t('records.rain_sun_graph')}</h3>
                      <div className="flex-1 w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <ComposedChart data={dailyData} margin={{top: 45, right: 5, bottom: 5, left: isMobile ? 0 : -10}} barGap={2} syncId="monthlyGraph">
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.2)" />
                             {/* Weekend highlights */}
                             {dailyData.map((entry, index) => (
                                entry.isWeekend ? (
                                    <ReferenceLine key={`weekend-bar-${index}`} x={entry.day} stroke="rgba(128,128,128,0.1)" strokeWidth={20} />
                                ) : null
                            ))}
                            <XAxis 
                                dataKey="day" 
                                stroke="#888888" 
                                tick={{fontSize: 10}} 
                                interval={0} 
                                angle={isMobile ? -45 : 0}
                                textAnchor={isMobile ? 'end' : 'middle'}
                                height={isMobile ? 50 : 30}
                            />
                            <YAxis 
                                yAxisId="left" 
                                orientation="left" 
                                stroke="#3b82f6" 
                                label={{ value: settings.precipUnit, angle: -90, position: 'insideLeft' }} 
                                width={35} 
                                domain={[0, 10]}
                                ticks={[0, 2, 4, 6, 8, 10]}
                                allowDataOverflow={true}
                            />
                            <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" label={{ value: '%', angle: 90, position: 'insideRight' }} width={35} domain={[0, 100]} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-main)' }}
                                formatter={(value: number, name: string, props: any) => {
                                    if (name === t('sunshine')) return [`${Math.round(value)}%`, name];
                                    // If we are showing rain, ensure we show the real value from the payload if possible
                                    // but since we haven't changed the dataKey yet, 'value' is still the real 'rain' value.
                                    return [`${value.toFixed(1)} ${settings.precipUnit}`, name];
                                }}
                            />
                            <Bar yAxisId="left" dataKey="rain" name={t('precipitation')} fill="#3b82f6" barSize={8} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                <LabelList 
                                    dataKey="rain" 
                                    content={(props: any) => {
                                        const { x, y, width, value } = props;
                                        if (value > 10) {
                                            return (
                                                <text 
                                                    x={x + width / 2} 
                                                    y={y - 12} 
                                                    fill="#3b82f6" 
                                                    textAnchor="middle" 
                                                    fontSize={24} 
                                                    fontWeight="bold"
                                                    className="drop-shadow-md"
                                                    style={{ pointerEvents: 'none' }}
                                                >
                                                    +
                                                </text>
                                            );
                                        }
                                        return null;
                                    }} 
                                />
                            </Bar>
                            <Bar yAxisId="right" dataKey="sun" fill="#f59e0b" name={t('sunshine')} barSize={8} radius={[4, 4, 0, 0]} />
                        </ComposedChart>
                      </ResponsiveContainer>
                  </div>
              </div>
              
              {/* Visual Stats Overview */}
              <div className="w-full max-w-7xl mx-auto px-4 pb-6">
                <div className="bg-bg-card rounded-2xl p-4 md:p-8 border border-border-color overflow-hidden">
                    <h3 className="text-lg font-bold mb-4 text-text-main flex items-center gap-2">
                        <Icon name="grid_view" className="text-accent-primary" />
                        {t('month_stats.visual') || 'Visueel Overzicht'}
                    </h3>
                    <VisualStatsBlocks 
                        data={dailyData} 
                        settings={settings} 
                        sourceType="daily_data" 
                    />
                    <div className="mt-4 p-4 bg-bg-subtle rounded-xl text-xs text-text-muted flex flex-wrap gap-4 justify-center w-full">
                        <p className="flex items-center gap-1 w-full justify-center text-center font-bold mb-1"><Icon name="info" className="text-sm"/> {t('month_stats.visual.explanation_title')}</p>
                        <p className="text-center opacity-80 leading-relaxed max-w-4xl">{t('month_stats.visual.explanation_legend')}</p>
                    </div>
                </div>
              </div>

              </div>
          ) : recordType === 'calendar' ? (
              <div className="w-full max-w-7xl mx-auto px-4 pb-10">
                  <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4 bg-bg-card p-4 rounded-2xl border border-border-color shadow-sm">
                      <div className="flex items-center gap-4 order-2 md:order-1">
                          <button 
                              onClick={() => {
                                  let newMonth = selectedMonth - 1;
                                  let newYear = selectedYear;
                                  if (newMonth < 1) { newMonth = 12; newYear--; }
                                  setSelectedMonth(newMonth);
                                  setSelectedYear(newYear);
                              }}
                              className="p-2 rounded-xl hover:bg-bg-page transition-colors"
                          >
                              <Icon name="chevron_left" className="text-2xl" />
                          </button>
                          
                          <h3 className="text-xl font-bold capitalize flex items-center gap-2 w-48 justify-center text-text-main">
                              <Icon name="calendar_month" className="text-accent-primary" />
                              {new Date(selectedYear, selectedMonth - 1).toLocaleString(getLocale(), { month: 'long', year: 'numeric' })}
                          </h3>
                          
                          <button 
                              onClick={() => {
                                  const now = new Date();
                                  let newMonth = selectedMonth + 1;
                                  let newYear = selectedYear;
                                  if (newMonth > 12) { newMonth = 1; newYear++; }
                                  
                                  if (newYear > now.getFullYear() || (newYear === now.getFullYear() && newMonth > now.getMonth() + 1)) {
                                      return;
                                  }
                                  
                                  setSelectedMonth(newMonth);
                                  setSelectedYear(newYear);
                              }}
                              disabled={selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth() + 1}
                              className={`p-2 rounded-xl transition-colors ${selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth() + 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-bg-page'}`}
                          >
                              <Icon name="chevron_right" className="text-2xl" />
                          </button>
                      </div>

                      <div className="flex items-center gap-4 order-1 md:order-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input 
                                  type="checkbox" 
                                  checked={settings.calendar?.showHeatmap !== false}
                                  onChange={() => onUpdateSettings?.({ ...settings, calendar: { ...settings.calendar, showHeatmap: !(settings.calendar?.showHeatmap !== false) } })}
                                  className="rounded border-border-color text-accent-primary focus:ring-accent-primary bg-bg-page"
                              />
                              <span className="text-sm font-medium text-text-muted">{t('settings.calendar.heatmap') || 'Heatmap'}</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input 
                                  type="checkbox" 
                                  checked={settings.calendar?.showDetails !== false}
                                  onChange={() => onUpdateSettings?.({ ...settings, calendar: { ...settings.calendar, showDetails: !(settings.calendar?.showDetails !== false) } })}
                                  className="rounded border-border-color text-accent-primary focus:ring-accent-primary bg-bg-page"
                              />
                              <span className="text-sm font-medium text-text-muted">{t('settings.calendar.details') || 'Details'}</span>
                          </label>
                      </div>
                  </div>
                  
                  <div className="bg-bg-card rounded-2xl p-4 border border-border-color overflow-x-auto shadow-sm">
                      <table className="w-full border-collapse">
                          <thead>
                              <tr>
                                  <th className="p-2 text-left text-xs font-bold uppercase text-text-muted w-12">{t('week') || 'Week'}</th>
                                  {(() => {
                                      const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                                      const days = dayKeys.map(key => t(`days.${key}`).substring(0, 3));
                                      
                                      const startDay = settings.weekStartDay || 'monday';
                                      let rotatedDays = [...days];
                                      if (startDay === 'sunday') {
                                          rotatedDays = [days[6], ...days.slice(0, 6)];
                                      } else if (startDay === 'saturday') {
                                          rotatedDays = [days[5], days[6], ...days.slice(0, 5)];
                                      }
                                      return rotatedDays.map(day => (
                                          <th key={day} className="p-2 text-left text-xs font-bold uppercase text-text-muted w-[13.5%]">{day}</th>
                                      ));
                                  })()}
                              </tr>
                          </thead>
                          <tbody className="space-y-2">
                              {calendarWeeks.map((week, wIdx) => {
                                  const firstDay = week.find(d => d !== null);
                                  let weekNum = 0;
                                  if (firstDay) {
                                      const d = new Date(firstDay.date);
                                      const onejan = new Date(d.getFullYear(), 0, 1);
                                      const millis = d.getTime() - onejan.getTime();
                                      weekNum = Math.ceil((((millis / 86400000) + onejan.getDay() + 1) / 7));
                                  }
                                  
                                  return (
                                  <tr key={wIdx}>
                                      <td className="p-2 align-top pt-4 w-12">
                                          <span className="text-xs font-bold text-text-muted block bg-bg-card/50 px-2 py-1 rounded text-center">{weekNum}</span>
                                      </td>
                                      {week.map((day, dIdx) => (
                                          <td key={dIdx} className="p-1 align-top h-36 w-[13.5%]">
                                              {day ? (
                                                  <div 
                                                      className="h-full rounded-xl border p-2 flex flex-col justify-between transition-all hover:scale-[1.05] hover:shadow-lg group relative overflow-hidden cursor-pointer"
                                                      style={getHeatmapStyle(day)}
                                                      onClick={() => {
                                                          const d1 = new Date(day.date);
                                                          const d2 = new Date();
                                                          d2.setDate(d2.getDate() - 1);
                                                          onNavigate(ViewState.HISTORICAL, { date1: d1, date2: d2 });
                                                      }}
                                                  >
                                                      <div className="flex justify-between items-start relative z-10">
                                                          <div className="flex items-center gap-1">
                                                              {(settings.calendar?.showDetails !== false) && (
                                                                  <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full shadow-sm ${day.date === new Date().toISOString().split('T')[0] ? 'bg-accent-primary text-text-inverse' : 'bg-bg-card/60'}`}>
                                                                      {day.day}
                                                                  </span>
                                                              )}
                                                              {(settings.calendar?.showDetails !== false) && (
                                                                  <div className="scale-75 origin-left">
                                                                    {day.rain && day.rain > 0.5 ? (
                                                                        <Icon name="rainy" className="text-2xl text-blue-500 drop-shadow-sm" />
                                                                    ) : day.sun && day.sun > 4 ? (
                                                                        <Icon name="sunny" className="text-2xl text-orange-500 drop-shadow-sm" />
                                                                    ) : day.sun && day.sun > 1 ? (
                                                                        <Icon name="partly_cloudy_day" className="text-2xl text-orange-400 drop-shadow-sm" />
                                                                    ) : (
                                                                        <Icon name="cloud" className="text-2xl text-text-muted drop-shadow-sm" />
                                                                    )}
                                                                  </div>
                                                              )}
                                                          </div>
                                                          <div className="flex flex-col items-end bg-bg-card/40 px-1.5 py-0.5 rounded-lg backdrop-blur-sm ml-auto">
                                                              <span className="text-sm font-bold">{day.maxTemp?.toFixed(1)}°</span>
                                                              <span className="text-[10px] opacity-70">{day.minTemp?.toFixed(1)}°</span>
                                                          </div>
                                                      </div>
                                                      
                                                      <div className="mt-auto flex flex-wrap gap-1 text-[10px] font-medium relative z-10">
                                                          {(settings.calendar?.showDetails !== false) && (
                                                              <>
                                                                  {day.sun && day.sun > 0 ? (
                                                                      <div className="flex items-center gap-1 text-orange-700 dark:text-orange-200 bg-orange-100/50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded-md w-fit" title={t('sunshine')}>
                                                                          <Icon name="sunny" className="text-[10px]" />
                                                                          {day.sun.toFixed(1)}u
                                                                      </div>
                                                                  ) : null}
                                                                  {day.rain && day.rain > 0 ? (
                                                                      <div className="flex items-center gap-1 text-blue-700 dark:text-blue-200 bg-blue-100/50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-md w-fit" title={t('precipitation')}>
                                                                          <Icon name="water_drop" className="text-[10px]" />
                                                                          {day.rain.toFixed(1)}
                                                                      </div>
                                                                  ) : null}
                                                              </>
                                                          )}
                                                      </div>
                                                  </div>
                                              ) : (
                                                  <div className="h-full rounded-xl bg-bg-page/20 border border-border-color/20"></div>
                                              )}
                                          </td>
                                      ))}
                                  </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
                  
                  {settings.calendar?.showHeatmap !== false && (
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-text-muted bg-bg-card p-3 rounded-xl border border-border-color w-fit mx-auto shadow-sm">
                        <div className="flex items-center gap-2">
                            <div className="flex gap-0.5">
                                <div className="w-3 h-3 rounded-sm bg-[#0000FF]"></div>
                                <div className="w-3 h-3 rounded-sm bg-[#1200ED]"></div>
                                <div className="w-3 h-3 rounded-sm bg-[#2400DB]"></div>
                            </div>
                            <span className="font-medium">{t('records.coldest_days')}</span>
                        </div>
                        <div className="w-px h-4 bg-border-color"></div>
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{t('records.warmest_days')}</span>
                            <div className="flex gap-0.5">
                                <div className="w-3 h-3 rounded-sm bg-[#DB0024]"></div>
                                <div className="w-3 h-3 rounded-sm bg-[#ED0012]"></div>
                                <div className="w-3 h-3 rounded-sm bg-[#FF0000]"></div>
                            </div>
                        </div>
                    </div>
                  )}
              </div>
          ) : (
            <div className="flex flex-col items-center gap-6 px-4 pb-10">
              <div className="w-full max-w-2xl grid grid-cols-1 gap-4">
                {renderRecordCard(
                  'records.max_temp_high',
                  'trending_up',
                  'text-red-500',
                  maxTempHigh,
                  value => `${formatTempValue(value)}°`
                )}
                {renderRecordCard(
                  'records.max_temp_low',
                  'trending_down',
                  'text-blue-500',
                  maxTempLow,
                  value => `${formatTempValue(value)}°`
                )}
                {renderRecordCard(
                  'records.min_temp_high',
                  'thermostat',
                  'text-orange-500',
                  minTempHigh,
                  value => `${formatTempValue(value)}°`
                )}
                {renderRecordCard(
                  'records.min_temp_low',
                  'ac_unit',
                  'text-sky-500',
                  minTempLow,
                  value => `${formatTempValue(value)}°`
                )}
                {monthAmplitude && (
                    <div className="w-full bg-bg-card rounded-2xl p-6 border border-border-color">
                        <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <Icon name="expand" className="text-purple-600" />
                            {t('records.month_amplitude')}
                        </h3>
                        </div>
                        <ul className="mt-2 space-y-2">
                            <li className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-text-main">
                                        {formatTempDeltaValue(monthAmplitude.value)}°
                                    </span>
                                    <span className="text-xs text-text-muted">
                                        (Max: {formatTempValue(monthAmplitude.max)}° - Min: {formatTempValue(monthAmplitude.min)}°)
                                    </span>
                                </div>
                            </li>
                        </ul>
                    </div>
                )}
                {renderRecordCard(
                  'records.max_amplitude',
                  'unfold_more',
                  'text-purple-500',
                  maxAmplitude,
                  value => `${formatTempDeltaValue(value)}°`
                )}

                {renderRecordCard(
                  'records.min_amplitude',
                  'unfold_less',
                  'text-purple-500',
                  minAmplitude,
                  value => `${formatTempDeltaValue(value)}°`
                )}
                {renderTimeTempDiffCard(
                  'records.colder_13_than_22',
                  'schedule',
                  'text-indigo-500',
                  colderAt13Than22
                )}
                {renderRecordCard(
                  'records.max_gust',
                  'cyclone',
                  'text-teal-500',
                  windGustMax,
                  value => {
                    const primary = convertWind(value, settings.windUnit);
                    if (settings.windUnit === WindUnit.BFT) {
                      const kmh = convertWind(value, WindUnit.KMH);
                      return (
                        <div className="flex flex-col items-end leading-tight">
                          <span>{primary} {settings.windUnit}</span>
                          <span className="text-xs font-normal opacity-70">({kmh} km/h)</span>
                        </div>
                      );
                    }
                    return `${primary} ${settings.windUnit}`;
                  }
                )}
                {renderRecordCard(
                  'records.max_rain',
                  'water_drop',
                  'text-blue-500',
                  rainMax,
                  value => `${convertPrecip(value, settings.precipUnit)}\u00a0${settings.precipUnit}`
                )}
              </div>

              {/* Climate Numbers */}
              {recordType === 'yearly' && climateNumbers && (
                  <div className="w-full max-w-2xl bg-bg-card rounded-2xl p-6 border border-border-color mb-6">
                      <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
                              <Icon name="public" className="text-accent-primary" />
                              {t('records.climate_numbers_title')}
                          </h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Hellmann */}
                          <div className="bg-bg-page rounded-xl p-4 border border-border-color flex flex-col relative group">
                              <div className="flex items-center justify-between mb-2">
                                  <span className="font-bold text-text-main flex items-center gap-2">
                                      <Icon name="ac_unit" className="text-blue-500" />
                                      {t('records.hellmann_title')}
                                  </span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setShowClimateModal(true); }}
                                    className="p-1 rounded-full hover:bg-bg-card transition-colors"
                                  >
                                      <Icon name="info" className="text-xs text-text-muted hover:text-text-main" />
                                  </button>
                              </div>
                              
                              <div className="flex items-end gap-2 mb-1">
                                  <span className="text-4xl font-black text-blue-500">{climateNumbers.hellmann.score.toFixed(1)}</span>
                              </div>
                              
                              {climateNumbers.hellmann.progression && (
                                  <span className="text-xs text-text-muted mb-3 italic">
                                      {climateNumbers.hellmann.progression}
                                  </span>
                              )}
                              
                              <div className="mt-auto pt-3 border-t border-border-color">
                                  <div className="grid grid-cols-5 gap-1">
                                      {climateNumbers.hellmann.monthlyScores.map((m, idx) => (
                                          <div key={idx} className="flex flex-col items-center">
                                              <span className="text-[10px] text-text-muted uppercase">{m.month}</span>
                                              <span className={`text-xs font-bold ${m.score > 0 ? 'text-blue-500' : 'text-text-muted opacity-50'}`}>
                                                  {m.score > 0 ? m.score.toFixed(1) : '-'}
                                              </span>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                              
                               <div className="mt-2 text-[10px] text-text-muted opacity-70">
                                  {formatDateLabel(climateNumbers.hellmann.startDate)} - {formatDateLabel(climateNumbers.hellmann.endDate)}
                               </div>
                          </div>
                          
                          {/* Heat Number */}
                          <div className="bg-bg-page rounded-xl p-4 border border-border-color flex flex-col relative group">
                              <div className="flex items-center justify-between mb-2">
                                  <span className="font-bold text-text-main flex items-center gap-2">
                                      <Icon name="local_fire_department" className="text-orange-500" />
                                      {t('records.heat_number_title')}
                                  </span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setShowClimateModal(true); }}
                                    className="p-1 rounded-full hover:bg-bg-card transition-colors"
                                  >
                                      <Icon name="info" className="text-xs text-text-muted hover:text-text-main" />
                                  </button>
                              </div>
                              
                              <div className="flex items-end gap-2 mb-1">
                                  <span className="text-4xl font-black text-orange-500">{climateNumbers.heat.score.toFixed(1)}</span>
                              </div>
                              
                              {climateNumbers.heat.progression && (
                                  <span className="text-xs text-text-muted mb-3 italic">
                                      {climateNumbers.heat.progression}
                                  </span>
                              )}
                              
                              <div className="mt-auto pt-3 border-t border-border-color">
                                  <div className="grid grid-cols-6 gap-1">
                                      {climateNumbers.heat.monthlyScores.map((m, idx) => (
                                          <div key={idx} className="flex flex-col items-center">
                                              <span className="text-[10px] text-text-muted uppercase">{m.month}</span>
                                              <span className={`text-xs font-bold ${m.score > 0 ? 'text-orange-500' : 'text-text-muted opacity-50'}`}>
                                                  {m.score > 0 ? m.score.toFixed(1) : '-'}
                                              </span>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                              
                               <div className="mt-2 text-[10px] text-text-muted opacity-70">
                                  {formatDateLabel(climateNumbers.heat.startDate)} - {formatDateLabel(climateNumbers.heat.endDate)}
                               </div>
                          </div>
                      </div>
                  </div>
              )}

              {/* Yearly Counts */}
              {(recordType === 'yearly' || recordType === '12month') && yearlyCounts && (
                <div className="w-full max-w-2xl bg-bg-card rounded-2xl p-6 border border-border-color">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Icon name="numbers" className="text-text-muted" />
                      {t('records.counts_title')}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.warm_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.warmDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.summer_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.summerDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.tropical_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.tropicalDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.frost_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.frostDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.ice_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.iceDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.dry_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.dryDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.rain_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.rainDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.heavy_rain_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.heavyRainDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.very_wet_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.veryWetDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.sunny_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.sunnyDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">{t('records.counts.gloomy_days')}</span>
                      <span className="font-bold text-text-main">{yearlyCounts.gloomyDays}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Sequences */}
              {(recordType === 'yearly' || recordType === '12month') && yearlySequences && (
                <div className="w-full max-w-2xl bg-bg-card rounded-2xl p-6 border border-border-color">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Icon name="timeline" className="text-text-muted" />
                      {t('records.sequences_title')}
                    </h3>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-text-muted font-medium">
                          {t('records.sequences.dry')}
                        </span>
                        <span className="text-[10px] text-text-muted mb-0.5 opacity-70">
                           &le; 0.2 {settings.precipUnit}
                        </span>
                        {yearlySequences.dry && yearlySequences.dry.start && yearlySequences.dry.end ? (
                          <span className="text-xs text-text-muted">
                            {formatDateLabel(yearlySequences.dry.start)} – {formatDateLabel(yearlySequences.dry.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.dry && yearlySequences.dry.length > 0 && (
                        <span className="font-bold text-text-main">
                          {yearlySequences.dry.length} {t('days')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-text-muted font-medium">
                          {t('records.sequences.wet')}
                        </span>
                        <span className="text-[10px] text-text-muted mb-0.5 opacity-70">
                           &ge; 0.2 {settings.precipUnit}
                        </span>
                        {yearlySequences.wet && yearlySequences.wet.start && yearlySequences.wet.end ? (
                          <span className="text-xs text-text-muted">
                            {formatDateLabel(yearlySequences.wet.start)} – {formatDateLabel(yearlySequences.wet.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.wet && yearlySequences.wet.length > 0 && (
                        <span className="font-bold text-text-main">
                          {yearlySequences.wet.length} {t('days')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-text-muted font-medium">
                          {t('records.sequences.gloomy')}
                        </span>
                        <span className="text-[10px] text-text-muted mb-0.5 opacity-70">
                           &le; 1h sun
                        </span>
                        {yearlySequences.gloomy && yearlySequences.gloomy.start && yearlySequences.gloomy.end ? (
                          <span className="text-xs text-text-muted">
                            {formatDateLabel(yearlySequences.gloomy.start)} – {formatDateLabel(yearlySequences.gloomy.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.gloomy && yearlySequences.gloomy.length > 0 && (
                        <span className="font-bold text-text-main">
                          {yearlySequences.gloomy.length} {t('days')}
                        </span>
                      )}
                    </div>



                     {/* Ice Streak */}
                     <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-text-muted font-medium">
                          {t('records.sequences.ice_streak')}
                        </span>
                        <span className="text-[10px] text-text-muted opacity-70 mb-0.5">
                           &le; {settings.recordThresholds?.iceStreakTemp ?? DEFAULT_SETTINGS.recordThresholds.iceStreakTemp}°
                        </span>
                        {yearlySequences.iceStreak && yearlySequences.iceStreak.start && yearlySequences.iceStreak.end ? (
                          <span className="text-xs text-text-muted">
                            {formatDateLabel(yearlySequences.iceStreak.start)} – {formatDateLabel(yearlySequences.iceStreak.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.iceStreak && yearlySequences.iceStreak.length > 0 && (
                        <span className="font-bold text-text-main">
                          {yearlySequences.iceStreak.length} {t('days')}
                        </span>
                      )}
                    </div>

                    {/* New Streaks */}
                    {/* Max < 0 (Ice Days) */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-text-muted font-medium">
                          {t('records.sequences.streak_max_below_zero')}
                        </span>
                        <span className="text-[10px] text-text-muted opacity-70 mb-0.5">
                           {t('records.sequences.streak_max_below_zero_desc')}
                        </span>
                        {yearlySequences.streakMaxBelowZero && yearlySequences.streakMaxBelowZero.start && yearlySequences.streakMaxBelowZero.end ? (
                          <span className="text-xs text-text-muted">
                            {formatDateLabel(yearlySequences.streakMaxBelowZero.start)} – {formatDateLabel(yearlySequences.streakMaxBelowZero.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.streakMaxBelowZero && yearlySequences.streakMaxBelowZero.length > 0 && (
                        <span className="font-bold text-text-main">
                          {yearlySequences.streakMaxBelowZero.length} {t('days')}
                        </span>
                      )}
                    </div>

                    {/* Min < 0 (Frost Days) */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-text-muted font-medium">
                          {t('records.sequences.streak_min_below_zero')}
                        </span>
                        <span className="text-[10px] text-text-muted opacity-70 mb-0.5">
                           {t('records.sequences.streak_min_below_zero_desc')}
                        </span>
                        {yearlySequences.streakMinBelowZero && yearlySequences.streakMinBelowZero.start && yearlySequences.streakMinBelowZero.end ? (
                          <span className="text-xs text-text-muted">
                            {formatDateLabel(yearlySequences.streakMinBelowZero.start)} – {formatDateLabel(yearlySequences.streakMinBelowZero.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.streakMinBelowZero && yearlySequences.streakMinBelowZero.length > 0 && (
                        <span className="font-bold text-text-main">
                          {yearlySequences.streakMinBelowZero.length} {t('days')}
                        </span>
                      )}
                    </div>

                    {/* Max < 5 */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-text-muted font-medium">
                          {t('records.sequences.streak_max_below_five')}
                        </span>
                        <span className="text-[10px] text-text-muted opacity-70 mb-0.5">
                           {t('records.sequences.streak_max_below_five_desc')}
                        </span>
                        {yearlySequences.streakMaxBelowFive && yearlySequences.streakMaxBelowFive.start && yearlySequences.streakMaxBelowFive.end ? (
                          <span className="text-xs text-text-muted">
                            {formatDateLabel(yearlySequences.streakMaxBelowFive.start)} – {formatDateLabel(yearlySequences.streakMaxBelowFive.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.streakMaxBelowFive && yearlySequences.streakMaxBelowFive.length > 0 && (
                        <span className="font-bold text-text-main">
                          {yearlySequences.streakMaxBelowFive.length} {t('days')}
                        </span>
                      )}
                    </div>

                    {/* Max > 25 */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-text-muted font-medium">
                          {t('records.sequences.streak_max_above_25')}
                        </span>
                        <span className="text-[10px] text-text-muted opacity-70 mb-0.5">
                           {t('records.sequences.streak_max_above_25_desc')}
                        </span>
                        {yearlySequences.streakMaxAbove25 && yearlySequences.streakMaxAbove25.start && yearlySequences.streakMaxAbove25.end ? (
                          <span className="text-xs text-text-muted">
                            {formatDateLabel(yearlySequences.streakMaxAbove25.start)} – {formatDateLabel(yearlySequences.streakMaxAbove25.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.streakMaxAbove25 && yearlySequences.streakMaxAbove25.length > 0 && (
                        <span className="font-bold text-text-main">
                          {yearlySequences.streakMaxAbove25.length} {t('days')}
                        </span>
                      )}
                    </div>

                    {/* Max > 30 */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-text-muted font-medium">
                          {t('records.sequences.streak_max_above_30')}
                        </span>
                        <span className="text-[10px] text-text-muted opacity-70 mb-0.5">
                           {t('records.sequences.streak_max_above_30_desc')}
                        </span>
                        {yearlySequences.streakMaxAbove30 && yearlySequences.streakMaxAbove30.start && yearlySequences.streakMaxAbove30.end ? (
                          <span className="text-xs text-text-muted">
                            {formatDateLabel(yearlySequences.streakMaxAbove30.start)} – {formatDateLabel(yearlySequences.streakMaxAbove30.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.streakMaxAbove30 && yearlySequences.streakMaxAbove30.length > 0 && (
                        <span className="font-bold text-text-main">
                          {yearlySequences.streakMaxAbove30.length} {t('days')}
                        </span>
                      )}
                    </div>

                    {/* Max > 35 */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-text-muted font-medium">
                          {t('records.sequences.streak_max_above_35')}
                        </span>
                        <span className="text-[10px] text-text-muted opacity-70 mb-0.5">
                           {t('records.sequences.streak_max_above_35_desc')}
                        </span>
                        {yearlySequences.streakMaxAbove35 && yearlySequences.streakMaxAbove35.start && yearlySequences.streakMaxAbove35.end ? (
                          <span className="text-xs text-text-muted">
                            {formatDateLabel(yearlySequences.streakMaxAbove35.start)} – {formatDateLabel(yearlySequences.streakMaxAbove35.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.streakMaxAbove35 && yearlySequences.streakMaxAbove35.length > 0 && (
                        <span className="font-bold text-text-main">
                          {yearlySequences.streakMaxAbove35.length} {t('days')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Heatwaves Section */}
              {recordType === 'yearly' && (
                <div className="w-full max-w-2xl bg-bg-card rounded-2xl p-6 border border-border-color">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
                      <Icon name="local_fire_department" className="text-orange-500" />
                      {t('records.sequences.heatwave')}
                    </h3>
                    <button 
                        onClick={() => setShowHeatwaveInfo(!showHeatwaveInfo)}
                        className="text-text-muted hover:text-accent-primary transition-colors"
                    >
                        <Icon name="info" className="text-sm" />
                    </button>
                  </div>

                  {showHeatwaveInfo && (
                      <div className="mb-4 p-3 bg-bg-page rounded-lg text-xs text-text-muted border border-border-color animate-in fade-in slide-in-from-top-1">
                          <p className="font-bold mb-1 text-text-main">{t('common.definition')}:</p>
                          <ul className="list-disc pl-4 space-y-1">
                              <li>{t('records.sequences.heatwave_min_days', { 
                                  days: (settings.heatwave || DEFAULT_SETTINGS.heatwave).minLength, 
                                  temp: (settings.heatwave || DEFAULT_SETTINGS.heatwave).lowerThreshold 
                              })}</li>
                              <li>{t('records.sequences.heatwave_min_heat_days', { 
                                  days: (settings.heatwave || DEFAULT_SETTINGS.heatwave).minHeatDays, 
                                  temp: (settings.heatwave || DEFAULT_SETTINGS.heatwave).heatThreshold 
                              })}</li>
                          </ul>
                      </div>
                  )}

                  <div className="space-y-3">
                    {heatwaves.length > 0 ? (
                      heatwaves.map((hw, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm border-b border-border-color last:border-0 pb-2 last:pb-0">
                          <div className="flex flex-col">
                             <span className="font-medium text-text-main">
                               {hw.start && hw.end ? `${formatDateLabel(hw.start)} – ${formatDateLabel(hw.end)}` : ''}
                             </span>
                             <div className="flex flex-wrap gap-1 mt-1 max-w-[200px] sm:max-w-xs">
                               {hw.temps && hw.temps.map((temp, idx) => (
                                 <span key={idx} className="text-[10px] text-text-muted bg-bg-page px-1 rounded border border-border-color/50">
                                   {formatTempValue(temp)}
                                 </span>
                               ))}
                             </div>
                          </div>
                          <span className="font-bold bg-orange-500/10 px-2 py-1 rounded-md text-orange-600 dark:text-orange-400 border border-orange-500/20">
                            {hw.length} {t('days')}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-text-muted text-center py-2">
                        {t('records.sequences.none')}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Holidays Section */}
              {(recordType === 'yearly' || recordType === '12month') && holidays.length > 0 && (
                <div className="w-full max-w-2xl bg-bg-card rounded-2xl p-6 border border-border-color">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
                            <Icon name="celebration" className="text-accent-primary" />
                            {t('records.holidays')} <span className="text-sm font-normal text-text-muted">({settings.countryCode || 'US'})</span>
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {holidays.map((holiday, idx) => {
                            const dayData = dailyData.find(d => d.date === holiday.date);
                            if (!dayData || dayData.maxTemp === null) return null;

                            return (
                                <div key={idx} className="bg-bg-page p-3 rounded-xl border border-border-color flex flex-col gap-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm text-text-main">{holiday.localName}</span>
                                            <span className="text-xs text-text-muted">{formatDateLabel(holiday.date)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col items-end">
                                                <span className="font-bold text-red-500">{dayData.maxTemp}°</span>
                                                <span className="text-xs text-blue-500">{dayData.minTemp}°</span>
                                            </div>
                                            {(() => {
                                                // Baro Score Calc - Use centralized logic
                                                const comfort = calculateComfortScore({
                                                    temperature_2m: dayData.maxTemp,
                                                    wind_speed_10m: dayData.windSpeed ?? 0,
                                                    relative_humidity_2m: 50, // Neutral assumption
                                                    precipitation_sum: dayData.rain ?? 0,
                                                    cloud_cover: dayData.cloudCover ?? 0,
                                                    precipitation_probability: 0,
                                                    weather_code: 0,
                                                    wind_gusts_10m: dayData.windGust ?? 0
                                                });
                                                const baroScore = comfort.score;
                                                
                                                let scoreColor = 'bg-red-500 text-white';
                                                if (baroScore >= 8) scoreColor = 'bg-green-500 text-white';
                                                else if (baroScore >= 6) scoreColor = 'bg-amber-500 text-white';
                                                else if (baroScore >= 4) scoreColor = 'bg-orange-500 text-white';
                                                
                                                return (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setShowComfortModal(true); }}
                                                        className={`w-8 h-8 rounded-lg ${scoreColor} flex items-center justify-center font-bold text-sm shadow-sm hover:opacity-80 transition-opacity`}
                                                    >
                                                        {baroScore}
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-text-muted mt-1">
                                        {dayData.rain !== null && (
                                            <span className="flex items-center gap-1" title={t('precipitation')}>
                                                <Icon name="water_drop" className="text-blue-400" />
                                                {dayData.rain > 0 ? `${dayData.rain} ${settings.precipUnit}` : '0'}
                                            </span>
                                        )}
                                        {dayData.cloudCover !== null && (
                                            <span className="flex items-center gap-1" title={t('cloud_cover')}>
                                                <Icon name="cloud" className="text-gray-400" />
                                                {Math.round(dayData.cloudCover)}%
                                            </span>
                                        )}
                                         {dayData.windSpeed !== undefined && dayData.windSpeed !== null && (
                                            <span className="flex items-center gap-1" title={t('wind_speed')}>
                                                <Icon name="air" className="text-teal-400" />
                                                {convertWind(dayData.windSpeed, settings.windUnit)} {settings.windUnit}
                                            </span>
                                         )}
                                    </div>

                                </div>
                            );
                        })}
                    </div>
                </div>
              )}
              
              {/* Diverse Records */}
              {recordType === 'yearly' && diverseRecords && (
                  <div className="w-full max-w-2xl bg-bg-card rounded-2xl p-6 border border-border-color">
                      <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
                              <Icon name="compare_arrows" className="text-text-muted" />
                              {t('records.diverse_title')}
                          </h3>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-4">
                          {/* Max Rise */}
                          <button 
                            className="bg-bg-page rounded-xl p-4 text-left hover:bg-bg-card border border-border-color transition-colors"
                            onClick={() => diverseRecords.maxRise && navigateToHistoricalCompare(diverseRecords.maxRise.day1, diverseRecords.maxRise.day2)}
                          >
                              <span className="text-sm font-medium text-text-muted block mb-2">
                                  {t('records.max_rise')}
                              </span>
                              {diverseRecords.maxRise ? (
                                  <div>
                                      <div className="text-2xl font-bold text-red-500 mb-1">
                                          +{formatTempValue(diverseRecords.maxRise.value)}°
                                      </div>
                                      <div className="text-xs text-text-muted flex flex-col gap-1">
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day1')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxRise.day1)}</span>
                                                  <span className="font-medium text-text-main">({formatTempValue(diverseRecords.maxRise.temp1)}°)</span>
                                              </span>
                                          </div>
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day2')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxRise.day2)}</span>
                                                  <span className="font-medium text-text-main">({formatTempValue(diverseRecords.maxRise.temp2)}°)</span>
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              ) : (
                                  <span className="text-sm text-text-muted opacity-60">{t('records.sequences.none')}</span>
                              )}
                          </button>

                          {/* Max Drop */}
                          <button 
                            className="bg-bg-page rounded-xl p-4 text-left hover:bg-bg-card border border-border-color transition-colors"
                            onClick={() => diverseRecords.maxDrop && navigateToHistoricalCompare(diverseRecords.maxDrop.day1, diverseRecords.maxDrop.day2)}
                          >
                              <span className="text-sm font-medium text-text-muted block mb-2">
                                  {t('records.max_drop')}
                              </span>
                              {diverseRecords.maxDrop ? (
                                  <div>
                                      <div className="text-2xl font-bold text-blue-500 mb-1">
                                          -{formatTempValue(diverseRecords.maxDrop.value)}°
                                      </div>
                                      <div className="text-xs text-text-muted flex flex-col gap-1">
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day1')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxDrop.day1)}</span>
                                                  <span className="font-medium text-text-main">({formatTempValue(diverseRecords.maxDrop.temp1)}°)</span>
                                              </span>
                                          </div>
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day2')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxDrop.day2)}</span>
                                                  <span className="font-medium text-text-main">({formatTempValue(diverseRecords.maxDrop.temp2)}°)</span>
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              ) : (
                                  <span className="text-sm text-text-muted opacity-60">{t('records.sequences.none')}</span>
                              )}
                          </button>

                          {/* Max Min to Max Rise */}
                          <button 
                            className="bg-bg-page rounded-xl p-4 text-left hover:bg-bg-card border border-border-color transition-colors"
                            onClick={() => diverseRecords.maxMinToMaxRise && navigateToHistoricalCompare(diverseRecords.maxMinToMaxRise.day1, diverseRecords.maxMinToMaxRise.day2)}
                          >
                              <span className="text-sm font-medium text-text-muted block mb-2">
                                  {t('records.max_min_to_max_rise_title')}
                              </span>
                              <span className="text-[10px] text-text-muted opacity-70 block mb-2 italic">
                                  {t('records.max_min_to_max_rise_desc')}
                              </span>
                              {diverseRecords.maxMinToMaxRise ? (
                                  <div>
                                      <div className="text-2xl font-bold text-red-500 mb-1">
                                          +{formatTempValue(diverseRecords.maxMinToMaxRise.value)}°
                                      </div>
                                      <div className="text-xs text-text-muted flex flex-col gap-1">
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day1')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxMinToMaxRise.day1)}</span>
                                                  <span className="font-medium text-text-main">({formatTempValue(diverseRecords.maxMinToMaxRise.temp1)}°)</span>
                                              </span>
                                          </div>
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day2')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxMinToMaxRise.day2)}</span>
                                                  <span className="font-medium text-text-main">({formatTempValue(diverseRecords.maxMinToMaxRise.temp2)}°)</span>
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              ) : (
                                  <span className="text-sm text-text-muted opacity-60">{t('records.sequences.none')}</span>
                              )}
                          </button>

                          {/* Max Max to Min Drop */}
                          <button 
                            className="bg-bg-page rounded-xl p-4 text-left hover:bg-bg-card border border-border-color transition-colors"
                            onClick={() => diverseRecords.maxMaxToMinDrop && navigateToHistoricalCompare(diverseRecords.maxMaxToMinDrop.day1, diverseRecords.maxMaxToMinDrop.day2)}
                          >
                              <span className="text-sm font-medium text-text-muted block mb-2">
                                  {t('records.max_max_to_min_drop_title')}
                              </span>
                              <span className="text-[10px] text-text-muted opacity-70 block mb-2 italic">
                                  {t('records.max_max_to_min_drop_desc')}
                              </span>
                              {diverseRecords.maxMaxToMinDrop ? (
                                  <div>
                                      <div className="text-2xl font-bold text-blue-500 mb-1">
                                          -{formatTempValue(diverseRecords.maxMaxToMinDrop.value)}°
                                      </div>
                                      <div className="text-xs text-text-muted flex flex-col gap-1">
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day1')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxMaxToMinDrop.day1)}</span>
                                                  <span className="font-medium text-text-main">({formatTempValue(diverseRecords.maxMaxToMinDrop.temp1)}°)</span>
                                              </span>
                                          </div>
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day2')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxMaxToMinDrop.day2)}</span>
                                                  <span className="font-medium text-text-main">({formatTempValue(diverseRecords.maxMaxToMinDrop.temp2)}°)</span>
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              ) : (
                                  <span className="text-sm text-text-muted opacity-60">{t('records.sequences.none')}</span>
                              )}
                          </button>

                          {/* Oplopende Trap */}
                          <div className="bg-bg-page rounded-xl p-4 border border-border-color">
                              <span className="text-sm font-medium text-text-muted block mb-2">
                                  {t('records.sequences.rising_staircase')} ({t('records.sequences.rising_staircase_desc')})
                              </span>
                              {diverseRecords.risingStaircase ? (
                                  <div>
                                      <div className="text-2xl font-bold text-orange-500 mb-1">
                                          {diverseRecords.risingStaircase.length} {t('days')}
                                      </div>
                                      <div className="text-xs text-text-muted mb-2">
                                          {formatDateLabel(diverseRecords.risingStaircase.start)} – {formatDateLabel(diverseRecords.risingStaircase.end)}
                                      </div>
                                      {diverseRecords.risingStaircase.temps && diverseRecords.risingStaircase.days && (
                                          <div className="mt-2 flex flex-wrap gap-2">
                                              {diverseRecords.risingStaircase.temps.map((temp, i) => (
                                                  <div key={i} className="flex flex-col items-center bg-bg-card px-2 py-1 rounded border border-border-color">
                                                       <span className="text-[10px] text-text-muted">{new Date(diverseRecords.risingStaircase!.days![i]).getDate()} {new Date(diverseRecords.risingStaircase!.days![i]).toLocaleString(getLocale(), { month: 'short' })}</span>
                                                       <span className="text-xs font-bold">{temp.toFixed(1)}°</span>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              ) : (
                                  <span className="text-sm text-text-muted opacity-60">{t('records.sequences.none')}</span>
                              )}
                          </div>

                          {/* Aflopende Trap */}
                          <div className="bg-bg-page rounded-xl p-4 border border-border-color">
                              <span className="text-sm font-medium text-text-muted block mb-2">
                                  {t('records.sequences.falling_staircase')} ({t('records.sequences.falling_staircase_desc')})
                              </span>
                              {diverseRecords.fallingStaircase ? (
                                  <div>
                                      <div className="text-2xl font-bold text-blue-400 mb-1">
                                          {diverseRecords.fallingStaircase.length} {t('days')}
                                      </div>
                                      <div className="text-xs text-text-muted mb-2">
                                          {formatDateLabel(diverseRecords.fallingStaircase.start)} – {formatDateLabel(diverseRecords.fallingStaircase.end)}
                                      </div>
                                      {diverseRecords.fallingStaircase.temps && diverseRecords.fallingStaircase.days && (
                                          <div className="mt-2 flex flex-wrap gap-2">
                                              {diverseRecords.fallingStaircase.temps.map((temp, i) => (
                                                  <div key={i} className="flex flex-col items-center bg-bg-card px-2 py-1 rounded border border-border-color">
                                                       <span className="text-[10px] text-text-muted">{new Date(diverseRecords.fallingStaircase!.days![i]).getDate()} {new Date(diverseRecords.fallingStaircase!.days![i]).toLocaleString(getLocale(), { month: 'short' })}</span>
                                                       <span className="text-xs font-bold">{temp.toFixed(1)}°</span>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              ) : (
                                  <span className="text-sm text-text-muted opacity-60">{t('records.sequences.none')}</span>
                              )}
                          </div>

                          {/* Stable Streak (Moved here) */}
                          <div className="bg-bg-page rounded-xl p-4 border border-border-color">
                              <span className="text-sm font-medium text-text-muted block mb-2">
                                  {t('records.sequences.stable_streak')} ({t('records.sequences.stable_streak_desc')})
                              </span>
                              {yearlySequences.stableStreak ? (
                                  <div>
                                      <div className="text-2xl font-bold text-teal-500 mb-1">
                                          {yearlySequences.stableStreak.length} {t('days')}
                                      </div>
                                      <div className="text-xs text-text-muted mb-2">
                                          {formatDateLabel(yearlySequences.stableStreak.start)} – {formatDateLabel(yearlySequences.stableStreak.end)}
                                      </div>
                                      {yearlySequences.stableStreak.temps && yearlySequences.stableStreak.days && (
                                          <div className="mt-2 flex flex-wrap gap-2">
                                              {yearlySequences.stableStreak.temps.map((temp, i) => {
                                                  const maxT = Math.max(...yearlySequences.stableStreak!.temps!);
                                                  const minT = Math.min(...yearlySequences.stableStreak!.temps!);
                                                  let bgClass = "bg-bg-card border-border-color";
                                                  let textClass = "text-text-main";
                                                  
                                                  if (temp === maxT) {
                                                      bgClass = "bg-red-500/10 border-red-500/20";
                                                      textClass = "text-red-500";
                                                  } else if (temp === minT) {
                                                      bgClass = "bg-blue-500/10 border-blue-500/20";
                                                      textClass = "text-blue-500";
                                                  }

                                                  return (
                                                      <div key={i} className={`flex flex-col items-center px-2 py-1 rounded border ${bgClass}`}>
                                                          <span className="text-[10px] text-text-muted">{new Date(yearlySequences.stableStreak!.days![i]).getDate()} {new Date(yearlySequences.stableStreak!.days![i]).toLocaleString(getLocale(), { month: 'short' })}</span>
                                                          <span className={`text-xs font-bold ${textClass}`}>{temp.toFixed(1)}°</span>
                                                      </div>
                                                  );
                                              })}
                                          </div>
                                      )}
                                  </div>
                              ) : (
                                  <span className="text-sm text-text-muted opacity-60">{t('records.sequences.none')}</span>
                              )}
                          </div>

                          {/* JoJo Streak */}
                          <div className="bg-bg-page rounded-xl p-4 border border-border-color">
                              <span className="text-sm font-medium text-text-muted block mb-2">
                                  {t('records.sequences.jojo_streak')} <span className="text-xs opacity-70">({t('max_temp')})</span>
                              </span>
                              {diverseRecords.jojoStreak ? (
                                  <div>
                                      <div className="text-2xl font-bold text-purple-500 mb-1">
                                          {diverseRecords.jojoStreak.length} {t('days')}
                                      </div>
                                      <div className="text-xs text-text-muted mb-2">
                                          {formatDateLabel(diverseRecords.jojoStreak.start)} – {formatDateLabel(diverseRecords.jojoStreak.end)}
                                      </div>
                                      {diverseRecords.jojoStreak.temps && diverseRecords.jojoStreak.days && (
                                          <div className="mt-2 flex flex-wrap gap-2">
                                              {diverseRecords.jojoStreak.temps.map((temp, i, arr) => {
                                                  // Determine if warm (peak) or cold (valley)
                                                  // For Jojo, peaks are red, valleys are blue.
                                                  // Logic: compare with neighbors.
                                                  let isPeak = false;
                                                  let isValley = false;
                                                  
                                                  const prev = i > 0 ? arr[i-1] : null;
                                                  const next = i < arr.length - 1 ? arr[i+1] : null;
                                                  
                                                  if (prev === null) {
                                                      // First item
                                                      if (next !== null) {
                                                          if (temp > next) isPeak = true;
                                                          else if (temp < next) isValley = true;
                                                      }
                                                  } else if (next === null) {
                                                      // Last item
                                                      if (prev !== null) {
                                                          if (temp > prev) isPeak = true;
                                                          else if (temp < prev) isValley = true;
                                                      }
                                                  } else {
                                                      // Middle
                                                      if (temp > prev && temp > next) isPeak = true;
                                                      else if (temp < prev && temp < next) isValley = true;
                                                      
                                                      // Special case: if it's part of a run?
                                                      // JoJo implies strictly alternating, but data might have small noise?
                                                      // But findJoJoStreak enforces alternating direction.
                                                      // So it should be peak/valley/peak/valley.
                                                      // However, let's just stick to local comparison.
                                                      // If findJoJoStreak logic holds, every internal point is a peak or valley.
                                                  }

                                                  let bgClass = "bg-bg-card border-border-color";
                                                  let textClass = "text-text-main";

                                                  if (isPeak) {
                                                      bgClass = "bg-red-500/10 border-red-500/20";
                                                      textClass = "text-red-500";
                                                  } else if (isValley) {
                                                      bgClass = "bg-blue-500/10 border-blue-500/20";
                                                      textClass = "text-blue-500";
                                                  }

                                                  return (
                                                      <div key={i} className={`flex flex-col items-center px-2 py-1 rounded border ${bgClass}`}>
                                                          <span className="text-[10px] text-text-muted">{new Date(diverseRecords.jojoStreak!.days![i]).getDate()} {new Date(diverseRecords.jojoStreak!.days![i]).toLocaleString(getLocale(), { month: 'short' })}</span>
                                                          <span className={`text-xs font-bold ${textClass}`}>{temp.toFixed(1)}°</span>
                                                      </div>
                                                  );
                                              })}
                                          </div>
                                      )}
                                  </div>
                              ) : (
                                  <span className="text-sm text-text-muted opacity-60">{t('records.sequences.none')}</span>
                              )}
                          </div>

                          {/* Extremes Section */}
                          {diverseRecords.extremes && (
                              <div className="grid grid-cols-1 gap-4">
                                  {/* Summer Days (>= 25) */}
                                  <div className="bg-bg-page rounded-xl p-4 border border-border-color">
                                      <span className="text-sm font-medium text-text-muted block mb-2">
                                          {t('records.extremes.first_summer')}
                                      </span>
                                      {diverseRecords.extremes.firstSummer ? (
                                          <button 
                                            className="flex items-center justify-between w-full hover:opacity-80 transition-opacity"
                                            onClick={() => diverseRecords.extremes?.firstSummer && navigateToHistoricalSingle(diverseRecords.extremes.firstSummer.date)}
                                          >
                                              <span className="font-bold text-text-main underline-offset-2 hover:underline">{formatDateLabel(diverseRecords.extremes.firstSummer.date)}</span>
                                              <span className="text-amber-500 font-bold">{diverseRecords.extremes.firstSummer.temp}°</span>
                                          </button>
                                      ) : <span className="text-sm text-text-muted opacity-60">-</span>}
                                  </div>
                                  <div className="bg-bg-page rounded-xl p-4 border border-border-color">
                                      <span className="text-sm font-medium text-text-muted block mb-2">
                                          {t('records.extremes.last_summer')}
                                      </span>
                                      {diverseRecords.extremes.lastSummer ? (
                                          <button 
                                            className="flex items-center justify-between w-full hover:opacity-80 transition-opacity"
                                            onClick={() => diverseRecords.extremes?.lastSummer && navigateToHistoricalSingle(diverseRecords.extremes.lastSummer.date)}
                                          >
                                              <span className="font-bold text-text-main underline-offset-2 hover:underline">{formatDateLabel(diverseRecords.extremes.lastSummer.date)}</span>
                                              <span className="text-amber-500 font-bold">{diverseRecords.extremes.lastSummer.temp}°</span>
                                          </button>
                                      ) : <span className="text-sm text-text-muted opacity-60">-</span>}
                                  </div>

                                  {/* Warm Days (>= 20) -> "Lekker" */}
                                  <div className="bg-bg-page rounded-xl p-4 border border-border-color">
                                      <span className="text-sm font-medium text-text-muted block mb-2">
                                          {t('records.extremes.first_warm')}
                                      </span>
                                      {diverseRecords.extremes.firstWarm ? (
                                          <button 
                                            className="flex items-center justify-between w-full hover:opacity-80 transition-opacity"
                                            onClick={() => diverseRecords.extremes?.firstWarm && navigateToHistoricalSingle(diverseRecords.extremes.firstWarm.date)}
                                          >
                                              <span className="font-bold text-text-main underline-offset-2 hover:underline">{formatDateLabel(diverseRecords.extremes.firstWarm.date)}</span>
                                              <span className="text-amber-500 font-bold">{diverseRecords.extremes.firstWarm.temp}°</span>
                                          </button>
                                      ) : <span className="text-sm text-text-muted opacity-60">-</span>}
                                  </div>
                                  <div className="bg-bg-page rounded-xl p-4 border border-border-color">
                                      <span className="text-sm font-medium text-text-muted block mb-2">
                                          {t('records.extremes.last_warm')}
                                      </span>
                                      {diverseRecords.extremes.lastWarm ? (
                                          <button 
                                            className="flex items-center justify-between w-full hover:opacity-80 transition-opacity"
                                            onClick={() => diverseRecords.extremes?.lastWarm && navigateToHistoricalSingle(diverseRecords.extremes.lastWarm.date)}
                                          >
                                              <span className="font-bold text-text-main underline-offset-2 hover:underline">{formatDateLabel(diverseRecords.extremes.lastWarm.date)}</span>
                                              <span className="text-amber-500 font-bold">{diverseRecords.extremes.lastWarm.temp}°</span>
                                          </button>
                                      ) : <span className="text-sm text-text-muted opacity-60">-</span>}
                                  </div>
                              </div>
                          )}

                          {/* Frost Info - Moved here */}
                          {frostInfo && (
                              <>
                                  <div className="bg-bg-page rounded-xl p-4 border border-border-color">
                                      <span className="text-sm font-medium text-text-muted block mb-2">
                                          {t('records.frost.first')}
                                      </span>
                                      {frostInfo.firstFrost ? (
                                          <button 
                                            className="text-lg flex justify-between items-center w-full"
                                            onClick={() => frostInfo.firstFrost && navigateToHistoricalSingle(frostInfo.firstFrost.date)}
                                          >
                                              <span className="font-bold text-text-main underline-offset-2 hover:underline">{formatDateLabel(frostInfo.firstFrost.date)}</span>
                                              <span className="text-blue-500 font-bold">{frostInfo.firstFrost.temp}°</span>
                                          </button>
                                      ) : (
                                          <span className="text-sm text-text-muted opacity-60">{t('records.sequences.none')}</span>
                                      )}
                                  </div>

                                  <div className="bg-bg-page rounded-xl p-4 border border-border-color">
                                      <span className="text-sm font-medium text-text-muted block mb-2">
                                          {t('records.frost.last')}
                                      </span>
                                      {frostInfo.lastFrost ? (
                                          <button 
                                            className="text-lg flex justify-between items-center w-full"
                                            onClick={() => frostInfo.lastFrost && navigateToHistoricalSingle(frostInfo.lastFrost.date)}
                                          >
                                              <span className="font-bold text-text-main underline-offset-2 hover:underline">{formatDateLabel(frostInfo.lastFrost.date)}</span>
                                              <span className="text-blue-500 font-bold">{frostInfo.lastFrost.temp}°</span>
                                          </button>
                                      ) : (
                                          <span className="text-sm text-text-muted opacity-60">{t('records.sequences.none')}</span>
                                      )}
                                  </div>
                              </>
                          )}
                      </div>
                  </div>
              )}

              {/* Perioden Section */}
              {(recordType === 'yearly' || recordType === '12month') && periodRecords && (
                <div className="w-full max-w-2xl bg-bg-card rounded-2xl p-6 border border-border-color mt-6">
                      <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xl font-bold flex items-center gap-2 text-text-main">
                              <Icon name="calendar_month" className="text-text-muted" />
                              {t('records.periods_title')}
                          </h3>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-4">
                          {/* Weken */}
                          <div className="space-y-4">
                              <h4 className="text-sm font-bold text-text-muted uppercase tracking-wider">{t('records.weeks_title')}</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {[
                                      { key: 'warmestWeekMax', label: t('records.warmest_week_max'), color: 'text-red-500', avgLabel: t('records.avg_max') },
                                      { key: 'warmestWeekMin', label: t('records.warmest_week_min'), color: 'text-orange-500', avgLabel: t('records.avg_min') },
                                      { key: 'coldestWeekMax', label: t('records.coldest_week_max'), color: 'text-blue-400', avgLabel: t('records.avg_max') },
                                      { key: 'coldestWeekMin', label: t('records.coldest_week_min'), color: 'text-blue-600', avgLabel: t('records.avg_min') }
                                  ].map(item => {
                                      const record = periodRecords[item.key as keyof PeriodRecords];
                                      if (!record) return null;
                                      return (
                                          <div key={item.key} className="bg-bg-page rounded-xl p-4 border border-border-color">
                                              <span className="text-sm font-medium text-text-muted block mb-1">{item.label}</span>
                                              <div className="flex items-center justify-between mb-2">
                                                  <span className="text-xs text-text-muted">
                                                      {new Date(record.start).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' })} - {new Date(record.end).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' })}
                                                  </span>
                                                  <span className="text-xs font-bold bg-bg-card px-2 py-0.5 rounded text-text-main">
                                                      {t('records.week_nr')} {record.weekNr}
                                                  </span>
                                              </div>
                                              <div className={`text-xl font-bold ${item.color} mb-2`}>
                                                  {record.avgValue.toFixed(1)}° <span className="text-[10px] font-normal text-text-muted">({item.avgLabel})</span>
                                              </div>
                                              <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                                                  {record.temps.map((temp, idx) => (
                                                      <div key={idx} className="flex flex-col items-center min-w-[24px]">
                                                          <span className="text-[9px] font-bold text-text-main">{temp.toFixed(0)}°</span>
                                                      </div>
                                                  ))}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>

                          {/* Weekenden */}
                          <div className="space-y-4 mt-4">
                              <h4 className="text-sm font-bold text-text-muted uppercase tracking-wider">{t('records.weekends_title')}</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {[
                                      { key: 'warmestWeekendMax', label: t('records.warmest_weekend_max'), color: 'text-red-500', avgLabel: t('records.avg_max') },
                                      { key: 'warmestWeekendMin', label: t('records.warmest_weekend_min'), color: 'text-orange-500', avgLabel: t('records.avg_min') },
                                      { key: 'coldestWeekendMax', label: t('records.coldest_weekend_max'), color: 'text-blue-400', avgLabel: t('records.avg_max') },
                                      { key: 'coldestWeekendMin', label: t('records.coldest_weekend_min'), color: 'text-blue-600', avgLabel: t('records.avg_min') }
                                  ].map(item => {
                                      const record = periodRecords[item.key as keyof PeriodRecords];
                                      if (!record) return null;
                                      return (
                                          <div key={item.key} className="bg-bg-page rounded-xl p-4 border border-border-color">
                                              <span className="text-sm font-medium text-text-muted block mb-1">{item.label}</span>
                                              <div className="flex items-center justify-between mb-2">
                                                  <span className="text-xs text-text-muted">
                                                      {new Date(record.start).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' })} - {new Date(record.end).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' })}
                                                  </span>
                                              </div>
                                              <div className={`text-xl font-bold ${item.color} mb-2`}>
                                                  {record.avgValue.toFixed(1)}° <span className="text-[10px] font-normal text-text-muted">({item.avgLabel})</span>
                                              </div>
                                              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                                  {record.temps.map((temp, idx) => (
                                                      <div key={idx} className="flex flex-col items-center min-w-[24px]">
                                                          <span className="text-[10px] font-bold text-text-main">{temp.toFixed(1)}°</span>
                                                          <span className="text-[8px] text-text-muted uppercase">{idx === 0 ? 'za' : 'zo'}</span>
                                                      </div>
                                                  ))}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {(recordType === 'yearly' || recordType === '12month') && dailyData.length > 0 && (
                  <div className="w-full max-w-2xl mt-6">
                      <MonthlyBoxPlotChart data={dailyData} settings={settings} />
                  </div>
              )}
              {(recordType === 'yearly' || recordType === '12month') && dailyData.length > 0 && (
                  <div className="w-full max-w-2xl mt-6">
                      <MonthlyRainChart data={dailyData} settings={settings} />
                  </div>
              )}
              {(recordType === 'yearly' || recordType === '12month') && dailyData.length > 0 && (
                  <div className="w-full max-w-2xl mt-6">
                      <MonthlySunChart data={dailyData} settings={settings} />
                  </div>
              )}
            </div>
          )}
        </div>
      </div>
      <ComfortScoreModal 
          isOpen={showComfortModal} 
          onClose={() => setShowComfortModal(false)} 
          settings={settings} 
      />
      <ClimateScoreModal 
        isOpen={showClimateModal} 
        onClose={() => setShowClimateModal(false)} 
        settings={settings} 
      />
      {showFeelsLikeModal && currentWeather && (
        <FeelsLikeInfoModal
            isOpen={showFeelsLikeModal}
            onClose={() => setShowFeelsLikeModal(false)}
            settings={settings}
            currentTemp={currentWeather.current.temperature_2m}
            windSpeed={currentWeather.current.wind_speed_10m}
            humidity={currentWeather.current.relative_humidity_2m}
            apparentTemp={currentWeather.current.apparent_temperature}
        />
      )}
    </div>
  );
};
