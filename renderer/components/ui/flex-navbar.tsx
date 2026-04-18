'use client';

import React from 'react';
import { motion, AnimatePresence, type Easing } from 'motion/react';
import { ExternalLink, Play, X } from 'lucide-react';

interface NavLink {
  label: string;
  href: string;
}

interface MediaContent {
  type: 'image' | 'video';
  src: string;
  alt?: string;
  poster?: string;
  autoplay?: boolean;
  link?: string;
  linkTarget?: '_blank' | '_self';
}

export interface FlexNavbarProps {
  logo?: React.ReactNode;
  brandName?: string;
  tagline?: string;
  launchText?: string;
  navLinks?: NavLink[];
  media?: MediaContent;
  mediaButtonText?: string;
  onMediaClick?: () => void;
  collapsedWidth?: string;
  collapsedMaxWidth?: string;
  collapsedHeight?: string;
  expandedWidth?: string;
  expandedMaxWidth?: string;
  expandedHeight?: string;
  expandedHeightMobile?: string;
  animationDuration?: number;
  animationEasing?: Easing | Easing[];
  showThemeToggle?: boolean;
  onExpand?: (isExpanded: boolean) => void;
}

export function FlexNavbar({
  logo,
  brandName = 'STARTUP',
  tagline = 'The helpful software company',
  launchText = 'Launching 2026',
  navLinks = [
    { label: 'Technology', href: '#technology' },
    { label: 'Company', href: '#company' },
    { label: 'Careers', href: '#careers' },
    { label: 'Journal', href: '#journal' },
  ],
  media = {
    type: 'image',
    src: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
    alt: 'Product surface',
  },
  mediaButtonText = 'Open story',
  onMediaClick,
  collapsedWidth = '90vw',
  collapsedMaxWidth = '20rem',
  collapsedHeight = '3.75rem',
  expandedWidth = '95vw',
  expandedMaxWidth = '48rem',
  expandedHeight = '28rem',
  expandedHeightMobile = '31rem',
  animationDuration = 0.45,
  animationEasing = [0.4, 0, 0.2, 1],
  onExpand,
}: FlexNavbarProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleToggle = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      onExpand?.(next);
      return next;
    });
  };

  const handleMediaClick = () => {
    if (media.link) {
      window.open(media.link, media.linkTarget || '_blank', 'noopener,noreferrer');
    }
    onMediaClick?.();
  };

  return (
    <>
      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/42 backdrop-blur-[10px]"
            onClick={handleToggle}
          />
        ) : null}
      </AnimatePresence>

      <motion.nav
        initial={false}
        animate={
          isExpanded
            ? {
                width: expandedWidth,
                maxWidth: expandedMaxWidth,
                minHeight: isMobile ? expandedHeightMobile : expandedHeight,
                borderRadius: '8px',
              }
            : {
                width: collapsedWidth,
                maxWidth: collapsedMaxWidth,
                height: collapsedHeight,
                borderRadius: '8px',
              }
        }
        transition={{ duration: animationDuration, ease: animationEasing }}
        className="fixed left-1/2 top-4 z-50 -translate-x-1/2 overflow-hidden border border-white/[0.16] bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-34px_76px_rgba(0,0,0,0.32),0_30px_90px_rgba(0,0,0,0.48)] backdrop-blur-[44px]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(155deg,rgba(255,255,255,0.17)_0%,rgba(255,255,255,0.06)_42%,rgba(0,0,0,0.24)_100%)]" />
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]" />
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.14] bg-white/[0.09] text-[#FFA16C]">
              {logo ?? <span className="text-xs font-semibold">CA</span>}
            </div>
            <span className="text-sm font-semibold text-white">{brandName}</span>
          </div>

          <button
            type="button"
            onClick={handleToggle}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.14] bg-white/[0.08] text-white transition hover:bg-white/[0.12]"
            aria-label={isExpanded ? 'Close navigation' : 'Open navigation'}
          >
            {isExpanded ? (
              <X className="h-4 w-4" />
            ) : (
              <span className="text-lg leading-none">+</span>
            )}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.15, duration: 0.24 }}
              className="px-6 pb-6 pt-20 sm:px-10"
            >
              <div className="grid gap-8 md:grid-cols-[0.95fr_1.05fr]">
                <div className="flex flex-col gap-5">
                  <p className="max-w-sm text-sm leading-7 text-[#868F97]">{tagline}</p>
                  <div className="flex flex-col gap-3">
                    {navLinks.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        className="text-2xl font-semibold text-white transition hover:text-[#FFA16C]"
                        onClick={handleToggle}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-3 text-xs uppercase text-[#868F97]">
                    <span>{launchText}</span>
                    <span>PoC Surface</span>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                  <button
                    type="button"
                    onClick={handleMediaClick}
                    className="group relative overflow-hidden rounded-lg border border-white/[0.14] bg-white/[0.06] text-left"
                  >
                    {media.type === 'video' ? (
                      <video
                        src={media.src}
                        poster={media.poster}
                        autoPlay={media.autoplay}
                        muted
                        loop
                        playsInline
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <img
                        src={media.src}
                        alt={media.alt || 'Media content'}
                        className="aspect-video w-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                      <div className="rounded-lg border border-white/20 bg-white/12 px-4 py-2 text-xs font-semibold uppercase text-white backdrop-blur">
                        {mediaButtonText}
                      </div>
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white backdrop-blur transition group-hover:scale-105">
                        {media.link ? (
                          <ExternalLink className="h-4 w-4" />
                        ) : (
                          <Play className="ml-0.5 h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </button>
                  <p className="text-sm leading-7 text-[#868F97]">
                    Flexible disclosure style navigation for launch notes, product tours, and
                    media-driven landing sections.
                  </p>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.nav>
    </>
  );
}
