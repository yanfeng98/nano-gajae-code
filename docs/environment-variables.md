# Environment Variables (Current Runtime Reference)

This reference is derived from current code paths in:

- `packages/coding-agent/src/**`
- `packages/ai/src/**` (provider/auth resolution used by coding-agent)
- `packages/utils/src/**` and `packages/tui/src/**` where those vars directly affect coding-agent runtime

It documents only active behavior.

## Resolution model and precedence

Most runtime lookups use `$env` from `@gajae-code/utils` (`packages/utils/src/env.ts`).

`$env` loading order:

1. Existing process environment (`Bun.env`)
2. Project `.env` (`$PWD/.env`) for keys not already set
3. Agent `.env` (`~/.gjc/agent/.env`, respecting `GJC_CONFIG_DIR` / `GJC_CODING_AGENT_DIR`) for keys not already set
4. Config-root `.env` (`~/.gjc/.env`, respecting `GJC_CONFIG_DIR`) for keys not already set
5. Home `.env` (`~/.env`) for keys not already set

Additional rule inside each `.env` file: `GJC_*` keys are mirrored to `GJC_*` keys in that parsed file.

---

## 1) Model/provider authentication

These are consumed via `getEnvApiKey()` (`packages/ai/src/stream.ts`) unless noted otherwise.

### Core provider credentials

| Variable                        | Used for                                         | Required when                                                  | Notes / precedence                                                                                  |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_OAUTH_TOKEN`         | Anthropic API auth                               | Using Anthropic with OAuth token auth                          | Takes precedence over `ANTHROPIC_API_KEY` for provider auth resolution                              |
| `ANTHROPIC_API_KEY`             | Anthropic API auth                               | Using Anthropic without OAuth token                            | Fallback after `ANTHROPIC_OAUTH_TOKEN`                                                              |
| `ANTHROPIC_FOUNDRY_API_KEY`     | Anthropic via Azure Foundry / enterprise gateway | `ANTHROPIC_MODEL_CODE_USE_FOUNDRY` enabled                              | Takes precedence over `ANTHROPIC_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` when Foundry mode is enabled  |
| `OPENAI_API_KEY`                | OpenAI auth                                      | Using OpenAI-family providers without explicit apiKey argument | Used by OpenAI Completions/Responses providers                                                      |
| `GEMINI_API_KEY`                | Google Gemini auth                               | Using `google` provider models                                 | Primary key for Gemini provider mapping                                                             |
| `GOOGLE_API_KEY`                | Gemini image tool auth fallback                  | Using `gemini_image` tool without `GEMINI_API_KEY`             | Used by coding-agent image tool fallback path                                                       |
