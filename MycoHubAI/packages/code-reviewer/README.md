# code-reviewer

Minimalny punkt wejścia Node + TypeScript dla AI SDK i OpenRouter.

1. Ustaw `OPENROUTER_API_KEY` w powłoce lub środowisku procesu. Wartości przykładowe znajdują się w `.env.example`.
2. Opcjonalnie ustaw `OPENROUTER_MODEL`; domyślnie używany jest `openai/gpt-4o`.
3. Uruchom `npm run start -- "Twój prompt"`.

`src/index.ts` eksportuje `readEnvironment()` oraz `generateResponse()` jako stabilne punkty do dalszej integracji. Skrypt używa Node ESM i ładuje TypeScript przez `tsx`; wymagany jest Node 22 lub nowszy.
