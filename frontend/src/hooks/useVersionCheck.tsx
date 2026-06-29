import { useState, useEffect } from 'react';

const CURRENT_VERSION = '1.0.0';
const REPO = 'sufiankaki/aura';

interface VersionInfo {
  hasUpdate: boolean;
  latestVersion: string | null;
  releaseUrl: string | null;
}

export function useVersionCheck(isAdmin: boolean): VersionInfo {
  const [info, setInfo] = useState<VersionInfo>({ hasUpdate: false, latestVersion: null, releaseUrl: null });

  useEffect(() => {
    if (!isAdmin) return;
    checkVersion();
  }, [isAdmin]);

  async function checkVersion() {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      });
      if (!res.ok) return;
      const data = await res.json();
      const tag = (data.tag_name || '').replace(/^v/, '');
      if (tag && isNewer(tag, CURRENT_VERSION)) {
        setInfo({ hasUpdate: true, latestVersion: tag, releaseUrl: data.html_url });
      }
    } catch {
      // Silent fail — non-critical
    }
  }

  return info;
}

function isNewer(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

export function VersionBanner({ info }: { info: VersionInfo }) {
  if (!info.hasUpdate) return null;
  return (
    <div className="version-banner">
      🚀 A newer version (<strong>v{info.latestVersion}</strong>) is available.{' '}
      <a href={info.releaseUrl || `https://github.com/${REPO}/releases`} target="_blank" rel="noopener noreferrer">
        View release notes & update instructions
      </a>
    </div>
  );
}
