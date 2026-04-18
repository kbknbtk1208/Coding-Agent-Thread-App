'use client';

import React, { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface ExpandableDockProps {
  headerContent: ReactNode;
  children: ReactNode;
  className?: string;
}

const ExpandableDock = ({ headerContent, children, className }: ExpandableDockProps) => {
  const [animationStage, setAnimationStage] = useState<
    | 'collapsed'
    | 'widthExpanding'
    | 'heightExpanding'
    | 'fullyExpanded'
    | 'contentFadingOut'
    | 'heightCollapsing'
    | 'widthCollapsing'
  >('collapsed');

  const containerRef = useRef<HTMLDivElement>(null);

  const handleExpand = () => {
    setAnimationStage('widthExpanding');
    setTimeout(() => setAnimationStage('heightExpanding'), 400);
    setTimeout(() => setAnimationStage('fullyExpanded'), 850);
  };

  const handleCollapse = () => {
    setAnimationStage('contentFadingOut');
    setTimeout(() => setAnimationStage('heightCollapsing'), 250);
    setTimeout(() => setAnimationStage('widthCollapsing'), 650);
    setTimeout(() => setAnimationStage('collapsed'), 1050);
  };

  const isCollapsed = animationStage === 'collapsed';
  const isExpanded = animationStage === 'fullyExpanded';
  const toggleDock = () => {
    if (isCollapsed) {
      handleExpand();
      return;
    }

    handleCollapse();
  };

  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    toggleDock();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && isExpanded) {
        handleCollapse();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded]);

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full px-4 sm:px-0">
      <motion.div
        ref={containerRef}
        initial={{
          width: 'min(90vw, 360px)',
          height: 64,
          borderRadius: 8,
        }}
        animate={{
          width:
            animationStage === 'collapsed' || animationStage === 'widthCollapsing'
              ? 'min(90vw, 360px)'
              : 'min(90vw, 720px)',
          height:
            animationStage === 'collapsed' ||
            animationStage === 'widthExpanding' ||
            animationStage === 'widthCollapsing'
              ? 64
              : 'min(80vh, 500px)',
          borderRadius: 8,
        }}
        transition={{
          width: { duration: 0.45, ease: [0.4, 0, 0.2, 1] },
          height: { duration: 0.45, ease: [0.25, 1, 0.5, 1] },
          borderRadius: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
        }}
        className={cn(
          'relative mx-auto flex flex-col-reverse overflow-hidden border border-white/[0.16] bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-42px_86px_rgba(0,0,0,0.34),0_28px_90px_rgba(0,0,0,0.48)] backdrop-blur-[48px]',
          className,
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(155deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.07)_34%,rgba(255,255,255,0.025)_62%,rgba(0,0,0,0.22)_100%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.58),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:42px_42px]"
        />
        <div
          onClick={toggleDock}
          onKeyDown={handleHeaderKeyDown}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          className="relative z-10 flex h-16 w-full shrink-0 cursor-pointer items-center gap-4 border-t border-white/[0.12] bg-black/[0.14] px-4 py-4 text-white outline-none transition hover:bg-white/[0.08] focus-visible:bg-white/[0.1] sm:px-6"
        >
          {headerContent}
        </div>
        <motion.div
          animate={{
            opacity: isExpanded ? 1 : 0,
            height: isExpanded ? 'auto' : 0,
          }}
          transition={{ duration: 0.3 }}
          className="relative z-10 flex flex-1 flex-col overflow-hidden bg-black/[0.08] p-4 sm:p-6"
        >
          <div className="fey-scrollbar overflow-y-hidden overflow-x-auto">{children}</div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ExpandableDock;
