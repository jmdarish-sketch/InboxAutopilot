"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = "success" | "error" | "info" | "undo";

export interface ToastData {
  id:       string;
  message:  string;
  variant:  ToastVariant;
  /** Called when the user clicks the undo button (only for variant "undo"). */
  onUndo?:  () => void;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, onUndo?: () => void) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const DURATION = 4000;

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const counter = useRef(0);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "success", onUndo?: () => void) => {
      const id = `toast-${++counter.current}`;
      setToasts(prev => [...prev, { id, message, variant, onUndo }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, DURATION);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container — fixed bottom-right */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2">
          {toasts.map(t => (
            <ToastItem key={t.id} data={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Single toast
// ---------------------------------------------------------------------------

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error:   "border-red-200 bg-red-50 text-red-800",
  info:    "border-gray-200 bg-white text-gray-800",
  undo:    "border-gray-200 bg-white text-gray-800",
};

function ToastItem({
  data,
  onDismiss,
}: {
  data:      ToastData;
  onDismiss: () => void;
}) {
  function handleUndo() {
    data.onUndo?.();
    onDismiss();
  }

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg animate-in slide-in-from-right ${VARIANT_STYLES[data.variant]}`}
      role="alert"
    >
      {/* Icon */}
      {data.variant === "success" && (
        <svg className="h-4 w-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      )}
      {data.variant === "error" && (
        <svg className="h-4 w-4 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      )}

      <span className="text-sm font-medium">{data.message}</span>

      {data.variant === "undo" && data.onUndo && (
        <button
          type="button"
          onClick={handleUndo}
          className="ml-2 rounded-lg bg-gray-900 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-gray-700"
        >
          Undo
        </button>
      )}

      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 text-gray-400 hover:text-gray-600"
        aria-label="Dismiss"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
