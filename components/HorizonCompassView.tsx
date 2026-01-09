import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as Astronomy from 'astronomy-engine';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';
import { AppLanguage } from '../types';

interface HorizonCompassViewProps {
    isOpen: boolean;
    onClose: () => void;
    latitude: number;
    longitude: number;
    locationName: string;
    utcOffsetSeconds?: number;
    language: AppLanguage;
}

const STARS_50 = [
    { name: "Sirius", ra: 6.75, dec: -16.72, mag: -1.46 }, { name: "Canopus", ra: 6.40, dec: -52.70, mag: -0.74 },
    { name: "Rigil Kentaurus", ra: 14.66, dec: -60.83, mag: -0.27 }, { name: "Arcturus", ra: 14.26, dec: 19.18, mag: -0.05 },
    { name: "Vega", ra: 18.62, dec: 38.78, mag: 0.03 }, { name: "Capella", ra: 5.28, dec: 45.99, mag: 0.08 },
    { name: "Rigel", ra: 5.24, dec: -8.20, mag: 0.13 }, { name: "Procyon", ra: 7.65, dec: 5.21, mag: 0.34 },
    { name: "Achernar", ra: 1.63, dec: -57.24, mag: 0.46 }, { name: "Betelgeuse", ra: 5.92, dec: 7.41, mag: 0.50 },
    { name: "Hadar", ra: 14.06, dec: -60.37, mag: 0.61 }, { name: "Altair", ra: 19.85, dec: 8.87, mag: 0.76 },
    { name: "Acrux", ra: 12.44, dec: -63.10, mag: 0.76 }, { name: "Aldebaran", ra: 4.60, dec: 16.51, mag: 0.86 },
    { name: "Antares", ra: 16.49, dec: -26.43, mag: 0.96 }, { name: "Spica", ra: 13.42, dec: -11.16, mag: 0.97 },
    { name: "Pollux", ra: 7.76, dec: 28.03, mag: 1.14 }, { name: "Fomalhaut", ra: 22.96, dec: -29.62, mag: 1.16 },
    { name: "Deneb", ra: 20.69, dec: 45.28, mag: 1.25 }, { name: "Mimosa", ra: 12.80, dec: -59.69, mag: 1.25 },
    { name: "Regulus", ra: 10.14, dec: 11.97, mag: 1.35 }, { name: "Adhara", ra: 6.98, dec: -28.97, mag: 1.50 },
    { name: "Shaula", ra: 17.56, dec: -37.10, mag: 1.62 }, { name: "Castor", ra: 7.58, dec: 31.89, mag: 1.62 },
    { name: "Gacrux", ra: 12.52, dec: -57.11, mag: 1.64 }, { name: "Bellatrix", ra: 5.42, dec: 6.35, mag: 1.64 },
    { name: "Elnath", ra: 5.43, dec: 28.61, mag: 1.65 }, { name: "Miaplacidus", ra: 9.22, dec: -69.72, mag: 1.67 },
    { name: "Alnilam", ra: 5.60, dec: -1.20, mag: 1.69 }, { name: "Alnair", ra: 22.14, dec: -46.96, mag: 1.74 },
    { name: "Alioth", ra: 12.90, dec: 55.96, mag: 1.77 }, { name: "Dubhe", ra: 11.06, dec: 61.75, mag: 1.79 },
    { name: "Mirfak", ra: 3.41, dec: 49.86, mag: 1.80 }, { name: "Wezen", ra: 7.14, dec: -26.39, mag: 1.82 },
    { name: "Sargas", ra: 17.62, dec: -43.00, mag: 1.87 }, { name: "Kaus Australis", ra: 18.40, dec: -34.38, mag: 1.85 },
    { name: "Avior", ra: 8.38, dec: -59.51, mag: 1.86 }, { name: "Alkaid", ra: 13.80, dec: 49.31, mag: 1.86 },
    { name: "Menkalinan", ra: 5.99, dec: 44.95, mag: 1.90 }, { name: "Atria", ra: 16.81, dec: -69.03, mag: 1.91 },
    { name: "Alhena", ra: 6.63, dec: 16.39, mag: 1.92 }, { name: "Peacock", ra: 20.42, dec: -56.74, mag: 1.94 },
    { name: "Alsephina", ra: 8.74, dec: -54.72, mag: 1.96 }, { name: "Mirzam", ra: 6.38, dec: -17.96, mag: 1.98 },
    { name: "Alphard", ra: 9.46, dec: -8.66, mag: 1.98 }, { name: "Polaris", ra: 2.53, dec: 89.26, mag: 1.98 },
    { name: "Hamal", ra: 2.12, dec: 23.46, mag: 2.00 }, { name: "Algieba", ra: 10.33, dec: 19.84, mag: 2.08 },
    { name: "Diphda", ra: 0.73, dec: -17.99, mag: 2.02 }, { name: "Nunki", ra: 18.92, dec: -26.30, mag: 2.02 }
];

