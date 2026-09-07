---
title: "ACL dla Supabase: izolacja tożsamości i persystencji"
created: 2026-09-07
type: refactor-plan
---

# Anti-corruption layer dla zależności zewnętrznych

## Cel, granice i metoda

To jest **plan refaktoru**, nie implementacja. Nie zmienia kodu produkcyjnego, schematu SQL ani kontraktu HTTP. Badanie przebiegało w kolejności: **odkrycie → identyfikacja → klasyfikacja → diagnoza → projekt**. „Zna zależność” znaczy tu: importuje jej pakiet albo przenosi jej klienta, typ lub fluent API przez granicę warstwy; nie oznacza samego użycia danych zapisanych wcześniej przez Supabase.

## Krok 0 — odkryty kontekst

Produkt jest prywatnym, single-user workspace dla tekstowych grow-logów i diagnozy tylko dla agar/grain (`README.md:1-12`, `context/foundation/prd.md:20-22`). Stack to Astro SSR, React islands, TypeScript, Tailwind, Supabase i Cloudflare Workers (`context/domain/01-domain-distillation.md:16`; `package.json:33-51`). Warstwy obecnego kodu są praktycznie następujące: delivery (`src/pages/api/`, `src/pages/*.astro`, `src/middleware.ts`), application/domain-mix (`src/lib/grow-logs/`, `src/lib/diagnosis/`, `src/lib/account-deletion/`) oraz infrastruktura/operacje (`src/lib/supabase*.ts`, `src/worker.ts`, `scripts/`, `supabase/migrations/`).

Manifest ujawnia dwie główne grupy dostawców: `@supabase/ssr` i `@supabase/supabase-js` (`package.json:39-40`) oraz `ai` i `@openrouter/ai-sdk-provider` (`package.json:37,44`); framework/hosting obejmuje Astro i adapter Cloudflare (`package.json:34-36`). PRD nie mówi dosłownie „można wymienić Supabase”, lecz redukuje starterowy sign-in/sign-up do **access plumbing**, a nie zobowiązania produktu (`context/foundation/prd.md:84-85,106-117`). Wcześniejsza destylacja domeny klasyfikuje Supabase Auth, routing i provider/embeddings jako genericzną technologię, wymienialną bez zmiany języka domeny (`context/domain/01-domain-distillation.md:40,50`). To jest silna, choć pośrednia, intencja izolacji.

## Krok 1 — zidentyfikowane przecieki

### A. Supabase SDK / SSR — kandydat główny

Bezpośrednie importy pakietów występują w warstwie adapterowej, ale również w kontraktach application/domain-mix, workerze, skryptach i testach:

| Warstwa               | Wszystkie pliki, które importują `@supabase/*` dziś                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Infrastruktura auth   | `src/lib/supabase.ts:1,3`; `src/lib/supabase-admin.ts:1`; `src/lib/auth-session.ts:1,3`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Kontrakty/application | `src/env.d.ts:3`; `src/lib/access-control.ts:1`; `src/lib/diagnosis/admission.ts:1`; `src/lib/account-deletion/repository.ts:1`; `src/lib/account-deletion/service.ts:1`; `src/lib/account-deletion/purge.ts:1`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Worker                | `src/worker.ts:2`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Skrypty operacyjne    | `scripts/evaluate-diagnosis-cases-live.ts:4`; `scripts/ingest-diagnosis-knowledge.ts:6`; `scripts/run-e2e.ts:8`; `scripts/smoke-ownership-rls.ts:5`; `scripts/smoke-runtime-provider-failure.ts:5`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Testy/integracja      | Bezpośredni SDK: `src/worker.test.ts:12`; `src/lib/supabase-admin.test.ts:12`; `tests/e2e/grow-log-bulk-delete-ssr-persistence.spec.ts:5`. Mocki fasady, więc również znające jej surowy client: `src/middleware.test.ts:10`; `src/pages/api/auth/signin.test.ts:6`; `src/pages/api/account/delete.test.ts:20,24`; `src/pages/api/diagnosis/selected-log.test.ts:22`; `src/pages/api/diagnosis/selected-log.runtime-failure.test.ts:27`; `src/pages/api/grow-logs/create.test.ts:10`; `src/pages/api/grow-logs/bulk-delete.test.ts:10`; `src/pages/api/grow-logs/[id]/update.test.ts:10`; `src/pages/api/grow-logs/[id]/delete.test.ts:12` |

