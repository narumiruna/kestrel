# OpenID Connect sign-in

Kestrel supports one optional, standards-based OpenID Connect (OIDC) provider for Web and Android. It is not tied to Pocket ID: compatible providers include Pocket ID, Authentik, Keycloak, and Authelia. Local username/password, TOTP, and recovery-code login remain available whether OIDC is enabled or not.

## Provider requirements

Create a confidential OIDC client with:

- Authorization Code flow.
- PKCE with the `S256` challenge method.
- `openid profile` scopes.
- A signed ID token containing `sub`; first-time Kestrel provisioning also needs a valid `preferred_username` claim.
- `client_secret_basic` or `client_secret_post` token endpoint authentication advertised through discovery. If discovery omits the metadata, Kestrel uses the OIDC default, `client_secret_basic`.
- The exact redirect URI derived from `KESTREL_PUBLIC_URL`, for example `https://kestrel.example.com/api/backend/auth/oidc/callback`.

Provider-specific access policy, groups, and passkey requirements remain configured at the identity provider.

### Pocket ID example

Create a confidential client, enable PKCE, keep **Public Client** disabled, allow `openid profile`, and register the Kestrel backend redirect URI. Copy its issuer URL, client ID, and client secret into the generic `AUTH_OIDC_*` settings below.

### Authentik example

Create an OAuth2/OpenID Provider and Application using Authorization Code flow. Register the Kestrel backend redirect URI, select a signing key, and ensure the selected scopes expose `openid`, `profile`, `sub`, and `preferred_username`. Use the provider's OpenID Configuration URL to determine the issuer value.

## Backend configuration

OIDC is enabled only when all required values below are non-empty and valid. Leaving them unset disables OIDC without affecting local authentication. `AUTH_OIDC_DISPLAY_NAME` is optional and defaults to `OpenID Connect`.

```dotenv
KESTREL_PUBLIC_URL=https://kestrel.example.com
AUTH_OIDC_ISSUER=https://id.example.com
AUTH_OIDC_CLIENT_ID=<client-id>
AUTH_OIDC_CLIENT_SECRET=<client-secret>
AUTH_OIDC_DISPLAY_NAME=Authentik
AUTH_OIDC_FLOW_ENCRYPTION_KEY=<32-byte-base64-or-64-character-hex-key>
```

Generate the flow-encryption key separately from every other application key:

```bash
openssl rand -base64 32
```

`KESTREL_PUBLIC_URL` must contain only the public origin, without a path, query, or fragment. Kestrel derives the fixed callback URLs from it:

- Backend provider redirect: `${KESTREL_PUBLIC_URL}/api/backend/auth/oidc/callback`
- Web sign-in callback: `${KESTREL_PUBLIC_URL}/login/oidc`
- Web account-link callback: `${KESTREL_PUBLIC_URL}/dashboard/account/oidc`
- Android callback: `${KESTREL_PUBLIC_URL}/login/oidc/android`

Production requires HTTPS. Outside `NODE_ENV=production`, HTTP provider and public URLs are accepted for local integration testing; the public URL may use HTTP only on `localhost`, `127.0.0.1`, or `[::1]` so browser Web Crypto remains available.

For GitHub Actions deployment, configure these repository variables:

- `KESTREL_PUBLIC_URL`
- `AUTH_OIDC_CLIENT_ID`
- `AUTH_OIDC_DISPLAY_NAME`
- `AUTH_OIDC_ISSUER`

Configure these repository secrets:

- `AUTH_OIDC_CLIENT_SECRET`
- `AUTH_OIDC_FLOW_ENCRYPTION_KEY`

No deployment-specific issuer, client ID, or public origin is stored in the repository. Client IDs and secrets are opaque values and are used exactly as configured, including any leading or trailing whitespace; the deploy workflow passes them directly from step-scoped process environment values to Compose so characters such as `$`, `'`, spaces, `#`, and backslashes are preserved. Compose passes empty values when OIDC is unconfigured, so local authentication remains available.

Production ingress must apply a per-source rate limit to `POST /auth/oidc/start` and `GET /auth/oidc/callback` before requests reach Kestrel. Use only the ingress connection address or an address header that the ingress overwrites; never trust a client-supplied forwarding header. Kestrel additionally rejects callback claims above 120 new rows per minute or 1,000 active rows and prunes expired rows before admission. These global backstops bound database writes/storage but do not replace source-aware edge limits.

## Android App Link

