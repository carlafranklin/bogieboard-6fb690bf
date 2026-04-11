import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

interface CityResult {
  id: string;
  city_name: string;
  state_code: string;
  display_name: string;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface CityAutocompleteProps {
  value: string;
  onChange: (value: string, city?: CityResult) => void;
  placeholder?: string;
  className?: string;
}

export function CityAutocomplete({ value, onChange, placeholder = 'Search city or zip…', className }: CityAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CityResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync external value
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchCities = async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    const isZip = /^\d{2,5}$/.test(searchQuery.trim());

    let query;
    if (isZip) {
      query = supabase
        .from('city_lookup')
        .select('id, city_name, state_code, display_name, zip_code, latitude, longitude')
        .ilike('zip_code', `${searchQuery.trim()}%`)
        .order('city_name')
        .limit(10);
    } else {
      query = supabase
        .from('city_lookup')
        .select('id, city_name, state_code, display_name, zip_code, latitude, longitude')
        .ilike('city_name', `${searchQuery.trim()}%`)
        .order('city_name')
        .limit(10);
    }

    const { data, error } = await query;
    setLoading(false);

    if (!error && data) {
      setResults(data as CityResult[]);
      setIsOpen(data.length > 0);
      setHighlightIndex(-1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val); // Update parent with raw text

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCities(val), 200);
  };

  const handleSelect = (city: CityResult) => {
    setQuery(city.display_name);
    onChange(city.display_name, city);
    setIsOpen(false);
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-8 pr-8 h-10 rounded-lg"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          {results.map((city, i) => (
            <button
              key={city.id}
              onClick={() => handleSelect(city)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`w-full text-left px-3.5 py-2.5 flex items-center gap-2.5 text-sm transition-colors ${
                i === highlightIndex
                  ? 'bg-primary/10 text-foreground'
                  : 'text-foreground hover:bg-muted/50'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <div className="min-w-0">
                <span className="font-medium">{city.display_name}</span>
                {city.zip_code && (
                  <span className="text-xs text-muted-foreground ml-2">{city.zip_code}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