Kolejne delivery call sites nie importują nazwy pakietu, lecz konstruują i przekazują surowy klient: middleware (`src/middleware.ts:11,28,39,61`), strony SSR (`src/pages/grow-logs/index.astro:5,8-9`; `src/pages/grow-logs/[id].astro:5,8-10`; `src/pages/grow-logs/[id]/edit.astro:7,10-12`) oraz API (`src/pages/api/auth/signin.ts:11,18,28`; `src/pages/api/auth/signout.ts:3,6-7`; `src/pages/api/account/delete.ts:9-10,18,24-26`; `src/pages/api/grow-logs/create.ts:4,25,42`; `src/pages/api/grow-logs/bulk-delete.ts:4,13,26`; `src/pages/api/grow-logs/[id]/update.ts:4,26,47`; `src/pages/api/grow-logs/[id]/delete.ts:4,11,21,27`; `src/pages/api/diagnosis/selected-log.ts:6,57,130`). To daje jedną zależność przechodzącą przez delivery, application, persistence-facing repository, worker i tooling.

### B. AI SDK / OpenRouter — realny, lecz węższy przeciek

Pakiety AI są bezpośrednio znane runtime adapterowi diagnozy (`src/lib/diagnosis/provider.ts:1-2`) i ingestowi (`scripts/ingest-diagnosis-knowledge.ts:4-6`), a ich mocki są w `src/lib/diagnosis/provider.test.ts:17-27` i `src/pages/api/diagnosis/selected-log.runtime-failure.test.ts:42-52`. Wiedza o SDK jest zduplikowana: oba miejsca rekonstruują model embeddingów (`src/lib/diagnosis/provider.ts:13-17,67-69`; `scripts/ingest-diagnosis-knowledge.ts:15,17-19,52-54`) i tworzą OpenRouter (`src/lib/diagnosis/provider.ts:79-83`; `scripts/ingest-diagnosis-knowledge.ts:215-219`).

Nie jest jednak potwierdzone, że AI SDK trafia do bundla klienta: publiczny DTO jest lokalny (`src/lib/diagnosis/schema.ts:7-50`), API serializuje go (`src/pages/api/diagnosis/selected-log.ts:141-145`), a island waliduje/renderuje go bez importu providera (`src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:3,71-99,120-166`). Istniejący `DiagnosisProvider` jest już prawie portem (`src/lib/diagnosis/provider.ts:19-32`), więc to kandydat #2: potrzebuje przeniesienia adaptera i deduplikacji, nie pełnej przebudowy wszystkich repository.

### C. Zod — wtórny przeciek transportu

Runtime schema i inferred typy są konsumowane przez service, API, provider i React island (`src/lib/diagnosis/schema.ts:1-50`; `src/lib/diagnosis/service.ts:16,217,294`; `src/lib/diagnosis/provider.ts:5,105,112`; `src/pages/api/diagnosis/selected-log.ts:4,105`; `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:3,88`). To wiąże UI z parserem DTO i pośrednio wnosi Zod do wyspy, ale pakiet ma jedno miejsce bezpośredniego importu oraz brak deklaracji wymienialności. Nie wybieram go jako #1.

Astro/Cloudflare nie są przeciekiem #1: adapter Cloudflare pozostaje w konfiguracji/workerze, a dokumenty jawnie wybierają Workers jako target (`context/foundation/tech-stack.md:24`; `README.md:118-128`). React, Radix i Lucide pozostają w UI.

## Krok 2 — klasyfikacja i wybór

| Kandydat             | Warstwy / pliki                                                                               | Koszt wymiany dziś                                                                                                          | Intencja vs kod                                                                                                                           | Werdykt |
| -------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Supabase SDK/SSR** | Co najmniej 5 klas warstw; 20 bezpośrednich importów/testów/skryptów i 12 delivery call sites | **Wysoki**: SDK typy w sygnaturach, klient przechodzi z HTTP do usług, fluent PostgREST/RPC rekonstruowany w kilku modułach | **Silny rozjazd**: „access plumbing” i genericzna technologia, lecz `User`, `AuthError`, `SupabaseClient` definiują application contracts | **#1**  |
| AI SDK/OpenRouter    | Adapter, script, API composition, application port, testy                                     | Średni: provider jest już wąskim portem, ale SDK knowledge jest zdublowana                                                  | Generic/wymienne, ale nie przecieka do wire/UI                                                                                            | #2      |
| Zod                  | schema, API, provider, service, UI                                                            | Niski/średni                                                                                                                | Brak deklaracji wymienialności                                                                                                            | #3      |

Wybrany jest **Supabase**, a nie tylko auth: to jeden dostawca, którego SDK modeluje równocześnie identity, session/cookies, persistence, RPC, privileged deletion i test fixtures. Wymiana wymagałaby dziś zmiany publicznych sygnatur i wszystkich composition roots, co przeczy temu, że auth ma pozostać lekkim plumbing, zaś grow logs/diagnosis są językiem produktu.

