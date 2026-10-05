import type { EditorialHunter } from '@/lib/product/hunters/types';
import HunterCard from './HunterCard';

export default function HunterGrid({ hunters }: { hunters: readonly EditorialHunter[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {hunters.map((hunter) => (
        <li key={hunter.id}>
          <HunterCard hunter={hunter} />
        </li>
      ))}
    </ul>
  );
}
