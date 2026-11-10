import { useLayoutEffect, useRef, type MutableRefObject } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";

interface Props {
  value: string;
  onChange?: (value: string) => void;
  editorRef?: MutableRefObject<EditorView | null>;
  hidden?: boolean;
}

export function JsonBodyEditor({ value, onChange, editorRef, hidden }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const readOnly = !onChange;

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      extensions: [
        json(),
        foldGutter({
          markerDOM(expanded) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = expanded ? "⌄" : "›";
            button.title = expanded ? "Collapse JSON section" : "Expand JSON section";
            button.setAttribute("aria-label", button.title);
            button.setAttribute("aria-expanded", String(expanded));
            return button;
          },
        }),
        bracketMatching(),
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        EditorState.readOnly.of(readOnly),
        EditorView.contentAttributes.of({
          "aria-label": readOnly ? "JSON response body" : "JSON request body",
          spellcheck: "false",
        }),
        keymap.of([...foldKeymap, ...defaultKeymap, ...historyKeymap]),
        readOnly ? [] : [history(), placeholder('{\n  "key": "value"\n}')],
        EditorView.updateListener.of((update) => {
          if (update.docChanged && update.transactions.some((tr) => !tr.annotation(Transaction.remote))) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
      ],
    });
    viewRef.current = view;
    if (editorRef) editorRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
      if (editorRef) editorRef.current = null;
    };
  }, [editorRef, readOnly]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    const text = value.replace(/\r\n?/g, "\n");
    if (!view || view.state.doc.toString() === text) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
    });
  }, [editorRef, readOnly, value]);

  return <div className="json-body-editor" ref={hostRef} hidden={hidden} />;
}
