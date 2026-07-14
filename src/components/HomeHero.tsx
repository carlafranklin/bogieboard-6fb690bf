import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, MapPin, Calendar as CalendarIcon, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { DiscoverableMetro } from '@/hooks/useDiscoverableMetros';
import { getTodayRange, getWeekendRange, getNext7DaysRange, getCustomDayRange } from '@/lib/dateRange';
import bogieBoardLogo from '@/assets/bogieboard-logo-v3.png';

// Same value/label pairs used on /events, so a metro-level category picked
// here and one picked there always mean the same thing.
const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'live-music', label: 'Live Music' },
  { value: 'festivals', label: 'Festivals' },
  { value: 'family-kids', label: 'Family & Kids' },
  { value: 'arts-theater', label: 'Arts & Theater' },
  { value: 'sports-games', label: 'Sports & Games' },
  { value: 'bar-fun', label: 'Bar Fun' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'business', label: 'Business' },
  { value: 'movies', label: 'Movies' },
  { value: 'lecture-series', label: 'Lecture Series' },
  { value: 'religious-spiritual', label: 'Religious & Spiritual' },
  { value: 'political-events', label: 'Political Events' },
];

type DatePreset = 'any' | 'today' | 'weekend' | 'next-7-days' | 'custom';

interface HomeHeroProps {
  metros: DiscoverableMetro[];
  metrosLoading: boolean;
  metrosError: boolean;
  metroSlug: string | null;
  onMetroChange: (slug: string) => void;
  availableCities: string[];
  selectedCities: string[];
  onCitiesChange: (cities: string[]) => void;
}

export function HomeHero({
  metros,
  metrosLoading,
  metrosError,
  metroSlug,
  onMetroChange,
  availableCities,
  selectedCities,
  onCitiesChange,
}: HomeHeroProps) {
  const navigate = useNavigate();
  const [category, setCategory] = useState('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('any');
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);

  const toggleCity = (city: string) => {
    onCitiesChange(
      selectedCities.includes(city)
        ? selectedCities.filter((c) => c !== city)
        : [...selectedCities, city],
    );
  };

  const handleFindEvents = () => {
    const params = new URLSearchParams();
    if (metroSlug && metroSlug !== 'all') params.set('location', metroSlug);
    if (category !== 'all') params.set('category', category);
    if (selectedCities.length > 0) params.set('cities', selectedCities.join(','));

    // All four presets resolve to a concrete {from, to} local-day boundary here,
    // via the shared dateRange helpers, so /events receives the same signal
    // regardless of which preset was picked — no preset is silently dropped.
    const now = new Date();
    let range: { from: Date; to: Date } | null = null;
    if (datePreset === 'today') {
      range = getTodayRange(now);
    } else if (datePreset === 'weekend') {
      range = getWeekendRange(now);
    } else if (datePreset === 'next-7-days') {
      range = getNext7DaysRange(now);
    } else if (datePreset === 'custom' && customDate) {
      range = getCustomDayRange(customDate);
    }
    if (range) {
      params.set('date', range.from.toISOString());
      params.set('dateTo', range.to.toISOString());
    }

    navigate(`/events?${params.toString()}`);
  };

  return (
    <section className="relative overflow-hidden bg-card">
      <div className="absolute inset-0 bg-gradient-to-br from-card via-card to-green-light/30" />
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-yellow-light/40 to-transparent hidden sm:block" />

      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6 sm:mb-8"
        >
          <img src={bogieBoardLogo} alt="BogieBoard" className="h-16 sm:h-24 w-auto object-contain mx-auto mb-4" />
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-foreground leading-tight mb-2">
            Discover what's <span className="text-primary">happening</span> near <span className="text-secondary">you</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
            Local events, activities, and experiences — all in one place.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-2xl shadow-lg p-4 sm:p-6 max-w-3xl mx-auto space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select value={metroSlug ?? ''} onValueChange={onMetroChange}>
              <SelectTrigger className="h-12">
                <MapPin className="w-4 h-4 text-primary mr-1 shrink-0" />
                <SelectValue placeholder="Select metro area" />
              </SelectTrigger>
              <SelectContent>
                {metrosLoading ? (
                  <SelectItem value="__loading" disabled>Loading locations…</SelectItem>
                ) : metrosError ? (
                  <SelectItem value="__error" disabled>Locations unavailable</SelectItem>
                ) : (
                  metros.map((metro) => (
                    <SelectItem key={metro.value} value={metro.value}>
                      {metro.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Optional multi-city refinement, scoped to the selected metro */}
            <Popover open={cityPickerOpen} onOpenChange={setCityPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-12 w-full justify-start text-left font-normal"
                  disabled={availableCities.length === 0}
                >
                  <MapPin className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {selectedCities.length > 0
                      ? `${selectedCities.length} ${selectedCities.length === 1 ? 'city' : 'cities'} selected`
                      : 'Any city (optional)'}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                {availableCities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No cities available for this metro yet.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">Cities</p>
                      {selectedCities.length > 0 && (
                        <button
                          onClick={() => onCitiesChange([])}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear Cities
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                      {availableCities.map((city) => (
                        <button
                          key={city}
                          onClick={() => toggleCity(city)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                            selectedCities.includes(city)
                              ? 'bg-foreground text-background border-foreground'
                              : 'bg-background text-foreground border-border hover:bg-muted'
                          )}
                        >
                          {city}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-12 w-full justify-start text-left font-normal">
                  <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {datePreset === 'any' && 'Any date'}
                    {datePreset === 'today' && 'Today'}
                    {datePreset === 'weekend' && 'This weekend'}
                    {datePreset === 'next-7-days' && 'Next 7 days'}
                    {datePreset === 'custom' && customDate && customDate.toLocaleDateString()}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  {([
                    ['any', 'Any date'],
                    ['today', 'Today'],
                    ['weekend', 'This weekend'],
                    ['next-7-days', 'Next 7 days'],
                  ] as [DatePreset, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => { setDatePreset(value); setCustomDate(undefined); }}
                      className={cn(
                        'text-xs font-medium py-1.5 rounded-md transition-colors border',
                        datePreset === value
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-background text-foreground border-border hover:bg-muted'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <CalendarComponent
                  mode="single"
                  selected={customDate}
                  onSelect={(d) => { setCustomDate(d); setDatePreset(d ? 'custom' : 'any'); }}
                  initialFocus
                  className="pointer-events-auto"
                />
                {datePreset === 'custom' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground mt-1"
                    onClick={() => { setCustomDate(undefined); setDatePreset('any'); }}
                  >
                    <X className="w-3 h-3 mr-1" /> Clear date
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <Button
            onClick={handleFindEvents}
            size="lg"
            className="w-full h-12 sm:h-14 text-base sm:text-lg font-semibold bg-primary hover:bg-green-dark text-primary-foreground"
          >
            <Search className="w-5 h-5 mr-2" />
            Find Events
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
