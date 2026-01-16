import React, { useState, useEffect } from "react";
import { motion } from "motion/react";

interface Props {
    weatherCode: number;
    isDay: boolean;
    precipAmount?: number;
}

export function ImmersiveWeatherEffect({ weatherCode, isDay, precipAmount = 0 }: Props) {
    const isRain = [51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weatherCode);
    const isSnow = [71, 73, 75, 77, 85, 86].includes(weatherCode);
    const isThunder = [95, 96, 99].includes(weatherCode);
    
    // Intensity Logic based on precipAmount (mm)
    // 0.1mm = Very Light
    // 1-2mm = Moderate
    // >5mm = Heavy
    const isLightRain = precipAmount < 0.5;
    const isHeavyRain = precipAmount > 2.0;
    
    const [flash, setFlash] = useState(false);
    const [splats, setSplats] = useState<{id: number, x: number, y: number}[]>([]);

    useEffect(() => {
        if (isThunder) {
            const flashInterval = setInterval(() => {
                setFlash(true);
                setTimeout(() => setFlash(false), 150);
                setTimeout(() => {
                    setFlash(true);
                    setTimeout(() => setFlash(false), 100);
                }, 300);
            }, 3000 + Math.random() * 5000);
            return () => clearInterval(flashInterval);
        }
    }, [isThunder]);

    // Handle heavy rain splats on screen
    useEffect(() => {
        if (isHeavyRain && isRain) {
            const interval = setInterval(() => {
                if (document.hidden) return;
                const id = Date.now();
                setSplats(prev => [...prev.slice(-10), { id, x: Math.random() * 100, y: Math.random() * 100 }]);
                setTimeout(() => {
                    setSplats(prev => prev.filter(s => s.id !== id));
                }, 2000);
            }, 500);
            return () => clearInterval(interval);
        }
    }, [isHeavyRain, isRain]);

    // Rain drops configuration
    // Light rain: fewer drops, slower, smaller opacity
    // Heavy rain: more drops, faster, higher opacity
    const rainCount = isHeavyRain ? 200 : (isLightRain ? 40 : 100);
    const rainDurationBase = isLightRain ? 1.5 : (isHeavyRain ? 0.4 : 0.8);
    
    const raindrops = Array.from({ length: rainCount }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: Math.random() * 2,
        duration: rainDurationBase + Math.random() * 0.5,
        height: isLightRain ? 'h-8' : 'h-16', // Longer streaks for heavier rain
        opacity: isLightRain ? 0.3 : 0.7
    }));

    // Snowflakes
    const snowflakes = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: Math.random() * 3,
        duration: 3 + Math.random() * 2,
    }));

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            {/* Thunder Flash */}
            <div 
                className={`absolute inset-0 bg-white transition-opacity duration-75 ${flash ? 'opacity-30' : 'opacity-0'}`}
                style={{ zIndex: 30 }}
            />

            {/* Rain */}
            {isRain && raindrops.map((drop) => (
                <motion.div
                    key={`rain-${drop.id}`}
                    className={`absolute w-0.5 ${drop.height} bg-gradient-to-b from-blue-300/60 to-transparent`}
                    style={{ left: drop.left, opacity: drop.opacity }}
                    initial={{ top: "-10%" }}
                    animate={{
                        top: "110%",
                    }}
                    transition={{
                        duration: drop.duration,
                        delay: drop.delay,
                        repeat: Infinity,
                        ease: "linear",
                    }}
                />
            ))}

            {/* Screen Splats (Heavy Rain) */}
            {isHeavyRain && splats.map(splat => (
                <div 
                    key={splat.id}
                    className="absolute w-8 h-8 rounded-full bg-blue-400/20 blur-sm animate-ping"
                    style={{ left: `${splat.x}%`, top: `${splat.y}%`, animationDuration: '2s' }}
                />
            ))}

            {/* Snow */}
            {isSnow && snowflakes.map((flake) => (
                <motion.div
                    key={`snow-${flake.id}`}
                    className="absolute text-white text-xl blur-[1px]"
                    style={{ left: flake.left }}
                    animate={{
                        top: "110%",
                        opacity: [0, 1, 1, 0],
                        rotate: 360,
                        x: [0, 20, -20, 0],
                    }}
                    transition={{
                        duration: flake.duration,
                        delay: flake.delay,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                >
                    ❄
                </motion.div>
            ))}

            {/* Thunder */}
            {isThunder && (
                <>
                    <motion.div
                        className="absolute inset-0 bg-white pointer-events-none mix-blend-overlay"
                        animate={{ opacity: flash ? 0.3 : 0 }}
                        transition={{ duration: 0.1 }}
                    />
                    
                    {flash && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-1/4 top-0 w-1 h-[60vh] bg-gradient-to-b from-blue-100 via-white to-transparent"
                            style={{
                                filter: 'drop-shadow(0 0 20px rgba(255, 255, 255, 0.8))',
                                transform: 'rotate(10deg) skewX(-5deg)',
                                left: `${20 + Math.random() * 60}%`
                            }}
                        />
                    )}
                </>
            )}
        </div>
    );
}
