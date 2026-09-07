---
title: Refaktor niezmiennika diagnozy do agregatu-strażnika
created: 2026-09-07
type: refactor-plan
---

# Refaktor niezmiennika diagnozy do agregatu-strażnika

## Cel i granice planu

To jest plan refaktoru, nie projekt nowej funkcji ani implementacja. Nie zakłada z góry nazwy agregatu: wybór poniżej wynika z celów produktu, aktualnego kodu i porównania kandydatów. Plan nie rozszerza MVP poza tekstowe diagnozowanie etapów `agar` i `grain`, nie dodaje historii rozmów ani persystencji wyników diagnozy.

Kolejność pracy badawczej: **odkrycie → identyfikacja → klasyfikacja → diagnoza → projekt**. Wszystkie odwołania `plik:linia` zostały sprawdzone w aktualnym checkoutcie.

## Krok 0 — odkryty kontekst

### Obietnica produktu

Wartość odróżniająca MycoHubAI nie polega na samym CRUD notatek ani na generycznym chacie. Produkt ma wydać odpowiedź związaną z jednym wybranym grow logiem i wewnętrzną wiedzą ograniczoną do etapów agar/grain (`context/foundation/prd.md:20-22`). Primary success wymaga możliwych przyczyn, sugerowanych działań i confidence band z wyjaśnioną niepewnością albo pytania uzupełniającego, gdy brakuje kontekstu (`context/foundation/prd.md:30-35`). Kryteria akceptacji dodają dwie rozłączne ścieżki: pełna diagnoza przy wystarczającym kontekście albo follow-up zamiast zgadywania (`context/foundation/prd.md:57-60`). Business Logic jawnie wskazuje wejście — wybrany log, jego etap i pytanie — oraz wymagany wynik (`context/foundation/prd.md:94-102`).

Drugorzędnym sukcesem jest wygodny CRUD tekstowych grow logów (`context/foundation/prd.md:37-40`). Prywatność, brak gwarantowanego tonu i odmowa tematów spoza agar/grain są guardrailami (`context/foundation/prd.md:41-45`). Tylko grow logi są persystowane; historia chatu nie może być zapisywana (`context/foundation/prd.md:110-118`).

### Stack i miejsca logiki

- Stack to Astro SSR, React islands, TypeScript, Tailwind, Supabase i Cloudflare Workers (`README.md:5-12`; `context/foundation/tech-stack.md:22-24`).
- Transport HTTP żyje w `src/pages/api/`; route diagnozy uwierzytelnia, ogranicza rozmiar, parsuje wejście i deleguje do serwisu (`src/pages/api/diagnosis/selected-log.ts:52-75`, `src/pages/api/diagnosis/selected-log.ts:79-145`).
- Orkiestracja aplikacyjna oraz reguły są dziś skupione, ale nie zamknięte, w `src/lib/diagnosis/`: `service.ts`, `schema.ts`, `contract.ts`, `prompt.ts`, `retrieval.ts`, `admission.ts` i `provider.ts`.
- UI React wysyła `growLogId` i pytanie, waliduje kształt odpowiedzi i renderuje wynik (`src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:71-99`, `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:120-165`).
- Grow log jest ładowany przez adapter Supabase z filtrem `id + owner_id` (`src/lib/grow-logs/repository.ts:103-113`).
- Persystencja zabezpiecza ownera i etap logu przez FK, constrainty oraz RLS (`supabase/migrations/20260529191400_create_grow_logs.sql:1-12`, `supabase/migrations/20260529191400_create_grow_logs.sql:32-57`). Wiedza jest filtrowana po etapie wewnątrz RPC (`supabase/migrations/20260606120000_create_diagnosis_knowledge_chunks.sql:47-78`).
- Nie ma wydzielonej warstwy domenowej. `src/lib/diagnosis/service.ts` jednocześnie podejmuje decyzje domenowe, steruje kosztownym I/O, obsługuje admission i mapuje błędy na DTO.

## Krok 1 — katalog niezmienników biznesowych

