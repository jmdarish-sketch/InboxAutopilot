"use client";

import { useState } from "react";
import ReviewItemCard from "@/components/review/ReviewItemCard";
import type { FullReviewItem } from "@/lib/review/queries";

interface ReviewListProps {
  initialItems: FullReviewItem[];
}

export default function ReviewList({ initialItems }: ReviewListProps) {
  const [items, setItems] = useState(initialItems);

  function handleResolved(queueId: string) {
    setItems(prev => prev.filter(i => i.queueId !== queueId));
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900">Queue is clear</h3>
        <p className="mt-1 text-sm text-gray-400">
          New uncertain emails will appear here as autopilot processes them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map(item => (
        <ReviewItemCard
          key={item.queueId}
          item={item}
          onResolved={handleResolved}
        />
      ))}
    </div>
  );
}
