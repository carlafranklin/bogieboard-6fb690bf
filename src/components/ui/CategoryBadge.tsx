import { categoryLabels, categoryColors } from '@/data/mockEvents';
import { cn } from '@/lib/utils';

interface CategoryBadgeProps {
  category: string;
  className?: string;
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
        categoryColors[category] || 'bg-muted text-muted-foreground',
        className
      )}
    >
      {categoryLabels[category] || category}
    </span>
  );
}
