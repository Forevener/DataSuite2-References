#!/usr/bin/env node

// The gate's own test. lint.mjs is the only implementation of the format rules, so every rule
// gets a fault planted here and has to catch it. Run it the way you run the linter:
//
//     node lint.test.mjs
//
// Self-contained, like lint.mjs – no dependencies, no build step. Each case starts from a corpus
// that passes clean, breaks exactly one thing, and asserts on the message a contributor reads.
// Rows are real ones from references.tsv, so a fixture also shows what a good row looks like.

import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { lint } from "./lint.mjs";

const row = (...fields) => fields.join("\t");

const SIMES = "Simes RJ (1986). “An improved Bonferroni procedure for multiple tests of significance.” _Biometrika_, *73*(3), 751-754. doi:10.1093/biomet/73.3.751";

// Sorted by slug, closing comment last – a corpus that must lint clean.
const REFERENCES = [
	row("method:hochberg", "Hochberg Y (1988). “A sharper Bonferroni procedure for multiple tests of significance.” _Biometrika_, *75*(4), 800-802. doi:10.1093/biomet/75.4.800"),
	row("method:hommel", "Hommel G (1988). “A stagewise rejective multiple test procedure based on a modified Bonferroni test.” _Biometrika_, *75*(2), 383-386. doi:10.1093/biomet/75.2.383"),
	row("mokken", "van der Ark L, Koopman L (2024). _mokken: Conducts Mokken Scale Analysis_. R package version {version}, <https://CRAN.R-project.org/package=mokken>."),
	row("paper:mokken", "Van der Ark LA (2007). “Mokken Scale Analysis in R.” _Journal of Statistical Software_, *20*(11), 1-19. doi:10.18637/jss.v020.i11"),
	row("ref:simes-1986", SIMES),
	"# end"
];
// Indices into REFERENCES, so a fault says what it breaks rather than where.
const HOCHBERG = 0, HOMMEL = 1, PACKAGE = 2, PAPER = 3, SHARED = 4, CLOSING = 5;

const CHAINS = [
	row("method:hochberg", "ref:simes-1986"),
	row("method:hommel", "ref:simes-1986"),
	"# end"
];

