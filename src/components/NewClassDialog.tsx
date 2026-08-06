import { type FormEvent, useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "../state/AppState";

export function NewClassDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { createClass } = useAppState();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const classId = await createClass({ name: name.trim(), description: description.trim() });
      setName("");
      setDescription("");
      onClose();
      navigate(`/c/${classId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the class.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="new-class-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div><p className="eyebrow">Teaching space</p><h2 id="new-class-title">Create a class</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Class name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="4A Physics" required autoFocus />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} placeholder="Experiments, observations and evidence" />
            <small>{description.length}/240</small>
          </label>
          {error && <div className="probe-error" role="alert"><strong>Could not create class.</strong> {error}</div>}
          <div className="dialog-actions">
            <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Creating..." : "Create class"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
