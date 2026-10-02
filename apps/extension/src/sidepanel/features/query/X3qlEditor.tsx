import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { sql, StandardSQL } from '@codemirror/lang-sql';
import { EditorState } from '@codemirror/state';
import { drawSelection, EditorView, hoverTooltip, keymap, placeholder } from '@codemirror/view';
import { x3qlHover, x3qlSuggestions, type GqlSchemaIndex } from '@x3i/x3-core';
import { useEffect, useRef } from 'react';

export interface EditorApi {
  /** Replaces [from, to) with text and moves the cursor after it. */
  replace(from: number, to: number, text: string): void;
  focus(): void;
}

interface Props {
  value: string;
  onChange: (value: string, cursor: number) => void;
  onCursor: (cursor: number) => void;
  onRun: () => void;
  /** Ctrl+Space: insert every current suggestion (Salesforce Inspector behaviour). */
  onInsertAll: () => void;
  getIndex: () => GqlSchemaIndex | null;
  onReady: (api: EditorApi) => void;
}

/** CodeMirror editor for X3QL. Suggestions are rendered by the parent as clickable chips. */
export function X3qlEditor({ value, onChange, onCursor, onRun, onInsertAll, getIndex, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onCursor, onRun, onInsertAll, getIndex });
  cb.current = { onChange, onCursor, onRun, onInsertAll, getIndex };

  useEffect(() => {
    if (!host.current) return;
    const hover = hoverTooltip((v, pos) => {
      const index = cb.current.getIndex();
      const h = index ? x3qlHover(v.state.doc.toString(), pos, index) : null;
      if (!h) return null;
      return {
        pos,
        create: () => {
          const dom = document.createElement('div');
          dom.className = 'cm-x3-hover';
          const t = document.createElement('div');
          t.style.fontWeight = '600';
          t.textContent = h.title;
          const d = document.createElement('div');
          d.textContent = h.detail;
          dom.append(t, d);
          return { dom };
        },
      };
    });
    // Drop-down while typing: keywords for the position, then objects or fields matching the letters.
    const source = (c: CompletionContext): CompletionResult | null => {
      const index = cb.current.getIndex();
      const word = c.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
      if (!c.explicit && !word) return null;
      const text = c.state.doc.toString();
      const s = index ? x3qlSuggestions(text, c.pos, index) : null;
      if (!s) return null;
      const options = [
        ...s.keywords.map((k) => ({ label: k.insert, type: 'keyword', detail: k.detail, boost: 2 })),
        ...s.items.slice(0, 200).map((i) => ({ label: i.insert, type: s.kind === 'objects' ? 'class' : 'property', detail: i.detail })),
      ];
      return options.length ? { from: s.from, options, validFor: /^[A-Za-z0-9_]*$/ } : null;
    };
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          bracketMatching(),
          closeBrackets(),
          sql({ dialect: StandardSQL, upperCaseKeywords: true }),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          hover,
          autocompletion({ override: [source], defaultKeymap: false, icons: false }),
          placeholder('SELECT code, companyName1 FROM customer LIMIT 10'),
          keymap.of([
            { key: 'Mod-Enter', run: () => (cb.current.onRun(), true) },
            { key: 'Ctrl-Space', run: () => (cb.current.onInsertAll(), true) },
            ...completionKeymap.filter((k) => k.key !== 'Ctrl-Space'),
            ...closeBracketsKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            const cursor = u.state.selection.main.head;
            if (u.docChanged) cb.current.onChange(u.state.doc.toString(), cursor);
            else if (u.selectionSet) cb.current.onCursor(cursor);
          }),
        ],
      }),
    });
    view.current = v;
    onReady({
      replace: (from, to, text) => {
        v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
        v.focus();
      },
      focus: () => v.focus(),
    });
    return () => {
      v.destroy();
      view.current = null;
    };
    // created once: external value changes are dispatched below
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, selection: { anchor: value.length } });
    }
  }, [value]);

  return <div className="editor" ref={host} />;
}
