import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const assets = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'] as const;

// Pre-render the locked package's modules with their original sibling filenames.
// Treating the worker as a hashed URL asset breaks its relative shared-module import.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return assets.map((asset) => ({ asset }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  if (!assets.some((allowed) => allowed === asset)) {
    return new Response('Not found', { status: 404 });
  }

  const content = await readFile(join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist', asset));
  return new Response(content, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/javascript; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
