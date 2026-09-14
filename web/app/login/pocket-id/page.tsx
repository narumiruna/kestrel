import type { Metadata } from 'next';
import { PocketIdCallback } from '@/components/PocketIdCallback';

export const metadata: Metadata = {
  robots: { follow: false, index: false },
};

export default function PocketIdCallbackPage() {
  return <PocketIdCallback />;
}
