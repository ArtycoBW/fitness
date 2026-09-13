"use client";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
interface SidebarState {
  pinned: boolean;
  setPinned: (v: boolean) => void;
  open: boolean;
  setOpen: (value: boolean) => void;
  mobile: boolean;
  setMobile: (value: boolean) => void;
}
const Context = createContext<SidebarState | null>(null);
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("sidebar-preference", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("sidebar-preference", cb);
  };
};
export function useSidebar() {
  const value = useContext(Context);
  if (!value) throw new Error("Sidebar provider required");
  return value;
}
export function Sidebar({ children }: { children: React.ReactNode }) {
  const [hover, setOpen] = useState(false),
    [mobile, setMobile] = useState(false);
  const pinned = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem("stride-sidebar-pinned") !== "false";
      } catch {
        return true;
      }
    },
    () => true,
  );
  const setPinned = (v: boolean) => {
    try {
      localStorage.setItem("stride-sidebar-pinned", String(v));
      window.dispatchEvent(new Event("sidebar-preference"));
    } catch {
      /* Storage may be unavailable in a private browser. */
    }
    setOpen(false);
  };
  const open = pinned || hover;
  return (
    <Context.Provider
      value={{ open, setOpen, mobile, setMobile, pinned, setPinned }}
    >
      {children}
    </Context.Provider>
  );
}
export function SidebarBody({ children }: { children: React.ReactNode }) {
  const { open, setOpen, mobile, setMobile, pinned, setPinned } = useSidebar();
  const reduce = useReducedMotion();
  return (
    <>
      <motion.aside
        className="sidebar-desktop"
        onMouseEnter={() => {
          if (!pinned) setOpen(true);
        }}
        onMouseLeave={() => {
          if (!pinned) setOpen(false);
        }}
        onFocusCapture={() => {
          if (!pinned) setOpen(true);
        }}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
        animate={{ width: open ? 256 : 76 }}
        transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
      >
        <div className="sidebar-inner">
          {children}
          <button
            className="sidebar-toggle"
            onClick={() => setPinned(!pinned)}
            aria-label={pinned ? "Открепить меню" : "Закрепить меню"}
            aria-pressed={pinned}
          >
            {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            <span className={cn(!open && "sr-only")}>
              {pinned ? "Открепить меню" : "Закрепить меню"}
            </span>
          </button>
        </div>
      </motion.aside>
      <div className="sidebar-mobile">
        <Sheet open={mobile} onOpenChange={setMobile}>
          <SheetTrigger className="icon-button" aria-label="Открыть меню">
            <Menu size={22} />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-background p-5">
            <SheetTitle className="sr-only">Меню клуба</SheetTitle>
            <div className="flex h-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
        <Link href="/" className="brand">
          страйд<span>клуб движения</span>
        </Link>
      </div>
    </>
  );
}
export function SidebarLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  const { open, setMobile } = useSidebar();
  const path = usePathname();
  const active =
    path === href ||
    (href.split("/").length > 2 && path.startsWith(href + "/"));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          onClick={() => setMobile(false)}
          aria-current={active ? "page" : undefined}
          className={cn("sidebar-link", active && "is-active")}
          aria-label={label}
        >
          {icon}
          <span className={cn("sidebar-label", !open && "desktop-hidden")}>
            {label}
          </span>
        </Link>
      </TooltipTrigger>
      {!open && <TooltipContent side="right">{label}</TooltipContent>}
    </Tooltip>
  );
}
