
import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings, RideData } from '../types';
import { ResponsiveContainer, ComposedChart, Area, Line, Bar, XAxis, Tooltip, YAxis, CartesianGrid, Legend } from 'recharts';
import { fetchHistorical, convertTemp, convertWind, convertPrecip } from '../services/weatherService';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

interface GPXPoint {
    lat: number;
    lon: number;
    ele: number;
    time: Date | null;
    distFromStart: number;
}

interface ChartDataPoint {
    time: string;
    dist: number; // km
    ele: number; // m
    temp: number; // variable unit
    rain: number; // variable unit
    wind: number; // variable unit
    windDir: number; // degrees
    sun: number; // minutes
    lat?: number;
    lon?: number;
}

interface ExtendedRideData extends RideData {
    startTimeStr?: string;
    endTimeStr?: string;
    avgWindDir?: number; 
    avgWindText?: string; 
}

const CustomWindArrow = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || typeof payload.windDir === 'undefined' || !cx || !cy) return null;
    
    const rotate = `rotate(${payload.windDir + 180}, ${cx}, ${cy})`;
    
    return (
        <g transform={rotate}>
            <path d={`M${cx},${cy-4} L${cx-3},${cy+3} L${cx},${cy} L${cx+3},${cy+3} Z`} fill="#22c55e" />
        </g>
    );
};

