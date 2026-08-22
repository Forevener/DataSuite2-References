#!/usr/bin/env node

// The merge gate for this repository. It reads references.tsv and chains.tsv and, for every
// problem, prints the line and what to change. Run it before opening a pull request:
//
//     node lint.mjs
//
// It is deliberately self-contained – no dependencies, no build step, no other repository – so
// that what you run locally is exactly what the pull request runs. Everything it enforces is
// described in README.md; if a message here is unclear, that is a bug worth reporting.

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));

// Vendored libraries: nothing resolves their version at runtime, so their rows carry a literal
// one instead of the {version} token every other package row needs.
const VENDORED = new Set(["webr", "d3"]);

// The only value the optional third field may take. An unmarked row is primary.
const BACKGROUND = "background";

/** "method" | "paper" | "ref" | "package" | "unknown" – the namespace a slug's prefix declares. */
function namespaceOf(slug) {
	const colon = slug.indexOf(":");
	if (colon === -1) return "package";
	const prefix = slug.slice(0, colon);
	return prefix === "method" || prefix === "paper" || prefix === "ref" ? prefix : "unknown";
}

/** Split a file into annotated lines. Comments and blanks are kept – the checks report on them. */
function load(dir, name, report) {
	let raw;
	try {
		raw = readFileSync(join(dir, name), "utf8");
	} catch {
		report.error(name, null, "file not found next to lint.mjs – run this from the repository root.");
		return null;
	}
	const parts = raw.split("\n");
	// The empty string after a final newline is not a line; its absence is what we report.
	const endsWithNewline = parts.length > 1 && parts[parts.length - 1] === "";
	if (endsWithNewline) parts.pop();
	const lines = parts.map((text, i) => ({
		n: i + 1,
		raw: text,
		comment: text.startsWith("#"),
		blank: text.trim() === "",
		fields: text.split("\t"),
	}));
	return { name, lines, endsWithNewline };
}

/**
 * Checks both files share: line endings, the closing comment, field counts, the tier field and
 * slug ordering. Returns the data rows, so each file's own checks work on clean input.
 */
function structure(file, fieldNames, report) {
	const { name, lines } = file;

	for (const line of lines) {
		if (line.raw.includes("\r")) {
			report.error(name, line.n, "carries a carriage return. Save the file with LF line endings – a CRLF row drags \\r into the reference text.");
		}
	}
	if (!file.endsWithNewline) {
		report.error(name, lines.length, "the file has no final newline, so this line is dropped when it is read. Add one.");
	}
	const last = lines[lines.length - 1];
	if (last && !last.comment) {
		report.error(name, last.n, "the last line must be a # comment, so that no real row can sit in the slot a missing newline would drop. Keep the closing comment at the end.");
	}

	const rows = [];
	let previous = null;
	for (const line of lines) {
		if (line.comment) continue;
		if (line.blank) {
			report.error(name, line.n, "blank line. Every line is either a row or a # comment – delete it.");
			continue;
		}
		const [slug, text, tier, ...extra] = line.fields;
		if (line.fields.length < 2 || !slug || !text) {
			report.error(name, line.n, `only ${line.fields.length} field(s). A line is ${fieldNames}, separated by single tabs.`);
			continue;
		}
		if (extra.length) {
			report.error(name, line.n, `${line.fields.length} fields, expected 2 or 3. A tab inside the text splits the line – check for a stray tab.`);
			continue;
		}
		if (tier !== undefined && tier !== BACKGROUND) {
			report.error(name, line.n, `third field is "${tier}". The only value it may take is "${BACKGROUND}"; leave it off for a primary reference.`);
			continue;
		}
		if (previous !== null && slug < previous) {
			report.error(name, line.n, `out of order: "${slug}" belongs before "${previous}". The file is sorted by slug, so lines sharing a slug sit together.`);
		}
		previous = slug;
		rows.push({ n: line.n, slug, text, background: tier === BACKGROUND });
	}
	return rows;
}

