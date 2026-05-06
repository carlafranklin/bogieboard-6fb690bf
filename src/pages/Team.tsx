import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Linkedin } from 'lucide-react';

interface Member {
  name: string;
  title: string;
  initials: string;
  linkedin: string;
}

const team: Member[] = [
  {
    name: 'Marvin Boguslawski',
    title: 'Founder & CEO',
    initials: 'MB',
    linkedin: 'https://www.linkedin.com/in/marvin-boguslawski-15097014/',
  },
  {
    name: 'Carla Franklin',
    title: 'Co-Founder & Chief Technology Officer',
    initials: 'CF',
    linkedin: 'https://www.linkedin.com/in/carlafranklin/',
  },
];

const Team = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="pt-24 pb-16 flex-1">
        <div className="container mx-auto max-w-5xl px-4">
          <header className="mb-10 text-center">
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">Our Team</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Meet the people building BogieBoard.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {team.map((m) => (
              <Card key={m.name} className="transition-shadow hover:shadow-md">
                <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                  <Avatar className="h-24 w-24">
                    <AvatarFallback className="text-xl font-semibold bg-primary text-primary-foreground">
                      {m.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-xl font-semibold">{m.name}</h2>
                    <p className="text-muted-foreground">{m.title}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={m.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${m.name} on LinkedIn`}
                    >
                      <Linkedin className="w-4 h-4 mr-2" />
                      LinkedIn
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Team;
