import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AtlasClient from './AtlasClient';
import { loadDatabaseAtlas } from '@/lib/databaseAtlas/build';
import { requireOwnerSession } from '@/lib/server/requireOwnerSession';

export default async function DatabaseAtlasPage() {
  const cookieStore = await cookies();
  const auth = await requireOwnerSession(new Request('https://aventaofertas.com/admin/sistemas/atlas'), {
    getAll: async () => cookieStore.getAll(),
    set: () => {},
    delete: () => {},
  });
  if ('error' in auth) redirect('/');
  const atlas = loadDatabaseAtlas();
  return <AtlasClient atlas={atlas} />;
}
