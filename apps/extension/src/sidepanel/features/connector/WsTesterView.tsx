import {
  basicToken,
  buildSoapEnvelope,
  checkInputXml,
  inputXmlTemplate,
  parseSoapResponse,
  parseWsDescription,
  salesforceVerdict,
  soapHeaders,
  type SoapMethod,
  type SoapResult,
  type WsGroup,
} from '@x3i/x3-core';
import { useState } from 'react';
import { Button, Card, Collapsible, CopyButton, Message, Spinner } from '../../components/ui';
import { useSettings } from '../../state/SettingsContext';

const TYPE_LABEL: Record<number, string> = { 1: 'Information', 2: 'Warning', 3: 'Error', 4: 'Technical error' };

interface CallResult {
  method: SoapMethod;
  httpStatus: number;
  durationMs: number;
  raw: string;
  parsed: SoapResult;
  groups: WsGroup[];
}

function httpHint(status: number): string | null {
  if (status === 401) return 'Authentication refused: check the Basic token (it must be the full "Basic xxxx" string, as in Authentification__c.Basic_Token__c) and that the user is allowed on this endpoint.';
  if (status === 404) return 'URL not found: copy the exact endpoint from Flux_Externe__c.URL__c in Salesforce.';
  if (status >= 500) return 'Server error: read the SOAP fault below (unknown pool, unknown web service, X3 error).';
  return null;
}

/**
 * Calls an X3 SOAP web service exactly like the Salesforce connector does (same envelope, same headers),
 * and shows what Salesforce would conclude. Credentials stay in memory only, never stored.
 */