| ID     | Niezmiennik, który musi być zawsze prawdziwy                                                                                                                                                                           | Źródło biznesowe                                                                                                        | Aktualny strażnik                                                                                                                                                                                                                                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INV-01 | Wynik opublikowany jako diagnoza musi dotyczyć dokładnie jednego istniejącego logu właściciela i snapshotu, na którym wykonano ocenę.                                                                                  | Jeden selected log i widoczna zależność od niego: `context/foundation/prd.md:49-59`, `context/foundation/prd.md:71-75`. | Owner-scoped load i przekazanie obiektu do providera: `src/lib/diagnosis/service.ts:223-232`, `src/lib/diagnosis/service.ts:271-292`; semantyczne ugruntowanie narracji jest tylko instrukcją promptu: `src/lib/diagnosis/prompt.ts:35-61`.                                                                                                  |
| INV-02 | Przy wystarczającym kontekście wynik zawiera co najmniej jedną możliwą przyczynę, co najmniej jedno działanie, confidence band i niepustą niepewność; przy braku kontekstu nie udaje diagnozy, lecz zawiera follow-up. | `context/foundation/prd.md:34-35`, `context/foundation/prd.md:57-60`, `context/foundation/prd.md:96-100`.               | Deterministyczny helper istnieje dla części przypadków missing context (`src/lib/diagnosis/service.ts:120-144`), ale ogólny schema nie wiąże statusu z polami (`src/lib/diagnosis/schema.ts:17-25`).                                                                                                                                         |
| INV-03 | Ocena i jej dowody pozostają w agar/grain oraz używają wyłącznie wiedzy z etapu wybranego logu.                                                                                                                        | `context/foundation/prd.md:41-45`, `context/foundation/prd.md:79-80`.                                                   | Constraint etapu (`supabase/migrations/20260529191400_create_grow_logs.sql:9`), stage-filter RPC (`supabase/migrations/20260606120000_create_diagnosis_knowledge_chunks.sql:73-78`) i kontrola źródeł (`src/lib/diagnosis/contract.ts:101-117`). Klasyfikacja treści pytania pozostaje listą regexów (`src/lib/diagnosis/service.ts:20-82`). |
| INV-04 | Odpowiedź komunikuje niepewność i nie przedstawia przyczyn ani działań jako gwarantowanych.                                                                                                                            | `context/foundation/prd.md:43`, `context/foundation/prd.md:75-77`, `context/foundation/prd.md:89-90`.                   | Pole `uncertainty` jest obowiązkowe (`src/lib/diagnosis/schema.ts:17-24`), prompt deklaruje regułę (`src/lib/diagnosis/prompt.ts:49-53`), a walidator odrzuca zamkniętą listę fraz pewności (`src/lib/diagnosis/contract.ts:6-24`, `src/lib/diagnosis/contract.ts:75-99`).                                                                   |
| INV-05 | Brak krytycznego kontekstu musi zatrzymać generowanie diagnozy przed kosztem providera.                                                                                                                                | Follow-up zamiast zgadywania: `context/foundation/prd.md:57-58`.                                                        | Brak chunków zatrzymuje generację (`src/lib/diagnosis/service.ts:284-285`), ale „cienki log” jest rozpoznawany tylko po kilku frazach deklarujących brak (`src/lib/diagnosis/service.ts:94-101`, `src/lib/diagnosis/service.ts:140-143`).                                                                                                    |
| INV-06 | Nie wolno rekomendować oceny agaru ani grain przez zapach.                                                                                                                                                             | Zaakceptowana reguła repozytorium: `context/foundation/lessons.md:26-30`.                                               | Guard wejścia (`src/lib/diagnosis/service.ts:84-92`, `src/lib/diagnosis/service.ts:146-165`), prompt (`src/lib/diagnosis/prompt.ts:49-60`) i walidacja wyjścia (`src/lib/diagnosis/contract.ts:26-34`, `src/lib/diagnosis/contract.ts:91-95`).                                                                                               |
| INV-07 | Grow log należy do właściciela, ma etap `agar                                                                                                                                                                          | grain`, niepusty tytuł/body i limity 160/8000.                                                                          | `context/foundation/prd.md:64-67`, `context/foundation/prd.md:104-108`.                                                                                                                                                                                                                                                                      | Walidacja serwera (`src/lib/grow-logs/validation.ts:58-109`), owner-filter (`src/lib/grow-logs/repository.ts:103-113`), constrainty i RLS (`supabase/migrations/20260529191400_create_grow_logs.sql:1-12`, `supabase/migrations/20260529191400_create_grow_logs.sql:32-57`; limity: `supabase/migrations/20260730202700_bound_grow_log_text.sql:7-9`). |
| INV-08 | Dla właściciela najwyżej jedna kosztowna próba diagnozy jest aktywna; limit i duplicate cooldown są atomowe.                                                                                                           | Supporting policy utrwalona w aktualnej migracji.                                                                       | `FOR UPDATE`, limit, lease i cooldown w jednym RPC (`supabase/migrations/20260804120000_create_diagnosis_admission.sql:49-56`, `supabase/migrations/20260804120000_create_diagnosis_admission.sql:67-105`).                                                                                                                                  |
| INV-09 | Treść pytania, odpowiedź providera i wynik diagnozy nie są persystowane; trwałe są tylko niejawne metadane admission.                                                                                                  | „No saved chat history; only grow logs are persisted”: `context/foundation/prd.md:118`.                                 | Prompt zabrania implikowania historii (`src/lib/diagnosis/prompt.ts:57-60`); schema DB admission zawiera ownera, hash, liczniki i claim, nie treść (`supabase/migrations/20260804120000_create_diagnosis_admission.sql:1-15`).                                                                                                               |
| INV-10 | Po zaakceptowanym usunięciu konta dostęp jest zablokowany, a hard purge następuje dopiero po 30 dniach.                                                                                                                | `README.md:130-139`.                                                                                                    | Przepływ jest rozproszony; zewnętrzny soft-delete poprzedza osobny finalize (`src/lib/account-deletion/service.ts:70-105`), a blokada sprawdza dopiero `soft_deleted_at` (`src/lib/account-deletion/repository.ts:78-89`, `src/middleware.ts:61-65`).                                                                                        |

## Krok 2 — klasyfikacja i wybór #1

Skala rdzeniowości: 5 oznacza bezpośrednią obietnicę primary success; 3 oznacza ważny supporting/guardrail; 1 oznacza regułę techniczną. „Warstwy” liczą odrębne miejsca odpowiedzialności, nie surową liczbę importów.

