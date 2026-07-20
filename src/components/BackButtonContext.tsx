import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

interface BackButtonContextValue {
  /** Whether any currently mounted page has its own back button. */
  hasPageBackButton: boolean;
  register: () => void;
  unregister: () => void;
}

const BackButtonContext = createContext<BackButtonContextValue | null>(null);

export const BackButtonProvider = ({ children }: { children: ReactNode }) => {
  const [count, setCount] = useState(0);
  const register = useCallback(() => setCount((c) => c + 1), []);
  const unregister = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  return (
    <BackButtonContext.Provider
      value={{ hasPageBackButton: count > 0, register, unregister }}
    >
      {children}
    </BackButtonContext.Provider>
  );
};

export const useBackButtonContext = () => {
  const ctx = useContext(BackButtonContext);
  if (!ctx) {
    throw new Error("useBackButtonContext must be used within BackButtonProvider");
  }
  return ctx;
};

/**
 * Call this in any component that renders a page-level back button.
 * The global menu will hide its own back button while this is mounted.
 */
export const useRegisterPageBackButton = (active: boolean) => {
  const { register, unregister } = useBackButtonContext();
  useEffect(() => {
    if (!active) return;
    register();
    return () => unregister();
  }, [active, register, unregister]);
};
