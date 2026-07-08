## Goal

Publish DNS for AI Discovery records under the production domain so agents can discover Kestrel entrypoints through DNS-AID SVCB/HTTPS records, with DNSSEC-authenticated responses.

## Context

- This work is primarily DNS/provider configuration, not Android app code.
- Repository changes may still be useful for documenting zone snippets and deployment evidence.
- References: DNS-AID draft, RFC 9460, and `https://isitagentready.com/.well-known/agent-skills/dns-aid/SKILL.md`.

## Unknowns

- The production domain and DNS provider.
- Whether the DNS provider supports ServiceMode SVCB/HTTPS records and DNSSEC for the public zone.
- The final set of agent entrypoints to advertise, such as index, API catalog, MCP, or A2A endpoints.

## Plan

- [ ] Identify the authoritative production domain, DNS provider, and DNSSEC status; verify with `dig NS $DOMAIN`, provider console evidence, and `dig +dnssec $DOMAIN SOA`.
- [ ] Read the current DNS-AID draft and map Kestrel discovery resources to well-known owner names such as `_index._agents.$DOMAIN`; verify the chosen names and parameters in a committed `docs/agent-discovery-dns.md` note.
- [ ] Prepare provider-specific SVCB/HTTPS record snippets using ServiceMode and draft-defined parameters such as `alpn` and endpoint data; verify syntax with the DNS provider's validation or a staging zone.
- [ ] Publish records to DNS only after the referenced HTTPS endpoints exist; verify with `dig SVCB _index._agents.$DOMAIN` or `dig HTTPS _index._agents.$DOMAIN` as appropriate.
- [ ] Enable or confirm DNSSEC signing for the public zone; verify with a validating resolver command such as `dig +dnssec +multi _index._agents.$DOMAIN SVCB` and evidence that authenticated data is returned.
- [ ] Add rollback instructions to `docs/agent-discovery-dns.md`; verify the doc lists exact records to remove or disable.

## Risks

- The DNS-AID draft may change, requiring record format updates.
- Incorrect DNS records can advertise unavailable endpoints for the TTL duration.
- DNSSEC misconfiguration can make the domain fail validation.

## Rollback / Recovery

- Remove or disable the `_agents` records and wait for TTL expiry; verify with `dig` that the records no longer resolve while core site records still validate.

## Completion Checklist

- [ ] DNS-AID SVCB/HTTPS records resolve for the approved owner names, verified by `dig` output saved in the implementation notes.
- [ ] Referenced HTTPS endpoints return successful responses, verified by `curl -i` for each endpoint URL advertised in DNS.
- [ ] DNSSEC validation is active for the discovery zone, verified by validating resolver output with authenticated data.