/** Write a corpus to a scratch directory, lint it, and throw the directory away. */
function run({ references = REFERENCES, chains = CHAINS, trailingNewline = true }) {
	const text = rows => rows.join("\n") + (trailingNewline ? "\n" : "");
	const dir = mkdtempSync(join(tmpdir(), "refs-lint-"));
	try {
		writeFileSync(join(dir, "references.tsv"), text(references), "utf8");
		writeFileSync(join(dir, "chains.tsv"), text(chains), "utf8");
		return lint(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// Each case plants one fault and names the fragment of the message that must come back. `fatal`
// is false where the rule is a warning – a distinction worth pinning, since a rule quietly
// demoted to a warning would stop failing the merge without failing anything here.
const cases = [
	{
		name: "a clean corpus passes",
		corpus: {},
		clean: true
	},

	// Structure – checked in both files.
	{
		name: "carriage return",
		corpus: { references: REFERENCES.toSpliced(HOCHBERG, 1, REFERENCES[HOCHBERG] + "\r") },
		expect: "carriage return"
	},
	{
		name: "no final newline",
		corpus: { trailingNewline: false },
		expect: "no final newline"
	},
	{
		name: "last line is not a comment",
		corpus: { references: REFERENCES.toSpliced(CLOSING, 1) },
		expect: "last line must be a # comment"
	},
	{
		name: "blank line",
		corpus: { references: REFERENCES.toSpliced(CLOSING, 0, "") },
		expect: "blank line"
	},
	{
		name: "a row with one field",
		corpus: { references: REFERENCES.toSpliced(PACKAGE, 0, "method:zzz") },
		expect: "field(s)"
	},
	{
		name: "a row with four fields",
		corpus: { references: REFERENCES.toSpliced(PACKAGE, 0, row("method:zzz", "Zeta A (1999). _A work_.", "background", "extra")) },
		expect: "expected 2 or 3"
	},
	{
		name: "a third field that is not background",
		corpus: { references: REFERENCES.toSpliced(HOCHBERG, 1, row(...REFERENCES[HOCHBERG].split("\t"), "primary")) },
		expect: "background"
	},
	{
		name: "rows out of slug order",
		corpus: { references: REFERENCES.toSpliced(HOCHBERG, 2, REFERENCES[HOMMEL], REFERENCES[HOCHBERG]) },
		expect: "out of order"
	},
	{
		name: "a duplicated line",
		corpus: { references: REFERENCES.toSpliced(HOMMEL, 0, REFERENCES[HOCHBERG]) },
		expect: "already appears above"
	},

	// references.tsv – namespaces, versions and one record per slug.
	{
		name: "an unknown namespace",
		corpus: { references: REFERENCES.toSpliced(HOCHBERG, 0, row("foo:bar", "Zeta A (1999). _A work_.")) },
		expect: "is not a namespace"
	},
	{
		name: "a second row for one package",
		corpus: { references: REFERENCES.toSpliced(PAPER, 0, row("mokken", "Someone E (2020). _mokken, again_. R package version {version}.")) },
		expect: "a second row for the package"
	},
	{
		name: "a package row with no {version}",
		corpus: { references: REFERENCES.toSpliced(PACKAGE, 1, REFERENCES[PACKAGE].replace("{version}", "3.1.0")) },
		expect: "no {version} in this package row"
	},
	{
		name: "a vendored package row carrying {version}",
		corpus: { references: REFERENCES.toSpliced(HOCHBERG, 0, row("d3", "Bostock M (2024). _D3: Data-Driven Documents_. JavaScript library version {version}, <https://d3js.org>.")) },
		expect: "bundled with the app"
	},
	{
		name: "{version} in a method row",
		corpus: { references: REFERENCES.toSpliced(HOCHBERG, 1, REFERENCES[HOCHBERG] + " R package version {version}.") },
		expect: "remove {version}"
	},
	{
		name: "a paper: row with no package row",
		corpus: { references: REFERENCES.toSpliced(PACKAGE, 1) },
		expect: "there is no"
	},
	{
		name: "a ref: slug holding two rows",
		corpus: { references: REFERENCES.toSpliced(CLOSING, 0, row("ref:simes-1986", "Simes RJ (1986). _A different transcription entirely_. Elsewhere.")) },
		expect: "holds 2 references"
	},
	{
		name: "a ref: row marked background",
		corpus: { references: REFERENCES.toSpliced(SHARED, 1, row("ref:simes-1986", SIMES, "background")) },
		expect: "A ref: row is shared"
	},

	// references.tsv – one work, one row.
	{
		name: "the same text under two slugs",
		corpus: { references: REFERENCES.toSpliced(HOMMEL, 1, row("method:hommel", SIMES)) },
		expect: "is already on line"
	},
	{
		name: "the same DOI under two slugs, typed differently",
		corpus: { references: REFERENCES.toSpliced(HOMMEL, 1, row("method:hommel", "Simes RJ (1986). _An improved Bonferroni procedure_. Biometrika. doi:10.1093/biomet/73.3.751")) },
		expect: "written differently"
	},
	{
		name: "the same work typed twice with no DOI to give it away",
		corpus: { references: REFERENCES.toSpliced(HOMMEL, 1, row("method:hommel", SIMES.replace(" doi:10.1093/biomet/73.3.751", ""))) },
		expect: "looks like the same work",
		fatal: false
	},

	// references.tsv – the text itself.
	{
		name: "a straight double quote",
		corpus: { references: REFERENCES.toSpliced(HOCHBERG, 1, row("method:hochberg", 'Hochberg Y (1988). "A sharper Bonferroni procedure." _Biometrika_, *75*(4), 800-802.')) },
		expect: "straight double quote"
	},
	{
		name: "LaTeX markup",
		corpus: { references: REFERENCES.toSpliced(HOCHBERG, 1, row("method:hochberg", "Hochberg Y (1988). \\emph{A sharper Bonferroni procedure}. _Biometrika_, *75*(4), 800-802.")) },
		expect: "LaTeX markup"
	},
	{
		name: "a DOI written as a link",
		corpus: { references: REFERENCES.toSpliced(HOCHBERG, 1, REFERENCES[HOCHBERG].replace("doi:10.1093/biomet/75.4.800", "https://doi.org/10.1093/biomet/75.4.800")) },
		expect: "written as a link"
	},
	{
		name: "a DOI with a space after the colon",
		corpus: { references: REFERENCES.toSpliced(HOCHBERG, 1, REFERENCES[HOCHBERG].replace("doi:10.", "doi: 10.")) },
		expect: "malformed DOI"
	},

	// chains.tsv.
	{
		name: "a slug linking to itself",
		corpus: { chains: [row("method:hochberg", "method:hochberg"), "# end"] },
		expect: "points at itself"
	},
	{
		name: "a duplicated link",
		corpus: { chains: [CHAINS[0], CHAINS[0], "# end"] },
		expect: "already appears above"
	},
	{
		name: "a link to a slug that does not exist",
		corpus: { chains: [row("method:hochberg", "ref:nobody-1999"), "# end"] },
		expect: "nothing in references.tsv has the slug"
	},
	{
		name: "a link to a package row",
		corpus: { chains: [row("method:hochberg", "mokken"), "# end"] },
		expect: "is a package release"
	},
	{
		name: "a circle of links",
		corpus: { chains: [row("method:hochberg", "method:hommel"), row("method:hommel", "method:hochberg"), "# end"] },
		expect: "circle"
	}
];

let failed = 0;
for (const { name, corpus, expect, clean, fatal = true } of cases) {
	const problems = run(corpus);
	let complaint = null;

	if (clean) {
		if (problems.length) complaint = `expected no problems, got: ${problems.map(p => p.message).join(" | ")}`;
	} else {
		const hit = problems.find(p => p.message.includes(expect));
		if (!hit) {
			complaint = problems.length
				? `no message mentioning "${expect}"; got: ${problems.map(p => p.message).join(" | ")}`
				: `the fault went unreported – nothing mentioning "${expect}"`;
		} else if (hit.fatal !== fatal) {
			complaint = `reported as ${hit.fatal ? "an error" : "a warning"}, expected ${fatal ? "an error" : "a warning"}`;
		}
	}

	if (complaint) {
		failed++;
		console.log(`FAIL  ${name}\n      ${complaint}`);
	}
}

if (failed) {
	console.log(`\n${failed} of ${cases.length} checks failed.`);
	process.exit(1);
}
console.log(`All ${cases.length} checks passed.`);
