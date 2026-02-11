import React from 'react';

export const TestMarquee: React.FC = () => {
  return (
    <div className="overflow-hidden bg-blue-500 p-4">
      <div 
        className="text-white text-2xl font-bold"
        style={{
          animation: 'simple-scroll 10s linear infinite',
          whiteSpace: 'nowrap',
          display: 'inline-block'
        }}
      >
        Dit is een test marquee - Dit is een test marquee - Dit is een test marquee - Dit is een test marquee
      </div>
      <style>{`
        @keyframes simple-scroll {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
};