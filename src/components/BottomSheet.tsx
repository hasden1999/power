import type { FC, ReactNode } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxHeight?: string;
}

export const BottomSheet: FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  subtitle,
  children,
  footer,
  maxHeight = 'max-h-[88vh]',
}) => {
  // منع تمرير الصفحة الخلفية عند فتح النافذة المنزلقة
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#040a1b]/80 backdrop-blur-md transition-opacity animate-fade-in">
      {/* خلفية قابلة للضغط للإغلاق السريع */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* الصفيحة السفلية المنزلقة */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 w-full max-w-lg bg-[#09173d] border-t border-x border-blue-800/60 rounded-t-3xl shadow-2xl flex flex-col ${maxHeight} transition-transform transform translate-y-0 duration-300 ease-out`}
      >
        {/* مقبض السحب المرئي (Drag Handle) */}
        <div className="pt-3 pb-1 flex justify-center cursor-pointer" onClick={onClose}>
          <div className="w-12 h-1.5 rounded-full bg-blue-700/60 hover:bg-blue-600 transition-colors" />
        </div>

        {/* رأس الصفيحة */}
        <div className="px-4 py-3 border-b border-blue-900/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-cyan-400 flex-shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-black text-white truncate leading-tight">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-blue-200/70 truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-blue-950/80 hover:bg-blue-900 text-blue-300 hover:text-white border border-blue-800/50 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
            aria-label="إغلاق النافذة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* محتوى الصفيحة القابل للتمرير بلمسة يد */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain">
          {children}
        </div>

        {/* تذييل الإجراءات السفلي (ثابت في متناول الإبهام) */}
        {footer && (
          <div className="p-3 sm:p-4 bg-slate-950/90 border-t border-slate-800/80 rounded-b-none pb-safe">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
