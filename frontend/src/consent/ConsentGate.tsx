import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getConsent, saveConsent, CURRENT_TERMS_VERSION } from './consent';
import { createDynamoClient } from '../aws/clients';
import { RuntimeConfig } from '../config';

export function ConsentGate({ config, children }: { config: RuntimeConfig; children: React.ReactNode }) {
  const { sub, getCredentials } = useAuth();
  const [status, setStatus] = useState<'loading' | 'needed' | 'accepted' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    checkConsent();
  }, [sub]);

  async function checkConsent() {
    if (!sub) return;
    try {
      const creds = await getCredentials();
      const client = createDynamoClient(config, creds);
      const record = await getConsent(client, config.agentRegistryTable, sub);
      if (record && record.acceptedVersion === CURRENT_TERMS_VERSION) {
        setStatus('accepted');
      } else {
        setStatus('needed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check consent');
      setStatus('error');
    }
  }

  async function handleAccept() {
    if (!sub) return;
    try {
      const creds = await getCredentials();
      const client = createDynamoClient(config, creds);
      await saveConsent(client, config.agentRegistryTable, sub);
      setStatus('accepted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save consent');
      setStatus('error');
    }
  }

  if (status === 'loading') return <div className="consent-loading">Loading...</div>;
  if (status === 'error') return <div className="consent-error">Error: {error}</div>;
  if (status === 'accepted') return <>{children}</>;

  return (
    <div className="consent-screen">
      <h2>Terms of Use &amp; Privacy Notice</h2>
      <div className="consent-content">
        <h3>Terms of Use</h3>
        <p>
          By using this platform, you agree to the following terms. This platform provides access
          to AI agents powered by AWS Bedrock AgentCore. The platform is provided as-is, without
          warranties of any kind.
        </p>

        <h3>Your Responsibilities</h3>
        <p>
          You are solely responsible for all data, prompts, and information you share with the
          AI agents on this platform. You acknowledge that any content you submit to an agent
          is your responsibility. Do not share sensitive personal information, confidential
          business data, or regulated data unless you have confirmed this is appropriate for
          your use case and organizational policies.
        </p>

        <h3>Data Residency</h3>
        <p>
          All platform data, including your account information and interactions, is stored in
          the <strong>{config.region}</strong> AWS region. Data processing occurs within this region.
        </p>

        <h3>Privacy</h3>
        <p>
          This platform collects your email address for authentication purposes. Your
          interactions with agents are processed by AWS Bedrock AgentCore in the configured
          region. The platform operator may have access to usage logs. You may request
          deletion of your account by contacting the platform administrator.
        </p>

        <h3>Limitation of Liability</h3>
        <p>
          The platform operator, AWS, and the AI model providers are not liable for any
          decisions, actions, or consequences resulting from your use of this platform or
          the responses provided by AI agents. AI responses may be inaccurate or incomplete.
          Use your own judgment.
        </p>
      </div>
      <div className="consent-actions">
        <button onClick={handleAccept} className="btn-primary">
          I Accept the Terms of Use &amp; Privacy Notice
        </button>
      </div>
    </div>
  );
}
