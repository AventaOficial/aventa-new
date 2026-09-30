export type GuestAccessReason = 'vote' | 'favorite' | 'favorites' | 'profile';

export function guestAccessMessage(reason: GuestAccessReason): string {
  switch (reason) {
    case 'vote':
      return 'Inicia sesión para votar (y que cuente tu opinión).';
    case 'favorite':
      return 'Inicia sesión para guardar esta oferta en favoritos.';
    case 'favorites':
      return 'Para ver tus favoritos necesitas iniciar sesión.';
    case 'profile':
      return 'Para ver tu perfil necesitas iniciar sesión.';
  }
}

export function requestGuestSignIn(
  showToast: (message: string) => void,
  openRegisterModal: (mode?: 'signin' | 'signup') => void,
  reason: GuestAccessReason,
): void {
  showToast(guestAccessMessage(reason));
  openRegisterModal('signin');
}
