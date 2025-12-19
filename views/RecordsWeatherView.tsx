import React, { useEffect, useState, useMemo } from 'react';
import { ViewState, AppSettings, Location, WindUnit } from '../types';
import { Icon } from '../components/Icon';
import { fetchHistorical, convertTemp, convertWind, convertPrecip } from '../services/weatherService';
import { loadCurrentLocation, saveCurrentLocation, DEFAULT_SETTINGS } from '../services/storageService';
import { getTranslation } from '../services/translations';
import { reverseGeocode } from '../services/geoService';
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
  ReferenceLine
} from 'recharts';

interface Props {
  onNavigate: (view: ViewState, params?: any) => void;
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
}

interface RecordEntry {
  value: number;
  date: string;
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
  firstFrost: string | null;
  lastFrost: string | null;
}

interface Streak {
  length: number;
  start: string | null;
  end: string | null;
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
  summerStreak: Streak | null;
  niceStreak: Streak | null;
  coldStreak: Streak | null;
  iceStreak: Streak | null;
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
    extremes: ExtremesInfo | null;
}

interface MonthlyStats {
    maxTempHigh: { value: number, date: string } | null;
    maxTempLow: { value: number, date: string } | null;
    minTempLow: { value: number, date: string } | null;
    totalRain: number;
    totalSun: number;
    frostDays: number;
    iceDays: number;
    summerDays: number;
    tropicalDays: number;
    dryDays: number;
    rainDays: number;
}

interface DailyData {
    day: number;
    date: string;
    maxTemp: number | null;
    minTemp: number | null;
    rain: number | null;
    sun: number | null;
    isWeekend: boolean;
}