| ID                                                          | Rdzeniowość | Rozsmarowanie                                               | Egzekwowanie dzisiaj                                                                                                                       | Ocena                                             |
| ----------------------------------------------------------- | ----------: | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| INV-01 — diagnoza ugruntowana w jednym snapshocie           |     **5/5** | **6 warstw:** UI, route, service, prompt/provider, repo, DB | **Częściowo egzekwowany / naruszalny.** Tożsamość i ownership są twarde, ale narracja może być poprawna schematowo i dotyczyć innego logu. | Kandydat #1.                                      |
| INV-02 — wynik spójny ze statusem i kompletnością kontekstu |     **5/5** | **5 warstw:** UI, schema, service, prompt, contract         | **Naruszalny.** Luźny DTO dopuszcza nielegalne kombinacje pól.                                                                             | Kandydat #1, ta sama granica spójności co INV-01. |
| INV-03 — wyłącznie agar/grain i same-stage evidence         |     **5/5** | 6 warstw                                                    | **Mieszany.** Etap danych i źródeł jest twardy; klasyfikacja pytania jest heurystyczna.                                                    | Włączony do root jako precondition/evidence rule. |
| INV-04 — jawna niepewność, brak gwarancji                   |     **5/5** | 4 warstwy                                                   | **Częściowo egzekwowany.** Pole jest wymagane, zakaz opiera się na liście fraz.                                                            | Włączony do root jako content policy.             |
| INV-05 — follow-up zamiast zgadywania                       |     **5/5** | 3 warstwy                                                   | **Naruszalny.** Kilka regexów wykrywa deklarowany brak, nie faktyczną kompletność kontekstu.                                               | Włączony do decyzji root.                         |
| INV-06 — bez smell checks                                   |         3/5 | 4 warstwy                                                   | **Aktywnie egzekwowany** na wejściu i wyjściu.                                                                                             | Zachować bez rozszerzania.                        |
| INV-07 — poprawny i prywatny grow log                       |         4/5 | 5 warstw                                                    | **Silnie egzekwowany** przez walidację, owner-filter, constrainty i RLS.                                                                   | Nie wybierać jako pierwszy.                       |
| INV-08 — atomowe admission                                  |         3/5 | 3 warstwy                                                   | **Silnie egzekwowany** w transakcyjnym RPC.                                                                                                | Osobny supporting aggregate/policy.               |
| INV-09 — brak historii diagnoz                              |         3/5 | 3 warstwy                                                   | **Egzekwowany strukturalnie** przez brak ścieżki zapisu treści.                                                                            | Plan musi to zachować.                            |
| INV-10 — lifecycle account deletion                         |         3/5 | 7 warstw                                                    | **Naruszalny** w oknie Auth soft-delete → DB finalize; ważny problem, ale nie primary value diagnozy.                                      | Osobny kolejny refaktor.                          |

### Wybrany niezmiennik

**INV-DIAG:** _System może opublikować wynik diagnozy tylko wtedy, gdy wynik jest legalny dla rozstrzygniętego statusu oraz dowodowo ugruntowany w dokładnie jednym, należącym do właściciela, wersjonowanym snapshocie grow logu i dozwolonej wiedzy tego samego etapu. Jeśli kontekst nie wystarcza, operacja nie może „zgadnąć”: musi zakończyć się nazwanym wynikiem follow-up. Każda nielegalna kombinacja zatrzymuje publikację nazwanym błędem domenowym._

INV-01 i INV-02 są połączone świadomie: opisują jeden moment spójności — decyzję, czy kandydat providera może stać się publicznym wynikiem. Rozdzielenie ich między schema, prompt i post-validator właśnie powoduje obecną lukę.

Wybór wynika z dwóch osi naraz. Jest to bezpośredni primary success i Business Logic produktu (`context/foundation/prd.md:30-35`, `context/foundation/prd.md:94-102`), a jednocześnie semantycznie pozostaje słabiej chroniony niż ownership, stage danych czy admission. Account deletion ma poważną lukę atomowości, lecz jest supporting lifecycle, nie mechanizmem tworzącym podstawową wartość MycoHubAI.

## Krok 3 — diagnoza INV-DIAG

### Gdzie reguła żyje dzisiaj

| Warstwa / miejsce                | Co robi dziś                                                                                                                                                                                                                                                                                                                                                                                              | Czego nie egzekwuje                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI — `SelectedLogDiagnosisPanel` | Pilnuje tylko niepustego pytania (`src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:62-64`, `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:266-273`), parsuje ogólny schema odpowiedzi (`src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:87-98`) i renderuje puste listy jako „No specific items were returned” (`src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:101-115`). | Nie sprawdza spójności statusu, kompletności diagnozy ani grounding. Nie jest strażnikiem — akceptuje każdy schema-valid sukces.                                                                                                        |
| Route                            | Weryfikuje sesję, limit bajtów i request schema, po czym deleguje (`src/pages/api/diagnosis/selected-log.ts:52-75`, `src/pages/api/diagnosis/selected-log.ts:79-132`).                                                                                                                                                                                                                                    | Nie zna domenowej decyzji. Dubluje parse requestu wykonywany ponownie w serwisie (`src/lib/diagnosis/service.ts:217-221`).                                                                                                              |
| Service                          | Ładuje owner-scoped log, sprawdza stage, regex scope/thin context, admission, retrieval i provider (`src/lib/diagnosis/service.ts:217-292`).                                                                                                                                                                                                                                                              | Łączy orkiestrację z polityką. `lacksCriticalSelectedLogContext()` wykrywa tylko jawne frazy braku (`src/lib/diagnosis/service.ts:94-101`, `src/lib/diagnosis/service.ts:140-143`). Nie rozstrzyga spójności wszystkich statusów i pól. |
| Schema                           | Ogranicza wartości, długości i liczności (`src/lib/diagnosis/schema.ts:3-25`).                                                                                                                                                                                                                                                                                                                            | Pola są niezależne: `in_scope` może mieć `possibleCauses: []`, `suggestedActions: []`, `confidenceBand: null`, a `missing_context` może mieć `followUpQuestion: null`.                                                                  |
| Prompt/provider                  | Przekazuje stage/title/body/question i instruuje model, kiedy użyć statusów (`src/lib/diagnosis/prompt.ts:10-16`, `src/lib/diagnosis/prompt.ts:35-64`); provider wymusza tylko kształt Zod (`src/lib/diagnosis/provider.ts:100-120`).                                                                                                                                                                     | Instrukcja nie jest egzekwowalnym niezmiennikiem. Provider może zwrócić schema-valid, lecz semantycznie obcy albo niespójny kandydat.                                                                                                   |
| Contract                         | Odrzuca wybrane frazy pewności, smell advice, high confidence bez źródeł, zły etap chunków i nieznane cytowania (`src/lib/diagnosis/contract.ts:75-119`).                                                                                                                                                                                                                                                 | Nie sprawdza `scopeStatus → dozwolone/wymagane pola`, wystarczalności kontekstu ani odniesienia każdej tezy/działania do snapshotu logu lub dowodu.                                                                                     |
| Repo/DB                          | Owner-scoped query zabezpiecza wybór (`src/lib/grow-logs/repository.ts:103-113`), RLS broni prywatności (`supabase/migrations/20260529191400_create_grow_logs.sql:32-57`), RPC filtruje etap wiedzy (`supabase/migrations/20260606120000_create_diagnosis_knowledge_chunks.sql:73-78`).                                                                                                                   | Odczyt logu, claim admission, provider i release to osobne kroki. Nie istnieje pojęcie wersjonowanego snapshotu próby diagnozy.                                                                                                         |
| Testy                            | Testują dwa jawne przypadki missing context (`src/lib/diagnosis/service.test.ts:184-219`), certainty (`src/lib/diagnosis/service.test.ts:221-263`), źródła i stage (`src/lib/diagnosis/service.test.ts:265-355`) oraz kolejność happy path (`src/lib/diagnosis/service.test.ts:101-143`).                                                                                                                 | Brakuje macierzy legalnych statusów oraz kontrpróby „schema-valid odpowiedź dotyczy innego logu”. Schema tests sprawdzają limity, nie zależności pól (`src/lib/diagnosis/schema.test.ts:19-69`).                                        |

