# Auth module notes

`AuthService` intentionally remains above the repository's 1,000-line guideline because its login, recovery-code, TOTP, refresh-rotation, and audit paths share one rate-limit/transaction boundary. Splitting those private workflows would either expose token helpers or duplicate security-sensitive audit and validation behavior. Keep additions bounded; extract a cohesive service only when it can own an end-to-end workflow without crossing those boundaries.
