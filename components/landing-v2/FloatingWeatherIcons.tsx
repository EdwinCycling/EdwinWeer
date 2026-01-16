import { motion } from "motion/react";
import { Cloud, CloudRain, Sun, Snowflake, Wind, Zap } from "lucide-react";

export function FloatingWeatherIcons() {
  const icons = [
    { Icon: Cloud, delay: 0, x: "10%", y: "20%" },
    { Icon: CloudRain, delay: 0.5, x: "80%", y: "15%" },
    { Icon: Sun, delay: 1, x: "15%", y: "70%" },
    { Icon: Snowflake, delay: 1.5, x: "85%", y: "65%" },
    { Icon: Wind, delay: 2, x: "60%", y: "80%" },
    { Icon: Zap, delay: 2.5, x: "40%", y: "25%" },
  ];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {icons.map(({ Icon, delay, x, y }, index) => (
        <motion.div
          key={index}
          className="absolute"
          style={{ left: x, top: y }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0.1, 0.3, 0.1],
            scale: [1, 1.2, 1],
            rotate: [0, 360],
            y: [0, -30, 0],
          }}
          transition={{
            duration: 8 + index * 2,  // Staggered duration (8-18s)
            delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Icon className="w-16 h-16 text-white/20" />
        </motion.div>
      ))}
    </div>
  );
}
