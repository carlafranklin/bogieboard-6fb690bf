import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, MapPin, Calendar, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { metroAreas } from '@/data/metroAreas';

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
  { value: 'live-music', label: 'Live Music' },
  { value: 'festivals', label: 'Festivals' },
  { value: 'business', label: 'Business' },
  { value: 'bar-fun', label: 'Bar Fun' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'family-kids', label: 'Family & Kids' },
  { value: 'movies', label: 'Movies' },
  { value: 'religious-spiritual', label: 'Religious & Spiritual' },
  { value: 'sports-games', label: 'Sports & Games' },
  { value: 'lecture-series', label: 'Lecture Series' },
  { value: 'political-events', label: 'Political Events' },
  { value: 'arts-theater', label: 'Arts & Theater' },
];

export function SearchModule({ onSearch, compact = false }: SearchModuleProps) {
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('all');
  const [date, setDate] = useState<Date | undefined>(undefined);

  const handleSearch = () => {
    onSearch({ location, category, date });
  };

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl shadow-md p-3"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <MapPin className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
              <SelectValue placeholder="Select Metro Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {metroAreas.map((metro) => (
                <SelectItem key={metro.value} value={metro.value}>
                  {metro.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-[160px] justify-start text-left font-normal">
                <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                {date ? format(date, 'MMM d, yyyy') : 'Any date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button onClick={handleSearch} className="bg-primary hover:bg-green-dark text-primary-foreground">
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
        {/* Location Dropdown */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Location
          </label>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select metro area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {metroAreas.map((metro) => (
                <SelectItem key={metro.value} value={metro.value}>
                  {metro.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Button
        onClick={handleSearch}
        size="lg"
        className="w-full h-14 text-lg font-semibold bg-primary hover:bg-green-dark text-primary-foreground"
      >
        <Search className="w-5 h-5 mr-2" />
        Find Events
      </Button>
    </motion.div>
  );
}
