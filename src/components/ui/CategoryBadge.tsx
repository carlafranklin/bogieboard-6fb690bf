import { categoryLabels, categoryColors, categoryIcons } from '@/data/mockEvents';
import { cn } from '@/lib/utils';
import { icons } from 'lucide-react';

interface CategoryBadgeProps {
  category: string;
  className?: string;
  showIcon?: boolean;
}

export function CategoryBadge({ category, className, showIcon = true }: CategoryBadgeProps) {
  const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const iconName = categoryIcons[slug];
  const LucideIcon = iconName ? (icons as Record<string, any>)[iconName] : null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
        categoryColors[slug] || 'bg-muted text-muted-foreground',
        className
      )}
    >
      {showIcon && LucideIcon && <LucideIcon className="w-3 h-3" />}
      {categoryLabels[slug] || category}
    </span>
  );
}
