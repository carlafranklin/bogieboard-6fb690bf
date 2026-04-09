import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Heart, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface OnboardingModalProps {
  firstName: string;
  onComplete: (data: { hometown: string; favoriteCities: string[] }) => void;
  onSkip: () => void;
}

export function OnboardingModal({ firstName, onComplete, onSkip }: OnboardingModalProps) {
  const [step, setStep] = useState<'intro' | 'details'>('intro');
  const [hometown, setHometown] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [favoriteCities, setFavoriteCities] = useState<string[]>([]);

  const addCity = () => {
    const trimmed = cityInput.trim();
    if (trimmed && favoriteCities.length < 3 && !favoriteCities.includes(trimmed)) {
      setFavoriteCities([...favoriteCities, trimmed]);
      setCityInput('');
    }
  };

  const removeCity = (city: string) => {
    setFavoriteCities(favoriteCities.filter(c => c !== city));
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-lg mx-4 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
        >
          {/* Decorative header bar */}
          <div className="h-2 bg-gradient-to-r from-primary via-secondary to-accent" />

          <button
            onClick={onSkip}
            className="absolute top-5 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-8">
            {step === 'intro' ? (
              <div className="text-center space-y-5">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h2 className="font-display text-2xl font-bold text-foreground">
                  Welcome aboard, {firstName}!
                </h2>
                <p className="text-muted-foreground leading-relaxed max-w-sm mx-auto">
                  Let's personalize your BogieBoard experience so we can surface the events and happenings you'll love most.
                </p>
                <div className="flex flex-col gap-3 pt-2">
                  <Button
                    onClick={() => setStep('details')}
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  >
                    <Heart className="w-4 h-4 mr-2" />
                    Customize my experience
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={onSkip}
                    className="w-full h-12 text-muted-foreground"
                  >
                    Skip for now
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="font-display text-xl font-bold text-foreground">Tell us about you</h2>
                  <p className="text-muted-foreground text-sm mt-1">You can always update this later in your profile.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hometown" className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    Hometown
                  </Label>
                  <Input
                    id="hometown"
                    placeholder="e.g. Charlotte, NC"
                    value={hometown}
                    onChange={e => setHometown(e.target.value)}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-secondary" />
                    Top 3 favorite cities to visit
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. Asheville, NC"
                      value={cityInput}
                      onChange={e => setCityInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCity())}
                      className="h-11 flex-1"
                      disabled={favoriteCities.length >= 3}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addCity}
                      disabled={favoriteCities.length >= 3 || !cityInput.trim()}
                      className="h-11"
                    >
                      Add
                    </Button>
                  </div>
                  {favoriteCities.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {favoriteCities.map(city => (
                        <Badge
                          key={city}
                          variant="secondary"
                          className="cursor-pointer hover:bg-destructive/20 transition-colors pl-3 pr-2 py-1"
                          onClick={() => removeCity(city)}
                        >
                          {city}
                          <X className="w-3 h-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{3 - favoriteCities.length} remaining</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep('intro')} className="flex-1 h-11">
                    Back
                  </Button>
                  <Button
                    onClick={() => onComplete({ hometown, favoriteCities })}
                    className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  >
                    Save & Continue
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
