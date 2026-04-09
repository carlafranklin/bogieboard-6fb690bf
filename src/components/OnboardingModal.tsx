import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Heart, Sparkles, X, ArrowRight, ChevronLeft } from 'lucide-react';
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

  const removeCity = (city: string) => setFavoriteCities(favoriteCities.filter(c => c !== city));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border/50 overflow-hidden"
        >
          {/* Gradient strip */}
          <div className="h-1.5 bg-gradient-to-r from-primary via-secondary to-accent" />

          {/* Close button */}
          <button
            onClick={onSkip}
            className="absolute top-5 right-5 z-10 w-8 h-8 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="px-6 pt-8 pb-8 sm:px-8 sm:pt-10 sm:pb-10">
            <AnimatePresence mode="wait">
              {step === 'intro' ? (
                <motion.div
                  key="intro"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="text-center space-y-5"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.15, stiffness: 260, damping: 18 }}
                    className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/15 to-secondary/10 flex items-center justify-center"
                  >
                    <Sparkles className="w-9 h-9 text-primary" />
                  </motion.div>

                  <div>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
                      Hey {firstName}! 👋
                    </h2>
                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-xs mx-auto">
                      Let's personalize your feed so we can surface the events you'll love.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5 pt-3">
                    <Button
                      onClick={() => setStep('details')}
                      className="w-full h-13 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base rounded-xl shadow-md"
                    >
                      Customize my experience
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={onSkip}
                      className="w-full h-11 text-muted-foreground hover:text-foreground text-sm"
                    >
                      I'll do this later
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  {/* Step indicator */}
                  <div className="flex items-center gap-3">
                    <button onClick={() => setStep('intro')} className="text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                      <div className="flex gap-1.5">
                        <div className="h-1 flex-1 rounded-full bg-primary" />
                        <div className="h-1 flex-1 rounded-full bg-primary/30" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h2 className="font-display text-xl font-bold text-foreground">A little about you</h2>
                    <p className="text-muted-foreground text-sm mt-1">You can always change this in settings.</p>
                  </div>

                  {/* Hometown */}
                  <div className="space-y-2">
                    <Label htmlFor="hometown" className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="w-4 h-4 text-primary" />
                      Where's home?
                    </Label>
                    <Input
                      id="hometown"
                      placeholder="e.g. Charlotte, NC"
                      value={hometown}
                      onChange={e => setHometown(e.target.value)}
                      className="h-12 rounded-xl text-base"
                    />
                  </div>

                  {/* Favorite cities */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Heart className="w-4 h-4 text-secondary" />
                      Favorite cities to explore
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={favoriteCities.length >= 3 ? 'Maximum reached' : 'e.g. Asheville, NC'}
                        value={cityInput}
                        onChange={e => setCityInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCity())}
                        className="h-12 rounded-xl text-base flex-1"
                        disabled={favoriteCities.length >= 3}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addCity}
                        disabled={favoriteCities.length >= 3 || !cityInput.trim()}
                        className="h-12 rounded-xl px-5"
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
                            className="cursor-pointer hover:bg-destructive/15 transition-colors pl-3 pr-2 py-1.5 text-sm rounded-lg"
                            onClick={() => removeCity(city)}
                          >
                            {city}
                            <X className="w-3 h-3 ml-1.5 opacity-60" />
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground/60">
                      {favoriteCities.length === 0 ? 'Add up to 3 cities' : `${3 - favoriteCities.length} of 3 remaining`}
                    </p>
                  </div>

                  <Button
                    onClick={() => onComplete({ hometown, favoriteCities })}
                    className="w-full h-13 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base rounded-xl shadow-md mt-2"
                  >
                    Save & get started
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
