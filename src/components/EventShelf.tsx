import { ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ShelfEventCard } from './ShelfEventCard';
import type { HomeEvent } from '@/data/homeShelves';

interface EventShelfProps {
  title: string;
  events: HomeEvent[];
  loading: boolean;
  emptyMessage: string;
  isSaved: (id: string) => boolean;
  isLoggedIn: boolean;
  saveLoading: boolean;
  onToggleSave: (id: string) => void;
  onSelectEvent: (event: HomeEvent) => void;
  onViewAll?: () => void;
  /** Low-inventory hint — shown alongside results rather than replacing them. */
  lowInventoryThreshold?: number;
}

export function EventShelf({
  title,
  events,
  loading,
  emptyMessage,
  isSaved,
  isLoggedIn,
  saveLoading,
  onToggleSave,
  onSelectEvent,
  onViewAll,
  lowInventoryThreshold = 3,
}: EventShelfProps) {
  const isLowInventory = !loading && events.length > 0 && events.length <= lowInventoryThreshold;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="font-display text-lg sm:text-xl font-bold text-foreground">{title}</h2>
        {onViewAll && events.length > 0 && (
          <button
            onClick={onViewAll}
            className="text-primary hover:text-primary/80 text-sm font-medium flex items-center gap-0.5 shrink-0"
          >
            See all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex gap-3 sm:gap-4 overflow-x-hidden pb-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="flex-shrink-0 w-[78vw] sm:w-64 h-64 rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground/70 italic px-1">{emptyMessage}</p>
      ) : (
        <>
          {isLowInventory && (
            <p className="text-xs text-muted-foreground/60 mb-2 px-1">
              Just getting started here — check back soon for more.
            </p>
          )}
          <div className="relative">
            <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-hide -mx-1 px-1">
              {events.map((event) => (
                <ShelfEventCard
                  key={event.event_id}
                  event={event}
                  isSaved={isSaved(event.event_id)}
                  isLoggedIn={isLoggedIn}
                  saveLoading={saveLoading}
                  onToggleSave={() => onToggleSave(event.event_id)}
                  onSelect={() => onSelectEvent(event)}
                  className="flex-shrink-0 w-[78vw] sm:w-64 snap-start"
                />
              ))}
            </div>
            <div className="hidden sm:block absolute right-0 top-0 bottom-3 w-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />
          </div>
        </>
      )}
    </section>
  );
}
