import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { keywordCompletionSource, MSSQL, PLSQL, sql, StandardSQL, type SQLDialect } from '@codemirror/lang-sql';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder } from '@codemirror/view';
import type { SqlDialect } from '@x3i/x3-core';
import { useEffect, useRef } from 'react';
import { x3CompletionSource, x3Hover, type EditorDeps } from './editorSupport';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  deps: EditorDeps;
  /** Dialect known from the companion status; undefined = generic SQL highlighting. */
  dbDialect: SqlDialect | undefined;
}

function cmDialect(d: SqlDialect | undefined): SQLDialect {
  return d === 'oracle' ? PLSQL : d === 'mssql' ? MSSQL : StandardSQL;
}

/**
 * Language + completion for a dialect. "override" replaces the language's own sources, so SQL
 * keywords are added back explicitly next to the metadata source.
 */
function dialectExtensions(d: SqlDialect | undefined, deps: () => EditorDeps): Extension {
  const dialect = cmDialect(d);
  return [sql({ dialect, upperCaseKeywords: true }), autocompletion({ override: [x3CompletionSource(deps), keywordCompletionSource(dialect, true)] })];
}

/** CodeMirror 6 SQL editor. The view is created once; value / dialect updates go through transactions. */
export function SqlEditor({ value, onChange, onRun, deps, dbDialect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const depsRef = useRef(deps);
  const runRef = useRef(onRun);
  const changeRef = useRef(onChange);
  const dialectComp = useRef(new Compartment());
  depsRef.current = deps;
  runRef.current = onRun;
  changeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          closeBrackets(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          dialectComp.current.of(dialectExtensions(dbDialect, () => depsRef.current)),
          x3Hover(() => depsRef.current),
          placeholder('SELECT * FROM BPCUSTOMER WHERE ...  (Ctrl+Enter to run, Ctrl+Space to complete)'),
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                runRef.current();
                return true;
              },
            },
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // created once on purpose: value and dialect changes are dispatched by the effects below
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: dialectComp.current.reconfigure(dialectExtensions(dbDialect, () => depsRef.current)) });
  }, [dbDialect]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className="editor" ref={host} />;
}
