import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Optional detail listing exactly what is about to be discarded. */
  consequences?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
}

/**
 * Generic "are you sure?" gate for actions that discard work.
 *
 * Deliberately spells out the consequence rather than asking a bare
 * "Are you sure?" — a prompt the user cannot evaluate is a prompt they learn
 * to dismiss without reading.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {consequences && consequences.length > 0 && (
          <DialogBody>
            <ul className="text-muted-foreground space-y-1.5 text-sm">
              {consequences.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-destructive mt-1.5 size-1 shrink-0 rounded-full bg-current" />
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </DialogBody>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
