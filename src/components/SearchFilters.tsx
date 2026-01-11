import { useState } from 'react';
import { motion } from 'framer-motion';
import { Filter, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export interface FilterState {
  priceRange: 'all' | 'free' | 'paid';
  distance: number;
  categories: string[];
}

interface SearchFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClearFilters: () => void;
}

const categoryOptions = [
  { value: 'family', label: 'Family Friendly' },
  { value: 'athletic', label: 'Athletic' },
  { value: 'arts', label: 'Arts & Culture' },
  { value: 'nightlife', label: 'Over 21+' },
  { value: 'food', label: 'Food & Drink' },
  { value: 'outdoor', label: 'Outdoor' },
];

export function SearchFilters({ filters, onFiltersChange, onClearFilters }: SearchFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleCategoryToggle = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: newCategories });
  };

  const activeFiltersCount =
    (filters.priceRange !== 'all' ? 1 : 0) +
    (filters.distance !== 25 ? 1 : 0) +
    filters.categories.length;

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between p-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 -ml-2">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filters</span>
              {activeFiltersCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
              {isOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </CollapsibleTrigger>

          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Clear all
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-4 pb-4 space-y-6 border-t border-border pt-4"
          >
            {/* Price Filter */}
            <div>
              <h4 className="text-sm font-medium mb-3">Price</h4>
              <div className="flex flex-wrap gap-2">
                {['all', 'free', 'paid'].map((option) => (
                  <Button
                    key={option}
                    variant={filters.priceRange === option ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onFiltersChange({ ...filters, priceRange: option as FilterState['priceRange'] })}
                    className={filters.priceRange === option ? 'bg-primary hover:bg-coral-dark' : ''}
                  >
                    {option === 'all' ? 'All' : option === 'free' ? 'Free' : 'Paid'}
                  </Button>
                ))}
              </div>
            </div>

            {/* Distance Filter */}
            <div>
              <h4 className="text-sm font-medium mb-3">Distance: {filters.distance} miles</h4>
              <Slider
                value={[filters.distance]}
                onValueChange={([value]) => onFiltersChange({ ...filters, distance: value })}
                max={50}
                min={5}
                step={5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>5 mi</span>
                <span>50 mi</span>
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <h4 className="text-sm font-medium mb-3">Categories</h4>
              <div className="grid grid-cols-2 gap-3">
                {categoryOptions.map((category) => (
                  <label
                    key={category.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={filters.categories.includes(category.value)}
                      onCheckedChange={() => handleCategoryToggle(category.value)}
                    />
                    <span className="text-sm">{category.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </motion.div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
