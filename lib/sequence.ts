import { Analysis, FeatureTrace, InputFile } from './types';
import { techBehindFeature } from './tech';

export type SeqActor = { id: string; label: string; icon: string };
export type SeqMessage = { n: number; from: string; to: string; label: string; kind: 'call' | 'return' | 'unknown'; evidence?: string };
export type Sequence = { actors: SeqActor[]; messages: SeqMessage[] };

/** Build a numbered sequence diagram for a trace from evidence (never invented:
    missing auth/data appear as explicit "unknown" dashed messages). */
export function buildSequence(analysis: Analysis, files: InputFile[], trace: FeatureTrace): Sequence {
  const layers = techBehindFeature(analysis, files, trace);
  const layer = (name: string) => layers.find((l) => l.layer === name);
  const has = (name: string) => !!layer(name) && layer(name)!.confidence !== 'unverified';
  const route = analysis.routes.find((r) => trace.name.endsWith(r.path));
  const isApi = route?.kind === 'api';

  const actors: SeqActor[] = [{ id: 'user', label: 'User', icon: '👤' }];
  if (!isApi) actors.push({ id: 'ui', label: 'Browser / UI', icon: '🖥️' });
  actors.push({ id: 'api', label: isApi ? 'API handler' : 'Server / API', icon: '⚙️' });
  if (layer('Auth')) actors.push({ id: 'auth', label: 'Auth', icon: '🔐' });
  if (layer('Data')) actors.push({ id: 'db', label: 'Database', icon: '🗄️' });

  const m: SeqMessage[] = []; let n = 0;
  const msg = (from: string, to: string, label: string, kind: SeqMessage['kind'], evidence?: string) => { if (from !== to && actors.some((a) => a.id === from) && actors.some((a) => a.id === to)) m.push({ n: ++n, from, to, label, kind, evidence }); };
  const firstFile = trace.steps[0]?.evidence[0]?.path; const apiFile = route?.file;

  if (isApi) {
    msg('user', 'api', `request ${route?.methods.join('/') || ''} ${route?.path || trace.name}`, 'call', apiFile);
  } else {
    msg('user', 'ui', 'clicks / submits (starts the feature)', 'call', firstFile);
    msg('ui', 'api', `fetch request → ${route?.path || 'server'} (method + JSON, see Transport step)`, 'call', firstFile);
  }
  if (layer('Auth')) {
    if (has('Auth')) { msg('api', 'auth', 'who is calling? check session/token', 'call', apiFile); msg('auth', 'api', 'identity OK (or 401 if not)', 'return', apiFile); }
    else msg('api', 'auth', 'auth check — NOT FOUND in traced code', 'unknown', apiFile);
  }
  if (has('Backend') || isApi) msg('api', 'api', 'validate input → business rules → error handling', 'call', apiFile);
  if (layer('Data')) {
    if (has('Data')) { msg('api', 'db', 'query / save (ORM → SQL)', 'call', apiFile); msg('db', 'api', 'rows / saved record', 'return', apiFile); }
    else msg('api', 'db', 'persistence — NOT DETECTED (does it save at all?)', 'unknown', apiFile);
  }
  if (isApi) msg('api', 'user', 'HTTP response (status + JSON) → UI updates', 'return', apiFile);
  else { msg('api', 'ui', 'HTTP response (status + JSON)', 'return', apiFile); msg('ui', 'user', 'screen updates / error shown', 'return', firstFile); }
  return { actors, messages: m };
}
