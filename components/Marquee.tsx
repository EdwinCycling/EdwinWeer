import React, { useEffect, useState, useRef } from 'react';

interface MarqueeProps {
  speed?: number; // seconds for full scroll
  fontSize?: string;
  direction?: 'left' | 'right';
  content: string[];
  className?: string;
}

export const Marquee: React.FC<MarqueeProps> = ({
  speed = 20,
  fontSize = '1.5rem',
  direction = 'left',
  content,
  className = ''
}) => {
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    setAnimationKey(prev => prev + 1);
  }, [content]);

  if (!content || content.length === 0) return null;

  const allContent = [...content, ...content];
  const animationDuration = speed;
  const isReverse = direction === 'right';

  return (
    <div className={`overflow-hidden whitespace-nowrap relative ${className}`} style={{ fontSize }}>
      <div 
        style={{
          display: 'flex',
          animation: `marquee-${animationKey} ${animationDuration}s linear infinite`,
          animationDirection: isReverse ? 'reverse' : 'normal',
          whiteSpace: 'nowrap'
        }}
      >
        {allContent.map((item, i) => (
          <span 
            key={`${animationKey}-${i}`} 
            className="mx-8 inline-block" 
            dangerouslySetInnerHTML={{ __html: item }} 
          />
        ))}
      </div>
      
      <style>{`
        @keyframes marquee-${animationKey} {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};
