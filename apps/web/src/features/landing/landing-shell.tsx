"use client";
import { useState, type ReactNode } from "react";
import {
  WorkspaceModal,
  type WorkspaceOverlay,
} from "@/components/layout/workspace-modal";
import { ScrollCue } from "./scroll-cue";
export function LandingShell({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState<WorkspaceOverlay | null>(null);
  return (
    <>
      <div
        className="landing"
        onClickCapture={(event) => {
          const link = (event.target as HTMLElement).closest("a");
          if (
            !link ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            link.target === "_blank"
          )
            return;
          const url = new URL(link.href, window.location.href);
          if (
            url.origin !== window.location.origin ||
            !["/schedule", "/memberships"].includes(url.pathname)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          setOverlay({
            kind: url.pathname === "/schedule" ? "schedule" : "memberships",
            search: url.search,
          });
        }}
      >
        {children}
      </div>
      <ScrollCue suspended={!!overlay} />
      <WorkspaceModal
        overlay={overlay}
        close={() => setOverlay(null)}
        navigate={setOverlay}
      />
    </>
  );
}
