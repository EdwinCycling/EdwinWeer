import React, { useState, useRef, useEffect } from 'react';
import Globe, { GlobeMethods } from 'react-globe.gl';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as Astronomy from 'astronomy-engine';
import { ViewState, Location, AppSettings } from '../types';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { 
    fetchForecast, 
    fetchMarineData, 
    calculateMoonPhase
} from '../services/weatherService';
import { reverseGeocodeFull } from '../services/geoService';
import { CreditFloatingButton } from '../components/CreditFloatingButton';
import { useScrollLock } from '../hooks/useScrollLock';

// Fix for Leaflet marker icons in React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Props {
    settings: AppSettings;
    onNavigate: (view: ViewState) => void;
    onSelectLocation: (loc: Location) => void;
}

interface MapControllerProps {
    onSwitchToGlobe: (lat: number, lng: number) => void;
    onUpdateCenter: (lat: number, lng: number) => void;
    onUpdateZoom: (zoom: number) => void;
}

const MapController: React.FC<MapControllerProps> = ({ onSwitchToGlobe, onUpdateCenter, onUpdateZoom }) => {
    const map = useMap();
    
    useMapEvents({
        zoomend: () => {
            const z = map.getZoom();
            if (z < 4) {
                const center = map.getCenter();
                onSwitchToGlobe(center.lat, center.lng);
            } else {
                onUpdateZoom(z);
            }
        },
        moveend: () => {
            const center = map.getCenter();
            onUpdateCenter(center.lat, center.lng);
        }
    });
    
    return null;
};

interface MapClickHandlerProps {
    onMapClick: (lat: number, lng: number) => void;
}

const MapClickHandler: React.FC<MapClickHandlerProps> = ({ onMapClick }) => {
    useMapEvents({
        click: (e) => {
            onMapClick(e.latlng.lat, e.latlng.lng);
        }
    });
    return null;
};

interface MapUpdaterProps {
    center: { lat: number, lng: number };
    zoom: number;
}

const MapUpdater: React.FC<MapUpdaterProps> = ({ center, zoom }) => {
    const map = useMap();
    
    useEffect(() => {
        if (map) {
            const currentCenter = map.getCenter();
            const currentZoom = map.getZoom();
            
            // Only update if significantly different to avoid loops/jitters
            const dist = Math.sqrt(
                Math.pow(currentCenter.lat - center.lat, 2) + 
                Math.pow(currentCenter.lng - center.lng, 2)
            );
            
            if (dist > 0.0001 || currentZoom !== zoom) {
                map.setView([center.lat, center.lng], zoom, { animate: true });
            }
        }
    }, [center, zoom, map]);
    
    return null;
};

