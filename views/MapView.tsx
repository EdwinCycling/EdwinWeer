
import React, { useEffect, useRef, useState } from 'react';
import { ViewState, AppSettings } from '../types';
import { Icon } from '../components/Icon';
import { loadCurrentLocation } from '../services/storageService';
import { MAJOR_CITIES, City } from '../services/cityData';
import { convertTemp } from '../services/weatherService';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const MapView: React.FC<Props> = ({ onNavigate, settings }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    
    // Store temps: "lat,lon" -> temp
    const [cityTemps, setCityTemps] = useState<Record<string, number>>({});
    // Store virtual points that don't have names
    const [virtualPoints, setVirtualPoints] = useState<City[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const t = (key: string) => getTranslation(key, settings.language);

    // 1. Initialize Map
    useEffect(() => {
        if (!mapContainerRef.current) return;
        const L = (window as any).L;
        if (!L) return;

        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
        }

        const savedLoc = loadCurrentLocation();
        const map = L.map(mapContainerRef.current, {
            zoomControl: false,
            attributionControl: false
        }).setView([savedLoc.lat, savedLoc.lon], 5);

        mapInstanceRef.current = map;

        const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 20 });
        const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OSM' });
        
        if (settings.theme === 'dark') {
            cartoDark.addTo(map);
        } else {
            osm.addTo(map);
        }

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // Initial load logic
        setTimeout(() => {
            map.invalidateSize();
            // Initial fetch of visible area
            handleMapMove(false);
        }, 500);

        map.on('moveend', () => handleMapMove(false));

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.off('moveend');
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [settings.theme]); 

    // 2. Handle Map Move & Fetch Weather
    const handleMapMove = async (forceRefresh = false) => {
        if (!mapInstanceRef.current) return;
        const map = mapInstanceRef.current;
        const bounds = map.getBounds();
        
        // Helper to check if a city is currently visible
        const isVisible = (c: City) => bounds.contains([c.lat, c.lon]);

        // Logic for Refreshing
        let pointsToFetch: City[] = [];
        let newVirtualPoints: City[] = [];

        if (forceRefresh) {
            // A. Keep Favorites that are visible 
            const nextCityTemps: Record<string, number> = {};
            
            // Preserve Favorite Data
            settings.favorites.forEach(fav => {
                const key = `${fav.lat},${fav.lon}`;
                if (cityTemps[key] !== undefined) {
                    nextCityTemps[key] = cityTemps[key];
                }
            });
            
            setCityTemps(nextCityTemps);

            // B. Find visible favorites to re-fetch
            const visibleFavorites = settings.favorites.filter(isVisible);

            // C. Find other visible major cities
            const visibleOthers = MAJOR_CITIES.filter(c => 
                isVisible(c) && !visibleFavorites.some(f => f.name === c.name)
            );

            // D. Select randomly distributed cities
            const shuffledOthers = visibleOthers.sort(() => 0.5 - Math.random()).slice(0, 15);
            const visibleNamedCities = [...visibleFavorites, ...shuffledOthers];

            // E. GRID GENERATION (The Fix for "City Not Found")
            // Create a 4x4 grid over the view to ensure coverage
            const latMin = bounds.getSouth();
            const latMax = bounds.getNorth();
            const lonMin = bounds.getWest();
            const lonMax = bounds.getEast();
            
            const latStep = (latMax - latMin) / 4;
            const lonStep = (lonMax - lonMin) / 4;

            for (let x = 0; x < 4; x++) {
                for (let y = 0; y < 4; y++) {
                    const cellCenterLat = latMin + (latStep * y) + (latStep / 2);
                    const cellCenterLon = lonMin + (lonStep * x) + (lonStep / 2);
                    
                    // Check if we already have a named city nearby in this cell
                    const hasNearbyCity = visibleNamedCities.some(c => 
                        Math.abs(c.lat - cellCenterLat) < latStep/2 && 
                        Math.abs(c.lon - cellCenterLon) < lonStep/2
                    );

                    if (!hasNearbyCity) {
                        // Create a virtual point
                        newVirtualPoints.push({
                            name: '', // Empty name signals a coordinate-only point
                            lat: parseFloat(cellCenterLat.toFixed(4)),
                            lon: parseFloat(cellCenterLon.toFixed(4))
                        });
                    }
                }
            }
            
            setVirtualPoints(newVirtualPoints);
            pointsToFetch = [...visibleNamedCities, ...newVirtualPoints];

        } else {
            // Standard Pan/Zoom: Fetch what's missing
            const visibleCities = MAJOR_CITIES.filter(isVisible);
            const visibleFavs = settings.favorites.filter(isVisible);
            const combined = [...visibleCities, ...visibleFavs];
            
            // Filter out those we already have data for
            pointsToFetch = combined.filter(c => cityTemps[`${c.lat},${c.lon}`] === undefined);
            
            // Throttle auto-fetch
            if (pointsToFetch.length > 5) {
                 pointsToFetch = pointsToFetch.sort(() => 0.5 - Math.random()).slice(0, 5);
            }
        }

        if (pointsToFetch.length > 0) {
            setIsLoading(true);
            setStatusMessage(forceRefresh ? t('map.updated') : `${t('loading')}...`);
            
            try {
                // Chunk requests (max 20 per call)
                const chunkSize = 20;
                const incomingTemps: Record<string, number> = {};
                
                for (let i = 0; i < pointsToFetch.length; i += chunkSize) {
                    const chunk = pointsToFetch.slice(i, i + chunkSize);
                    const lats = chunk.map(c => c.lat).join(',');
                    const lons = chunk.map(c => c.lon).join(',');

                    try {
                        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m`);
                        const data = await response.json();

                        if (!data || data.error) continue;

                        if (Array.isArray(data)) {
                            data.forEach((locData: any, idx: number) => {
                                if (locData?.current?.temperature_2m !== undefined) {
                                    const pt = chunk[idx];
                                    incomingTemps[`${pt.lat},${pt.lon}`] = locData.current.temperature_2m;
                                }
                            });
                        } else if (data?.current?.temperature_2m !== undefined) {
                            const pt = chunk[0];
                            incomingTemps[`${pt.lat},${pt.lon}`] = data.current.temperature_2m;
                        }
                    } catch (err) {
                        console.warn("Chunk fetch failed", err);
                    }
                }
                
                setCityTemps(prev => ({
                    ...prev,
                    ...incomingTemps
                }));
                
                setLastUpdated(new Date());
                setStatusMessage('');

            } catch (e) {
                console.error("Failed to fetch map weather", e);
                setStatusMessage('Error');
            } finally {
                setIsLoading(false);
            }
        } else {
            setStatusMessage('');
            setIsLoading(false);
        }
    };

    const refreshMap = () => {
        if (isLoading) return;
        handleMapMove(true);
    };

    // 3. Update Markers
    useEffect(() => {
        if (!mapInstanceRef.current) return;
        const L = (window as any).L;
        const map = mapInstanceRef.current;

        // Clear existing markers
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        // Combine all possible points
        const pointsToRender = new Map<string, City>();
        
        // 1. Favorites
        settings.favorites.forEach(f => pointsToRender.set(`${f.lat},${f.lon}`, f));
        
        // 2. Visible Major Cities (if we have data)
        MAJOR_CITIES.forEach(c => {
             const key = `${c.lat},${c.lon}`;
             if (cityTemps[key] !== undefined) {
                 pointsToRender.set(key, c);
             }
        });

        // 3. Virtual Grid Points
        virtualPoints.forEach(p => {
            const key = `${p.lat},${p.lon}`;
             if (cityTemps[key] !== undefined) {
                 pointsToRender.set(key, p);
             }
        });

        const getMarkerColor = (t: number) => {
            if (t < -20) return '#312e81'; 
            if (t < -15) return '#4338ca'; 
            if (t < -10) return '#1e40af'; 
            if (t < -5)  return '#3b82f6'; 
            if (t < 0)   return '#60a5fa'; 
            if (t < 5)   return '#06b6d4'; 
            if (t < 10)  return '#10b981'; 
            if (t < 15)  return '#84cc16'; 
            if (t < 20)  return '#facc15'; 
            if (t < 25)  return '#fb923c'; 
            if (t < 30)  return '#f97316'; 
            if (t < 35)  return '#ef4444'; 
            if (t < 40)  return '#b91c1c'; 
            return '#7f1d1d'; 
        };

        pointsToRender.forEach(point => {
            const key = `${point.lat},${point.lon}`;
            const temp = cityTemps[key];
            
            if (temp !== undefined) {
                const colorClass = getMarkerColor(temp);
                const displayTemp = convertTemp(temp, settings.tempUnit);
                const isFav = settings.favorites.some(f => f.name === point.name);
                const isVirtual = !point.name; // Check if it's a grid point
                
                let iconHtml = '';

                if (isVirtual) {
                    // Small circular bubble for grid points
                    iconHtml = `
                        <div style="
                            background: ${settings.theme === 'dark' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)'}; 
                            width: 32px; height: 32px;
                            border-radius: 50%;
                            border: 2px solid ${colorClass};
                            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                            display: flex; align-items: center; justify-content: center;
                            transform: translate(-50%, -50%);
                        ">
                            <div style="font-size: 11px; font-weight: 800; color: ${colorClass};">${Math.round(displayTemp)}°</div>
                        </div>
                    `;
                } else {
                    // Standard named badge
                    iconHtml = `
                        <div style="
                            background: ${settings.theme === 'dark' ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)'}; 
                            padding: 6px 10px; 
                            border-radius: 12px; 
                            border: 2px solid ${isFav ? '#ffffff' : colorClass}; 
                            box-shadow: 0 4px 10px rgba(0,0,0,0.3); 
                            display: flex; flex-direction: column; align-items: center;
                            min-width: 60px; transform: translateY(-50%);
                            z-index: ${isFav ? 100 : 10};
                            ${isFav ? `outline: 3px solid ${colorClass};` : ''}
                        ">
                            <div style="font-size: 16px; font-weight: 800; color: ${colorClass}; line-height: 1; margin-bottom: 2px;">${Math.round(displayTemp)}°</div>
                            <div style="font-size: 10px; font-weight: 600; color: ${settings.theme === 'dark' ? '#ccc' : '#444'}; white-space: nowrap;">${point.name}</div>
                        </div>
                    `;
                }

                const icon = L.divIcon({
                    html: iconHtml,
                    className: '', 
                    iconSize: isVirtual ? [32, 32] : [60, 45],
                    iconAnchor: isVirtual ? [16, 16] : [30, 45]
                });

                const marker = L.marker([point.lat, point.lon], { icon, zIndexOffset: isFav ? 1000 : (isVirtual ? 0 : 500) }).addTo(map);
                markersRef.current.push(marker);
            }
        });

    }, [cityTemps, settings.tempUnit, settings.theme, settings.favorites, virtualPoints]);

    return (
        <div className="flex flex-col h-screen w-full bg-background-dark text-slate-800 dark:text-white transition-colors duration-300 fixed inset-0 z-[10]">
            
            {/* Floating Header */}
            <div className="absolute top-0 left-0 right-0 p-4 pt-8 z-[1001] pointer-events-none flex justify-center">
                <div className="bg-white/90 dark:bg-[#101d22]/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-slate-200 dark:border-white/10 pointer-events-auto flex items-center gap-4 transition-all animate-in slide-in-from-top-4">
                     
                     <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-slate-600 dark:text-white">
                        <Icon name="arrow_back" />
                    </button>
                    
                    <div className="flex flex-col items-center">
                        <span className="font-bold text-sm leading-tight tracking-wide">{t('map.global_weather')}</span>
                        <div className="flex items-center gap-2 h-3">
                            {lastUpdated && !statusMessage && (
                                <span className="text-[10px] opacity-60 font-medium leading-none animate-in fade-in">
                                    {t('map.updated')}: {lastUpdated.toLocaleDateString(settings.language==='nl'?'nl-NL':'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}
                                </span>
                            )}
                            {statusMessage && (
                                <span className="text-[10px] text-primary font-bold animate-pulse leading-none">{statusMessage}</span>
                            )}
                        </div>
                    </div>
                    
                    <button 
                        onClick={refreshMap} 
                        disabled={isLoading}
                        className={`size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-all text-slate-600 dark:text-white ${isLoading ? 'animate-spin opacity-50' : 'hover:scale-110 active:scale-95'}`}
                    >
                         <Icon name="refresh" className={isLoading ? "text-primary" : ""} />
                    </button>
                </div>
            </div>

            {/* Map Container */}
            <div ref={mapContainerRef} className="w-full h-full bg-slate-200 dark:bg-[#0f172a]" />

        </div>
    );
};
