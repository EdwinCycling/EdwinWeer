import React from 'react';
import { ComfortScore } from '../services/weatherService';

interface Props {
  score: ComfortScore;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  label?: string;
}

export const WeatherRatingButton: React.FC<Props> = ({ score, onClick, className, label = "Weer Cijfer" }) => {
  return (
    <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center bg-white/60 dark:bg-white/10 backdrop-blur-md rounded-xl p-2 border border-slate-200 dark:border-white/10 shadow-sm w-[80px] h-[100px] hover:bg-white/80 dark:hover:bg-white/20 transition-colors cursor-pointer group hover:scale-105 transform duration-200 ${className || ''}`}
    >
        <span className={`text-3xl font-bold ${score.colorClass.replace('bg-', 'text-').replace('text-white', '')}`}>{score.score}</span>
        <span className="text-[9px] uppercase text-slate-500 dark:text-white/60 text-center leading-tight mt-1">{label}</span>
    </button>
  );
};
