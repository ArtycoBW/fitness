"use client";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LocalViewState } from "@/lib/url-state";
const loading = () => (
  <div className="modal-loading" role="status">
    Открываем раздел…
  </div>
);
const loadSchedule = () =>
  import("@/features/schedule/schedule-page").then((m) => m.SchedulePage);
const loadPlans = () =>
  import("@/features/payments/public-plans").then((m) => m.PublicPlans);
const Schedule = dynamic(loadSchedule, { loading });
const Plans = dynamic(loadPlans, { loading });
export function preloadWorkspaceOverlay(pathname: string) {
  if (pathname === "/schedule") void loadSchedule().catch(() => {});
  if (pathname === "/memberships") void loadPlans().catch(() => {});
}
const Notifications = dynamic(
  () =>
    import("@/features/operations/notifications").then((m) => m.Notifications),
  { loading },
);
const Checkout = dynamic(
  () => import("@/features/payments/checkout").then((m) => m.Checkout),
  { loading },
);
const Confirmation = dynamic(
  () => import("@/features/payments/checkout").then((m) => m.ConfirmationPage),
  { loading },
);
export type WorkspaceOverlay = {
  kind: "schedule" | "memberships" | "notifications";
  search?: string;
};
export function WorkspaceModal({
  overlay,
  close,
  navigate,
}: {
  overlay: WorkspaceOverlay | null;
  close: () => void;
  navigate: (overlay: WorkspaceOverlay) => void;
}) {
  const [order, setOrder] = useState<string | null>(null),
    [payment, setPayment] = useState<string | null>(null);
  const qc = useQueryClient();
  const complete = useCallback(
    (id: string) => {
      setPayment(id);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["memberships"] });
    },
    [qc],
  );
  const title =
    overlay?.kind === "schedule"
      ? "Расписание клуба"
      : overlay?.kind === "memberships"
        ? payment
          ? "Подтверждение оплаты"
          : order
            ? "Оплата абонемента"
            : "Выберите абонемент"
        : "Уведомления";
  return (
    <Dialog
      open={!!overlay}
      onOpenChange={(open) => {
        if (!open) {
          close();
          setOrder(null);
          setPayment(null);
        }
      }}
    >
      <DialogContent
        className="workspace-modal"
        data-view={overlay?.kind}
        onClickCapture={(event) => {
          const link = (event.target as HTMLElement).closest("a");
          if (
            !link ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          const url = new URL(link.href, window.location.href);
          if (url.origin !== window.location.origin) return;
          if (url.pathname === "/memberships" || url.pathname === "/schedule") {
            event.preventDefault();
            event.stopPropagation();
            setOrder(null);
            setPayment(null);
            navigate({
              kind:
                url.pathname === "/memberships" ? "memberships" : "schedule",
              search: url.search,
            });
          } else if (!url.hash || url.pathname !== window.location.pathname) {
            close();
            setOrder(null);
            setPayment(null);
          }
        }}
      >
        <DialogHeader
          className={overlay?.kind === "schedule" ? "sr-only" : undefined}
        >
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Расписание, абонементы и услуги клуба
          </DialogDescription>
        </DialogHeader>
        <div className="workspace-modal-content">
          {overlay && (
            <LocalViewState
              key={overlay.kind + (overlay.search ?? "")}
              initialSearch={overlay.search}
            >
              {overlay.kind === "schedule" ? (
                <Schedule area="public" />
              ) : overlay.kind === "memberships" ? (
                payment ? (
                  <Confirmation id={payment} embedded />
                ) : order ? (
                  <Checkout id={order} embedded onComplete={complete} />
                ) : (
                  <Plans embedded onOrder={setOrder} />
                )
              ) : (
                <Notifications />
              )}
            </LocalViewState>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
