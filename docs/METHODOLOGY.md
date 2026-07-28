# Methodology

*English below, español a continuación.*

---

## English

### Why this document exists

"How many ministries does this country have?" sounds like a question with a fact for an
answer. It is not. Germany has 15 federal ministries, or 16 if you treat the Federal
Chancellery as one. Spain has 22 ministerial departments and 23 members of its Council of
Ministers. Neither pair of numbers contains an error; they answer different questions.

So the number this project publishes is not a discovery, it is a **consequence of a
definition**. The definition is written here, applied uniformly, and enforced by
`scripts/validate.ts`. Where a country's own sources support a different number, the
country page says so in as many words rather than hoping nobody checks.

### What counts as a ministry

An entity is counted when **all three** hold:

1. **Central government.** It is a department of the national executive. Regional,
   federated, devolved and local departments are out of scope.
2. **Headed by a minister.** Its head holds ministerial rank — *Minister, Ministre,
   Ministro, Ministru, Ministeri, Υπουργός, Miniszter, Ministru, Minister*, or the
   national equivalent.
3. **Named in an official source.** It is named as a department in a legal instrument or
   an official government publication (source tier 1 or 2 — see below).

### What does not count, and why we still record it

Entities failing the test are **recorded anyway**, with `counts_as_ministry: false` and a
reason from [`data/taxonomy/exclusion-reasons.yml`](../data/taxonomy/exclusion-reasons.yml).
This is deliberate. A number with no visible remainder cannot be argued with; a number
that shows its exclusions can be checked, disputed and corrected. The commonest cases:

| Excluded | Reason |
| --- | --- |
| Prime minister's office, chancellery, presidency of government | `head_of_government_office` |
| Deputy PM holding no department | `deputy_head_without_portfolio` |
| Minister without portfolio | `minister_without_portfolio` |
| State secretaries, junior ministers, viceministros | `junior_minister_or_state_secretary` |
| Executive agencies and public bodies | `agency_or_public_body` |
| Central bank, prosecution service, judiciary | `central_bank`, `prosecution_or_judiciary` |
| Regional and devolved departments | `subnational_government` |

The chancellery cases are the contested ones. The default is to exclude the office of the
head of government, because it is the apex of the cabinet rather than a portfolio
department. Where national law constitutes it as a ministry, the country's
`methodology_notes` must state both figures.

### Two numbers, never merged

- **`ministries_count`** — departments meeting the definition above.
- **`cabinet_seats_count`** — distinct people holding a seat in the cabinet.

These differ in nearly every country, and the gap is itself informative. A head of
government holds a seat without a department. A minister holding two portfolios is one
seat and two ministries. A minister without portfolio is a seat and no ministry. The site
labels every chart with which figure it uses, and never adds them together.

Both are **derived** — computed from the curated list of entities by
[`scripts/lib/derive.ts`](../scripts/lib/derive.ts). No count is ever typed into a data
file, so a headline figure cannot drift away from the list beneath it.

### Comparing across countries

Ministry names do not compare. "Ministerio de Fomento" and "Ministry of Housing,
Communities and Local Government" cover overlapping ground under unrecognisably different
labels, and a name-based comparison mostly measures translation choices.

So every counted ministry is tagged with policy areas from a fixed vocabulary
([`data/taxonomy/policy-areas.yml`](../data/taxonomy/policy-areas.yml)). That is what makes
cross-country questions answerable: which governments give climate its own department,
where digital policy sits, whether equality is a ministry or a directorate.

Tagging is a judgement, and it is the softest part of this methodology. Curators tag only
the areas a ministry has *primary* responsibility for, in the order the official name
gives them prominence.

### Why there is no per-capita figure

The site published a `ministries_per_million` metric and withdrew it. Cabinets are not
sized per head: the number of portfolios follows the shape of the state and the arithmetic
of a coalition, not the population being governed. Dividing by population therefore does
not normalise the comparison, it inverts it — the ranking it produced was, in every
version, a ranking of small countries.

Population is still curated and still carries a source, because the country pages publish
it as context for reading a cabinet's size. Nothing divides by it. If a per-capita view
returns, it needs an argument in this document first, not just a column.

### Sources

Every factual claim points at a citation carrying a URL, an archived snapshot, an access
date and a **verbatim quote**. The quote is mandatory: a bare URL rots, and an unquoted
citation cannot be checked without re-reading the whole document.

