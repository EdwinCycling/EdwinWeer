import React from 'react';
import './WhatsNew.css';

interface Props {
  onClick: () => void;
  visible: boolean;
}

export const WhatsNewButton: React.FC<Props> = ({ onClick, visible }) => {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="gift-button fixed bottom-[220px] right-4 md:bottom-60 md:right-8 z-[1400] w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-transform active:scale-95 cursor-pointer"
      aria-label="What's New"
    >
      🎁
    </button>
  );
};
