# Security Policy

## What this project is

mace is a hackathon entry, not a service. It has **no backend, no accounts, no database, and
no production users**. The whole app is static files; every meeting exists only in the tab
you have open, and nothing is transmitted anywhere. There is no version to support and no
patch to roll out — the live site is whatever `main` says.

Two consequences worth stating plainly:

- **`origin-trial.json` is not a leak.** The Chrome origin-trial token committed there is
  served in the clear as an `Origin-Trial:` response header on every page load, is bound to
  `https://pointoforder.netlify.app`, and grants one experimental browser feature on that one
  origin. `.gitleaks.toml` allowlists exactly that file and nothing else.
- **Untrusted text is a threat model here, and it is tested.** Motion text is member-authored
  and reaches an agent verbatim. `draft_minutes` is annotated `untrustedContentHint: true`;
  `explain_current_state` is annotated `false`, and `test/injection.test.js` asserts that its
  output shares no non-trivial word with any member-authored text. If you can break that
  assertion, that is the highest-value bug in the repo.

## Reporting a vulnerability

Please **do not** open a public issue. Instead:

- Email **edy.cu@live.com**, or
- Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) (Security → Report a vulnerability).

Expect an acknowledgement within a few days. Since nobody's data is at risk, there is no
embargo to respect — but a heads-up before you publish is appreciated.