export const RecordsWeatherView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
  const [location, setLocation] = useState<Location>(loadCurrentLocation());
  const [recordType, setRecordType] = useState<'12month' | 'yearly' | 'monthly' | 'calendar'>('yearly');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [maxTempHigh, setMaxTempHigh] = useState<RecordEntry[]>([]);
  const [maxTempLow, setMaxTempLow] = useState<RecordEntry[]>([]);
  const [minTempHigh, setMinTempHigh] = useState<RecordEntry[]>([]);
  const [minTempLow, setMinTempLow] = useState<RecordEntry[]>([]);
  const [windGustMax, setWindGustMax] = useState<RecordEntry[]>([]);
  const [rainMax, setRainMax] = useState<RecordEntry[]>([]);
  const [maxAmplitude, setMaxAmplitude] = useState<RecordEntry[]>([]);
  const [yearlyCounts, setYearlyCounts] = useState<YearlyCounts | null>(null);
  const [frostInfo, setFrostInfo] = useState<FrostInfo | null>(null);
  const [yearlySequences, setYearlySequences] = useState<YearlySequences | null>(null);
  const [diverseRecords, setDiverseRecords] = useState<DiverseRecords | null>(null);
  const [heatwaves, setHeatwaves] = useState<HeatwaveStreak[]>([]);
  const [showHeatwaveInfo, setShowHeatwaveInfo] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);

  useEffect(() => {
    saveCurrentLocation(location);
  }, [location]);

  useEffect(() => {
      if (recordType === 'monthly' || recordType === 'calendar') {
          const now = new Date();
          setSelectedYear(now.getFullYear());
          setSelectedMonth(now.getMonth() + 1);
      }
  }, [recordType]);

  const t = (key: string) => getTranslation(key, settings.language);

  const formatTempValue = (valueC: number): string => {
    if (settings.tempUnit === 'F') {
      const f = (valueC * 9) / 5 + 32;
      return f.toFixed(1);
    }
    return valueC.toFixed(1);
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
     setYearlyCounts(null);
    setFrostInfo(null);
    setYearlySequences(null);
    setDiverseRecords(null);
    setHeatwaves([]);
    setMonthlyStats(null);
    setDailyData([]);

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
          endDateStr = today.toISOString().split('T')[0];
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
      const rainValues: number[] | undefined = daily?.precipitation_sum;
      const sunshineValues: number[] | undefined = daily?.sunshine_duration;
      const daylightValues: number[] | undefined = daily?.daylight_duration;

      if (recordType !== 'monthly' && recordType !== 'calendar' && (!times || !maxTemps || !minTemps || times.length === 0)) {
        setError(t('errors.no_data'));
        setLoading(false);
        return;
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
          let frostDays = 0;
          let iceDays = 0;
          let summerDays = 0;
          let tropicalDays = 0;
          let dryDays = 0;
          let rainDays = 0;
          
          const dailyDataList: DailyData[] = [];

          const dataMap = new Map<string, { tMax: number, tMin: number, rain: number, sun: number }>();
          if (times && maxTemps && minTemps) {
              for(let i=0; i<times.length; i++) {
                  dataMap.set(times[i], {
                      tMax: maxTemps[i],
                      tMin: minTemps[i],
                      rain: rainValues ? rainValues[i] : 0,
                      sun: sunshineValues ? sunshineValues[i] : 0
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
                  const { tMax, tMin, rain, sun } = entry;

                  if (tMax > maxTempHighVal) { maxTempHighVal = tMax; maxTempHighDate = dateStr; }
                  if (tMax < maxTempLowVal) { maxTempLowVal = tMax; maxTempLowDate = dateStr; }
                  if (tMin < minTempLowVal) { minTempLowVal = tMin; minTempLowDate = dateStr; }
                  
                  if (rain) totalRain += rain;
                  if (sun) totalSun += sun / 3600;
                  
                  if (tMin < 0) frostDays++;
                  if (tMax <= 0) iceDays++;
                  if (tMax >= recordThresholds.summerStreakTemp) summerDays++;
                  if (tMax >= heatwaveSettings.heatThreshold) tropicalDays++;
                  if ((rain || 0) < 0.2) dryDays++;
                  if ((rain || 0) >= 0.2) rainDays++;
                  
                  dailyDataList.push({
                      day: d,
                      date: dateStr,
                      maxTemp: convertTemp(tMax, settings.tempUnit),
                      minTemp: convertTemp(tMin, settings.tempUnit),
                      rain: convertPrecip(rain || 0, settings.precipUnit),
                      sun: (sun || 0) / 3600,
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
             amplitudeEntries.push({ value: tMax - tMin, date: times[i] });
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

      for (let i = 0; i < times.length - 1; i++) {
        const tMax1 = maxTemps[i];
        const tMax2 = maxTemps[i+1];
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

             // Drop (diff is negative for drop, so we look for largest magnitude negative number, or largest positive drop value)
             // User asked for "greatest temp drop", usually meaning tMax1 - tMax2 is max.
             const drop = tMax1 - tMax2;
             if (drop > maxDropVal) {
                 maxDropVal = drop;
                 maxDropDay1 = times[i];
                 maxDropDay2 = times[i+1];
                 maxDropTemp1 = tMax1;
                 maxDropTemp2 = tMax2;
             }
        }
      }

      setDiverseRecords({
          maxRise: maxRiseVal > -Infinity ? { value: maxRiseVal, day1: maxRiseDay1, day2: maxRiseDay2, temp1: maxRiseTemp1, temp2: maxRiseTemp2 } : null,
          maxDrop: maxDropVal > -Infinity ? { value: maxDropVal, day1: maxDropDay1, day2: maxDropDay2, temp1: maxDropTemp1, temp2: maxDropTemp2 } : null
      });

      if (recordType === 'yearly') {
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

        let firstFrost: string | null = null;
        let lastFrost: string | null = null;
        let firstFrostAfterLongest: string | null = null;
        let lastFrostBeforeLongest: string | null = null;
        
        // Absolute year records
        let absFirstFrost: string | null = null;
        let absLastFrost: string | null = null;
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

          const maxVal = convertTemp(loopTMax, settings.tempUnit);
          const minVal = convertTemp(loopTMin, settings.tempUnit);
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
            if (!absFirstFrost) absFirstFrost = date;
            absLastFrost = date;

            if (longestDayIndex >= 0) {
              if (i > longestDayIndex) {
                if (!firstFrostAfterLongest) {
                  firstFrostAfterLongest = date;
                }
              } else if (i < longestDayIndex) {
                lastFrostBeforeLongest = date;
              }
            } else {
              if (!firstFrostAfterLongest) {
                firstFrostAfterLongest = date;
              }
              lastFrostBeforeLongest = date;
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
        
        // New streaks based on settings
        const recordThresholds = settings.recordThresholds || DEFAULT_SETTINGS.recordThresholds || {
            summerStreakTemp: 25,
            niceStreakTemp: 20,
            coldStreakTemp: 5,
            iceStreakTemp: 0
        };

        const summerStreak = findStreak(maxTempsConverted, times, v => v >= recordThresholds.summerStreakTemp);
        const niceStreak = findStreak(maxTempsConverted, times, v => v >= recordThresholds.niceStreakTemp);
        const coldStreak = findStreak(maxTempsConverted, times, v => v < recordThresholds.coldStreakTemp);
        const iceStreak = findStreak(maxTempsConverted, times, v => v <= recordThresholds.iceStreakTemp);

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
            }
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
          summerStreak,
          niceStreak,
          coldStreak,
          iceStreak,
        });
      }
      setLoading(false);
  };

  const formatDateLabel = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(
      settings.language === 'nl' ? 'nl-NL' : 'en-GB',
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
      return date.toLocaleString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'long' });
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
      'bg-amber-500 text-white',
      'bg-slate-400 text-white',
      'bg-orange-400 text-white',
    ];

    return (
      <div className="w-full bg-slate-100 dark:bg-white/5 rounded-2xl p-6 border border-slate-200 dark:border-white/5">
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
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border border-white/40 shadow-sm ${
                      medalClasses[index] ?? 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <span className="text-sm text-slate-600 dark:text-white/70">
                    {formatDateLabel(entry.date)}
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-800 dark:text-white text-right">
                  {formatValue(entry.value)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500 dark:text-white/60">{t('no_data_available')}</p>
        )}
      </div>
    );
  };

  return (
    <div className="relative min-h-screen flex flex-col pb-20 overflow-y-auto overflow-x-hidden text-slate-800 dark:text-white bg-slate-50 dark:bg-background-dark transition-colors duration-300">
      <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/10 to-background-dark/90 z-0 pointer-events-none hidden dark:block" />

      <div className="relative z-10 flex flex-col h-full w-full">
        <div className="flex flex-col pt-8 pb-4">
            <div className="flex items-center justify-center relative px-4 mb-4">
            <button
              onClick={() => onNavigate(ViewState.CURRENT)}
              className="absolute left-6 text-slate-400 dark:text-white/60 hover:text-slate-800 dark:hover:text-white transition-colors p-2"
            >
              <Icon name="arrow_back_ios_new" />
            </button>
            <div className="flex flex-col items-center">
              <h2 className="text-2xl font-bold leading-tight flex items-center gap-2 drop-shadow-md dark:drop-shadow-md text-slate-800 dark:text-white">
                <Icon name="location_on" className="text-primary" />
                {location.name}, {location.country}
              </h2>
              <p className="text-xs text-slate-500 dark:text-white/60 mt-1">
                {t('records.title')}
              </p>
            </div>
          </div>

          <div className="w-full overflow-x-auto scrollbar-hide pl-4 mt-4 mb-6">
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
                        
                        try {
                           const cityName = await reverseGeocode(lat, lon);
                           if (cityName) {
                               name = cityName;
                           }
                        } catch (e) {
                           console.error(e);
                        }

                        setLocation({
                          name,
                          country: '',
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
                className={`flex items-center gap-1 px-4 py-2 rounded-full whitespace-nowrap backdrop-blur-md shadow-sm transition-colors border ${
                  location.isCurrentLocation 
                    ? 'bg-primary text-white dark:bg-white dark:text-slate-800 font-bold border-primary dark:border-white' 
                    : 'bg-white/60 dark:bg-white/10 text-slate-800 dark:text-white hover:bg-white dark:hover:bg-primary/20 hover:text-primary dark:hover:text-primary border-slate-200 dark:border-white/5'
                }`}
              >
                <Icon name="my_location" className="text-sm" />
                <span className="text-sm font-medium">{t('my_location')}</span>
              </button>
              {settings.favorites.map((fav, i) => (
                <button
                  key={i}
                  onClick={() => setLocation(fav)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border backdrop-blur-md shadow-sm ${
                    location.name === fav.name
                      ? 'bg-primary text-white dark:bg-white dark:text-slate-800 font-bold'
                      : 'bg-white/60 dark:bg-white/10 text-slate-800 dark:text-white hover:bg-white dark:hover:bg-white/20 border-slate-200 dark:border-white/5'
                  }`}
                >
                  {fav.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-center items-center gap-4 mb-4 px-4">
            <div className="flex bg-slate-100 dark:bg-white/5 rounded-full p-1">
                <button
                onClick={() => setRecordType('12month')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                    recordType === '12month'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-600 dark:text-white/70 hover:text-slate-800 dark:hover:text-white'
                }`}
                >
                {t('records.12month')}
                </button>
                <button
                onClick={() => setRecordType('yearly')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                    recordType === 'yearly'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-600 dark:text-white/70 hover:text-slate-800 dark:hover:text-white'
                }`}
                >
                {t('records.yearly')}
                </button>
                 <button
                onClick={() => setRecordType('monthly')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                    recordType === 'monthly'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-600 dark:text-white/70 hover:text-slate-800 dark:hover:text-white'
                }`}
                >
                {t('records.monthly')}
                </button>
                 <button
                onClick={() => setRecordType('calendar')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                    recordType === 'calendar'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-600 dark:text-white/70 hover:text-slate-800 dark:hover:text-white'
                }`}
                >
                {t('records.calendar')}
                </button>
            </div>

            {(recordType === 'yearly' || recordType === 'monthly' || recordType === 'calendar') && (
                <div className="flex gap-2">
                     <div className="relative">
                        <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                        className="appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 pr-10 text-sm font-bold text-slate-700 dark:text-white outline-none focus:border-primary/50"
                        >
                        {years.map(year => (
                            <option key={year} value={year} className="text-slate-800 bg-white">
                            {year}
                            </option>
                        ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <Icon name="expand_more" className="text-sm" />
                        </div>
                    </div>
                    
                    {(recordType === 'monthly' || recordType === 'calendar') && (
                         <div className="relative">
                            <select
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(parseInt(e.target.value, 10))}
                            className="appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 pr-10 text-sm font-bold text-slate-700 dark:text-white outline-none focus:border-primary/50"
                            >
                            {months.map(month => (
                                <option key={month} value={month} className="text-slate-800 bg-white" disabled={selectedYear === new Date().getFullYear() && month > new Date().getMonth() + 1}>
                                {getMonthName(month)}
                                </option>
                            ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
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
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-10 w-10 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : recordType === 'monthly' ? (
              <div className="flex flex-col gap-6 px-4 pb-10 w-full max-w-4xl mx-auto">
                  {monthlyStats && (
                      <div className="bg-slate-100 dark:bg-white/5 rounded-2xl p-6 border border-slate-200 dark:border-white/5">
                          <h3 className="text-xl font-bold mb-4 text-slate-800 dark:text-white flex justify-between items-center">
                            <span>{t('records.monthly_summary')}</span>
                            {selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth() + 1 && (
                                <span className="text-sm font-normal text-slate-500 dark:text-white/60 bg-slate-200 dark:bg-white/10 px-3 py-1 rounded-full">
                                    {t('records.intermediate_status')}
                                </span>
                            )}
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                              {/* Temperature Group */}
                              <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                  <span className="text-slate-500 dark:text-white/60">{t('records.max_temp_high')}</span>
                                  <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.maxTempHigh ? `${formatTempValue(monthlyStats.maxTempHigh.value)}° (${formatDateWithDay(monthlyStats.maxTempHigh.date)})` : '-'}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                  <span className="text-slate-500 dark:text-white/60">{t('records.max_temp_low')}</span>
                                  <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.maxTempLow ? `${formatTempValue(monthlyStats.maxTempLow.value)}° (${formatDateWithDay(monthlyStats.maxTempLow.date)})` : '-'}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                  <span className="text-slate-500 dark:text-white/60">{t('records.min_temp_low')}</span>
                                  <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.minTempLow ? `${formatTempValue(monthlyStats.minTempLow.value)}° (${formatDateWithDay(monthlyStats.minTempLow.date)})` : '-'}</span>
                              </div>

                              {/* Precipitation & Sun Group */}
                              <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                  <span className="text-slate-500 dark:text-white/60">{t('records.total_rain')}</span>
                                  <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.totalRain.toFixed(1)} {settings.precipUnit}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                  <span className="text-slate-500 dark:text-white/60">{t('records.total_sun')}</span>
                                  <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.totalSun.toFixed(1)} u</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                  <span className="text-slate-500 dark:text-white/60">{t('records.rain_days')}</span>
                                  <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.rainDays}</span>
                              </div>

                              {/* Days Count Group */}
                              <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                  <span className="text-slate-500 dark:text-white/60">{t('records.dry_days')}</span>
                                  <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.dryDays}</span>
                              </div>
                              {monthlyStats.frostDays > 0 && (
                                  <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                      <span className="text-slate-500 dark:text-white/60">{t('records.frost_days')}</span>
                                      <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.frostDays}</span>
                                  </div>
                              )}
                              {monthlyStats.iceDays > 0 && (
                                  <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                      <span className="text-slate-500 dark:text-white/60">{t('records.ice_days')}</span>
                                      <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.iceDays}</span>
                                  </div>
                              )}
                              {monthlyStats.summerDays > 0 && (
                                  <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                      <span className="text-slate-500 dark:text-white/60">{t('records.summer_days')}</span>
                                      <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.summerDays}</span>
                                  </div>
                              )}
                              {monthlyStats.tropicalDays > 0 && (
                                  <div className="flex justify-between items-center p-3 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 h-full">
                                      <span className="text-slate-500 dark:text-white/60">{t('records.tropical_days')}</span>
                                      <span className="font-bold text-slate-800 dark:text-white">{monthlyStats.tropicalDays}</span>
                                  </div>
                              )}
                          </div>
                      </div>
                  )}
                  
                  {/* Temp Chart */}
                  <div className="bg-slate-100 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/5 h-96">
                      <h3 className="text-lg font-bold mb-2 text-slate-800 dark:text-white">{t('records.temperature_graph')}</h3>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={dailyData} margin={{top: 5, right: 20, bottom: 5, left: 0}}>
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
                            <XAxis dataKey="day" stroke="#888888" tick={{fontSize: 10}} interval={0} />
                            <YAxis 
                                domain={[tempDomain.min, tempDomain.max]} 
                                ticks={tempDomain.yAxisTicks}
                                interval={0}
                                tickCount={tempDomain.yAxisTicks.length}
                                allowDecimals={false}
                                stroke="#888888"
                                tick={{fontSize: 10}}
                                width={40}
                            />
                            <YAxis 
                                yAxisId="right" 
                                orientation="right" 
                                width={40} 
                                tick={false} 
                                axisLine={false} 
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                                itemStyle={{ color: '#f3f4f6' }}
                                labelStyle={{ color: '#9ca3af' }}
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
                                                <circle cx={props.cx} cy={props.cy} r={6} fill="#ef4444" stroke="white" strokeWidth={2} />
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
                                                <circle cx={props.cx} cy={props.cy} r={6} fill="#3b82f6" stroke="white" strokeWidth={2} />
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

                   {/* Rain/Sun Chart */}
                  <div className="bg-slate-100 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/5 h-96">
                      <h3 className="text-lg font-bold mb-2 text-slate-800 dark:text-white">{t('records.rain_sun_graph')}</h3>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={dailyData} margin={{top: 5, right: 20, bottom: 5, left: 0}} barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.2)" />
                             {/* Weekend highlights */}
                             {dailyData.map((entry, index) => (
                                entry.isWeekend ? (
                                    <ReferenceLine key={`weekend-bar-${index}`} x={entry.day} stroke="rgba(128,128,128,0.1)" strokeWidth={20} />
                                ) : null
                            ))}
                            <XAxis dataKey="day" stroke="#888888" tick={{fontSize: 10}} interval={0} />
                            <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" label={{ value: settings.precipUnit, angle: -90, position: 'insideLeft' }} width={40} />
                            <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" label={{ value: t('hours'), angle: 90, position: 'insideRight' }} width={40} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                            />
                            <Bar yAxisId="left" dataKey="rain" fill="#3b82f6" name={t('precipitation')} barSize={8} radius={[4, 4, 0, 0]} />
                            <Bar yAxisId="right" dataKey="sun" fill="#f59e0b" name={t('sunshine')} barSize={8} radius={[4, 4, 0, 0]} />
                        </ComposedChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          ) : recordType === 'calendar' ? (
              <div className="w-full max-w-7xl mx-auto px-4 pb-10">
                  <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4 bg-white dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                      <div className="flex items-center gap-4 order-2 md:order-1">
                          <button 
                              onClick={() => {
                                  let newMonth = selectedMonth - 1;
                                  let newYear = selectedYear;
                                  if (newMonth < 1) { newMonth = 12; newYear--; }
                                  setSelectedMonth(newMonth);
                                  setSelectedYear(newYear);
                              }}
                              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                          >
                              <Icon name="chevron_left" className="text-2xl" />
                          </button>
                          
                          <h3 className="text-xl font-bold capitalize flex items-center gap-2 w-48 justify-center">
                              <Icon name="calendar_month" className="text-primary" />
                              {new Date(selectedYear, selectedMonth - 1).toLocaleString(settings.language === 'nl' ? 'nl-NL' : 'en-US', { month: 'long', year: 'numeric' })}
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
                              className={`p-2 rounded-xl transition-colors ${selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth() + 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-white/10'}`}
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
                                  className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                              <span className="text-sm font-medium text-slate-600 dark:text-white/80">{t('settings.calendar.heatmap') || 'Heatmap'}</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input 
                                  type="checkbox" 
                                  checked={settings.calendar?.showDetails !== false}
                                  onChange={() => onUpdateSettings?.({ ...settings, calendar: { ...settings.calendar, showDetails: !(settings.calendar?.showDetails !== false) } })}
                                  className="rounded border-slate-300 text-primary focus:ring-primary"
                              />
                              <span className="text-sm font-medium text-slate-600 dark:text-white/80">{t('settings.calendar.details') || 'Details'}</span>
                          </label>
                      </div>
                  </div>
                  
                  <div className="bg-white dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/5 overflow-x-auto shadow-sm">
                      <table className="w-full min-w-[800px] border-collapse">
                          <thead>
                              <tr>
                                  <th className="p-2 text-left text-xs font-bold uppercase text-slate-400 w-16">{t('week') || 'Week'}</th>
                                  {(() => {
                                      const daysNL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
                                      const daysEN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                                      const days = settings.language === 'nl' ? daysNL : daysEN;
                                      const startDay = settings.weekStartDay || 'monday';
                                      let rotatedDays = [...days];
                                      if (startDay === 'sunday') {
                                          rotatedDays = [days[6], ...days.slice(0, 6)];
                                      } else if (startDay === 'saturday') {
                                          rotatedDays = [days[5], days[6], ...days.slice(0, 5)];
                                      }
                                      return rotatedDays.map(day => (
                                          <th key={day} className="p-2 text-left text-xs font-bold uppercase text-slate-400">{day}</th>
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
                                      <td className="p-2 align-top pt-4">
                                          <span className="text-xs font-bold text-slate-400 block bg-slate-100 dark:bg-white/5 px-2 py-1 rounded text-center">{weekNum}</span>
                                      </td>
                                      {week.map((day, dIdx) => (
                                          <td key={dIdx} className="p-1 align-top h-36 w-[13%]">
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
                                                                  <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full shadow-sm ${day.date === new Date().toISOString().split('T')[0] ? 'bg-primary text-white' : 'bg-white/60 dark:bg-black/40'}`}>
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
                                                                        <Icon name="cloud" className="text-2xl text-slate-400 drop-shadow-sm" />
                                                                    )}
                                                                  </div>
                                                              )}
                                                          </div>
                                                          <div className="flex flex-col items-end bg-white/40 dark:bg-black/20 px-1.5 py-0.5 rounded-lg backdrop-blur-sm ml-auto">
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
                                                  <div className="h-full rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5"></div>
                                              )}
                                          </td>
                                      ))}
                                  </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
                  
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 dark:text-white/60 bg-white dark:bg-white/5 p-3 rounded-xl border border-slate-200 dark:border-white/5 w-fit mx-auto shadow-sm">
                      <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                              <div className="w-3 h-3 rounded-sm bg-[#0000FF]"></div>
                              <div className="w-3 h-3 rounded-sm bg-[#1200ED]"></div>
                              <div className="w-3 h-3 rounded-sm bg-[#2400DB]"></div>
                          </div>
                          <span className="font-medium">{t('records.coldest_days') || '3 Koudste Dagen'}</span>
                      </div>
                      <div className="w-px h-4 bg-slate-200 dark:bg-white/10"></div>
                      <div className="flex items-center gap-2">
                          <span className="font-medium">{t('records.warmest_days') || '3 Warmste Dagen'}</span>
                          <div className="flex gap-0.5">
                              <div className="w-3 h-3 rounded-sm bg-[#DB0024]"></div>
                              <div className="w-3 h-3 rounded-sm bg-[#ED0012]"></div>
                              <div className="w-3 h-3 rounded-sm bg-[#FF0000]"></div>
                          </div>
                      </div>
                  </div>
              </div>
          ) : (
            <div className="flex flex-col items-center gap-6 px-4 pb-10">
              <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
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
                {renderRecordCard(
                  'records.max_amplitude',
                  'unfold_more',
                  'text-purple-500',
                  maxAmplitude,
                  value => `${formatTempValue(value)}°`
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

              {recordType === 'yearly' && yearlyCounts && (
                <div className="w-full max-w-2xl bg-slate-100 dark:bg-white/5 rounded-2xl p-6 border border-slate-200 dark:border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Icon name="numbers" className="text-slate-500 dark:text-white/70" />
                      {t('records.counts_title')}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.warm_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.warmDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.summer_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.summerDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.tropical_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.tropicalDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.frost_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.frostDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.ice_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.iceDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.dry_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.dryDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.rain_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.rainDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.heavy_rain_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.heavyRainDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.very_wet_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.veryWetDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.sunny_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.sunnyDays}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-white/70">{t('records.counts.gloomy_days')}</span>
                      <span className="font-bold text-slate-800 dark:text-white">{yearlyCounts.gloomyDays}</span>
                    </div>
                  </div>
                </div>
              )}

              {recordType === 'yearly' && yearlySequences && (
                <div className="w-full max-w-2xl bg-slate-100 dark:bg-white/5 rounded-2xl p-6 border border-slate-200 dark:border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Icon name="timeline" className="text-slate-500 dark:text-white/70" />
                      {t('records.sequences_title')}
                    </h3>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-slate-600 dark:text-white/70 font-medium">
                          {t('records.sequences.dry')}
                        </span>
                        <span className="text-[10px] text-slate-400 mb-0.5">
                           &le; 0.2 {settings.precipUnit}
                        </span>
                        {yearlySequences.dry && yearlySequences.dry.start && yearlySequences.dry.end ? (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {formatDateLabel(yearlySequences.dry.start)} – {formatDateLabel(yearlySequences.dry.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.dry && yearlySequences.dry.length > 0 && (
                        <span className="font-bold text-slate-800 dark:text-white">
                          {yearlySequences.dry.length} {t('days')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-slate-600 dark:text-white/70 font-medium">
                          {t('records.sequences.wet')}
                        </span>
                        <span className="text-[10px] text-slate-400 mb-0.5">
                           &ge; 0.2 {settings.precipUnit}
                        </span>
                        {yearlySequences.wet && yearlySequences.wet.start && yearlySequences.wet.end ? (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {formatDateLabel(yearlySequences.wet.start)} – {formatDateLabel(yearlySequences.wet.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.wet && yearlySequences.wet.length > 0 && (
                        <span className="font-bold text-slate-800 dark:text-white">
                          {yearlySequences.wet.length} {t('days')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-slate-600 dark:text-white/70 font-medium">
                          {t('records.sequences.gloomy')}
                        </span>
                        <span className="text-[10px] text-slate-400 mb-0.5">
                           &le; 1h sun
                        </span>
                        {yearlySequences.gloomy && yearlySequences.gloomy.start && yearlySequences.gloomy.end ? (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {formatDateLabel(yearlySequences.gloomy.start)} – {formatDateLabel(yearlySequences.gloomy.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.gloomy && yearlySequences.gloomy.length > 0 && (
                        <span className="font-bold text-slate-800 dark:text-white">
                          {yearlySequences.gloomy.length} {t('days')}
                        </span>
                      )}
                    </div>

                     {/* Summer Streak */}
                     <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-slate-600 dark:text-white/70 font-medium">
                          {t('records.sequences.summer_streak')}
                        </span>
                        <span className="text-[10px] text-slate-400 mb-0.5">
                           &ge; {settings.recordThresholds?.summerStreakTemp ?? DEFAULT_SETTINGS.recordThresholds.summerStreakTemp}°
                        </span>
                        {yearlySequences.summerStreak && yearlySequences.summerStreak.start && yearlySequences.summerStreak.end ? (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {formatDateLabel(yearlySequences.summerStreak.start)} – {formatDateLabel(yearlySequences.summerStreak.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.summerStreak && yearlySequences.summerStreak.length > 0 && (
                        <span className="font-bold text-slate-800 dark:text-white">
                          {yearlySequences.summerStreak.length} {t('days')}
                        </span>
                      )}
                    </div>

                     {/* Nice Streak */}
                     <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-slate-600 dark:text-white/70 font-medium">
                          {t('records.sequences.nice_streak')}
                        </span>
                        <span className="text-[10px] text-slate-400 mb-0.5">
                           &ge; {settings.recordThresholds?.niceStreakTemp ?? DEFAULT_SETTINGS.recordThresholds.niceStreakTemp}°
                        </span>
                        {yearlySequences.niceStreak && yearlySequences.niceStreak.start && yearlySequences.niceStreak.end ? (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {formatDateLabel(yearlySequences.niceStreak.start)} – {formatDateLabel(yearlySequences.niceStreak.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.niceStreak && yearlySequences.niceStreak.length > 0 && (
                        <span className="font-bold text-slate-800 dark:text-white">
                          {yearlySequences.niceStreak.length} {t('days')}
                        </span>
                      )}
                    </div>

                     {/* Cold Streak */}
                     <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-slate-600 dark:text-white/70 font-medium">
                          {t('records.sequences.cold_streak')}
                        </span>
                        <span className="text-[10px] text-slate-400 mb-0.5">
                           &lt; {settings.recordThresholds?.coldStreakTemp ?? DEFAULT_SETTINGS.recordThresholds.coldStreakTemp}°
                        </span>
                        {yearlySequences.coldStreak && yearlySequences.coldStreak.start && yearlySequences.coldStreak.end ? (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {formatDateLabel(yearlySequences.coldStreak.start)} – {formatDateLabel(yearlySequences.coldStreak.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.coldStreak && yearlySequences.coldStreak.length > 0 && (
                        <span className="font-bold text-slate-800 dark:text-white">
                          {yearlySequences.coldStreak.length} {t('days')}
                        </span>
                      )}
                    </div>

                     {/* Ice Streak */}
                     <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-slate-600 dark:text-white/70 font-medium">
                          {t('records.sequences.ice_streak')}
                        </span>
                        <span className="text-[10px] text-slate-400 mb-0.5">
                           &le; {settings.recordThresholds?.iceStreakTemp ?? DEFAULT_SETTINGS.recordThresholds.iceStreakTemp}°
                        </span>
                        {yearlySequences.iceStreak && yearlySequences.iceStreak.start && yearlySequences.iceStreak.end ? (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {formatDateLabel(yearlySequences.iceStreak.start)} – {formatDateLabel(yearlySequences.iceStreak.end)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-white/60">
                            {t('records.sequences.none')}
                          </span>
                        )}
                      </div>
                      {yearlySequences.iceStreak && yearlySequences.iceStreak.length > 0 && (
                        <span className="font-bold text-slate-800 dark:text-white">
                          {yearlySequences.iceStreak.length} {t('days')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Heatwaves Section */}
              {recordType === 'yearly' && (
                <div className="w-full max-w-2xl bg-slate-100 dark:bg-white/5 rounded-2xl p-6 border border-slate-200 dark:border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Icon name="local_fire_department" className="text-orange-500" />
                      {t('records.sequences.heatwave')}
                    </h3>
                    <button 
                        onClick={() => setShowHeatwaveInfo(!showHeatwaveInfo)}
                        className="text-slate-400 hover:text-primary transition-colors"
                    >
                        <Icon name="info" className="text-sm" />
                    </button>
                  </div>

                  {showHeatwaveInfo && (
                      <div className="mb-4 p-3 bg-white dark:bg-white/10 rounded-lg text-xs text-slate-600 dark:text-white/80 border border-slate-200 dark:border-white/5 animate-in fade-in slide-in-from-top-1">
                          <p className="font-bold mb-1">Definition:</p>
                          <ul className="list-disc pl-4 space-y-1">
                              <li>Min. {(settings.heatwave || DEFAULT_SETTINGS.heatwave).minLength} days &ge; {(settings.heatwave || DEFAULT_SETTINGS.heatwave).lowerThreshold}°C</li>
                              <li>Of which min. {(settings.heatwave || DEFAULT_SETTINGS.heatwave).minHeatDays} days &ge; {(settings.heatwave || DEFAULT_SETTINGS.heatwave).heatThreshold}°C</li>
                          </ul>
                      </div>
                  )}

                  <div className="space-y-3">
                    {heatwaves.length > 0 ? (
                      heatwaves.map((hw, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm border-b border-slate-200 dark:border-white/5 last:border-0 pb-2 last:pb-0">
                          <div className="flex flex-col">
                             <span className="font-medium text-slate-700 dark:text-white/90">
                               {hw.start && hw.end ? `${formatDateLabel(hw.start)} – ${formatDateLabel(hw.end)}` : ''}
                             </span>
                             <div className="flex flex-wrap gap-1 mt-1 max-w-[200px] sm:max-w-xs">
                               {hw.temps && hw.temps.map((temp, idx) => (
                                 <span key={idx} className="text-[10px] text-slate-500 dark:text-white/60 bg-slate-200 dark:bg-white/10 px-1 rounded">
                                   {formatTempValue(temp)}
                                 </span>
                               ))}
                             </div>
                          </div>
                          <span className="font-bold text-slate-800 dark:text-white bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded-md text-orange-700 dark:text-orange-300">
                            {hw.length} {t('days')}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-white/60 text-center py-2">
                        {t('records.sequences.none')}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Diverse Records */}
              {recordType === 'yearly' && diverseRecords && (
                  <div className="w-full max-w-2xl bg-slate-100 dark:bg-white/5 rounded-2xl p-6 border border-slate-200 dark:border-white/5">
                      <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xl font-bold flex items-center gap-2">
                              <Icon name="compare_arrows" className="text-slate-500 dark:text-white/70" />
                              {t('records.diverse_title')}
                          </h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Max Rise */}
                          <div className="bg-white/60 dark:bg-black/20 rounded-xl p-4">
                              <span className="text-sm font-medium text-slate-600 dark:text-white/70 block mb-2">
                                  {t('records.max_rise')}
                              </span>
                              {diverseRecords.maxRise ? (
                                  <div>
                                      <div className="text-2xl font-bold text-red-500 mb-1">
                                          +{formatTempValue(diverseRecords.maxRise.value)}°
                                      </div>
                                      <div className="text-xs text-slate-500 dark:text-white/60 flex flex-col gap-1">
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day1')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxRise.day1)}</span>
                                                  <span className="font-medium text-slate-700 dark:text-white/80">({formatTempValue(diverseRecords.maxRise.temp1)}°)</span>
                                              </span>
                                          </div>
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day2')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxRise.day2)}</span>
                                                  <span className="font-medium text-slate-700 dark:text-white/80">({formatTempValue(diverseRecords.maxRise.temp2)}°)</span>
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              ) : (
                                  <span className="text-sm text-slate-400">{t('records.sequences.none')}</span>
                              )}
                          </div>

                          {/* Max Drop */}
                          <div className="bg-white/60 dark:bg-black/20 rounded-xl p-4">
                              <span className="text-sm font-medium text-slate-600 dark:text-white/70 block mb-2">
                                  {t('records.max_drop')}
                              </span>
                              {diverseRecords.maxDrop ? (
                                  <div>
                                      <div className="text-2xl font-bold text-blue-500 mb-1">
                                          -{formatTempValue(diverseRecords.maxDrop.value)}°
                                      </div>
                                      <div className="text-xs text-slate-500 dark:text-white/60 flex flex-col gap-1">
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day1')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxDrop.day1)}</span>
                                                  <span className="font-medium text-slate-700 dark:text-white/80">({formatTempValue(diverseRecords.maxDrop.temp1)}°)</span>
                                              </span>
                                          </div>
                                          <div className="flex justify-between">
                                              <span>{t('records.diff_day2')}:</span>
                                              <span className="flex gap-2">
                                                  <span>{formatDateLabel(diverseRecords.maxDrop.day2)}</span>
                                                  <span className="font-medium text-slate-700 dark:text-white/80">({formatTempValue(diverseRecords.maxDrop.temp2)}°)</span>
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              ) : (
                                  <span className="text-sm text-slate-400">{t('records.sequences.none')}</span>
                              )}
                          </div>

                          {/* Extremes Section */}
                          {diverseRecords.extremes && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Summer Days (>= 25) */}
                                  <div className="bg-white/60 dark:bg-black/20 rounded-xl p-4">
                                      <span className="text-sm font-medium text-slate-600 dark:text-white/70 block mb-2">
                                          {t('records.extremes.first_summer')}
                                      </span>
                                      {diverseRecords.extremes.firstSummer ? (
                                          <div className="flex items-center justify-between">
                                              <span className="font-bold text-slate-800 dark:text-white">{formatDateLabel(diverseRecords.extremes.firstSummer.date)}</span>
                                              <span className="text-amber-500 font-bold">{diverseRecords.extremes.firstSummer.temp}°</span>
                                          </div>
                                      ) : <span className="text-sm text-slate-400">-</span>}
                                  </div>
                                  <div className="bg-white/60 dark:bg-black/20 rounded-xl p-4">
                                      <span className="text-sm font-medium text-slate-600 dark:text-white/70 block mb-2">
                                          {t('records.extremes.last_summer')}
                                      </span>
                                      {diverseRecords.extremes.lastSummer ? (
                                          <div className="flex items-center justify-between">
                                              <span className="font-bold text-slate-800 dark:text-white">{formatDateLabel(diverseRecords.extremes.lastSummer.date)}</span>
                                              <span className="text-amber-500 font-bold">{diverseRecords.extremes.lastSummer.temp}°</span>
                                          </div>
                                      ) : <span className="text-sm text-slate-400">-</span>}
                                  </div>

                                  {/* Warm Days (>= 20) -> "Lekker" */}
                                  <div className="bg-white/60 dark:bg-black/20 rounded-xl p-4">
                                      <span className="text-sm font-medium text-slate-600 dark:text-white/70 block mb-2">
                                          {t('records.extremes.first_warm')}
                                      </span>
                                      {diverseRecords.extremes.firstWarm ? (
                                          <div className="flex items-center justify-between">
                                              <span className="font-bold text-slate-800 dark:text-white">{formatDateLabel(diverseRecords.extremes.firstWarm.date)}</span>
                                              <span className="text-amber-500 font-bold">{diverseRecords.extremes.firstWarm.temp}°</span>
                                          </div>
                                      ) : <span className="text-sm text-slate-400">-</span>}
                                  </div>
                                  <div className="bg-white/60 dark:bg-black/20 rounded-xl p-4">
                                      <span className="text-sm font-medium text-slate-600 dark:text-white/70 block mb-2">
                                          {t('records.extremes.last_warm')}
                                      </span>
                                      {diverseRecords.extremes.lastWarm ? (
                                          <div className="flex items-center justify-between">
                                              <span className="font-bold text-slate-800 dark:text-white">{formatDateLabel(diverseRecords.extremes.lastWarm.date)}</span>
                                              <span className="text-amber-500 font-bold">{diverseRecords.extremes.lastWarm.temp}°</span>
                                          </div>
                                      ) : <span className="text-sm text-slate-400">-</span>}
                                  </div>
                              </div>
                          )}

                          {/* Frost Info - Moved here */}
                          {frostInfo && (
                              <>
                                  <div className="bg-white/60 dark:bg-black/20 rounded-xl p-4">
                                      <span className="text-sm font-medium text-slate-600 dark:text-white/70 block mb-2">
                                          {t('records.frost.first')}
                                      </span>
                                      {frostInfo.firstFrost ? (
                                          <div className="text-lg font-bold text-slate-800 dark:text-white">
                                              {formatDateLabel(frostInfo.firstFrost)}
                                          </div>
                                      ) : (
                                          <span className="text-sm text-slate-400">{t('records.sequences.none')}</span>
                                      )}
                                  </div>

                                  <div className="bg-white/60 dark:bg-black/20 rounded-xl p-4">
                                      <span className="text-sm font-medium text-slate-600 dark:text-white/70 block mb-2">
                                          {t('records.frost.last')}
                                      </span>
                                      {frostInfo.lastFrost ? (
                                          <div className="text-lg font-bold text-slate-800 dark:text-white">
                                              {formatDateLabel(frostInfo.lastFrost)}
                                          </div>
                                      ) : (
                                          <span className="text-sm text-slate-400">{t('records.sequences.none')}</span>
                                      )}
                                  </div>
                              </>
                          )}
                      </div>
                  </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
