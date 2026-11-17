// Stub describer for tests. Usage: node describer.mjs <record-file> [mode]
// Appends the raw stdin (one line) to <record-file>, then answers by mode:
//   ok      valid entries for every item, wrapped in chatter and a code fence
//   partial first item valid, second unknown branch, third missing summary, plus an id nobody asked for
//   junk    not JSON at all
//   fail    exit code 1 with no output
//   badtype a JSON object instead of an array
import fs from 'node:fs';

const [record, mode = 'ok'] = process.argv.slice(2);
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const raw = Buffer.concat(chunks).toString('utf8');
if (record) fs.appendFileSync(record, raw.replace(/\n/g, ' ') + '\n');
const req = JSON.parse(raw);

const entry = (it, over = {}) => ({
  id: it.id,
  branch: /code|review|test/i.test(it.name) ? 'code' : 'other',
  title: { en: `Title ${it.name}`, ru: `Название ${it.name}` },
  summary: { en: `Does ${it.name}.`, ru: `Делает ${it.name}.` },
  ...over,
});

if (mode === 'fail') process.exit(1);
if (mode === 'junk') { process.stdout.write('I cannot help with that [sorry]\n'); process.exit(0); }
if (mode === 'badtype') { process.stdout.write(JSON.stringify({ items: [] })); process.exit(0); }
let out;
if (mode === 'partial') {
  const [a, b, c] = req.items;
  out = [entry(a), entry(b, { branch: 'wizardry' }), { ...entry(c), summary: undefined },
    entry({ id: 'cli:skill:nobody-asked', name: 'nobody' })];
} else {
  out = req.items.map((it) => entry(it));
}
process.stdout.write(`Here is the result [as requested]:\n\`\`\`json\n${JSON.stringify(out, null, 1)}\n\`\`\`\nDone.\n`);