### Niespójności i ciche przejścia

1. **UI nie jest jedynym strażnikiem wybranego niezmiennika; nie jest nim w ogóle.** Jedyna UI-only ochrona w tym flow to ergonomiczne odrzucenie pustego pytania, ale serwer niezależnie wymusza nonblank/max 2000 (`src/lib/diagnosis/schema.ts:7-10`). Dla INV-DIAG klient ufa ogólnemu schema i potrafi pokazać puste elementy jako udany wynik.
2. **Najważniejsze „połknięcie” jest decyzyjne, nie wyjątkowe.** Jeśli pytanie nie pasuje do zamkniętej listy `unsupportedScopePatterns`, `guardrailResponse()` zwraca `null` i flow idzie do providera (`src/lib/diagnosis/service.ts:146-170`, `src/lib/diagnosis/service.ts:234-242`). Analogicznie lakoniczny log bez jednej z fraz `thinLogPatterns` przechodzi dalej. Nie ma domenowej decyzji „kontekst wystarczający”; jest brak dopasowania regexu.
3. **Nie znaleziono ścieżki „zaloguj błąd domenowy i jedź dalej” w generacji.** Retrieval failure zatrzymuje operację (`src/lib/diagnosis/service.ts:275-282`), niepoprawny model output zatrzymuje ją (`src/lib/diagnosis/service.ts:294-301`), a outer catch kończy kontrolowaną odpowiedzią (`src/lib/diagnosis/service.ts:310-316`). To należy zachować.
4. **Istnieje cichy no-op w lifecycle admission.** Release wykonuje `UPDATE ... WHERE owner_id AND active_claim_id`, lecz nie zgłasza braku zmienionego wiersza (`supabase/migrations/20260804120000_create_diagnosis_admission.sql:109-120`). Adapter uważa brak błędu RPC za sukces (`src/lib/diagnosis/admission.ts:62-67`). To nie jest INV-DIAG, ale plan dotykający repository powinien zmienić to na nazwany `DiagnosisClaimNotActiveError`.
5. **Snapshot nie ma jawnej wersji domenowej.** `updatedAt` istnieje w rekordzie (`src/lib/grow-logs/repository.ts:77-86`), lecz nie jest częścią kontraktu kandydata ani walidacji końcowej. Log może zmienić się po odczycie; odpowiedź nadal dotyczy wcześniejszej treści bez jawnego oznaczenia tej wersji.

## Krok 4 — projekt agregatu-strażnika

### Nazwa i granica agregatu

Wybrana nazwa root: **`SelectedLogDiagnosisAttempt`**.

Uzasadnienie nazwy:

- `Selected log` jest istniejącym językiem produktu i UI (`context/foundation/prd.md:49-59`; `src/components/diagnosis/SelectedLogDiagnosisPanel.tsx:185-192`).
- `Diagnosis` nazywa core capability.
- `Attempt` odróżnia efemeryczną próbę od persystowanej historii i łączy ją z admission. Root istnieje tylko przez czas jednego requestu; wynik nie jest zapisywany.

Granica spójności obejmuje:

```text
SelectedLogDiagnosisAttempt (root)
├── GrowLogSnapshot { id, ownerId, stage, title, body, version }
├── DiagnosisQuestion
├── ScopeDecision
├── DiagnosisClaim
├── SameStageEvidence[]
└── GeneratedDiagnosisCandidate -> PublishableDiagnosis | DomainError
```

`GrowLogSnapshot.version` początkowo mapuje istniejące `updatedAt`. Snapshot jest immutable. `SameStageEvidence` zawiera tylko chunki zwrócone dla snapshotu. `GeneratedDiagnosisCandidate` jest nieufnym wynikiem adaptera LLM; dopiero root może stworzyć `PublishableDiagnosis`.

### Legalne wyniki jako discriminated union

