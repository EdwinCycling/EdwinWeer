import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip = ({ content, children, position = 'bottom' }: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const updatePosition = () => {
    const el = targetRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const offset = 8;

    switch (position) {
      case 'top':
        setCoords({
          top: rect.top - offset,
          left: rect.left + rect.width / 2,
        });
        break;
      case 'bottom':
        setCoords({
          top: rect.bottom + offset,
          left: rect.left + rect.width / 2,
        });
        break;
      case 'left':
        setCoords({
          top: rect.top + rect.height / 2,
          left: rect.left - offset,
        });
        break;
      case 'right':
        setCoords({
          top: rect.top + rect.height / 2,
          left: rect.right + offset,
        });
        break;
      default:
        setCoords({
          top: rect.bottom + offset,
          left: rect.left + rect.width / 2,
        });
    }
  };

  useEffect(() => {
    if (!isVisible) return;

    updatePosition();

    const handle = () => updatePosition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);

    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [isVisible, position]);

  const transform = useMemo(() => {
    switch (position) {
      case 'top':
        return 'translate(-50%, -100%)';
      case 'bottom':
        return 'translate(-50%, 0)';
      case 'left':
        return 'translate(-100%, -50%)';
      case 'right':
        return 'translate(0, -50%)';
      default:
        return 'translate(-50%, 0)';
    }
  }, [position]);

  const setTargetNode = (node: HTMLElement | null) => {
    targetRef.current = node;
  };

  const child = useMemo(() => {
    if (!React.isValidElement(children)) {
      return (
        <span
          ref={setTargetNode as any}
          className="inline-flex"
          onMouseEnter={() => {
            setIsVisible(true);
            updatePosition();
          }}
          onMouseLeave={() => setIsVisible(false)}
          onFocus={() => {
            setIsVisible(true);
            updatePosition();
          }}
          onBlur={() => setIsVisible(false)}
        >
          {children}
        </span>
      );
    }

    const el: any = children;
    const existingEnter = el.props?.onMouseEnter;
    const existingLeave = el.props?.onMouseLeave;
    const existingFocus = el.props?.onFocus;
    const existingBlur = el.props?.onBlur;
    const existingRef = el.ref;

    const mergedRef = (node: any) => {
      setTargetNode(node);

      if (typeof existingRef === 'function') {
        existingRef(node);
      } else if (existingRef && typeof existingRef === 'object') {
        existingRef.current = node;
      }
    };

    return React.cloneElement(el, {
      ref: mergedRef,
      onMouseEnter: (e: any) => {
        if (typeof existingEnter === 'function') existingEnter(e);
        setIsVisible(true);
        updatePosition();
      },
      onMouseLeave: (e: any) => {
        if (typeof existingLeave === 'function') existingLeave(e);
        setIsVisible(false);
      },
      onFocus: (e: any) => {
        if (typeof existingFocus === 'function') existingFocus(e);
        setIsVisible(true);
        updatePosition();
      },
      onBlur: (e: any) => {
        if (typeof existingBlur === 'function') existingBlur(e);
        setIsVisible(false);
      },
    });
  }, [children, content, position]);

  return (
    <>
      {child}
      {isMounted && isVisible && coords &&
        createPortal(
          <div
            className="fixed z-[9999] px-2 py-1 text-xs font-medium text-white bg-slate-800 rounded shadow-lg whitespace-nowrap pointer-events-none"
            style={{ top: coords.top, left: coords.left, transform }}
          >
            {content}
            <div
              className={`absolute w-2 h-2 bg-slate-800 transform rotate-45 
                ${position === 'top' ? 'bottom-[-4px] left-1/2 -translate-x-1/2' : ''}
                ${position === 'bottom' ? 'top-[-4px] left-1/2 -translate-x-1/2' : ''}
                ${position === 'left' ? 'right-[-4px] top-1/2 -translate-y-1/2' : ''}
                ${position === 'right' ? 'left-[-4px] top-1/2 -translate-y-1/2' : ''}
              `}
            />
          </div>,
          document.body
        )}
    </>
  );
};
