/**
 * Compatibilidad histórica del endpoint de credenciales.
 * La implementación canónica vive en Team OS para evitar divergencias
 * en las comprobaciones de autorización y cambio de contraseña.
 */
export { POST } from '../../../team-os/users/[userId]/access/route';