Zamiast jednego worka nullable pól:

```ts
type PublishableDiagnosis =
  | {
      kind: "diagnosis";
      possibleCauses: NonEmptyArray<GroundedCause>;
      suggestedActions: NonEmptyArray<GroundedAction>;
      confidenceBand: "low" | "medium" | "high";
      uncertainty: NonBlankText;
      sources: DiagnosisSource[];
    }
  | {
      kind: "needs_more_context";
      uncertainty: NonBlankText;
      followUpQuestion: NonBlankText;
    }
  | {
      kind: "unsupported_scope" | "mixed_scope" | "unsupported_signal";
      uncertainty: NonBlankText;
      redirectActions: NonEmptyArray<NonBlankText>;
      followUpQuestion: NonBlankText;
    };
```

Oddzielny `unsupported_signal` usuwa dzisiejszą sprzeczność, w której smell guard jest oznaczony `in_scope`, ale ma puste przyczyny i `confidenceBand: null` (`src/lib/diagnosis/service.ts:149-164`). Transport może przejściowo mapować nowe `kind` na stary `scopeStatus`, lecz model domenowy nie może odziedziczyć tej niespójności.

### Weryfikowalne grounding zamiast obietnicy promptu

Sam kod nie potrafi udowodnić prawdziwości porady biologicznej. Może jednak wymusić minimalny, audytowalny warunek publikacji:

- każdy `GroundedCause` i `GroundedAction` musi zawierać co najmniej jeden wewnętrzny `observationRef` wskazujący dokładny, ograniczony fragment `title|body` snapshotu albo `evidenceRef` do załączonego same-stage chunku;
- kandydat musi powtórzyć `selectedLogId` i `selectedLogVersion`;
- root sprawdza ID/wersję, obecność cytowanego fragmentu w snapshocie, stage każdego chunku oraz należność źródła do załączonego evidence set;
- referencje grounding są wewnętrzne i mogą zostać usunięte w mapperze transportowym; nie są persystowane.

To nie dowodzi, że wniosek jest merytorycznie poprawny. Dowodzi, że nie opublikowano całkowicie oderwanej odpowiedzi i daje deterministyczny kontrakt do testów. Trafność 75% pozostaje osobnym kontraktem ewaluacyjnym produktu (`context/foundation/prd.md:32-35`).

### Metody domenowe i preconditions

```ts
class SelectedLogDiagnosisAttempt {
  static begin(args: {
    ownerId: OwnerId;
    snapshot: GrowLogSnapshot;
    question: DiagnosisQuestion;
    claim: DiagnosisClaim;
  }): SelectedLogDiagnosisAttempt;

  refuseUnsupportedScope(reason: NonBlankText): PublishableDiagnosis;
  refuseUnsupportedSignal(signal: "smell" | "photo" | "species"): PublishableDiagnosis;
  askForMissingContext(args: {
    missingFacts: NonEmptyArray<MissingContextFact>;
    followUpQuestion: NonBlankText;
  }): PublishableDiagnosis;

  attachEvidence(chunks: readonly SameStageEvidence[]): void;
  acceptCandidate(candidate: GeneratedDiagnosisCandidate): PublishableDiagnosis;
  release(claimId: ClaimId): void;
}
```

Pseudokod najważniejszej bramy:

```text
acceptCandidate(candidate):
  require state == EVIDENCE_ATTACHED
    else throw IllegalDiagnosisTransitionError

  require candidate.selectedLogId == snapshot.id
      and candidate.selectedLogVersion == snapshot.version
    else throw DiagnosisSnapshotMismatchError

  require candidate.kind == diagnosis
    else throw IncoherentDiagnosisOutcomeError

  require causes.nonEmpty and actions.nonEmpty and confidenceBand != null
    else throw IncompleteDiagnosisError

  require uncertainty.nonBlank
    else throw MissingDiagnosisUncertaintyError

  require every cause/action has a valid observationRef or evidenceRef
    else throw DiagnosisNotGroundedInSelectedLogError

  require every evidenceRef belongs to attached evidence
      and every attached evidence.stage == snapshot.stage
    else throw EvidenceStageMismatchError / UnknownDiagnosisSourceError

  require no guaranteed wording and no unsupported signal advice
    else throw UnsupportedCertaintyError / UnsupportedDiagnosisAdviceError

  state = COMPLETED
  return PublishableDiagnosis.create(...)
```

`askForMissingContext()` odrzuca pusty `missingFacts` i pusty follow-up. Nie może współistnieć z przyczynami, działaniami ani confidence, ponieważ te pola w tym wariancie typu nie istnieją. Każda metoda kończąca jest legalna tylko ze stanu `STARTED` albo `EVIDENCE_ATTACHED` i przechodzi do terminalnego `COMPLETED`; druga próba zakończenia rzuca `DiagnosisAlreadyCompletedError`.

### Repozytorium i granica transakcji

Proponowany port:

```ts
interface SelectedLogDiagnosisAttemptRepository {
  loadAndClaim(args: {
    ownerId: OwnerId;
    growLogId: GrowLogId;
    questionFingerprint: QuestionFingerprint;
    claimId: ClaimId;
  }): Promise<SelectedLogDiagnosisAttempt>;

  release(args: { ownerId: OwnerId; claimId: ClaimId }): Promise<void>;
}

interface DiagnosisEvidenceRepository {
  findFor(attempt: SelectedLogDiagnosisAttempt, embedding: Embedding): Promise<readonly SameStageEvidence[]>;
}
```

Nie ma `save(result)`. To celowe: agregat jest request-scoped, a zapis wyniku złamałby „No saved chat history” (`context/foundation/prd.md:118`). Repository zapisuje wyłącznie lifecycle claimu; `PublishableDiagnosis` wraca do klienta i znika po odpowiedzi.

