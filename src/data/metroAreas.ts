export interface MetroArea {
  value: string;
  label: string;
  cities: string[];
}

export const metroAreas: MetroArea[] = [
  {
    value: 'charlotte-nc',
    label: 'Charlotte, NC Metro',
    cities: [
      'Charlotte', 'Gastonia', 'Concord', 'Rock Hill',
      'Huntersville', 'Kannapolis', 'Matthews', 'Monroe',
      'Mooresville', 'Salisbury', 'Shelby', 'Statesville',
      'Belmont', 'Cornelius', 'Davidson', 'Fort Mill', 'Indian Trail',
    ],
  },
  {
    value: 'greensboro-nc',
    label: 'Greensboro, NC Metro',
    cities: [
      'Greensboro', 'High Point', 'Asheboro',
      'Jamestown', 'Oak Ridge', 'Pleasant Garden',
      'Sedalia', 'Stokesdale', 'Summerfield',
      'Randleman', 'Reidsville',
    ],
  },
  {
    value: 'raleigh-durham-nc',
    label: 'Raleigh/Durham, NC Metro',
    cities: [
      'Raleigh', 'Durham', 'Chapel Hill', 'Cary', 'Apex',
      'Morrisville', 'Wake Forest', 'Holly Springs', 'Fuquay-Varina',
      'Garner', 'Knightdale', 'Carrboro', 'Hillsborough',
    ],
  },
];

export function getCitiesForMetro(metroValue: string): string[] {
  const metro = metroAreas.find((m) => m.value === metroValue);
  return metro ? metro.cities : [];
}

export function getMetroForCity(city: string): MetroArea | undefined {
  return metroAreas.find((m) =>
    m.cities.some((c) => c.toLowerCase() === city.toLowerCase())
  );
}
