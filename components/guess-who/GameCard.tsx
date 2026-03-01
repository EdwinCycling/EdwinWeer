
import React, { useState } from 'react';
import { useSpring, animated } from '@react-spring/three';
import { Html } from '@react-three/drei';
import { AppSettings } from '../../types';
import { convertPressure, convertPrecip, convertTemp, convertWind, getTempLabel, getWindUnitLabel } from '../../services/weatherService';
import { getCountryDisplayName } from '../../services/countries';

interface GameCardProps {
    position: [number, number, number];
    cityData: any;
    isFlipped: boolean;
    onToggle: () => void;
    mode?: 'card' | 'answer';
    answerData?: { question: string, result: boolean, timestamp: number };
    settings: AppSettings;
}

export const GameCard: React.FC<GameCardProps> = ({ position, cityData, isFlipped, onToggle, mode = 'card', answerData, settings }) => {
    // Animation for flipping
    // Rotate around X axis from 0 (upright) to Math.PI/2 (flat)
    // Pivot point logic:
    // The card should rotate around its bottom edge.
    // If the card height is H, and origin is center, we need to move geometry up by H/2, 
    // then rotate the group at the bottom position.
    
    const { rotation } = useSpring({
        rotation: isFlipped ? [Math.PI / 2, 0, 0] : [0, 0, 0],
        config: { mass: 5, tension: 400, friction: 40 }
    });

    const [hovered, setHovered] = useState(false);

    // Card dimensions
    const width = 1.8;
    const height = 2.4;
    const depth = 0.1;
    
    // Use standard onClick for better raycasting support in R3F
    const handleClick = (e: any) => {
        e.stopPropagation(); // Prevent clicking through to other cards
        if (!isFlipped && mode === 'card') {
            onToggle();
        }
    };

    const handlePointerOver = (e: any) => {
        e.stopPropagation();
        if (mode === 'card' && !isFlipped) {
            document.body.style.cursor = 'pointer';
            setHovered(true);
        }
    };

    const handlePointerOut = () => {
        document.body.style.cursor = 'auto';
        setHovered(false);
    };

    const countryName = getCountryDisplayName(cityData?.city?.country || '', settings.language);
    const tempMax = convertTemp(cityData.weather.tempMax, settings.tempUnit);
    const tempMin = convertTemp(cityData.weather.tempMin, settings.tempUnit);
    const rainSum = convertPrecip(cityData.weather.rainSum, settings.precipUnit);
    const windMax = convertWind(cityData.weather.windMax, settings.windUnit);
    const pressure = convertPressure(cityData.weather.pressure, settings.pressureUnit);

    return (
        <animated.group 
            position={position} 
            rotation={rotation as any} 
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
        >
            {/* The pivot wrapper - moves the card up so (0,0,0) is the bottom edge */}
            <group position={[0, height / 2, 0]}>
                {/* Frame/Border */}
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[width, height, depth]} />
                    <meshStandardMaterial color={hovered && !isFlipped ? "#3b82f6" : "#0066cc"} /> {/* Lighter blue on hover */}
                </mesh>

                {/* Inner Content (White background) */}
                <mesh position={[0, 0, depth / 2 + 0.01]}>
                    <planeGeometry args={[width - 0.2, height - 0.2]} />
                    <meshStandardMaterial color="white" />
                </mesh>

                {/* Invisible Hit Box - Slightly larger to ensure easy clicking */}
                {/* eslint-disable-next-line react/no-unknown-property */}
                <mesh position={[0, 0, 0]} visible={false}>
                    <boxGeometry args={[width, height, depth * 2]} />
                    {/* eslint-disable-next-line react/no-unknown-property */}
                    <meshBasicMaterial opacity={0} transparent />
                </mesh>

                {/* HTML Content */}
                <Html 
                    transform 
                    position={[0, 0, depth / 2 + 0.02]}
                    occlude="blending"
                    zIndexRange={[100, 0]}
                    scale={0.15} 
                    style={{
                        width: '308px',
                        height: '420px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px',
                        background: mode === 'answer' && answerData 
                            ? (answerData.result ? '#dcfce7' : '#fee2e2') 
                            : 'white',
                        borderRadius: '8px',
                        userSelect: 'none',
                        pointerEvents: 'auto', // Enable pointer events
                        cursor: 'pointer', // Show pointer cursor
                        border: 'none',
                        overflow: 'hidden',
                        boxShadow: 'inset 0 0 12px rgba(0,0,0,0.05)',
                        pointerEvents: 'none' // Html container ignores, inner div handles
                    }}
                >
                    <div 
                        style={{ 
                            width: '100%', 
                            height: '100%', 
                            pointerEvents: 'auto', 
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                            background: hovered && !isFlipped && mode === 'card' ? '#f0f9ff' : 'transparent'
                        }}
                        onClick={handleClick} 
                        onMouseEnter={(e) => { e.stopPropagation(); setHovered(true); }}
                        onMouseLeave={(e) => { e.stopPropagation(); setHovered(false); }}
                    >
                    {mode === 'answer' ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
                            <div style={{ fontSize: '56px', fontWeight: 900, color: answerData?.result ? '#16a34a' : '#dc2626' }}>
                                {answerData?.result ? 'JA' : 'NEE'}
                            </div>
                            <div style={{ fontSize: '18px', color: '#374151', textAlign: 'center', fontWeight: 600, lineHeight: '1.2' }}>
                                {answerData?.question || ''}
                            </div>
                        </div>
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
                            {hovered && !isFlipped && (
                                <div style={{ 
                                    position: 'absolute', 
                                    top: '50%', 
                                    left: '50%', 
                                    transform: 'translate(-50%, -50%)', 
                                    background: 'rgba(0,0,0,0.05)', 
                                    padding: '8px 16px', 
                                    borderRadius: '20px',
                                    fontWeight: 'bold',
                                    color: '#0044aa',
                                    pointerEvents: 'none',
                                    zIndex: 10
                                }}>
                                    KLIK OM TE DRAAIEN
                                </div>
                            )}
                            <div style={{ fontSize: '28px', fontWeight: 'bold', textAlign: 'center', color: 'black', lineHeight: '1.1', width: '100%', paddingTop: '4px' }}>
                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cityData.city.name}</div>
                                <div style={{ fontSize: '20px', fontWeight: 'normal', color: '#555', marginTop: '2px' }}>{countryName}</div>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', width: '100%', fontSize: '24px', color: '#333', fontWeight: '700', lineHeight: '1.4' }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {tempMax} {getTempLabel(settings.tempUnit)}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {tempMin} {getTempLabel(settings.tempUnit)}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {rainSum} {settings.precipUnit}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {Math.round(cityData.weather.sunPct)} %
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {windMax} {getWindUnitLabel(settings.windUnit)}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {pressure} {settings.pressureUnit}
                                </div>
                            </div>

                            <div style={{ fontSize: '18px', color: '#999', marginTop: '2px', textAlign: 'center' }}>Yesterday</div>
                        </div>
                    )}
                    </div>
                </Html>
                
                {/* Back of the card (Logo or pattern) */}
                <mesh position={[0, 0, -depth / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
                     <planeGeometry args={[width - 0.1, height - 0.1]} />
                     <meshStandardMaterial color="#e0e0e0" />
                </mesh>
            </group>
        </animated.group>
    );
};