`loadAndClaim` powinno być jednym RPC/jedną transakcją PostgreSQL:

```text
BEGIN (wewnątrz RPC)
  owner := auth.uid(); require owner == p_owner_id
  SELECT grow_log WHERE id = p_grow_log_id AND owner_id = owner
    -- zwróć 404-like domain result, nie ujawniaj cudzego rekordu
  require stage IN ('agar', 'grain')
  snapshot := immutable row + updated_at as version

  SELECT admission row FOR UPDATE
  apply window, max-attempts, active-lease and duplicate-cooldown rules
  require admitted, else return named denial + retry_after
  UPDATE admission claim and INSERT/UPDATE cooldown
  RETURN snapshot + claim
COMMIT
```

Obecny RPC już poprawnie serializuje admission przez `FOR UPDATE` (`supabase/migrations/20260804120000_create_diagnosis_admission.sql:49-56`) i zapisuje claim/cooldown atomowo (`supabase/migrations/20260804120000_create_diagnosis_admission.sql:94-105`); refaktor dołącza owner-scoped snapshot do tej samej granicy startu.

Provider/embedding **nie mogą** działać wewnątrz transakcji DB. Root pracuje na immutable snapshocie. `release()` staje się RPC zwracającym `released boolean`; `false` rzuca `DiagnosisClaimNotActiveError` zamiast cichego no-op. Jeśli provider zawiedzie, operacja nadal kończy się błędem i próbuje release w `finally`; nie publikuje częściowego wyniku. Lease pozostaje mechanizmem odzyskania po awarii procesu, nie zamiennikiem poprawnej obsługi błędu.

### Cienki route i warstwa aplikacyjna

Docelowy przepływ:

```ts
export const POST: APIRoute = async (context) => {
  const user = requireAuthenticatedOwner(context); // transport/auth
  const command = parseDiagnosisRequest(await readBoundedJson(context.request));

  try {
    const result = await diagnoseSelectedLogHandler.execute(user.id, command);
    return json(mapDiagnosisToDto(result), 200);
  } catch (error) {
    return mapDiagnosisDomainError(error); // nazwany kod + HTTP
  }
};
```

Handler wykonuje: `loadAndClaim → classify input/context → embed → load evidence → root.attachEvidence → provider candidate → root.acceptCandidate → release`. Route nie zna status matrix, promptów ani reguł grounding. UI zachowuje walidację pustego pytania wyłącznie jako UX; autorytatywna egzekucja pozostaje na serwerze.

Przykładowe mapowanie błędów:

| Błąd domenowy                                                                                                                                                      | HTTP / public code                   | Retry |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ----- |
| `InvalidDiagnosisQuestionError`                                                                                                                                    | 400 / `invalid_request`              | nie   |
| `SelectedGrowLogNotFoundError`                                                                                                                                     | 404 / `grow_log_not_found`           | nie   |
| `UnsupportedGrowLogStageError`                                                                                                                                     | 400 / `unsupported_stage`            | nie   |
| `DiagnosisRateLimitedError`                                                                                                                                        | 429 / `rate_limited` + `Retry-After` | tak   |
| `DiagnosisSnapshotMismatchError`                                                                                                                                   | 409 / `diagnosis_snapshot_changed`   | tak   |
| `IncompleteDiagnosisError`, `IncoherentDiagnosisOutcomeError`, `DiagnosisNotGroundedInSelectedLogError`, `EvidenceStageMismatchError`, `UnsupportedCertaintyError` | 502 / `invalid_model_output`         | tak   |
| `DiagnosisClaimNotActiveError`                                                                                                                                     | 503 / `diagnosis_lifecycle_failed`   | tak   |

## Krok 5 — before/after

