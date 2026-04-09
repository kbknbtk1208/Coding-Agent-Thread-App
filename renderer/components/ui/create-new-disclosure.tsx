'use client';

import { useState, type FC, type ReactNode } from 'react';
import {
  CalendarClock,
  FolderPlus,
  Goal,
  ListTodo,
  NotebookPen,
  Plus,
  Target,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface DisclosureItem {
  icon: ReactNode;
  label: string;
}

export interface CreateNewDisclosureProps {
  items?: DisclosureItem[];
  initialOpen?: boolean;
}

interface GridItemProps {
  icon: ReactNode;
  label: string;
}

const GridItem: FC<GridItemProps> = ({ icon, label }) => {
  return (
    <motion.button className="group flex flex-col items-center justify-center gap-1 sm:gap-1.5 rounded-[20px] sm:rounded-[24px] px-1 py-3 sm:py-4 transition-all duration-200 hover:bg-[#F4F2EA] dark:hover:bg-neutral-800/50">
      <div className="text-[#8B8B8B] transition-colors group-hover:text-[#4A4A4A] dark:text-neutral-500 dark:group-hover:text-neutral-300 [&>svg]:size-5 sm:[&>svg]:size-7">
        {icon}
      </div>
      <span className="text-[12px] sm:text-[14px] font-medium tracking-tight text-[#4A4A4A] dark:text-neutral-400">
        {label}
      </span>
    </motion.button>
  );
};

export const CreateNewDisclosure: FC<CreateNewDisclosureProps> = ({
  items,
  initialOpen = false,
}) => {
  const [open, setOpen] = useState<boolean>(initialOpen);

  const defaultItems: DisclosureItem[] = [
    {
      icon: <FolderPlus strokeWidth={1.7} />,
      label: 'Project',
    },
    {
      icon: <ListTodo strokeWidth={1.7} />,
      label: 'Task',
    },
    {
      icon: <NotebookPen strokeWidth={1.7} />,
      label: 'Note',
    },
    {
      icon: <Goal strokeWidth={1.7} />,
      label: 'Goal',
    },
    {
      icon: <Target strokeWidth={1.7} />,
      label: 'Milestone',
    },
    {
      icon: <CalendarClock strokeWidth={1.7} />,
      label: 'Reminder',
    },
  ];

  const disclosureItems = items || defaultItems;

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {!open ? (
        <motion.button
          key="collapsed"
          layoutId="shared-container"
          onClick={() => setOpen(true)}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          style={{
            borderRadius: 32,
          }}
          transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}
          className="flex cursor-pointer items-center gap-2 bg-[#FAFBF8] px-6 py-3.5 sm:px-8 sm:py-4 text-base sm:text-lg font-medium whitespace-nowrap text-[#626360] dark:bg-neutral-900 dark:text-neutral-400"
        >
          <motion.div layoutId="label" className="flex items-center gap-2">
            <Plus
              size={24}
              className="text-[#626360] dark:text-neutral-400 sm:size-[26px]"
              strokeWidth={1.8}
            />
            Create New
          </motion.div>
        </motion.button>
      ) : (
        <motion.div
          key="expanded"
          layoutId="shared-container"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: { duration: 0.1 },
          }}
          style={{
            borderRadius: 22,
          }}
          transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}
          className="h-full w-[calc(100vw-32px)] sm:w-sm bg-[#F7F5EE] p-1 dark:bg-neutral-900"
        >
          <div className="flex items-center justify-between px-4 py-3.5">
            <motion.p
              layoutId="label"
              className="text-[15px] sm:text-[16px] font-semibold text-[#5C5A56] dark:text-neutral-400"
            >
              Create New
            </motion.p>
            <motion.button
              onClick={() => setOpen(false)}
              whileTap={{ scale: 0.95 }}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-[#B8B5B0] dark:bg-neutral-700"
            >
              <X size={16} color="#ffffff" strokeWidth={2.5} />
            </motion.button>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-t-[20px] rounded-b-[20px] bg-white p-3 sm:p-4 shadow-sm dark:bg-neutral-950">
            {disclosureItems.map((item, index) => (
              <GridItem key={index} icon={item.icon} label={item.label} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
