'use client';

import { Button, Checkbox, Flex, Text, TextArea, TextField } from '@radix-ui/themes';
import { useTranslations } from 'next-intl';
import { Collapsible } from 'radix-ui';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { AiCatalog, AiSettings } from '@/lib/ai';
import { newerAiSettings } from '@/lib/ai';
import type { AuthenticatedApiRequest, AuthSession } from '@/lib/api';
import {
  type AssistantBinding,
  type AssistantEvent,
  type AssistantProposal,
  type AssistantRunInput,
  type AssistantSnapshot,
  ROUTE_ASSISTANT_LIMITS as L,
} from '@/lib/route-assistant';
import {
  AssistantEventBuffer,
  AssistantLifecycle,
  sameAssistantBinding,
  assistantSettingsKey as settingsKey,
  validateAssistantProposal,
} from './assistantState';
import { type RouteDraftState, replaceRoutePath } from './routeDraftState';

type Props = {
  apiRequest: AuthenticatedApiRequest;
  session: AuthSession | null;
  draftState: RouteDraftState;
  setDraftState: Dispatch<SetStateAction<RouteDraftState>>;
  routeId: string;
  viewGeneration: number;
  captureMap: (signal: AbortSignal) => Promise<Omit<AssistantSnapshot, 'binding'>>;
  isSaving: boolean;
  onCandidateChange: (proposal: AssistantProposal | null) => void;
  onApplied: () => void;
  onNavigateSettings: () => void;
};
type Attachment = {
  binding: AssistantBinding;
  epoch: number;
  controller: AbortController;
  draft: RouteDraftState;
  snapshot: AssistantSnapshot | null;
  url: string | null;
  submitted: boolean;
  preparing: boolean;
  started: number;
};
type Message =
  | 'failed'
  | 'captureFailed'
  | 'stale'
  | 'cancelled'
  | 'expired'
  | 'unclear'
  | 'ambiguous'
  | 'offscreen'
  | 'unsupported'
  | null;
