import { useState, useEffect } from "react";
import { motion } from "motion/react";

export function DynamicWeatherEffect() {
  const [weatherType, setWeatherType] = useState(0);
  const [flash, setFlash] = useState(false);

  // Cycle every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setWeatherType((prev) => (prev + 1) % 5);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Thunder flash effect
  useEffect(() => {
    if (weatherType === 4) {
      const flashInterval = setInterval(() => {
        setFlash(true);
        setTimeout(() => setFlash(false), 150);
        setTimeout(() => {
          setFlash(true);
          setTimeout(() => setFlash(false), 100);
        }, 300);
      }, 3000 + Math.random() * 2000);
      
      return () => clearInterval(flashInterval);
    }
  }, [weatherType]);

  // Rain drops
  const raindrops = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: Math.random() * 2,
    duration: 1 + Math.random() * 1,
  }));

  // Snowflakes
  const snowflakes = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: Math.random() * 3,
    duration: 3 + Math.random() * 2,
  }));

  // Wind lines
  const windLines = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    delay: Math.random() * 1.5,
    duration: 0.8 + Math.random() * 0.5,
  }));

  // Sun rays
  const sunRays = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    angle: (i * 360) / 40,
    delay: Math.random() * 2,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Rain */}
      {weatherType === 0 && raindrops.map((drop) => (
        <motion.div
          key={`rain-${drop.id}`}
          className="absolute w-0.5 h-12 bg-gradient-to-b from-blue-400/50 to-transparent"
          style={{ left: drop.left }}
          initial={{ top: "-10%", opacity: 0 }}
          animate={{
            top: "110%",
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: drop.duration,
            delay: drop.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Snow */}
      {weatherType === 1 && snowflakes.map((flake) => (
        <motion.div
          key={`snow-${flake.id}`}
          className="absolute text-white text-2xl"
          style={{ left: flake.left }}
          animate={{
            top: "110%",
            opacity: [0, 1, 1, 0],
            rotate: 360,
            x: [0, 30, -30, 0],  // Zigzag motion
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

      {/* Storm/Wind */}
      {weatherType === 2 && windLines.map((line) => (
        <motion.div
          key={`wind-${line.id}`}
          className="absolute h-0.5 w-24 bg-gradient-to-r from-transparent via-gray-400/40 to-transparent"
          style={{ 
            top: line.top,
            transform: 'rotate(-25deg)'
          }}
          initial={{ right: "-30%", opacity: 0 }}
          animate={{
            right: "130%",
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: line.duration,
            delay: line.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Sunny */}
      {weatherType === 3 && (
        <>
          <motion.div
            className="absolute top-10 right-10 w-96 h-96"
            animate={{
              rotate: 360,
              scale: [1, 1.15, 1],
            }}
            transition={{
              rotate: { duration: 20, repeat: Infinity, ease: "linear" },
              scale: { duration: 3, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            <div className="absolute inset-0 bg-yellow-300/40 rounded-full blur-3xl animate-pulse" />
            <div className="absolute inset-8 bg-yellow-400/50 rounded-full blur-2xl" />
            <div className="absolute inset-16 bg-yellow-500/60 rounded-full blur-xl" />
            <div className="absolute inset-24 bg-orange-400/70 rounded-full" />
          </motion.div>

          {sunRays.map((ray) => (
            <motion.div
              key={`ray-${ray.id}`}
              className="absolute top-10 right-10 w-2 origin-bottom"
              style={{
                height: `${250 + Math.random() * 100}px`,
                transform: `rotate(${ray.angle}deg) translateX(192px)`,
                transformOrigin: 'center center',
              }}
              animate={{
                opacity: [0.3, 0.8, 0.3],
                scaleY: [1, 1.4, 1],
              }}
              transition={{
                 duration: 2 + Math.random(),
                 repeat: Infinity,
                 ease: "easeInOut"
              }}
            >
              <div className="w-full h-full bg-gradient-to-t from-yellow-300/40 via-yellow-400/30 to-transparent" />
            </motion.div>
          ))}
          
          {Array.from({ length: 60 }).map((_, i) => (
            <motion.div
                key={`light-${i}`}
                className="absolute rounded-full"
                style={{
                width: `${4 + Math.random() * 6}px`,
                height: `${4 + Math.random() * 6}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                background: `radial-gradient(circle, ${
                    Math.random() > 0.5 ? 'rgba(255, 215, 0, 0.8)' : 'rgba(255, 255, 100, 0.8)'
                }, transparent)`,
                }}
                animate={{
                y: [0, -80 - Math.random() * 40, 0],
                x: [0, Math.random() * 60 - 30, 0],
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0],
                }}
                transition={{
                 duration: 2 + Math.random() * 2,
                 repeat: Infinity,
                 ease: "easeInOut"
                }}
            />
          ))}
        </>
      )}

      {/* Thunder */}
      {weatherType === 4 && (
        <>
          <motion.div
            className="absolute inset-0 bg-white pointer-events-none"
            animate={{ opacity: flash ? 0.6 : 0 }}
            transition={{ duration: 0.1 }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900/40 via-transparent to-transparent" />
          
          {flash && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.15 }}
              className="absolute left-1/4 top-0 w-1 h-96 bg-gradient-to-b from-blue-200 via-white to-transparent"
              style={{
                filter: 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.9))',
                transform: 'rotate(10deg) skewX(-5deg)',
              }}
            />
          )}

          {Array.from({ length: 80 }).map((_, i) => (
            <motion.div
                key={`thunder-rain-${i}`}
                className="absolute w-0.5 h-16 bg-gradient-to-b from-blue-300/60 to-transparent"
                style={{ left: `${Math.random() * 100}%` }}
                initial={{ top: "-10%", opacity: 0 }}
                animate={{
                    top: "110%",
                    opacity: [0, 1, 0],
                }}
                transition={{
                    duration: 0.5 + Math.random() * 0.5,
                    repeat: Infinity,
                    ease: "linear",
                }}
            />
          ))}

          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
                key={`cloud-${i}`}
                className="absolute w-64 h-32 bg-gray-700/30 rounded-full blur-2xl"
                animate={{
                x: [-100, (typeof window !== 'undefined' ? window.innerWidth : 1000) + 100],
                opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                duration: 15 + Math.random() * 10,
                repeat: Infinity,
                ease: "linear"
                }}
            />
          ))}
        </>
      )}

    </div>
  );
}
