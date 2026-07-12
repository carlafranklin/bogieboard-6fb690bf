import { cn } from '@/lib/utils';
import { AUDIENCE_TABS } from '@/data/homeShelves';

interface AudienceTabsProps {
  activeTabId: string;
  onChange: (tabId: string) => void;
}

export function AudienceTabs({ activeTabId, onChange }: AudienceTabsProps) {
  return (
    <div
      className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-1"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {AUDIENCE_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-colors whitespace-nowrap',
            activeTabId === tab.id
              ? 'bg-foreground text-background border-foreground'
              : 'bg-background text-foreground border-border hover:bg-muted'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
