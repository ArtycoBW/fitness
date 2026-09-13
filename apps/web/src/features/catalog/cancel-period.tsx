"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function CancelPeriod({ path }: { path: string }) {
  const [open, setOpen] = useState(false),
    qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (reason: string) => post(path, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog"] });
      void qc.invalidateQueries({ queryKey: ["trainer-availability"] });
      setOpen(false);
      toast.success("Доступность восстановлена");
    },
  });
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Отменить период
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Восстановить доступность</DialogTitle>
            <DialogDescription>
              В этот период снова можно будет назначать занятия.
            </DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(
                String(new FormData(e.currentTarget).get("reason")),
              );
            }}
          >
            <Label htmlFor="cancel-reason">Причина</Label>
            <Input id="cancel-reason" name="reason" minLength={3} required />
            {mutation.error && (
              <p className="form-error">{mutation.error.message}</p>
            )}
            <Button disabled={mutation.isPending}>Подтвердить</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
