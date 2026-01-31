
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './Icon';
import { AuroraResult } from '../services/auroraService';
import { getTranslation } from '../services/translations';
import { AppLanguage } from '../types';

interface Props {
    data: AuroraResult;
    language: AppLanguage;
    onToggleNotification?: (enabled: boolean) => void;
    notificationEnabled?: boolean;
}

export const AuroraCard: React.FC<Props> = ({ data, language, onToggleNotification, notificationEnabled }) => {
    // Start collapsed if Kp is 0 (rounded)
    const isLowActivity = Math.round(data.kp) === 0;
    const [isExpanded, setIsExpanded] = useState(!isLowActivity);
    const [showTip, setShowTip] = useState(false);
    const t = (key: string) => getTranslation(key, language);

    // Color Logic
    const glowColor = isLowActivity ? 'transparent' :
                      data.color === 'purple' ? 'rgba(168, 85, 247, 0.4)' : 
                      data.color === 'red' ? 'rgba(239, 68, 68, 0.4)' : 
                      data.color === 'yellow' ? 'rgba(234, 179, 8, 0.4)' : 
                      'rgba(34, 197, 94, 0.2)';

    const borderColor = isLowActivity ? 'border-border-color' :
                        data.color === 'purple' ? 'border-purple-500' : 
                        data.color === 'red' ? 'border-red-500' : 
                        data.color === 'yellow' ? 'border-yellow-500' : 
                        'border-green-500';
    
    const textColor = isLowActivity ? 'text-text-muted' :
                      data.color === 'purple' ? 'text-purple-300' : 
                      data.color === 'red' ? 'text-red-300' : 
                      data.color === 'yellow' ? 'text-yellow-300' : 
                      'text-green-300';

    // Collapsed View (Kp 0)
    if (!isExpanded) {
        return (
            <motion.button 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setIsExpanded(true)}
                className={`w-full relative overflow-hidden rounded-xl bg-bg-card border ${borderColor} p-3 shadow-sm mb-6 grid grid-cols-3 items-center group cursor-pointer hover:bg-bg-card/80 transition-colors`}
                style={{ boxShadow: `0 0 10px ${glowColor}` }}
            >
                {/* Left - Icon */}
                <div className="flex justify-start">
                    <Icon name="sparkles" className={`w-5 h-5 ${isLowActivity ? 'text-text-muted' : 'text-green-400/70'}`} />
                </div>

                {/* Center - Title and Status */}
                <div className="text-center">
                    <h3 className="text-sm font-bold text-text-main">{t('aurora_title')}</h3>
                    <p className={`text-xs font-medium ${isLowActivity ? 'text-text-muted' : 'text-green-300/80'}`}>{t('aurora_quiet')}</p>
                </div>

                {/* Right - Kp and Arrow */}
                <div className="flex items-center justify-end gap-2">
                    <span className="text-xs font-bold text-text-muted">Kp {Math.round(data.kp)}</span>
                    <Icon name="expand_more" className="text-text-muted/40 group-hover:text-text-main transition-colors" />
                </div>
            </motion.button>
        );
    }

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative overflow-hidden rounded-xl bg-bg-card border ${borderColor} p-4 shadow-sm mb-6`}
            style={{ boxShadow: `0 0 30px ${glowColor}` }}
        >
            {/* Header */}
            <div className="grid grid-cols-3 items-center mb-6 relative z-10">
                {/* Left - Spacer or notification toggle if we wanted it here */}
                <div className="flex justify-start">
                    {/* Empty spacer to help center the middle column */}
                </div>
                
                {/* Center - Title and Label */}
                <div className="flex flex-col items-center cursor-pointer relative z-20" onClick={() => setIsExpanded(false)}>
                    <h3 className="text-xl font-bold text-text-main flex flex-col sm:flex-row items-center gap-2 sm:gap-3 justify-center text-center">
                        <Icon name="sparkles" className={`w-6 h-6 flex-shrink-0 ${isLowActivity ? 'text-text-muted' : 'text-green-400'}`} />
                        <span className="leading-snug break-words">{t('aurora_title')}</span>
                    </h3>
                    <p className={`text-sm ${textColor} font-medium mt-1 text-center`}>
                        {data.label}
                    </p>
                    <div className="mt-1 sm:hidden">
                        <Icon name="expand_less" className="text-text-muted opacity-50" />
                    </div>
                </div>
                
                {/* Right - Kp Meter */}
                <div className="flex justify-end items-start">
                    <div className="flex flex-col items-center flex-shrink-0 relative">
                        {/* Collapse Button (Desktop/Tablet) */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
                            className="absolute -top-3 -right-3 p-2 text-text-muted hover:text-text-main transition-colors hidden sm:block"
                        >
                            <Icon name="expand_less" />
                        </button>

                        <div className="relative w-16 h-8 overflow-hidden mt-1">
                            <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-gray-700 dark:border-gray-800 box-border"></div>
                            <div 
                                className={`absolute top-0 left-0 w-16 h-16 rounded-full border-4 ${borderColor} box-border origin-bottom transition-transform duration-1000`}
                                style={{ transform: `rotate(${(data.kp / 9) * 180 - 180}deg)` }}
                            ></div>
                        </div>
                        <span className="text-text-main font-bold mt-1">Kp {Math.round(data.kp)}</span>
                    </div>
                </div>
            </div>

            {/* Explanation */}
            <div className="mb-4 relative z-10">
                <p className="text-text-muted text-sm leading-relaxed">
                    {data.reason}
                </p>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between border-t border-border-color pt-4 relative z-10">
                
                {/* Compass */}
                <div className="flex items-center gap-3">
                    <div className="relative w-8 h-8 rounded-full border border-border-color flex items-center justify-center bg-bg-page flex-shrink-0">
                        <motion.div 
                            className="w-1 h-6 bg-gradient-to-t from-red-500 to-white"
                            style={{ clipPath: 'polygon(50% 0, 100% 100%, 50% 80%, 0 100%)' }}
                            animate={{ rotate: 0 }} // Static North UP
                        />
                        <span className="absolute -top-1 text-[8px] font-bold text-text-main bg-bg-page px-0.5">N</span>
                    </div>
                    <span className="text-xs text-text-muted max-w-[80px] leading-tight">
                        {t('aurora_look_north')}
                    </span>
                </div>

                {/* Pro Tip Button */}
                <button 
                    onClick={() => setShowTip(!showTip)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-page hover:bg-bg-page/80 border border-border-color transition-colors text-xs text-text-main font-medium cursor-pointer flex-shrink-0 shadow-sm"
                >
                    <Icon name="camera" className="w-4 h-4 flex-shrink-0" />
                    <span className="whitespace-nowrap pt-0.5">{t('aurora_pro_tip')}</span>
                </button>
            </div>

            {/* Pro Tip Expandable */}
            <AnimatePresence>
                {showTip && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-4 p-3 rounded-lg bg-bg-page/50 border border-border-color text-xs text-text-muted">
                            <h4 className="font-bold text-text-main mb-1 flex items-center gap-2">
                                <Icon name="camera" className="w-3 h-3" />
                                {t('aurora_camera_mode')}
                            </h4>
                            <p className="mb-2">{t('aurora_camera_tip_intro')}</p>
                            <ul className="list-disc list-inside space-y-1 text-text-muted/80">
                                <li>{t('aurora_camera_tip_1')}</li>
                                <li>{t('aurora_camera_tip_2')}</li>
                                <li>{t('aurora_camera_tip_3')}</li>
                                <li>{t('aurora_camera_tip_4')}</li>
                            </ul>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
