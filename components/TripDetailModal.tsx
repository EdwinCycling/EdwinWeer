import React, { useEffect, useRef, useState } from 'react';
import { TripOption } from '../services/tripPlannerService';
import { GPXPoint, calculateBearing } from '../services/gpxService';
import { AppSettings, OpenMeteoResponse } from '../types';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';
import { convertWind } from '../services/weatherService';
import { reverseGeocode } from '../services/geoService';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import L from 'leaflet';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    tripOption: TripOption;
    gpxRoute: GPXPoint[];
    gpxName?: string;
    settings: AppSettings;
    forecast: OpenMeteoResponse;
    speedKmH: number;
}

interface RoutePoint {
    dist: number;
    time: string;
    lat: number;
    lon: number;
    temp: number;
    windSpeed: number;
    windGusts: number;
    windDir: number;
    precip: number;
    sunChance: number;
    bearing: number;
    relativeWind: 'head' | 'tail' | 'side';
    relativeWindDeg: number;
}

export const TripDetailModal: React.FC<Props> = ({ isOpen, onClose, tripOption, gpxRoute, gpxName, settings, forecast, speedKmH }) => {
    const t = (key: string) => getTranslation(key, settings.language);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const locationMarkersRef = useRef<any>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
    const [locationNames, setLocationNames] = useState<Record<number, string>>({});
    const [toast, setToast] = useState<string | null>(null);

    // Toast auto-hide
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    useEffect(() => {
        if (!isOpen || !gpxRoute.length || !forecast) return;

        const points: RoutePoint[] = [];
        const startTime = new Date();
        const [startH, startM] = tripOption.startTime.split(':').map(Number);
        startTime.setHours(startH, startM, 0, 0);
        
        if (tripOption.day === 'tomorrow') {
            startTime.setDate(startTime.getDate() + 1);
        }

        const stepKm = 5;
        let nextStep = 0;

        for (let i = 0; i < gpxRoute.length; i++) {
            const pt = gpxRoute[i];
            
            if (pt.distFromStart >= nextStep || i === gpxRoute.length - 1) {
                const hoursFromStart = pt.distFromStart / speedKmH;
                const pointTime = new Date(startTime.getTime() + hoursFromStart * 60 * 60 * 1000);
                
                const closestHour = new Date(pointTime);
                closestHour.setMinutes(0, 0, 0);
                if (pointTime.getMinutes() >= 30) closestHour.setHours(closestHour.getHours() + 1);

                const timeStr = closestHour.toISOString().split(':')[0];
                const hourlyIndex = forecast.hourly.time.findIndex(t => t.startsWith(timeStr));
                
                if (hourlyIndex !== -1) {
                    const temp = forecast.hourly.temperature_2m[hourlyIndex];
                    const windSpeed = forecast.hourly.wind_speed_10m[hourlyIndex];
                    const windGusts = forecast.hourly.wind_gusts_10m ? forecast.hourly.wind_gusts_10m[hourlyIndex] : windSpeed;
                    const windDir = forecast.hourly.wind_direction_10m[hourlyIndex];
                    const precip = forecast.hourly.precipitation_probability[hourlyIndex];
                    const sunDuration = forecast.hourly.sunshine_duration ? forecast.hourly.sunshine_duration[hourlyIndex] : 0;
                    const sunChance = Math.min(100, (sunDuration / 3600) * 100);
                    
                    let bearing = 0;
                    if (i < gpxRoute.length - 10) {
                         bearing = calculateBearing(pt.lat, pt.lon, gpxRoute[i+10].lat, gpxRoute[i+10].lon);
                    } else if (i > 0) {
                         bearing = calculateBearing(gpxRoute[i-1].lat, gpxRoute[i-1].lon, pt.lat, pt.lon);
                    }

                    let diff = Math.abs(bearing - windDir);
                    if (diff > 180) diff = 360 - diff;
                    
                    let relativeWind: 'head' | 'tail' | 'side' = 'side';
                    if (diff < 45) relativeWind = 'tail';
                    else if (diff > 135) relativeWind = 'head';

                    points.push({
                        dist: Math.round(pt.distFromStart * 10) / 10,
                        time: pointTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        lat: pt.lat,
                        lon: pt.lon,
                        temp,
                        windSpeed,
                        windGusts,
                        windDir,
                        precip,
                        sunChance,
                        bearing,
                        relativeWind,
                        relativeWindDeg: diff
                    });

                    nextStep += stepKm;
                    
                     if (points.length > 1 && points[points.length-1].dist === points[points.length-2].dist) {
                         points.pop();
                     }
                }
            }
        }
        setRoutePoints(points);

    }, [isOpen, gpxRoute, tripOption, speedKmH]);

    useEffect(() => {
        if (!isOpen || !routePoints.length) return;
        
        let cancelled = false;

        const fetchLocations = async () => {
            // Reset names if route changes significantly (simple check)
            // Ideally we'd clear setLocationNames({}) when routePoints changes, but we can do it here
            // setLocationNames({}); // Wait, this might cause flicker. Let's just add to it.
            
            // Identify points to fetch (Start, End, and every ~20km)
            const indicesToFetch: number[] = [];
            if (routePoints.length > 0) indicesToFetch.push(0);
            
            let lastDist = 0;
            for(let i=1; i<routePoints.length - 1; i++) {
                if (routePoints[i].dist - lastDist >= 15) {
                    indicesToFetch.push(i);
                    lastDist = routePoints[i].dist;
                }
            }
            if (routePoints.length > 1) indicesToFetch.push(routePoints.length - 1);

            // Fetch sequentially with delay to respect rate limits
            for (const i of indicesToFetch) {
                if (cancelled) return;
                // Skip if we already have this one (cache-like) - though index might shift if route changes?
                // For safety, we just fetch.
                await new Promise(r => setTimeout(r, 1100)); // 1.1s delay
                if (cancelled) return;
                
                const name = await reverseGeocode(routePoints[i].lat, routePoints[i].lon);
                if (name && !cancelled) {
                    setLocationNames(prev => ({...prev, [i]: name}));
                }
            }
        };

        // Only run if we don't have names yet or route changed (checked by dependency)
        // To avoid infinite loops or re-runs, we check if we already have names for these indices?
        // Simpler: Just run it. The user won't change route constantly in the modal.
        fetchLocations();

        return () => { cancelled = true; };
    }, [routePoints, isOpen]);

    useEffect(() => {
        if (!isOpen || !mapContainerRef.current || !gpxRoute.length || !routePoints.length) return;
        
        const L = (window as any).L;
        if (!L) return;

        if (mapInstanceRef.current) {
             mapInstanceRef.current.remove();
             mapInstanceRef.current = null;
        }

        const map = L.map(mapContainerRef.current, { zoomControl: true, attributionControl: false });
        mapInstanceRef.current = map;

        const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20 });
        const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
        const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' });

        const baseLayers = {
            "Standaard": osm,
            "Donker": cartoDark,
            "Satelliet": satellite
        };

        if (settings.theme === 'dark') {
            cartoDark.addTo(map);
        } else {
            osm.addTo(map);
        }
        
        L.control.layers(baseLayers).addTo(map);

        const locationLayer = L.layerGroup().addTo(map);
        locationMarkersRef.current = locationLayer;

        const latLngs = gpxRoute.map(p => [p.lat, p.lon]);
        const polyline = L.polyline(latLngs, { color: '#FC4C02', weight: 4 }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [20, 20] });

        L.circleMarker(latLngs[0], { radius: 6, color: 'white', fillColor: '#10b981', fillOpacity: 1 }).addTo(map);
        L.circleMarker(latLngs[latLngs.length - 1], { radius: 6, color: 'white', fillColor: '#ef4444', fillOpacity: 1 }).addTo(map);

        const windMarkerStep = 25;
        let nextWindMarker = windMarkerStep;
        
        for (const pt of routePoints) {
            if (pt.dist >= nextWindMarker) {
                const icon = L.divIcon({
                    html: `<div style="transform: rotate(${pt.windDir}deg); font-size: 24px; text-shadow: 0 0 3px white;">⬇️</div>`,
                    className: 'wind-marker',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });
                L.marker([pt.lat, pt.lon], { icon }).addTo(map);
                nextWindMarker += windMarkerStep;
            }
        }

    }, [isOpen, gpxRoute, settings.theme, routePoints]);

    useEffect(() => {
        if (!mapInstanceRef.current || !locationMarkersRef.current || !routePoints.length) return;
        
        const L = (window as any).L;
        const layer = locationMarkersRef.current;
        layer.clearLayers();

        const sortedIndices = Object.keys(locationNames).map(Number).sort((a, b) => a - b);
        
        sortedIndices.forEach((idx, i) => {
            const pt = routePoints[idx];
            if (!pt) return;
            
            const num = i + 1;
            const icon = L.divIcon({
                html: `<div style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; background-color: white; border: 2px solid #0ea5e9; border-radius: 50%; font-size: 12px; font-weight: bold; color: #1e293b; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${num}</div>`,
                className: 'location-marker-icon',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            
            L.marker([pt.lat, pt.lon], { icon }).addTo(layer);
        });
    }, [locationNames, routePoints]);

    const handleShare = async () => {
        if (!contentRef.current) return;
        try {
            const blob = await toPng(contentRef.current, { 
                cacheBust: true, 
                backgroundColor: settings.theme === 'dark' ? '#0f172a' : '#f8fafc'
            });
            
            if (navigator.share) {
                const file = new File([await (await fetch(blob)).blob()], 'baro-trip.png', { type: 'image/png' });
                await navigator.share({
                    title: 'Baro Trip',
                    files: [file]
                });
            } else {
                const link = document.createElement('a');
                link.download = 'baro-trip.png';
                link.href = blob;
                link.click();
            }
        } catch (e) {
            console.error(e);
            setToast('Fout bij delen');
        }
    };

    const handleCopy = async () => {
        if (!contentRef.current) return;
        try {
            const blob = await toPng(contentRef.current, { 
                cacheBust: true, 
                backgroundColor: settings.theme === 'dark' ? '#0f172a' : '#f8fafc'
            });
            const item = new ClipboardItem({ 'image/png': await (await fetch(blob)).blob() });
            await navigator.clipboard.write([item]);
            setToast(t('copied_to_clipboard') || 'Gekopieerd!');
        } catch (e) {
            console.error(e);
            setToast('Fout bij kopiëren');
        }
    };

    const handlePDF = async () => {
        if (!contentRef.current) return;
        try {
            const dataUrl = await toPng(contentRef.current, { 
                cacheBust: true, 
                backgroundColor: settings.theme === 'dark' ? '#0f172a' : '#f8fafc'
            });
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [contentRef.current.offsetWidth, contentRef.current.offsetHeight]
            });
            pdf.addImage(dataUrl, 'PNG', 0, 0, contentRef.current.offsetWidth, contentRef.current.offsetHeight);
            pdf.save('baro-trip.pdf');
            setToast('PDF Gedownload!');
        } catch (e) {
            console.error(e);
            setToast('Fout bij PDF maken');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex flex-col bg-white/30 dark:bg-black/30 backdrop-blur-md animate-in fade-in duration-200 max-h-screen">
            {toast && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] bg-slate-800 text-white px-4 py-2 rounded-full shadow-lg text-sm font-bold animate-in fade-in slide-in-from-top-4">
                    {toast}
                </div>
            )}
            <div className="bg-white dark:bg-[#101d22] border-b border-slate-200 dark:border-white/5 p-4 flex items-center justify-between shadow-md z-20 shrink-0">
                <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500 dark:text-white/60">
                        <span>{tripOption.day === 'today' ? t('today') : t('tomorrow')}</span>
                        <span>•</span>
                        <span>{tripOption.startTime} - {tripOption.endTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-xl font-bold ${tripOption.score >= 8 ? 'text-green-600 dark:text-green-400' : tripOption.score >= 6 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                            {tripOption.score}/10
                        </span>
                        <span className="text-lg font-bold text-slate-800 dark:text-white truncate max-w-[200px]">
                            {gpxName || t('trip_planner.location')}
                        </span>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors">
                    <Icon name="close" className="text-2xl" />
                </button>
            </div>

            <div ref={contentRef} className="flex-1 overflow-y-auto bg-slate-50 dark:bg-background-dark p-4 space-y-6 min-h-0">
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white dark:bg-white/5 p-3 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="text-xs text-slate-500 dark:text-white/50 uppercase font-bold">{t('temp')}</div>
                        <div className="text-lg font-bold">{Math.round(tripOption.avgTemp)}°</div>
                    </div>
                    <div className="bg-white dark:bg-white/5 p-3 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="text-xs text-slate-500 dark:text-white/50 uppercase font-bold">{t('wind')}</div>
                        <div className="text-lg font-bold">
                            {convertWind(tripOption.maxWind, settings.windUnit || 'kmh')} <span className="text-xs">{settings.windUnit || 'km/h'}</span>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-white/5 p-3 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="text-xs text-slate-500 dark:text-white/50 uppercase font-bold">{t('rain')}</div>
                        <div className="text-lg font-bold">{tripOption.maxRain}%</div>
                    </div>
                    <div className="bg-white dark:bg-white/5 p-3 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="text-xs text-slate-500 dark:text-white/50 uppercase font-bold">{t('sun')}</div>
                        <div className="text-lg font-bold">{Math.round(tripOption.avgSunChance)}%</div>
                    </div>
                </div>

                <div className="h-64 rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-white/5 relative z-0">
                     <div ref={mapContainerRef} className="h-full w-full bg-slate-100 dark:bg-slate-800" />
                </div>

                <div className="bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 dark:text-white/50 uppercase bg-slate-50 dark:bg-white/5">
                                <tr>
                                    <th className="px-4 py-3">{t('dist')} / {t('time')}</th>
                                    <th className="px-4 py-3">{t('wind_direction')}</th>
                                    <th className="px-4 py-3">{t('wind')}</th>
                                    <th className="px-4 py-3">{t('finder.param.wind_gusts')}</th>
                                    <th className="px-4 py-3">{t('temp')}</th>
                                    <th className="px-4 py-3">{t('rain')}</th>
                                    <th className="px-4 py-3">{t('sun')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {routePoints.map((pt, i) => (
                                    <React.Fragment key={i}>
                                        {locationNames[i] && (
                                            <tr className="bg-slate-100 dark:bg-white/10">
                                                <td colSpan={7} className="px-4 py-2 font-bold text-xs text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                                                    <div className="flex items-center flex-wrap gap-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex items-center justify-center w-5 h-5 bg-primary/10 text-primary rounded-full text-[10px] font-bold border border-primary/20">
                                                                {Object.keys(locationNames).map(Number).sort((a,b)=>a-b).indexOf(i) + 1}
                                                            </div>
                                                            <span>📍</span> 
                                                            <span>{locationNames[i]}</span>
                                                            <span className="text-slate-400 dark:text-white/40 font-normal ml-1">
                                                                (± {pt.time})
                                                            </span>
                                                        </div>
                                                        <div className="hidden md:flex items-center gap-3 text-slate-500 dark:text-slate-400 font-normal normal-case border-l border-slate-300 dark:border-white/20 pl-3">
                                                            <div className="flex items-center gap-1"><Icon name="thermostat" className="text-xs" /> {Math.round(pt.temp)}°</div>
                                                            <div className="flex items-center gap-1"><Icon name="air" className="text-xs" /> {convertWind(pt.windSpeed, settings.windUnit || 'kmh')} <span className="text-[10px]">{settings.windUnit || 'km/h'}</span></div>
                                                            <div className="flex items-center gap-1"><Icon name="water_drop" className="text-xs" /> {pt.precip > 0 ? `${pt.precip}%` : '0%'}</div>
                                                            <div className="flex items-center gap-1"><Icon name="wb_sunny" className="text-xs" /> {Math.round(pt.sunChance)}%</div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        <tr className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3 font-medium">
                                                <div>{pt.dist} km</div>
                                                <div className="text-xs text-slate-400 font-normal">{pt.time}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div 
                                                        className={`px-2 py-1 rounded text-xs font-bold ${
                                                            pt.relativeWind === 'tail' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' :
                                                            pt.relativeWind === 'head' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' :
                                                            'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                                                        }`}
                                                    >
                                                        {pt.relativeWind === 'tail' ? t('wind.tail') : pt.relativeWind === 'head' ? t('wind.head') : t('wind.side')}
                                                    </div>
                                                    <div style={{ transform: `rotate(${pt.windDir}deg)` }}>
                                                        <Icon name="arrow_upward" className="text-xs opacity-50" />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-bold">
                                                {convertWind(pt.windSpeed, settings.windUnit || 'kmh')}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">
                                                {(() => {
                                                    const unit = settings.windUnit || 'kmh';
                                                    const val = convertWind(pt.windGusts, unit);
                                                    if (unit === 'bft') {
                                                        const kmh = Math.round(pt.windGusts);
                                                        return <span>{val} <span className="text-[10px] font-normal opacity-70">({kmh} km/h)</span></span>;
                                                    }
                                                    return val;
                                                })()}
                                            </td>
                                            <td className="px-4 py-3">
                                                {Math.round(pt.temp)}°
                                            </td>
                                            <td className="px-4 py-3">
                                                {pt.precip > 0 ? `${pt.precip}%` : '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                {Math.round(pt.sunChance)}%
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            <div className="p-4 bg-white dark:bg-[#101d22] border-t border-slate-200 dark:border-white/5 flex gap-3 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] shrink-0">
                <button onClick={handleShare} className="flex-1 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-800 dark:text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2">
                    <Icon name="share" /> {t('share')}
                </button>
                <button onClick={handleCopy} className="flex-1 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-800 dark:text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2">
                    <Icon name="content_copy" /> {t('copy')}
                </button>
                <button onClick={handlePDF} className="flex-1 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-800 dark:text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2">
                    <Icon name="picture_as_pdf" /> {t('pdf')}
                </button>
                 <button onClick={onClose} className="w-16 bg-slate-800 dark:bg-white text-white dark:text-slate-900 py-3 rounded-xl font-bold transition-colors flex items-center justify-center">
                    <Icon name="close" />
                </button>
            </div>
        </div>
    );
};