import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../utils/cn';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: {
    bg: 'bg-accent-success-muted',
    border: 'border-accent-success/40',
    icon: 'text-accent-success',
    iconBg: 'bg-accent-success/20',
    progress: 'bg-accent-success',
  },
  error: {
    bg: 'bg-accent-error-muted',
    border: 'border-accent-error/40',
    icon: 'text-accent-error',
    iconBg: 'bg-accent-error/20',
    progress: 'bg-accent-error',
  },
  warning: {
    bg: 'bg-accent-warning-muted',
    border: 'border-accent-warning/40',
    icon: 'text-accent-warning',
    iconBg: 'bg-accent-warning/20',
    progress: 'bg-accent-warning',
  },
  info: {
    bg: 'bg-accent-info-muted',
    border: 'border-accent-info/40',
    icon: 'text-accent-info',
    iconBg: 'bg-accent-info/20',
    progress: 'bg-accent-info',
  },
};

function Toast({ toast, onDismiss }: ToastProps) {
  const Icon = iconMap[toast.type];
  const colors = colorMap[toast.type];
  const [progress, setProgress] = useState(100);
  const duration = toast.duration || 5000;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (toast.duration === 0) return;

    const startTime = Date.now();
    const updateInterval = 50;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onDismiss(toast.id);
      }
    }, updateInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [toast.id, toast.duration, onDismiss, duration]);

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-md',
        'animate-slide-up',
        colors.bg,
        colors.border
      )}
    >
      {/* Icon with colored background */}
      <div className={cn('flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center', colors.iconBg)}>
        <Icon className={cn('w-4 h-4', colors.icon)} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text-primary text-sm">{toast.title}</p>
        {toast.message && (
          <p className="text-sm text-text-secondary mt-0.5">{toast.message}</p>
        )}
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4 text-text-muted" />
      </button>

      {/* Progress bar */}
      {toast.duration !== 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl overflow-hidden bg-white/5">
          <div
            className={cn('h-full transition-all ease-linear', colors.progress)}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Toast Container Component
interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 w-96 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// Toast Store (using React state for simplicity)
let toastListeners: ((toasts: ToastMessage[]) => void)[] = [];
let toastState: ToastMessage[] = [];

function notifyListeners() {
  toastListeners.forEach((listener) => listener([...toastState]));
}

export const toast = {
  success: (title: string, message?: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    toastState = [...toastState, { id, type: 'success', title, message, duration }];
    notifyListeners();
    return id;
  },

  error: (title: string, message?: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    toastState = [...toastState, { id, type: 'error', title, message, duration }];
    notifyListeners();
    return id;
  },

  warning: (title: string, message?: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    toastState = [...toastState, { id, type: 'warning', title, message, duration }];
    notifyListeners();
    return id;
  },

  info: (title: string, message?: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    toastState = [...toastState, { id, type: 'info', title, message, duration }];
    notifyListeners();
    return id;
  },

  dismiss: (id: string) => {
    toastState = toastState.filter((t) => t.id !== id);
    notifyListeners();
  },

  dismissAll: () => {
    toastState = [];
    notifyListeners();
  },
};

// Hook to use toasts
export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>(toastState);

  useEffect(() => {
    toastListeners.push(setToasts);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setToasts);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);

  return { toasts, dismiss };
}

// Toaster Provider Component (should be placed at app root)
export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return <ToastContainer toasts={toasts} onDismiss={dismiss} />;
}