| Dzisiejsze miejsce reguły                     | Before                                                                                                                                                     | After                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/diagnosis/schema.ts`                 | Jeden obiekt z niezależnymi nullable/pustymi polami (`:17-25`).                                                                                            | Transportowe schema jako discriminated union odzwierciedlające `PublishableDiagnosis`; nie tworzy domeny i nie egzekwuje jej drugi raz.                   |
| `src/lib/diagnosis/service.ts`                | Regexy, decyzje, I/O, admission, walidacja i serializacja w jednej funkcji (`:120-316`).                                                                   | Handler aplikacyjny tylko orkiestruje porty i wywołuje metody root; żadnego ręcznego składania legalnych wyników.                                         |
| `src/lib/diagnosis/contract.ts`               | Osobna lista post-checków bez status matrix (`:75-119`).                                                                                                   | Reguły przeniesione do `SelectedLogDiagnosisAttempt.acceptCandidate()`; plik usunięty albo pozostawiony czasowo jako delegujący adapter podczas migracji. |
| `src/lib/diagnosis/prompt.ts`                 | Prompt deklaruje, kiedy użyć statusów i że odpowiedź ma bazować na logu (`:49-61`).                                                                        | Prompt prosi o `GeneratedDiagnosisCandidate` z `selectedLogVersion`, `observationRefs` i `evidenceRefs`; pozostaje wskazówką dla modelu, nie strażnikiem. |
| `src/lib/diagnosis/provider.ts`               | Zwraca od razu `DiagnosisResponse` (`:19-28`, `:100-120`).                                                                                                 | Zwraca nieufny `GeneratedDiagnosisCandidate`; tylko root może wyprodukować publiczny wynik.                                                               |
| `src/lib/grow-logs/repository.ts` + admission | Osobny load logu (`:103-113`) i późniejszy claim w service (`src/lib/diagnosis/service.ts:244-253`).                                                       | `SelectedLogDiagnosisAttemptRepository.loadAndClaim()` zwraca wersjonowany snapshot + claim w jednym RPC. CRUD repository pozostaje bez zmian.            |
| `src/lib/diagnosis/retrieval.ts`              | Adapter przyjmuje dowolny stage argument i zwraca chunki (`:50-65`).                                                                                       | `DiagnosisEvidenceRepository.findFor(attempt, embedding)` bierze stage z root; caller nie może podać innego etapu. Root ponownie sprawdza wynik adaptera. |
| `src/pages/api/diagnosis/selected-log.ts`     | Route parsuje, loguje i mapuje szeroki union kodów (`:52-167`), a service ponownie parsuje.                                                                | Jeden parse transportowy, jeden handler, jedno mapowanie nazwanych domain errors. Bez reguł domenowych w route.                                           |
| `SelectedLogDiagnosisPanel.tsx`               | Ogólny schema, fallback dla pustych list i render wg nullable pól (`:87-165`).                                                                             | Exhaustive render wariantów discriminated union. Brak stanu „success z pustą diagnozą”. Client validation pozostaje tylko UX.                             |
| Testy                                         | Osobne przykłady happy path/regex/shape; brak kompletnej macierzy (`src/lib/diagnosis/schema.test.ts:19-69`; `src/lib/diagnosis/service.test.ts:184-219`). | Macierz legalnych i nielegalnych przejść root + cienkie testy adapterów/route + istniejące persisted admission tests.                                     |

## Plan faz refaktoru

Repozytorium ma Vitest 4.1.7 jako runner unit/integration i istniejącą strategię, która preferuje najtańszą warstwę dowodu (`context/foundation/test-plan.md:104-106`, `context/foundation/test-plan.md:142-149`). Nie ma dowodu na obowiązkowy TDD dla każdego refaktoru, ale fazy zmieniające INV-DIAG powinny iść **test-first**, ponieważ są deterministyczne i domenowe.

### Faza 1 — zamrozić kontrakt charakteryzacyjny (test-first)

1. Dodać failing tests pokazujące obecne luki: `in_scope` bez causes/actions/confidence; `missing_context` bez follow-up; wynik z obcym `selectedLogVersion`; cause/action bez grounding; lakoniczny log bez frazy `no details`.
2. Dodać test zachowujący poprawne zachowania: owner lookup przed kosztem, same-stage evidence, brak smell advice, brak guaranteed wording, release na błędzie.
3. Nie zmieniać jeszcze publicznego DTO ani UI.

### Faza 2 — wprowadzić model domenowy równolegle (test-first)

1. Dodać value objects, błędy i `SelectedLogDiagnosisAttempt` bez podłączania route.
2. Zaimplementować legalne przejścia i jedyną fabrykę `PublishableDiagnosis`.
3. Dodać mapper `legacy provider DTO → GeneratedDiagnosisCandidate` tylko jako etap migracyjny.
4. Zakazać eksportu publicznych konstruktorów wyniku; tylko root może go utworzyć.

### Faza 3 — skierować service przez root (test-first)

1. Provider zwraca candidate, service/handler przekazuje go do root.
2. Przenieść post-checki z `contract.ts` do root i usunąć duplikaty dopiero po zielonej macierzy.
3. Zastąpić decyzję missing-context jawnym `ContextSufficiencyAssessment`. Początkowa reguła może zachować obecne heurystyki, ale musi zwracać nazwane `MissingContextFact[]`; brak rozstrzygnięcia nie może oznaczać automatycznie „wystarczy”.
4. Dodać `unsupported_signal`, by smell guard nie udawał `in_scope`.

### Faza 4 — atomowy start próby i fail-fast release (test-first + DB smoke)

1. Dodać RPC `load_and_claim_selected_log_diagnosis` łączące owner-scoped snapshot z admission w jednej transakcji.
2. Dodać jawny wynik release i błąd `DiagnosisClaimNotActiveError` dla zero-row update.
3. Udowodnić współbieżność i owner isolation przez lokalny test Supabase; unit mocks nie są wystarczającym dowodem `FOR UPDATE`/RLS.
4. Nie trzymać transakcji podczas provider I/O i nie persystować candidate/result.

### Faza 5 — transport i UI

1. Zmienić success DTO na discriminated union i zapewnić exhaustive server/client mapping.
2. Odchudzić route do parse → handler → error mapper.
3. Usunąć fallback „No specific items” dla wariantu diagnozy; brak elementów ma być niemożliwy konstrukcyjnie.
4. Zachować kontrolowane, zredagowane komunikaty błędów i retry metadata.

### Faza 6 — usunięcie rusztowania i pełna weryfikacja

1. Usunąć legacy mapper, nieużywane statusy/helpery i zduplikowany parse.
2. Uruchomić focused unit/integration, następnie `npm run test:unit`, `npm run typecheck`, `npm run lint`, `npm run build` i `npm run format:check` zgodnie z kanoniczną statyczną bramą (`context/foundation/test-plan.md:207-210`).
3. Uruchomić persisted admission/RLS smoke wyłącznie dla zmienionej granicy DB; browser E2E nie jest potrzebne do dowodu semantyki root. E2E jest uzasadnione tylko jako istniejący, wąski smoke wiring/renderingu.
4. Osobno zaktualizować offline diagnosis evaluation, bo unit tests dowodzą spójności kontraktu, nie 75% trafności merytorycznej.

## Macierz testów niezmiennika

### Legalne operacje/przejścia

- `begin` dla ownera, istniejącego snapshotu `agar` i niepustego pytania → `STARTED`.
- `STARTED → needs_more_context` z niepustym `MissingContextFact[]` i follow-up; zero causes/actions/confidence/sources.
- `STARTED → unsupported_scope`, `mixed_scope` lub `unsupported_signal` z redirect actions i follow-up.
- `STARTED → EVIDENCE_ATTACHED → diagnosis` z ≥1 cause, ≥1 action, confidence, uncertainty, prawidłową wersją i referencjami do snapshotu/same-stage evidence.
- `high` confidence z co najmniej jednym dołączonym source; `low|medium` zgodnie z ustaloną polityką źródeł.
- Każdy błąd providera/retrieval/contract kończy próbę bez publikacji i wywołuje dokładnie jeden release.

### Nielegalne operacje — oczekiwany nazwany błąd

- Snapshot innego ownera → `SelectedGrowLogNotFoundError` bez provider work.
- Stage inny niż `agar|grain` → `UnsupportedGrowLogStageError`.
- Pusty/za długi question → `InvalidDiagnosisQuestionError`.
- Drugie zakończenie terminalnego root → `DiagnosisAlreadyCompletedError`.
- `acceptCandidate` przed evidence → `IllegalDiagnosisTransitionError`.
- Inne `selectedLogId` albo `selectedLogVersion` → `DiagnosisSnapshotMismatchError`.
- `diagnosis` z pustymi causes/actions, null confidence albo pustą uncertainty → `IncompleteDiagnosisError`.
- `needs_more_context` bez follow-up lub z diagnozą/confidence → `IncoherentDiagnosisOutcomeError`.
- `unsupported_*` z cause/confidence/source udającym diagnozę → `IncoherentDiagnosisOutcomeError`.
- Cause/action bez prawidłowego `observationRef|evidenceRef` → `DiagnosisNotGroundedInSelectedLogError`.
- Chunk/source z innego etapu → `EvidenceStageMismatchError`.
- Źródło spoza attached evidence → `UnknownDiagnosisSourceError`.
- Gwarantowany język → `UnsupportedCertaintyError`.
- Smell advice → `UnsupportedDiagnosisAdviceError`.
- Release obcego, wygasłego albo już zwolnionego claimu → `DiagnosisClaimNotActiveError`; zero-row update nie jest sukcesem.
- Dwa równoległe `loadAndClaim` dla ownera → dokładnie jeden sukces, drugi `DiagnosisRateLimitedError`/active-claim denial z `Retry-After`.

### Granice dowodu

- Unit tests root dowodzą legalnych stanów i fail-fast; nie dowodzą RLS, blokady wiersza ani jakości biologicznej.
- Test RPC na lokalnym Supabase dowodzi atomowego startu, współbieżności, owner isolation i jawnego release; nie dowodzi hostowanej konfiguracji.
- Test route dowodzi mapowania domena → HTTP, nie semantycznej jakości diagnozy.
- Offline evaluation dowodzi jakości na przygotowanym zbiorze, lecz nie zastępuje niezmienników konstrukcyjnych.

## Load-bearing nazwy do rejestracji

Repozytorium nie ma osobnego formalnego „contract registry”; istnieje tabela Ubiquitous Language w `context/domain/01-domain-distillation.md:20`. W fazie planowania implementacji należy dopisać do niej, bez zmiany znaczeń w połowie refaktoru:

- `SelectedLogDiagnosisAttempt` — root jednej efemerycznej próby.
- `GrowLogSnapshot` — immutable, wersjonowany kontekst jednego logu.
- `DiagnosisQuestion` — zwalidowane pytanie.
- `ContextSufficiencyAssessment` i `MissingContextFact` — jawna decyzja „diagnozuj albo pytaj”.
- `ScopeDecision` — `supported | mixed | unsupported | unsupported_signal`.
- `SameStageEvidence` — jedyne dowody wiedzy dopuszczone do próby.
- `GeneratedDiagnosisCandidate` — nieufny output providera.
- `PublishableDiagnosis` — wynik, który przeszedł root; nie jest persystowany.
- `GroundedCause`, `GroundedAction`, `ObservationRef`, `EvidenceRef` — minimalny dowód powiązania narracji.
- `DiagnosisClaim` — aktywny claim admission należący do próby.
- Błędy: `IllegalDiagnosisTransitionError`, `DiagnosisSnapshotMismatchError`, `IncompleteDiagnosisError`, `IncoherentDiagnosisOutcomeError`, `DiagnosisNotGroundedInSelectedLogError`, `EvidenceStageMismatchError`, `UnknownDiagnosisSourceError`, `UnsupportedCertaintyError`, `UnsupportedDiagnosisAdviceError`, `DiagnosisClaimNotActiveError`.

## Ryzyka i decyzje odroczone

1. Exact-fragment grounding jest minimalnym dowodem związania, nie automatycznym dowodem poprawności przyczynowej. Nie wolno reklamować go jako rozwiązania jakości modelu.
2. `updatedAt` może wystarczyć jako wersja MVP; osobny licznik wersji byłby potrzebny dopiero, jeśli precyzja timestampu albo równoległe edycje okażą się problemem.
3. Połączenie load + claim zmienia moment naliczania próby. Reguła ma nadal naliczać wyłącznie request, który przeszedł autoryzację i podstawową walidację, nie błędne lub obce ID.
4. Fail-fast release nie może ujawnić prywatnych danych ani surowych błędów providera. Publiczny mapper pozostaje zredagowany; szczegół domenowy trafia tylko do bezpiecznej obserwowalności.
5. Luka account deletion i cichy release w tym lifecycle są realne, ale pozostają poza zakresem tego core refaktoru; powinny dostać osobny plan, aby nie rozszerzyć agregatu diagnozy o obcą odpowiedzialność.
