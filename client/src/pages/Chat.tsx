import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, errorText } from '../lib/api';
import { Button, ErrorNote, Page, PageHeader } from '../components/ui';

interface Message { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'How much can I save this month?',
  'Where is most of my money going?',
  'Make a monthly savings plan for me',
  'How long until I reach my goals?',
];

/** The conversation lasts for this browser tab only and is never stored on the server. */
const load = (key: string): Message[] => { try { return JSON.parse(sessionStorage.getItem(key) ?? '[]'); } catch { return []; } };
const save = (key: string, m: Message[]) => { try { sessionStorage.setItem(key, JSON.stringify(m)); } catch { /* ignore */ } };

/** Replies are plain text, but models still like **bold**. */
function Text({ value }: { value: string }) {
  return <>{value.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</>;
}

export default function Chat() {
  const { user } = useAuth();
  const key = `ft.chat.${user?.id}`;
  const [messages, setMessages] = useState<Message[]>(() => load(key));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { save(key, messages); end.current?.scrollIntoView({ block: 'end' }); }, [key, messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Message[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ reply: string }>('/ai/chat', { messages: next });
      setMessages([...next, { role: 'assistant', content: r.reply }]);
    } catch (err) {
      // Put the question back so that it can be sent again.
      setMessages(messages);
      setInput(content);
      setError(errorText(err));
    } finally { setBusy(false); }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void send(input); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); }
  };

  return (
    <Page fill>
      <PageHeader
        title="AI assistant"
        subtitle="Ask about your spending, savings and monthly plan"
        actions={messages.length > 0 && <Button size="sm" onClick={() => { setMessages([]); setError(null); }} icon={<Trash2 className="size-3.5" />}>Clear chat</Button>}
      />
      <div className="card flex min-h-[24rem] flex-1 flex-col overflow-hidden">
        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="mx-auto max-w-md py-8 text-center">
              <Sparkles className="mx-auto size-6 text-brand-700" />
              <p className="mt-2 text-sm font-medium">What would you like to know?</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => <Button key={s} size="sm" onClick={() => void send(s)}>{s}</Button>)}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-800'}`}>
                <Text value={m.content} />
              </div>
            </div>
          ))}
          {busy && <div className="flex justify-start"><div className="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-500">Thinking…</div></div>}
          <div ref={end} />
        </div>
        <form onSubmit={submit} className="space-y-2 border-t border-stone-100 p-3">
          <ErrorNote message={error} />
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={2}
              maxLength={2000}
              placeholder="Ask in English or Malayalam…"
              aria-label="Your question"
              className="p-inputtext p-component w-full resize-none text-sm"
            />
            <Button type="submit" variant="primary" loading={busy} disabled={!input.trim()} icon={<Send className="size-3.5" />}>Send</Button>
          </div>
          <p className="text-[11px] text-stone-500">
            Your question and a summary of this workspace’s numbers (salaries, spending, balances, goals) go to OpenAI to answer it. Emails, passwords, account numbers and notes aren’t sent. The AI can make mistakes and isn’t a licensed adviser.
          </p>
        </form>
      </div>
    </Page>
  );
}
