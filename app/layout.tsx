import './globals.css';
export const metadata = { title: 'ReverseLearn — understand apps AI built for you', description: 'Import a project, see evidence-based maps, trace features, learn concepts, and propose safe changes.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
