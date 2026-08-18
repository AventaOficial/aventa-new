import StaffDepartmentView from '../components/StaffDepartmentView';

export default function EquipoMarketingPage() {
  return (
    <StaffDepartmentView
      department="marketing"
      title="Marketing"
      subtitle="Ofertas listas para TikTok, Reels y Shorts. Tú y tu hermano graban; aquí está la materia prima."
      showFilm
      actionLinks={[
        { label: 'Redes sociales (admin)', href: '/admin/moderation/social' },
        { label: 'Sitio público', href: '/', external: true },
      ]}
    />
  );
}
