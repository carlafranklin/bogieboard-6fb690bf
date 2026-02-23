import { X, Pencil, RotateCcw, MapPin, Calendar, Tag, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { metroAreas } from '@/data/metroAreas';
import { categoryLabels } from '@/data/mockEvents';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

interface SearchContextBarProps {
  location: string;
  category: string;
  date: Date | undefined;
  dateRange: DateRange | undefined;
  dateMode: 'single' | 'range';
  priceFilter: 'all' | 'free' | 'paid';
  activeCategories: string[];
  resultCount: number;
  onEditSearch: () => void;
  onNewSearch: () => void;
  onRemoveLocation: () => void;
  onRemoveCategory: () => void;
  onRemoveDate: () => void;
  onRemovePrice: () => void;
  onRemoveActiveCategory: (cat: string) => void;
}

export function SearchContextBar({
  location,
  category,
  date,
  dateRange,
  dateMode,
  priceFilter,
  activeCategories,
  resultCount,
  onEditSearch,
  onNewSearch,
  onRemoveLocation,
  onRemoveCategory,
  onRemoveDate,
  onRemovePrice,
  onRemoveActiveCategory,
}: SearchContextBarProps) {
  const locationLabel = location && location !== 'all'
    ? metroAreas.find((m) => m.value === location)?.label
    : null;

  const categoryLabel = category && category !== 'all'
    ? categoryLabels[category] || category
    : null;

  const dateLabel = (() => {
    if (dateMode === 'single' && date) return format(date, 'MMM d, yyyy');
    if (dateMode === 'range' && dateRange?.from) {
      if (dateRange.to) return `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, yyyy')}`;
      return `${format(dateRange.from, 'MMM d')} – ...`;
    }
    return null;
  })();

  const pills: { label: string; icon: React.ReactNode; onRemove: () => void }[] = [];

  if (locationLabel) {
    pills.push({ label: locationLabel, icon: <MapPin className="w-3 h-3" />, onRemove: onRemoveLocation });
  }
  if (categoryLabel) {
    pills.push({ label: categoryLabel, icon: <Tag className="w-3 h-3" />, onRemove: onRemoveCategory });
  }
  if (dateLabel) {
    pills.push({ label: dateLabel, icon: <Calendar className="w-3 h-3" />, onRemove: onRemoveDate });
  }
  if (priceFilter !== 'all') {
    pills.push({
      label: priceFilter === 'free' ? 'Free only' : 'Paid only',
      icon: <DollarSign className="w-3 h-3" />,
      onRemove: onRemovePrice,
    });
  }
  activeCategories.forEach((cat) => {
    pills.push({
      label: categoryLabels[cat] || cat,
      icon: <Tag className="w-3 h-3" />,
      onRemove: () => onRemoveActiveCategory(cat),
    });
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-4 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-medium text-foreground">
              {resultCount} event{resultCount !== 1 ? 's' : ''} found
            </p>
          </div>

          {pills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pills.map((pill, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 bg-muted text-foreground text-xs font-medium px-2.5 py-1.5 rounded-full"
                >
                  {pill.icon}
                  {pill.label}
                  <button
                    onClick={pill.onRemove}
                    className="ml-0.5 hover:text-destructive transition-colors"
                    aria-label={`Remove ${pill.label}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onEditSearch} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Edit Search</span>
            <span className="sm:hidden">Modify</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onNewSearch} className="gap-1.5 text-muted-foreground">
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Search</span>
            <span className="sm:hidden">Clear</span>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}