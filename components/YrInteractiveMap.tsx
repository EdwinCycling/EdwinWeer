import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icon } from './Icon';
import { AppSettings } from '../types';

interface YrInteractiveMapProps {
    userLocation: { lat: number; lon: number };
    settings?: AppSettings;
    onUpdateSettings?: (settings: AppSettings) => void;
}

type MapType = 'vind' | 'temperatur';

const DEBOUNCE_DELAY = 2000;

export const YrInteractiveMap: React.FC<YrInteractiveMapProps> = ({ userLocation, settings, onUpdateSettings }) => {
    // Initial State - Try to load from settings or localStorage immediately to avoid flicker
    const getInitialSettings = () => {
        if (settings?.yr_map) {
            const savedType = settings.yr_map.type as string;
            return {
                type: (savedType === 'radar' ? 'vind' : savedType) as MapType,
                zoom: settings.yr_map.zoom,
                speed: settings.yr_map.speed
            };
        }
        const saved = localStorage.getItem('yr_map_settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Ensure savedType is one of the allowed MapType values
                const savedType = (parsed.type === 'temperatur' ? 'temperatur' : 'vind') as MapType;
                return {
                    type: savedType,
                    zoom: parsed.zoom || 4,
                    speed: parsed.speed || 2
                };
            } catch (e) {}
        }
        return { type: 'vind' as MapType, zoom: 4, speed: 2 };
    };

    const initial = getInitialSettings();
    const [mapType, setMapType] = useState<MapType>(initial.type);
    const [zoomLevel, setZoomLevel] = useState<number>(initial.zoom);
    const [animationSpeed, setAnimationSpeed] = useState<number>(initial.speed);
    
    // For debounce
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isFirstRun = useRef(true);

    // Sync state if settings prop changes (e.g. loaded from Firestore later)
    useEffect(() => {
        if (settings?.yr_map) {
            const savedType = settings.yr_map.type as string;
            setMapType((savedType === 'radar' ? 'vind' : savedType) as MapType);
            setZoomLevel(settings.yr_map.zoom);
            setAnimationSpeed(settings.yr_map.speed);
        }
    }, [settings?.yr_map]);

    // Save settings when changed
    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }

        const currentSettings = {
            type: mapType,
            zoom: zoomLevel,
            speed: animationSpeed
        };

        // 1. Direct LocalStorage
        localStorage.setItem('yr_map_settings', JSON.stringify(currentSettings));

        // 2. Debounce Firestore
        if (onUpdateSettings && settings) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            
            timeoutRef.current = setTimeout(() => {
                onUpdateSettings({
                    ...settings,
                    yr_map: currentSettings
                });
            }, DEBOUNCE_DELAY);
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [mapType, zoomLevel, animationSpeed, settings, onUpdateSettings]);

    // URL Generator
    const mapUrl = useMemo(() => {
        const { lat, lon } = userLocation;
        
        // STAP A: Bepaal de 'radius' van de kaart (Delta)
        // Hoe groter de zoomLevel, hoe groter het gebied (dus Uitzoomen).
        // We gebruiken een stapgrootte van 0.5 graad voor meer bereik.
        // zoomLevel 1 = 0.5 graad (stad/regio).
        // zoomLevel 50 = 25 graden (Europa/Continent).
        const zoomFactor = 0.5;
        const deltaLat = Math.max(0.3, zoomLevel * zoomFactor);

        // STAP B: Aspect Ratio Correctie
        // Een scherm is breder dan hoog (16:9). We moeten in de breedte dus meer laten zien.
        const deltaLon = deltaLat * 2.0;

        // STAP C: Bereken de hoeken
        const north = lat + deltaLat;
        const south = lat - deltaLat;
        const east  = lon + deltaLon;
        const west  = lon - deltaLon;

        // STAP D: Format voor URL (Noord, Oost, Zuid, West)
        // Gebruik .toFixed(4) om de URL schoon te houden
        const bounds = `${north.toFixed(4)},${east.toFixed(4)},${south.toFixed(4)},${west.toFixed(4)}`;

        return `https://moduler.yr.no/nb/kart/${mapType}/?bounds=${bounds}&speed=${animationSpeed}&play`;
    }, [mapType, zoomLevel, animationSpeed, userLocation]);

    // Handlers
    const handleZoomIn = () => {
        // We verlagen het niveau -> delta wordt kleiner -> gebied wordt kleiner -> Ingezoomd.
        setZoomLevel(prev => Math.max(1, prev - 1));
    };

    const handleZoomOut = () => {
        // We verhogen het niveau -> delta wordt groter -> gebied wordt groter -> Uitgezoomd.
        // Verhoogd naar 50 voor een veel groter bereik.
        setZoomLevel(prev => Math.min(50, prev + 1));
    };

    return (
        <div className="flex flex-col h-full w-full gap-4">
            {/* Kaart weergave */}
            <div className="flex-1 rounded-2xl overflow-hidden border border-border-color shadow-inner bg-bg-page relative">
                <iframe 
                    src={mapUrl}
                    className="w-full h-full border-none"
                    title="YR Interactive Weather Map"
                    allow="geolocation"
                />
            </div>

            {/* Controls Toolbar - Now under the map */}
            <div className="bg-bg-card/90 backdrop-blur-md p-3 rounded-xl shadow-lg border border-border-color flex flex-col gap-3 w-full">
                
                {/* Type Selection */}
                <div className="flex bg-bg-page rounded-lg p-1">
                    {(['vind', 'temperatur'] as MapType[]).map((type) => (
                        <button
                            key={type}
                            onClick={() => setMapType(type)}
                            className={`flex-1 py-2 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                mapType === type 
                                    ? 'bg-bg-card shadow-sm text-primary' 
                                    : 'text-text-muted hover:text-text-main'
                            }`}
                        >
                            <Icon name={
                                type === 'vind' ? 'air' : 'thermostat'
                            } className="text-sm" />
                            <span className="hidden sm:inline">{type === 'vind' ? 'Wind' : 'Temp'}</span>
                            <span className="sm:hidden">{type === 'vind' ? 'Wind' : 'Temp'}</span>
                        </button>
                    ))}
                </div>

                {/* Navigation & Animation */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 px-2">
                    {/* Zoom Controls */}
                    <div className="flex items-center justify-between sm:justify-start gap-3">
                        <span className="text-[10px] uppercase font-bold text-text-muted">Zoom</span>
                        <div className="flex items-center bg-bg-page rounded-lg">
                            <button 
                                onClick={handleZoomOut}
                                className="p-2 hover:bg-bg-card rounded-lg transition-colors text-text-main"
                                title="Uitzoomen (-)"
                            >
                                <Icon name="remove" className="text-sm" />
                            </button>
                            <div className="w-px h-4 bg-border-color"></div>
                            <button 
                                onClick={handleZoomIn}
                                className="p-2 hover:bg-bg-card rounded-lg transition-colors text-text-main"
                                title="Inzoomen (+)"
                            >
                                <Icon name="add" className="text-sm" />
                            </button>
                        </div>
                    </div>

                    {/* Speed Control */}
                    <div className="flex items-center gap-3 flex-1">
                        <span className="text-[10px] uppercase font-bold text-text-muted">Snelheid</span>
                        <div className="flex items-center gap-2 flex-1 text-text-main">
                            <span className="text-xs">🐢</span>
                            <input 
                                type="range" 
                                min="1" 
                                max="5" 
                                step="1"
                                value={animationSpeed}
                                onChange={(e) => setAnimationSpeed(Number(e.target.value))}
                                className="w-full h-1 bg-border-color rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <span className="text-xs">🐇</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="text-center text-[10px] text-text-muted mt-1 pb-2">
                Data provided by YR.no (MET Norway)
            </div>
        </div>
    );
};
