import { notFound } from 'next/navigation';
import { COUPONS_MODULE_AVAILABLE } from '@/lib/intelligence/coupon/availability';

export default function AdminCouponsLayout({ children }: { children: React.ReactNode }) {
  if (!COUPONS_MODULE_AVAILABLE) notFound();
  return children;
}
