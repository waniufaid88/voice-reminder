"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";

interface CompleteReminderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void> | void;
  reminderTitle: string;
  isSubmitting?: boolean;
}

export function CompleteReminderDialog({
  isOpen,
  onClose,
  onConfirm,
  reminderTitle,
  isSubmitting = false,
}: CompleteReminderDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (isOpen) {
      setReason("");
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(reason.trim() || undefined);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSubmitting && !open && onClose()}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Mark Reminder as Done
              </DialogTitle>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-sm sm:max-w-md">
                {reminderTitle}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2">
          <label
            htmlFor="completion-reason"
            className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-between"
          >
            <span>Reason (optional)</span>
            <span className="text-[11px] text-zinc-400 font-normal">Optional</span>
          </label>
          <Textarea
            id="completion-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
            placeholder="Why are you marking this reminder as done? (e.g. Sent client invoice, completed code review...)"
            className="text-sm rounded-xl resize-none focus-visible:ring-emerald-500"
          />
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Teammates will be able to see your completion note.
          </p>
        </div>

        <DialogFooter className="mt-2 flex flex-row items-center justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-9 px-4 rounded-xl text-xs font-medium cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-9 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Marking Done...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Mark as Done</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
