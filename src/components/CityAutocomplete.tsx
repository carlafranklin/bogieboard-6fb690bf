import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

export interface CityResult {
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
  onChange: (displayValue: string, structured?: CityResult) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Typeahead city/zip autocomplete backed by the city_lookup table.
 * Returns structured data (city_name, state_code, zip) via the onChange callback.
 */
export function CityAutocomplete({
  value,
  onChange,
  placeholder = 'Search city or zip…',
  className,
}: CityAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CityResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync external value changes
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
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    const isZip = /^\d{2,5}$/.test(trimmed);

    const column = isZip ? 'zip_code' : 'city_name';
    const { data, error } = await supabase
      .from('city_lookup')
      .select('id, city_name, state_code, display_name, zip_code, latitude, longitude')
      .ilike(column, `${trimmed}%`)
      .order('city_name')
      .limit(12);

    setLoading(false);

    if (!error && data) {
      // Deduplicate by display_name (some cities appear with multiple zips)
      const seen = new Set<string>();
      const unique: CityResult[] = [];
      for (const row of data as CityResult[]) {
        const key = isZip ? `${row.display_name}-${row.zip_code}` : row.display_name;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(row);
        }
      }
      setResults(unique);
      setIsOpen(unique.length > 0);
      setHighlightIndex(-1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    // Don't call onChange with raw text — only structured selections count
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCities(val), 200);
  };

  const handleSelect = (city: CityResult) => {
    setQuery(city.display_name);
    onChange(city.display_name, city);
    setIsOpen(false);
    setResults([]);
  };

  const handleBlur = () => {
    // If user typed something but didn't select from dropdown, notify parent with raw text
    setTimeout(() => {
      if (!isOpen && query !== value) {
        onChange(query);
      }
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
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
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onBlur={handleBlur}
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
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 max-h-64 overflow-y-auto">
          {results.map((city, i) => (
            <button
              key={`${city.id}-${city.zip_code}`}
              onClick={() => handleSelect(city)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`w-full text-left px-3.5 py-2.5 flex items-center gap-2.5 text-sm transition-colors ${
                i === highlightIndex
                  ? 'bg-primary/10 text-foreground'
                  : 'text-foreground hover:bg-muted/50'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <div className="min-w-0 flex items-center gap-2">
                <span className="font-medium">{city.display_name}</span>
                {city.zip_code && (
                  <span className="text-xs text-muted-foreground">{city.zip_code}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
