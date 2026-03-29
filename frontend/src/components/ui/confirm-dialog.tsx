import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "./dialog";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description,
  confirmText = "אישור", cancelText = "ביטול",
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{cancelText}</Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