const PLANETS = [
    { name: 'Mercury', color: '#B7B8B9', labelKey: 'planet.mercury', size: 4 },
    { name: 'Venus', color: '#E3BB76', labelKey: 'planet.venus', size: 6 },
    { name: 'Mars', color: '#E27B58', labelKey: 'planet.mars', size: 5 },
    { name: 'Jupiter', color: '#C88B3A', labelKey: 'planet.jupiter', size: 8 },
    { name: 'Saturn', color: '#C5AB6E', labelKey: 'planet.saturn', size: 7 }
];

const DIRECTIONS = [
    { id: 'N', labelKey: 'dir.long.N', azimuth: 0 },
    { id: 'O', labelKey: 'dir.long.O', azimuth: 90 },
    { id: 'Z', labelKey: 'dir.long.Z', azimuth: 180 },
    { id: 'W', labelKey: 'dir.long.W', azimuth: 270 }
];

interface CelestialObject {
    type: 'star' | 'planet' | 'moon' | 'sun';
    name: string;
    azimuth: number;
    altitude: number;
    magnitude?: number;
    color?: string;
    size?: number;
    phase?: number; // Voor maan
}

export const HorizonCompassView: React.FC<HorizonCompassViewProps> = ({ isOpen, onClose, latitude, longitude, locationName, utcOffsetSeconds = 0, language }) => {
    const [viewDirection, setViewDirection] = useState<'N' | 'O' | 'Z' | 'W'>('Z');
    const [timeOffset, setTimeOffset] = useState(0);

    const t = (key: string) => getTranslation(key, language);

    // Berekende datum (rekening houdend met lokale tijd van de locatie)
    const displayTime = useMemo(() => {
        const now = new Date();
        // 1. Converteer lokale tijd van de browser naar UTC
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        // 2. Pas de UTC offset van de geselecteerde locatie toe + de handmatige uren verschuiving
        return new Date(utc + (utcOffsetSeconds * 1000) + (timeOffset * 60 * 60 * 1000));
    }, [timeOffset, utcOffsetSeconds]);

    // Bereken alle objecten
    const celestialObjects = useMemo(() => {
        const observer = new Astronomy.Observer(latitude, longitude, 0);
        const objects: CelestialObject[] = [];

        // 1. Sterren
        STARS_50.forEach(star => {
            // Conversie RA/Dec naar Horizontal coordinates
            // Astronomy Engine heeft geen directe functie voor RA/Dec -> Horizontal zonder eerst Equator object te maken?
            // Eigenlijk wel: Horizon() functie neemt Equator coordinates.
            // Maar we hebben alleen RA/Dec floats. We moeten ze converteren naar een object dat Astronomy engine snapt, of handmatig.
            // Astronomy.Equator(ra, dec, dist)
            // RA is in uren in de input data? Nee, lijkt op decimal hours of degrees?
            // Check data: Sirius RA 6.75 (hours?), Dec -16.72 (degrees). 
            // Astronomy engine verwacht RA in uren en Dec in graden voor Equator?
            // Nee, Equator constructor is (ra, dec, dist). 
            
            // Let op: Astronomy Engine Horizon functie:
            // Horizon(date, observer, ra, dec, refraction?) -> {azimuth, altitude}
            // Waar ra in uren is en dec in graden.
            
            const hor = Astronomy.Horizon(displayTime, observer, star.ra, star.dec, 'normal');
            
            if (hor.altitude > -5) { // Beetje marge onder horizon voor rendering
                objects.push({
                    type: 'star',
                    name: star.name,
                    azimuth: hor.azimuth,
                    altitude: hor.altitude,
                    magnitude: star.mag,
                    color: '#FFFFFF'
                });
            }
        });

        // 2. Planeten
        PLANETS.forEach(planet => {
            const body = Astronomy.Body[planet.name as keyof typeof Astronomy.Body];
            const equ = Astronomy.Equator(body, displayTime, observer, true, true);
            const hor = Astronomy.Horizon(displayTime, observer, equ.ra, equ.dec, 'normal');
            
            if (hor.altitude > -5) {
                objects.push({
                    type: 'planet',
                    name: t(planet.labelKey),
                    azimuth: hor.azimuth,
                    altitude: hor.altitude,
                    color: planet.color,
                    size: planet.size
                });
            }
        });

        // 3. Maan
        const moonEqu = Astronomy.Equator(Astronomy.Body.Moon, displayTime, observer, true, true);
        const moonHor = Astronomy.Horizon(displayTime, observer, moonEqu.ra, moonEqu.dec, 'normal');
        const moonPhase = Astronomy.Illumination(Astronomy.Body.Moon, displayTime).phase_fraction;
        if (moonHor.altitude > -5) {
            objects.push({
                type: 'moon',
                name: t('planet.moon'),
                azimuth: moonHor.azimuth,
                altitude: moonHor.altitude,
                phase: moonPhase,
                size: 30 // Basis grootte
            });
        }

        // 4. Zon (alleen voor lucht kleur logica, maar we renderen hem ook als hij er is)
        const sunEqu = Astronomy.Equator(Astronomy.Body.Sun, displayTime, observer, true, true);
        const sunHor = Astronomy.Horizon(displayTime, observer, sunEqu.ra, sunEqu.dec, 'normal');
        if (sunHor.altitude > -5) {
            objects.push({
                type: 'sun',
                name: t('planet.sun'),
                azimuth: sunHor.azimuth,
                altitude: sunHor.altitude,
                size: 40
            });
        }

        return objects;
    }, [displayTime, latitude, longitude]);

    // Zon hoogte voor lucht kleur (gradient aanpassing zou kunnen, maar instructie zegt vaste gradient of dynamisch?)
    // Instructie: "De Zon (om de lucht kleur te bepalen, zie styling)." -> Maar bij Styling staat een vaste gradient:
    // "CSS Gradiënt: linear-gradient(to top, #4b3d30 0%, #1c2b44 30%, #000510 100%)."
    // We houden de vaste gradient aan zoals in punt 5 beschreven, tenzij de gebruiker anders bedoelt met "zie styling".
    // Punt 3 zegt: "De Zon (om de lucht kleur te bepalen, zie styling)." 
    // Maar punt 5 definieert een harde gradient. Ik gebruik de harde gradient voor nacht/schemer sfeer, 
    // maar misschien moeten we iets doen als het dag is?
    // "Deze component toont een realistische weergave van de nachtelijke hemel" -> focus op nacht.
    // Ik laat de gradient statisch "nachtelijk" voor nu, of lichtjes aanpassen obv zon altitude?
    // Laten we de vaste gradient gebruiken voor consistentie met de "nacht" look.

    const calculatePosition = (objAzimuth: number, objAltitude: number) => {
        const dir = DIRECTIONS.find(d => d.id === viewDirection);
        const centerAzimuth = dir ? dir.azimuth : 180;
        
        // Azimuth verschil (-180 tot +180)
        let deltaAz = objAzimuth - centerAzimuth;
        while (deltaAz <= -180) deltaAz += 360;
        while (deltaAz > 180) deltaAz -= 360;

        // FOV 90 graden => -45 tot +45
        // Als buiten FOV, return null
        if (deltaAz < -55 || deltaAz > 55) return null; // Iets ruimer voor randen

        // Map X: -45 -> 0%, +45 -> 100%
        const left = 50 + (deltaAz / 90) * 100;

        // Map Y: 0 graden -> 25%, 90 graden -> 100%
        // We schuiven alles omhoog zodat 0 graden (de horizon) op 25% van de hoogte begint.
        // Dit voorkomt dat objecten achter de voorgrond-afbeelding verdwijnen.
        const bottom = 25 + (objAltitude / 90) * 75;

        return { left, bottom };
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} fullScreen hideHeader className="bg-black">
             <div className="flex flex-col h-full w-full overflow-hidden bg-black relative">
                
                {/* Header (Overlay) */}
                <div className="absolute top-0 left-0 right-0 z-50 p-4 flex justify-between items-start pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-4 pointer-events-auto">
                        <span className="font-bold text-white uppercase text-sm">{locationName}</span>
                        <div className="h-4 w-px bg-white/20"></div>
                        <span className="text-xs font-mono text-indigo-300">
                            {displayTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                            {timeOffset !== 0 && ` (${timeOffset > 0 ? '+' : ''}${timeOffset}u)`}
                        </span>
                    </div>
                    <button 
                        onClick={onClose}
                        className="pointer-events-auto p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all border border-white/10"
                    >
                        <Icon name="close" className="text-xl" />
                    </button>
                </div>

                {/* Main Viewport (The Sky) */}
                <div className="relative flex-1 w-full overflow-hidden">
                    {/* Layer 1: Sky Background */}
                    <div 
                        className="absolute inset-0 w-full h-full"
                        style={{
                            background: 'linear-gradient(to top, #4b3d30 0%, #1c2b44 30%, #000510 100%)'
                        }}
                    ></div>

                    {/* Layer 2: Celestial Objects */}
                    <div className="absolute inset-0 w-full h-full z-10">
                        {celestialObjects.map((obj, idx) => {
                            const pos = calculatePosition(obj.azimuth, obj.altitude);
                            if (!pos) return null;

                            // Render Logic based on type
                            if (obj.type === 'star') {
                                // Magnitude schaal: lager is groter/feller.
                                // Sirius (-1.46) -> Groot, Dim (6) -> Klein
                                // Scale: 1.5 tot 4px?
                                const size = Math.max(1, 4 - (obj.magnitude || 0));
                                const opacity = Math.min(1, Math.max(0.3, 1 - ((obj.magnitude || 0) / 4)));
                                
                                return (
                                    <div 
                                        key={`star-${idx}`}
                                        className="absolute flex flex-col items-center pointer-events-none"
                                        style={{
                                            left: `${pos.left}%`,
                                            bottom: `${pos.bottom}%`,
                                            transform: 'translate(-50%, 50%)'
                                        }}
                                    >
                                        <div 
                                            className="rounded-full bg-white shadow-[0_0_2px_rgba(255,255,255,0.8)]"
                                            style={{
                                                width: `${size}px`,
                                                height: `${size}px`,
                                                opacity: opacity,
                                            }}
                                        />
                                        <span className="text-[7px] text-white/40 mt-1 whitespace-nowrap font-light uppercase tracking-tighter">
                                            {obj.name}
                                        </span>
                                    </div>
                                );
                            }

                            if (obj.type === 'planet') {
                                return (
                                    <div 
                                        key={`planet-${idx}`}
                                        className="absolute rounded-full flex items-center justify-center"
                                        style={{
                                            left: `${pos.left}%`,
                                            bottom: `${pos.bottom}%`,
                                            width: `${(obj.size || 5) * 3}px`, // Iets groter maken voor zichtbaarheid
                                            height: `${(obj.size || 5) * 3}px`,
                                            backgroundColor: obj.color,
                                            boxShadow: `0 0 10px ${obj.color}`,
                                            transform: 'translate(-50%, 50%)'
                                        }}
                                    >
                                        <span className="text-[8px] text-white/80 absolute -bottom-4 whitespace-nowrap">{obj.name}</span>
                                    </div>
                                );
                            }

                            if (obj.type === 'moon') {
                                // Simpele maan representatie
                                return (
                                    <div 
                                        key="moon"
                                        className="absolute rounded-full bg-gray-200 flex items-center justify-center"
                                        style={{
                                            left: `${pos.left}%`,
                                            bottom: `${pos.bottom}%`,
                                            width: '40px',
                                            height: '40px',
                                            boxShadow: '0 0 15px rgba(255,255,255,0.5)',
                                            transform: 'translate(-50%, 50%)'
                                        }}
                                    >
                                        <Icon name="dark_mode" className="text-gray-800 text-xl" />
                                        <span className="text-[10px] text-white/80 absolute -bottom-5">{obj.name}</span>
                                    </div>
                                );
                            }
                            
                            if (obj.type === 'sun') {
                                return (
                                     <div 
                                        key="sun"
                                        className="absolute rounded-full bg-yellow-400 flex items-center justify-center"
                                        style={{
                                            left: `${pos.left}%`,
                                            bottom: `${pos.bottom}%`,
                                            width: '60px',
                                            height: '60px',
                                            boxShadow: '0 0 40px rgba(255, 200, 0, 0.8)',
                                            transform: 'translate(-50%, 50%)'
                                        }}
                                    >
                                    </div>
                                );
                            }

                            return null;
                        })}
                        
                        {/* Kompas aanduiding op horizon */}
                        <div className="absolute bottom-2 w-full flex justify-between px-4 text-white/30 font-mono text-xs pointer-events-none">
                            {/* Dynamische markers op basis van viewDirection? 
                                Of gewoon statische tekst die meebeweegt? 
                                Laten we simple houden: center label is huidige richting.
                            */}
                            <div className="absolute left-1/2 bottom-10 transform -translate-x-1/2 text-white/50 font-bold text-xl">
                                {t(DIRECTIONS.find(d => d.id === viewDirection)?.labelKey || 'dir.long.Z')}
                            </div>
                        </div>
                    </div>

                    {/* Layer 3: Horizon Image */}
                    <img 
                        src="/horizon.png" 
                        alt="Horizon" 
                        className="absolute bottom-0 left-0 w-full z-20 pointer-events-none object-cover h-[30%] opacity-90"
                        style={{ maskImage: 'linear-gradient(to top, black 80%, transparent 100%)' }}
                    />
                </div>

                {/* Controls Panel */}
                <div className="bg-[#08121a] border-t border-white/10 p-6 z-50">
                    <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-8 items-center justify-between">
                        
                        {/* Windrichting Controls */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500 uppercase mr-2">{t('horizon.view_direction')}</span>
                            <div className="flex bg-white/5 rounded-lg p-1 border border-white/5">
                                {DIRECTIONS.map(dir => (
                                    <button
                                        key={dir.id}
                                        onClick={() => setViewDirection(dir.id as any)}
                                        className={`w-10 h-10 rounded-md text-sm font-bold transition-all ${
                                            viewDirection === dir.id 
                                            ? 'bg-indigo-600 text-white shadow-lg' 
                                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        {t(dir.labelKey)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tijd Slider */}
                        <div className="flex-1 w-full max-w-md space-y-2">
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-slate-500 uppercase">{t('horizon.time')}</span>
                                <span className="text-indigo-400 font-mono">
                                    {timeOffset === 0 ? t('horizon.time_now') : (timeOffset > 0 ? `+${timeOffset}u` : `${timeOffset}u`)}
                                </span>
                            </div>
                            <input 
                                type="range" 
                                min="-12" 
                                max="12" 
                                step="1"
                                value={timeOffset}
                                onChange={(e) => setTimeOffset(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                            <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                                <span>-12u</span>
                                <span className="cursor-pointer hover:text-white" onClick={() => setTimeOffset(0)}>{t('reset')}</span>
                                <span>+12u</span>
                            </div>
                        </div>
                    </div>
                </div>
             </div>
        </Modal>
    );
};
