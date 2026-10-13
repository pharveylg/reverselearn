'use client';
import { useState } from 'react';
export default function HomePage() {
  const [title, setTitle] = useState('');
  async function createTask() { await fetch('/api/tasks', { method: 'POST', body: JSON.stringify({ title }) }); }
  return (<main><h1>My Tasks</h1><input value={title} onChange={e => setTitle(e.target.value)} /><button onClick={createTask}>Add task</button></main>);
}
