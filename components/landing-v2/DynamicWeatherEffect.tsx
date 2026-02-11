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
      const triggerFlash = () => {
        setFlash(true);
        setTimeout(() => setFlash(false), 50 + Math.random() * 100);
        
        // Potential second strike
        if (Math.random() > 0.5) {
          setTimeout(() => {
            setFlash(true);
            setTimeout(() => setFlash(false), 30 + Math.random() * 70);
          }, 150 + Math.random() * 200);
        }
      };

      const flashInterval = setInterval(() => {
        triggerFlash();
      }, 2000 + Math.random() * 4000);
      
      return () => clearInterval(flashInterval);
    }
  }, [weatherType]);

  // Rain drops
  const raindrops = Array.from({ length: 120 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: Math.random() * 2,
    duration: 0.7 + Math.random() * 0.4,
  }));

  // Snowflakes
  const snowflakes = Array.from({ length: 80 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: Math.random() * 5,
    duration: 5 + Math.random() * 5,
    size: 4 + Math.random() * 8,
    opacity: 0.2 + Math.random() * 0.5,
  }));

  // Wind lines
  const windLines = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    delay: Math.random() * 2,
    duration: 0.6 + Math.random() * 0.6,
    width: 50 + Math.random() * 150,
  }));

  // Sun rays
  const sunRays = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    angle: (i * 360) / 40,
    delay: Math.random() * 2,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Rain (Type 0, 2, 4) */}
      {(weatherType === 0 || weatherType === 2 || weatherType === 4) && raindrops.map((drop) => (
        <motion.div
          key={`rain-${drop.id}`}
          className={`absolute w-[1px] bg-blue-400/30 ${weatherType === 4 ? 'h-24 bg-blue-300/40' : 'h-16'}`}
          style={{ 
            left: drop.left,
            transform: (weatherType === 2 || weatherType === 4) ? 'rotate(15deg)' : 'none'
          }}
          initial={{ top: "-10%", opacity: 0 }}
          animate={{
            top: "110%",
            opacity: [0, 0.4, 0],
          }}
          transition={{
            duration: weatherType === 4 ? drop.duration * 0.7 : drop.duration,
            delay: drop.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Snow (Type 1) */}
      {weatherType === 1 && snowflakes.map((flake) => (
        <motion.div
          key={`snow-${flake.id}`}
          className="absolute bg-white rounded-full pointer-events-none"
          style={{ 
            left: flake.left,
            width: flake.size,
            height: flake.size,
            filter: 'blur(2px)',
            opacity: flake.opacity
          }}
          initial={{ top: "-10%", opacity: 0 }}
          animate={{
            top: "110%",
            opacity: [0, flake.opacity, flake.opacity, 0],
            x: [0, 40, -40, 0],
          }}
          transition={{
            duration: flake.duration,
            delay: flake.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Wind (Type 2, 4) */}
      {(weatherType === 2 || weatherType === 4) && windLines.map((line) => (
        <motion.div
          key={`wind-${line.id}`}
          className="absolute h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{ 
            top: line.top,
            width: line.width,
            transform: 'rotate(-10deg)'
          }}
          initial={{ right: "-50%", opacity: 0 }}
          animate={{
            right: "150%",
            opacity: [0, 0.3, 0],
          }}
          transition={{
            duration: weatherType === 4 ? line.duration * 0.5 : line.duration,
            delay: line.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Thunder Flash (Type 4) */}
      {weatherType === 4 && flash && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.1 }}
          className="fixed inset-0 bg-white/20 z-10"
        />
      )}

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
