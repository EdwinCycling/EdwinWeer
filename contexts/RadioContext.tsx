import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

interface RadioContextType {
    isPlaying: boolean;
    isFading: boolean;
    volume: number;
    url: string | null;
    play: (url?: string) => void;
    pause: () => void;
    setVolume: (vol: number) => void;
    startFadeIn: (url: string, duration?: number) => void;
    startFadeOut: (duration?: number) => void;
}

const RadioContext = createContext<RadioContextType | undefined>(undefined);

export const RadioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFading, setIsFading] = useState(false);
    const [volume, setVolumeState] = useState(0.5);
    const [url, setUrl] = useState<string | null>(null);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        audioRef.current = new Audio();
        audioRef.current.preload = "none";
        
        const handleEnded = () => setIsPlaying(false);
        const handleError = (e: any) => {
            console.error("Radio error", e);
            setIsPlaying(false);
        };
        
        audioRef.current.addEventListener('ended', handleEnded);
        audioRef.current.addEventListener('error', handleError);
        
        return () => {
            if (audioRef.current) {
                audioRef.current.removeEventListener('ended', handleEnded);
                audioRef.current.removeEventListener('error', handleError);
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        };
    }, []);

    // Sync volume
    useEffect(() => {
        if (audioRef.current && !isFading) {
            audioRef.current.volume = volume;
        }
    }, [volume, isFading]);

    const playPromiseRef = useRef<Promise<void> | null>(null);

    const play = (newUrl?: string) => {
        if (!audioRef.current) return;
        
        if (newUrl) {
            setUrl(newUrl);
            audioRef.current.src = newUrl;
        } else if (!audioRef.current.src && url) {
             audioRef.current.src = url;
        }

        if (audioRef.current.src) {
            audioRef.current.volume = volume;
            const promise = audioRef.current.play();
            playPromiseRef.current = promise;
            
            if (promise !== undefined) {
                promise
                    .then(() => {
                        setIsPlaying(true);
                    })
                    .catch(e => {
                        if (e.name === 'AbortError') {
                            // Ignore abort errors caused by rapid switching
                        } else {
                            console.error("Play failed", e);
                        }
                        // Only set playing false if this was the last requested play
                        if (playPromiseRef.current === promise) {
                            setIsPlaying(false);
                        }
                    });
            }
        }
    };

    const pause = () => {
        if (audioRef.current) {
            // Check if there is a pending play promise
            if (playPromiseRef.current) {
                playPromiseRef.current.then(() => {
                     if (audioRef.current) {
                         audioRef.current.pause();
                         setIsPlaying(false);
                     }
                }).catch(() => {
                    // If play failed, we are effectively paused or stopped
                    setIsPlaying(false);
                });
                playPromiseRef.current = null; // Clear ref
            } else {
                audioRef.current.pause();
                setIsPlaying(false);
            }
        }
    };
    
    const setVolume = (vol: number) => {
        setVolumeState(vol);
        if (audioRef.current && !isFading) {
            audioRef.current.volume = vol;
        }
    };

    const startFadeIn = (playUrl: string, duration = 10000) => {
        if (!audioRef.current) return;
        
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        setIsFading(true);
        setUrl(playUrl);
        
        audioRef.current.src = playUrl;
        audioRef.current.volume = 0;
        audioRef.current.play()
            .then(() => setIsPlaying(true))
            .catch(e => console.error("Fade in play failed", e));

        const steps = 50;
        const intervalTime = duration / steps;
        const volStep = volume / steps; // Target is current global volume
        let currentVol = 0;

        fadeIntervalRef.current = setInterval(() => {
            currentVol += volStep;
            if (currentVol >= volume) {
                currentVol = volume;
                setIsFading(false);
                if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
            }
            if (audioRef.current) audioRef.current.volume = currentVol;
        }, intervalTime);
    };

    const startFadeOut = (duration = 10000) => {
         if (!audioRef.current) return;

         if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
         setIsFading(true);
         
         const steps = 50;
         const intervalTime = duration / steps;
         let currentVol = audioRef.current.volume;
         const volStep = currentVol / steps;

         fadeIntervalRef.current = setInterval(() => {
             currentVol -= volStep;
             if (currentVol <= 0) {
                 currentVol = 0;
                 setIsFading(false);
                 setIsPlaying(false);
                 if (audioRef.current) audioRef.current.pause();
                 if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
             }
             if (audioRef.current) audioRef.current.volume = currentVol;
         }, intervalTime);
    };

    return (
        <RadioContext.Provider value={{ isPlaying, isFading, volume, url, play, pause, setVolume, startFadeIn, startFadeOut }}>
            {children}
        </RadioContext.Provider>
    );
};

export const useRadio = () => {
    const context = useContext(RadioContext);
    if (!context) {
        throw new Error('useRadio must be used within a RadioProvider');
    }
    return context;
};
