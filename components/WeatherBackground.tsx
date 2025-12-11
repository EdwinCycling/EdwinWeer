
import React, { useEffect, useRef } from 'react';

interface Props {
  weatherCode: number;
  isDay: number;
}

export const WeatherBackground: React.FC<Props> = ({ weatherCode, isDay }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: any[] = [];
    let width = 0;
    let height = 0;
    let flashOpacity = 0; // For lightning

    // --- Weather Logic Helpers ---
    const isRainy = [51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode);
    const isSnowy = [71, 73, 75, 77, 85, 86].includes(weatherCode);
    const isCloudy = [1, 2, 3, 45, 48].includes(weatherCode);
    const isStormy = [95, 96, 99].includes(weatherCode);
    const isClear = weatherCode === 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      initParticles();
    };

    const initParticles = () => {
      particles = [];
      const particleCount = isStormy ? 150 : isRainy ? 120 : isSnowy ? 60 : isCloudy ? 15 : isClear && !isDay ? 100 : 0;

      for (let i = 0; i < particleCount; i++) {
        if (isRainy || isStormy) {
          particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            speed: Math.random() * 15 + 10,
            length: Math.random() * 20 + 10,
            opacity: Math.random() * 0.5 + 0.1
          });
        } else if (isSnowy) {
          particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            speed: Math.random() * 2 + 1,
            radius: Math.random() * 3 + 1,
            sway: Math.random() * 0.05
          });
        } else if (isCloudy) {
           particles.push({
             x: Math.random() * width,
             y: Math.random() * (height / 2), // Keep clouds mostly top half
             radius: Math.random() * 150 + 100,
             speed: Math.random() * 0.5 + 0.1,
             opacity: Math.random() * 0.3
           });
        } else if (isClear && !isDay) {
            // Stars
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 1.5,
                opacity: Math.random(),
                flickerSpeed: Math.random() * 0.02
            });
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Background Gradient Base
      const topColor = isDay 
        ? (isCloudy || isRainy ? '#586b7c' : '#13b6ec') 
        : '#0f172a';
      const bottomColor = isDay 
        ? (isCloudy || isRainy ? '#8fa3b7' : '#7dd3fc') 
        : '#1e293b';

      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, topColor);
      grad.addColorStop(1, bottomColor);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Draw Sun if clear Day
      if (isClear && isDay) {
          const sunX = width * 0.8;
          const sunY = height * 0.15;
          const time = Date.now() * 0.001;
          
          // Glow
          const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 200);
          sunGrad.addColorStop(0, 'rgba(253, 224, 71, 0.8)'); // Yellow
          sunGrad.addColorStop(0.4, 'rgba(253, 186, 116, 0.3)'); // Orangeish
          sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          
          ctx.fillStyle = sunGrad;
          ctx.beginPath();
          ctx.arc(sunX, sunY, 300, 0, Math.PI * 2);
          ctx.fill();

          // Core
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(sunX, sunY, 40 + Math.sin(time) * 2, 0, Math.PI * 2);
          ctx.fill();
      }

      // Lightning Flash
      if (isStormy) {
          if (Math.random() > 0.99 && flashOpacity <= 0) {
              flashOpacity = 0.8; // Trigger flash
          }
          if (flashOpacity > 0) {
              ctx.fillStyle = `rgba(255, 255, 255, ${flashOpacity})`;
              ctx.fillRect(0, 0, width, height);
              flashOpacity -= 0.05;
          }
      }

      // Draw Particles
      particles.forEach(p => {
        if (isRainy || isStormy) {
            ctx.strokeStyle = `rgba(174, 217, 255, ${p.opacity})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - 2, p.y + p.length); // Slight angle
            ctx.stroke();

            p.y += p.speed;
            p.x -= 0.5; // Wind
            if (p.y > height) {
                p.y = -p.length;
                p.x = Math.random() * width;
            }
            if (p.x < 0) p.x = width;

        } else if (isSnowy) {
            ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();

            p.y += p.speed;
            p.x += Math.sin(p.y * p.sway);
            if (p.y > height) {
                p.y = -5;
                p.x = Math.random() * width;
            }

        } else if (isCloudy) {
             const cloudGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
             cloudGrad.addColorStop(0, `rgba(255, 255, 255, ${p.opacity})`);
             cloudGrad.addColorStop(1, `rgba(255, 255, 255, 0)`);
             
             ctx.fillStyle = cloudGrad;
             ctx.beginPath();
             ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
             ctx.fill();

             p.x += p.speed;
             if (p.x - p.radius > width) {
                 p.x = -p.radius;
             }
        } else if (isClear && !isDay) {
            // Twinkle stars
            const flicker = Math.sin(Date.now() * p.flickerSpeed);
            const opacity = Math.max(0.1, Math.min(1, p.opacity + flicker * 0.3));
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [weatherCode, isDay]);

  return (
    <canvas 
        ref={canvasRef} 
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ opacity: 0.7 }}
    />
  );
};
