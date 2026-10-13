import { describe, it, expect } from 'vitest';
import { parseGitHubUrl } from '../lib/github';

describe('parseGitHubUrl', () => {
  it('parses a plain repo URL', () => {
    expect(parseGitHubUrl('https://github.com/pharveylg/reverselearn')).toEqual({ owner: 'pharveylg', repo: 'reverselearn' });
    expect(parseGitHubUrl('https://github.com/pharveylg/reverselearn.git')).toEqual({ owner: 'pharveylg', repo: 'reverselearn' });
  });
  it('parses branch + subpath from a /tree/ link (what GitHub shows when you browse a folder)', () => {
    expect(parseGitHubUrl('https://github.com/vercel/next.js/tree/canary/examples/hello-world'))
      .toEqual({ owner: 'vercel', repo: 'next.js', branch: 'canary', subpath: 'examples/hello-world' });
  });
  it('parses owner/repo shorthand and ssh form', () => {
    expect(parseGitHubUrl('pharveylg/reverselearn')).toEqual({ owner: 'pharveylg', repo: 'reverselearn' });
    expect(parseGitHubUrl('git@github.com:pharveylg/reverselearn.git')).toEqual({ owner: 'pharveylg', repo: 'reverselearn' });
  });
  it('rejects non-GitHub and malformed links instead of guessing', () => {
    expect(parseGitHubUrl('https://gitlab.com/a/b')).toBeNull();
    expect(parseGitHubUrl('https://github.com/onlyowner')).toBeNull();
    expect(parseGitHubUrl('not a link')).toBeNull();
  });
});
