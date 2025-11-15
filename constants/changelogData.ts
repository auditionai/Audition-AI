export interface ChangelogItem {
  id: number;
  version: string;
  date: string;
  title: string;
  description: string;
}

export const CHANGELOG_DATA: ChangelogItem[] = [
  {
    id: 10,
    version: 'v2.0.0',
    date: '17-11-2025',
    title: 'changelog.10.title',
    description: 'changelog.10.description',
  },
  {
    id: 9,
    version: 'v1.9.0',
    date: '16-11-2025',
    title: 'changelog.9.title',
    description: 'changelog.9.description',
  },
  {
    id: 8,
    version: 'v1.8.0',
    date: '15-11-2025',
    title: 'changelog.8.title',
    description: 'changelog.8.description',
  },
  {
    id: 7,
    version: 'v1.7.0',
    date: '14-11-2025',
    title: 'changelog.7.title',
    description: 'changelog.7.description',
  },
  {
    id: 6,
    version: 'v1.6.0',
    date: '13-11-2025',
    title: 'changelog.6.title',
    description: 'changelog.6.description',
  },
  {
    id: 5,
    version: 'v1.5.0',
    date: '12-11-2025',
    title: 'changelog.5.title',
    description: 'changelog.5.description',
  },
  {
    id: 4,
    version: 'v1.4.0',
    date: '11-11-2025',
    title: 'changelog.4.title',
    description: 'changelog.4.description',
  },
  {
    id: 3,
    version: 'v1.3.0',
    date: '10-11-2025',
    title: 'changelog.3.title',
    description: 'changelog.3.description',
  },
  {
    id: 2,
    version: 'v1.2.1',
    date: '09-11-2025',
    title: 'changelog.2.title',
    description: 'changelog.2.description',
  },
  {
    id: 1,
    version: 'v1.1.0',
    date: '08-11-2025',
    title: 'changelog.1.title',
    description: 'changelog.1.description',
  },
];