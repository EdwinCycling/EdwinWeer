import { useEffect, useRef } from 'react';

interface SwipeConfig {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  threshold?: number;
}

export const useLocationSwipe = ({ onSwipeLeft, onSwipeRight, threshold = 50 }: SwipeConfig) => {
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);

  const minSwipeDistance = threshold;

  const onTouchStart = (e: TouchEvent) => {
    // Check if the target or any parent should block the swipe
    const target = e.target as HTMLElement;
    
    // Use closest to check for blocking classes/attributes up the tree
    // Also check for specific chart elements
    const isBlocked = 
      target.closest?.('.no-swipe') || 
      target.closest?.('[data-no-swipe="true"]') ||
      target.closest?.('.recharts-wrapper') ||
      target.tagName === 'CANVAS';

    if (isBlocked) {
      touchStart.current = null;
      return;
    }

    touchEnd.current = null; 
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    
    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      onSwipeLeft();
    }
    
    if (isRightSwipe) {
      onSwipeRight();
    }
  };

  useEffect(() => {
    // Attach to body to ensure we catch swipes even if elements have overflow
    const element = document.body;
    
    element.addEventListener('touchstart', onTouchStart);
    element.addEventListener('touchmove', onTouchMove);
    element.addEventListener('touchend', onTouchEnd);

    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight]);
};
