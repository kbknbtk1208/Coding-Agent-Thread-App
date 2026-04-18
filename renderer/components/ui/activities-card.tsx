'use client';

import { useState, useEffect, type FC, type ReactNode } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { ChevronUpIcon } from 'lucide-react';

export interface ActivityItemType {
  icon: ReactNode;
  title: string;
  desc: string;
  time: string;
}

export interface ActivitiesCardProps {
  headerIcon: ReactNode;
  title: string;
  subtitle: string;
  activities: ActivityItemType[];
}

const ActivityItem: FC<ActivityItemType> = ({ icon, title, desc, time }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-white/[0.07] sm:gap-4 sm:px-5"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.14] bg-white/[0.08] text-[#FFA16C] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl sm:h-12 sm:w-12">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] leading-tight font-bold text-white sm:text-[17px]">
          {title}
        </p>
        <p className="truncate text-[13px] text-[#868F97] sm:text-[15px]">{desc}</p>
      </div>

      <span className="pt-1 text-[11px] whitespace-nowrap text-[#868F97] sm:text-[13px]">
        {time}
      </span>
    </motion.div>
  );
};

export const ActivitiesCard: FC<ActivitiesCardProps> = ({
  headerIcon,
  title,
  subtitle,
  activities,
}) => {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <MotionConfig transition={{ type: 'spring', bounce: 0, duration: 0.6 }}>
      <motion.div
        layout
        className="w-xs overflow-hidden rounded-lg border border-white/[0.16] bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-28px_58px_rgba(0,0,0,0.28),0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-[36px] sm:w-sm"
      >
        <motion.button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 transition-colors sm:gap-3 sm:px-4 sm:py-3.5"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4">
            <motion.div
              initial={{
                width: isMobile ? 48 : 60,
                height: isMobile ? 48 : 60,
              }}
              animate={{
                width: open ? (isMobile ? 36 : 48) : isMobile ? 48 : 60,
                height: open ? (isMobile ? 36 : 48) : isMobile ? 48 : 60,
              }}
              className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.14] bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl"
            >
              <motion.span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(155deg,rgba(255,255,255,0.2),transparent_45%,rgba(0,0,0,0.16))]" />
              <motion.div animate={{ scale: open ? 0.7 : 1 }}>{headerIcon}</motion.div>
            </motion.div>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <motion.p layout className="truncate text-[16px] font-bold text-white sm:text-[17px]">
                {title}
              </motion.p>
              <AnimatePresence mode="popLayout" initial={false}>
                {!open && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: 0.3,
                      ease: 'easeOut',
                    }}
                    className="truncate text-[14px] text-[#868F97] sm:text-[15px]"
                  >
                    {subtitle}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.14] bg-white/[0.09] text-white"
          >
            <ChevronUpIcon className="size-5 text-white" />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-white/[0.12]"
            >
              <div className="py-2">
                {activities.map((item, i) => (
                  <ActivityItem key={i} {...item} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  );
};