| Tier | What it is | Archive required |
| --- | --- | --- |
| 1 | Legal instrument: gazette, decree, statute | Yes |
| 2 | Official government publication or portal | Yes |
| 3 | Reputable secondary source | No |

A counted ministry may never rest **only** on tier 3. Each country carries a published
grade: **A** — every counted ministry rests on a legal instrument; **B** — on an official
publication; **C** — at least one rests only on a secondary source. See
[COVERAGE.md](COVERAGE.md).

### Time

Each file describes one cabinet. Entities carry `valid_from` / `valid_to`, so a department
created or abolished mid-term is recorded with its window instead of being back-edited,
and any date in a cabinet's life can be replayed. Version 1 publishes only the sitting
cabinet of each country; the model does not need to change to publish more.

### Known limitations

- **Tagging is interpretive.** Two careful curators can disagree on a ministry's areas.
- **Counting rewards fragmentation.** A government with 25 small ministries scores higher
  than one with 12 large ones. The count measures structure, not capacity, spending or
  headcount, none of which v1 records.
- **A snapshot is not a trend.** With one cabinet per country, the data cannot yet say
  whether governments are growing.
- **English names are usually ours.** `name_en_provenance` marks whether a translation is
  the government's own (`official`) or the project's (`translated`). The original name is
  always shown alongside.

### Changing this document

The definition is versioned with the data. A change that moves published counts requires
updating this file, `scripts/lib/rules.ts` if it is enforceable, and a note on every
affected country. Redefining silently is the one failure mode this project cannot survive.

---

## Español

### Por qué existe este documento

«¿Cuántos ministerios tiene este país?» parece una pregunta con un hecho por respuesta.
No lo es. Alemania tiene 15 ministerios federales, o 16 si se considera la Cancillería
Federal como uno de ellos. España tiene 22 departamentos ministeriales y 23 miembros en su
Consejo de Ministros. Ninguna de las dos parejas de cifras contiene un error: responden a
preguntas distintas.

La cifra que publica este proyecto no es, por tanto, un hallazgo, sino la **consecuencia de
una definición**. Esa definición está escrita aquí, se aplica de manera uniforme y la
impone `scripts/validate.ts`. Cuando las fuentes de un país respaldan otra cifra, la
página del país lo dice con todas las letras en lugar de confiar en que nadie lo compruebe.

### Qué cuenta como ministerio

Una entidad se cuenta cuando se cumplen **las tres** condiciones:

1. **Gobierno central.** Es un departamento del ejecutivo nacional. Los departamentos
   regionales, federados, autonómicos y locales quedan fuera de alcance.
2. **Encabezada por un ministro.** Su titular tiene rango ministerial: *Minister,
   Ministre, Ministro, Ministru, Ministeri, Υπουργός, Miniszter*, o el equivalente
   nacional.
3. **Nombrada en una fuente oficial.** Aparece nombrada como departamento en un
   instrumento jurídico o en una publicación oficial de gobierno (fuente de nivel 1 o 2).

### Qué no cuenta, y por qué lo registramos igual

Las entidades que no superan la prueba **se registran de todos modos**, con
`counts_as_ministry: false` y un motivo de
[`data/taxonomy/exclusion-reasons.yml`](../data/taxonomy/exclusion-reasons.yml). Es
deliberado: una cifra sin resto visible no admite discusión, mientras que una cifra que
muestra sus exclusiones se puede comprobar, rebatir y corregir. Los casos más frecuentes:

| Excluido | Motivo |
| --- | --- |
| Oficina del primer ministro, cancillería, presidencia del gobierno | `head_of_government_office` |
| Vicepresidente sin departamento | `deputy_head_without_portfolio` |
| Ministro sin cartera | `minister_without_portfolio` |
| Secretarios de Estado, ministros junior, viceministros | `junior_minister_or_state_secretary` |
| Agencias ejecutivas y organismos públicos | `agency_or_public_body` |
| Banco central, fiscalía, poder judicial | `central_bank`, `prosecution_or_judiciary` |
| Departamentos regionales y autonómicos | `subnational_government` |

Los casos de cancillería son los discutidos. Por defecto se excluye la oficina del jefe de
gobierno, por ser la cúspide del gabinete y no un departamento con cartera. Cuando la ley
nacional la constituye como ministerio, las `methodology_notes` del país deben indicar
ambas cifras.

### Dos cifras que nunca se fusionan

- **`ministries_count`** — departamentos que cumplen la definición anterior.
- **`cabinet_seats_count`** — personas distintas con asiento en el gabinete.

