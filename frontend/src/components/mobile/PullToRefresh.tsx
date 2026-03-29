import { useState, useRef, ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: Props) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const THRESHOLD = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startYRef.current = e.touches[0].clientY;
      setPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, 120));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(50);
      try {
        await onRefresh();
      } catch (e) {
        // ignore
      }
      setRefreshing(false);
    }
    setPulling(false);
    setPullDistance(0);
  };

  return (
    <div
      ref={containerRef}
      className="relative overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all"
        style={{ height: pullDistance, opacity: pullDistance / THRESHOLD }}
      >
        <RefreshCw
          className={`h-6 w-6 text-primary-500 transition-transform ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: `rotate(${(pullDistance / THRESHOLD) * 360}deg)` }}
        />
      </div>
      {children}
    </div>
  );
}
