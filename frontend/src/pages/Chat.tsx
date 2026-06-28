import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';
import { useAuth } from '../auth/AuthContext';
import { createAgentCoreClient } from '../aws/clients';
import { RuntimeConfig } from '../config';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function Chat({ config }: { config: RuntimeConfig }) {
  const { arn } = useParams<{ arn: string }>();
  const agentArn = decodeURIComponent(arn || '');
  const { sub, sessionId, getCredentials, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || prompt.length > 10000) {
      setError(prompt.length > 10000 ? 'Prompt exceeds 10,000 characters' : '');
      return;
    }

    setError('');
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    setStreaming(true);

    // Add empty assistant message for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const creds = await getCredentials();
      const client = createAgentCoreClient(config, creds);

      const command = new InvokeAgentRuntimeCommand({
        agentRuntimeArn: agentArn,
        runtimeSessionId: sessionId!,
        runtimeUserId: sub!,
        payload: new TextEncoder().encode(JSON.stringify({ prompt })),
        contentType: 'application/json',
        accept: 'text/event-stream',
      });

      const response = await client.send(command);

      // Handle response - AgentCore may return JSON string or event-stream
      if (response.response) {
        const body = response.response;

        if (Symbol.asyncIterator in Object(body)) {
          // Streaming: collect all chunks then parse
          const chunks: Uint8Array[] = [];
          for await (const chunk of body as AsyncIterable<Uint8Array>) {
            chunks.push(chunk);
          }
          const fullText = new TextDecoder().decode(concatUint8Arrays(chunks));
          const parsed = tryParseAgentResponse(fullText);
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: parsed };
            return updated;
          });
        } else {
          // Non-streaming: single body
          const text = typeof body === 'string' ? body : new TextDecoder().decode(body as Uint8Array);
          const parsed = tryParseAgentResponse(text);
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: parsed };
            return updated;
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Agent invocation failed');
      // Remove empty assistant message on error
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last.role === 'assistant' && !last.content) return prev.slice(0, -1);
        return prev;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="chat-page">
      <header className="app-header">
        <button onClick={() => navigate('/dashboard')} className="btn-secondary">← Back</button>
        <h1 className="chat-title">{agentArn.split('/').pop()}</h1>
        <nav>
          {isAdmin && <button onClick={() => navigate('/admin')} className="btn-secondary">Admin</button>}
          <button onClick={logout} className="btn-secondary">Sign Out</button>
        </nav>
      </header>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="message-content">{msg.content}{streaming && i === messages.length - 1 && msg.role === 'assistant' && <span className="cursor">▊</span>}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && <p className="error-msg">{error}</p>}

      <form onSubmit={handleSubmit} className="chat-input-form">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={streaming}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          maxLength={10000}
        />
        <button type="submit" disabled={streaming || !input.trim()} className="btn-primary">
          {streaming ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

function tryParseAgentResponse(text: string): string {
  // AgentCore may return a JSON-encoded string (e.g. "Hello!\n") or plain text
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return parsed;
    if (typeof parsed === 'object' && parsed.response) return String(parsed.response);
    if (typeof parsed === 'object' && parsed.output) return String(parsed.output);
    return text;
  } catch {
    // Not JSON — could be SSE or plain text
    // Try parsing SSE lines
    const lines = text.split('\n');
    const dataLines = lines.filter(l => l.startsWith('data: ')).map(l => l.slice(6));
    if (dataLines.length > 0) return dataLines.join('');
    return text;
  }
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}
