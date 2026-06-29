import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { useAuth } from '../auth/AuthContext';
import { createDynamoClient } from '../aws/clients';
import { RuntimeConfig } from '../config';
import { useVersionCheck, VersionBanner } from '../hooks/useVersionCheck';

export interface Agent {
  PK: string;
  displayName: string;
  description?: string;
  type: 'agent' | 'harness';
  availability: {
    mode: 'all' | 'restricted';
    allowedUsers?: string[];
    allowedGroups?: string[];
  };
}

export function Dashboard({ config }: { config: RuntimeConfig }) {
  const { email, groups, getCredentials, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const versionInfo = useVersionCheck(isAdmin);

  useEffect(() => { loadAgents(); }, []);

  async function loadAgents() {
    setLoading(true);
    setError('');
    try {
      const creds = await getCredentials();
      const client = createDynamoClient(config, creds);
      const result = await client.send(new ScanCommand({ TableName: config.agentRegistryTable }));
      const all = (result.Items ?? []).filter(item => !item.PK.startsWith('USER#')) as Agent[];
      const visible = all.filter(agent => isVisible(agent, email!, groups));
      setAgents(visible);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }

  function isVisible(agent: Agent, userEmail: string, userGroups: string[]): boolean {
    if (agent.availability.mode === 'all') return true;
    const { allowedUsers = [], allowedGroups = [] } = agent.availability;
    if (allowedUsers.includes(userEmail)) return true;
    if (allowedGroups.some(g => userGroups.includes(g))) return true;
    return false;
  }

  return (
    <div className="dashboard-page">
      <header className="app-header">
        <h1>Aura</h1>
        <nav>
          {isAdmin && <button onClick={() => navigate('/admin')} className="btn-secondary">Admin</button>}
          <button onClick={logout} className="btn-secondary">Sign Out</button>
        </nav>
      </header>

      <main>
        <VersionBanner info={versionInfo} />
        <h2>Available Agents</h2>
        {loading && <p>Loading agents...</p>}
        {error && <p className="error-msg">{error}</p>}
        {!loading && !error && agents.length === 0 && (
          <p className="empty-state">No agents are currently available to you.</p>
        )}
        <div className="agent-grid">
          {agents.map(agent => (
            <div key={agent.PK} className="agent-card" onClick={() => navigate(`/chat/${encodeURIComponent(agent.PK)}`)}>
              <div className="agent-card-header">
                <span className={`agent-type-badge badge-${agent.type || 'agent'}`}>{agent.type || 'agent'}</span>
              </div>
              <h3>{agent.displayName}</h3>
              {agent.description && <p className="agent-description">{agent.description}</p>}
              <p className="agent-arn">{agent.PK}</p>
              <button className="btn-primary">Chat</button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
