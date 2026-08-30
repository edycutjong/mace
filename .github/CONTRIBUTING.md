# Contributing

mace was built solo for the [WebMCP hackathon](https://webmcp.devpost.com/) and is a single
static page with one dev dependency. That makes it unusually easy to work on: there is no
bundler, no transpile, and no framework to learn first.

## Run it

```bash
git clone https://github.com/edycutjong/mace.git
cd mace
npm install          # vitest, and nothing else
npm test             # 306 tests
python3 -m http.server 8000   # then open http://localhost:8000
```

The bench works on localhost, but the WebMCP surface needs Chrome 149+ with
**Experimental Web Platform features** enabled in `chrome://flags`. The origin-trial token
in `netlify.toml` is bound to `https://pointoforder.netlify.app` and does nothing anywhere
else, so <https://pointoforder.netlify.app> is the reference environment.

## The one rule that matters

The rulebook is data. `src/ronr.data.js` contains the motions and their legality; `src/rule.js`
is the single predicate that reads it. **Adding a motion type should be adding a row, not
writing a tool.** A change that adds a `if (toolName === ...)` branch somewhere is almost
certainly in the wrong file.

Related: never call the registration diff inline from inside a tool's `execute`. See
`webmcp.js` § *5.2a* — it aborts the running tool's own controller and Chrome fails the
in-flight call.

## Before you open a PR

- `npm test` passes. If you changed legality, `legality.test.js` should have gained cells.
- No new runtime dependency, and no build step. Both are load-bearing claims about this
  project, not preferences.
- Keep the diff narrow. Explain *why* in the commit message; the code says what.

## Versioning

Versions are produced by `.github/workflows/release.yml` on every push to `main`, after the
suite passes. The workflow bumps `package.json`, commits it as
`chore(release): vX.Y.Z [skip ci]`, tags **that** commit, and publishes a GitHub Release — so
a clone at any tag has the matching `package.json`. Nothing is ever tagged before the tests go
green. The `[skip ci]` marker plus a head-commit guard on the job is what stops the release
commit from triggering another release.

| Your commit | Bump |
|---|---|
| `feat: …` or `feat(scope): …` | minor |
| `feat!: …`, `fix!: …`, or `BREAKING CHANGE:` in the body | major |
| anything else — including this repo's usual `topic: sentence` style | patch |

The default is *patch* rather than *nothing* on purpose: most messages here are not
Conventional Commits, and a parser that ignored them would leave the version frozen at 1.0.0
forever. Use a `feat:` or `!` prefix when you actually want to escalate.

## Issues

Bug and feature templates are in `.github/ISSUE_TEMPLATE/`. For a bug, the most useful thing
you can include is your Chrome version and what `document.modelContext.getTools()` returned
when it went wrong.