export const GlobeView: React.FC<Props> = ({ settings, onNavigate, onSelectLocation }) => {
    const globeEl = useRef<GlobeMethods | undefined>(undefined);
    const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lng: number } | null>(null);
    const [weatherData, setWeatherData] = useState<any>(null);
    const [marineData, setMarineData] = useState<any>(null);
    const [locationType, setLocationType] = useState<'LAND' | 'WATER'>('LAND');
    const [locationInfo, setLocationInfo] = useState<{ name: string; countryCode: string; countryName?: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [isGlobeLoading, setIsGlobeLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight
                });
            }
        };

        const resizeObserver = new ResizeObserver(updateDimensions);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        updateDimensions();
        return () => resizeObserver.disconnect();
    }, []);
    const [showToast, setShowToast] = useState(true);

    useScrollLock(!!selectedPoint);

    // Hybrid Mode State
    const [viewMode, setViewMode] = useState<'globe' | 'map'>('globe');
    const [skin, setSkin] = useState<'satellite' | 'night' | 'topo' | 'streets'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('globe_skin') as any) || 'satellite';
        }
        return 'satellite';
    });
    const [mapCenter, setMapCenter] = useState({ lat: 52.36, lng: 4.90 });
    const [mapZoom, setMapZoom] = useState(6);

    const t = (key: string) => getTranslation(key, settings.language);

    // Globe image URL based on skin
    const getGlobeImage = () => {
        switch (skin) {
            case 'night': return '//unpkg.com/three-globe/example/img/earth-night.jpg';
            case 'topo': return '//unpkg.com/three-globe/example/img/earth-topology.png';
            case 'streets':
            case 'satellite':
            default: return '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
        }
    };

    const getTileLayer = () => {
        switch (skin) {
            case 'night':
                return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
            case 'topo':
                return "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
            case 'streets':
                return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
            case 'satellite':
            default:
                return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
        }
    };

    const handleSkinChange = (newSkin: 'satellite' | 'night' | 'topo' | 'streets') => {
        setSkin(newSkin);
        localStorage.setItem('globe_skin', newSkin);
    };

    // MapController moved outside to prevent re-mounting loops

    const handleSwitchToGlobe = (lat: number, lng: number) => {
        // Reset to satellite if streets was selected (streets doesn't look good on globe)
        if (skin === 'streets') {
            setSkin('satellite');
        }
        
        setViewMode('globe');
        // Wait for transition
        setTimeout(() => {
            if (globeEl.current) {
                globeEl.current.pointOfView({ lat, lng, altitude: 1.5 }, 1000);
            }
        }, 100);
    };

    const calculateTideStrength = () => {
        try {
            const now = new Date();
            let phase = 0.5;
            
            try {
                 if (Astronomy && Astronomy.Illumination) {
                    phase = Astronomy.Illumination(Astronomy.Body.Moon, now).phase_fraction;
                } else {
                     throw new Error("Astronomy engine missing");
                 }
            } catch (e) {
                 phase = calculateMoonPhase(now);
            }

            const dist0 = Math.abs(phase - 0);
            const dist05 = Math.abs(phase - 0.5);
            const dist1 = Math.abs(phase - 1.0);
            
            const minDistToSpring = Math.min(dist0, dist05, dist1);
            const percentage = Math.round((0.25 - minDistToSpring) / 0.25 * 100);
            
            let label = "Normaal Getij";
            if (percentage >= 85) label = "🌊 Springtij (Sterke stroming!)";
            else if (percentage <= 15) label = "🧘 Doodtij (Rustig water)";
            
            return { percentage, label };
        } catch (err) {
            console.error("Tide calculation error", err);
            return { percentage: 50, label: "Normaal Getij" };
        }
    };

    useEffect(() => {
        if (globeEl.current) {
            globeEl.current.pointOfView({ altitude: 2.5 });
        }
        const timer = setTimeout(() => {
            setIsGlobeLoading(false);
        }, 2000);
        const toastTimer = setTimeout(() => {
            setShowToast(false);
        }, 8000);
        return () => {
            clearTimeout(timer);
            clearTimeout(toastTimer);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-attach listener when viewMode changes back to globe
    useEffect(() => {
        if (viewMode === 'globe' && globeEl.current) {
             const controls = globeEl.current.controls();
             const checkAltitude = () => {
                const alt = globeEl.current?.pointOfView().altitude || 2.5;
                if (alt < 0.6) {
                     const pos = globeEl.current?.pointOfView();
                     if (pos) {
                         setMapCenter({ lat: pos.lat, lng: pos.lng });
                         setMapZoom(5);
                         setViewMode('map');
                     }
                }
             };
             
             if (controls) {
                 controls.addEventListener('change', checkAltitude);
                 return () => controls.removeEventListener('change', checkAltitude);
             }
        }
    }, [viewMode]);

    useEffect(() => {
        if (globeEl.current) {
            window.dispatchEvent(new Event('resize'));
            if (!selectedPoint) {
                const currentPos = globeEl.current.pointOfView();
                globeEl.current.pointOfView({ ...currentPos, altitude: Math.max(currentPos.altitude, 2.0) });
            }
        }
    }, [selectedPoint]);

    const lastClickTime = useRef<number>(0);
    const handleGlobeClick = (clickData: { lat: number, lng: number }) => {
        const now = Date.now();
        if (now - lastClickTime.current < 300) return; // Debounce
        lastClickTime.current = now;

        const { lat, lng } = clickData;
        setSelectedPoint({ lat, lng });
        setWeatherData(null);
        setMarineData(null);
        setLocationType('LAND');
        setLocationInfo(null);
        // Only animate globe if in globe mode
        if (globeEl.current && viewMode === 'globe') {
            globeEl.current.pointOfView({ lat, lng, altitude: 1.8 }, 1000);
        }
        fetchData(lat, lng);
    };

    const handleControl = (direction: 'up' | 'down' | 'left' | 'right' | 'zoomIn' | 'zoomOut') => {
        if (viewMode === 'map') {
            // Map Controls
            const moveStep = 0.5; // degrees for map panning
            let { lat, lng } = mapCenter;
            
            switch (direction) {
                case 'up': lat += moveStep; break;
                case 'down': lat -= moveStep; break;
                case 'left': lng -= moveStep; break;
                case 'right': lng += moveStep; break;
                case 'zoomIn': setMapZoom(z => z + 1); return;
                case 'zoomOut': setMapZoom(z => z - 1); return;
            }
            setMapCenter({ lat, lng });
            return;
        }

        if (!globeEl.current) return;

        const current = globeEl.current.pointOfView();
        let { lat, lng, altitude } = current;
        const moveStep = 10;
        const zoomStep = 0.5;

        switch (direction) {
            case 'up': lat += moveStep; break;
            case 'down': lat -= moveStep; break;
            case 'left': lng -= moveStep; break;
            case 'right': lng += moveStep; break;
            case 'zoomIn': altitude = Math.max(0.2, altitude - zoomStep); break;
            case 'zoomOut': altitude = Math.min(10, altitude + zoomStep); break;
        }

        globeEl.current.pointOfView({ lat, lng, altitude }, 400);
    };

    const fetchData = async (lat: number, lon: number) => {
        setLoading(true);
        try {
            const [weather, marine, locInfo] = await Promise.all([
                fetchForecast(lat, lon),
                fetchMarineData(lat, lon),
                reverseGeocodeFull(lat, lon)
            ]);

            setWeatherData(weather);
            setMarineData(marine);

            let isWater = false;
            if (marine && marine.current && typeof marine.current.wave_height === 'number') {
                if (marine.current.wave_height !== null) {
                    isWater = true;
                }
            }
            
            setLocationType(isWater ? 'WATER' : 'LAND');

            if (locInfo) {
                setLocationInfo(locInfo);
            } else {
                if (isWater) {
                     setLocationInfo({ name: `Oceaan / Zee`, countryCode: '' });
                } else {
                     setLocationInfo({ name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, countryCode: '' });
                }
            }

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = () => {
        if (selectedPoint) {
            const loc: Location = {
                name: locationInfo?.name || `Locatie (${selectedPoint.lat.toFixed(2)}, ${selectedPoint.lng.toFixed(2)})`,
                country: locationInfo?.countryCode || '',
                lat: selectedPoint.lat,
                lon: selectedPoint.lng
            };
            onSelectLocation(loc);
        }
    };

    return (
        <div ref={containerRef} className="flex flex-col h-[100dvh] w-full relative bg-bg-page/50 overflow-hidden">
            {/* Back Button */}
            <div className="absolute top-6 left-6 z-[100]">
                 <button 
                    onClick={() => onNavigate(ViewState.CURRENT)} 
                    className="p-3 bg-bg-card/80 backdrop-blur-md rounded-full text-text-main hover:bg-bg-card transition-colors border border-border-color shadow-lg ring-1 ring-border-color/10"
                >
                    <Icon name="arrow_back" className="text-2xl" />
                </button>
            </div>

            {/* Skins Selection Menu */}
            <div className="absolute top-6 left-24 z-[100] flex gap-2">
                {[
                    { id: 'satellite', icon: 'satellite', label: 'Satelliet' },
                    { id: 'night', icon: 'nights_stay', label: 'Nacht' },
                    { id: 'topo', icon: 'terrain', label: 'Topo' },
                    { id: 'streets', icon: 'map', label: 'Kaart' }
                ].map((s) => (
                    <button
                        key={s.id}
                        onClick={() => handleSkinChange(s.id as any)}
                        className={`px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-md transition-all border ${
                            skin === s.id 
                                ? 'bg-accent-primary text-text-inverse border-accent-primary shadow-lg shadow-accent-primary/30' 
                                : 'bg-bg-card/80 text-text-muted hover:bg-bg-card hover:text-text-main border-border-color shadow-sm'
                        }`}
                    >
                        <Icon name={s.icon} className="text-lg" />
                        <span className="text-sm font-bold hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>

            {/* Controls */}
            <div className="absolute top-6 right-6 z-[100] flex flex-col gap-2 scale-75 md:scale-100 origin-top-right">
                <div className="flex flex-col bg-bg-card/80 backdrop-blur-md rounded-xl border border-border-color overflow-hidden shadow-lg ring-1 ring-border-color/10">
                    <button onClick={() => handleControl('zoomIn')} className="p-1.5 sm:p-3 hover:bg-bg-page/50 text-text-main active:bg-bg-page transition-colors"><Icon name="add" /></button>
                    <button onClick={() => handleControl('zoomOut')} className="p-1.5 sm:p-3 hover:bg-bg-page/50 text-text-main active:bg-bg-page transition-colors border-t border-border-color"><Icon name="remove" /></button>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-bg-card/80 backdrop-blur-md rounded-xl border border-border-color p-1 shadow-lg ring-1 ring-border-color/10">
                     <div />
                     <button onClick={() => handleControl('up')} className="p-1 sm:p-2 hover:bg-bg-page/50 text-text-main rounded transition-colors"><Icon name="keyboard_arrow_up" /></button>
                     <div />
                     <button onClick={() => handleControl('left')} className="p-1 sm:p-2 hover:bg-bg-page/50 text-text-main rounded transition-colors"><Icon name="keyboard_arrow_left" /></button>
                     <div className="flex items-center justify-center"><Icon name="public" className="text-xs text-text-muted opacity-50"/></div>
                     <button onClick={() => handleControl('right')} className="p-1 sm:p-2 hover:bg-bg-page/50 text-text-main rounded transition-colors"><Icon name="keyboard_arrow_right" /></button>
                     <div />
                     <button onClick={() => handleControl('down')} className="p-1 sm:p-2 hover:bg-bg-page/50 text-text-main rounded transition-colors"><Icon name="keyboard_arrow_down" /></button>
                     <div />
                </div>
            </div>

            {/* Toast Instruction */}
            {showToast && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[90] pointer-events-none animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="bg-bg-card/90 backdrop-blur-xl px-6 py-3 rounded-full text-text-main text-sm font-medium border border-border-color shadow-xl flex flex-col items-center gap-1 text-center ring-1 ring-border-color/10">
                        <span>Draai de wereldbol en klik op een locatie</span>
                        <span className="text-xs text-text-muted font-normal">PC: Sleep met muis | Mobiel: Sleep met vinger</span>
                    </div>
                </div>
            )}

            {/* Globe Container - Dynamic Height */}
            <div 
                className={`absolute inset-0 transition-opacity duration-700 ease-in-out flex items-center justify-center ${
                    viewMode === 'globe' ? 'opacity-100 pointer-events-auto z-20' : 'opacity-0 pointer-events-none z-0'
                }`}
            >
                <div className={`relative transition-all duration-700 ease-in-out ${selectedPoint ? 'h-[50dvh] sm:h-[60vh] md:h-[65vh]' : 'h-full'} w-full flex items-center justify-center`}>
                    <Globe
                        ref={globeEl}
                        width={dimensions.width}
                        height={selectedPoint ? (dimensions.height * (window.innerWidth < 640 ? 0.5 : 0.65)) : dimensions.height}
                        globeImageUrl={getGlobeImage()}
                        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
                        atmosphereColor="lightskyblue"
                        atmosphereAltitude={0.15}
                        onGlobeClick={handleGlobeClick}
                        onPointerClick={(point) => {
                            if (point) handleGlobeClick(point);
                        }}
                        backgroundColor="rgba(0,0,0,0)"
                        htmlElementsData={selectedPoint ? [selectedPoint] : []}
                        htmlElement={(d: any) => {
                            const el = document.createElement('div');
                            el.innerHTML = `<span style="font-size: 32px; filter: drop-shadow(0 0 8px rgba(0,0,0,0.8));">📍</span>`;
                            el.style.transform = `translate(-50%, -100%)`;
                            el.style.pointerEvents = 'none'; // Ensure marker doesn't block clicks
                            return el;
                        }}
                    />

                    {/* Globe Loading Overlay */}
                    {isGlobeLoading && (
                        <div className="absolute inset-0 z-[110] bg-bg-page flex flex-col items-center justify-center animate-in fade-in duration-500">
                            <div className="relative">
                                <div className="h-24 w-24 rounded-full border-4 border-accent-primary/20 border-t-accent-primary animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Icon name="public" className="text-3xl text-accent-primary animate-pulse" />
                                </div>
                            </div>
                            <p className="mt-4 text-text-main font-bold animate-pulse">Wereldbol laden...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Map Container - Round & Glassy */}
            <div 
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ease-in-out ${
                    viewMode === 'map' ? 'opacity-100 pointer-events-auto z-20' : 'opacity-0 pointer-events-none z-0'
                }`}
            >
                <div 
                    className="relative w-full h-full md:w-[80vh] md:h-[80vh] rounded-full overflow-hidden border-2 border-border-color shadow-2xl backdrop-blur-sm"
                    style={{
                        boxShadow: '0 0 50px rgba(0,0,0,0.3), inset 0 0 20px var(--border-color)'
                    }}
                >
                     {viewMode === 'map' && (
                        <MapContainer 
                            center={[mapCenter.lat, mapCenter.lng]} 
                            zoom={mapZoom} 
                            style={{ height: '100%', width: '100%' }}
                            zoomControl={false}
                            attributionControl={false}
                        >
                            <TileLayer
                                url={getTileLayer()}
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            />
                            <MapController 
                                onSwitchToGlobe={handleSwitchToGlobe}
                                onUpdateCenter={(lat, lng) => setMapCenter({ lat, lng })}
                                onUpdateZoom={(zoom) => setMapZoom(zoom)}
                            />
                            <MapUpdater center={mapCenter} zoom={mapZoom} />
                            <MapClickHandler onMapClick={(lat, lng) => handleGlobeClick({ lat, lng })} />
                            {selectedPoint && (
                                <Marker position={[selectedPoint.lat, selectedPoint.lng]} />
                            )}
                        </MapContainer>
                    )}
                    
                    {/* Glass Reflection Effect */}
                    <div className="absolute inset-0 rounded-full pointer-events-none bg-gradient-to-tr from-white/10 to-transparent opacity-50"></div>
                </div>
            </div>
            
            {/* Floating Credits Button */}
            <div className="absolute bottom-6 right-6 z-[100]">
                 <CreditFloatingButton onNavigate={onNavigate} settings={settings} />
            </div>

            {/* Weather Detail Panel - Full Width as requested */}
            {selectedPoint && (
                <div className="bg-bg-card/95 backdrop-blur-2xl border-t border-border-color p-6 pb-32 overflow-y-auto z-[150] animate-in slide-in-from-bottom-full duration-500 fixed bottom-0 left-0 right-0 h-[50dvh] sm:h-[40vh] md:h-[35vh]">
                    <div className="max-w-4xl mx-auto relative">
                        {/* Close Button */}
                        <button 
                            onClick={() => setSelectedPoint(null)}
                            className="absolute top-3 right-3 sm:-top-2 sm:-right-2 md:top-0 md:right-0 p-2 bg-bg-page/80 hover:bg-bg-page rounded-full text-text-muted transition-colors z-30 border border-border-color shadow-sm"
                            title="Sluit venster"
                        >
                            <Icon name="close" />
                        </button>

                        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start mb-6 pr-10">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h2 className="text-3xl font-bold text-text-main tracking-tight">
                                        {locationInfo ? locationInfo.name : 'Laden...'}
                                    </h2>
                                    {weatherData && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-medium text-text-muted bg-bg-page/50 px-3 py-1 rounded-xl border border-border-color">
                                                {new Date().toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-US', { 
                                                    hour: '2-digit', 
                                                    minute: '2-digit',
                                                    timeZone: weatherData.timezone 
                                                })}
                                            </span>
                                            {(() => {
                                                const localSecs = new Date().getTimezoneOffset() * -60;
                                                const targetSecs = weatherData.utc_offset_seconds || 0;
                                                const diffHours = (targetSecs - localSecs) / 3600;
                                                if (diffHours === 0) return null;
                                                const sign = diffHours > 0 ? '+' : '';
                                                return (
                                                    <span className="text-xs font-bold text-text-muted/60">
                                                        ({sign}{diffHours}u t.o.v. nu)
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    {locationInfo?.countryCode && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-accent-primary bg-accent-primary/10 px-3 py-1 rounded-full border border-accent-primary/20">
                                                {locationInfo.countryCode}
                                            </span>
                                            {locationInfo.countryName && (
                                                <span className="text-xs font-medium text-text-muted hidden md:inline">
                                                    {locationInfo.countryName}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <span className="text-xs text-text-muted flex items-center gap-1">
                                        <Icon name="location_on" className="text-sm" />
                                        {selectedPoint.lat.toFixed(2)}, {selectedPoint.lng.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                            <button 
                                onClick={handleSelect}
                                className="bg-accent-primary hover:bg-accent-primary/80 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-xl font-bold shadow-lg shadow-accent-primary/20 transition-all flex items-center gap-2 hover:scale-105 active:scale-95 w-full sm:w-auto text-sm sm:text-base"
                            >
                                <Icon name="check" />
                                Selecteer
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="h-8 w-8 rounded-full border-2 border-accent-primary border-t-transparent animate-spin"></div>
                                    <span className="text-text-muted animate-pulse">Weergegevens ophalen...</span>
                                </div>
                            </div>
                        ) : weatherData ? (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {/* Current Weather Card */}
                                    <div className="bg-bg-card/40 rounded-2xl p-5 border border-border-color/50 hover:border-border-color transition-colors shadow-sm">
                                        <h3 className="text-sm font-bold text-text-muted mb-4 flex items-center gap-2">
                                            <Icon name="thermostat" className="text-accent-primary" />
                                            Huidig Weer
                                        </h3>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-4xl font-bold text-text-main">
                                                    {weatherData.current.temperature_2m}°
                                                </div>
                                                <div className="text-sm text-text-muted mt-1">
                                                    Voelt als {weatherData.current.apparent_temperature}°
                                                </div>
                                                {weatherData.daily && (
                                                    <div className="text-xs font-bold text-red-400 mt-2 flex items-center gap-1">
                                                        <Icon name="arrow_upward" className="text-xs" />
                                                        Max vandaag: {weatherData.daily.temperature_2m_max[0]}°
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-3xl">
                                                    {/* Weather Icon Map (Simplified) */}
                                                    {weatherData.current.weather_code === 0 ? '☀️' : 
                                                     weatherData.current.weather_code < 3 ? '⛅' : 
                                                     weatherData.current.weather_code < 50 ? '☁️' : 
                                                     weatherData.current.weather_code < 70 ? '🌧️' : '⛈️'}
                                                </div>
                                                <div className="text-xs font-bold text-accent-primary mt-1 px-2 py-0.5 bg-accent-primary/10 rounded-full inline-block">
                                                    Code {weatherData.current.weather_code}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Wind & Atmosphere */}
                                    <div className="bg-bg-card/40 rounded-2xl p-5 border border-border-color/50 hover:border-border-color transition-colors shadow-sm">
                                        <h3 className="text-sm font-bold text-text-muted mb-4 flex items-center gap-2">
                                            <Icon name="air" className="text-blue-400" />
                                            Wind & Atmosfeer
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs text-text-muted">Wind</span>
                                                <span className="font-bold text-text-main flex items-center gap-1">
                                                    {weatherData.current.wind_speed_10m} km/u
                                                    <span style={{ transform: `rotate(${weatherData.current.wind_direction_10m}deg)` }} className="inline-block">↓</span>
                                                </span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs text-text-muted">Vochtigheid</span>
                                                <span className="font-bold text-text-main">{weatherData.current.relative_humidity_2m}%</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs text-text-muted">Luchtdruk</span>
                                                <span className="font-bold text-text-main">{weatherData.current.surface_pressure} hPa</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs text-text-muted">Zicht</span>
                                                <span className="font-bold text-text-main">
                                                    {weatherData.hourly && weatherData.hourly.visibility ? 
                                                        (weatherData.hourly.visibility[0] / 1000).toFixed(1) + ' km' : '--'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sun & Moon */}
                                    {weatherData.daily && weatherData.daily.sunrise && (
                                        <div className="bg-bg-card/40 rounded-2xl p-5 border border-border-color/50 hover:border-border-color transition-colors shadow-sm">
                                            <h3 className="text-sm font-bold text-text-muted mb-4 flex items-center gap-2">
                                                <Icon name="wb_sunny" className="text-yellow-500" />
                                                Zon & Dag
                                            </h3>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs text-text-muted flex items-center gap-1"><Icon name="wb_twilight" className="text-xs"/> Opkomst</span>
                                                    <span className="font-bold text-text-main">
                                                        {new Date(weatherData.daily.sunrise[0] + 'Z').toLocaleTimeString(settings.language==='nl'?'nl-NL':'en-GB', {hour: '2-digit', minute:'2-digit', timeZone: 'UTC'})}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs text-text-muted flex items-center gap-1"><Icon name="wb_twilight" className="text-xs rotate-180"/> Ondergang</span>
                                                    <span className="font-bold text-text-main">
                                                        {new Date(weatherData.daily.sunset[0] + 'Z').toLocaleTimeString(settings.language==='nl'?'nl-NL':'en-GB', {hour: '2-digit', minute:'2-digit', timeZone: 'UTC'})}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Marine / Water Info */}
                                    {locationType === 'WATER' && marineData && (
                                        <div className="bg-blue-500/10 rounded-2xl p-5 border border-blue-500/20 hover:border-blue-500/30 transition-colors">
                                            <h3 className="text-sm font-bold text-blue-400 mb-4 flex items-center gap-2">
                                                <Icon name="waves" />
                                                Marine Info
                                            </h3>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-text-muted text-sm">Golfhoogte</span>
                                                    <span className="text-text-main font-bold">{marineData.current.wave_height}m</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-text-muted text-sm">Golfperiode</span>
                                                    <span className="text-text-main font-bold">{marineData.current.wave_period || '--'}s</span>
                                                </div>
                                                <div className="mt-3 pt-3 border-t border-border-color/20">
                                                     <div className="flex items-center gap-2">
                                                         <span className="text-2xl">{calculateTideStrength().label.split(' ')[0]}</span>
                                                         <span className="text-sm font-medium text-text-main">{calculateTideStrength().label.replace(/^[^\s]+\s+/, '')}</span>
                                                     </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {/* 7 Day Forecast Preview */}
                                {weatherData.daily && (
                                    <div className="bg-bg-card/40 rounded-2xl p-5 border border-border-color/50 mt-4 shadow-sm">
                                        <h3 className="text-sm font-bold text-text-muted mb-4 flex items-center gap-2">
                                            <Icon name="calendar_today" />
                                            Verwachting
                                        </h3>
                                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                                            {weatherData.daily.time.slice(1, 8).map((t: string, i: number) => (
                                                <div key={t} className="flex flex-col items-center min-w-[60px] p-2 rounded-xl bg-bg-card/60 border border-border-color/30 shadow-sm">
                                                    <span className="text-xs text-text-muted font-bold mb-1">
                                                        {new Date(t).toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-US', { weekday: 'short' })}
                                                    </span>
                                                    <span className="text-lg my-1">
                                                        {weatherData.daily.weather_code[i+1] < 3 ? '☀️' : 
                                                         weatherData.daily.weather_code[i+1] < 50 ? '⛅' : '🌧️'}
                                                    </span>
                                                    <span className="text-sm font-bold text-text-main">{Math.round(weatherData.daily.temperature_2m_max[i+1])}°</span>
                                                    <span className="text-xs text-text-muted">{Math.round(weatherData.daily.temperature_2m_min[i+1])}°</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-text-muted">
                                Geen weergegevens beschikbaar voor deze locatie.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
