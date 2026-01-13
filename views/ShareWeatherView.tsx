
import React, { useState, useRef, useEffect } from 'react';
import { ViewState, AppSettings, Location, OpenMeteoResponse } from '../types';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { fetchForecast, mapWmoCodeToText, getWindDirection, calculateMoonPhase } from '../services/weatherService';
import { loadCurrentLocation } from '../services/storageService';
import { getUsage } from '../services/usageService';
import { LimitReachedModal } from '../components/LimitReachedModal';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

interface VisibleFields {
  location: boolean;
  date: boolean;
  time: boolean;
  temp: boolean;
  temp_max: boolean;
  temp_min: boolean;
  wind_gusts: boolean;
  wind_direction: boolean;
  rain_amount: boolean;
  sun_hours: boolean;
  rain_duration: boolean;
  uv_index: boolean;
  humidity: boolean;
  pressure: boolean;
  visibility: boolean;
  cloud_cover: boolean;
  sunrise: boolean;
  sunset: boolean;
  feels_like: boolean;
  heat_index: boolean;
}

interface Sticker {
    id: string;
    type: 'sun' | 'cloud' | 'rain' | 'snow' | 'umbrella' | 'sunglasses' | 'thermometer' | 'wind' | 'rainbow';
    x: number; // 0-100
    y: number; // 0-100
    scale: number;
}

interface ShareViewSettings {
    template: 'classic' | 'insta' | 'data' | 'minimal' | 'badge' | 'frame' | 'cinematic' | 'news' | 'post' | 'bubble';
    visibleFields: VisibleFields;
    style: {
        textColor: string;
        fontFamily: string;
        fontSizeScale: number;
        overlay: 'none' | 'snow' | 'rain' | 'mist' | 'sun' | 'moon' | 'clouds' | 'thunder' | 'rainbow';
        stickers: Sticker[];
        bubble: {
            type: 'talk' | 'think' | 'shout';
            x: number; // Percentage 0-100
            y: number; // Percentage 0-100
            scale: number;
            tailScale: number;
        };
    };
    content: {
        displayMode: 'current' | 'max' | 'min';
        dateFormat: 'short' | 'medium' | 'long';
        showDayName: boolean;
    }
}

const DEFAULT_SETTINGS: ShareViewSettings = {
    template: 'classic',
    visibleFields: {
        location: true,
        date: true,
        time: true,
        temp: true,
        temp_max: false,
        temp_min: false,
        wind_gusts: false,
        wind_direction: false,
        rain_amount: false,
        sun_hours: false,
        rain_duration: false,
        uv_index: false,
        humidity: false,
        pressure: false,
        visibility: false,
        cloud_cover: false,
    sunrise: false,
    sunset: false,
    feels_like: false,
    heat_index: false,
  },
  style: {
        textColor: '#FFFFFF',
        fontFamily: 'sans-serif',
        fontSizeScale: 1.0,
        overlay: 'none',
        stickers: [],
        bubble: {
            type: 'talk',
            x: 50,
            y: 30,
            scale: 1.0,
            tailScale: 1.0
        }
    },
    content: {
        displayMode: 'current',
        dateFormat: 'medium',
        showDayName: false
    }
};

