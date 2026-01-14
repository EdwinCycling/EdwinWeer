import React, { useState, useEffect } from 'react';
import { EmailSchedule, EmailScheduleDay, AppLanguage } from '../types';
import { Icon } from './Icon';
import { getTranslation } from '../services/translations';

interface Props {
    schedule: EmailSchedule | undefined;
    onUpdate: (schedule: EmailSchedule) => void;
    language?: AppLanguage;
    title?: string;
}

export const ScheduleConfig: React.FC<Props> = ({ 
    schedule: initialSchedule, 
    onUpdate, 
    language,
    title
}) => {
    const t = (key: string) => getTranslation(key, language || 'nl');
    
    const [schedule, setSchedule] = useState<EmailSchedule>(initialSchedule || {
        enabled: false,
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(d => ({
            day: d,
            breakfast: false,
            lunch: false,
            dinner: false
        }))
    });

    useEffect(() => {
        if (initialSchedule) {
            setSchedule(initialSchedule);
        } else {
             setSchedule({
                enabled: false,
                days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(d => ({
                    day: d,
                    breakfast: false,
                    lunch: false,
                    dinner: false
                }))
            });
        }
    }, [initialSchedule]);

    const countTotalScheduled = (sch: EmailSchedule) => {
        if (!sch.enabled) return 0;
        return sch.days.reduce((total, day) => {
            return total + (day.breakfast ? 1 : 0) + (day.lunch ? 1 : 0) + (day.dinner ? 1 : 0);
        }, 0);
    };

    const totalScheduled = countTotalScheduled(schedule);
    const isLimitReached = totalScheduled >= 7;

    const toggleScheduleDay = (dayIndex: number, slot: 'breakfast' | 'lunch' | 'dinner') => {
        const newDays = [...schedule.days];
        const day = { ...newDays[dayIndex] };
        
        // If unchecking, always allow
        if (day[slot]) {
            day[slot] = false;
        } else {
            // If checking, check limit
            if (totalScheduled >= 7) return;
            day[slot] = true;
        }
        
        newDays[dayIndex] = day;
        const newSchedule = { ...schedule, days: newDays };
        setSchedule(newSchedule);
        onUpdate(newSchedule);
    };

    const toggleEnabled = () => {
        const newSchedule = { ...schedule, enabled: !schedule.enabled };
        setSchedule(newSchedule);
        onUpdate(newSchedule);
    };

    return (
        <div className="bg-bg-card rounded-2xl p-4 border border-border-color shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-bold text-text-main">
                        {title || t('profile.schedule.title')}
                    </h3>
                    <p className="text-xs text-text-muted">
                        {t('profile.schedule.max_limit')}
                    </p>
                </div>
                <button
                    onClick={toggleEnabled}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        schedule.enabled ? 'bg-accent-primary' : 'bg-bg-input'
                    }`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-bg-card transition-transform ${
                            schedule.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>

            {schedule.enabled && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header */}
                    <div className="grid grid-cols-4 gap-2 text-xs font-medium text-text-muted mb-2">
                        <div>{t('profile.schedule.days')}</div>
                        <div className="text-center">🥞 {t('profile.schedule.breakfast').split(' ')[0]}</div>
                        <div className="text-center">🥪 {t('profile.schedule.lunch').split(' ')[0]}</div>
                        <div className="text-center">🍖 {t('profile.schedule.dinner').split(' ')[0]}</div>
                    </div>

                    {/* Days */}
                    {schedule.days.map((day, index) => (
                        <div key={day.day} className="grid grid-cols-4 gap-2 items-center">
                            <div className="text-sm text-text-main capitalize">
                                {t(`days.${day.day}`) === `days.${day.day}` ? day.day : t(`days.${day.day}`)}
                            </div>
                            {['breakfast', 'lunch', 'dinner'].map((slot) => {
                                const isChecked = (day as any)[slot];
                                const disabled = !isChecked && isLimitReached;
                                return (
                                    <div key={slot} className="flex justify-center">
                                        <button
                                            onClick={() => toggleScheduleDay(index, slot as any)}
                                            disabled={disabled}
                                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                                isChecked 
                                                    ? 'bg-accent-primary border-accent-primary text-text-inverse' 
                                                    : disabled
                                                        ? 'bg-bg-input border-border-color opacity-50 cursor-not-allowed'
                                                        : 'bg-bg-card border-border-color hover:border-accent-primary'
                                            }`}
                                        >
                                            {isChecked && <Icon name="check" className="text-xs" />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    <div className="pt-2 text-right">
                        <span className={`text-xs font-medium ${isLimitReached ? 'text-red-500' : 'text-text-muted'}`}>
                            {t('profile.schedule.total')}: {totalScheduled}/7
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
