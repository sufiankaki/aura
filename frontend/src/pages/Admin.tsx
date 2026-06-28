import { useState, useEffect } from 'react';
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
} from '@aws-sdk/client-cognito-identity-provider';
import { useAuth } from '../auth/AuthContext';
import { createDynamoClient } from '../aws/clients';
import { RuntimeConfig } from '../config';

interface Agent {
  PK: string;
  displayName: string;
  availability: {
    mode: 'all' | 'restricted';
    allowedUsers?: string[];
    allowedGroups?: string[];
  };
}

export function Admin({ config }: { config: RuntimeConfig }) {
  const { getCredentials, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'agents' | 'groups'>('agents');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Agent form
  const [agentArn, setAgentArn] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [availMode, setAvailMode] = useState<'all' | 'restricted'>('all');
  const [allowedUsers, setAllowedUsers] = useState('');
  const [allowedGroups, setAllowedGroups] = useState('');

  // Group form
  const [groupName, setGroupName] = useState('');
  const [groupEmail, setGroupEmail] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);

  useEffect(() => { loadAgents(); loadGroups(); }, []);

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
      const allGroups = (result.Groups ?? []).map(g => g.GroupName!).filter((g): g is string => g !== 'admin' && g !== 'user');
      setGroups(allGroups);
    } catch {
      // non-critical
    }
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

  async function handleRegisterAgent(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!agentArn.startsWith('arn:')) { setError('Agent ARN must start with arn:'); return; }
    if (!displayName || displayName.length > 100) { setError('Display name must be 1-100 characters'); return; }

    try {
      const creds = await getCredentials();
      const client = createDynamoClient(config, creds);
      const item: Agent = {
        PK: agentArn,
        displayName,
        availability: availMode === 'all' ? { mode: 'all' } : {
          mode: 'restricted',
          ...(allowedUsers.trim() && { allowedUsers: allowedUsers.split(',').map(s => s.trim()).filter(Boolean) }),
          ...(allowedGroups.trim() && { allowedGroups: allowedGroups.split(',').map(s => s.trim()).filter(Boolean) }),
        },
      };
      await client.send(new PutCommand({ TableName: config.agentRegistryTable, Item: item }));
      setSuccess('Agent registered successfully');
      setAgentArn(''); setDisplayName(''); setAllowedUsers(''); setAllowedGroups('');
      loadAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to register agent');
    }
  }

  async function handleDeleteAgent(arn: string) {
    setError(''); setSuccess('');
    try {
      const creds = await getCredentials();
      const client = createDynamoClient(config, creds);
      await client.send(new DeleteCommand({ TableName: config.agentRegistryTable, Key: { PK: arn } }));
      setSuccess('Agent removed');
      loadAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete agent');
    }
  }

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

  async function handleAddToGroup(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!selectedGroup || !groupEmail) return;
    try {
      const creds = await getCredentials();
      const cognito = new CognitoIdentityProviderClient({ region: config.region, credentials: creds });
      // Try to add existing user; if user doesn't exist, create them
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
      loadGroupMembers(selectedGroup);
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
          <h2>Register Agent</h2>
          <form onSubmit={handleRegisterAgent}>
            <input value={agentArn} onChange={e => setAgentArn(e.target.value)} placeholder="Agent ARN (arn:aws:bedrock-agentcore:...)" required />
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display Name" required maxLength={100} />
            <select value={availMode} onChange={e => setAvailMode(e.target.value as 'all' | 'restricted')}>
              <option value="all">Available to all users</option>
              <option value="restricted">Restricted access</option>
            </select>
            {availMode === 'restricted' && (
              <>
                <input value={allowedUsers} onChange={e => setAllowedUsers(e.target.value)} placeholder="Allowed emails (comma-separated)" />
                <input value={allowedGroups} onChange={e => setAllowedGroups(e.target.value)} placeholder="Allowed groups (comma-separated)" />
              </>
            )}
            <button type="submit" className="btn-primary">Register Agent</button>
          </form>

          <h2>Registered Agents</h2>
          {loading ? <p>Loading...</p> : agents.length === 0 ? <p>No agents registered yet.</p> : (
            <table className="agent-table">
              <thead><tr><th>Name</th><th>ARN</th><th>Access</th><th></th></tr></thead>
              <tbody>
                {agents.map(a => (
                  <tr key={a.PK}>
                    <td>{a.displayName}</td>
                    <td className="arn-cell">{a.PK}</td>
                    <td>{a.availability.mode === 'all' ? 'All users' : 'Restricted'}</td>
                    <td><button onClick={() => handleDeleteAgent(a.PK)} className="btn-danger">Remove</button></td>
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
          <select value={selectedGroup} onChange={e => { setSelectedGroup(e.target.value); loadGroupMembers(e.target.value); }}>
            <option value="">Select a group...</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          {selectedGroup && (
            <>
              <form onSubmit={handleAddToGroup} className="inline-form">
                <input value={groupEmail} onChange={e => setGroupEmail(e.target.value)} type="email" placeholder="User email" required />
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
