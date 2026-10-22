'use client';

import { Box, Button, Flex, Heading, Popover, Text, TextField } from '@radix-ui/themes';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ConfirmDialog, SelectField } from '@/components/ui/radix-ui';
import {
  type AiAttempt,
  type AiAuthMethod,
  type AiCatalog,
  type AiSelection,
  type AiSettings,
  aiAuthorizationUrl,
  aiModelKey,
  newerAiSettings,
  searchAiProviders,
} from '@/lib/ai';
import type { AuthenticatedApiRequest } from '@/lib/api';

export function AiAssistantSettings({
  apiRequest,
  active,
}: {
  apiRequest: AuthenticatedApiRequest;
  active: boolean;
}) {
  const t = useTranslations('AiAssistant');
  const id = useId();
  const epoch = useRef(0);
  const settingsRef = useRef<AiSettings | null>(null);
  const returnedAttemptRef = useRef<string | null>(null);
  const authorizationRevision = useRef(0);
  const busy = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [catalog, setCatalog] = useState<AiCatalog | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [selection, setSelection] = useState<AiSelection | null>(null);
  const [method, setMethod] = useState<AiAuthMethod>('api_key');
  const [providerId, setProviderId] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const [operationError, setOperationError] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(false);
  const [thinkingCleared, setThinkingCleared] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [attempt, setAttempt] = useState<AiAttempt | null>(null);
  const [responseState, setResponseState] = useState({ key: '', value: '' });
  const [departure, setDeparture] = useState<{
    id: string;
    authorizationUrl: string;
    expiresAt: string;
  } | null>(null);
  const [reload, setReload] = useState(0);
  const provider = catalog?.providers.find((item) => item.id === providerId);
  const capability = provider?.methods.find((item) => item.type === method);
  const methodAvailable = !!capability?.available;
  const prompt = attempt?.interaction?.prompt;
  const interactionUrl = aiAuthorizationUrl(attempt?.interaction?.authorizationUrl);
  const attemptActive =
    !!attempt && ['pending', 'code_received', 'processing'].includes(attempt.status);
  const attemptStatus =
    attempt?.status === 'processing' &&
    (prompt || attempt.interaction?.userCode) &&
    !attempt.interaction?.message
      ? 'pending'
      : attempt?.status;

  const responseKey = JSON.stringify([attempt?.id, prompt?.id, method, providerId, active]);
  const response = responseState.key === responseKey ? responseState.value : '';
  function setResponse(value: string) {
    setResponseState({ key: responseKey, value });
  }
  useEffect(() => {
    setResponseState((current) =>
      current.key === responseKey ? current : { key: responseKey, value: '' },
    );
  }, [responseKey]);
  const models = provider?.models ?? [];
  const model = models.find(
    (item) =>
      selection &&
      aiModelKey(item) === aiModelKey({ id: selection.modelId, type: selection.modelType }),
  );
  const results = searchAiProviders(catalog?.providers ?? [], method, query);
  const modelKey = selection
    ? aiModelKey({ id: selection.modelId, type: selection.modelType })
    : '';
  const unavailable = !!selection && (!provider || !model || !capability);
  const validThinking =
    model?.type !== 'chat' || model.thinkingLevels.includes(selection?.thinkingLevel ?? '');

  const applySettings = useCallback((value: AiSettings, updateForm = false) => {
    if (newerAiSettings(settingsRef.current, value) !== value) return;
    settingsRef.current = value;
    setSettings(value);
    if (updateForm) {
      setSelection(value.selection);
      setMethod(value.selection?.authMethod ?? 'api_key');
      setProviderId(value.selection?.providerId ?? '');
    }
  }, []);

  useEffect(() => {
    const generation = ++epoch.current;
    busy.current = false;
    setWorking(false);
    setApiKey('');
    setConfig({});
    if (!active) return;
    if (reload > 0) setNotice(false);
    setOperationError(false);
    setCatalogLoading(true);
    setSettingsLoading(true);
    setCatalogError(false);
    setSettingsError(false);
    void apiRequest<AiCatalog>('/ai/catalog')
      .then((value) => {
        if (epoch.current === generation) setCatalog(value);
      })
      .catch(() => {
        if (epoch.current === generation) setCatalogError(true);
      })
      .finally(() => {
        if (epoch.current === generation) setCatalogLoading(false);
      });
    void apiRequest<AiSettings>('/ai/settings')
      .then((value) => {
        if (epoch.current !== generation) return;
        applySettings(value, !returnedAttemptRef.current);
      })
      .catch(() => {
        if (epoch.current === generation) setSettingsError(true);
      })
      .finally(() => {
        if (epoch.current === generation) setSettingsLoading(false);
      });
    const url = new URL(window.location.href);
    const returnedAttempt = url.searchParams.get('aiAttempt') ?? returnedAttemptRef.current;
    if (returnedAttempt) {
      returnedAttemptRef.current = returnedAttempt;
      const revision = authorizationRevision.current;
      void apiRequest<AiAttempt>(`/ai/authorizations/${encodeURIComponent(returnedAttempt)}`)
        .then(async (value) => {
          if (epoch.current !== generation || authorizationRevision.current !== revision) return;
          setAttempt(value);
          if (!['pending', 'code_received', 'processing'].includes(value.status)) {
            returnedAttemptRef.current = null;
            setDeparture(null);
            if (value.status === 'completed') {
              const current = await apiRequest<AiSettings>('/ai/settings');
              if (epoch.current !== generation || authorizationRevision.current !== revision)
                return;
              applySettings(current, true);
            } else if (settingsRef.current) {
              applySettings(settingsRef.current, true);
            }
          } else {
            setMethod('oauth');
            setProviderId(value.providerId);
            setSelection((previous) =>
              previous?.authMethod === 'oauth' && previous.providerId === value.providerId
                ? previous
                : null,
            );
          }
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.delete('aiAttempt');
          window.history.replaceState(
            window.history.state,
            '',
            `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
          );
        })
        .catch(() => {
          if (epoch.current === generation && authorizationRevision.current === revision)
            setOperationError(true);
        });
    }
    return () => {
      ++epoch.current;
    };
  }, [active, apiRequest, reload, applySettings]);

  useEffect(() => {
    if (
      !catalog ||
      !model ||
      !selection?.thinkingLevel ||
      model.thinkingLevels.includes(selection.thinkingLevel)
    )
      return;
    setSelection((value) => (value ? { ...value, thinkingLevel: null } : value));
    setThinkingCleared(true);
  }, [catalog, model, selection]);

  async function operate(action: () => Promise<void>) {
    if (busy.current || !active) return;
    const generation = epoch.current;
    busy.current = true;
    setWorking(true);
    setOperationError(false);
    setNotice(false);
    try {
      await action();
    } catch {
      if (epoch.current === generation) setOperationError(true);
    } finally {
      if (epoch.current === generation) {
        busy.current = false;
        setWorking(false);
      }
    }
  }

  const refresh = useCallback(
    async (generation: number) => {
      const value = await apiRequest<AiSettings>('/ai/settings');
      if (epoch.current === generation) applySettings(value);
    },
    [apiRequest, applySettings],
  );

  useEffect(() => {
    if (!active || !attempt || !['pending', 'code_received', 'processing'].includes(attempt.status))
      return;
    const generation = epoch.current;
    const revision = authorizationRevision.current;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (Date.parse(attempt.expiresAt) <= Date.now()) {
        setAttempt({ ...attempt, status: 'expired' });
        returnedAttemptRef.current = null;
        setDeparture(null);
        return;
      }
      void (async () => {
        const path = `/ai/authorizations/${encodeURIComponent(attempt.id)}`;
        const value =
          attempt.status === 'code_received'
            ? await apiRequest<AiAttempt>(`${path}/complete`, { method: 'POST', body: '{}' })
            : await apiRequest<AiAttempt>(path);
        if (cancelled || epoch.current !== generation || authorizationRevision.current !== revision)
          return;
        setAttempt(value);
        if (!['pending', 'code_received', 'processing'].includes(value.status)) {
          returnedAttemptRef.current = null;
          setDeparture(null);
        }
        if (value.status === 'completed') {
          setDeparture(null);
          await refresh(generation);
        }
      })().catch(() => {
        if (
          !cancelled &&
          epoch.current === generation &&
          authorizationRevision.current === revision
        )
          setOperationError(true);
      });
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, attempt, apiRequest, refresh]);

  useEffect(() => {
    if (open)
      document.getElementById(`${id}-provider-${cursor}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, cursor, id]);

  function cancelPreviousAuthorization() {
    const revision = ++authorizationRevision.current;
    const generation = epoch.current;
    const url = new URL(window.location.href);
    const previousId =
      attempt?.id ?? returnedAttemptRef.current ?? url.searchParams.get('aiAttempt');
    returnedAttemptRef.current = null;
    url.searchParams.delete('aiAttempt');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
    setAttempt(null);
    setDeparture(null);
    setResponse('');
    if (
      previousId &&
      (!attempt || ['pending', 'code_received', 'processing'].includes(attempt.status))
    ) {
      void apiRequest(`/ai/authorizations/${encodeURIComponent(previousId)}`, {
        method: 'DELETE',
      }).catch(() => {
        if (epoch.current === generation && authorizationRevision.current === revision)
          setOperationError(true);
      });
    }
  }

  function chooseProvider(value: string, nextMethod = method) {
    if (value !== providerId || nextMethod !== method) {
      cancelPreviousAuthorization();
      setSelection(null);
    }
    setMethod(nextMethod);
    setProviderId(value);
    setApiKey('');
    setConfig({});
    setThinkingCleared(false);
    setOpen(false);
  }

  const disabled = working || settingsLoading || settingsError || !settings;
  const validConfig = provider?.fields.every(
    (field) => !field.required || config[field.name]?.trim(),
  );
  const error = (key: 'catalogError' | 'settingsError' | 'operationError') => (
    <Text role="alert" color="red">
      {t(key)}
    </Text>
  );
  if (!active) return null;

  return (
    <Flex direction="column" gap="4" aria-label={t('title')}>
      <Heading size="4">{t('title')}</Heading>
      <Text>{t('accountHelp')}</Text>
      <Text>{t('serverAccessWarning')}</Text>
      <Text>{t('billingWarning')}</Text>
      {catalogLoading && <Text role="status">{t('catalogLoading')}</Text>}
      {catalogError && error('catalogError')}
      {settingsLoading && <Text role="status">{t('settingsLoading')}</Text>}
      {settingsError && error('settingsError')}
      {(catalogError || settingsError || operationError) && (
        <Button
          variant="soft"
          disabled={working}
          onClick={() => {
            setReload((value) => value + 1);
            setAttempt((value) => (value ? { ...value } : value));
          }}
        >
          {t('retry')}
        </Button>
      )}
      {operationError && error('operationError')}
      {notice && <Text role="status">{t('saved')}</Text>}
      <SelectField
        label={t('setupMethod')}
        value={method}
        disabled={disabled}
        options={[
          { value: 'api_key', label: t('methods.api_key') },
          { value: 'oauth', label: t('methods.oauth') },
        ]}
        onValueChange={(value) => {
          cancelPreviousAuthorization();
          setMethod(value);
          setProviderId('');
          setSelection(null);
          setApiKey('');
          setConfig({});
        }}
      />
      <Text size="2" weight="medium">
        {t('provider')}
      </Text>
      <Popover.Root
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          setQuery('');
          setCursor(0);
        }}
      >
        <Popover.Trigger>
          <Button variant="soft" disabled={disabled || catalogLoading} aria-label={t('provider')}>
            {provider?.name ?? (providerId || t('chooseProvider'))}
          </Button>
        </Popover.Trigger>
        <Popover.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <TextField.Root
            ref={searchRef}
            aria-label={t('searchProviders')}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-providers`}
            aria-autocomplete="list"
            aria-activedescendant={results[cursor] ? `${id}-provider-${cursor}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                setCursor((value) =>
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? Math.max(0, results.length - 1)
                      : Math.max(
                          0,
                          Math.min(
                            results.length - 1,
                            value + (event.key === 'ArrowDown' ? 1 : -1),
                          ),
                        ),
                );
              }
              if (event.key === 'Enter' && results[cursor]) {
                event.preventDefault();
                chooseProvider(results[cursor].id);
              }
            }}
          />
          <Box
            id={`${id}-providers`}
            role="listbox"
            aria-label={t('provider')}
            style={{ maxHeight: 240, overflowY: 'auto' }}
          >
            {results.map((item, index) => (
              <Box
                key={item.id}
                id={`${id}-provider-${index}`}
                role="option"
                aria-selected={index === cursor}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseProvider(item.id)}
                p="2"
                style={{
                  cursor: 'pointer',
                  background: index === cursor ? 'var(--accent-a3)' : undefined,
                }}
              >
                {item.name} <Text size="1">{item.id}</Text>
              </Box>
            ))}
          </Box>
          {!results.length && <Text>{t('noProviders')}</Text>}
        </Popover.Content>
      </Popover.Root>
      {providerId && !methodAvailable && (
        <Text role="status">
          {t(capability?.reason ? `unavailable.${capability.reason}` : 'selectionUnavailable')}
        </Text>
      )}
      <SelectField
        label={t('model')}
        value={modelKey}
        disabled={disabled || !provider}
        placeholder={t('chooseModel')}
        options={[
          ...(!model && modelKey
            ? [
                {
                  value: modelKey,
                  label: t('unavailableModel', { model: modelKey }),
                  disabled: true,
                },
              ]
            : []),
          ...models.map((item) => ({
            value: aiModelKey(item),
            label: `${item.name} (${aiModelKey(item)})`,
          })),
        ]}
        onValueChange={(value) => {
          const next = models.find((item) => aiModelKey(item) === value);
          if (!next) return;
          if (selection?.thinkingLevel && !next.thinkingLevels.includes(selection.thinkingLevel))
            setThinkingCleared(true);
          setSelection({
            authMethod: method,
            providerId,
            modelId: next.id,
            modelType: next.type,
            thinkingLevel:
              selection?.thinkingLevel && next.thinkingLevels.includes(selection.thinkingLevel)
                ? selection.thinkingLevel
                : null,
          });
        }}
      />
      {!!model?.thinkingLevels.length && (
        <SelectField
          label={t('thinking')}
          value={selection?.thinkingLevel ?? ''}
          disabled={disabled}
          placeholder={t('defaultThinking')}
          options={model.thinkingLevels.map((value) => ({ value, label: value }))}
          onValueChange={(value) => {
            setSelection((previous) =>
              previous ? { ...previous, thinkingLevel: value } : previous,
            );
            setThinkingCleared(false);
          }}
        />
      )}
      {model && model.type !== 'chat' && <Text>{t('thinkingNotApplicable')}</Text>}
      {thinkingCleared && <Text role="status">{t('thinkingCleared')}</Text>}
      {unavailable && <Text role="status">{t('selectionUnavailable')}</Text>}
      <Button
        disabled={
          disabled || catalogLoading || catalogError || !selection || unavailable || !validThinking
        }
        onClick={() =>
          void operate(async () => {
            const generation = epoch.current;
            const value = await apiRequest<AiSettings>('/ai/settings', {
              method: 'PUT',
              body: JSON.stringify({ generation: settings?.generation, selection }),
            });
            if (epoch.current !== generation) return;
            applySettings(value);
            setNotice(true);
          })
        }
      >
        {t('save')}
      </Button>
      {method === 'api_key' && provider && (
        <Flex direction="column" gap="3">
          <Text as="label" htmlFor={`${id}-key`}>
            {t('apiKey')}
          </Text>
          <TextField.Root
            id={`${id}-key`}
            type="password"
            autoComplete="off"
            value={apiKey}
            disabled={disabled || !methodAvailable}
            onChange={(event) => setApiKey(event.target.value)}
          />
          {provider.fields.map((field) => (
            <Box key={field.name}>
              <Text as="label" htmlFor={`${id}-${field.name}`}>
                {t(
                  `fields.${field.name as 'accountId' | 'gatewayId' | 'resourceName' | 'apiVersion' | 'deploymentMap' | 'region'}`,
                )}
              </Text>
              <TextField.Root
                id={`${id}-${field.name}`}
                autoComplete="off"
                required={field.required}
                disabled={disabled || !methodAvailable}
                value={config[field.name] ?? ''}
                onChange={(event) =>
                  setConfig((value) => ({ ...value, [field.name]: event.target.value }))
                }
              />
            </Box>
          ))}
          <Button
            disabled={disabled || !methodAvailable || !apiKey.trim() || !validConfig}
            onClick={() =>
              void operate(async () => {
                const generation = epoch.current;
                await apiRequest(`/ai/connections/${encodeURIComponent(providerId)}`, {
                  method: 'POST',
                  body: JSON.stringify({
                    apiKey,
                    config,
                    expectedGeneration: settings?.connectionGenerations[providerId] ?? 0,
                  }),
                });
                if (epoch.current !== generation) return;
                setApiKey('');
                setConfig({});
                await refresh(generation);
              })
            }
          >
            {t('connect')}
          </Button>
        </Flex>
      )}
      {method === 'oauth' && <Text>{t('providerConsentWarning')}</Text>}
      {method === 'oauth' && (
        <Button
          disabled={
            disabled ||
            !providerId ||
            !methodAvailable ||
            !!departure ||
            (!!attempt && ['pending', 'processing', 'code_received'].includes(attempt.status))
          }
          onClick={() =>
            void operate(async () => {
              const generation = epoch.current;
              const revision = ++authorizationRevision.current;
              returnedAttemptRef.current = null;
              setResponse('');
              const value = await apiRequest<AiAttempt>(
                `/ai/authorizations/${encodeURIComponent(providerId)}`,
                { method: 'POST', body: '{}' },
              );
              if (epoch.current !== generation || authorizationRevision.current !== revision)
                return;
              setAttempt(value);
              returnedAttemptRef.current = ['pending', 'processing', 'code_received'].includes(
                value.status,
              )
                ? value.id
                : null;
              if (value.authorizationUrl) {
                const authorizationUrl = aiAuthorizationUrl(value.authorizationUrl);
                if (
                  providerId !== 'openrouter' ||
                  !authorizationUrl ||
                  new URL(authorizationUrl).hostname !== 'openrouter.ai'
                )
                  throw new Error('invalid_authorization_url');
                returnedAttemptRef.current = value.id;
                setDeparture({ id: value.id, authorizationUrl, expiresAt: value.expiresAt });
              } else {
                setDeparture(null);
              }
              if (value.status === 'completed') await refresh(generation);
            })
          }
        >
          {t('authorize')}
        </Button>
      )}
      {departure && (
        <Button
          disabled={working || Date.parse(departure.expiresAt) <= Date.now()}
          onClick={() => window.location.assign(departure.authorizationUrl)}
        >
          {t('leaveForAuthorization')}
        </Button>
      )}
      {attemptStatus && <Text role="status">{t(`attempt.${attemptStatus}`)}</Text>}
      {attemptActive && attempt?.interaction && (
        <Flex direction="column" gap="3">
          {interactionUrl && (
            <Button asChild variant="soft">
              <a href={interactionUrl} target="_blank" rel="noopener noreferrer">
                {t('openAuthorization')}
              </a>
            </Button>
          )}
          {attempt.interaction.userCode && (
            <Text>
              {t('authorizationCode')}: <Text weight="bold">{attempt.interaction.userCode}</Text>
            </Text>
          )}
          {attempt.interaction.instructions && <Text>{attempt.interaction.instructions}</Text>}
          {attempt.interaction.message && <Text role="status">{attempt.interaction.message}</Text>}
          {prompt && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!response.trim()) return;
                void operate(async () => {
                  const generation = epoch.current;
                  const revision = ++authorizationRevision.current;
                  try {
                    const value = await apiRequest<AiAttempt>(
                      `/ai/authorizations/${encodeURIComponent(attempt.id)}/respond`,
                      {
                        method: 'POST',
                        body: JSON.stringify({ promptId: prompt.id, value: response }),
                      },
                    );
                    if (epoch.current !== generation || authorizationRevision.current !== revision)
                      return;
                    setResponse('');
                    setAttempt(value);
                    if (value.status === 'completed') await refresh(generation);
                  } finally {
                    if (epoch.current === generation && authorizationRevision.current === revision)
                      setAttempt((value) => (value ? { ...value } : value));
                  }
                });
              }}
            >
              <Flex direction="column" gap="3">
                <Text>{prompt.message}</Text>
                {prompt.type === 'select' ? (
                  <SelectField
                    label={t('authorizationResponse')}
                    value={response}
                    disabled={working}
                    options={(prompt.options ?? []).map((option) => ({
                      value: option.id,
                      label: option.label,
                    }))}
                    onValueChange={setResponse}
                  />
                ) : (
                  <>
                    <Text as="label" htmlFor={`${id}-response`}>
                      {t('authorizationResponse')}
                    </Text>
                    <TextField.Root
                      id={`${id}-response`}
                      type={prompt.type === 'text' ? 'text' : 'password'}
                      autoComplete="off"
                      placeholder={prompt.placeholder}
                      value={response}
                      disabled={working}
                      onChange={(event) => setResponse(event.target.value)}
                    />
                  </>
                )}
                <Button type="submit" disabled={working || !response.trim()}>
                  {t('submitResponse')}
                </Button>
              </Flex>
            </form>
          )}
        </Flex>
      )}
      {attemptActive && attempt && (
        <Button
          variant="soft"
          disabled={working}
          onClick={() =>
            void operate(async () => {
              const generation = epoch.current;
              const revision = authorizationRevision.current;
              await apiRequest(`/ai/authorizations/${encodeURIComponent(attempt.id)}`, {
                method: 'DELETE',
              });
              if (epoch.current === generation && authorizationRevision.current === revision) {
                ++authorizationRevision.current;
                setResponse('');
                returnedAttemptRef.current = null;
                setAttempt(null);
                setDeparture(null);
              }
            })
          }
        >
          {t('cancelAuthorization')}
        </Button>
      )}
      <Heading size="3">{t('connections')}</Heading>
      {settings?.connections.length === 0 && <Text>{t('noConnections')}</Text>}
      {settings?.connections.map((connection) => (
        <Flex
          key={`${connection.providerId}:${connection.authMethod}`}
          gap="3"
          align="center"
          wrap="wrap"
        >
          <Text>
            {catalog?.providers.find((item) => item.id === connection.providerId)?.name ??
              connection.providerId}
          </Text>
          <Text>{t(`connection.${connection.status}`)}</Text>
          <Button
            variant="soft"
            disabled={disabled}
            onClick={() => {
              chooseProvider(connection.providerId, connection.authMethod);
            }}
          >
            {t('reconnect')}
          </Button>
          <ConfirmDialog
            title={t('disconnectTitle')}
            description={t('disconnectWarning')}
            confirmLabel={t('disconnect')}
            cancelLabel={t('cancel')}
            disabled={disabled}
            trigger={
              <Button color="red" variant="soft">
                {t('disconnect')}
              </Button>
            }
            onConfirm={() =>
              operate(async () => {
                const generation = epoch.current;
                await apiRequest(`/ai/connections/${encodeURIComponent(connection.providerId)}`, {
                  method: 'DELETE',
                  body: JSON.stringify({ expectedGeneration: connection.generation }),
                });
                await refresh(generation);
              })
            }
          />
        </Flex>
      ))}
    </Flex>
  );
}