export const ShareWeatherView: React.FC<Props> = ({ onNavigate, settings }) => {
  const t = (key: string) => getTranslation(key, settings.language);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<{x: number, y: number, size: number, speed: number}[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  
  // Persisted Settings
  const [viewSettings, setViewSettings] = useState<ShareViewSettings>(() => {
      const saved = localStorage.getItem('share_settings');
      if (saved) {
          try {
              const parsed = JSON.parse(saved);
              // Merge with default to ensure new fields exist
              return { 
                  ...DEFAULT_SETTINGS, 
                  ...parsed,
                  visibleFields: { ...DEFAULT_SETTINGS.visibleFields, ...parsed.visibleFields },
                  style: { ...DEFAULT_SETTINGS.style, ...parsed.style, bubble: { ...DEFAULT_SETTINGS.style.bubble, ...(parsed.style?.bubble || {}) } },
                  content: { ...DEFAULT_SETTINGS.content, ...parsed.content }
              };
          } catch (e) {
              return DEFAULT_SETTINGS;
          }
      }
      return DEFAULT_SETTINGS;
  });

  // Save settings on change
  useEffect(() => {
      const settingsToSave = {
          ...viewSettings,
          style: {
              ...viewSettings.style,
              overlay: 'none' as const, // Reset overlay
              stickers: []     // Reset stickers
          }
      };
      localStorage.setItem('share_settings', JSON.stringify(settingsToSave));
  }, [viewSettings]);

  const updateSettings = (updates: Partial<ShareViewSettings> | ((prev: ShareViewSettings) => Partial<ShareViewSettings>)) => {
      setViewSettings(prev => {
          const newValues = typeof updates === 'function' ? updates(prev) : updates;
          return { ...prev, ...newValues };
      });
  };

  const updateStyle = (updates: Partial<ShareViewSettings['style']>) => {
      setViewSettings(prev => ({ ...prev, style: { ...prev.style, ...updates } }));
  };
  
  const updateBubble = (updates: Partial<ShareViewSettings['style']['bubble']>) => {
      setViewSettings(prev => ({ 
          ...prev, 
          style: { 
              ...prev.style, 
              bubble: { ...prev.style.bubble, ...updates } 
          } 
      }));
  };

  const updateContent = (updates: Partial<ShareViewSettings['content']>) => {
      setViewSettings(prev => ({ ...prev, content: { ...prev.content, ...updates } }));
  };

  // Canvas Dimensions
  const [canvasSize, setCanvasSize] = useState({ w: 1080, h: 1920 });

  // Data State
  const [locationObj, setLocationObj] = useState<Location>(() => loadCurrentLocation());
  const [customLocation, setCustomLocation] = useState(locationObj.name); 
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [customTime, setCustomTime] = useState('12:00');
  
  // Track availability of data points
  const [dataAvailability, setDataAvailability] = useState<Record<string, boolean>>({});

  const [weatherData, setWeatherData] = useState<any>({
    temp: 0,
    temp_max: 0,
    temp_min: 0,
    wind_gusts: 0,
    wind_direction: 0,
    rain_amount: 0,
    sun_hours: 0,
    rain_duration: 0,
    uv_index: 0,
    humidity: 0,
    pressure: 0,
    visibility: 0,
    cloud_cover: 0,
    sunrise: '',
    sunset: '',
    desc: '',
    wind: '',
    feels_like: 0,
    heat_index: 0
  });

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitError, setLimitError] = useState('');

  // Initialize & Fetch Weather
  useEffect(() => {
    if (locationObj) {
        setCustomLocation(locationObj.name);
        fetchData(locationObj.lat, locationObj.lon);
    }
  }, []);

  // Regenerate particles when overlay changes
  useEffect(() => {
      const { overlay } = viewSettings.style;
      if (overlay === 'snow' || overlay === 'rain' || overlay === 'mist') {
          const count = overlay === 'snow' ? 50 : overlay === 'rain' ? 100 : overlay === 'mist' ? 20 : 0; 
          particlesRef.current = Array.from({ length: count }).map(() => ({
              x: Math.random(),
              y: Math.random(),
              size: Math.random(),
              speed: Math.random()
          }));
      } else {
          particlesRef.current = [];
      }
      draw();
  }, [viewSettings.style.overlay]);

  // Re-fetch when date/time/location changes
  useEffect(() => {
      if (locationObj) {
          fetchData(locationObj.lat, locationObj.lon);
      }
  }, [customDate, customTime, locationObj]);

  // Redraw when ANYTHING relevant changes
  useEffect(() => {
    draw();
  }, [
      image, 
      viewSettings, // Includes template, style, visibleFields, content
      customLocation, 
      customDate, 
      customTime, 
      weatherData, 
      canvasSize
  ]);

  const applyTemplate = (tpl: ShareViewSettings['template']) => {
      // Logic to set defaults for templates, respecting user's previous custom choices if possible?
      // For now, let's just switch template and maybe enable some defaults if it makes sense.
      // The user wanted "saved settings", so maybe we shouldn't aggressively reset fields.
      // BUT, some templates NEED certain fields.
      
      setViewSettings(prev => {
          const newFields = { ...prev.visibleFields };
          const reset = () => (Object.keys(newFields) as Array<keyof VisibleFields>).forEach(k => newFields[k] = false);

          // Only reset if switching TO specific templates that require minimal view
          if (tpl === 'minimal' || tpl === 'badge') {
             // reset(); // Optional: deciding to keep user fields or reset? Let's NOT reset to be safe, user can uncheck.
          }
          
          if (tpl === 'data' || tpl === 'news') {
               // Enable useful data fields by default if they are not enabled?
               // Let's just ensure temp/loc/date are on.
               newFields.location = true;
               newFields.date = true;
               newFields.temp = true;
          }

          return { ...prev, template: tpl, visibleFields: newFields };
      });
  };

  const getSampleDate = (fmt: 'short' | 'medium' | 'long') => {
      const d = new Date();
      const locale = settings.language === 'nl' ? 'nl-NL' : 'en-US';
      let options: Intl.DateTimeFormatOptions = {};
      if (fmt === 'short') options = { day: 'numeric', month: 'numeric', year: '2-digit' }; 
      if (fmt === 'medium') options = { day: 'numeric', month: 'short' }; 
      if (fmt === 'long') options = { day: 'numeric', month: 'long', year: 'numeric' };
      return d.toLocaleDateString(locale, options);
  };

  const getFormattedDate = () => {
      if (!customDate) return '';
      const d = new Date(customDate);
      if (isNaN(d.getTime())) return customDate;

      const locale = settings.language === 'nl' ? 'nl-NL' : 'en-US';
      let options: Intl.DateTimeFormatOptions = {};
      const { dateFormat, showDayName } = viewSettings.content;

      if (dateFormat === 'short') options = { day: 'numeric', month: 'numeric', year: '2-digit' }; 
      if (dateFormat === 'medium') options = { day: 'numeric', month: 'short' }; 
      if (dateFormat === 'long') options = { day: 'numeric', month: 'long', year: 'numeric' };

      let res = d.toLocaleDateString(locale, options);
      if (showDayName) {
          const dayName = d.toLocaleDateString(locale, { weekday: 'long' });
          res = `${dayName}, ${res}`;
      }
      return res;
  };

  const fetchData = async (lat: number, lon: number) => {
      // Check credits
      const usage = getUsage();
      if (usage.weatherCredits < 1) {
          setLimitError('Geen credits meer beschikbaar om weerdata op te halen.');
          setShowLimitModal(true);
          // Don't return here if we want to show cached/existing data? 
          // But user says "page not hidden".
          // If we block fetch, weatherData remains empty/default.
          return;
      }

      try {
          const data = await fetchForecast(lat, lon);
          if (!data) return;

          const dateIndex = data.daily?.time.findIndex((t: string) => t === customDate);
          const targetDateTime = `${customDate}T${customTime}`;
          const hourIndex = data.hourly?.time.findIndex((t: string) => t.startsWith(targetDateTime.substring(0, 13))); 

          let max = 0, min = 0, gusts = 0, rain = 0, sun = 0, rainDur = 0;
          let sunriseStr = '', sunsetStr = '';
          
          if (dateIndex !== -1 && data.daily) {
              max = Math.round(data.daily.temperature_2m_max[dateIndex]);
              min = Math.round(data.daily.temperature_2m_min[dateIndex]);
              gusts = Math.round(data.daily.wind_gusts_10m_max[dateIndex]);
              rain = data.daily.precipitation_sum[dateIndex];
              rainDur = data.daily.precipitation_hours ? data.daily.precipitation_hours[dateIndex] : 0;
              
              if (data.daily.sunrise && data.daily.sunrise[dateIndex]) {
                  sunriseStr = data.daily.sunrise[dateIndex].split('T')[1];
              }
              if (data.daily.sunset && data.daily.sunset[dateIndex]) {
                  sunsetStr = data.daily.sunset[dateIndex].split('T')[1];
              }
          }

          let temp = 0, desc = '', wind = '', uv = 0, hum = 0;
          let press = 0, vis = 0, cloud = 0, windDir = 0;

          if (hourIndex !== -1 && data.hourly) {
              temp = Math.round(data.hourly.temperature_2m[hourIndex]);
              const code = data.hourly.weather_code[hourIndex];
              desc = mapWmoCodeToText(code, settings.language);
              wind = `${Math.round(data.hourly.wind_speed_10m[hourIndex])} km/h`;
              uv = data.hourly.uv_index[hourIndex];
              hum = data.hourly.relative_humidity_2m[hourIndex];
              press = Math.round(data.hourly.surface_pressure[hourIndex]);
              vis = parseFloat((data.hourly.visibility[hourIndex] / 1000).toFixed(1)); 
              cloud = data.hourly.cloud_cover[hourIndex];
              windDir = data.hourly.wind_direction_10m[hourIndex];
          } else if (data.current) {
              temp = Math.round(data.current.temperature_2m);
              desc = mapWmoCodeToText(data.current.weather_code, settings.language);
              wind = `${Math.round(data.current.wind_speed_10m)} km/h`;
              press = Math.round(data.current.surface_pressure);
              cloud = data.current.cloud_cover;
              windDir = data.current.wind_direction_10m;
          }

          setWeatherData({
              temp, temp_max: max, temp_min: min, wind_gusts: gusts, wind_direction: windDir,
              rain_amount: rain, sun_hours: 0, rain_duration: rainDur, uv_index: uv, humidity: hum,
              pressure: press, visibility: vis, cloud_cover: cloud, sunrise: sunriseStr, sunset: sunsetStr,
              desc, wind
          });

          const avail: Record<string, boolean> = {};
          avail.temp = true;
          avail.temp_max = max !== undefined;
          avail.temp_min = min !== undefined;
          avail.wind_gusts = gusts !== 0; 
          avail.rain_amount = rain !== null;
          avail.sun_hours = false; 
          avail.rain_duration = rainDur !== null;
          avail.uv_index = uv !== null;
          avail.humidity = hum !== null;
          avail.pressure = press !== 0;
          avail.visibility = vis !== 0;
          avail.cloud_cover = cloud !== null;
          avail.sunrise = !!sunriseStr;
          avail.sunset = !!sunsetStr;
          avail.wind_direction = windDir !== null;
          
          setDataAvailability(avail);

      } catch (e) {
          console.error("Fetch failed", e);
      }
  };

  const handleSearch = async (query: string) => {
      setSearchQuery(query);
      if (query.length < 3) {
          setSearchResults([]);
          setShowSearchResults(false);
          return;
      }
      setLoadingSearch(true);
      try {
          const results = await searchCityByName(query, settings.language);
          setSearchResults(results);
          setShowSearchResults(true);
      } catch (e) {
          console.error(e);
      } finally {
          setLoadingSearch(false);
      }
  };

  const selectLocation = async (loc: Location) => {
      setLocationObj(loc);
      setCustomLocation(loc.name);
      setSearchQuery('');
      setShowSearchResults(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          updateCanvasSize(img);
          setImage(img);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const updateCanvasSize = (img: HTMLImageElement) => {
      const maxDim = 1920;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
          const scale = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
      }
      setCanvasSize({ w, h });
  };

  const updateStickers = (action: 'add' | 'remove' | 'update', sticker?: Partial<Sticker>) => {
      setViewSettings(prev => {
          let newStickers = [...(prev.style.stickers || [])];
          if (action === 'add' && sticker && sticker.type) {
              const newId = Date.now().toString();
              newStickers.push({
                  id: newId,
                  type: sticker.type,
                  x: 50,
                  y: 50,
                  scale: 1.0
              } as Sticker);
              setSelectedStickerId(newId);
          } else if (action === 'remove' && sticker?.id) {
              newStickers = newStickers.filter(s => s.id !== sticker.id);
              if (selectedStickerId === sticker.id) setSelectedStickerId(null);
          } else if (action === 'update' && sticker?.id) {
              const idx = newStickers.findIndex(s => s.id === sticker.id);
              if (idx !== -1) {
                  newStickers[idx] = { ...newStickers[idx], ...sticker };
              }
          }
          return { ...prev, style: { ...prev.style, stickers: newStickers } };
      });
  };

  const drawOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const { overlay } = viewSettings.style;
      if (overlay === 'none') return;
      const scale = Math.min(w, h) / 1080;

      if (overlay === 'snow') {
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
          ctx.lineWidth = 2 * scale;
          particlesRef.current.forEach(p => {
              const cx = p.x * w;
              const cy = p.y * h;
              const size = p.size * 8 * scale + 4 * scale;

              ctx.save();
              ctx.translate(cx, cy);
              // Draw snowflake (simple 6-branch star)
              ctx.beginPath();
              for (let i = 0; i < 3; i++) {
                  ctx.rotate(Math.PI / 3);
                  ctx.moveTo(-size, 0);
                  ctx.lineTo(size, 0);
              }
              ctx.stroke();
              
              // Add some cross branches for detail on larger flakes
              if (size > 8 * scale) {
                   ctx.beginPath();
                   ctx.rotate(Math.PI / 6);
                   const s2 = size * 0.5;
                   for (let i = 0; i < 3; i++) {
                      ctx.rotate(Math.PI / 3);
                      ctx.moveTo(-s2, 0);
                      ctx.lineTo(s2, 0);
                  }
                  ctx.stroke();
              }
              ctx.restore();
          });
      } else if (overlay === 'rain') {
          particlesRef.current.forEach(p => {
              const x = p.x * w;
              const y = p.y * h;
              // Larger droplets
              const size = (p.size * 20 * scale) + 15 * scale; // Base size ~15-35px

              // Create gradient for 3D effect
              const grad = ctx.createRadialGradient(x - size*0.2, y + size*0.3, size*0.1, x, y + size*0.3, size);
              grad.addColorStop(0, "rgba(255, 255, 255, 0.8)");
              grad.addColorStop(0.2, "rgba(200, 220, 255, 0.6)");
              grad.addColorStop(1, "rgba(100, 150, 255, 0.4)");
              
              ctx.fillStyle = grad;
              ctx.beginPath();
              // Classic teardrop shape
              // Top point
              ctx.moveTo(x, y - size); 
              // Right curve
              ctx.bezierCurveTo(x + size*0.8, y + size*0.5, x + size*0.5, y + size, x, y + size);
              // Left curve
              ctx.bezierCurveTo(x - size*0.5, y + size, x - size*0.8, y + size*0.5, x, y - size);
              ctx.fill();

              // Add a shiny reflection
              ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
              ctx.beginPath();
              ctx.ellipse(x - size*0.2, y + size*0.3, size*0.1, size*0.2, Math.PI/4, 0, Math.PI*2);
              ctx.fill();
          });
      } else if (overlay === 'mist') {
          // Full screen mist
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, "rgba(255, 255, 255, 0.4)"); 
          grad.addColorStop(0.3, "rgba(255, 255, 255, 0.2)");
          grad.addColorStop(1, "rgba(255, 255, 255, 0.5)"); 
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          
          // Add some "haze" blobs using stable particles
          ctx.filter = `blur(${20 * scale}px)`;
          ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
          particlesRef.current.forEach(p => {
               ctx.beginPath();
               ctx.arc(p.x * w, p.y * h, (100 + p.size * 200) * scale, 0, Math.PI * 2);
               ctx.fill();
          });
          ctx.filter = 'none';
      } else if (overlay === 'sun') {
          const cx = w * 0.8;
          const cy = h * 0.1;
          const grad = ctx.createRadialGradient(cx, cy, 10 * scale, cx, cy, 600 * scale);
          grad.addColorStop(0, "rgba(255, 255, 200, 0.8)");
          grad.addColorStop(0.2, "rgba(255, 200, 100, 0.4)");
          grad.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          // Sun core
          ctx.fillStyle = "rgba(255, 255, 220, 0.9)";
          ctx.beginPath();
          ctx.arc(cx, cy, 80 * scale, 0, Math.PI * 2);
          ctx.fill();
      } else if (overlay === 'moon') {
          const cx = w * 0.85;
          const cy = h * 0.15;
          const r = 80 * scale;
          const phase = calculateMoonPhase(new Date(customDate || Date.now()));
          
          ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
          ctx.shadowBlur = 30 * scale;
          ctx.fillStyle = "#F4F6F0"; // Moon color
          
          ctx.save();
          ctx.beginPath();
          
          if (phase <= 0.5) {
              // Waxing (Light on Right)
              ctx.arc(cx, cy, r, -Math.PI/2, Math.PI/2, false);
              ctx.fill();
              
              const w = (phase - 0.25) * 4 * r;
              
              if (phase < 0.25) {
                  // Crescent: Erase left part of right semicircle
                  ctx.globalCompositeOperation = 'destination-out';
                  ctx.beginPath();
                  ctx.ellipse(cx, cy, Math.abs(w), r, 0, 0, Math.PI * 2);
                  ctx.fill();
              } else {
                  // Gibbous: Add bulge on left
                  ctx.beginPath();
                  ctx.ellipse(cx, cy, Math.abs(w), r, 0, 0, Math.PI * 2);
                  ctx.fill();
              }
          } else {
              // Waning (Light on Left)
              ctx.arc(cx, cy, r, Math.PI/2, -Math.PI/2, false);
              ctx.fill();
              
              const w = (phase - 0.75) * 4 * r;
              
              if (phase > 0.75) {
                  // Crescent: Erase right part of left semicircle
                  ctx.globalCompositeOperation = 'destination-out';
                  ctx.beginPath();
                  ctx.ellipse(cx, cy, Math.abs(w), r, 0, 0, Math.PI * 2);
                  ctx.fill();
              } else {
                  // Gibbous: Add bulge on right
                  ctx.beginPath();
                  ctx.ellipse(cx, cy, Math.abs(w), r, 0, 0, Math.PI * 2);
                  ctx.fill();
              }
          }
          ctx.restore();
      } else if (overlay === 'clouds') {
           // Realistic clouds: Clusters of circles
           const drawCloud = (x: number, y: number, s: number) => {
               ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
               ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
               ctx.shadowBlur = 30 * scale;
               ctx.beginPath();
               ctx.arc(x, y, 60 * s * scale, 0, Math.PI * 2);
               ctx.arc(x + 50 * s * scale, y - 20 * s * scale, 70 * s * scale, 0, Math.PI * 2);
               ctx.arc(x + 100 * s * scale, y, 60 * s * scale, 0, Math.PI * 2);
               ctx.arc(x + 50 * s * scale, y + 10 * s * scale, 60 * s * scale, 0, Math.PI * 2);
               ctx.fill();
           };
           
           drawCloud(w * 0.1, h * 0.1, 1.2);
           drawCloud(w * 0.5, h * 0.05, 1.5);
           drawCloud(w * 0.8, h * 0.15, 1.0);
           drawCloud(w * 0.3, h * 0.2, 0.8);
      } else if (overlay === 'thunder') {
          // Dark Clouds
           const drawDarkCloud = (x: number, y: number, s: number) => {
               ctx.fillStyle = "rgba(60, 60, 70, 0.9)"; // Dark grey
               ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
               ctx.shadowBlur = 40 * scale;
               ctx.beginPath();
               ctx.arc(x, y, 60 * s * scale, 0, Math.PI * 2);
               ctx.arc(x + 50 * s * scale, y - 20 * s * scale, 70 * s * scale, 0, Math.PI * 2);
               ctx.arc(x + 100 * s * scale, y, 60 * s * scale, 0, Math.PI * 2);
               ctx.fill();
           };
           
           // Cloud positions
           const clouds = [
               { x: w * 0.2, y: h * 0.05, s: 1.5 },
               { x: w * 0.7, y: h * 0.1, s: 1.8 }
           ];

           clouds.forEach(c => drawDarkCloud(c.x, c.y, c.s));
           
          // Flash background
          if (Math.random() > 0.7) {
              ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
              ctx.fillRect(0, 0, w, h);
          }
          
          // Bolt
          ctx.strokeStyle = "rgba(255, 255, 255, 1)";
          ctx.shadowColor = "rgba(180, 200, 255, 0.8)";
          ctx.shadowBlur = 30 * scale;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          
          // Pick a random cloud to start from
          const sourceCloud = clouds[Math.floor(Math.random() * clouds.length)];
          
          // Start point (somewhere in the bottom half of the cloud)
          let bx = sourceCloud.x + 50 * sourceCloud.s * scale + (Math.random() - 0.5) * 80 * scale;
          let by = sourceCloud.y + 20 * sourceCloud.s * scale; 
          
          const drawBolt = (x: number, y: number, thickness: number, length: number) => {
              ctx.lineWidth = thickness;
              ctx.beginPath();
              ctx.moveTo(x, y);
              
              let cx = x;
              let cy = y;
              let currentY = y;
              const endY = y + length;
              
              while(currentY < endY) {
                  // Jagged steps
                  const stepY = (Math.random() * 20 + 10) * scale;
                  const stepX = (Math.random() - 0.5) * 60 * scale;
                  
                  cx += stepX;
                  cy += stepY;
                  currentY = cy;
                  
                  ctx.lineTo(cx, cy);
                  
                  // Branching
                  if (thickness > 2 * scale && Math.random() > 0.8) {
                      ctx.stroke(); // Draw main up to here
                      ctx.save();
                      drawBolt(cx, cy, thickness * 0.5, h * 0.3); // Recursive branch
                      ctx.restore();
                      ctx.beginPath(); // Resume main
                      ctx.moveTo(cx, cy);
                      ctx.lineWidth = thickness;
                  }
              }
              ctx.stroke();
          };

          // Draw 1-2 main bolts
          drawBolt(bx, by, 6 * scale, h * 0.8);
          if (Math.random() > 0.5) {
               drawBolt(bx + (Math.random()-0.5)*50*scale, by, 4 * scale, h * 0.7);
          }

          ctx.shadowBlur = 0;
      } else if (overlay === 'rainbow') {
          const cx = w * 0.5;
          const cy = h * 1.2;
          const r = Math.max(w, h) * 0.8;
          const colors = ['rgba(255,0,0,0.3)', 'rgba(255,165,0,0.3)', 'rgba(255,255,0,0.3)', 'rgba(0,128,0,0.3)', 'rgba(0,0,255,0.3)', 'rgba(75,0,130,0.3)', 'rgba(238,130,238,0.3)'];
          ctx.lineWidth = 20 * scale;
          colors.forEach((c, i) => {
              ctx.strokeStyle = c;
              ctx.beginPath();
              ctx.arc(cx, cy, r + i * 15 * scale, Math.PI, 2 * Math.PI);
              ctx.stroke();
          });
      }
  };

  const drawStickers = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const stickers = viewSettings.style.stickers || [];
      const scale = Math.min(w, h) / 1080;

      stickers.forEach(sticker => {
          const cx = (sticker.x / 100) * w;
          const cy = (sticker.y / 100) * h;
          const size = 100 * scale * sticker.scale;
          
          ctx.save();
          ctx.translate(cx, cy);
          
          if (sticker.id === selectedStickerId) {
              ctx.strokeStyle = "#00AFFF";
              ctx.lineWidth = 2 * scale;
              ctx.strokeRect(-size, -size, size * 2, size * 2);
          }

          if (sticker.type === 'sun') {
              ctx.fillStyle = "#FFD700";
              ctx.beginPath();
              ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = "#FFA500";
              ctx.lineWidth = 4 * scale;
              for(let i=0; i<8; i++) {
                  ctx.rotate(Math.PI / 4);
                  ctx.beginPath();
                  ctx.moveTo(size * 0.8, 0);
                  ctx.lineTo(size * 1.1, 0);
                  ctx.stroke();
              }
          } else if (sticker.type === 'cloud') {
              ctx.fillStyle = "white";
              ctx.beginPath();
              ctx.arc(-size*0.4, 0, size*0.4, 0, Math.PI*2);
              ctx.arc(size*0.4, 0, size*0.4, 0, Math.PI*2);
              ctx.arc(0, -size*0.3, size*0.5, 0, Math.PI*2);
              ctx.fill();
          } else if (sticker.type === 'rain') {
              // Cloud
              ctx.fillStyle = "#ddd";
              ctx.beginPath();
              ctx.arc(-size*0.4, -size*0.2, size*0.4, 0, Math.PI*2);
              ctx.arc(size*0.4, -size*0.2, size*0.4, 0, Math.PI*2);
              ctx.arc(0, -size*0.5, size*0.5, 0, Math.PI*2);
              ctx.fill();
              // Drops
              ctx.fillStyle = "#4facfe";
              for(let i=-1; i<=1; i++) {
                  ctx.beginPath();
                  ctx.ellipse(i * size * 0.3, size * 0.5, size * 0.1, size * 0.2, 0, 0, Math.PI * 2);
                  ctx.fill();
              }
          } else if (sticker.type === 'snow') {
              ctx.fillStyle = "white";
              ctx.font = `${size}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText("❄️", 0, 0); // Emojis are text! Wait, user said NO EMOJIS in code.
              // So I must draw snowflake.
              ctx.strokeStyle = "white";
              ctx.lineWidth = 3 * scale;
              for(let i=0; i<3; i++) {
                  ctx.rotate(Math.PI / 3);
                  ctx.beginPath();
                  ctx.moveTo(-size*0.6, 0);
                  ctx.lineTo(size*0.6, 0);
                  ctx.stroke();
              }
          } else if (sticker.type === 'umbrella') {
              ctx.fillStyle = "#FF5252";
              ctx.beginPath();
              ctx.arc(0, -size*0.2, size*0.7, Math.PI, 0);
              ctx.fill();
              ctx.strokeStyle = "white";
              ctx.lineWidth = 3 * scale;
              ctx.beginPath();
              ctx.moveTo(0, -size*0.2);
              ctx.lineTo(0, size*0.8);
              ctx.arc(size*0.1, size*0.8, size*0.1, Math.PI, 0);
              ctx.stroke();
          } else if (sticker.type === 'sunglasses') {
              ctx.fillStyle = "black";
              ctx.beginPath();
              ctx.roundRect(-size*0.8, -size*0.2, size*0.7, size*0.5, size*0.1);
              ctx.roundRect(size*0.1, -size*0.2, size*0.7, size*0.5, size*0.1);
              ctx.fill();
              ctx.strokeStyle = "black";
              ctx.lineWidth = 2 * scale;
              ctx.beginPath();
              ctx.moveTo(-size*0.1, -size*0.1);
              ctx.lineTo(size*0.1, -size*0.1);
              ctx.stroke();
          } else if (sticker.type === 'thermometer') {
              ctx.fillStyle = "white";
              ctx.beginPath();
              ctx.roundRect(-size*0.15, -size*0.8, size*0.3, size*1.2, size*0.15);
              ctx.fill();
              ctx.fillStyle = "red";
              ctx.beginPath();
              ctx.arc(0, size*0.5, size*0.25, 0, Math.PI*2);
              ctx.fill();
              ctx.fillRect(-size*0.08, -size*0.5, size*0.16, size*1.0);
          } else if (sticker.type === 'wind') {
              ctx.strokeStyle = "white";
              ctx.lineWidth = 4 * scale;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.moveTo(-size*0.5, 0);
              ctx.bezierCurveTo(-size*0.2, -size*0.5, size*0.2, size*0.5, size*0.5, 0);
              ctx.stroke();
          } else if (sticker.type === 'rainbow') {
             // Mini rainbow
             const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
             colors.forEach((c, i) => {
                 ctx.strokeStyle = c;
                 ctx.lineWidth = 4 * scale;
                 ctx.beginPath();
                 ctx.arc(0, size * 0.5, size * 0.8 - i * 5 * scale, Math.PI, 0);
                 ctx.stroke();
             });
          }

          ctx.restore();
      });
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // A. Clear
    ctx.clearRect(0, 0, w, h);

    // B. Background
    if (image) {
        ctx.drawImage(image, 0, 0, w, h);
    } else {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#4facfe');
        grad.addColorStop(1, '#00f2fe');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('share.upload'), w/2, h/2);
    }

    // C. Overlays & Stickers
    drawOverlay(ctx, w, h);
    drawStickers(ctx, w, h);

    // D. Content
    drawTemplate(ctx, w, h);
  };

  const drawTemplate = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const { template, visibleFields, style, content } = viewSettings;
    const scale = Math.min(w, h) / 1080;
    const { textColor, fontFamily, fontSizeScale } = style;
    
    // Data
    const loc = visibleFields.location ? customLocation : '';
    const dateStr = visibleFields.date ? getFormattedDate() : '';
    const timeStr = (visibleFields.time && content.displayMode === 'current') ? customTime : ''; 
    
    let mainTemp = weatherData.temp;
    let mainLabel = weatherData.desc;
    if (content.displayMode === 'max') {
       mainTemp = weatherData.temp_max;
       mainLabel = `Max ${t('share.fields.temp')}`;
    } else if (content.displayMode === 'min') {
       mainTemp = weatherData.temp_min;
       mainLabel = `Min ${t('share.fields.temp')}`;
    }

    const getFont = (size: number, bold: boolean = false, italic: boolean = false) => {
        return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size * fontSizeScale}px ${fontFamily}`;
    };

    const drawStats = (x: number, startY: number, align: CanvasTextAlign = 'left', color = textColor, singleLine = false) => {
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.font = getFont(35 * scale);
        let y = startY;
        
        const list: string[] = [];
        if (visibleFields.temp_max) list.push(`Max: ${weatherData.temp_max}°`);
        if (visibleFields.temp_min) list.push(`Min: ${weatherData.temp_min}°`);
        if (visibleFields.wind_gusts) list.push(`Gusts: ${weatherData.wind_gusts} km/h`);
        if (visibleFields.wind_direction) list.push(`Dir: ${getWindDirection(weatherData.wind_direction, settings.language)}`);
        if (visibleFields.rain_amount) list.push(`Rain: ${weatherData.rain_amount}mm`);
        if (visibleFields.rain_duration) list.push(`Dur: ${weatherData.rain_duration}h`);
        if (visibleFields.uv_index) list.push(`UV: ${weatherData.uv_index}`);
        if (visibleFields.humidity) list.push(`Hum: ${weatherData.humidity}%`);
        if (visibleFields.pressure) list.push(`Press: ${weatherData.pressure} hPa`);
        if (visibleFields.visibility) list.push(`Vis: ${weatherData.visibility} km`);
        if (visibleFields.cloud_cover) list.push(`Cloud: ${weatherData.cloud_cover}%`);
        if (visibleFields.sunrise) list.push(`Sun ↑: ${weatherData.sunrise}`);
        if (visibleFields.sunset) list.push(`Sun ↓: ${weatherData.sunset}`);
        if (visibleFields.feels_like) list.push(`Feels: ${weatherData.feels_like}°`);
        if (visibleFields.heat_index) list.push(`Heat Index: ${weatherData.heat_index}°`);

        if (singleLine) {
             ctx.fillText(list.join(' • '), x, y);
        } else {
            if (align === 'left') {
                list.reverse().forEach(t => { ctx.fillText(t, x, y); y -= 50 * scale * fontSizeScale; });
            } else {
                list.forEach(t => { ctx.fillText(t, x, y); y += 50 * scale * fontSizeScale; });
            }
        }
        return list; // Return list for other uses
    };

    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = textColor;

    if (template === 'classic') {
        let topY = 80 * scale;
        ctx.textAlign = "left";
        ctx.font = getFont(60 * scale, true);
        if (loc) { ctx.fillText(loc, 40 * scale, topY); topY += 70 * scale * fontSizeScale; }
        ctx.font = getFont(40 * scale);
        if (dateStr || timeStr) ctx.fillText([dateStr, timeStr].filter(Boolean).join(' • '), 40 * scale, topY);
        drawStats(40 * scale, h - 40 * scale, 'left');
        if (visibleFields.temp) {
            ctx.textAlign = "right";
            ctx.font = getFont(180 * scale, true);
            ctx.fillText(`${mainTemp}°`, w - 40 * scale, h - 100 * scale);
            ctx.font = getFont(50 * scale);
            ctx.fillText(mainLabel, w - 40 * scale, h - 50 * scale);
        }

    } else if (template === 'insta') {
        const cx = w / 2;
        const cy = h / 2;
        ctx.textAlign = "center";
        if (loc) {
            ctx.font = getFont(60 * scale, true);
            ctx.fillText(loc.toUpperCase(), cx, 150 * scale);
        }
        if (dateStr) {
            ctx.font = getFont(30 * scale);
            ctx.fillText(dateStr.toUpperCase(), cx, 200 * scale);
        }
        if (visibleFields.temp) {
            ctx.font = getFont(300 * scale, true);
            ctx.fillText(`${mainTemp}°`, cx, cy + 50 * scale);
            ctx.font = getFont(50 * scale);
            ctx.fillText(mainLabel, cx, cy + 120 * scale);
        }

    } else if (template === 'data' || template === 'news') {
        const barHeight = template === 'news' ? 250 * scale : 400 * scale;
        ctx.fillStyle = template === 'news' ? 'rgba(200, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 0;
        ctx.fillRect(0, h - barHeight, w, barHeight);
        ctx.fillStyle = textColor;
        ctx.shadowBlur = 0;

        if (template === 'news') {
            ctx.fillStyle = "#ffeb3b";
            ctx.font = getFont(50 * scale, true, true);
            ctx.textAlign = "left";
            ctx.fillText("BREAKING WEATHER", 40 * scale, h - barHeight + 70 * scale);
            ctx.fillStyle = textColor;
            
            // Auto-scale text to fit
            let newsText = `${loc}: ${mainTemp}° ${mainLabel}`;
            let fontSize = 80 * scale;
            ctx.font = getFont(fontSize, true);
            let textWidth = ctx.measureText(newsText).width;
            const maxWidth = w - 80 * scale;
            
            if (textWidth > maxWidth) {
                fontSize = fontSize * (maxWidth / textWidth);
                ctx.font = getFont(fontSize, true);
            }
            
            ctx.fillText(newsText, 40 * scale, h - barHeight + 70 * scale + fontSize + 20 * scale);
            
            // Scrolling stats at very bottom?
            const stats = drawStats(0, 0, 'left', textColor, true); // Get list
            ctx.font = getFont(35 * scale);
            ctx.fillText(stats.join('   |   '), 40 * scale, h - 30 * scale);
        } else {
            // Data Nerd Grid
            let startY = h - barHeight + 60 * scale;
            let startX = 40 * scale;
            ctx.textAlign = "left";
            ctx.font = getFont(80 * scale, true);
            if (visibleFields.temp) ctx.fillText(`${mainTemp}° ${loc}`, startX, startY);
            ctx.font = getFont(40 * scale);
            if (dateStr) ctx.fillText(`${dateStr} ${timeStr}`, startX, startY + 60 * scale * fontSizeScale);

            // Grid stats
            const stats = drawStats(0, 0, 'left', textColor, true); // Get list
            ctx.font = getFont(35 * scale);
            let gridX = 40 * scale;
            let gridY = startY + 140 * scale;
            // 3 columns fits 1080 well (350px each)
            stats.forEach((item, i) => {
                ctx.fillText(item, gridX + (i % 3) * (350 * scale), gridY + Math.floor(i / 3) * (50 * scale * fontSizeScale));
            });
        }
    } else if (template === 'minimal') {
        ctx.textAlign = "right";
        ctx.font = getFont(30 * scale);
        const txt = [loc, dateStr, visibleFields.temp ? `${mainTemp}°` : ''].filter(Boolean).join(' | ');
        ctx.fillText(txt, w - 20 * scale, h - 20 * scale);

    } else if (template === 'badge') {
        const cx = w / 2;
        const cy = h / 2;
        const r = 250 * scale;
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = textColor === '#FFFFFF' ? 'black' : textColor;
        ctx.textAlign = "center";
        ctx.font = getFont(40 * scale, true);
        ctx.fillText(loc.toUpperCase(), cx, cy - 80 * scale);
        if (visibleFields.temp) {
            ctx.font = getFont(140 * scale, true);
            ctx.fillText(`${mainTemp}°`, cx, cy + 40 * scale);
        }
        ctx.font = getFont(30 * scale);
        ctx.fillText(dateStr, cx, cy + 100 * scale);

    } else if (template === 'frame') {
        const border = 60 * scale;
        ctx.strokeStyle = textColor;
        ctx.lineWidth = border;
        ctx.strokeRect(border/2, border/2, w - border, h - border);
        ctx.fillStyle = textColor;
        ctx.textAlign = "center";
        ctx.shadowBlur = 10;
        ctx.font = getFont(80 * scale, true);
        if (visibleFields.temp) ctx.fillText(`${mainTemp}°`, w/2, h - 120 * scale);
        ctx.font = getFont(40 * scale);
        ctx.fillText(loc, w/2, h - 70 * scale);

    } else if (template === 'cinematic') {
        const barH = 150 * scale;
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, w, barH);
        ctx.fillRect(0, h - barH, w, barH);
        ctx.fillStyle = textColor;
        ctx.textAlign = "center";
        ctx.font = getFont(40 * scale);
        ctx.fillText(`${dateStr} // ${loc}`.toUpperCase(), w/2, barH - 50 * scale);
        if (visibleFields.temp) {
            ctx.font = getFont(60 * scale, true);
            ctx.fillText(`${mainTemp}°C  ${mainLabel}`.toUpperCase(), w/2, h - 50 * scale);
        }

    } else if (template === 'post') {
        ctx.textAlign = "right";
        ctx.font = getFont(80 * scale, true, true);
        ctx.shadowColor = "black";
        ctx.shadowBlur = 5;
        ctx.fillText(`Greetings from ${loc}`, w - 40 * scale, h - 140 * scale);
        if (visibleFields.temp) {
             ctx.font = getFont(60 * scale, true);
             ctx.fillText(`${mainTemp}° ${dateStr}`, w - 40 * scale, h - 60 * scale);
        }

    } else if (template === 'bubble') {
        const bubble = style.bubble;
        const cx = (bubble.x / 100) * w;
        const cy = (bubble.y / 100) * h;
        const bScale = bubble.scale || 1.0;
        const tScale = bubble.tailScale || 1.0;
        const bW = 400 * scale * bScale;
        const bH = 300 * scale * bScale;
        
        ctx.fillStyle = "white";
        // Use filter for unified shadow on complex shapes (especially 'think' bubble)
        ctx.filter = "drop-shadow(0px 0px 10px rgba(0,0,0,0.3))";
        
        ctx.beginPath();
        
        if (bubble.type === 'think') {
             // Cloud shape - merged path
             const r = bW * 0.25;
             ctx.moveTo(cx - bW*0.3 + r, cy - bH*0.3);
             ctx.arc(cx - bW*0.3, cy - bH*0.3, r, 0, Math.PI * 2);
             ctx.moveTo(cx + bW*0.3 + r, cy - bH*0.3);
             ctx.arc(cx + bW*0.3, cy - bH*0.3, r, 0, Math.PI * 2);
             ctx.moveTo(cx - bW*0.3 + r, cy + bH*0.3);
             ctx.arc(cx - bW*0.3, cy + bH*0.3, r, 0, Math.PI * 2);
             ctx.moveTo(cx + bW*0.3 + r, cy + bH*0.3);
             ctx.arc(cx + bW*0.3, cy + bH*0.3, r, 0, Math.PI * 2);
             ctx.moveTo(cx + bW*0.4, cy);
             ctx.arc(cx, cy, bW*0.4, 0, Math.PI * 2);
             
             // Tail bubbles
             ctx.moveTo(cx + bW*0.4 + bW*0.08, cy + bH*0.5);
             ctx.arc(cx + bW*0.4, cy + bH*0.5, bW*0.08, 0, Math.PI * 2);
             ctx.moveTo(cx + bW*0.5 + bW*0.05, cy + bH*0.65);
             ctx.arc(cx + bW*0.5, cy + bH*0.65, bW*0.05, 0, Math.PI * 2);

             ctx.fill();

        } else if (bubble.type === 'shout') {
             // Jagged shape
             const spikes = 12;
             const outer = bW * 0.6;
             const inner = bW * 0.5;
             // ctx.beginPath(); // Already called
             for (let i = 0; i < spikes * 2; i++) {
                const r = (i % 2 === 0) ? outer : inner;
                const a = (Math.PI * i) / spikes;
                if (i===0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * (r * 0.75));
                else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * (r * 0.75));
             }
             ctx.closePath();
             ctx.fill();

        } else {
             // Talk (default)
             ctx.roundRect(cx - bW/2, cy - bH/2, bW, bH, 20 * scale);
             
             // Tail
             ctx.moveTo(cx, cy + bH/2);
             ctx.lineTo(cx - 20 * scale * tScale, cy + bH/2 + 30 * scale * tScale);
             ctx.lineTo(cx + 20 * scale * tScale, cy + bH/2);
             
             ctx.fill();
        }
        
        ctx.filter = "none";
        ctx.shadowBlur = 0;
        ctx.fillStyle = textColor === '#FFFFFF' ? 'black' : textColor;
        ctx.textAlign = "center";
        ctx.font = getFont(80 * scale * bScale, true);
        if (visibleFields.temp) {
            ctx.fillText(`${mainTemp}°`, cx, cy);
            ctx.font = getFont(30 * scale * bScale);
            ctx.fillText(mainLabel, cx, cy + 90 * scale * bScale);
        }
        ctx.font = getFont(30 * scale * bScale);
        ctx.fillText(loc, cx, cy + 50 * scale * bScale);
    }
  };

  const toggleAll = () => {
      const allSelected = Object.values(viewSettings.visibleFields).every(v => v);
      const newVal = !allSelected;
      const newFields = { ...viewSettings.visibleFields };
      (Object.keys(newFields) as Array<keyof VisibleFields>).forEach(k => {
          newFields[k] = newVal;
      });
      updateSettings({ visibleFields: newFields });
  };

  const download = () => {
      const link = document.createElement('a');
      link.download = `weather-share-${Date.now()}.jpg`;
      link.href = canvasRef.current!.toDataURL('image/jpeg', 0.9);
      link.click();
  };

  const handlePrint = () => {
      const dataUrl = canvasRef.current!.toDataURL('image/jpeg', 0.9);
      const win = window.open('');
      if (win) {
          win.document.write(`<img src="${dataUrl}" style="width:100%"/>`);
          win.document.close();
          win.focus();
          setTimeout(() => {
              win.print();
              win.close();
          }, 250);
      }
  };

  const handleShare = async () => {
      if (!canvasRef.current) return;
      canvasRef.current.toBlob(async (blob) => {
          if (!blob) return;
          const file = new File([blob], 'weather-share.jpg', { type: 'image/jpeg' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
              try {
                  await navigator.share({
                      files: [file],
                      title: 'My Weather',
                      text: `Weather in ${customLocation}: ${weatherData.temp}°C`
                  });
              } catch (err) {
                  console.error("Share failed", err);
              }
          } else {
              alert(t('share.not_supported') || "Sharing not supported on this device");
          }
      }, 'image/jpeg', 0.9);
  };

  const hasImage = !!image;
  const btnClass = (enabled: boolean) => 
    `col-span-1 py-4 rounded-xl font-bold text-sm shadow-sm transition-all flex flex-col items-center justify-center gap-1 
    ${enabled 
        ? 'bg-accent-primary text-text-inverse hover:shadow-lg hover:bg-accent-hover cursor-pointer' 
        : 'bg-bg-subtle text-text-muted cursor-not-allowed'}`;

  const cleanCanvas = () => {
      setViewSettings(prev => {
          const newFields = { ...prev.visibleFields };
          (Object.keys(newFields) as Array<keyof VisibleFields>).forEach(k => newFields[k] = false);
          
          return {
              ...prev,
              visibleFields: newFields,
              style: {
                  ...prev.style,
                  overlay: 'none',
                  stickers: []
              }
          };
      });
  };

  return (
    <div className="flex flex-col min-h-screen bg-bg-page text-text-main pb-32">
        {/* Header */}
        <div className="flex items-center p-4 pt-8 sticky top-0 bg-bg-card/95 backdrop-blur z-20 border-b border-border-color transition-colors">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-bg-page mr-2">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-lg font-bold">{t('share.title')}</h1>
        </div>

        {showLimitModal ? (
             <div className="flex-1 flex items-center justify-center p-8">
                 <div className="text-center max-w-md">
                     <Icon name="block" className="text-4xl text-red-500 mb-4 mx-auto" />
                     <h2 className="text-xl font-bold mb-2">Limiet Bereikt</h2>
                     <p className="text-slate-500 mb-6">{limitError}</p>
                     <button onClick={() => onNavigate(ViewState.CURRENT)} className="px-6 py-2 bg-primary text-white rounded-xl font-bold">Terug</button>
                 </div>
                 <LimitReachedModal 
                    isOpen={showLimitModal} 
                    onClose={() => setShowLimitModal(false)}
                    message={limitError}
                 />
             </div>
        ) : (
        <div className="flex flex-col lg:flex-row gap-8 p-4 max-w-7xl mx-auto w-full">
            
            {/* Controls */}
            <div className="flex-1 space-y-6">
                
                {/* 1. Upload */}
                <div className="bg-bg-card p-6 rounded-2xl shadow-sm border border-border-color">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold flex items-center gap-2">
                            <Icon name="add_a_photo" className="text-accent-primary" /> {t('share.upload')}
                        </h3>
                        <button 
                            onClick={cleanCanvas}
                            className="py-1 px-3 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center gap-1"
                        >
                            <Icon name="cleaning_services" className="text-sm" /> {t('share.clean')}
                        </button>
                    </div>
                    
                    <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-text-muted
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-accent-primary/10 file:text-accent-primary
                        hover:file:bg-accent-primary/20
                        cursor-pointer mb-6"
                    />

                    {/* Style Selection */}
                    <div className="mt-6">
                        <label className="text-sm font-bold text-text-muted mb-2 block">{t('share.style')}</label>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            {(['classic', 'insta', 'data', 'news', 'minimal', 'badge', 'frame', 'cinematic', 'post', 'bubble'] as const).map(tpl => (
                                <button
                                    key={tpl}
                                    onClick={() => applyTemplate(tpl)}
                                    className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all ${
                                        viewSettings.template === tpl 
                                        ? 'bg-accent-primary text-text-inverse border-accent-primary' 
                                        : 'bg-bg-page border-transparent hover:border-accent-primary/50'
                                    }`}
                                >
                                    {t(`share.template.${tpl}`)}
                                </button>
                            ))}
                        </div>
                        
                        {/* Bubble Controls */}
                        {viewSettings.template === 'bubble' && (
                             <div className="mt-4 p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5">
                                 <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">{t('share.bubble.settings')}</label>
                                 <div className="flex gap-2 mb-3">
                                     {['talk', 'think', 'shout'].map(bt => (
                                         <button 
                                            key={bt}
                                            onClick={() => updateBubble({ type: bt as any })}
                                            className={`flex-1 py-1 rounded text-xs border ${viewSettings.style.bubble.type === bt ? 'bg-primary text-white' : 'bg-white dark:bg-white/10'}`}
                                         >
                                            {t(`share.bubble.${bt}`)}
                                         </button>
                                     ))}
                                 </div>
                                 <div className="grid grid-cols-2 gap-4">
                                     <div>
                                         <label className="text-[10px] text-slate-500 block">{t('share.bubble.position')}</label>
                                         <input type="range" min="0" max="100" value={viewSettings.style.bubble.x} onChange={e => updateBubble({ x: parseInt(e.target.value) })} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer mb-2"/>
                                         <input type="range" min="0" max="100" value={viewSettings.style.bubble.y} onChange={e => updateBubble({ y: parseInt(e.target.value) })} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"/>
                                     </div>
                                     <div>
                                         <label className="text-[10px] text-slate-500 block">{t('share.bubble.size_tail')}</label>
                                         <input type="range" min="50" max="200" value={viewSettings.style.bubble.scale * 100} onChange={e => updateBubble({ scale: parseInt(e.target.value)/100 })} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer mb-2"/>
                                         {viewSettings.style.bubble.type === 'talk' && (
                                            <input type="range" min="50" max="200" value={(viewSettings.style.bubble.tailScale || 1) * 100} onChange={e => updateBubble({ tailScale: parseInt(e.target.value)/100 })} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"/>
                                         )}
                                     </div>
                                 </div>
                             </div>
                        )}

                        {/* Weather Effects */}
                        <div className="mt-6">
                            <label className="text-sm font-bold text-slate-500 dark:text-white/50 mb-2 block">{t('share.effects_title')}</label>
                            <select 
                                value={viewSettings.style.overlay || 'none'}
                                onChange={(e) => updateStyle({ overlay: e.target.value as any })}
                                className="w-full p-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-white/10"
                            >
                                <option value="none">{t('share.overlay.none')}</option>
                                <option value="snow">{t('share.overlay.snow')}</option>
                                <option value="rain">{t('share.overlay.rain')}</option>
                                <option value="mist">{t('share.overlay.mist')}</option>
                                <option value="sun">{t('share.overlay.sun')}</option>
                                <option value="moon">{t('share.overlay.moon')}</option>
                                <option value="clouds">{t('share.overlay.clouds')}</option>
                                <option value="thunder">{t('share.overlay.thunder')}</option>
                                <option value="rainbow">{t('share.overlay.rainbow')}</option>
                            </select>
                        </div>

                        {/* Stickers */}
                        <div className="mt-6">
                            <label className="text-sm font-bold text-slate-500 dark:text-white/50 mb-2 block">{t('share.stickers_title')}</label>
                            <div className="flex gap-2 flex-wrap mb-4">
                                {['sun', 'cloud', 'rain', 'snow', 'umbrella', 'sunglasses', 'thermometer', 'wind', 'rainbow'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => updateStickers('add', { type: s as any })}
                                        className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg text-xl hover:bg-slate-200 dark:hover:bg-white/10"
                                    >
                                        {s === 'sun' ? '☀️' : s === 'cloud' ? '☁️' : s === 'rain' ? '🌧️' : s === 'snow' ? '❄️' : s === 'umbrella' ? '☂️' : s === 'sunglasses' ? '🕶️' : s === 'thermometer' ? '🌡️' : s === 'wind' ? '💨' : '🌈'}
                                    </button>
                                ))}
                            </div>
                            
                            {/* Selected Sticker Controls */}
                            {selectedStickerId && (
                                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">{t('share.sticker.selected')}</label>
                                        <button onClick={() => updateStickers('remove', { id: selectedStickerId })} className="text-red-500 text-xs font-bold">{t('share.sticker.remove')}</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                         <div>
                                             <label className="text-[10px] text-slate-500 block">{t('share.sticker.position')}</label>
                                             <input 
                                                type="range" min="0" max="100" 
                                                value={viewSettings.style.stickers?.find(s => s.id === selectedStickerId)?.x || 50} 
                                                onChange={e => updateStickers('update', { id: selectedStickerId, x: parseInt(e.target.value) })} 
                                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer mb-2"
                                            />
                                             <input 
                                                type="range" min="0" max="100" 
                                                value={viewSettings.style.stickers?.find(s => s.id === selectedStickerId)?.y || 50} 
                                                onChange={e => updateStickers('update', { id: selectedStickerId, y: parseInt(e.target.value) })} 
                                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                         </div>
                                         <div>
                                             <label className="text-[10px] text-slate-500 block">{t('share.sticker.size')}</label>
                                             <input 
                                                type="range" min="50" max="300" 
                                                value={(viewSettings.style.stickers?.find(s => s.id === selectedStickerId)?.scale || 1) * 100} 
                                                onChange={e => updateStickers('update', { id: selectedStickerId, scale: parseInt(e.target.value)/100 })} 
                                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                         </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Text Options */}
                        <div className="mt-6 border-t border-slate-200 dark:border-white/10 pt-4">
                            <label className="text-sm font-bold text-slate-500 dark:text-white/50 mb-2 block">{t('share.text_options')}</label>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Color */}
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">{t('share.text_color')}</label>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        {['#FFFFFF', '#000000', '#FF0000', '#0000FF', '#008000', '#FFFF00'].map(c => (
                                            <button 
                                                key={c}
                                                onClick={() => updateStyle({ textColor: c })}
                                                className={`w-8 h-8 rounded-full border-2 ${viewSettings.style.textColor === c ? 'border-primary' : 'border-slate-200 dark:border-white/10'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                        <div className="relative w-8 h-8 rounded-full overflow-hidden border border-slate-200 dark:border-white/10">
                                            <input 
                                                type="color" 
                                                value={viewSettings.style.textColor} 
                                                onChange={(e) => updateStyle({ textColor: e.target.value })}
                                                className="absolute -top-2 -left-2 w-12 h-12 p-0 border-0 cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Font Family */}
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">{t('share.font_family')}</label>
                                    <select 
                                        value={viewSettings.style.fontFamily} 
                                        onChange={(e) => updateStyle({ fontFamily: e.target.value })}
                                        className="w-full p-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-white/10"
                                    >
                                        <option value="sans-serif">Sans Serif</option>
                                        <option value="serif">Serif</option>
                                        <option value="monospace">Monospace</option>
                                        <option value="cursive">Handwritten</option>
                                    </select>
                                </div>

                                {/* Font Size */}
                                <div className="col-span-1 md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">{t('share.font_size')}</label>
                                    <div className="flex gap-2">
                                        {[0.8, 1.0, 1.2, 1.5].map(s => (
                                            <button 
                                                key={s} 
                                                onClick={() => updateStyle({ fontSizeScale: s })} 
                                                className={`flex-1 py-1 rounded text-xs border ${viewSettings.style.fontSizeScale === s ? 'bg-primary text-white' : 'bg-slate-50 dark:bg-white/5'}`}
                                            >
                                                {s === 0.8 ? t('share.size.small') : s === 1.0 ? t('share.size.normal') : s === 1.2 ? t('share.size.large') : t('share.size.xl')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Data Selection */}
                <div className="bg-bg-card p-6 rounded-2xl shadow-sm border border-border-color relative z-10">
                    <h3 className="font-bold mb-4 flex items-center gap-2">
                        <Icon name="edit" className="text-accent-primary" /> {t('share.date_time_title')}
                    </h3>
                    
                    <div className="space-y-3">
                        {/* Location Row */}
                        <div className="relative">
                            <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">{t('share.location')}</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={searchQuery || customLocation} 
                                    onChange={(e) => handleSearch(e.target.value)}
                                    placeholder={t('share.search_location') || "Search Location..."}
                                    className="w-full p-2 text-sm bg-bg-page rounded-lg border border-border-color"
                                />
                                {loadingSearch && (
                                    <div className="absolute right-3 top-2.5">
                                        <div className="animate-spin size-4 border-2 border-accent-primary border-t-transparent rounded-full" />
                                    </div>
                                )}
                            </div>
                            
                            {/* Search Results Dropdown */}
                            {showSearchResults && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-bg-card rounded-xl shadow-xl border border-border-color max-h-48 overflow-y-auto z-50">
                                    {searchResults.map((res, idx) => (
                                        <button
                                            key={`${res.name}-${idx}`}
                                            onClick={() => selectLocation(res)}
                                            className="w-full text-left px-4 py-3 hover:bg-bg-page border-b border-border-color last:border-0"
                                        >
                                            <div className="font-bold">{res.name}</div>
                                            <div className="text-xs text-text-muted">{res.country}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Date, Time, Display Mode Row */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                            {/* Date Picker */}
                            <div className="col-span-1">
                                <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">{t('share.fields.date')}</label>
                                <input 
                                    type="date" 
                                    value={customDate} 
                                    onChange={(e) => setCustomDate(e.target.value)}
                                    className="w-full p-2 text-sm bg-bg-page rounded-lg border border-border-color"
                                />
                            </div>

                            {/* Date Format */}
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">{t('share.fields.date')}</label>
                                <div className="flex gap-2">
                                    <select 
                                        value={viewSettings.content.dateFormat} 
                                        onChange={(e) => updateContent({ dateFormat: e.target.value as any })}
                                        className="flex-1 p-2 text-sm bg-bg-page rounded-lg border border-border-color"
                                    >
                                        <option value="short">{getSampleDate('short')}</option>
                                        <option value="medium">{getSampleDate('medium')}</option>
                                        <option value="long">{getSampleDate('long')}</option>
                                    </select>
                                    <button 
                                        onClick={() => updateContent({ showDayName: !viewSettings.content.showDayName })}
                                        className={`px-3 rounded-lg border text-sm font-bold transition-colors ${viewSettings.content.showDayName ? 'bg-accent-primary text-text-inverse border-accent-primary' : 'bg-bg-page border-transparent'}`}
                                    >
                                        {t('tab.day')}
                                    </button>
                                </div>
                            </div>

                            {/* Time Picker */}
                            <div className="col-span-1">
                                <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">{t('share.fields.time')}</label>
                                <select 
                                    value={customTime} 
                                    onChange={(e) => setCustomTime(e.target.value)}
                                    disabled={viewSettings.content.displayMode !== 'current'}
                                    className="w-full p-2 text-sm bg-bg-page rounded-lg border border-border-color disabled:opacity-50"
                                >
                                    {Array.from({length: 24}).map((_, i) => {
                                        const h = i.toString().padStart(2, '0');
                                        return <option key={h} value={`${h}:00`}>{`${h}:00`}</option>
                                    })}
                                </select>
                            </div>

                            {/* Display Mode */}
                            <div className="col-span-1">
                                <label className="text-[10px] font-bold text-text-muted uppercase mb-1 block">{t('share.display')}</label>
                                <select 
                                    value={viewSettings.content.displayMode} 
                                    onChange={(e) => updateContent({ displayMode: e.target.value as any })}
                                    className="w-full p-2 text-sm bg-bg-page rounded-lg border border-border-color"
                                >
                                    <option value="current">Current Temp</option>
                                    <option value="max">Max Temp</option>
                                    <option value="min">Min Temp</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Checkbox Options */}
                <div className="bg-bg-card p-6 rounded-2xl shadow-sm border border-border-color">
                     <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold flex items-center gap-2">
                            <Icon name="check_circle" className="text-accent-primary" /> {t('share.options_title')}
                        </h3>
                        <button 
                            onClick={toggleAll}
                            className="text-xs font-bold text-accent-primary hover:underline"
                        >
                            Toggle All
                        </button>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                        {Object.keys(viewSettings.visibleFields).map(key => {
                            const isAvailable = dataAvailability[key] !== false; 
                            return (
                                <label key={key} className={`flex items-center gap-2 p-2 rounded-lg border border-border-color transition-colors ${
                                    isAvailable 
                                    ? 'hover:bg-bg-page cursor-pointer' 
                                    : 'opacity-50 cursor-not-allowed bg-bg-page'
                                }`}>
                                    <input 
                                        type="checkbox"
                                        checked={viewSettings.visibleFields[key as keyof VisibleFields]}
                                        disabled={!isAvailable}
                                        onChange={(e) => updateSettings({ visibleFields: {...viewSettings.visibleFields, [key]: e.target.checked} })}
                                        className="rounded text-accent-primary focus:ring-accent-primary size-4"
                                    />
                                    <span className="text-xs font-medium truncate">{t(`share.fields.${key}`)}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-3 gap-3">
                    <button 
                        onClick={download}
                        disabled={!hasImage}
                        className={btnClass(hasImage)}
                    >
                        <Icon name="download" className="text-2xl" /> {t('share.download')}
                    </button>
                    <button 
                        onClick={handlePrint}
                        disabled={!hasImage}
                        className={btnClass(hasImage)}
                    >
                        <Icon name="print" className="text-2xl" /> {t('print') || "Print"}
                    </button>
                    <button 
                        onClick={handleShare}
                        disabled={!hasImage}
                        className={btnClass(hasImage)}
                    >
                        <Icon name="share" className="text-2xl" /> {t('share') || "Share"}
                    </button>
                </div>

            </div>

            {/* Preview */}
            <div className="flex-1 flex items-start justify-center bg-bg-subtle rounded-3xl p-8 border border-dashed border-border-color overflow-hidden">
                <canvas 
                    ref={canvasRef} 
                    width={canvasSize.w} 
                    height={canvasSize.h} 
                    className="max-w-full max-h-[80vh] w-auto h-auto shadow-2xl rounded-lg bg-white object-contain"
                />
            </div>

        </div>
        )}
    </div>
  );
};
