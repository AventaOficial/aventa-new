/**
 * Cupones depende de coupons, coupon_events, coupon_links y coupon_interactions,
 * que no existen en producción. Activar solo en el mismo cambio que aplica esa migración.
 */
export const COUPONS_MODULE_AVAILABLE = false;

export const COUPONS_MODULE_UNAVAILABLE = { error: 'coupons_module_unavailable' } as const;
