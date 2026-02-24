import React from 'react';
import { ViewState, AppSettings } from '../types';
import { CreditFloatingButton } from './CreditFloatingButton';
import { BeatBaroFloatingButton } from './BeatBaroFloatingButton';
import { HighLowFloatingButton } from './HighLowFloatingButton';
import { FloatingRadioPlayer } from './FloatingRadioPlayer';
import { useRadio } from '../contexts/RadioContext';
import { WhatsNewButton } from '../src/components/WhatsNew/WhatsNewButton';

interface Props {
    currentView: ViewState;
    settings: AppSettings;
    onNavigate: (view: ViewState) => void;
    whatsNewVisible?: boolean;
    onWhatsNewClick?: () => void;
}

export const FloatingActionButtons: React.FC<Props> = ({ currentView, settings, onNavigate, whatsNewVisible, onWhatsNewClick }) => {
    const { isPlaying } = useRadio();

    // Define which views should show the FABs
    const mainViews = [
        ViewState.CURRENT,
        ViewState.FORECAST,
        ViewState.MAP,
        ViewState.ENSEMBLE,
        ViewState.RECORDS,
        ViewState.HISTORICAL,
        ViewState.HOURLY_DETAIL,
        ViewState.THIS_DAY,
        ViewState.YOUR_DAY,
        ViewState.IMMERSIVE_FORECAST,
        ViewState.BARO_WEERMAN,
        ViewState.BARO_STORYTELLER,
        ViewState.ACTIVITY_PLANNER,
        ViewState.CYCLING,
        ViewState.BARO_RIT_ADVIES,
        ViewState.WEATHER_FINDER,
        ViewState.LANDING_V2
    ];

    const showBeatBaro = mainViews.includes(currentView) && settings.enableBeatBaro !== false;
    const showHighLow = [ViewState.CURRENT, ViewState.FORECAST].includes(currentView) && settings.enableHighLowGame !== false;
    const showCredits = [
        ViewState.CURRENT, 
        ViewState.FORECAST, 
        ViewState.ENSEMBLE, 
        ViewState.HIGHLOW_GAME,
        ViewState.RECORDS,
        ViewState.HISTORICAL,
        ViewState.GLOBE,
        ViewState.AMBIENT,
        ViewState.BARO_RIT_ADVIES,
        ViewState.WEATHER_FINDER,
        ViewState.ACTIVITY_PLANNER,
        ViewState.BARO_WEERMAN,
        ViewState.BARO_STORYTELLER,
        ViewState.CYCLING,
        ViewState.YOUR_DAY,
        ViewState.THIS_DAY,
        ViewState.HOURLY_DETAIL
    ].includes(currentView);
    const showRadio = currentView !== ViewState.BIG_BEN && isPlaying;

    // Common styling for buttons to ensure they are same size/shape
    const btnClass = "bg-bg-card/90 backdrop-blur-md text-text-main rounded-full shadow-lg border border-border-color flex items-center justify-center hover:scale-105 transition-transform w-12 h-12 md:w-auto md:h-auto md:px-4 md:py-2 md:gap-2";
    
    // Specific overrides for active states/colors are handled inside the components, 
    // but we pass the base positioning/sizing class to override their default 'fixed' positioning.
    
    // We use a flex container to stack them
    return (
        <div className="fixed bottom-24 right-4 z-[100] flex flex-col-reverse gap-4 items-end pointer-events-none">
            {/* The buttons inside need pointer-events-auto */}
            
            {/* 1. Credits (Bottom) */}
            {showCredits && (
                <div className="pointer-events-auto">
                    <CreditFloatingButton 
                        onNavigate={onNavigate} 
                        settings={settings} 
                        currentView={currentView}
                        className={btnClass.replace('md:px-4 md:py-2', 'md:px-2 md:py-2')} // Credit button is slightly different
                    />
                </div>
            )}

            {/* 2. Beat Baro */}
            {showBeatBaro && (
                <div className="pointer-events-auto">
                    <BeatBaroFloatingButton 
                        onNavigate={onNavigate} 
                        settings={settings} 
                        className={btnClass}
                    />
                </div>
            )}

            {/* 3. High/Low */}
            {showHighLow && (
                <div className="pointer-events-auto">
                    <HighLowFloatingButton 
                        onClick={() => onNavigate(ViewState.HIGHLOW_GAME)} 
                        settings={settings} 
                        className={btnClass.replace('bg-bg-card/90', 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white')}
                    />
                </div>
            )}

            {/* 4. What's New (Gift) */}
            {whatsNewVisible && onWhatsNewClick && (
                <div className="pointer-events-auto">
                    <WhatsNewButton
                        visible={true}
                        onClick={onWhatsNewClick}
                        className={`${btnClass} text-2xl`}
                    />
                </div>
            )}

            {/* 5. Radio (Top) */}
            {showRadio && (
                <div className="pointer-events-auto">
                    <FloatingRadioPlayer 
                        visible={true}
                        className={`${btnClass.replace('bg-bg-card/90', 'bg-black/80').replace('border-border-color', 'border-[#E5C100]/30')} md:p-2 gap-2`}
                    />
                </div>
            )}
        </div>
    );
};