The derived `${KESTREL_PUBLIC_URL}/login/oidc/android` callback must be an HTTPS App Link claimed by the Android build, not a custom scheme. Its scheme, host, and path must exactly match the app manifest, and that host must serve `/.well-known/assetlinks.json` for the app's package and signing certificate. Only deployment-owned hosts belong in `android:autoVerify` filters; third-party candidate links such as Google Maps must remain unverified so Android 10–11 can verify the callback host independently. A self-hosted fork using another domain or application ID must change the manifest callback constants and publish its own Digital Asset Links file before enabling Android OIDC.

## Account behavior

Kestrel identifies an OIDC account only by the verified `(issuer, sub)` pair. On first login it creates a new Kestrel account using `preferred_username`. The claim is required and validated only for first-time provisioning; an already-linked identity can still sign in if the provider later omits it. Kestrel never links by mutable username or email.

The username must be 3–64 characters and contain only letters, numbers, dots, underscores, or hyphens. If it already belongs to another Kestrel account, login fails instead of merging accounts.

An existing password-backed account can link the configured provider from **Web → Account → Sign-in methods**. Starting the link requires the current Kestrel password, and completion requires the same still-active browser session that initiated it. Kestrel then attaches the provider's verified `(issuer, sub)` identity to the current account without changing the username or creating a new session. Linking fails if that identity belongs to another Kestrel account or if this account already has a different identity for the configured issuer. Android account linking and unlinking are not currently available.

Provider tokens stay in the backend and are not persisted. Web and Android receive the same Kestrel access and rotating refresh tokens as local login. OIDC-only accounts can sign out and revoke their current session, but password-protected step-up operations remain unavailable because provider reauthentication is not implemented.

## Security flow

The backend validates discovery issuer, ID-token signature, audience, authorized party, expiry, nonce, and subject. Authorization start is stateless: the PKCE verifier, client binding, client type, and expiry travel only in authenticated AES-256-GCM-encrypted state. A callback first rejects missing, oversized, or non-printable authorization codes without storage. A callback carrying a validly shaped code then atomically records a state-hash claim before contacting the provider, so replaying an in-progress state cannot repeat the outbound token request. Provider and completion work has a two-minute processing deadline, while the claim remains a replay barrier through both that deadline and the authorization-state lifetime. Kestrel rejects provider endpoint redirects so authorization codes, PKCE verifiers, client secrets, and access tokens are never forwarded to an unvalidated redirect target. It fetches signing keys before redeeming the one-time authorization code, keeping transport failures and retryable HTTP responses (`408`, `425`, `429`, and `5xx`) safely retryable. If the returned ID token uses an unknown key after code redemption, Kestrel re-fetches JWKS and verifies the retained token response again to tolerate routine provider key rotation. Provider error callbacks do not contact the provider or write an attempt row. A transient discovery or signing-key failure releases an incomplete claim and returns a retryable server error. Once a token request might have reached the provider, an ambiguous transport, body, or retryable HTTP failure keeps the claim because the one-time code may already be consumed; terminal provider/code/token-validation failures consume the claim. After successful code redemption, transient UserInfo and callback-storage failures retry within the processing lease and likewise never release the claim for unsafe code reuse. Each UserInfo request is capped to the remaining lease with time reserved for callback completion.

The backend redirects to fixed client callbacks derived from `KESTREL_PUBLIC_URL` with a short-lived, one-time Kestrel exchange ticket in the URL fragment. The ticket is bound to a nonce retained by the initiating Web tab or Android app and consumed atomically. If that redirect is lost, a completed callback can reproduce it while the ticket remains live even after the original authorization state expires. Web commits pending exchange data to tab-scoped storage before removing the URL fragment; if storage fails, the fragment remains available for reload. Each Web exchange request has a 15-second bound, so a hung connection reaches the retry path without discarding the durable ticket. Android keeps the ticket in app-private storage through synchronized compare-and-set, pins authorization and exchange requests to the attempt's saved server, serializes authentication and attempt cleanup, and validates the callback against the current attempt. A completed exchange remains recoverable by the same ticket and nonce for 20 minutes so ambiguous network failures and transient `408`, `425`, or `429` responses can retry without creating another session, including after that session's refresh token rotates. Concurrent Web callbacks that recover that same session are idempotent and do not revoke the already-saved session. Android logout clears both local session state and any recoverable OIDC attempt under the authentication mutex, preventing a stale ticket from restoring an intentionally removed session; session cleanup still runs if attempt storage reports a failure. Recovery derives the same refresh token from those client-held secrets instead of persisting a decryptable raw session credential. Provider tokens and Kestrel session tokens never appear in callback URLs.
