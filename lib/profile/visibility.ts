export type ProfileVisibility = 'public' | 'private';

export type ProfileIdentityInput = {
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  coverUrl?: string | null;
  showLocation?: boolean | null;
  showActivity?: boolean | null;
  profileVisibility?: string | null;
};

export type PublicProfileIdentity = {
  bio: string | null;
  location: string | null;
  coverUrl: string | null;
  showActivity: boolean;
  isPrivate: boolean;
};

function clean(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : null;
}

export function presentOwnProfile(input: ProfileIdentityInput): { bio: string | null; location: string | null; coverUrl: string | null } {
  const city = clean(input.city);
  const state = clean(input.state);
  return {
    bio: clean(input.bio),
    location: [city, state].filter((part): part is string => Boolean(part)).join(', ') || null,
    coverUrl: clean(input.coverUrl),
  };
}

export function presentPublicProfile(input: ProfileIdentityInput): PublicProfileIdentity {
  const visibility: ProfileVisibility = input.profileVisibility === 'private' ? 'private' : 'public';
  const showLocation = input.showLocation === true;
  const showActivity = input.showActivity !== false;
  if (visibility === 'private') {
    return { bio: null, location: null, coverUrl: null, showActivity: false, isPrivate: true };
  }
  const city = showLocation ? clean(input.city) : null;
  const state = showLocation ? clean(input.state) : null;
  const location = [city, state].filter((part): part is string => Boolean(part)).join(', ') || null;
  return {
    bio: clean(input.bio),
    location,
    coverUrl: clean(input.coverUrl),
    showActivity,
    isPrivate: false,
  };
}
