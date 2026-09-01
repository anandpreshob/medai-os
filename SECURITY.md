# Security Policy

## Not a medical device

medai-os is provided for **research and educational use only**. It is **not**
FDA-cleared, CE-marked, or otherwise approved as a medical device, and must not
be used for primary diagnosis, treatment decisions, or any clinical purpose.
The software is provided "as is" without warranty of any kind (see the Apache
License 2.0 disclaimer in [LICENSE](LICENSE)).

## Handling patient data (PHI)

MedAI can display and process medical images that may contain protected health
information. Operators are solely responsible for:

- Deploying MedAI in an environment that meets their regulatory obligations
  (e.g. HIPAA, GDPR) — the default configuration is **not** hardened for
  production use with real patient data.
- **Orthanc** ships with authentication disabled and permissive defaults for
  local development. Before exposing it beyond localhost, enable
  `AuthenticationEnabled`, change the placeholder credentials in
  `MedAI-server/orthanc/config/orthanc.json`, and put it behind TLS.
- Never committing patient data or secrets to source control.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.
Use GitHub's **"Report a vulnerability"** (Security Advisories) on this
repository, or contact the maintainers directly. We aim to acknowledge reports
within a few business days.

Please include: a description of the issue, steps to reproduce, affected
version/commit, and any suggested remediation.