export function RouteAssistant(props: Props) {
  const {
    apiRequest,
    session,
    draftState,
    setDraftState,
    routeId,
    viewGeneration,
    captureMap,
    isSaving,
    onCandidateChange,
    onApplied,
    onNavigateSettings,
  } = props;
  const t = useTranslations('RouteAssistant');
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState('');
  const [loop, setLoop] = useState('');
  const [consent, setConsent] = useState(false);
  const [removalConsent, setRemovalConsent] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [catalog, setCatalog] = useState<AiCatalog | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [proposal, setProposal] = useState<AssistantProposal | null>(null);
  const [phase, setPhase] = useState<
    'idle' | 'capturing' | 'review' | 'preparing' | 'running' | 'complete'
  >('idle');
  const [message, setMessage] = useState<Message>(null);
  const lifecycle = useRef(new AssistantLifecycle()).current;
  const editorId = useRef<string | null>(null);
  const resource = useRef<Attachment | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const captureRef = useRef<HTMLButtonElement | null>(null);
  const consentRef = useRef<HTMLButtonElement | null>(null);
  const stopRef = useRef<HTMLButtonElement | null>(null);
  const summaryRef = useRef<HTMLSpanElement | null>(null);
  const focusPhase = useRef<'idle' | 'review' | 'preparing' | 'running' | 'complete' | null>(null);
  const savedSettings = useRef<AiSettings | null>(null);
  const pendingApply = useRef<RouteDraftState | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const owner = session ? `${session.user.id}:${session.session.id}` : '';
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  lifecycle.observe({
    draft: draftState,
    routeId,
    owner,
    settings: settingsKey(settings),
    view: viewGeneration,
  });

  const release = useCallback(
    (reason: Message = null) => {
      const current = resource.current;
      if (current) focusPhase.current = 'idle';
      resource.current = null;
      lifecycle.invalidate();
      if (current) {
        current.controller.abort();
        if (current.url) URL.revokeObjectURL(current.url);
        current.snapshot = null;
        if (current.submitted)
          void latest.current
            .apiRequest(`/ai/route-assistant/runs/${encodeURIComponent(current.binding.runId)}`, {
              method: 'DELETE',
            })
            .catch(() => {});
      }
      setAttachment(null);
      setProposal(null);
      setConsent(false);
      setRemovalConsent(false);
      setIsApplying(false);
      setPhase('idle');
      setMessage(reason);
    },
    [lifecycle],
  );
  useEffect(() => {
    if (focusPhase.current !== phase) return;
    focusPhase.current = null;
    if (
      document.activeElement !== document.body &&
      !rootRef.current?.contains(document.activeElement)
    )
      return;
    const control =
      phase === 'review'
        ? consentRef.current
        : phase === 'running' || phase === 'preparing'
          ? stopRef.current
          : phase === 'complete'
            ? summaryRef.current
            : captureRef.current;
    control?.focus();
  }, [phase]);

  // Invalidate synchronously above; release image resources after the render commits.
  useEffect(() => {
    if (pendingApply.current && draftState === pendingApply.current) {
      pendingApply.current = null;
      release();
      onApplied();
      return;
    }
    if (pendingApply.current && isSaving) {
      pendingApply.current = null;
      release('stale');
      return;
    }
    const current = resource.current;
    if (current && !lifecycle.active(current.binding, current.epoch)) {
      pendingApply.current = null;
      release('stale');
    }
  });
  const candidate =
    attachment && lifecycle.active(attachment.binding, attachment.epoch) && phase === 'complete'
      ? proposal
      : null;
  useEffect(() => {
    onCandidateChange(candidate);
  }, [candidate, onCandidateChange]);

  const refreshSettings = useCallback(
    async (expectedOwner: string, signal?: AbortSignal) => {
      const next = await latest.current.apiRequest<AiSettings>('/ai/settings', { signal });
      if (ownerRef.current !== expectedOwner) throw new Error('stale');
      const accepted = newerAiSettings(savedSettings.current, next);
      if (savedSettings.current && settingsKey(accepted) !== settingsKey(savedSettings.current))
        release('stale');
      savedSettings.current = accepted;
      setSettings(accepted);
      return accepted;
    },
    [release],
  );
  useEffect(() => {
    let disposed = false;
    let pending = false;
    setRequest('');
    setLoop('');
    savedSettings.current = null;
    setSettings(null);
    setCatalog(null);
    if (!owner) return;
    const refresh = () => {
      if (pending || disposed) return;
      pending = true;
      void refreshSettings(owner)
        .catch(() => {
          if (!disposed && ownerRef.current === owner) {
            savedSettings.current = null;
            setSettings(null);
            release('stale');
          }
        })
        .finally(() => {
          pending = false;
        });
    };
    void apiRequest<AiCatalog>('/ai/catalog')
      .then((value) => {
        if (!disposed) setCatalog(value);
      })
      .catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 2000);
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [owner, apiRequest, refreshSettings, release]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = resource.current;
      if (!current?.snapshot) return;
      if (
        Date.now() >
        current.snapshot.capturedAt + (current.submitted ? L.reviewMs : L.captureAgeMs)
      )
        release('expired');
    }, 1000);
    return () => window.clearInterval(timer);
  }, [release]);
  useEffect(
    () => () => {
      const current = resource.current;
      lifecycle.invalidate();
      if (current) {
        current.controller.abort();
        if (current.url) URL.revokeObjectURL(current.url);
        current.snapshot = null;
        if (current.submitted)
          void latest.current
            .apiRequest(`/ai/route-assistant/runs/${encodeURIComponent(current.binding.runId)}`, {
              method: 'DELETE',
            })
            .catch(() => {});
      }
      resource.current = null;
      latest.current.onCandidateChange(null);
    },
    [lifecycle],
  );

  const selection = settings?.selection;
  const connection = settings?.connections.find(
    (c) => c.providerId === selection?.providerId && c.authMethod === selection?.authMethod,
  );
  const model = catalog?.providers
    .find((p) => p.id === selection?.providerId)
    ?.models.find((m) => m.id === selection?.modelId && m.type === selection?.modelType);
  const capable =
    !!session &&
    (connection?.status === 'connected' ||
      (connection?.authMethod === 'oauth' && connection.refreshing === true)) &&
    selection?.modelType === 'chat' &&
    model?.imageInput === true;
  const loopMeters = loop.trim() === '' ? null : Number(loop) * 1000;
  const loopValid =
    loopMeters === null ||
    (Number.isFinite(loopMeters) && loopMeters >= L.loopMinMeters && loopMeters <= L.loopMaxMeters);
  const active = attachment !== null && lifecycle.active(attachment.binding, attachment.epoch);
  const busy = phase === 'capturing' || phase === 'preparing' || phase === 'running';

  async function capture() {
    if (!capable || !session || !settings || !connection || busy || resource.current) return;
    setMessage(null);
    setConsent(false);
    setRemovalConsent(false);
    editorId.current ??= crypto.randomUUID();
    const binding: AssistantBinding = {
      userId: session.user.id,
      sessionId: session.session.id,
      editorId: editorId.current,
      routeId,
      draftGeneration: lifecycle.generation,
      settingsGeneration: settings.generation,
      connectionGeneration: connection.generation,
      runId: crypto.randomUUID(),
      captureId: crypto.randomUUID(),
    };
    const epoch = lifecycle.begin(binding);
    const current: Attachment = {
      binding,
      epoch,
      controller: new AbortController(),
      draft: draftState,
      snapshot: null,
      url: null,
      submitted: false,
      preparing: false,
      started: Date.now(),
    };
    resource.current = current;
    focusPhase.current = 'review';
    setPhase('capturing');
    const timer = window.setTimeout(() => {
      if (resource.current === current) release('captureFailed');
    }, L.captureMs);
    try {
      const image = await captureMap(current.controller.signal);
      if (
        !lifecycle.active(binding, epoch) ||
        resource.current !== current ||
        current.controller.signal.aborted
      )
        return;
      if (
        Date.now() - image.capturedAt > L.captureAgeMs ||
        image.png.length > Math.ceil((L.pngBytes * 4) / 3) + 32 ||
        image.waypoints.length !== current.draft.draft.waypoints.length ||
        image.waypoints.some((p, i) => {
          const original = current.draft.draft.waypoints[i];
          return (
            p.draftId !== original.draftId ||
            p.latitude !== original.latitude ||
            p.longitude !== original.longitude ||
            p.speedKmh !== original.speedKmh ||
            p.pauseSeconds !== original.pauseSeconds
          );
        })
      )
        throw new Error('capture');
      const base64 = image.png.replace(/^data:image\/png;base64,/, '');
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      current.url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      current.snapshot = { ...image, binding };
      setAttachment(current);
      setPhase('review');
    } catch {
      if (resource.current === current) release('captureFailed');
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function send() {
    const current = resource.current;
    if (
      !current?.snapshot ||
      !consent ||
      !request.trim() ||
      !loopValid ||
      !capable ||
      phase !== 'review' ||
      current.preparing ||
      !lifecycle.active(current.binding, current.epoch)
    )
      return;
    const snapshot = current.snapshot;
    const prompt = request.trim();
    const target = loopMeters;
    current.preparing = true;
    focusPhase.current = 'preparing';
    setPhase('preparing');
    setConsent(false);
    const timer = window.setTimeout(() => {
      if (resource.current === current) release('expired');
    }, L.runMs);
    try {
      const refreshed = await refreshSettings(
        owner,
        AbortSignal.any([current.controller.signal, AbortSignal.timeout(5000)]),
      );
      const liveSession = latest.current.session;
      if (
        !liveSession ||
        liveSession.user.id !== current.binding.userId ||
        liveSession.session.id !== current.binding.sessionId ||
        settingsKey(refreshed) !== settingsKey(settings) ||
        !lifecycle.active(current.binding, current.epoch)
      )
        return;
      if (Date.now() - snapshot.capturedAt > L.captureAgeMs) {
        release('expired');
        return;
      }
      if (!lifecycle.submit(current.binding, current.epoch)) return;
      current.submitted = true;
      current.started = Date.now();
      focusPhase.current = 'running';
      setPhase('running');
      setConsent(false);
      let candidate: AssistantProposal | null = null;
      let done = false;
      let clarification: Message = null;
      const input: AssistantRunInput = { request: prompt, snapshot, loopTargetMeters: target };
      const response = await fetch('/api/backend/ai/route-assistant/runs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${liveSession.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
        signal: current.controller.signal,
      });
      if (!response.ok || !response.body) throw new Error('failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const buffer = new AssistantEventBuffer();
      const consume = (events: unknown[]) => {
        for (const value of events) {
          if (!value || typeof value !== 'object') throw new Error('event');
          const event = value as AssistantEvent;
          if (
            !lifecycle.active(current.binding, current.epoch) ||
            !sameAssistantBinding(event.binding, current.binding) ||
            done
          )
            throw new Error('stale');
          if (event.type === 'proposal') {
            if (
              candidate ||
              clarification ||
              !validateAssistantProposal(event.proposal, snapshot, target)
            )
              throw new Error('proposal');
            candidate = event.proposal;
          } else if (event.type === 'done') done = true;
          else if (
            event.type === 'clarification' &&
            ['unclear', 'ambiguous', 'offscreen', 'unsupported'].includes(event.reason)
          ) {
            if (candidate || clarification) throw new Error('event');
            clarification = event.reason;
          } else if (event.type !== 'status' || !['working', 'validating'].includes(event.status))
            throw new Error('failed');
        }
      };
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          consume(buffer.push(decoder.decode(chunk.value, { stream: true })));
        }
        consume(buffer.push(decoder.decode()));
        buffer.finish();
      } finally {
        reader.releaseLock();
      }
      if (!done || !lifecycle.active(current.binding, current.epoch)) throw new Error('incomplete');
      if (clarification) {
        release(clarification);
        return;
      }
      if (!candidate) throw new Error('missing');
      setProposal(candidate);
      focusPhase.current = 'complete';
      setPhase('complete');
    } catch {
      if (resource.current === current) release('failed');
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function apply() {
    const current = resource.current;
    if (current?.snapshot && Date.now() > current.snapshot.capturedAt + L.reviewMs) {
      release('expired');
      return;
    }
    if (
      !current ||
      !proposal ||
      isSaving ||
      (proposal.removedEventIds.length > 0 && !removalConsent) ||
      !lifecycle.active(current.binding, current.epoch) ||
      lifecycle.consumed
    )
      return;
    // Reserve immediately. React can defer and replay functional updates.
    lifecycle.consumed = true;
    setIsApplying(true);
    try {
      const checked = await refreshSettings(
        owner,
        AbortSignal.any([current.controller.signal, AbortSignal.timeout(5000)]),
      );
      if (resource.current !== current || !lifecycle.active(current.binding, current.epoch)) return;
      if (
        checked.connections.some(
          (entry) =>
            entry.providerId === checked.selection?.providerId && entry.refreshing === true,
        )
      ) {
        lifecycle.consumed = false;
        return;
      }
      if (current.snapshot && Date.now() > current.snapshot.capturedAt + L.reviewMs) {
        release('expired');
        return;
      }
      if (latest.current.isSaving) {
        release('stale');
        return;
      }
      const replacement = replaceRoutePath(current.draft, proposal.waypoints);
      pendingApply.current = replacement;
      setDraftState((state) => {
        if (
          state !== current.draft ||
          !lifecycle.active(current.binding, current.epoch) ||
          latest.current.isSaving
        )
          return state;
        return replacement;
      });
      setProposal(null);
    } catch {
      if (resource.current === current) release('failed');
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Collapsible.Root ref={rootRef} className="route-assistant" open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger asChild>
        <Button type="button" className="secondary" variant="soft">
          {t('open')}
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <Flex direction="column" gap="3" py="3">
          <Text weight="bold">{t('title')}</Text>
          <Text size="2">{t('intro')}</Text>
          <Text size="2">
            {selection
              ? `${selection.providerId} · ${selection.modelId} · ${selection.thinkingLevel ?? selection.modelType}`
              : t('missingModel')}
          </Text>
          <Button type="button" className="secondary" variant="ghost" onClick={onNavigateSettings}>
            {t('settings')}
          </Button>
          {!capable && (
            <Text size="2" role="status">
              {t('missingModel')}
            </Text>
          )}
          {/* Assistant input must not block the outer manual Save form. */}
          <Text as="label" size="2">
            {t('requestLabel')}
            <TextArea
              form=""
              value={request}
              maxLength={L.requestCharacters}
              disabled={busy || phase === 'complete'}
              onChange={(event) => {
                setRequest(event.target.value);
                setConsent(false);
              }}
            />
          </Text>
          <Text as="label" size="2">
            {t('loopTarget')}
            <TextField.Root
              type="number"
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
              min="0.1"
              max="20"
              step="any"
              form=""
              value={loop}
              disabled={busy || phase === 'complete'}
              onChange={(event) => {
                setLoop(event.target.value);
                setConsent(false);
              }}
            />
          </Text>
          <Text size="1">{t('loopHelp')}</Text>
          {!loopValid && <Text size="2">{t('limit')}</Text>}
          {!attachment && (
            <Button
              ref={captureRef}
              type="button"
              disabled={!capable || busy}
              onClick={() => void capture()}
            >
              {t(phase === 'capturing' ? 'capturing' : 'capture')}
            </Button>
          )}
          {active && attachment.snapshot && attachment.url && (
            <>
              {/* The object URL is the exact PNG sent in this run, not a remote image. */}
              {/* biome-ignore lint/performance/noImgElement: exact user-confirmed transient capture */}
              <img
                src={attachment.url}
                width={attachment.snapshot.view.width}
                height={attachment.snapshot.view.height}
                alt={t('requestLabel')}
                style={{ width: '100%', height: 'auto' }}
              />
              <Text size="1">
                {t('captured', {
                  time: new Date(attachment.snapshot.capturedAt).toLocaleTimeString(),
                  width: attachment.snapshot.view.width,
                  height: attachment.snapshot.view.height,
                  style: attachment.snapshot.view.style,
                })}
              </Text>
              <Text size="1">{t('source')}</Text>
              {phase === 'review' && (
                <Button
                  type="button"
                  className="secondary"
                  variant="soft"
                  onClick={() => release()}
                >
                  {t('remove')}
                </Button>
              )}
            </>
          )}
          <Text size="1">{t('required')}</Text>
          <Text size="1">{t('disclosure')}</Text>
          {phase === 'review' && active && (
            <>
              <Text as="label" size="2">
                <Checkbox
                  ref={consentRef}
                  checked={consent}
                  onCheckedChange={(value) => setConsent(value === true)}
                />{' '}
                {t('consent')}
              </Text>
              <Button
                type="button"
                disabled={!consent || !request.trim() || !capable || !loopValid}
                onClick={() => void send()}
              >
                {t('send')}
              </Button>
            </>
          )}
          {(phase === 'running' || phase === 'preparing') && (
            <>
              <Text role="status">{t(phase === 'preparing' ? 'pending' : 'running')}</Text>
              <Button ref={stopRef} type="button" onClick={() => release('cancelled')}>
                {t('stop')}
              </Button>
            </>
          )}
          {connection?.refreshing === true && phase !== 'preparing' && (
            <Text role="status">{t('pending')}</Text>
          )}
          {message && (
            <Text role="status" size="2">
              {t(message)}
            </Text>
          )}
          {active && phase === 'complete' && proposal && (
            <>
              <Text ref={summaryRef} tabIndex={-1} weight="bold">
                {t('approximate')}
              </Text>
              <Text size="2">
                {t('summary', {
                  count: proposal.waypoints.length,
                  distance: (proposal.distanceMeters / 1000).toFixed(2),
                })}
              </Text>
              {proposal.loopTargetMeters !== null && (
                <Text size="2">
                  {t('loopSummary', {
                    target: (proposal.loopTargetMeters / 1000).toFixed(2),
                    error: (
                      (Math.abs(proposal.distanceMeters - proposal.loopTargetMeters) /
                        proposal.loopTargetMeters) *
                      100
                    ).toFixed(1),
                  })}
                </Text>
              )}
              {proposal.removedEventIds.length > 0 && (
                <>
                  <Text size="2">
                    {t('removedEvents', { count: proposal.removedEventIds.length })}
                  </Text>
                  <Text as="label" size="2">
                    <Checkbox
                      checked={removalConsent}
                      onCheckedChange={(value) => setRemovalConsent(value === true)}
                    />{' '}
                    {t('confirmRemoval')}
                  </Text>
                </>
              )}
              <Flex gap="2">
                <Button
                  type="button"
                  disabled={
                    isSaving ||
                    isApplying ||
                    connection?.refreshing === true ||
                    lifecycle.consumed ||
                    (proposal.removedEventIds.length > 0 && !removalConsent)
                  }
                  onClick={apply}
                >
                  {t('apply')}
                </Button>
                <Button
                  type="button"
                  className="secondary"
                  variant="soft"
                  onClick={() => release()}
                >
                  {t('discard')}
                </Button>
              </Flex>
            </>
          )}
        </Flex>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
