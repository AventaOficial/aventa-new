import AventaMapSection from '@/app/admin/owner/AventaMapSection';
import ArchitectureMap from './ArchitectureMap';

export default function MapaSistemasPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <ArchitectureMap />
      <AventaMapSection />
    </div>
  );
}
