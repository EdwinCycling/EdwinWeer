import { motion } from "motion/react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

interface WeatherPhoto {
  url: string;
  title: string;
  position: string;
}

const weatherPhotos: WeatherPhoto[] = [
  {
    url: "https://images.unsplash.com/photo-1646180569870-fa21da251597?auto=format&fit=crop&q=80&w=1080",
    title: "Storm",
    position: "top-[10%] left-[5%]",
  },
  {
    url: "https://images.unsplash.com/photo-1649690855006-4f29f439b8dd?auto=format&fit=crop&q=80&w=1080",
    title: "Sunny",
    position: "top-[15%] right-[8%]",
  },
  {
    url: "https://images.unsplash.com/photo-1626710733869-0ad663e742fc?auto=format&fit=crop&q=80&w=1080",
    title: "Rain",
    position: "bottom-[25%] left-[10%]",
  },
  {
    url: "https://images.unsplash.com/photo-1570379510114-eeb67b4e50e1?auto=format&fit=crop&q=80&w=1080",
    title: "Lightning",
    position: "top-[40%] right-[5%]",
  },
  {
    url: "https://images.unsplash.com/photo-1700479654293-6c668828fdbd?auto=format&fit=crop&q=80&w=1080",
    title: "Sunset",
    position: "bottom-[15%] right-[12%]",
  },
  {
    url: "https://images.unsplash.com/photo-1642013352474-cc4e83d0802c?auto=format&fit=crop&q=80&w=1080",
    title: "Snow",
    position: "top-[60%] left-[15%]",
  },
];

export function WeatherPhotoShowcase() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {weatherPhotos.map((photo, index) => (
        <motion.div
          key={index}
          className={`absolute ${photo.position} w-48 h-48 md:w-64 md:h-64`}
          initial={{ opacity: 0, scale: 0, rotate: -180 }}
          animate={{
            opacity: [0, 0.6, 0.6, 0],
            scale: [0, 1, 1, 0.8],
            rotate: [0, 360],
            y: [0, -20, 0],
          }}
          transition={{
            duration: 12 + index * 2,  // 12-22 seconds
            delay: index * 0.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <div className="relative w-full h-full group">
            <motion.div whileHover={{ scale: 1.1, rotate: 5 }}>
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl backdrop-blur-sm border-2 border-white/30 overflow-hidden shadow-2xl">
                <ImageWithFallback
                  src={photo.url}
                  alt={photo.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p className="text-white font-bold text-lg drop-shadow-lg">
                    {photo.title}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