Difieren en casi todos los países, y la diferencia es informativa en sí misma. Un jefe de
gobierno ocupa asiento sin departamento. Un ministro con dos carteras es un asiento y dos
ministerios. Un ministro sin cartera es un asiento y ningún ministerio. El sitio etiqueta
cada gráfico con la cifra que usa, y nunca las suma.

Ambas se **derivan** — las calcula
[`scripts/lib/derive.ts`](../scripts/lib/derive.ts) a partir de la lista curada de
entidades. Ningún recuento se teclea en un fichero de datos, de modo que una cifra de
titular no puede separarse de la lista que la sostiene.

### Comparar entre países

Los nombres de los ministerios no son comparables. «Ministerio de Fomento» y «Ministry of
Housing, Communities and Local Government» cubren terrenos solapados bajo etiquetas
irreconocibles entre sí, y una comparación por nombres mide sobre todo decisiones de
traducción.

Por eso cada ministerio contado se etiqueta con áreas de política de un vocabulario fijo
([`data/taxonomy/policy-areas.yml`](../data/taxonomy/policy-areas.yml)). Eso es lo que
permite responder preguntas transnacionales: qué gobiernos dan al clima su propio
departamento, dónde se ubica la política digital, si la igualdad es un ministerio o una
dirección general.

El etiquetado es un juicio, y es la parte más blanda de esta metodología. Los curadores
etiquetan solo las áreas de las que el ministerio tiene responsabilidad *principal*, en el
orden de prominencia que les da su nombre oficial.

### Por qué no hay cifra per cápita

El sitio publicó un indicador `ministries_per_million` y lo retiró. Los gabinetes no se
dimensionan por habitante: el número de carteras responde a la forma del Estado y a la
aritmética de una coalición, no a la población gobernada. Dividir por población no
normaliza la comparación, la invierte — la clasificación que producía era, en todas sus
versiones, una clasificación de países pequeños.

La población se sigue curando y sigue llevando fuente, porque las fichas de país la
publican como contexto para leer el tamaño de un gabinete. Nada se divide por ella. Si
vuelve una vista per cápita, necesita antes un argumento en este documento, no solo una
columna.

### Fuentes

Toda afirmación factual apunta a una cita con URL, copia archivada, fecha de consulta y
**cita textual**. La cita textual es obligatoria: una URL desnuda se degrada, y una
referencia sin cita no se puede comprobar sin releer el documento completo.

| Nivel | Qué es | Archivo obligatorio |
| --- | --- | --- |
| 1 | Instrumento jurídico: boletín, decreto, ley | Sí |
| 2 | Publicación o portal oficial de gobierno | Sí |
| 3 | Fuente secundaria de confianza | No |

Un ministerio contado nunca puede sostenerse **solo** en nivel 3. Cada país lleva un grado
publicado: **A** — todos los ministerios contados se apoyan en un instrumento jurídico;
**B** — en una publicación oficial; **C** — al menos uno se apoya solo en una fuente
secundaria. Véase [COVERAGE.md](COVERAGE.md).

### El tiempo

Cada fichero describe un gabinete. Las entidades llevan `valid_from` / `valid_to`, de modo
que un departamento creado o suprimido a mitad de legislatura se registra con su ventana
temporal en lugar de reescribirse hacia atrás, y se puede reconstruir cualquier fecha de la
vida del gabinete. La versión 1 publica únicamente el gabinete vigente de cada país; el
modelo no necesita cambiar para publicar más.

### Limitaciones conocidas

- **El etiquetado es interpretativo.** Dos curadores cuidadosos pueden discrepar sobre las
  áreas de un ministerio.
- **Contar premia la fragmentación.** Un gobierno con 25 ministerios pequeños puntúa más
  alto que uno con 12 grandes. El recuento mide estructura, no capacidad, gasto ni
  plantilla, ninguno de los cuales registra la v1.
- **Una foto no es una tendencia.** Con un gabinete por país, los datos todavía no pueden
  decir si los gobiernos están creciendo.
- **Los nombres en inglés suelen ser nuestros.** `name_en_provenance` indica si una
  traducción es del propio gobierno (`official`) o del proyecto (`translated`). El nombre
  original se muestra siempre al lado.

### Modificar este documento

La definición se versiona con los datos. Un cambio que altere cifras publicadas exige
actualizar este fichero, `scripts/lib/rules.ts` si es comprobable, y una nota en cada país
afectado. Redefinir en silencio es el único fallo que este proyecto no puede sobrevivir.
