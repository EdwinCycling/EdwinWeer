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
import { useThemeColors } from '../hooks/useThemeColors';

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
    const colors = useThemeColors();
    const t = (key: string) => getTranslation(key, settings.language);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const locationMarkersRef = useRef<any>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
    const [locationNames, setLocationNames] = useState<Record<number, string>>({});
    const [toast, setToast] = useState<string | null>(null);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

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
                        time: pointTime.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
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
                html: `<div style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; background-color: ${colors.bgCard}; border: 2px solid ${colors.accentPrimary}; border-radius: 50%; font-size: 12px; font-weight: bold; color: ${colors.textMain}; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${num}</div>`,
                className: 'location-marker-icon',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            
            L.marker([pt.lat, pt.lon], { icon }).addTo(layer);
        });
    }, [locationNames, routePoints, colors]);

    const handleShare = async () => {
        if (!contentRef.current) return;
        try {
            const blob = await toPng(contentRef.current, { 
                cacheBust: true, 
                backgroundColor: colors.bgPage
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
                backgroundColor: colors.bgPage
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
        setToast(t('trip_planner.generating_pdf'));
        setIsGeneratingPDF(true);
        
        try {
            // Wait for state change and re-render
            await new Promise(r => setTimeout(r, 100));

            const element = contentRef.current;
            const mapContainer = mapContainerRef.current?.parentElement;
            const originalMapHeight = mapContainer?.style.height;
            const originalWidth = element.style.width;
            const originalHeight = element.style.height;
            const originalOverflow = element.style.overflow;
            const originalMaxHeight = element.style.maxHeight;
            const L = (window as any).L;

            // Force a standard width for A4 consistency
            element.style.width = '800px';
            element.style.height = 'auto';
            element.style.overflow = 'visible';
            element.style.maxHeight = 'none';

            // Hide controls for a cleaner PDF
            const controls = element.querySelectorAll('.leaflet-control-container');
            controls.forEach((c: any) => (c as HTMLElement).style.display = 'none');

            // Increase map height for PDF
            if (mapContainer && mapInstanceRef.current && L) {
                mapContainer.style.height = '500px';
                mapInstanceRef.current.invalidateSize();
                
                const latLngs = gpxRoute.map(p => [p.lat, p.lon]);
                const polyline = L.polyline(latLngs);
                mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [40, 40] });
            }

            // Wait for map and layout to stabilize
            await new Promise(r => setTimeout(r, 1500));
            
            const dataUrl = await toPng(element, { 
                cacheBust: true, 
                backgroundColor: colors.bgPage,
                pixelRatio: 2,
                style: {
                    borderRadius: '0',
                    boxShadow: 'none',
                    height: 'auto',
                    overflow: 'visible'
                }
            });

            // Create PDF in A4 Portrait
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgProps = new Image();
            imgProps.src = dataUrl;
            await new Promise(r => imgProps.onload = r);

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            // Header height in mm
            const headerHeight = 30;
            
            // Add Header Background
            pdf.setFillColor(colors.bgPage);
            pdf.rect(0, 0, pdfWidth, headerHeight, 'F');
            
            // Add Title
            pdf.setFontSize(20);
            pdf.setTextColor(colors.textMain);
            pdf.text('Baro Ritplanner', 10, 15);
            
            pdf.setFontSize(10);
            pdf.setTextColor(colors.textMuted);
            pdf.text(`${tripOption.day === 'today' ? t('today') : t('tomorrow')} • ${tripOption.startTime} - ${tripOption.endTime}`, 10, 22);
            pdf.text(`${gpxName || t('trip_planner.location')}`, 10, 27);

            // Add QR Code (Google Maps Route)
            try {
                if (gpxRoute && gpxRoute.length > 0) {
                    const start = gpxRoute[0];
                    const end = gpxRoute[gpxRoute.length - 1];
                    
                    // Select up to 8 intermediate waypoints to stay within Google Maps URL limits
                    const waypoints: string[] = [];
                    if (gpxRoute.length > 2) {
                        const step = Math.floor((gpxRoute.length - 2) / 8) || 1;
                        for (let i = step; i < gpxRoute.length - 1; i += step) {
                            if (waypoints.length < 8) {
                                waypoints.push(`${gpxRoute[i].lat},${gpxRoute[i].lon}`);
                            }
                        }
                    }

                    const origin = `${start.lat},${start.lon}`;
                    const destination = `${end.lat},${end.lon}`;
                    const waypointsStr = waypoints.length > 0 ? `&waypoints=${waypoints.join('|')}` : '';
                    
                    // Use travelmode=bicycling as default for a ritplanner
                    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsStr}&travelmode=bicycling`;
                    // Use a higher margin and white background for the QR code
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mapsUrl)}&bgcolor=ffffff&color=000000&margin=2`;
                    
                    const qrImg = new Image();
                    qrImg.crossOrigin = "Anonymous";
                    qrImg.src = qrUrl;
                    await new Promise((resolve, reject) => {
                        qrImg.onload = resolve;
                        qrImg.onerror = reject;
                        setTimeout(resolve, 2500); // Slightly longer timeout
                    });
                    
                    if (qrImg.complete && qrImg.naturalWidth > 0) {
                        // Draw white background for QR code to ensure scannability even on dark themes
                        pdf.setFillColor(255, 255, 255);
                        pdf.roundedRect(pdfWidth - 37, 3, 29, 29, 2, 2, 'F');
                        pdf.addImage(qrImg, 'PNG', pdfWidth - 35, 5, 25, 25);
                        pdf.setFontSize(7);
                        pdf.setTextColor(0, 0, 0); // Force black text for the QR label
                        pdf.text('Scan voor de route', pdfWidth - 35, 33);
                    }
                }
            } catch (e) {
                console.error('QR error', e);
            }

            // Calculate image dimensions to fit A4
            const imgWidth = pdfWidth;
            const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
            
            // Handle multiple pages
            let heightLeft = imgHeight;
            let position = 0;
            
            // First page content (starts after header)
            pdf.addImage(dataUrl, 'PNG', 0, headerHeight, imgWidth, imgHeight);
            heightLeft -= (pdfHeight - headerHeight);
            
            // Additional pages if needed
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                // Fill background of new page
                pdf.setFillColor(colors.bgPage);
                pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
                pdf.addImage(dataUrl, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
            }
            
            // Restore styles
            element.style.width = originalWidth;
            element.style.height = originalHeight;
            element.style.overflow = originalOverflow;
            element.style.maxHeight = originalMaxHeight;
            controls.forEach((c: any) => (c as HTMLElement).style.display = '');
            setIsGeneratingPDF(false);
            
            if (mapContainer && mapInstanceRef.current && L) {
                mapContainer.style.height = originalMapHeight || '';
                mapInstanceRef.current.invalidateSize();
                const latLngs = gpxRoute.map(p => [p.lat, p.lon]);
                const polyline = L.polyline(latLngs);
                mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [20, 20] });
            }

            pdf.save(`baro-ritplanner-${new Date().toISOString().split('T')[0]}.pdf`);
            setToast(t('trip_planner.pdf_ready'));
        } catch (e) {
            console.error(e);
            setIsGeneratingPDF(false);
            setToast(t('trip_planner.pdf_error'));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[3000] flex flex-col bg-bg-page/30 backdrop-blur-md animate-in fade-in duration-200 max-h-screen">
            {toast && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] bg-bg-card text-text-main border border-border-color px-4 py-2 rounded-full shadow-lg text-sm font-bold animate-in fade-in slide-in-from-top-4">
                    {toast}
                </div>
            )}
            <div className="bg-bg-card border-b border-border-color p-4 flex items-center justify-between shadow-md z-20 shrink-0">
                <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-text-muted">
                        <span>{tripOption.day === 'today' ? t('today') : t('tomorrow')}</span>
                        <span>•</span>
                        <span>{tripOption.startTime} - {tripOption.endTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-xl font-bold ${tripOption.score >= 8 ? 'text-green-600 dark:text-green-400' : tripOption.score >= 6 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                            {tripOption.score}/10
                        </span>
                        <span className="text-lg font-bold text-text-main truncate max-w-[200px]">
                            {gpxName || t('trip_planner.location')}
                        </span>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-bg-page rounded-full transition-colors text-text-main">
                    <Icon name="close" className="text-2xl" />
                </button>
            </div>

            <div ref={contentRef} className="flex-1 overflow-y-auto bg-bg-page p-4 space-y-6 min-h-0">
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-bg-card p-3 rounded-xl border border-border-color shadow-sm">
                        <div className="text-xs text-text-muted uppercase font-bold">{t('temp')}</div>
                        <div className="text-lg font-bold text-text-main">{Math.round(tripOption.avgTemp)}°</div>
                    </div>
                    <div className="bg-bg-card p-3 rounded-xl border border-border-color shadow-sm">
                        <div className="text-xs text-text-muted uppercase font-bold">{t('wind')}</div>
                        <div className="text-lg font-bold text-text-main">
                            {convertWind(tripOption.maxWind, settings.windUnit || 'kmh')} <span className="text-xs">{settings.windUnit || 'km/h'}</span>
                        </div>
                    </div>
                    <div className="bg-bg-card p-3 rounded-xl border border-border-color shadow-sm">
                        <div className="text-xs text-text-muted uppercase font-bold">{t('rain')}</div>
                        <div className="text-lg font-bold text-text-main">{tripOption.maxRain}%</div>
                    </div>
                    <div className="bg-bg-card p-3 rounded-xl border border-border-color shadow-sm">
                        <div className="text-xs text-text-muted uppercase font-bold">{t('sun')}</div>
                        <div className="text-lg font-bold text-text-main">{Math.round(tripOption.avgSunChance)}%</div>
                    </div>
                </div>

                <div className="h-80 rounded-2xl overflow-hidden shadow-lg border border-border-color relative z-0">
                     <div ref={mapContainerRef} className="h-full w-full bg-bg-page" />
                </div>

                <div className={`grid ${isGeneratingPDF ? 'grid-cols-2 gap-2' : 'grid-cols-1 lg:grid-cols-2 gap-4'}`}>
                    {[
                        { points: routePoints.slice(0, Math.ceil(routePoints.length / 2)), id: 'left' },
                        { points: routePoints.slice(Math.ceil(routePoints.length / 2)), id: 'right' }
                    ].map((col, colIdx) => (
                        <div key={col.id} className="bg-bg-card rounded-2xl border border-border-color overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-[10px] md:text-xs text-left border-collapse">
                                    <thead className="text-[9px] text-text-muted uppercase bg-bg-page border-b border-border-color">
                                        <tr>
                                            <th className="px-1.5 py-2 font-bold">{t('dist')}</th>
                                            <th className="px-0.5 py-2 text-center font-bold">Dir</th>
                                            <th className="px-0.5 py-2 text-center font-bold">Wnd</th>
                                            <th className="px-0.5 py-2 text-center font-bold">Gst</th>
                                            <th className="px-0.5 py-2 text-center font-bold">Tmp</th>
                                            <th className="px-0.5 py-2 text-center font-bold">Rn</th>
                                            <th className="px-0.5 py-2 text-center font-bold">Sun</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color text-text-main">
                                        {col.points.map((pt, i) => {
                                            const originalIndex = colIdx === 1 ? i + Math.ceil(routePoints.length / 2) : i;
                                            return (
                                                <React.Fragment key={originalIndex}>
                                                    {locationNames[originalIndex] && (
                                                        <tr className="bg-bg-page/50">
                                                            <td colSpan={7} className="px-1.5 py-1 font-bold text-[8px] text-accent-primary uppercase tracking-wider">
                                                                <div className="flex items-center gap-1">
                                                                    <span>📍</span> {locationNames[originalIndex]}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                    <tr className="hover:bg-bg-page/30 transition-colors">
                                                        <td className="px-1.5 py-1.5 font-medium whitespace-nowrap">
                                                            <div className="flex flex-col">
                                                                <span>{pt.dist} km</span>
                                                                <span className="text-[8px] text-text-muted font-normal">{pt.time}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-0.5 py-1.5">
                                                            <div className="flex flex-col items-center gap-0.5">
                                                                <div 
                                                                    className={`px-1 py-0.5 rounded-[3px] text-[7px] font-black leading-none text-white shadow-sm ${
                                                                        pt.relativeWind === 'tail' ? 'bg-green-500' :
                                                                        pt.relativeWind === 'head' ? 'bg-red-500' :
                                                                        'bg-orange-500'
                                                                    }`}
                                                                >
                                                                    {pt.relativeWind === 'tail' ? 'MEE' : pt.relativeWind === 'head' ? 'TEGEN' : 'ZIJ'}
                                                                </div>
                                                                <div style={{ transform: `rotate(${pt.windDir}deg)` }} className="flex items-center justify-center">
                                                                    <Icon name="arrow_upward" className="text-[10px] text-text-main font-bold" />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-0.5 py-1.5 font-bold text-center">
                                                            {convertWind(pt.windSpeed, settings.windUnit || 'kmh')}
                                                        </td>
                                                        <td className="px-0.5 py-1.5 font-bold text-text-muted text-center">
                                                            {convertWind(pt.windGusts, settings.windUnit || 'kmh')}
                                                        </td>
                                                        <td className="px-0.5 py-1.5 text-center">
                                                            {Math.round(pt.temp)}°
                                                        </td>
                                                        <td className="px-0.5 py-1.5 text-center">
                                                            {pt.precip > 0 ? `${pt.precip}%` : '-'}
                                                        </td>
                                                        <td className="px-0.5 py-1.5 text-center">
                                                            {Math.round(pt.sunChance)}%
                                                        </td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>

            </div>

            <div className="p-4 bg-bg-card border-t border-border-color flex gap-3 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] shrink-0">
                <button onClick={handleShare} className="flex-1 bg-bg-page hover:bg-border-color text-text-main py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2">
                    <Icon name="share" /> {t('share')}
                </button>
                <button onClick={handleCopy} className="flex-1 bg-bg-page hover:bg-border-color text-text-main py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2">
                    <Icon name="content_copy" /> {t('copy')}
                </button>
                <button onClick={handlePDF} className="flex-1 bg-gradient-to-r from-primary to-accent-primary hover:opacity-90 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                    <Icon name="picture_as_pdf" /> {t('trip_planner.download_report')}
                </button>
                 <button onClick={onClose} className="w-16 bg-bg-page hover:bg-border-color text-text-main py-3 rounded-xl font-bold transition-colors flex items-center justify-center">
                    <Icon name="close" />
                </button>
            </div>
        </div>
    );
};