export function WsTesterView() {
  const { activeEnv } = useSettings();
  const [url, setUrl] = useState('');
  const [authMode, setAuthMode] = useState<'token' | 'login'>('token');
  const [token, setToken] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [poolAlias, setPoolAlias] = useState('');
  const [publicName, setPublicName] = useState('');
  const [codeLang, setCodeLang] = useState('FRA');
  const [inputXml, setInputXml] = useState('');
  const [busy, setBusy] = useState<SoapMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CallResult | null>(null);

  const authorization = authMode === 'token' ? token.trim() : user && password ? basicToken(user, password) : '';
  const xmlProblems = inputXml.trim() ? checkInputXml(inputXml) : [];
  const ready = /^https?:\/\//.test(url.trim()) && authorization && poolAlias.trim() && publicName.trim();

  const call = async (method: SoapMethod) => {
    setError(null);
    if (method === 'run') {
      if (activeEnv?.kind === 'PROD') {
        setError('Refused: the active environment is PROD. Running a web service creates or modifies X3 data.');
        return;
      }
      if (!window.confirm(`Run ${publicName} on ${new URL(url).host} (pool ${poolAlias})?\n\nThis REALLY executes the web service: X3 data may be created or modified (same effect as a call from Salesforce).`)) return;
    }
    const origin = new URL(url).origin;
    if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) {
      const ok = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!ok) {
        setError(`X3 Inspector needs access to ${origin} to call this URL.`);
        return;
      }
    }
    setBusy(method);
    const started = performance.now();
    try {
      const res = await fetch(url.trim(), {
        method: 'POST',
        headers: soapHeaders(authorization),
        body: buildSoapEnvelope({ method, codeLang: codeLang.trim() || 'FRA', poolAlias: poolAlias.trim(), publicName: publicName.trim(), inputXml }),
        credentials: 'omit', // only the Basic token, like Salesforce: never the browser session
      });
      const raw = await res.text();
      const parsed = parseSoapResponse(raw);
      setResult({
        method,
        httpStatus: res.status,
        durationMs: Math.round(performance.now() - started),
        raw,
        parsed,
        groups: method === 'getDescription' && parsed.resultXml ? parseWsDescription(parsed.resultXml) : [],
      });
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)} (wrong URL, VPN, certificate)`);
    } finally {
      setBusy(null);
    }
  };

  const verdict = result ? salesforceVerdict(result.parsed, result.httpStatus) : null;
  const envelopePreview = buildSoapEnvelope({ method: 'run', codeLang, poolAlias, publicName, inputXml });

  return (
    <>
      <Card title="Web service tester (like Salesforce)">
        <p className="small muted">
          Same SOAP envelope and headers as the FLI Connect package (skill connecteur-sfco-fli). Take the values from the Salesforce flow: URL = Flux_Externe__c.URL__c, pool =
          Pool_Alias__c, web service = External_Web_Service_Name__c, token = Authentification__c.Basic_Token__c. Nothing is stored.
        </p>
        <div className="info">
          <div className="k">Endpoint URL</div>
          <div className="v">
            <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://.../CAdxWebServiceXmlCC (Flux_Externe__c.URL__c)" />
          </div>
          <div className="k">Authorization</div>
          <div className="v">
            <select className="input" style={{ width: 'auto' }} value={authMode} onChange={(e) => setAuthMode(e.target.value as 'token' | 'login')}>
              <option value="token">Basic token (as in Salesforce)</option>
              <option value="login">X3 user + password</option>
            </select>
            {authMode === 'token' ? (
              <input className="input mono" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Basic dXNlcjpwYXNzd29yZA==" autoComplete="off" />
            ) : (
              <div className="inline">
                <input className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="X3 user" autoComplete="off" />
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" autoComplete="off" />
              </div>
            )}
            {authMode === 'login' && authorization && <span className="src">The Salesforce Basic_Token__c field must contain this full value (starts with "Basic ").</span>}
          </div>
          <div className="k">Pool alias</div>
          <div className="v">
            <input className="input mono" value={poolAlias} onChange={(e) => setPoolAlias(e.target.value)} placeholder="Pool_Alias__c" />
          </div>
          <div className="k">Web service</div>
          <div className="v">
            <input className="input mono" value={publicName} onChange={(e) => setPublicName(e.target.value)} placeholder="YWWS<EXT> (External_Web_Service_Name__c)" />
          </div>
          <div className="k">Language</div>
          <div className="v">
            <input className="input mono" style={{ width: 80 }} value={codeLang} onChange={(e) => setCodeLang(e.target.value)} />
            <span className="src">the SF connector always sends FRA</span>
          </div>
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <Button onClick={() => void call('getDescription')} disabled={!ready || busy !== null} title="Read only: returns the groups and fields expected by the web service">
            {busy === 'getDescription' ? <Spinner /> : 'getDescription (read only)'}
          </Button>
        </div>
      </Card>

      <Card title="inputXml (run)">
        <textarea className="mono" rows={10} style={{ width: '100%', boxSizing: 'border-box' }} value={inputXml} onChange={(e) => setInputXml(e.target.value)} spellCheck={false} placeholder={'<PARAM>\n  <GRP ID="GRP1"><FLD NAME="BPC_BPCNUM">C000123</FLD></GRP>\n</PARAM>'} />
        {xmlProblems.map((p) => (
          <Message key={p} kind="warn">
            {p}
          </Message>
        ))}
        <div className="btn-row" style={{ marginTop: 6 }}>
          <Button
            small
            disabled={!result?.groups.length}
            title="Fill the editor with the groups and fields returned by getDescription"
            onClick={() => result && setInputXml(inputXmlTemplate(result.groups))}
          >
            Template from getDescription
          </Button>
          <CopyButton label="Copy SOAP request" value={envelopePreview} />
          <Button variant="danger" onClick={() => void call('run')} disabled={!ready || !inputXml.trim() || busy !== null} title="Executes the web service for real (creation / modification in X3). Refused on a PROD environment.">
            {busy === 'run' ? <Spinner /> : 'Run (executes in X3)'}
          </Button>
        </div>
      </Card>

      {error && <Message kind="error">{error}</Message>}

      {result && verdict && (
        <Card title={`${result.method} · HTTP ${result.httpStatus} · ${result.durationMs} ms`}>
          {httpHint(result.httpStatus) && <Message kind="warn">{httpHint(result.httpStatus)}</Message>}
          {result.parsed.fault && <Message kind="error">SOAP fault: {result.parsed.fault}</Message>}
          <div className="info">
            <div className="k">X3 status</div>
            <div className="v">{result.parsed.status === 1 ? '1 (OK)' : result.parsed.status === 0 ? '0 (KO)' : 'absent'}</div>
            {result.method === 'run' && (
              <>
                <div className="k">Salesforce would show</div>
                <div className="v">
                  <b style={{ color: verdict.success ? '#2e844a' : '#ba0517' }}>{verdict.success ? 'Success' : 'Failure'}</b>
                  {verdict.shownMessage && <span> · "{verdict.shownMessage}"</span>}
                  <span className="src">{verdict.reason}</span>
                </div>
              </>
            )}
          </div>
          {result.parsed.messages.length > 0 && (
            <table className="grid" style={{ marginTop: 6 }}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>X3 message</th>
                </tr>
              </thead>
              <tbody>
                {result.parsed.messages.map((m, i) => (
                  <tr key={i}>
                    <td style={m.type === 3 || m.type === 4 ? { color: '#ba0517', fontWeight: 600 } : undefined}>{m.type !== null ? `${m.type} ${TYPE_LABEL[m.type] ?? ''}` : '?'}</td>
                    <td>{m.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.groups.length > 0 && (
            <>
              <h4 className="small" style={{ margin: '8px 0 4px' }}>Web service signature</h4>
              <table className="grid">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Kind</th>
                    <th>Fields</th>
                  </tr>
                </thead>
                <tbody>
                  {result.groups.map((g) => (
                    <tr key={g.name}>
                      <td className="mono">{g.name}</td>
                      <td>{g.kind === 'TAB' ? `TAB (dim ${g.dim ?? '?'})` : 'GRP'}</td>
                      <td className="mono small">{g.fields.map((f) => f.name).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {result.parsed.resultXml && (
            <Collapsible summary="resultXml">
              <pre className="code">{result.parsed.resultXml}</pre>
            </Collapsible>
          )}
          <Collapsible summary="Raw SOAP response">
            <pre className="code">{result.raw}</pre>
            <CopyButton label="Copy response" value={result.raw} />
          </Collapsible>
        </Card>
      )}
    </>
  );
}
