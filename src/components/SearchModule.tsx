import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, MapPin, Calendar, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';

interface SearchModuleProps {
  onSearch: (params: SearchParams) => void;
  compact?: boolean;
}

export interface SearchParams {
  location: string;
  category: string;
  date: Date | undefined;
}

const categories = [
  { value: 'all', label: 'All Categories' },
  { value: 'family', label: 'Family Friendly' },
  { value: 'athletic', label: 'Athletic' },
  { value: 'arts', label: 'Arts & Culture' },
  { value: 'nightlife', label: 'Over 21+' },
  { value: 'food', label: 'Food & Drink' },
  { value: 'outdoor', label: 'Outdoor' },
];

export function SearchModule({ onSearch, compact = false }: SearchModuleProps) {
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('all');
  const [date, setDate] = useState<Date | undefined>(undefined);

  const handleSearch = () => {
    onSearch({ location, category, date });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl shadow-md p-3"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="City or ZIP code"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyPress={handleKeyPress}
              className="pl-9 bg-background border-input"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSearch} className="bg-primary hover:bg-coral-dark text-primary-foreground">
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-card rounded-2xl shadow-lg p-6 md:p-8 max-w-3xl mx-auto"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Location Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Location
          </label>
          <Input
            placeholder="City or ZIP code"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyPress={handleKeyPress}
            className="h-12 bg-background border-input text-base"
          />
        </div>

        {/* Category Select */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <ChevronDown className="w-4 h-4 text-primary" />
            Category
          </label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Picker */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Date
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full h-12 justify-start text-left font-normal"
              >
                {date ? format(date, 'PPP') : 'Any date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Button
        onClick={handleSearch}
        size="lg"
        className="w-full h-14 text-lg font-semibold bg-primary hover:bg-coral-dark text-primary-foreground"
      >
        <Search className="w-5 h-5 mr-2" />
        Find Events
      </Button>
    </motion.div>
  );
}
