import React from 'react';

interface Props {
    countryCode: string;
    className?: string;
}

export const FlagIcon: React.FC<Props> = ({ countryCode, className = "w-6 h-4" }) => {
    const code = countryCode.toLowerCase();

    switch (code) {
        case 'nl':
            return (
                <svg viewBox="0 0 640 480" className={className}>
                    <path fill="#21468b" d="M0 0h640v480H0z"/>
                    <path fill="#fff" d="M0 0h640v320H0z"/>
                    <path fill="#ae1c28" d="M0 0h640v160H0z"/>
                </svg>
            );
        case 'en': // GB
            return (
                <svg viewBox="0 0 640 480" className={className}>
                    <path fill="#012169" d="M0 0h640v480H0z"/>
                    <path fill="#fff" d="M75 0l244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0h75z"/>
                    <path fill="#c8102e" d="M424 294l216 162v24H552L364 332v-38zM640 0v24L424 186v-38l216-148zM0 480v-24l216-162v38L0 480zM216 294L0 456v-24l216-162v24zM0 186V0h24l192 148v38L0 186z"/>
                    <path fill="#fff" d="M250 0h140v480H250zM0 170h640v140H0z"/>
                    <path fill="#c8102e" d="M280 0h80v480h-80zM0 200h640v80H0z"/>
                </svg>
            );
        case 'fr':
            return (
                <svg viewBox="0 0 640 480" className={className}>
                    <path fill="#fff" d="M0 0h640v480H0z"/>
                    <path fill="#002395" d="M0 0h213.3v480H0z"/>
                    <path fill="#ed2939" d="M426.7 0H640v480H426.7z"/>
                </svg>
            );
        case 'de':
            return (
                <svg viewBox="0 0 640 480" className={className}>
                    <path fill="#ffce00" d="M0 320h640v160H0z"/>
                    <path fill="#000" d="M0 0h640v160H0z"/>
                    <path fill="#d00" d="M0 160h640v160H0z"/>
                </svg>
            );
        case 'es':
            return (
                <svg viewBox="0 0 640 480" className={className}>
                    <path fill="#aa151b" d="M0 0h640v480H0z"/>
                    <path fill="#f1bf00" d="M0 120h640v240H0z"/>
                </svg>
            );
        default:
            return null;
    }
};
