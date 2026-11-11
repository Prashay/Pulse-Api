import { useEffect, useState } from "react";
import type { Collection } from "../types";

interface Props {
  kind: "collection" | "folder" | "environment";
  collections?: Collection[];
  onClose: () => void;
  onCreate: (name: string, collectionId: string) => void;
}

const defaultNames = {
  collection: "New Collection",
  folder: "New Folder",
  environment: "New Environment",
};

export function CreateItemModal({ kind, collections, onClose, onCreate }: Props) {
  const [name, setName] = useState(defaultNames[kind]);
  const [collectionId, setCollectionId] = useState(collections?.[0]?.id ?? "");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal create-item-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-item-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (trimmed) onCreate(trimmed, collectionId);
        }}
      >
        <h2 id="create-item-title">Create {kind}</h2>
        <label>
          Name
          <input
            className="search"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.target.select()}
            autoFocus
            required
          />
        </label>
        {collections && collections.length > 1 && (
          <label>
            Collection
            <select className="search" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>{collection.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" disabled={!name.trim()}>Create</button>
        </div>
      </form>
    </div>
  );
}