## Krok 3 — diagnoza granic i duplikacji

Najgroźniejszy przeciek to typ dostawcy w kontrakcie: `App.Locals` eksponuje `Supabase.User` (`src/env.d.ts:3`), a reguła autoryzacji przyjmuje `User` (`src/lib/access-control.ts:20-23`). Account deletion definiuje porty przez `Pick<SupabaseClient, ...>` (`src/lib/account-deletion/repository.ts:9-10,58`), a service/purge przenoszą `AuthError` przez swoje dependencies (`src/lib/account-deletion/service.ts:16-20,56-57`; `src/lib/account-deletion/purge.ts:15-22`). To nie są kontrakty biznesowe — provider określa ich słownictwo.

Drugi wzorzec to ręczna, rozproszona rekonstrukcja fluent API: grow-log repository deklaruje `from/select/eq/order/insert` i castuje `client.from("grow_logs")` (`src/lib/grow-logs/repository.ts:5-75`); admission i retrieval ujawniają `rpc` oraz nazwy Supabase functions (`src/lib/diagnosis/admission.ts:5,42-45,62-63`; `src/lib/diagnosis/retrieval.ts:33-38,50-59`); account deletion robi to samo dla tabeli i RPC (`src/lib/account-deletion/repository.ts:58-59,106-132`). Są to adaptery odwrócone na lewą stronę: kod aplikacyjny nadal mówi językiem PostgREST zamiast operacjami produktu.

Trzecia duplikacja jest operacyjna: `src/lib/supabase-admin.ts:16-28` i `src/worker.ts:8-22` niezależnie składają uprzywilejowany client z URL/key i `autoRefreshToken: false`, `persistSession: false`. Jest to punkt dryfu konfiguracji i bezpieczeństwa. Nie stwierdzono za to importu Supabase w Reactowym komponencie: `SelectedLogDiagnosisPanel` dostaje tylko propsy (`src/pages/grow-logs/[id].astro:102`; `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:17-21`), więc „server SDK w bundlu klienta” byłoby tu niezweryfikowanym twierdzeniem.

## Krok 4 — projekt ACL

Wprowadzić jeden katalog `src/adapters/supabase/` jako **jedyny** importer `@supabase/ssr` i `@supabase/supabase-js`. Poza nim umieścić własne value objects, porty i application services; nazwy tabel, RPC, cookie `sb-*`, `User`, `AuthError`, `SupabaseClient`, `.from()` i `.rpc()` nie mogą przejść przez port.

### Własne modele i wąskie porty

`OwnerId` jest value objectem identity, a `AuthenticatedOwner` minimalnym wynikiem sesji — żaden nie zawiera typu dostawcy:

```ts
export class OwnerId {
  private constructor(readonly value: string) {}
  static fromTrusted(value: string): OwnerId {
    /* non-empty UUID policy */
  }
  equals(other: OwnerId): boolean {
    return this.value === other.value;
  }
}

export type AuthenticatedOwner = { ownerId: OwnerId };
export type GatewayFailure = { kind: "unavailable" | "rejected" | "not_found" };

export interface OwnerSessionPort {
  currentOwner(): Promise<AuthenticatedOwner | null>;
  signIn(credentials: { email: string; password: string }): Promise<AuthenticatedOwner | GatewayFailure>;
  signOut(): Promise<void>;
}

export interface GrowLogPort {
  listOwned(owner: OwnerId): Promise<GrowLog[]>;
  findOwned(id: GrowLogId, owner: OwnerId): Promise<GrowLog | null>;
  create(owner: OwnerId, draft: GrowLogDraft): Promise<GrowLog>;
  updateOwned(id: GrowLogId, owner: OwnerId, draft: GrowLogDraft): Promise<GrowLog | null>;
  deleteOwned(ids: readonly GrowLogId[], owner: OwnerId): Promise<void>;
}

export interface DiagnosisStatePort {
  findSameStageKnowledge(query: EmbeddingVector, stage: GrowStage): Promise<readonly KnowledgeChunk[]>;
  claim(owner: OwnerId, log: GrowLogId, question: DiagnosisQuestion): Promise<DiagnosisClaim | RateLimited>;
  release(claim: DiagnosisClaim): Promise<void>;
}

export interface AccountLifecyclePort {
  findRequest(owner: OwnerId): Promise<AccountDeletionRequest | null>;
  request(owner: OwnerId): Promise<AccountDeletionRequest>;
  claimDue(now: Instant): Promise<AccountDeletionRequest | null>;
  finalize(claim: AccountDeletionClaim): Promise<void>;
  softDeleteIdentity(owner: OwnerId): Promise<"deleted" | "already_absent" | GatewayFailure>;
  hardDeleteIdentity(owner: OwnerId): Promise<"deleted" | "already_absent" | GatewayFailure>;
}
```

