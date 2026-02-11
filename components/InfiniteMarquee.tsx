import React from 'react';

interface Props {
    children: React.ReactNode;
    speed?: number; // Seconden voor 1 loop
    direction?: 'left' | 'right';
    className?: string; // Voor achtergrondkleur/hoogte
}

export const InfiniteMarquee: React.FC<Props> = ({ 
    children, 
    speed = 20, 
    direction = 'left', 
    className = '' 
}) => {
    return (
        <div className={`overflow-hidden w-full ${className}`}>
            <div 
                className={`flex whitespace-nowrap will-change-transform animate-scroll-${direction}`}
                style={{ 
                    animationDuration: `${speed}s`,
                    width: 'max-content'
                }}
            >
                {/* Original Set */}
                <div className="flex shrink-0 items-center">
                    {children}
                </div>

                {/* Duplicate Set for Seamless Loop */}
                <div className="flex shrink-0 items-center">
                    {children}
                </div>
            </div>
        </div>
    );
};
