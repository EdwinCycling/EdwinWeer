
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Text } from '@react-three/drei';
import * as THREE from 'three';
import { GameCard } from './GameCard';
import { AppSettings } from '../../types';

interface BoardGameSceneProps {
    cards: any[];
    flippedState: Record<number, boolean>;
    onToggleCard: (index: number) => void;
    targetCard?: any;
    lastAnswer: { question: string; result: boolean; timestamp: number } | null;
    isAnswerVisible: boolean;
    settings: AppSettings;
    resetCameraTrigger: number;
}

const BoardModel: React.FC = () => {
    // A simple blue board with slots
    // 3 rows, 8 columns
    // Total width approx 8 * 2.2 = 17.6
    // Total depth approx 4 * 3 = 12 (now 4 rows)
    
    return (
        <group position={[0, -0.2, 0]}>
            {/* Base Plate - Made deeper for the extra row */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1.5]} receiveShadow>
                <planeGeometry args={[20, 15]} />
                <meshStandardMaterial color="#0044aa" roughness={0.4} metalness={0.1} />
            </mesh>
            
            {/* Ridges for cards - 3 main rows + 1 front row */}
            {[0, 1, 2].map((row) => (
                <mesh key={row} position={[0, 0.1, (row - 1) * 3 + 1.2]} rotation={[0, 0, 0]} castShadow receiveShadow>
                     <boxGeometry args={[18, 0.2, 0.4]} />
                     <meshStandardMaterial color="#003388" />
                </mesh>
            ))}

            {/* Special Front Slot for Target Card */}
            <mesh position={[0, 0.1, 7.2]} rotation={[0, 0, 0]} castShadow receiveShadow>
                 <boxGeometry args={[3, 0.2, 0.4]} />
                 <meshStandardMaterial color="#ffd700" /> {/* Gold slot for target */}
            </mesh>

            {/* BARO 3D Text */}
            <Text
                position={[-7, 0.4, 6]}
                rotation={[-Math.PI / 4, 0, 0]}
                fontSize={1.5}
                color="#ffd700"
                anchorX="center"
                anchorY="middle"
                characters="BARO"
            >
                BARO
            </Text>
        </group>
    );
};

export const BoardGameScene: React.FC<BoardGameSceneProps> = ({ cards, flippedState, onToggleCard, targetCard, lastAnswer, isAnswerVisible, settings, resetCameraTrigger }) => {
    // Calculate card positions
    // 3 rows (z), 8 cols (x)
    // Center at (0,0,0)
    
    const getPosition = (index: number): [number, number, number] => {
        const row = Math.floor(index / 8);
        const col = index % 8;
        
        // Row 0 is back (top), Row 2 is front (bottom)
        // Let's make Row 0 at z = -3, Row 1 at z = 0, Row 2 at z = 3
        const z = (row - 1) * 3;
        
        // Cols from left (-x) to right (+x)
        // Width ~16 total. -8 to +8.
        const x = (col - 3.5) * 2.2;
        
        return [x, 0, z];
    };

    const controlsRef = useRef<any>(null);

    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.reset();
        }
    }, [resetCameraTrigger]);

    const glRef = useRef<THREE.WebGLRenderer | null>(null);
    const [sceneKey, setSceneKey] = useState(0);

    const handleCreated = useCallback((state: { gl: THREE.WebGLRenderer }) => {
        glRef.current = state.gl;
    }, []);

    useEffect(() => {
        const renderer = glRef.current;
        if (!renderer) return;
        const element = renderer.domElement;
        const handleLost = (event: Event) => {
            event.preventDefault();
            setSceneKey(prev => prev + 1);
        };
        const handleRestored = () => {};
        element.addEventListener('webglcontextlost', handleLost);
        element.addEventListener('webglcontextrestored', handleRestored);
        return () => {
            element.removeEventListener('webglcontextlost', handleLost);
            element.removeEventListener('webglcontextrestored', handleRestored);
        };
    }, [sceneKey]);

    return (
        <Canvas key={sceneKey} shadows camera={{ position: [0, 10, 14], fov: 45 }} onCreated={handleCreated} dpr={[1, 1.5]}>
            <ambientLight intensity={0.7} />
            <spotLight 
                position={[10, 15, 10]} 
                angle={0.3} 
                penumbra={1} 
                intensity={1} 
                castShadow 
                shadow-mapSize-width={2048} 
                shadow-mapSize-height={2048}
            />
            <pointLight position={[-10, 5, -10]} intensity={0.5} />
            
            <group position={[0, 0, 0]}>
                <BoardModel />
                
                {cards.map((card, index) => (
                    <GameCard 
                        key={card.id}
                        position={getPosition(index)}
                        cityData={card}
                        isFlipped={!!flippedState[card.id]}
                        onToggle={() => onToggleCard(card.id)}
                        settings={settings}
                    />
                ))}

                {/* The Target Card (Hidden/Mystery Card) */}
                {targetCard && (
                    <group position={[0, 0, 7.2]}> {/* Updated to match the slot Z position */}
                        <GameCard 
                            key="target"
                            position={[0, 0, 0]} 
                            cityData={targetCard}
                            isFlipped={!isAnswerVisible}
                            onToggle={() => {}}
                            mode="answer"
                            answerData={lastAnswer || undefined}
                            settings={settings}
                        />
                    </group>
                )}
            </group>
            
            <ContactShadows position={[0, -0.1, 0]} opacity={0.4} scale={30} blur={2.5} far={4} />
            <Environment preset="city" />
            
            <OrbitControls 
                ref={controlsRef}
                minPolarAngle={0} 
                maxPolarAngle={Math.PI / 2.2} 
                minDistance={5} 
                maxDistance={30}
                enablePan={true}
                target={[0, 0, 2]} // Shift target slightly forward to include new row
            />
        </Canvas>
    );
};
