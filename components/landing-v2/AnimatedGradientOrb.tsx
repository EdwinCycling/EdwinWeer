import { motion } from "motion/react";

interface AnimatedGradientOrbProps {
  delay?: number;
  position: { x: string; y: string };
  colors: string[];
  size?: string;
}

export function AnimatedGradientOrb({
  delay = 0,
  position,
  colors,
  size = "400px",
}: AnimatedGradientOrbProps) {
  return (
    <motion.div
      className="absolute rounded-full blur-3xl opacity-30"
      style={{
        left: position.x,
        top: position.y,
        width: size,
        height: size,
        background: `radial-gradient(circle, ${colors.join(", ")})`,
      }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{
        scale: [0.8, 1.2, 0.8],
        opacity: [0.2, 0.4, 0.2],
        x: [0, 50, 0],
        y: [0, 30, 0],
      }}
      transition={{
        duration: 10,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}
