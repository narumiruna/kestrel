'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type MouseEvent, useEffect, useState } from 'react';
import type { AiSettings } from '@/lib/ai';
import type { AuthenticatedApiRequest } from '@/lib/api';

export function AiConfigurationSummary({
  apiRequest,
  onNavigate,
}: {
  apiRequest: AuthenticatedApiRequest;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const t = useTranslations('AiAssistant');
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void apiRequest<AiSettings>('/ai/settings')
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apiRequest]);
  const selection = settings?.selection;
  const summary = failed
    ? t('summaryUnavailable')
    : settings === null
      ? t('summaryLoading')
      : selection
        ? `${selection.providerId} · ${selection.modelId} · ${selection.thinkingLevel ?? selection.modelType}`
        : t('notConfigured');
  return (
    <Link href="/dashboard/account#ai-assistant" onClick={onNavigate}>
      {t('settingsLink')}
      <span
        title={summary}
        style={{
          display: 'block',
          fontSize: '0.75rem',
          maxWidth: 220,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {summary}
      </span>
    </Link>
  );
}
