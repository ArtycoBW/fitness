"use client";
import {
  useSyncExternalStore,
  useState,
  useEffect,
  createContext,
  useContext,
  createElement,
  type ReactNode,
} from "react";
const LocalState = createContext<{
  params: URLSearchParams;
  set: (key: string, value: string) => void;
} | null>(null);
export function LocalViewState({
  children,
  initialSearch = "",
}: {
  children: ReactNode;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  return createElement(
    LocalState.Provider,
    {
      value: {
        params: new URLSearchParams(search),
        set: (key, value) =>
          setSearch((previous) => {
            const next = new URLSearchParams(previous);
            if (value) next.set(key, value);
            else next.delete(key);
            return next.toString();
          }),
      },
    },
    children,
  );
}
const subscribe = (callback: () => void) => {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
};
export function useUrlState() {
  const local = useContext(LocalState);
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  );
  const params = new URLSearchParams(search);
  const set = (key: string, value: string) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  return local ?? { params, set };
}
export function useDebounced<T>(value: T, delay = 300) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return current;
}
