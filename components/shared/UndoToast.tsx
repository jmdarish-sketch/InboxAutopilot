"use client";

// ---------------------------------------------------------------------------
// UndoToast — re-exports the toast hook for convenience.
// The actual toast rendering is handled by ToastProvider.
// Usage: const { toast } = useToast();
//        toast("Archived 3 emails", "undo", () => handleUndo());
// ---------------------------------------------------------------------------

export { useToast } from "./ToastProvider";