export const StravaWeatherView: React.FC<Props> = ({ onNavigate, settings }) => {
  const [rideData, setRideData] = useState<ExtendedRideData | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(''); 
  const [error, setError] = useState('');
  const [isRouteOnly, setIsRouteOnly] = useState(false);
  
  // Map State
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null); 
  const markersLayerRef = useRef<any>(null); 
  const [routeCoordinates, setRouteCoordinates] = useState<GPXPoint[]>([]);
  const [weatherMarkers, setWeatherMarkers] = useState<any[]>([]); 
  const [isFullScreenMap, setIsFullScreenMap] = useState(false);

  const t = (key: string) => getTranslation(key, settings.language);

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getWindCardinal = (deg: number) => {
    const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  };

  useEffect(() => {
    if (routeCoordinates.length === 0 || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) { console.error("Leaflet not loaded"); setError(t('error')); return; }

    if (mapInstanceRef.current) { mapInstanceRef.current.invalidateSize(); return; }

    const container = mapContainerRef.current as any;
    if (container._leaflet_id) { container._leaflet_id = null; container.innerHTML = ''; }

    try {
        const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false });
        mapInstanceRef.current = map;

        const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 20 });
        const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OSM' });
        const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' });
        const cyclosm = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', { maxZoom: 20, attribution: 'CyclOSM' });

        if (settings.theme === 'dark') cartoDark.addTo(map); else osm.addTo(map);

        const baseMaps = { "Dark": cartoDark, "Standard": osm, "Satellite": satellite, "Cycle": cyclosm };
        L.control.layers(baseMaps).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        markersLayerRef.current = markersLayer;

        const latLngs = routeCoordinates.map(p => [p.lat, p.lon]);
        const polyline = L.polyline(latLngs, { color: '#FC4C02', weight: 4 }).addTo(map);
        
        map.fitBounds(polyline.getBounds(), { padding: [20, 20] });

        // Start/End Markers
        L.circleMarker(latLngs[0], { radius: 6, color: 'white', fillColor: '#10b981', fillOpacity: 1 }).addTo(map);
        L.circleMarker(latLngs[latLngs.length - 1], { radius: 6, color: 'white', fillColor: '#ef4444', fillOpacity: 1 }).addTo(map);

    } catch (e) {
        console.error("Map init error", e);
    }
  }, [routeCoordinates, settings.theme]);

  // Handle Full Screen Toggle
  useEffect(() => {
      if (mapInstanceRef.current) {
          setTimeout(() => mapInstanceRef.current.invalidateSize(), 300); 
      }
  }, [isFullScreenMap]);

  // Update markers when weather data (chartData) changes
  useEffect(() => {
    if (!mapInstanceRef.current || chartData.length === 0 || isRouteOnly) return;
    const L = (window as any).L;
    
    // Clear old markers if any
    if (weatherMarkers.length > 0) {
        weatherMarkers.forEach(m => m.remove());
    }

    const newMarkers: any[] = [];
    const step = Math.max(1, Math.floor(chartData.length / 10)); // ~10 markers along route

    chartData.forEach((point, i) => {
        if (i % step === 0 && point.lat && point.lon) {
             const iconHtml = `
                <div style="background: ${settings.theme === 'dark' ? '#1e293b' : 'white'}; padding: 4px; border-radius: 8px; border: 1px solid rgba(128,128,128,0.2); box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-family: sans-serif; text-align: center; min-width: 60px;">
                    <div style="font-size: 10px; font-weight: bold; color: ${settings.theme === 'dark' ? '#fff' : '#333'}; line-height: 1;">${Math.round(point.temp)}°</div>
                    <div style="font-size: 8px; color: ${settings.theme === 'dark' ? '#aaa' : '#666'}; margin-bottom: 2px;">${Math.round(point.wind)}${settings.windUnit}</div>
                    <div style="transform: rotate(${point.windDir + 180}deg); display: inline-block; width: 10px; height: 10px;">
                        <svg viewBox="0 0 24 24" fill="#13b6ec"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" /></svg>
                    </div>
                </div>
            `;
            
            const icon = L.divIcon({
                html: iconHtml,
                className: '',
                iconSize: [60, 40],
                iconAnchor: [30, 40]
            });

            const marker = L.marker([point.lat, point.lon], { icon }).addTo(mapInstanceRef.current);
            newMarkers.push(marker);
        }
    });
    setWeatherMarkers(newMarkers);

  }, [chartData, settings.theme]);

  // Separate Effect to handle re-init when view switches back to dashboard
  useEffect(() => {
     if (routeCoordinates.length > 0 && mapContainerRef.current && !mapInstanceRef.current) {
         // Force re-run of map init if it was destroyed or not created yet
         setRouteCoordinates([...routeCoordinates]); 
     }
  }, [rideData, isRouteOnly]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    setRideData(null);
    setChartData([]);
    setRouteCoordinates([]);
    setIsRouteOnly(false);

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target?.result as string;
        try {
            setLoadingStep(t('analyzing'));
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "text/xml");
            
            // Handle GPX namespaces
            const trkpts = Array.from(xmlDoc.getElementsByTagName('trkpt'));
            
            if (trkpts.length === 0) {
                throw new Error("No track points found in GPX");
            }

            const points: GPXPoint[] = [];
            let totalDist = 0;
            let hasTime = true;

            for (let i = 0; i < trkpts.length; i++) {
                const pt = trkpts[i];
                const lat = parseFloat(pt.getAttribute('lat') || '0');
                const lon = parseFloat(pt.getAttribute('lon') || '0');
                const ele = parseFloat(pt.getElementsByTagName('ele')[0]?.textContent || '0');
                const timeStr = pt.getElementsByTagName('time')[0]?.textContent;
                
                if (!timeStr) {
                    hasTime = false;
                }

                let distFromStart = 0;
                if (i > 0) {
                    const prev = points[i-1];
                    const d = getDistance(prev.lat, prev.lon, lat, lon);
                    totalDist += d;
                    distFromStart = totalDist;
                }

                points.push({
                    lat, lon, ele, 
                    time: timeStr ? new Date(timeStr) : null,
                    distFromStart
                });
            }

            if (!hasTime) {
                setIsRouteOnly(true);
                setLoadingStep(t('only_route_desc'));
                setRouteCoordinates(points);
                 setRideData({
                    id: 'route-only',
                    name: file.name.replace('.gpx', ''),
                    date: new Date().toLocaleDateString(),
                    distance: parseFloat(totalDist.toFixed(1)),
                    time: '--:--',
                    elevation: 0,
                    avgSpeed: 0,
                    mapUrl: '',
                    weather: { temp: 0, wind: 0, precip: 0 }
                });
                setLoading(false);
                return;
            }

            setRouteCoordinates(points);
            
            // Calculate Ride Stats
            const startTime = points[0].time!;
            const endTime = points[points.length - 1].time!;
            const durationMs = endTime.getTime() - startTime.getTime();
            const durationHrs = durationMs / (1000 * 60 * 60);
            
            // Calculate Elevation Gain
            let gain = 0;
            for(let i=1; i<points.length; i++) {
                const diff = points[i].ele - points[i-1].ele;
                if (diff > 0) gain += diff;
            }

            setLoadingStep(t('fetching_weather'));

            // Prepare weather fetch points (every 30 mins)
            const weatherCheckpoints: GPXPoint[] = [];
            let lastCheckTime = startTime.getTime();
            
            // Always add start point
            weatherCheckpoints.push(points[0]);

            for (const pt of points) {
                if (pt.time!.getTime() - lastCheckTime >= 30 * 60 * 1000) {
                    weatherCheckpoints.push(pt);
                    lastCheckTime = pt.time!.getTime();
                }
            }
            
            // Ensure end point is added if gap > 10 mins
            if (endTime.getTime() - lastCheckTime > 10 * 60 * 1000) {
                weatherCheckpoints.push(points[points.length - 1]);
            }

            // Fetch Weather for each checkpoint sequentially to avoid rate limit
            const weatherDataPoints: ChartDataPoint[] = [];
            const windDirs: number[] = [];

            for (let i = 0; i < weatherCheckpoints.length; i++) {
                const pt = weatherCheckpoints[i];
                setLoadingStep(`${t('fetching_weather')} (${i+1}/${weatherCheckpoints.length})`);
                
                // Rate limit delay
                if (i > 0) await new Promise(r => setTimeout(r, 200));

                try {
                    const data = await fetchHistorical(
                        pt.lat, 
                        pt.lon, 
                        pt.time!.toISOString().split('T')[0], 
                        pt.time!.toISOString().split('T')[0]
                    );
                    
                    const hour = pt.time!.getHours();
                    
                    const temp = convertTemp(data.hourly.temperature_2m[hour], settings.tempUnit);
                    const wind = convertWind(data.hourly.wind_speed_10m[hour], settings.windUnit);
                    const rain = convertPrecip(data.hourly.precipitation[hour], settings.precipUnit);
                    const windDir = data.hourly.wind_direction_10m[hour] || 0;
                    const sun = data.hourly.sunshine_duration ? (data.hourly.sunshine_duration[hour] / 60) : 0; // minutes

                    windDirs.push(windDir);

                    weatherDataPoints.push({
                        time: pt.time!.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                        dist: parseFloat(pt.distFromStart.toFixed(1)),
                        ele: Math.round(pt.ele),
                        temp,
                        rain,
                        wind,
                        windDir,
                        sun,
                        lat: pt.lat,
                        lon: pt.lon
                    });
                } catch (e) {
                    console.error("Weather fetch failed for point", i, e);
                }
            }

            setChartData(weatherDataPoints);

            // Calculate Avg Wind Direction (Vector Math)
            let avgDir = 0;
            if (windDirs.length > 0) {
                let sinSum = 0;
                let cosSum = 0;
                windDirs.forEach(d => {
                    sinSum += Math.sin(d * Math.PI / 180);
                    cosSum += Math.cos(d * Math.PI / 180);
                });
                avgDir = (Math.atan2(sinSum, cosSum) * 180 / Math.PI + 360) % 360;
            }
            
            const avgTemp = weatherDataPoints.reduce((sum, p) => sum + p.temp, 0) / weatherDataPoints.length;
            const maxWind = Math.max(...weatherDataPoints.map(p => p.wind));
            const totalRain = weatherDataPoints.reduce((sum, p) => sum + p.rain, 0);

            setRideData({
                id: '1',
                name: file.name.replace('.gpx', ''),
                date: startTime.toLocaleDateString(),
                startTimeStr: startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                endTimeStr: endTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                distance: parseFloat(totalDist.toFixed(1)),
                time: `${Math.floor(durationHrs)}h ${Math.round((durationHrs % 1) * 60)}m`,
                elevation: Math.round(gain),
                avgSpeed: parseFloat((totalDist / durationHrs).toFixed(1)),
                mapUrl: '',
                weather: {
                    temp: Math.round(avgTemp),
                    wind: Math.round(maxWind),
                    precip: parseFloat(totalRain.toFixed(1))
                },
                avgWindDir: Math.round(avgDir),
                avgWindText: getWindCardinal(avgDir)
            });

        } catch (e) {
            console.error(e);
            setError(t('file_error'));
        } finally {
            setLoading(false);
        }
    };
    reader.readAsText(file);
  };

  return (
    <div className={`flex flex-col min-h-screen bg-background-dark text-slate-800 dark:text-white transition-colors duration-300 ${isFullScreenMap ? 'fixed inset-0 z-[100]' : 'pb-24 overflow-y-auto'}`}>
      
      {/* Header - Only visible when NOT full screen */}
      {!isFullScreenMap && (
        <div className="flex items-center p-4 pt-8 sticky top-0 bg-white/95 dark:bg-[#101d22]/95 backdrop-blur z-20 border-b border-slate-200 dark:border-white/5 transition-colors">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 mr-2">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-lg font-bold">Strava {t('weather_analysis')}</h1>
        </div>
      )}

      {/* Main Content */}
      <div className={`flex-grow flex flex-col ${isFullScreenMap ? 'h-full' : 'p-4 gap-6'}`}>
        
        {/* Upload State */}
        {!rideData && !loading && (
            <div className="flex flex-col items-center justify-center py-20 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-strava/10 p-6 rounded-full mb-6">
                    <Icon name="directions_bike" className="text-6xl text-strava" />
                </div>
                <h2 className="text-2xl font-bold mb-2">{t('connect_ride')}</h2>
                <p className="text-center opacity-60 max-w-xs mb-8">
                    {t('upload_gpx')}
                </p>
                
                <label className="bg-strava hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-full cursor-pointer shadow-lg hover:scale-105 transition-all flex items-center gap-2">
                    <Icon name="upload_file" />
                    {t('select_gpx')}
                    <input type="file" accept=".gpx" onChange={handleFileUpload} className="hidden" />
                </label>
                {error && <p className="text-red-500 mt-4 font-medium bg-red-50 dark:bg-red-500/10 px-4 py-2 rounded-lg">{error}</p>}
            </div>
        )}

        {/* Loading State */}
        {loading && (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin h-12 w-12 border-4 border-strava border-t-transparent rounded-full mb-4"></div>
                <p className="text-lg font-bold animate-pulse">{loadingStep}</p>
            </div>
        )}

        {/* Results Dashboard */}
        {rideData && (
            <>
                {/* 1. Map Container - Responsive & Full Screen Capable */}
                <div className={`relative bg-white dark:bg-card-dark rounded-2xl overflow-hidden border border-slate-200 dark:border-white/5 shadow-sm transition-all duration-300 ${isFullScreenMap ? 'h-full rounded-none border-none' : ''}`}>
                   
                   {/* Full Screen Toggle Button - Always visible on map */}
                   <button 
                        onClick={() => setIsFullScreenMap(!isFullScreenMap)}
                        className="absolute top-4 left-4 z-[1001] bg-white dark:bg-[#1e293b] text-slate-800 dark:text-white p-2 rounded-lg shadow-md border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                        title={isFullScreenMap ? t('close_full_screen') : t('full_screen')}
                   >
                        <Icon name={isFullScreenMap ? "close_fullscreen" : "open_in_full"} />
                   </button>

                    {/* Legend - Only on Map */}
                    <div className="absolute top-4 left-16 z-[1001] bg-white/90 dark:bg-[#1e293b]/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 dark:border-white/10 text-xs font-medium flex items-center gap-2">
                        <span className="size-2 rounded-full bg-[#10b981]"></span> Start
                        <span className="size-2 rounded-full bg-[#ef4444]"></span> End
                        {!isRouteOnly && <span className="ml-2 flex items-center gap-1 opacity-60"><Icon name="cloud" className="text-[10px]" /> {t('map_data_msg')}</span>}
                    </div>

                    {/* The Leaflet Map Div */}
                    <div ref={mapContainerRef} className="w-full h-full" style={{ height: isFullScreenMap ? '100%' : '500px', minHeight: '500px' }} />
                </div>
                
                {/* Spacer to prevent layout jump when map goes fixed */}
                {isFullScreenMap && <div style={{ height: '500px' }} className="w-full bg-transparent" />}

                {/* 2. Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <p className="text-xs opacity-50 uppercase font-bold">{t('distance')}</p>
                        <p className="text-xl font-bold">{rideData.distance} km</p>
                    </div>
                    <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <p className="text-xs opacity-50 uppercase font-bold">{t('time')}</p>
                        <p className="text-xl font-bold">{rideData.time}</p>
                    </div>
                    <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <p className="text-xs opacity-50 uppercase font-bold">{t('elevation')}</p>
                        <p className="text-xl font-bold">{rideData.elevation} m</p>
                    </div>
                    <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <p className="text-xs opacity-50 uppercase font-bold">{t('avg_speed')}</p>
                        <p className="text-xl font-bold">{rideData.avgSpeed} km/h</p>
                    </div>
                     {!isRouteOnly && (
                        <>
                             <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                                <p className="text-xs opacity-50 uppercase font-bold">{t('start_time')}</p>
                                <p className="text-lg font-bold">{rideData.startTimeStr}</p>
                            </div>
                            <div className="bg-white dark:bg-card-dark p-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                                <p className="text-xs opacity-50 uppercase font-bold">{t('end_time')}</p>
                                <p className="text-lg font-bold">{rideData.endTimeStr}</p>
                            </div>
                        </>
                    )}
                </div>
                
                {!isRouteOnly && (
                <>
                {/* 3. Weather Stats */}
                <h3 className="text-sm font-bold uppercase opacity-50 mt-2">{t('during_ride')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                     <div className="bg-blue-50 dark:bg-blue-500/10 p-3 rounded-2xl border border-blue-100 dark:border-blue-500/20 shadow-sm flex items-center gap-3">
                        <div className="bg-white dark:bg-white/10 p-2 rounded-full text-blue-500"><Icon name="thermostat" /></div>
                        <div>
                            <p className="text-xs opacity-50 uppercase font-bold">{t('avg_temp')}</p>
                            <p className="text-xl font-bold text-blue-600 dark:text-blue-100">{rideData.weather.temp}°</p>
                        </div>
                    </div>
                     <div className="bg-green-50 dark:bg-green-500/10 p-3 rounded-2xl border border-green-100 dark:border-green-500/20 shadow-sm flex items-center gap-3">
                        <div className="bg-white dark:bg-white/10 p-2 rounded-full text-green-500"><Icon name="air" /></div>
                        <div>
                            <p className="text-xs opacity-50 uppercase font-bold">{t('max_wind')}</p>
                            <p className="text-xl font-bold text-green-600 dark:text-green-100">{rideData.weather.wind} <span className="text-xs">{settings.windUnit}</span></p>
                        </div>
                    </div>
                     <div className="bg-indigo-50 dark:bg-indigo-500/10 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 shadow-sm flex items-center gap-3">
                        <div className="bg-white dark:bg-white/10 p-2 rounded-full text-indigo-500"><Icon name="explore" /></div>
                        <div>
                             <p className="text-xs opacity-50 uppercase font-bold">{t('wind_dir')}</p>
                             <div className="flex items-center gap-2">
                                <span className="text-xl font-bold text-indigo-600 dark:text-indigo-100">{rideData.avgWindText}</span>
                                <div style={{ transform: `rotate(${rideData.avgWindDir}deg)` }}>
                                    <Icon name="arrow_upward" className="text-sm" />
                                </div>
                             </div>
                        </div>
                    </div>
                    {rideData.weather.precip > 0 && (
                        <div className="bg-cyan-50 dark:bg-cyan-500/10 p-3 rounded-2xl border border-cyan-100 dark:border-cyan-500/20 shadow-sm flex items-center gap-3">
                            <div className="bg-white dark:bg-white/10 p-2 rounded-full text-cyan-500"><Icon name="rainy" /></div>
                            <div>
                                <p className="text-xs opacity-50 uppercase font-bold">{t('total_rain')}</p>
                                <p className="text-xl font-bold text-cyan-600 dark:text-cyan-100">{rideData.weather.precip} <span className="text-xs">{settings.precipUnit}</span></p>
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. Interactive Chart */}
                <div className="bg-white dark:bg-card-dark rounded-2xl p-4 border border-slate-200 dark:border-white/5 shadow-sm">
                    <h3 className="font-bold mb-4 flex items-center gap-2">
                        <Icon name="insights" className="text-strava" /> Analysis
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="eleGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.1)" />
                                <XAxis dataKey="dist" type="number" unit="km" tick={{fontSize: 10, fill: '#888'}} />
                                <YAxis yAxisId="left" orientation="left" tick={{fontSize: 10, fill: '#888'}} />
                                <YAxis yAxisId="right" orientation="right" tick={{fontSize: 10, fill: '#888'}} />
                                
                                <Tooltip 
                                    contentStyle={{ backgroundColor: settings.theme === 'dark' ? '#1d2b32' : 'white', borderRadius: '12px', border: '1px solid rgba(128,128,128,0.1)', fontSize: '12px' }}
                                    formatter={(value: any, name: string, props: any) => {
                                        if (name === 'Wind') return [`${value} ${settings.windUnit} (${getWindCardinal(props.payload.windDir)})`, name];
                                        return [value, name];
                                    }}
                                    labelFormatter={(label) => `Km ${label}`}
                                />
                                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />

                                {/* Elevation Area */}
                                <Area yAxisId="left" type="monotone" dataKey="ele" name={t('elevation')} fill="url(#eleGradient)" stroke="#8884d8" strokeWidth={1} />
                                
                                {/* Rain Bars */}
                                <Bar yAxisId="right" dataKey="rain" name={t('rain')} fill="#3b82f6" barSize={20} opacity={0.6} />

                                {/* Sun Bars */}
                                <Bar yAxisId="right" dataKey="sun" name={t('sunshine')} fill="#facc15" barSize={20} opacity={0.4} />

                                {/* Temperature Line */}
                                <Line yAxisId="right" type="monotone" dataKey="temp" name={t('temp')} stroke="#13b6ec" strokeWidth={3} dot={false} />

                                {/* Wind Line with Arrows */}
                                <Line 
                                    yAxisId="right" 
                                    type="monotone" 
                                    dataKey="wind" 
                                    name={t('wind')} 
                                    stroke="#22c55e" 
                                    strokeWidth={2} 
                                    dot={<CustomWindArrow />} 
                                />

                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                </>
                )}

                <button 
                    onClick={() => { setRideData(null); setChartData([]); setRouteCoordinates([]); }}
                    className="w-full py-4 rounded-xl border border-dashed border-slate-300 dark:border-white/20 text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white hover:border-slate-400 transition-colors font-medium flex items-center justify-center gap-2"
                >
                    <Icon name="add_circle" /> {t('new_upload')}
                </button>
            </>
        )}
      </div>
    </div>
  );
};
