import { ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import BottomSheet from "./BottomSheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Responsive dialog: renders as Dialog on desktop, BottomSheet on mobile (<768px).
 */
export default function ResponsiveDialog({ open, onOpenChange, title, children, footer, className }: Props) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={() => onOpenChange(false)} title={title} height="auto">
        <div className="space-y-4">
          {children}
          {footer && <div className="flex justify-end gap-2 pt-3 border-t">{footer}</div>}
        </div>
      </BottomSheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
