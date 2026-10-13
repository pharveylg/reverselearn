import { Analysis, InputFile, Level } from './types';
import { redactSecrets } from './security';

export type Lesson = { title: string; plain: string; why: string; excerpt: { path: string; lines: string } | null; terms: { term: string; def: string }[]; connections: string; whyChosen: string; alternatives: string; failures: string; quiz: { q: string; options: string[]; answer: number; explain: string } };
export type Exercise = { id: string; title: string; objective: string; files: string[]; instructions: string; hints: string[]; verify: string; solution: string };

const GLOSSARY: Record<string, string> = {
  component: 'A reusable piece of UI, like a LEGO brick that renders part of a screen.',
  route: 'A URL path the app responds to, e.g. /projects shows a page, /api/projects returns data.',
  api: 'A way for the frontend to ask the backend for data/actions over HTTP, like a waiter between kitchen and table.',
  state: 'Data the UI remembers while you use it (form text, loading flags). When state changes, React re-renders.',
  props: 'Inputs passed into a component, like arguments passed into a function.',
  handler: 'A function that runs when something happens — a click, a form submit, or an HTTP request arriving.',
  orm: 'A tool (e.g. Prisma) that lets code talk to a database using objects instead of raw SQL.',
  migration: 'A versioned recipe that changes the database shape (add a table/column) safely over time.',
};

export function generateLesson(analysis: Analysis, files: InputFile[], targetPath: string | null, level: Level): Lesson {
  const file = targetPath ? files.find((f) => f.path === targetPath) : files.find((f) => analysis.routes[0] && f.path === analysis.routes[0].file) || files[0];
  const stack = analysis.frameworks.join(', ') || 'no recognised framework';
  const route = file ? analysis.routes.find((r) => r.file === file.path) : undefined;
  const rawExcerpt = file ? redactSecrets(file.content).split('\n').slice(0, 18).join('\n') : '';
  const levelNote = level === 'beginner' ? 'Beginner mode: every term is explained, no assumed knowledge.' : level === 'advanced' ? 'Advanced mode: focus on internals, failure modes, security and scaling.' : 'Intermediate mode: patterns and trade-offs.';
  return {
    title: file ? `How ${file.path.split('/').pop()} fits into this app` : 'Project big picture',
    plain: `${levelNote} This project uses ${stack}. ${file ? `"${file.path}" is categorised as ${analysis.files.find((f) => f.path === file.path)?.category || 'source'} (${file.content.length} characters, symbols: ${(analysis.files.find((f) => f.path === file.path)?.symbols.join(', ') || 'none detected')}).` : 'No file selected yet.'} ${route ? `It defines the ${route.kind} route ${route.path} (${route.methods.join(', ')}).` : ''} Read the excerpt, then predict what happens before opening the quiz.`,
    why: 'This file exists because every app needs an entry point where a URL, a click, or a request turns into UI or data. Finding that entry point first makes the rest of the codebase far less mysterious.',
    excerpt: file ? { path: file.path, lines: rawExcerpt } : null,
    terms: Object.entries(GLOSSARY).slice(0, 5).map(([term, def]) => ({ term, def })),
    connections: route ? `Start at ${route.path} → open ${route.file} → follow its imports (top of file) → each import is the next room to visit. That import chain IS the architecture in miniature.` : 'Follow imports from any entry file; each import is a connection to another part of the app.',
    whyChosen: 'Inference (not proven fact): AI builders often choose this stack because it has many training examples, fast scaffolding, and one language (TypeScript) across frontend and backend. Confirm intent from the project README/history if available.',
    alternatives: 'Alternatives include a separate backend (Express/Nest), a different framework (Vue/Svelte), or no framework at all. Trade-offs: hiring/examples and speed of building vs. complexity, hosting cost, and how much magic happens invisibly.',
    failures: 'Common failures: editing the wrong file (similar names), changing UI without updating the API shape, forgetting auth on a new API route, and assuming it works without running it. Debug in order: browser console → network tab → server logs → database.',
    quiz: {
      q: route ? `Where is ${route.path} defined?` : 'What is the first thing to find in a new codebase?',
      options: route ? [route.file, 'node_modules', 'The database directly', 'It is generated at runtime with no file'] : ['An entry point (route/page)', 'The largest file', 'node_modules', 'Random files'],
      answer: 0,
      explain: route ? `Correct evidence: the analyzer found the route in ${route.file}. Always trust a file path you can open over a guess.` : 'Entry points connect URLs/actions to code; everything else is reached from there.',
    },
  };
}

