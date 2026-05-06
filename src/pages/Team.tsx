import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Linkedin, Mail } from 'lucide-react';
import marvinPhoto from '@/assets/team-marvin.jpg';
import carlaPhoto from '@/assets/team-carla.jpg';

interface Member {
  name: string;
  title: string;
  initials: string;
  photo: string;
  linkedin: string;
  email: string;
  bio: string[];
}

const team: Member[] = [
  {
    name: 'Marvin Boguslawski',
    title: 'Founder & CEO',
    initials: 'MB',
    photo: marvinPhoto,
    linkedin: 'https://www.linkedin.com/in/marvin-boguslawski-15097014/',
    email: 'MarvinB@bogieboard.com',
    bio: [
      'Marvin is the Founder and CEO of BogieBoard, where he leads the vision and strategy for helping people discover meaningful local experiences. He brings years of leadership experience across technology and consumer products, with a focus on building tools that bring communities closer together.',
      'Driven by a passion for connecting people to the places they live, Marvin started BogieBoard to make it easier to find the events, gatherings, and hidden gems that make a city feel like home.',
    ],
  },
  {
    name: 'Carla Franklin',
    title: 'Co-Founder & Chief Technology Officer',
    initials: 'CF',
    photo: carlaPhoto,
    linkedin: 'https://www.linkedin.com/in/carlafranklin/',
    email: 'CarlaF@bogieboard.com',
    bio: [
      'Carla is the Co-Founder and Chief Technology Officer of BogieBoard, where she leads engineering, product architecture, and the data platform that powers personalized event discovery. She brings deep expertise in building scalable systems and thoughtful, user-centered technology.',
      'Carla is passionate about using technology to surface real-world experiences that bring joy and connection. She drives the technical vision behind BogieBoard\'s pilot launch and the foundation for its growth across new regions.',
    ],
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
                  <Avatar className="h-64 w-64">
                    <AvatarImage src={m.photo} alt={`${m.name} headshot`} className="object-cover" />
                    <AvatarFallback className="text-3xl font-semibold bg-primary text-primary-foreground">
                      {m.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-xl font-semibold">{m.name}</h2>
                    <p className="text-muted-foreground">{m.title}</p>
                  </div>
                  <div className="space-y-3 text-left text-sm text-foreground/80">
                    {m.bio.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <Button
                      asChild
                      size="sm"
                      className="bg-[#0A66C2] hover:bg-[#004182] text-white"
                    >
                      <a
                        href={m.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${m.name} on LinkedIn`}
                      >
                        <Linkedin className="w-4 h-4 mr-2" fill="currentColor" />
                        LinkedIn
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={`mailto:${m.email}`} aria-label={`Email ${m.name}`}>
                        <Mail className="w-4 h-4 mr-2" />
                        Email
                      </a>
                    </Button>
                  </div>
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
