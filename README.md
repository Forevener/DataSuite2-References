# DataSuite 2 references

Every reference [DataSuite 2](https://datasuite.site) prints comes from this repository. When the app runs a method it looks the method up here by slug and renders what it finds. A wrong author, a missing paper or a stale DOI is fixed by a pull request here.

Two tab-separated files:

| file | one row per | fields |
|---|---|---|
| `references.tsv` | reference | slug · reference text · `background` (optional) |
| `chains.tsv` | link | slug · another slug whose references it also cites · `background` (optional) |

**The slug decides everything.** There is no ranking and no other routing field:

| slug | is | version | renders under |
|---|---|---|---|
| `mokken` | the package release that ran | `{version}`, always | Software |
| `paper:mokken` | the article describing that package | never | Software |
| `method:mokken` | the method's own literature | never | Methods |
| `ref:mokken-1971` | one work several slugs share, reached through `chains.tsv` | never | with the slug that reached it |

Anything marked `background` leaves its section and renders under Background instead.

**Run the checker before you open the pull request.** It lives in this repository, needs nothing but Node 22, and is the same file CI runs:

```
node lint.mjs
```

For every problem it prints the line and what to change. The full list is under [What CI checks](#what-ci-checks).

`node lint.test.mjs` checks the checker: every rule below has a fault planted against it there, so a rule that stopped working would fail before your corpus did. CI runs both.

## Common tasks

### Fix a wrong author, title or DOI

Edit the row in place; nothing else moves. The most common correction is a DOI written as a link:

```diff
-method:hochberg	Hochberg Y (1988). “A sharper Bonferroni procedure for multiple tests of significance.” _Biometrika_, *75*(4), 800-802. https://doi.org/10.1093/biomet/75.4.800
+method:hochberg	Hochberg Y (1988). “A sharper Bonferroni procedure for multiple tests of significance.” _Biometrika_, *75*(4), 800-802. doi:10.1093/biomet/75.4.800
```

### Add a paper to a method already listed

Repeat the slug on a line of its own. Rows sharing a slug sit together, oldest first:

```diff
 method:mokken	Loevinger J (1948). “The technic of homogeneous tests compared with some aspects of scale analysis and factor analysis.” _Psychological Bulletin_, *45*(6), 507-529. doi:10.1037/h0055827
 method:mokken	Molenaar IW, Sijtsma K (2000). _User's Manual MSP5 for Windows_. iecProGAMMA, Groningen.
+method:mokken	Sijtsma K, Molenaar IW (2002). _Introduction to Nonparametric Item Response Theory_. Sage, Thousand Oaks, CA.
```

If the work is already in the file under another slug, do not type it again — see [References shared by several methods](#references-shared-by-several-methods).

### Add a method the app names but does not cite

Choose the slug first ([Naming a slug](#naming-a-slug)), then add its rows in sorted position:

```diff
+method:tukey-hsd	Tukey JW (1949). “Comparing individual means in the analysis of variance.” _Biometrics_, *5*(2), 99-114. doi:10.2307/3001913
```

### Add or correct an R package

The slug **is** the package name, one row only, and the version is a `{version}` token the app fills in with the release that actually executed. Never write a literal version — it would drift from the deployment the moment either side moved.

R produces a correct starting point:

```r
format(citation("mokken"), "text")
```

```diff
+mokken	van der Ark L, Koopman L (2024). _mokken: Conducts Mokken Scale Analysis_. doi:10.32614/CRAN.package.mokken <https://doi.org/10.32614/CRAN.package.mokken>. R package version {version}.
```

Two rows are exceptions: `webr` and `d3` ship inside the app rather than being installed, so nothing resolves their version at runtime and they carry a literal one, with a `#` comment above each saying so.

### Add the article that describes a package

That is a `paper:` row — the same package name behind the prefix. It carries no version and may hold several rows:

```diff
+paper:mokken	Van der Ark LA (2007). “Mokken Scale Analysis in R.” _Journal of Statistical Software_, *20*(11), 1-19. doi:10.18637/jss.v020.i11
+paper:mokken	Van der Ark LA (2012). “New Developments in Mokken Scale Analysis in R.” _Journal of Statistical Software_, *48*(5), 1-27. doi:10.18637/jss.v048.i05
```

`method:` or `paper:` — **the test is what the article did, not where it was published:**

| the article | slug |
|---|---|
| introduces the method | `method:` — Hochreiter et al. 2010 introduces FABIA, so `method:fabia` |
| implements a method that already existed | `paper:` — Van der Ark 2007 implements Mokken 1971, so `paper:mokken` |

A *Journal of Statistical Software* paper is usually the second and occasionally the first, so the venue decides nothing. A package whose own citation *is* its method paper still gets both rows, because a release and an article are different references.

### Demote a reference the user does not need to paste

Add `background` as a third field. It demotes rather than deletes, so the corpus keeps crediting everyone who built a method while the user still gets a short list.

The rule: **cite each distinct contribution once, in the form that ran.** Where a later work by the same authors *replaces* an earlier one, keep only the later. Where it *adds* — a variant, a correction the code applies, a separate criterion — keep both. Same author is not the same contribution.

The app runs Rulon's formula, so the Spearman-Brown pair behind it is background and Rulon is not:

```diff
-method:split-half	Spearman C (1910). “Correlation calculated from faulty data.” _British Journal of Psychology_, *3*(3), 271-295. doi:10.1111/j.2044-8295.1910.tb00206.x
+method:split-half	Spearman C (1910). “Correlation calculated from faulty data.” _British Journal of Psychology_, *3*(3), 271-295. doi:10.1111/j.2044-8295.1910.tb00206.x	background
 method:split-half	Rulon PJ (1939). “A simplified procedure for determining the reliability of a test by split-halves.” _Harvard Educational Review_, *9*, 99-103.
```

## References shared by several methods

**One work, one row.** A paper several methods rest on is typed once, under a slug of its own, and reached by a link. Typing it twice is an error CI rejects:

```diff
 method:hochberg	Hochberg Y (1988). “A sharper Bonferroni procedure for multiple tests of significance.” _Biometrika_, *75*(4), 800-802. doi:10.1093/biomet/75.4.800
-method:hochberg	Simes RJ (1986). “An improved Bonferroni procedure for multiple tests of significance.” _Biometrika_, *73*(3), 751-754. doi:10.1093/biomet/73.3.751
 method:hommel	Hommel G (1988). “A stagewise rejective multiple test procedure based on a modified Bonferroni test.” _Biometrika_, *75*(2), 383-386. doi:10.1093/biomet/75.2.383
-method:hommel	Simes RJ (1986). “An improved Bonferroni procedure for multiple tests of significance.” _Biometrika_, *73*(3), 751-754. doi:10.1093/biomet/73.3.751
```

Instead, one `ref:` row in `references.tsv`:

```diff
+ref:simes-1986	Simes RJ (1986). “An improved Bonferroni procedure for multiple tests of significance.” _Biometrika_, *73*(3), 751-754. doi:10.1093/biomet/73.3.751
```

and one line in `chains.tsv` for each slug that needs it:

```diff
+method:hochberg	ref:simes-1986
+method:hommel	ref:simes-1986
```

A `ref:` slug holds **exactly one** reference, is never cited by the app directly, and is named `ref:firstauthor-year`. Use one whenever a work belongs to more than one slug; a work that belongs to a single slug stays an ordinary row there.

Links are followed through further links and may not form a circle. A link may carry `background` as its third field, which demotes the work **for that method only** — Zinbarg 2005 is what omega rests on, while the tutorial beside it is background there:

```
method:mcdonald-omega	ref:zinbarg-2005
method:mcdonald-omega	ref:revelle-condon-2019	background
```

A `ref:` row never carries `background` itself: what a shared work counts as depends on which method reached it, so the link is what says so.

## Naming a slug

**Search the file before booking one — the text, not just the slugs.** The dangerous case has no exact collision at all: you book `spectral` while `spectral-biclustering` is already there. Searching the text finds Kluger 2003 even from a row whose slug avoided the word.

**Name it as the literature names it, at the precision that separates it from its neighbours and no further.** `method:plaid` and `method:bimax` stand unqualified because nothing else claims those names; only `spectral` needs `-biclustering`.

Lower case, words separated by hyphens.

## Writing the reference text

The text is whatever R's `citation()` emits, because that is where most of it comes from and what any contributor can reproduce:

| | |
|---|---|
| `_italics_` | titles of books, packages and journals |
| `*bold*` | volume numbers |
| `“curly quotes”` | around article titles |
| `doi:10.xxxx/yyy` | a DOI — not a doi.org link |
| `<https://…>` | a URL, where there is no DOI |

**The curly quotes are load-bearing.** R emits curly, so a straight `"` in a well-formed row is always LaTeX umlaut shorthand (`G"ohlmann` for Göhlmann) — which is why a straight double quote is rejected outright. Type the letter itself: `Göhlmann`, `Bühlmann`, `Lüdecke`.

**Never type a tab inside the text.** The tab is a field separator and nothing else — the reference would be silently truncated.

## File rules

Both files follow the same shape:

- one row per line, fields separated by single tabs, LF line endings;
- sorted by slug, so rows sharing a slug sit together;
- `#` in column 0 makes the whole line a comment;
- **the last line is a comment, and the file ends with a newline.** The parser only sees lines that end in a newline, so whatever sorts last would otherwise be dropped silently. Keep the closing comment where it is;
- no blank lines.

## What CI checks

`node lint.mjs` and the pull-request check are the same file. It rejects:

**In both files**

1. a carriage return anywhere, a missing final newline, or a last line that is not a `#` comment;
2. a blank line;
3. anything other than 2 or 3 tab-separated fields, or an empty field — a stray tab inside the text splits the line and shows up here;
4. a third field that is not exactly `background`;
5. rows out of slug order;
6. a line that already appears above.

**In `references.tsv`**

7. a slug that is neither a package name nor `method:`, `paper:` or `ref:` followed by a name;
8. a second row for a package slug;
9. a package row without `{version}`, or a vendored one (`webr`, `d3`) with it;
10. `{version}` in a `method:`, `paper:` or `ref:` row;
11. a `paper:X` with no `X` package row;
12. a `ref:` slug holding more than one row, or carrying `background`;
13. the same text under two slugs, or the same DOI under two slugs — one copy, reached by a link;
14. a straight double quote, or LaTeX markup like `\command{…}`;
15. a DOI written as a link, or as `doi: 10.x` or `DOI:10.x`.

It also **warns** when two same-year rows read like the same work typed differently. If they really are different works, ignore it.

**In `chains.tsv`**

16. a link to a slug that is not in `references.tsv`, or to a package row;
17. a slug linking to itself, or a circle of links.

## Language

**English only.** Every row is an English-language bibliographic record.