`GrowLog`, `KnowledgeChunk`, `DiagnosisClaim` i `AccountDeletionRequest` pozostają własnymi modelami istniejącymi już częściowo w `src/lib/*/types.ts`; ACL ma być jedynym miejscem mapowania `snake_case` row/RPC response do tych modeli. Pseudokod adaptera pokazuje kierunek:

```ts
// src/adapters/supabase/SupabaseGrowLogAdapter.ts
class SupabaseGrowLogAdapter implements GrowLogPort {
  constructor(private readonly client: SupabaseClient) {}

  async findOwned(id: GrowLogId, owner: OwnerId): Promise<GrowLog | null> {
    const { data, error } = await this.client
      .from("grow_logs")
      .select(GROW_LOG_COLUMNS)
      .eq("id", id.value)
      .eq("owner_id", owner.value)
      .maybeSingle();
    if (error) throw mapSupabaseFailure(error);
    return data ? GrowLog.fromPersistence(mapGrowLogRow(data)) : null;
  }
}
```

`SupabaseSessionAdapter` przejmuje `createServerClient`, `parseCookieHeader`, refresh-cookie callbacks oraz usuwanie providerowych `sb-*` cookies. Tworzy się **świeży client per request**: oficjalny kontrakt `createServerClient` wymaga `cookies.getAll`, a `setAll` umożliwia odświeżanie tokenu; dokumentacja zaleca izolację instancji na request. Ta decyzja należy wyłącznie do adaptera, nie do middleware ani route. `SupabaseAccountLifecycleAdapter` jako jedyny mapuje `AuthError` oraz admin API na neutralny wynik; wspólna fabryka privileged clienta usuwa duplikację workera i HTTP.

### Composition roots po ACL

Route/middleware nie dostaje surowego clienta. Serwerowy composition root w ACL tworzy request-scoped `OwnerSessionPort`, `GrowLogPort`, `DiagnosisStatePort` i ewentualny `AccountLifecyclePort`; worker/CLI tworzy tylko privileged `AccountLifecyclePort` lub nazwany fixture adapter. Middleware zapisuje `AuthenticatedOwner | null`, nie `Supabase.User`; API wywołuje service z portem/metodą biznesową, nie z `SupabaseClient`.

## Krok 5 — before/after i dowód izolacji

| Dzisiejszy wzorzec                                                                                       | Po refaktorze                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `isAuthorizedUser(user: User)` w `src/lib/access-control.ts:20`                                          | `isAuthorizedOwner(owner: AuthenticatedOwner                                                                    | null)`; porównuje wyłącznie `OwnerId` |
| `AccountDeletionAdminClient = Pick<SupabaseClient, ...>` w `src/lib/account-deletion/repository.ts:9-10` | `AccountLifecyclePort`; service zna wynik `deleted/already_absent/failure`, nie `AuthError` ani admin API       |
| `GrowLogClient` imituje `.from().select().eq()` w `src/lib/grow-logs/repository.ts:5-75`                 | `GrowLogPort.findOwned/create/updateOwned/deleteOwned`; adapter zawiera PostgREST i `GrowLog.fromPersistence()` |
| `DiagnosisAdmissionClient.rpc(...)` w `src/lib/diagnosis/admission.ts:34-63`                             | `DiagnosisStatePort.claim/release`; nazwy RPC i shape response istnieją tylko w adapterze                       |
| API/pages tworzą client i przekazują go w dół                                                            | API/pages pobierają gotowy port/service; UI nadal dostaje tylko `GrowLog` propsy i własny HTTP DTO              |

Wymiana Supabase (np. na inny auth+database provider) dotknie: implementacji pod `src/adapters/supabase/`, ich adapter tests, dependency declaration/lockfile i composition/configuration glue. Nie zmieni: SQL-niezależnych modeli (`OwnerId`, grow log, diagnosis), tabelarycznego/wire DTO API, React island, endpoint paths, reguł owner-scoping, business services ani UI. Migracja danych i nowy physical schema są osobnym zadaniem operacyjnym, nie dowodem złamania portu; zachowanie RLS/RPC musi zostać odtworzone kontraktowo przez implementację nowego `GrowLogPort`/`DiagnosisStatePort`.

