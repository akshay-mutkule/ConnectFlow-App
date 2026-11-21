import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  wordmarkClassName?: string;
}

const SIZE_CLASSES = {
  sm: 'w-7 h-7 rounded-[7px]',
  md: 'w-8 h-8 rounded-lg',
  lg: 'w-11 h-11 rounded-xl',
};

const TEXT_CLASSES = {
  sm: 'text-[17px]',
  md: 'text-xl',
  lg: 'text-2xl',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'sm',
  showWordmark = true,
  wordmarkClassName = '',
}) => {
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <div
        className={`${SIZE_CLASSES[size]} overflow-hidden bg-[#0F172A] shrink-0 ring-1 ring-slate-900/10`}
      >
        <img
          src="/src/assets/images/connectflow_mark_1795188877226.jpg"
          alt="ConnectFlow logo"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover scale-[1.6]"
        />
      </div>
      {showWordmark && (
        <span
          className={`font-display font-bold tracking-tight text-slate-900 ${TEXT_CLASSES[size]} ${wordmarkClassName}`}
        >
          ConnectFlow
        </span>
      )}
    </div>
  );
};
