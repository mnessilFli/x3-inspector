import { Card } from '../../components/ui';
import { FORMULA_HELP, QUERY_TOOLS, SQL_HELP, STRUCTURE, STRUCTURE_CHAIN, type DocSection } from './docContent';
import { CONCEPTS, DHM_FLOWS, DHM_RULES, DHM_SOURCE, INSPECTOR_KEYS, SHORTCUTS, SHORTCUTS_SOURCE } from './helpContent';

export type HelpSection = 'concepts' | 'structure' | 'sql' | 'formulas' | 'keys' | 'dhm';

/** HELP: X3 for Salesforce developers, X3 structure, SQL, formulas, shortcuts, DHM. In French, with Sage sources. */
export function HelpView({ section }: { section: HelpSection }) {
  if (section === 'structure') {
    return (
      <>
        <Card title="Logique X3 : de la fonction au champ">
          <pre className="code">{STRUCTURE_CHAIN}</pre>
          <p className="small muted">
            Exemple réel (X3 Cloud Pré-Prod) : Données de base &gt; Tiers &gt; Clients = fonction GESBPC, objet BPC, fenêtre OBPC, écrans BPC0 (en-tête, clé BPCNUM) et BPRBPC
            (onglet Identité). CURRENT &gt; Screen et Field affichent chacun de ces niveaux pour la page ouverte.
          </p>
        </Card>
        <Sections list={STRUCTURE} />
      </>
    );
  }
  if (section === 'sql') {
    return (
      <>
        <Card title="Tables ou objets : qui interroge quoi ?">
          <Table rows={QUERY_TOOLS} head={['Outil', 'Il interroge', 'Ce que dit la doc Sage']} />
          <p className="small muted">
            Conséquence : dans X3, le requêteur SQL lit aussi les tables spécifiques (YINDEXAPI, YLAPI...), que GraphQL ne publie pas. Sources : aide en ligne Sage GESALQ, GESALH, GESAVW.
          </p>
        </Card>
        <Sections list={SQL_HELP} />
      </>
    );
  }
  if (section === 'formulas') return <Sections list={FORMULA_HELP} />;
  if (section === 'keys') {
    return (
      <>
        <Card title="Raccourcis X3 Inspector">
          <Table rows={INSPECTOR_KEYS} head={['Raccourci', 'Action']} />
        </Card>
        <Card title="Raccourcis Sage X3 utiles en diagnostic">
          <Table rows={SHORTCUTS} head={['Raccourci', 'Action']} />
          <p className="small muted">
            Source : <a href={SHORTCUTS_SOURCE} target="_blank" rel="noreferrer">aide en ligne Sage X3 V12, liste des principaux raccourcis</a>. Principe : appuyer sur Échap, relâcher, puis la touche.
          </p>
        </Card>
      </>
    );
  }
  if (section === 'dhm') {
    return (
      <>
        <Card title="Connecteur DHM (YCAPI) : fonctionnement">
          <Table rows={DHM_FLOWS} head={['Sens', 'Ce qui se passe']} />
        </Card>
        <Card title="Règles clés de diagnostic">
          <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
            {DHM_RULES.map((r) => (
              <li key={r} style={{ marginBottom: 4 }}>
                {r}
              </li>
            ))}
          </ol>
          <p className="small muted">Source : {DHM_SOURCE}</p>
        </Card>
      </>
    );
  }
  return (
    <Card title="X3 pour un développeur Salesforce">
      <p className="small muted">Repères pour passer de Salesforce à Sage X3, et où les voir dans X3 Inspector. Ce sont des équivalences d'usage, pas des correspondances exactes.</p>
      <Table rows={CONCEPTS} head={['Salesforce', 'Sage X3', 'Dans X3 Inspector']} />
    </Card>
  );
}

function Sections({ list }: { list: DocSection[] }) {
  return (
    <>
      {list.map((s) => (
        <Card key={s.title} title={s.title}>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            {s.lines.map((l) => (
              <li key={l} style={{ marginBottom: 4 }}>
                {l}
              </li>
            ))}
          </ul>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Doc Sage :{' '}
            <a href={s.source.url} target="_blank" rel="noreferrer">
              {s.source.label}
            </a>
          </p>
        </Card>
      ))}
    </>
  );
}

function Table({ rows, head }: { rows: string[][]; head: string[] }) {
  return (
    <div className="grid-wrap">
      <table className="grid help-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? 'mono small' : 'small'}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
