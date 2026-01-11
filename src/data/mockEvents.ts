export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  state: string;
  zipCode: string;
  category: 'family' | 'athletic' | 'arts' | 'nightlife' | 'food' | 'outdoor';
  imageUrl: string;
  price: number | null;
  isFree: boolean;
  ageRestriction?: number;
  ticketUrl: string;
  distance?: number;
}

export const categoryLabels: Record<string, string> = {
  family: 'Family Friendly',
  athletic: 'Athletic',
  arts: 'Arts & Culture',
  nightlife: 'Over 21+',
  food: 'Food & Drink',
  outdoor: 'Outdoor',
};

export const categoryColors: Record<string, string> = {
  family: 'bg-teal-light text-teal',
  athletic: 'bg-coral-light text-coral-dark',
  arts: 'bg-secondary text-secondary-foreground',
  nightlife: 'bg-muted text-muted-foreground',
  food: 'bg-coral-light text-coral-dark',
  outdoor: 'bg-teal-light text-teal',
};

export const mockEvents: Event[] = [
  {
    id: '1',
    title: 'Summer Jazz in the Park',
    description: 'Enjoy an evening of smooth jazz under the stars with local and national artists performing in beautiful Riverside Park.',
    date: '2026-01-15',
    time: '6:00 PM',
    venue: 'Riverside Park Amphitheater',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    category: 'arts',
    imageUrl: '/placeholder.svg',
    price: null,
    isFree: true,
    ticketUrl: 'https://example.com/tickets',
  },
  {
    id: '2',
    title: 'Downtown Craft Beer Festival',
    description: 'Sample over 100 craft beers from local breweries. Live music, food trucks, and games included.',
    date: '2026-01-17',
    time: '2:00 PM',
    venue: 'Convention Center Plaza',
    city: 'Austin',
    state: 'TX',
    zipCode: '78702',
    category: 'nightlife',
    imageUrl: '/placeholder.svg',
    price: 45,
    isFree: false,
    ageRestriction: 21,
    ticketUrl: 'https://example.com/tickets',
  },
  {
    id: '3',
    title: 'Family Fun Run 5K',
    description: 'A fun-filled 5K run/walk for the whole family. Kids activities, face painting, and refreshments provided.',
    date: '2026-01-18',
    time: '8:00 AM',
    venue: 'Lady Bird Lake Trail',
    city: 'Austin',
    state: 'TX',
    zipCode: '78703',
    category: 'athletic',
    imageUrl: '/placeholder.svg',
    price: 25,
    isFree: false,
    ticketUrl: 'https://example.com/tickets',
  },
  {
    id: '4',
    title: 'Children\'s Museum Discovery Day',
    description: 'Free admission day at the Children\'s Museum. Interactive exhibits, workshops, and performances.',
    date: '2026-01-19',
    time: '10:00 AM',
    venue: 'Austin Children\'s Museum',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    category: 'family',
    imageUrl: '/placeholder.svg',
    price: null,
    isFree: true,
    ticketUrl: 'https://example.com/tickets',
  },
  {
    id: '5',
    title: 'Sunset Kayaking Adventure',
    description: 'Paddle through calm waters while watching the sunset. Equipment and guide included.',
    date: '2026-01-20',
    time: '5:30 PM',
    venue: 'Lake Travis Marina',
    city: 'Austin',
    state: 'TX',
    zipCode: '78734',
    category: 'outdoor',
    imageUrl: '/placeholder.svg',
    price: 55,
    isFree: false,
    ticketUrl: 'https://example.com/tickets',
  },
  {
    id: '6',
    title: 'Local Food Truck Rally',
    description: 'Over 30 food trucks gather for a night of delicious eats, live music, and community fun.',
    date: '2026-01-21',
    time: '5:00 PM',
    venue: 'Mueller Lake Park',
    city: 'Austin',
    state: 'TX',
    zipCode: '78723',
    category: 'food',
    imageUrl: '/placeholder.svg',
    price: null,
    isFree: true,
    ticketUrl: 'https://example.com/tickets',
  },
  {
    id: '7',
    title: 'Modern Art Exhibition Opening',
    description: 'Be among the first to experience the new contemporary art collection featuring local and international artists.',
    date: '2026-01-22',
    time: '7:00 PM',
    venue: 'Blanton Museum of Art',
    city: 'Austin',
    state: 'TX',
    zipCode: '78712',
    category: 'arts',
    imageUrl: '/placeholder.svg',
    price: 15,
    isFree: false,
    ticketUrl: 'https://example.com/tickets',
  },
  {
    id: '8',
    title: 'Rooftop Comedy Night',
    description: 'Laugh the night away with top comedians at the city\'s most scenic rooftop venue.',
    date: '2026-01-23',
    time: '8:00 PM',
    venue: 'The Summit Rooftop',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    category: 'nightlife',
    imageUrl: '/placeholder.svg',
    price: 30,
    isFree: false,
    ageRestriction: 21,
    ticketUrl: 'https://example.com/tickets',
  },
];
