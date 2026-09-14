# Pocket ID sign-in

Kestrel supports Pocket ID as an optional OpenID Connect login for Web and Android. Existing username/password, TOTP, and recovery-code login remain available.

## Pocket ID client

Create one OIDC client in Pocket ID:

- **Client type:** confidential; leave **Public Client** disabled.
- **PKCE:** enabled.
- **Callback URL:** the public Kestrel backend callback, normally `https://kestrel.example.com/api/backend/auth/oidc/pocket-id/callback`.
- **Scopes:** Kestrel requests `openid profile`.
- **Allowed groups:** configure in Pocket ID if access should be restricted.

Copy the client ID and client secret. The callback URL in Pocket ID must exactly match `AUTH_POCKET_ID_REDIRECT_URI`.

## Backend configuration

Set all six values to enable the method. Leaving all six unset disables Pocket ID without affecting local login. A partial configuration is rejected when a login starts.

```dotenv
AUTH_POCKET_ID_ISSUER=https://id.example.com
AUTH_POCKET_ID_CLIENT_ID=<client-id>
AUTH_POCKET_ID_CLIENT_SECRET=<client-secret>
AUTH_POCKET_ID_REDIRECT_URI=https://kestrel.example.com/api/backend/auth/oidc/pocket-id/callback
AUTH_POCKET_ID_WEB_CALLBACK_URI=https://kestrel.example.com/login/pocket-id
AUTH_OIDC_FLOW_ENCRYPTION_KEY=<32-byte-base64-or-64-character-hex-key>
```

Generate the flow-encryption key separately from the TOTP encryption key:

```bash
openssl rand -base64 32
```

Production requires HTTPS. HTTP issuer and callback URLs are accepted only outside `NODE_ENV=production` for local integration testing.

Kestrel's production Compose defaults are:

```dotenv
AUTH_POCKET_ID_ISSUER=https://pocket-id.narumi.dev
AUTH_POCKET_ID_CLIENT_ID=98905546-789c-49c6-b7e5-dcc184c2fbbb
AUTH_POCKET_ID_REDIRECT_URI=https://kestrel.narumi.dev/api/backend/auth/oidc/pocket-id/callback
AUTH_POCKET_ID_WEB_CALLBACK_URI=https://kestrel.narumi.dev/login/pocket-id
```

Only the client secret and independently generated flow-encryption key must be supplied as production secrets to enable this configured client. The deploy workflow writes the production client ID explicitly and accepts the optional GitHub Actions repository variable `AUTH_POCKET_ID_CLIENT_ID` to override it.

## Account behavior

Kestrel identifies a Pocket ID account only by the verified OIDC `(issuer, sub)` pair. On first login it creates a new Kestrel account using `preferred_username` for display. The claim is required and validated only for first-time provisioning; an already-linked identity can still sign in if Pocket ID later omits it. Kestrel never links by mutable username or email.

The Pocket ID username must be 3–64 characters and contain only letters, numbers, dots, underscores, or hyphens. If that username already belongs to any Kestrel account, login fails instead of merging accounts. Change the Pocket ID username or use a separate Kestrel deployment; automatic linking is intentionally unsupported.

Pocket ID tokens stay in the backend and are not persisted. Web and Android receive the same short-lived Kestrel access token and rotating refresh token as local login.

Pocket ID-only accounts can sign out and revoke their current session. Existing revocation of other sessions/devices requires a Kestrel current password; Pocket ID reauthentication is not yet a supported step-up method, so those password-protected actions are unavailable to Pocket ID-only accounts.

## Security flow

The backend uses Authorization Code flow with PKCE, verifies discovery issuer, ID-token signature, audience, authorized party, expiry, OIDC nonce, and subject, and then redirects clients with a short-lived one-time Kestrel exchange ticket in the URL fragment so Web servers do not receive it. The ticket is bound to a secret retained by the initiating Web tab or Android app and consumed atomically. Web keeps the pending ticket in tab-scoped storage, while Android keeps it in app-private storage, until session persistence succeeds or a terminal response occurs. The encrypted exchange result remains recoverable by that same ticket and client nonce for 20 minutes so an ambiguous network response can be retried without creating another session. Expired attempts are pruned before new attempts. Unexpired starts are capped per hashed transport source, with a larger provider-wide cap retained as a distributed storage backstop. Pocket ID tokens and Kestrel session tokens never appear in callback URLs.