export function generateExercises(analysis: Analysis): Exercise[] {
  const firstPage = analysis.routes.find((r) => r.kind === 'page') || analysis.routes[0];
  const firstApi = analysis.routes.find((r) => r.kind === 'api');
  const firstFile = analysis.files[0];
  const ex: Exercise[] = [];
  if (firstFile) ex.push({ id: 'ex-identify', title: '1 · Identify a file', objective: 'Learn to navigate by evidence, not guessing.', files: [firstFile.path], instructions: `Open ${firstFile.path}. In your own words: what category is it (${firstFile.category}) and what symbols does it export (${firstFile.symbols.join(', ') || 'none'})?`, hints: ['Look at the file extension and folder name first.', 'Exports are lines starting with "export".'], verify: 'Your answer names the folder reason + at least one export.', solution: `It is a ${firstFile.category} file. Exports detected by the analyzer: ${firstFile.symbols.join(', ') || 'none'}.` });
  if (firstPage) ex.push({ id: 'ex-predict', title: '2 · Predict before you run', objective: 'Build the habit of predicting behaviour before reading answers.', files: [firstPage.file], instructions: `Before opening it fully: predict what a user sees at ${firstPage.path}. Then open ${firstPage.file} and write one sentence on what you got right/wrong.`, hints: ['The route path is a strong clue to the screen purpose.'], verify: 'You wrote a prediction BEFORE opening the file (be honest with yourself).', solution: 'Any specific prediction counts. The skill is predicting, not being right first time.' });
  ex.push({ id: 'ex-trace', title: '3 · Trace one flow', objective: 'Follow a request end-to-end.', files: analysis.traces[0]?.steps.flatMap((s) => s.evidence.map((e) => e.path)) || [], instructions: `Open the Feature Trace for "${analysis.traces[0]?.name || 'the first feature'}". For each step, open its evidence file. Write down one step that is labelled Unverified and why.`, hints: ['Unverified means: needs running the app to prove.'], verify: 'You can name the unverified step and what you would do to verify it.', solution: analysis.traces[0]?.unknowns.join(' ') || 'No trace available — import a project with routes first.' });
  if (firstApi) ex.push({ id: 'ex-validation', title: '4 · Find missing validation', objective: 'Spot a real-world bug class: trusting user input.', files: [firstApi.file], instructions: `Open ${firstApi.file}. Does it check (a) who is calling, (b) that inputs exist/are the right type, (c) error cases? List what is missing.`, hints: ['Look for auth before anything else.', 'Look for if-checks on request data.'], verify: 'Your list cites line-level observations, not vibes.', solution: 'Compare your list with the handler: missing auth/validation/error handling are findings to note, not proof of a live vulnerability.' });
  ex.push({ id: 'ex-change', title: '5 · Make a tiny safe change', objective: 'Change one visible word and prove it worked.', files: firstPage ? [firstPage.file] : [], instructions: 'Go to Change Lab. Describe "change one heading/label word". Review the diff, export the patch, and only then apply it if you are comfortable.', hints: ['One word. Resist fixing three things at once.'], verify: 'Diff shows only the intended line changed.', solution: 'Small, reviewed, reversible changes are how professionals work too.' });
  ex.push({ id: 'ex-test', title: '6 · Describe a test', objective: 'Understand what a test proves.', files: analysis.files.filter((f) => f.category === 'test').map((f) => f.path), instructions: analysis.files.some((f) => f.category === 'test') ? 'Open one test file. What behaviour does it claim to prove? What does it NOT prove?' : 'No tests exist yet. Write (in English) a test plan: "when I do X, I expect Y" for the main feature.', hints: ['A test proves one claim, not "the app works".'], verify: 'Your test plan has an action and an expected result.', solution: 'Example: "When I submit an empty form, I expect an error and nothing saved."' });
  ex.push({ id: 'ex-explain', title: '7 · Explain it back', objective: 'Prove understanding in your own words (strongest signal).', files: [], instructions: 'In the progress box for this exercise, explain the main feature to a friend in 3 sentences: what the user does, what code runs, where data lives.', hints: ['If you cannot explain it simply, re-open the Feature Trace.'], verify: 'A friend could repeat the flow back to you.', solution: 'Compare your explanation against the Feature Trace steps.' });
  return ex;
}

export function learningPath(analysis: Analysis): { title: string; why: string; minutes: number; files: string[] }[] {
  const fw = analysis.frameworks;
  return [
    { title: 'Big picture: what is this app?', why: `Stack detected: ${fw.join(', ') || 'unknown'}. Start with the map, not random files.`, minutes: 10, files: analysis.files.slice(0, 3).map((f) => f.path) },
    { title: 'Meet the entry points', why: 'Routes are where URLs become screens/data.', minutes: 15, files: analysis.routes.slice(0, 4).map((r) => r.file) },
    { title: 'Follow one feature end-to-end', why: 'One real flow teaches more than skimming everything.', minutes: 20, files: analysis.traces[0]?.steps.flatMap((s) => s.evidence.map((e) => e.path)).slice(0, 4) || [] },
    { title: 'Where does data live?', why: analysis.files.some((f) => f.category === 'database') ? 'Database files were detected — connect them to the trace.' : 'No DB files detected; learn how this app persists (or does not).', minutes: 15, files: analysis.files.filter((f) => f.category === 'database').map((f) => f.path) },
    { title: 'Make and verify a tiny change', why: 'Ownership comes from changing something safely.', minutes: 20, files: analysis.routes.slice(0, 1).map((r) => r.file) },
  ];
}
