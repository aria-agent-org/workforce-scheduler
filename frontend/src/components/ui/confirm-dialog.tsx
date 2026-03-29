import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "./dialog";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  onClose?: () => void;
  onConfirm: () => void;
  onCancel?: () => void;
  title: string;
  description?: string;
  message?: string;
  confirmText?: string;
  confirmLabel?: string;
  cancelText?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
}

export function ConfirmDialog({
  open, onClose, onConfirm, onCancel, title,
  description, message,
  confirmText, confirmLabel,
  cancelText, cancelLabel,
  variant = "default",
}: ConfirmDialogProps) {
  const handleClose = () => { (onCancel || onClose)?.(); };
  const desc = description || message || "";
  const cText = confirmText || confirmLabel || "אישור";
  const xText = cancelText || cancelLabel || "ביטול";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {desc && <DialogDescription>{desc}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{xText}</Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => { onConfirm(); handleClose(); }}
          >
            {cText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