Otwarte pytanie o session/cookies zostało rozstrzygnięte dokumentacją Supabase SSR: adapter musi dostarczyć `getAll`, powinien obsłużyć `setAll`, i nie może współdzielić clienta pomiędzy requestami. Pytanie o kształt błędu admin API także nie przechodzi dalej: `mapSupabaseFailure` klasyfikuje go w ACL na `GatewayFailure`; API mapuje już tylko neutralny wynik do publicznego, zredagowanego statusu. Analogicznie przyszłe rozstrzygnięcie różnicy `textEmbeddingModel`/`embeddingModel` dla AI SDK pozostaje w adapterze OpenRouter — nie w API — ale jest poza tym #1 planem.

## Krok 6 — plan faz i weryfikacja

### Faza 1 — kontrakty bez dostawcy (test-first)

1. Dodać `OwnerId`, `AuthenticatedOwner`, neutralne błędy/outcomes i porty; przenieść własne modele z obecnych `types.ts` bez zmiany DTO.
2. Dodać unit tests port-independent dla owner comparison, grow-log mapping contract i lifecycle outcomes.
3. Ustalić jedną policyjną decyzję: `already_absent` jest idempotentnym sukcesem deletion, provider/internal detail nigdy nie trafia do HTTP.

### Faza 2 — adapter Supabase i composition roots

1. Utworzyć `src/adapters/supabase/` z request-session, privileged-session, grow-log, diagnosis-state i account-lifecycle adapterami.
2. Przenieść tam wyłącznie mapowanie cookies, `User`, `AuthError`, PostgREST `from`, RPC, row shapes i fabryki klientów; zachować request isolation oraz server-only secrets.
3. Zastąpić duplikację `src/lib/supabase-admin.ts`/`src/worker.ts` wspólną fabryką ACL; skrypty fixture/E2E użyją jawnego adaptera testowego, nie SDK bezpośrednio.

### Faza 3 — odcięcie delivery i application

1. Przepiąć middleware, pages i wszystkie API call sites na porty/composition root; `App.Locals.user` zamienić na neutralny owner context.
2. Przepiąć grow-log, diagnosis admission/retrieval i account-deletion service na operacje portów; usunąć `Pick<SupabaseClient,...>`, `GrowLogClient` fluent doubles i casty.
3. Zachować endpointy, JSON, redirecty i React props bez zmian; UI nie otrzymuje row/SDK object.

### Faza 4 — dowód i sprzątnięcie

1. Przenieść mocki SDK do adapter tests; tests application/API mockują porty, a RLS smoke nadal dowodzi zachowania persystencji przez lokalną instancję.
2. Uruchomić `npm run test:unit`, `npm run typecheck`, `npm run lint`, `npm run build` i `npm run format:check`; dla owner/RPC uruchomić po dostępności lokalnej infrastruktury `npm run test:rls` (niedostępna infrastruktura = **unavailable**, nie pass).
3. Kryterium izolacji dla runtime source: `rg -n '@supabase/(ssr|supabase-js)' src` zwraca wyłącznie `src/adapters/supabase/**` oraz jego testy. `package.json`/lockfile są koniecznym wyjątkiem deklaracji zależności, a test/CLI source ma używać adaptera testowego w tym samym katalogu. Dodatkowo `rg -n 'SupabaseClient|AuthError|\.from\(|\.rpc\(|sb-' src --glob '!adapters/supabase/**'` nie zwraca produkcyjnych trafień. Dzisiejsze pliki z tabeli „A” poza ACL oraz 12 call sites po refaktorze przestają znać zależność.

## Podsumowanie

Najgorszym przeciekiem jest Supabase, ponieważ modeluje jednocześnie sesję, identity, persystencję, RPC, administrację i tooling w co najmniej pięciu klasach warstw. PRD traktuje logowanie jako lekkie plumbing, ale dzisiejsze sygnatury application zawierają `User`, `AuthError` i `SupabaseClient`. Ręczne interfejsy fluent query nie rozwiązują problemu, bo odtwarzają API dostawcy zamiast opisywać operacje domenowe. Plan wprowadza `OwnerId` oraz wąskie porty session, grow-log, diagnosis-state i account-lifecycle, z mapowaniem Supabase zamkniętym w jednym ACL. Delivery dostanie porty i gotowe modele, zaś UI nadal tylko własne propsy/DTO, bez surowych obiektów biblioteki. Wymiana dostawcy obejmie adapter, jego konfigurację i testy, nie publiczne API, UI ani język domeny. AI/OpenRouter i Zod pozostają kolejnymi, wyraźnie mniejszymi kandydatami po ukończeniu tej izolacji. Sukces będzie mierzony negatywnym grepem w `src` oraz testami kontraktu portów i utrzymanym smoke RLS.
