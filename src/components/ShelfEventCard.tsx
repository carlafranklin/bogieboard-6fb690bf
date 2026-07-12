import { Calendar, Clock, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { SaveEventButton } from './SaveEventButton';
import { getPriceDisplay } from '@/lib/priceDisplay';
import type { HomeEvent } from '@/data/homeShelves';

const defaultFallbackImage = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400&h=300&fit=crop';

const categoryFallbackImages: Record<string, string> = {
  'live-music': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=300&fit=crop',
  'festivals': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&h=300&fit=crop',
  'business': 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=300&fit=crop',
  'bar-fun': 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400&h=300&fit=crop',
  'shopping': 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=400&h=300&fit=crop',
  'family-kids': 'https://images.unsplash.com/photo-1484820540004-14229fe36ca4?w=400&h=300&fit=crop',
  'movies': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=300&fit=crop',
  'religious-spiritual': 'https://images.unsplash.com/photo-1507692049790-de58290a4334?w=400&h=300&fit=crop',
  'sports-games': 'https://images.unsplash.com/photo-1461896836934-ber91080e9f?w=400&h=300&fit=crop',
  'lecture-series': 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=400&h=300&fit=crop',
  'political-events': 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=400&h=300&fit=crop',
  'arts-theater': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop',
};

function getEventImage(event: HomeEvent): string {
  if (event.image_url) return event.image_url;
  const cats = event.category_names ?? [];
  for (const cat of cats) {
    const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (categoryFallbackImages[slug]) return categoryFallbackImages[slug];
  }
  return defaultFallbackImage;
}

interface ShelfEventCardProps {
  event: HomeEvent;
  isSaved: boolean;
  isLoggedIn: boolean;
  saveLoading: boolean;
  onToggleSave: () => void;
  onSelect: () => void;
  /** Width/flex sizing is the caller's concern (shelf row vs. grid cell). */
  className?: string;
}

export function ShelfEventCard({ event, isSaved, isLoggedIn, saveLoading, onToggleSave, onSelect, className }: ShelfEventCardProps) {
  const price = getPriceDisplay(event);
  const eventImage = getEventImage(event);

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer group bg-card rounded-xl overflow-hidden border border-border hover:shadow-lg transition-shadow ${className ?? ''}`}
    >
      <div className="aspect-[4/3] relative overflow-hidden bg-muted">
        {event.is_free && (
          <div className="absolute top-2.5 left-2.5 z-10 bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full text-xs font-semibold">
            FREE
          </div>
        )}
        <div className="absolute top-2.5 right-2.5 z-10" onClick={(e) => e.stopPropagation()}>
          <SaveEventButton
            eventId={event.event_id}
            isSaved={isSaved}
            isLoggedIn={isLoggedIn}
            onToggle={onToggleSave}
            loading={saveLoading}
            size="icon"
            className="bg-background/80 backdrop-blur-sm border-0 hover:bg-background shadow-sm"
          />
        </div>
        <img
          src={eventImage}
          alt={event.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      </div>

      <div className="p-3.5 space-y-2">
        {event.category_names?.[0] && (
          <span className="inline-block text-[11px] font-medium text-muted-foreground">
            {event.category_names[0]}
          </span>
        )}

        <h3 className="font-display text-[15px] font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {event.title}
        </h3>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>{format(parseISO(event.start_time), 'EEE, MMM d')}</span>
          {!event.all_day && (
            <>
              <Clock className="w-3.5 h-3.5 text-primary ml-1 shrink-0" />
              <span>{format(parseISO(event.start_time), 'h:mm a')}</span>
            </>
          )}
        </div>

        {event.venue_name && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="line-clamp-1">
              {event.venue_name}{event.venue_city ? `, ${event.venue_city}` : ''}
            </span>
          </div>
        )}

        <div className="pt-1">
          <span className={`font-semibold text-sm ${price.isFree ? 'text-primary' : 'text-foreground'}`}>
            {price.label}
          </span>
        </div>
      </div>
    </div>
  );
}
