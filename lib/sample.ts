import { InputFile } from './types';
// Clearly-labelled SAMPLE fixture (also used by tests in /fixtures). Never presented as a real user project.
export const SAMPLE_FILES: InputFile[] = [
  { path: 'package.json', content: JSON.stringify({ name: 'sample-task-app', dependencies: { next: '14.2.5', react: '18.3.1', '@prisma/client': '^5.0.0' }, devDependencies: { typescript: '^5.5.0', tailwindcss: '^3.4.0' } }, null, 2) },
  { path: 'app/page.tsx', content: `'use client';\nimport { useState } from 'react';\nexport default function HomePage() {\n  const [title, setTitle] = useState('');\n  async function createTask() {\n    await fetch('/api/tasks', { method: 'POST', body: JSON.stringify({ title }) });\n  }\n  return (<main><h1>My Tasks</h1><input value={title} onChange={e => setTitle(e.target.value)} /><button onClick={createTask}>Add task</button></main>);\n}` },
  { path: 'app/api/tasks/route.ts', content: `import { prisma } from '@/lib/db';\nexport async function POST(req: Request) {\n  const body = await req.json();\n  if (!body.title) return Response.json({ error: 'title required' }, { status: 400 });\n  const task = await prisma.task.create({ data: { title: body.title } });\n  return Response.json(task);\n}\nexport async function GET() { return Response.json(await prisma.task.findMany()); }` },
  { path: 'lib/db.ts', content: `import { PrismaClient } from '@prisma/client';\nexport const prisma = new PrismaClient();` },
  { path: 'prisma/schema.prisma', content: `model Task { id Int @id @default(autoincrement()) title String createdAt DateTime @default(now()) }` },
  { path: 'app/tasks.test.ts', content: `import { describe, it, expect } from 'vitest';\ndescribe('tasks', () => { it('rejects empty title', () => { expect(true).toBe(true); }); });` },
  { path: 'README.md', content: '# Sample Task App\nA SAMPLE project bundled with ReverseLearn for learning and tests.' },
];
export const SAMPLE_NAME = 'SAMPLE — Task App (demo data)';