/** references.tsv: the namespaces, the version token, text formatting, and one record per slug. */
function checkReferences(file, report) {
	const name = file.name;
	const rows = structure(file, 'slug<TAB>reference text, with an optional third field "background"', report);

	const seenRow = new Set();
	const byText = new Map();
	const byDoi = new Map();
	const unprefixed = new Map();
	const refRows = new Map();
	const papers = [];

	for (const row of rows) {
		const { n, slug, text } = row;
		const namespace = namespaceOf(slug);

		if (namespace === "unknown") {
			report.error(name, n, `"${slug.slice(0, slug.indexOf(":"))}:" is not a namespace. A slug is a package name, or method:, paper: or ref: followed by a name.`);
			continue;
		}

		const key = `${slug}\t${text}`;
		if (seenRow.has(key)) report.error(name, n, "this exact line already appears above. Delete the copy.");
		seenRow.add(key);

		if (!byText.has(text)) byText.set(text, []);
		byText.get(text).push(row);

		const doi = /doi:(10\.[^\s,]+)/.exec(text);
		if (doi) {
			if (!byDoi.has(doi[1])) byDoi.set(doi[1], []);
			byDoi.get(doi[1]).push(row);
		}

		const hasVersion = text.includes("{version}");
		if (namespace === "package") {
			if (unprefixed.has(slug)) {
				report.error(name, n, `a second row for the package "${slug}". A package has one release citation – if this is an article about the package, give it the slug "paper:${slug}".`);
			}
			unprefixed.set(slug, n);
			if (VENDORED.has(slug) && hasVersion) {
				report.error(name, n, `"${slug}" is bundled with the app, so nothing can fill in {version}. Write the version out in full.`);
			} else if (!VENDORED.has(slug) && !hasVersion) {
				report.error(name, n, "no {version} in this package row. Put {version} where the version belongs – the app fills in the release that actually ran.");
			}
		} else {
			if (hasVersion) report.error(name, n, "remove {version}. Only package rows carry a version; an article or a book is dated once and for all.");
			if (namespace === "paper") papers.push(row);
			if (namespace === "ref") {
				if (!refRows.has(slug)) refRows.set(slug, []);
				refRows.get(slug).push(row);
				if (row.background) {
					report.error(name, n, `remove "${BACKGROUND}". A ref: row is shared, so what it counts as depends on which method reached it – mark the chains.tsv line instead.`);
				}
			}
		}

		if (text.includes('"')) {
			report.error(name, n, 'straight double quote. Titles take curly quotes (“like this”), and an accented letter is typed directly – Göhlmann, not G"ohlmann.');
		}
		if (/\\[a-zA-Z]+\{/.test(text)) {
			report.error(name, n, "LaTeX markup left in the text. Write the character itself, and use _italics_ and *bold*.");
		}
		if (/doi\.org\/10\./.test(text) && !/doi:10\./.test(text)) {
			report.error(name, n, "the DOI is written as a link. Write it as doi:10.x instead.");
		}
		if (/\bdoi:\s+10\./i.test(text) || /\bDOI:10\./.test(text)) {
			report.error(name, n, "malformed DOI. The form is doi:10.x – lower case, no space after the colon.");
		}
	}

	for (const row of papers) {
		const pkg = row.slug.slice("paper:".length);
		if (!unprefixed.has(pkg)) {
			report.error(name, row.n, `there is no "${pkg}" row for this publication to sit beside. Add the package row, or check the spelling of the slug.`);
		}
	}

	for (const [slug, group] of refRows) {
		if (group.length > 1) {
			report.error(name, group[1].n, `"${slug}" holds ${group.length} references. A ref: slug holds exactly one – give the others their own ref: slug.`);
		}
	}

	// A ref: slug is where a shared record is meant to live, so when one is involved it is the
	// copy that gets reported – not the row the contributor is being asked to point at.
	const keeperFirst = group => {
		const home = group.find(r => namespaceOf(r.slug) === "ref");
		return home ? [home, ...group.filter(r => r !== home)] : group;
	};

	// The rule the ref: namespace exists to make keepable: one record, one place.
	for (const group of byText.values()) {
		if (new Set(group.map(r => r.slug)).size < 2) continue;
		const [keeper, ...copies] = keeperFirst(group);
		for (const copy of copies) {
			report.error(name, copy.n, `this reference is already on line ${keeper.n} under "${keeper.slug}". Keep one copy – move it to a ref: slug and add a chains.tsv line for each slug that needs it. See README.md, "References shared by several methods".`);
		}
	}

	// Two transcriptions of one paper: the check above cannot see these, because they differ.
	for (const [doi, group] of byDoi) {
		if (new Set(group.map(r => r.slug)).size < 2) continue;
		const [keeper, ...copies] = keeperFirst(group);
		for (const copy of copies) {
			report.error(name, copy.n, `doi:${doi} is already on line ${keeper.n} under "${keeper.slug}", written differently. It is the same paper, so it belongs on one line – see README.md, "References shared by several methods".`);
		}
	}

	// The same book or chapter typed twice, with no DOI to give it away. Compared word by word,
	// because one prolific author publishing twice in a year is ordinary and not what we are after.
	// Package rows are left out: their boilerplate makes any two look alike, and a second row for
	// one package is already an error above.
	const words = text => new Set(text.toLowerCase().replace(/[_*“”‘’(),.;:<>]/g, " ").split(/\s+/).filter(Boolean));
	const byYear = new Map();
	for (const row of rows) {
		if (namespaceOf(row.slug) === "package") continue;
		const year = /\((\d{4})[a-z]?\)/.exec(row.text);
		if (!year) continue;
		if (!byYear.has(year[1])) byYear.set(year[1], []);
		byYear.get(year[1]).push({ ...row, words: words(row.text) });
	}
	for (const group of byYear.values()) {
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const [a, b] = [group[i], group[j]];
				if (a.slug === b.slug || a.text === b.text) continue;
				const shared = [...a.words].filter(w => b.words.has(w)).length;
				if (shared / new Set([...a.words, ...b.words]).size >= 0.6) {
					report.warn(name, b.n, `looks like the same work as line ${a.n} under "${a.slug}", typed differently. If it is the same, keep one copy and chain to it; if the two really are different works, ignore this.`);
				}
			}
		}
	}

	return {
		slugs: new Set(rows.map(r => r.slug)),
		versioned: new Set(rows.filter(r => r.text.includes("{version}")).map(r => r.slug)),
	};
}

