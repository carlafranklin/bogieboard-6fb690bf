import { Bookmark, BookmarkCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface SaveEventButtonProps {
  eventId: string;
  isSaved: boolean;
  isLoggedIn: boolean;
  onToggle: () => void;
  loading?: boolean;
  size?: 'sm' | 'icon';
  className?: string;
}

export function SaveEventButton({
  eventId,
  isSaved,
  isLoggedIn,
  onToggle,
  loading,
  size = 'sm',
  className,
}: SaveEventButtonProps) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoggedIn) {
      navigate('/auth?redirect=/&reason=save');
      return;
    }
    onToggle();
  };

  return (
    <Button
      variant={isSaved ? 'default' : 'outline'}
      size={size}
      disabled={loading}
      onClick={handleClick}
      className={cn(
        isSaved && 'bg-primary text-primary-foreground',
        className
      )}
      aria-label={isSaved ? 'Unsave event' : 'Save event'}
    >
      {isSaved ? (
        <BookmarkCheck className="w-4 h-4" />
      ) : (
        <Bookmark className="w-4 h-4" />
      )}
      {size !== 'icon' && (
        <span className="ml-1">{isSaved ? 'Saved' : 'Save'}</span>
      )}
    </Button>
  );
}
