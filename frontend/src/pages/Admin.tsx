import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  ListGroupsCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminCreateUserCommand,
  ListUsersInGroupCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { useAuth } from '../auth/AuthContext';
import { createDynamoClient } from '../aws/clients';
import { RuntimeConfig } from '../config';
import { Agent } from './Dashboard';

export function Admin({ config }: { config: RuntimeConfig }) {
  const { getCredentials, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'agents' | 'groups'>('agents');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Agent form state
  const [editingArn, setEditingArn] = useState<string | null>(null);
  const [agentType, setAgentType] = useState<'agent' | 'harness'>('agent');
  const [agentArn, setAgentArn] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [availMode, setAvailMode] = useState<'all' | 'restricted'>('all');
  const [allowedUsers, setAllowedUsers] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  // Group form state
  const [groupName, setGroupName] = useState('');
  const [groupEmail, setGroupEmail] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);

  // User autocomplete
  const [allUsers, setAllUsers] = useState<string[]>([]);
  const [userSuggestions, setUserSuggestions] = useState<string[]>([]);
  const [showNewUserWarning, setShowNewUserWarning] = useState(false);

  useEffect(() => { loadAgents(); loadGroups(); loadAllUsers(); }, []);

  async function loadAgents() {
    setLoading(true);
    try {
      const creds = await getCredentials();
      const client = createDynamoClient(config, creds);
      const result = await client.send(new ScanCommand({ TableName: config.agentRegistryTable }));
      setAgents((result.Items ?? []).filter(item => !item.PK.startsWith('USER#')) as Agent[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    try {
      const creds = await getCredentials();
      const cognito = new CognitoIdentityProviderClient({ region: config.region, credentials: creds });
      const result = await cognito.send(new ListGroupsCommand({ UserPoolId: config.userPoolId }));
      setGroups((result.Groups ?? []).map(g => g.GroupName!).filter((g): g is string => g !== 'admin' && g !== 'user'));
    } catch { /* non-critical */ }
  }

  async function loadAllUsers() {
    try {
      const creds = await getCredentials();
      const cognito = new CognitoIdentityProviderClient({ region: config.region, credentials: creds });
      const result = await cognito.send(new ListUsersCommand({ UserPoolId: config.userPoolId, Limit: 60 }));
      setAllUsers((result.Users ?? []).map(u => u.Attributes?.find(a => a.Name === 'email')?.Value ?? '').filter(Boolean));
    } catch { /* non-critical */ }
  }

  async function loadGroupMembers(group: string) {
    try {
      const creds = await getCredentials();
      const cognito = new CognitoIdentityProviderClient({ region: config.region, credentials: creds });
      const result = await cognito.send(new ListUsersInGroupCommand({ UserPoolId: config.userPoolId, GroupName: group }));
      setGroupMembers((result.Users ?? []).map(u => u.Attributes?.find(a => a.Name === 'email')?.Value ?? u.Username ?? ''));
    } catch {
      setGroupMembers([]);
    }
  }

  // --- Agent form handlers ---

  function resetAgentForm() {
    setEditingArn(null);
    setAgentType('agent');
    setAgentArn('');
    setDisplayName('');
    setDescription('');
    setAvailMode('all');
    setAllowedUsers('');
    setSelectedGroups([]);
  }

  function handleEditAgent(agent: Agent) {
    setEditingArn(agent.PK);
    setAgentType(agent.type || 'agent');
    setAgentArn(agent.PK);
    setDisplayName(agent.displayName);
    setDescription(agent.description || '');
    setAvailMode(agent.availability.mode);
    setAllowedUsers((agent.availability.allowedUsers ?? []).join(', '));
    setSelectedGroups(agent.availability.allowedGroups ?? []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSaveAgent(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!agentArn.startsWith('arn:')) { setError('ARN must start with arn:'); return; }
    if (!displayName || displayName.length > 100) { setError('Display name must be 1-100 characters'); return; }

    try {
      const creds = await getCredentials();
      const client = createDynamoClient(config, creds);
      const item: Agent = {
        PK: agentArn,
        displayName,
        description: description || undefined,
        type: agentType,
        availability: availMode === 'all' ? { mode: 'all' } : {
          mode: 'restricted',
          ...(allowedUsers.trim() && { allowedUsers: allowedUsers.split(',').map(s => s.trim()).filter(Boolean) }),
          ...(selectedGroups.length > 0 && { allowedGroups: selectedGroups }),
        },
      };
      await client.send(new PutCommand({ TableName: config.agentRegistryTable, Item: item }));
      setSuccess(editingArn ? 'Agent updated successfully' : 'Agent registered successfully');
      resetAgentForm();
      loadAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save agent');
    }
  }

  async function handleDeleteAgent(arn: string) {
    if (!confirm('Remove this agent?')) return;
    setError(''); setSuccess('');
    try {
      const creds = await getCredentials();
      const client = createDynamoClient(config, creds);
      await client.send(new DeleteCommand({ TableName: config.agentRegistryTable, Key: { PK: arn } }));
      setSuccess('Agent removed');
      if (editingArn === arn) resetAgentForm();
      loadAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete agent');
    }
  }

  // --- Group handlers ---

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!groupName || groupName.length > 128) { setError('Group name must be 1-128 characters'); return; }
    try {
      const creds = await getCredentials();
      const cognito = new CognitoIdentityProviderClient({ region: config.region, credentials: creds });
      await cognito.send(new CreateGroupCommand({ UserPoolId: config.userPoolId, GroupName: groupName }));
      setSuccess(`Group "${groupName}" created`);
      setGroupName('');
      loadGroups();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create group');
    }
  }

  const handleGroupEmailChange = useCallback((value: string) => {
    setGroupEmail(value);
    setShowNewUserWarning(false);
    if (value.length >= 3) {
      const matches = allUsers.filter(u => u.toLowerCase().includes(value.toLowerCase()));
      setUserSuggestions(matches.slice(0, 5));
      if (value.includes('@') && matches.length === 0) {
        setShowNewUserWarning(true);
      }
    } else {
      setUserSuggestions([]);
    }
  }, [allUsers]);

  async function handleAddToGroup(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!selectedGroup || !groupEmail) return;

    if (showNewUserWarning && !confirm(`"${groupEmail}" is not in the system. A new account will be created. Continue?`)) return;

    try {
      const creds = await getCredentials();
      const cognito = new CognitoIdentityProviderClient({ region: config.region, credentials: creds });
      try {
        await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: config.userPoolId, Username: groupEmail, GroupName: selectedGroup }));
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'UserNotFoundException') {
          await cognito.send(new AdminCreateUserCommand({
            UserPoolId: config.userPoolId,
            Username: groupEmail,
            UserAttributes: [{ Name: 'email', Value: groupEmail }, { Name: 'email_verified', Value: 'true' }],
            MessageAction: 'SUPPRESS',
          }));
          await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: config.userPoolId, Username: groupEmail, GroupName: 'user' }));
          await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: config.userPoolId, Username: groupEmail, GroupName: selectedGroup }));
        } else {
          throw err;
        }
      }
      setSuccess(`Added ${groupEmail} to ${selectedGroup}`);
      setGroupEmail('');
      setUserSuggestions([]);
      setShowNewUserWarning(false);
      loadGroupMembers(selectedGroup);
      loadAllUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add user to group');
    }
  }

  async function handleRemoveFromGroup(email: string) {
    setError(''); setSuccess('');
    try {
      const creds = await getCredentials();
      const cognito = new CognitoIdentityProviderClient({ region: config.region, credentials: creds });
      await cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: config.userPoolId, Username: email, GroupName: selectedGroup }));
      setSuccess(`Removed ${email} from ${selectedGroup}`);
      loadGroupMembers(selectedGroup);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove user');
    }
  }

  // --- Multi-select group toggle ---
  function toggleGroup(g: string) {
    setSelectedGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }

  return (
    <div className="admin-page">
      <header className="app-header">
        <button onClick={() => navigate('/dashboard')} className="btn-secondary">← Dashboard</button>
        <h1>Admin Console</h1>
        <button onClick={logout} className="btn-secondary">Sign Out</button>
      </header>

      <div className="admin-tabs">
        <button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}>Agents</button>
        <button className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}>Access Groups</button>
      </div>

      {error && <p className="error-msg">{error}</p>}
      {success && <p className="success-msg">{success}</p>}

      {tab === 'agents' && (
        <div className="admin-section">
          <h2>{editingArn ? 'Edit Agent' : 'Register Agent'}</h2>
          <form onSubmit={handleSaveAgent} className="agent-form">
            <label>Type</label>
            <div className="radio-group">
              <label className={`radio-option ${agentType === 'agent' ? 'selected' : ''}`}>
                <input type="radio" name="type" value="agent" checked={agentType === 'agent'} onChange={() => setAgentType('agent')} />
                Agent Runtime
              </label>
              <label className={`radio-option ${agentType === 'harness' ? 'selected' : ''}`}>
                <input type="radio" name="type" value="harness" checked={agentType === 'harness'} onChange={() => setAgentType('harness')} />
                Harness
              </label>
            </div>

            <label>{agentType === 'agent' ? 'Agent Runtime ARN' : 'Harness ARN'}</label>
            <input
              value={agentArn}
              onChange={e => setAgentArn(e.target.value)}
              placeholder={agentType === 'agent' ? 'arn:aws:bedrock-agentcore:...:runtime/...' : 'arn:aws:bedrock-agentcore:...:harness/...'}
              required
              disabled={!!editingArn}
            />

            <label>Display Name</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Customer Support Agent" required maxLength={100} />

            <label>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of what this agent does..." rows={2} maxLength={500} />

            <label>Availability</label>
            <select value={availMode} onChange={e => setAvailMode(e.target.value as 'all' | 'restricted')}>
              <option value="all">Available to all users</option>
              <option value="restricted">Restricted access</option>
            </select>

            {availMode === 'restricted' && (
              <>
                <label>Allowed Emails (comma-separated)</label>
                <input value={allowedUsers} onChange={e => setAllowedUsers(e.target.value)} placeholder="alice@example.com, bob@example.com" />

                <label>Allowed Groups</label>
                <div className="multi-select">
                  {groups.length === 0 ? (
                    <p className="empty-state">No access groups created yet. Create one in the Access Groups tab.</p>
                  ) : (
                    groups.map(g => (
                      <label key={g} className={`checkbox-option ${selectedGroups.includes(g) ? 'selected' : ''}`}>
                        <input type="checkbox" checked={selectedGroups.includes(g)} onChange={() => toggleGroup(g)} />
                        {g}
                      </label>
                    ))
                  )}
                </div>
              </>
            )}

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingArn ? 'Update Agent' : 'Register Agent'}
              </button>
              {editingArn && (
                <button type="button" onClick={resetAgentForm} className="btn-secondary">Cancel</button>
              )}
            </div>
          </form>

          <h2>Registered Agents</h2>
          {loading ? <p>Loading...</p> : agents.length === 0 ? <p>No agents registered yet.</p> : (
            <table className="agent-table">
              <thead><tr><th>Type</th><th>Name</th><th>Description</th><th>ARN</th><th>Access</th><th></th></tr></thead>
              <tbody>
                {agents.map(a => (
                  <tr key={a.PK}>
                    <td><span className={`agent-type-badge badge-${a.type || 'agent'}`}>{a.type || 'agent'}</span></td>
                    <td>{a.displayName}</td>
                    <td className="desc-cell">{a.description || '—'}</td>
                    <td className="arn-cell">{a.PK}</td>
                    <td>{a.availability.mode === 'all' ? 'All users' : 'Restricted'}</td>
                    <td className="action-cell">
                      <button onClick={() => handleEditAgent(a)} className="btn-secondary btn-small">Edit</button>
                      <button onClick={() => handleDeleteAgent(a.PK)} className="btn-danger btn-small">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'groups' && (
        <div className="admin-section">
          <h2>Create Access Group</h2>
          <form onSubmit={handleCreateGroup} className="inline-form">
            <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Group name" required maxLength={128} />
            <button type="submit" className="btn-primary">Create</button>
          </form>

          <h2>Manage Group Members</h2>
          <select value={selectedGroup} onChange={e => { setSelectedGroup(e.target.value); if (e.target.value) loadGroupMembers(e.target.value); }}>
            <option value="">Select a group...</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          {selectedGroup && (
            <>
              <form onSubmit={handleAddToGroup} className="inline-form autocomplete-container">
                <div className="autocomplete-wrapper">
                  <input
                    value={groupEmail}
                    onChange={e => handleGroupEmailChange(e.target.value)}
                    type="email"
                    placeholder="User email"
                    required
                    autoComplete="off"
                  />
                  {userSuggestions.length > 0 && (
                    <ul className="autocomplete-dropdown">
                      {userSuggestions.map(s => (
                        <li key={s} onClick={() => { setGroupEmail(s); setUserSuggestions([]); setShowNewUserWarning(false); }}>{s}</li>
                      ))}
                    </ul>
                  )}
                  {showNewUserWarning && (
                    <p className="warning-msg">⚠️ This user is not in the system. Adding will create a new account.</p>
                  )}
                </div>
                <button type="submit" className="btn-primary">Add</button>
              </form>
              <ul className="member-list">
                {groupMembers.map(m => (
                  <li key={m}>{m} <button onClick={() => handleRemoveFromGroup(m)} className="btn-danger btn-small">Remove</button></li>
                ))}
                {groupMembers.length === 0 && <li className="empty-state">No members</li>}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
