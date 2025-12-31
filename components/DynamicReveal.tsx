import React, { useState, useEffect, useRef } from 'react';

export type RevealShape = 'keyhole' | 'explosion' | 'cloud' | 'moon';

interface Props {
  shape: RevealShape;
  baseImage: string;
  revealImage: string;
  className?: string;
}

export const DynamicReveal: React.FC<Props> = ({ shape, baseImage, revealImage, className = '' }) => {
  const [position, setPosition] = useState({ x: -2000, y: -2000 });
  const [isVisible, setIsVisible] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        setViewport({ width: window.innerWidth, height: window.innerHeight });
    }
    
    const handleResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let frame: number;
    const animate = () => {
      setTick(t => t + 1);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const handlePointerMove = (e: React.PointerEvent) => {
    setIsVisible(true);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const getMaskStyle = () => {
    if (!isVisible) return { opacity: 0 };
    
    const { x, y } = position;
    // const t = tick * 0.1; // unused for now but kept for potential animation
    
    let maskImage = '';
    const maskSize = '100% 100%';
    const maskPosition = '0 0';
    const maskRepeat = 'no-repeat';

    switch (shape) {
      case 'keyhole': {
        const totalH = viewport.height * 0.25; // Increased size slightly
        const r = totalH * 0.4;
        maskImage = `
          radial-gradient(circle at ${x}px ${y}px, black ${r}px, transparent ${r + 1}px),
          conic-gradient(from 155deg at ${x}px ${y + r * 0.2}px, black 50deg, transparent 0deg)
        `;
        break;
      }
      case 'explosion': {
         // SVG based explosion
         const size = 600;
         const points = 16;
         let d = `M ${size/2} ${size/2} `;
         for (let i = 0; i <= points * 2; i++) {
            const angle = (Math.PI * 2 * i) / (points * 2);
            const radius = i % 2 === 0 ? size/2 : size/4;
            // Add some jitter for "explosion" effect
            const jitter = Math.sin(tick * 0.1 + i) * 20; 
            const finalR = radius + jitter;
            const px = size/2 + Math.cos(angle) * finalR;
            const py = size/2 + Math.sin(angle) * finalR;
            d += `L ${px} ${py} `;
         }
         d += 'Z';
         
         const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <path d="${d}" fill="black" />
         </svg>`;
         
         const encoded = btoa(svg);
         maskImage = `url("data:image/svg+xml;base64,${encoded}")`;
         
         // Center the mask at cursor
         return {
             WebkitMaskImage: maskImage,
             maskImage: maskImage,
             WebkitMaskPosition: `${x - size/2}px ${y - size/2}px`,
             maskPosition: `${x - size/2}px ${y - size/2}px`,
             WebkitMaskSize: `${size}px ${size}px`,
             maskSize: `${size}px ${size}px`,
             WebkitMaskRepeat: 'no-repeat',
             maskRepeat: 'no-repeat',
         };
      }
      case 'cloud': {
        // Simple Cloud SVG
        const size = 500;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
            <path fill="black" d="M18.5,12c0-1.7-1.1-3.2-2.6-3.8C15.5,5.2,12.9,3,10,3C6.4,3,3.4,5.6,2.6,9C1.1,9.6,0,11.1,0,13c0,2.2,1.8,4,4,4h14.5c1.9,0,3.5-1.6,3.5-3.5S20.4,12,18.5,12z"/>
        </svg>`;
        const encoded = btoa(svg);
         maskImage = `url("data:image/svg+xml;base64,${encoded}")`;
         
         return {
             WebkitMaskImage: maskImage,
             maskImage: maskImage,
             WebkitMaskPosition: `${x - size/2}px ${y - size/2}px`,
             maskPosition: `${x - size/2}px ${y - size/2}px`,
             WebkitMaskSize: `${size}px ${size}px`,
             maskSize: `${size}px ${size}px`,
             WebkitMaskRepeat: 'no-repeat',
             maskRepeat: 'no-repeat',
         };
      }
      case 'moon': {
        const size = 450;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
            <path fill="black" d="M50 5 A45 45 0 1 0 95 50 A38 38 0 1 1 50 5 z" transform="rotate(-15 50 50)"/>
        </svg>`;
        const encoded = btoa(svg);
        maskImage = `url("data:image/svg+xml;base64,${encoded}")`;
        
         return {
             WebkitMaskImage: maskImage,
             maskImage: maskImage,
             WebkitMaskPosition: `${x - size/2}px ${y - size/2}px`,
             maskPosition: `${x - size/2}px ${y - size/2}px`,
             WebkitMaskSize: `${size}px ${size}px`,
             maskSize: `${size}px ${size}px`,
             WebkitMaskRepeat: 'no-repeat',
             maskRepeat: 'no-repeat',
         };
      }
    }

    return {
      WebkitMaskImage: maskImage,
      maskImage: maskImage,
      WebkitMaskSize: maskSize,
      maskSize: maskSize,
      WebkitMaskPosition: maskPosition,
      maskPosition: maskPosition,
      WebkitMaskRepeat: maskRepeat,
      maskRepeat: maskRepeat,
    };
  };

  return (
    <div 
        ref={containerRef}
        className={`relative w-full h-full overflow-hidden cursor-none touch-none ${className}`}
        onPointerMove={handlePointerMove}
        onPointerEnter={() => setIsVisible(true)}
        onPointerLeave={() => setIsVisible(false)}
    >
      {/* Base Image (Always Visible) - e.g. Hero */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-transform duration-100"
        style={{ backgroundImage: `url('${baseImage}')` }}
      />
      
      {/* Reveal Image (Visible only in mask) - e.g. Doorkijk */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-transform duration-100"
        style={{ 
            backgroundImage: `url('${revealImage}')`,
            ...getMaskStyle()
        }}
      />
      
      {/* Optional: Cursor Follower / Hint */}
      {isVisible && (
          <div 
            className="absolute pointer-events-none w-4 h-4 bg-white/50 rounded-full blur-sm mix-blend-overlay z-50"
            style={{ 
                left: position.x, 
                top: position.y,
                transform: 'translate(-50%, -50%)'
            }}
          />
      )}
    </div>
  );
};

export default DynamicReveal;
