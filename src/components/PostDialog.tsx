import { ImagePlus, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useAppState } from "../state/AppState";

interface PostDialogProps {
  boardId: string;
  initialSectionId?: string;
  open: boolean;
  onClose: () => void;
}

export function PostDialog({ boardId, initialSectionId, open, onClose }: PostDialogProps) {
  const { addPost, sections } = useAppState();
  const availableSections = sections.filter((section) => section.boardId === boardId).sort((a, b) => a.sortOrder - b.sortOrder);
  const [caption, setCaption] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [stage, setStage] = useState<"idle" | "posting">("idle");
  const [error, setError] = useState<string>();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (open && initialSectionId && availableSections.some((section) => section.id === initialSectionId)) {
      setSectionId(initialSectionId);
      return;
    }
    if (!availableSections.some((section) => section.id === sectionId)) {
      setSectionId(availableSections[0]?.id || "");
    }
  }, [availableSections, initialSectionId, open, sectionId]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!caption.trim() || !file || !sectionId || stage === "posting") return;
    setStage("posting");
    setError(undefined);
    try {
      await addPost({ boardId, sectionId, caption: caption.trim(), file });
      setCaption("");
      setFile(undefined);
      setPreview(undefined);
      onClose();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "POST_UPLOAD_FAILED";
      const messages: Record<string, string> = {
        AUTH_REQUIRED: "Sign in with Google and try again.",
        IMAGE_TYPE_UNSUPPORTED: "Choose a JPEG, PNG or WebP image.",
        IMAGE_SOURCE_TOO_LARGE: "Choose an image smaller than 10 MB.",
        IMAGE_MAIN_TOO_LARGE: "This image could not be compressed enough. Try a smaller image.",
        INVALID_ACTION: "The Apps Script deployment needs to be updated before posting photos.",
        POSTING_CLOSED: "Posting is closed for this board.",
      };
      setError(messages[code] || code);
    } finally {
      setStage("idle");
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">New submission</p>
            <h2 id="post-dialog-title">Add a photo</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <label className={`image-drop ${preview ? "has-preview" : ""}`}>
            {preview ? (
              <img src={preview} alt="Selected upload preview" />
            ) : (
              <>
                <span className="upload-icon"><ImagePlus size={26} /></span>
                <strong>Choose or take a photo</strong>
                <small>JPEG, PNG or WebP · up to 10 MB</small>
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={(event) => {
                const nextFile = event.target.files?.[0];
                if (!nextFile) return;
                setFile(nextFile);
                setPreview(URL.createObjectURL(nextFile));
                setError(undefined);
              }}
            />
          </label>
          <label className="field">
            <span>Caption</span>
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={500}
              placeholder="What force can we see here?"
              required
            />
            <small>{caption.length}/500</small>
          </label>
          <label className="field">
            <span>Section</span>
            <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
              {availableSections.map((section) => (
                <option key={section.id} value={section.id}>{section.title}</option>
              ))}
            </select>
          </label>
          {error && <div className="probe-error" role="alert"><strong>Could not post photo.</strong> {error}</div>}
          <div className="dialog-actions">
            <button className="button button-quiet" type="button" onClick={onClose} disabled={stage === "posting"}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={stage === "posting"}>
              {stage === "posting" ? "Compressing and uploading..." : "Post photo"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
