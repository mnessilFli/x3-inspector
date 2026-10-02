import type { Sourced } from './provenance';

/** Raw signal found on the page (for debug and calibration). */
export interface PageSignal {
  ruleId: string;
  /** Status of the rule that produced the signal. */
  status?: 'hypothesis' | 'verified';
  target: 'url' | 'title' | 'dom';
  matched: string;
  groups: Record<string, string>;
}

/** What the content script could detect about the current X3 page. */
export interface X3PageContext {
  url: string;
  title: string;
  detectedAt: string;
  isX3: Sourced<boolean>;
  /** Endpoint dataset from the URL (/trans/x3/erp/<DATASET>/). Not always the server folder. */
  dataset: Sourced<string>;
  folder: Sourced<string>;
  functionCode: Sourced<string>;
  object: Sourced<string>;
  window: Sourced<string>;
  screen: Sourced<string>;
  /** Syracuse session information read from the page (endpoint, role, language, screen title). */
  session?: PageSessionInfo;
  /** Signature used to detect function / tab changes. */
  signature: string;
  signals: PageSignal[];
}

export interface PageSessionInfo {
  endpoint: Sourced<string>;
  role: Sourced<string>;
  locale: Sourced<string>;
  screenTitle: Sourced<string>;
}

/** What the Syracuse UI says about a field, independently of metadata. */
export interface FieldUiHints {
  mandatory: Sourced<boolean>;
  /** Syracuse field type, e.g. x-string, x-reference. */
  uiType: Sourced<string>;
  maxLength: Sourced<number>;
}

export interface DomNodeSnapshot {
  tag: string;
  attributes: Record<string, string>;
  /** Own short text (trimmed, truncated). */
  text?: string;
}

export interface DomSnapshot {
  element: DomNodeSnapshot;
  /** Closest parent first. */
  parents: DomNodeSnapshot[];
  cssPath: string;
  frameUrl: string;
  isTopFrame: boolean;
}

export interface FieldNameCandidate {
  name: string;
  /** Where the token was found, e.g. "element@id" or "parent[2]@data-field". */
  origin: string;
  /** Higher is better. Purely heuristic, only used for ordering. */
  score: number;
}

/** Field identified from the Syracuse messages (screen description + field focus). */
export interface SyracuseFieldInfo {
  /** Internal Syracuse id of the field in its window, e.g. AA4. */
  xid: string;
  /** Window letter in the session (B) and window code (OBPC) when known. */
  win: string;
  window: string | null;
  /** "<SCREEN>_<FIELD>" sent by Syracuse, e.g. BPC0_BPCNUM. */
  x3Name: string;
  screen: string | null;
  field: string | null;
  label: string | null;
  type: string | null;
  localMenu: number | null;
  maxLength: number | null;
  format: string | null;
  /** X3 object of the window ($prototype.$object). */
  object: string | null;
  /** The field is (part of) the record key of the window ($prototype.$key). */
  isKey: boolean;
  /** focus: Syracuse said the cursor entered this field (EXACT). clues: label/type/length match (INFERRED). */
  how: 'focus' | 'clues';
  /** Other fields matching the same clues (ambiguity), as x3Name. */
  alternatives: string[];
}

/** Result of clicking an element in Inspect mode, before metadata enrichment. */
export interface FieldInspection {
  id: string;
  inspectedAt: string;
  label: Sourced<string>;
  displayedValue: Sourced<string>;
  candidates: FieldNameCandidate[];
  uiHints?: FieldUiHints;
  syracuse?: SyracuseFieldInfo;
  /** Content of the X3 "field properties" window (Esc + F6), when the user opened it for this field. */
  x3Properties?: { title: string; entries: Array<{ key: string; value: string }> };
  /** Produced by following the X3 cursor (not by an Inspect click): the panel does not switch tabs. */
  auto?: boolean;
  dom: DomSnapshot;
}
