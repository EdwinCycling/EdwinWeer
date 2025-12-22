import React, { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, ZoomControl, LayersControl, useMapEvents } from 'react-leaflet';
import { ViewState, AppSettings, MapBaseLayer } from '../types';
import { Icon } from '../components/Icon';
import { loadCurrentLocation } from '../services/storageService';
import { MAJOR_CITIES, City } from '../services/cityData';
import { convertTemp } from '../services/weatherService';
import { getTranslation } from '../services/translations';
import L from 'leaflet';

// Helper for debouncing map moves
const debounce = (func: (...args: any[]) => void, wait: number) => {
    let timeoutId: NodeJS.Timeout | null;
    return (...args: any[]) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), wait);
    };
};

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
}

// Component to handle map events and access map instance
const MapEvents = ({
    onMove,
    setMap,
    selectedBaseLayer,
    onChangeBaseLayer,
}: {
    onMove: (map: L.Map, forceRefresh?: boolean) => void;
    setMap: (map: L.Map) => void;
    selectedBaseLayer: MapBaseLayer;
    onChangeBaseLayer: (next: MapBaseLayer) => void;
}) => {
    const map = useMap();
    
    useEffect(() => {
        setMap(map);
        // Initial fetch
        setTimeout(() => {
            map.invalidateSize();
            onMove(map);
        }, 500);
    }, [map, onMove, setMap]);

    useEffect(() => {
        const handler = (e: any) => {
            const name = String(e?.name || '').toLowerCase();
            const next: MapBaseLayer =
                name.includes('sat') ? 'satellite' :
                name.includes('donker') ? 'dark' :
                name.includes('dark') ? 'dark' :
                'light';
            if (next !== selectedBaseLayer) {
                onChangeBaseLayer(next);
            }
        };
        map.on('baselayerchange', handler);
        return () => {
            map.off('baselayerchange', handler);
        };
    }, [map, onChangeBaseLayer, selectedBaseLayer]);

    useMapEvents({
        moveend: () => onMove(map)
    });

    return null;
};

export const MapView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
    // Store temps: "lat,lon" -> temp
    const [cityTemps, setCityTemps] = useState<Record<string, number>>({});
    // Store virtual points that don't have names
    const [virtualPoints, setVirtualPoints] = useState<City[]>([]);
    const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const t = (key: string) => getTranslation(key, settings.language);

    const selectedBaseLayer: MapBaseLayer = settings.mapBaseLayer ?? (settings.theme === 'dark' ? 'dark' : 'light');

    // 2. Handle Map Move & Fetch Weather
    const fetchMapData = async (map: L.Map, forceRefresh = false) => {
        if (!map) return;
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

    // Use ref to hold the latest version of fetchMapData
    const fetchMapDataRef = useRef(fetchMapData);
    useEffect(() => {
        fetchMapDataRef.current = fetchMapData;
    });

    // Create a stable debounced function
    const debouncedMapMove = useMemo(() => 
        debounce((...args) => {
            if (fetchMapDataRef.current) {
                fetchMapDataRef.current(...args);
            }
        }, 500), 
    []);

    const refreshMap = () => {
        if (isLoading || !mapInstance) return;
        fetchMapData(mapInstance, true);
    };

    // Calculate points to render
    const pointsToRender = useMemo(() => {
        const points: City[] = [];
        const processedKeys = new Set<string>();

        // 1. Favorites
        settings.favorites.forEach(f => {
            const key = `${f.lat},${f.lon}`;
            points.push(f);
            processedKeys.add(key);
        });
        
        // 2. Visible Major Cities (if we have data)
        MAJOR_CITIES.forEach(c => {
             const key = `${c.lat},${c.lon}`;
             if (cityTemps[key] !== undefined && !processedKeys.has(key)) {
                 points.push(c);
                 processedKeys.add(key);
             }
        });

        // 3. Virtual Grid Points
        virtualPoints.forEach(p => {
            const key = `${p.lat},${p.lon}`;
             if (cityTemps[key] !== undefined && !processedKeys.has(key)) {
                 points.push(p);
                 processedKeys.add(key);
             }
        });

        return points;
    }, [cityTemps, settings.favorites, virtualPoints]);

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

    const createIcon = (point: City) => {
        const key = `${point.lat},${point.lon}`;
        const temp = cityTemps[key];
        
        if (temp === undefined) return L.divIcon({ className: '' }); // Should not happen given logic

        const colorClass = getMarkerColor(temp);
        const displayTemp = convertTemp(temp, settings.tempUnit);
        const isFav = settings.favorites.some(f => f.name === point.name);
        const isVirtual = !point.name; 
        
        let iconHtml = '';

        if (isVirtual) {
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

        return L.divIcon({
            html: iconHtml,
            className: '', 
            iconSize: isVirtual ? [32, 32] : [60, 45],
            iconAnchor: isVirtual ? [16, 16] : [30, 45]
        });
    };

    const savedLoc = loadCurrentLocation();

    return (
        <div className="flex flex-col h-screen w-full bg-slate-50 dark:bg-background-dark text-slate-800 dark:text-white transition-colors duration-300 fixed inset-0 z-[10]">
            <style>{`
                .map-safe-controls .leaflet-bottom {
                    bottom: 96px;
                }
            `}</style>
            
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
            <MapContainer 
                center={[savedLoc.lat, savedLoc.lon]} 
                zoom={5} 
                zoomControl={false}
                style={{ height: '100%', width: '100%' }}
                className="w-full h-full bg-slate-200 dark:bg-[#0f172a] map-safe-controls"
            >
                <LayersControl position="bottomright">
                    <LayersControl.BaseLayer checked={selectedBaseLayer === 'light'} name="Kaart (Licht)">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer checked={selectedBaseLayer === 'dark'} name="Kaart (Donker)">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer checked={selectedBaseLayer === 'satellite'} name="Satelliet">
                        <TileLayer
                            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        />
                    </LayersControl.BaseLayer>
                </LayersControl>

                <ZoomControl position="bottomright" />
                <MapEvents
                    onMove={debouncedMapMove}
                    setMap={setMapInstance}
                    selectedBaseLayer={selectedBaseLayer}
                    onChangeBaseLayer={(next) => {
                        if (!onUpdateSettings) return;
                        if (next === selectedBaseLayer) return;
                        onUpdateSettings({ ...settings, mapBaseLayer: next });
                    }}
                />

                {pointsToRender.map(point => (
                    <Marker 
                        key={`${point.lat},${point.lon}`}
                        position={[point.lat, point.lon]} 
                        icon={createIcon(point)}
                        zIndexOffset={settings.favorites.some(f => f.name === point.name) ? 1000 : (!point.name ? 0 : 500)}
                    />
                ))}
            </MapContainer>
        </div>
    );
};
