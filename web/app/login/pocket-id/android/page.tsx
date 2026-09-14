import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/radix-ui';

export const metadata: Metadata = {
  robots: { follow: false, index: false },
};

export default function AndroidPocketIdCallbackPage() {
  return (
    <main className="auth-page">
      <section className="card auth-card stack">
        <BrandMark
          className="auth-brand"
          subtitle="Return to the Kestrel Android app."
          titleAs="h1"
        />
        <p className="muted">
          If Kestrel did not open automatically, install or update the Android app and retry sign-in
          from Settings.
        </p>
        <Button asChild className="secondary">
          <Link href="/login">Return to login</Link>
        </Button>
      </section>
    </main>
  );
}
