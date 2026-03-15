import { useState, useEffect, useCallback } from 'react';

interface Vulnerability {
  vulnerabilityId: string;
  pkgName: string;
  installedVersion: string;
  fixedVersion: string;
  title: string;
  target: string;
}

interface ScanResult {
  status: string;
  criticalVulnerabilities?: Vulnerability[];
}

export function App() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/OWASP/NodeGoat');
  const [scanId, setScanId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setScanId(null);
    setStatus(null);
    setVulnerabilities([]);
    setError(null);
    setLoading(false);
    setRepoUrl('https://github.com/OWASP/NodeGoat');
  };

  const startScan = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setScanId(data.scanId);
      setStatus(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const pollStatus = useCallback(async () => {
    if (!scanId) return;
    try {
      const res = await fetch(`/api/scan/${scanId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ScanResult = await res.json();
      setStatus(data.status);

      if (data.status === 'Finished') {
        setVulnerabilities(data.criticalVulnerabilities ?? []);
        setLoading(false);
      } else if (data.status === 'Failed') {
        setError('Scan failed on the server.');
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [scanId]);

  useEffect(() => {
    if (!scanId || !loading) return;
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [scanId, loading, pollStatus]);

  const isPolling = loading && scanId !== null;

  return (
    <div className="app">
      <h1>Code Guardian</h1>
      <p className="subtitle">Security vulnerability scanner powered by Trivy</p>

      <div className="scan-form">
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="GitHub repository URL"
          disabled={isPolling}
        />
        {!scanId ? (
          <button
            className="btn-primary"
            onClick={startScan}
            disabled={loading || !repoUrl.trim()}
          >
            Start Scan
          </button>
        ) : (
          <button className="btn-secondary" onClick={reset}>
            Reset
          </button>
        )}
      </div>

      {status && (status === 'Queued' || status === 'Scanning') && (
        <div className={`status status-${status.toLowerCase()}`}>
          <span className="spinner" />
          {status === 'Queued' ? 'Scan queued, waiting to start...' : 'Scanning repository...'}
        </div>
      )}

      {status === 'Finished' && (
        <>
          <div className="status status-finished">Scan complete</div>
          <p className="results-count">
            {vulnerabilities.length} critical{' '}
            {vulnerabilities.length === 1 ? 'vulnerability' : 'vulnerabilities'} found
          </p>
          {vulnerabilities.length > 0 && (
            <table className="results-table">
              <thead>
                <tr>
                  <th>Vulnerability ID</th>
                  <th>Package</th>
                  <th>Installed Version</th>
                  <th>Fixed Version</th>
                  <th>Title</th>
                </tr>
              </thead>
              <tbody>
                {vulnerabilities.map((v) => (
                  <tr key={v.vulnerabilityId + v.pkgName + v.target}>
                    <td>{v.vulnerabilityId}</td>
                    <td>{v.pkgName}</td>
                    <td>{v.installedVersion}</td>
                    <td>{v.fixedVersion}</td>
                    <td>{v.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {status === 'Failed' && (
        <div className="error-message">
          Scan failed. {error && <span>{error}</span>}
        </div>
      )}

      {error && status !== 'Failed' && (
        <div className="error-message">{error}</div>
      )}
    </div>
  );
}
