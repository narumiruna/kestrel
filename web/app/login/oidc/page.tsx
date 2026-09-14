import type { Metadata } from 'next';
import { OidcCallback } from '@/components/OidcCallback';

export const metadata: Metadata = {
  robots: { follow: false, index: false },
};

export default function OidcCallbackPage() {
  return <OidcCallback />;
}