/** chains.tsv: every edge points somewhere real, nothing points at itself, and nothing loops. */
function checkChains(file, referenced, versioned, report) {
	const name = file.name;
	const rows = structure(file, 'slug<TAB>a slug it also cites, with an optional third field "background"', report);

	const edges = new Map();
	const seen = new Set();
	for (const row of rows) {
		const from = row.slug;
		const to = row.text;

		if (from === to) {
			report.error(name, row.n, `"${from}" points at itself. Delete the line.`);
			continue;
		}
		const key = `${from}\t${to}`;
		if (seen.has(key)) {
			report.error(name, row.n, "this line already appears above. Delete the copy.");
			continue;
		}
		seen.add(key);
		if (!referenced.has(to)) {
			report.error(name, row.n, `nothing in references.tsv has the slug "${to}". Check the spelling, or add the reference first.`);
			continue;
		}
		if (versioned.has(to)) {
			report.error(name, row.n, `"${to}" is a package release, and its version is filled in only where the package itself is cited. Point at the publication instead – "paper:${to}", if there is one.`);
			continue;
		}
		if (!edges.has(from)) edges.set(from, []);
		edges.get(from).push(to);
	}

	// A chain that comes back round would make the reference list build for ever.
	const state = new Map();
	const walk = (slug, trail) => {
		if (state.get(slug) === "done") return;
		if (state.get(slug) === "open") {
			report.error(name, null, `these slugs cite each other in a circle: ${[...trail, slug].join(" -> ")}. Break the loop.`);
			return;
		}
		state.set(slug, "open");
		for (const next of edges.get(slug) || []) walk(next, [...trail, slug]);
		state.set(slug, "done");
	};
	for (const slug of edges.keys()) walk(slug, []);
}

/**
 * Check the corpus in `dir`. Returns the problems found, most important file first, each as
 * `{ file, line, message, fatal }` – `line` is null when the problem is the file as a whole.
 */
export function lint(dir = HERE) {
	const problems = [];
	const report = {
		error: (file, line, message) => problems.push({ file, line, message, fatal: true }),
		warn: (file, line, message) => problems.push({ file, line, message, fatal: false }),
	};

	const references = load(dir, "references.tsv", report);
	const chains = load(dir, "chains.tsv", report);
	if (references) {
		const { slugs, versioned } = checkReferences(references, report);
		if (chains) checkChains(chains, slugs, versioned, report);
	}
	problems.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
	return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const problems = lint(process.argv[2] || HERE);
	for (const p of problems) {
		console.log(`${p.fatal ? "error  " : "warning"} ${p.line === null ? p.file : `${p.file}:${p.line}`}: ${p.message}`);
	}
	const errors = problems.filter(p => p.fatal).length;
	if (!problems.length) console.log("Everything checks out.");
	else console.log(`\n${errors} error(s), ${problems.length - errors} warning(s).`);
	process.exit(errors ? 1 : 0);
}
