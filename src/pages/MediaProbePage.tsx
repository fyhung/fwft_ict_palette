import { CheckCircle2, FlaskConical, ImagePlus, Trash2 } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  deleteProbe,
  driveMediaUrl,
  probeAppsScriptHealth,
  type ProbeUploadResult,
  uploadProbe,
} from "../services/appsScriptApi";
import { processImage } from "../services/imageProcessor";
import { useAppState } from "../state/AppState";

type ProbeStage = "idle" | "processing" | "uploading" | "uploaded" | "deleting" | "deleted";

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const friendly: Record<string, string> = {
    AUTH_REQUIRED: "Sign in with Google before testing an upload.",
    AUTH_INVALID: "Apps Script rejected the Firebase login token.",
    FILE_TOO_LARGE: "The processed image is still too large for the media service.",
    INVALID_MIME: "The media service rejected this image format.",
    IMAGE_TYPE_UNSUPPORTED: "Choose a JPEG, PNG or WebP image.",
    IMAGE_SOURCE_TOO_LARGE: "Choose an image smaller than 10 MB.",
    APPS_SCRIPT_NOT_CONFIGURED: "The Apps Script deployment URL is missing.",
  };
  return friendly[message] || message;
}

export function MediaProbePage() {
  const { user, signIn, getIdToken } = useAppState();
  const [health, setHealth] = useState("Checking Apps Script...");
  const [file, setFile] = useState<File>();
  const [sourcePreview, setSourcePreview] = useState<string>();
  const [stage, setStage] = useState<ProbeStage>("idle");
  const [result, setResult] = useState<ProbeUploadResult>();
  const [error, setError] = useState<string>();
  const [driveImageStatus, setDriveImageStatus] = useState<"waiting" | "loaded" | "blocked">("waiting");

  useEffect(() => {
    void probeAppsScriptHealth()
      .then((value) => setHealth(`Connected · ${value.version}`))
      .catch((reason) => setHealth(`Connection failed · ${errorMessage(reason)}`));
  }, []);

  useEffect(() => () => {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
  }, [sourcePreview]);

  const uploadedPreview = useMemo(
    () => result ? driveMediaUrl(result.thumbnail) : undefined,
    [result],
  );

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setFile(nextFile);
    setSourcePreview(URL.createObjectURL(nextFile));
    setResult(undefined);
    setDriveImageStatus("waiting");
    setStage("idle");
    setError(undefined);
  };

  const runUpload = async () => {
    if (!file) return;
    setError(undefined);
    try {
      setStage("processing");
      const processed = await processImage(file);
      const idToken = await getIdToken();
      setStage("uploading");
      const upload = await uploadProbe(idToken, processed.main, processed.thumbnail);
      setResult(upload);
      setDriveImageStatus("waiting");
      setStage("uploaded");
    } catch (reason) {
      setStage("idle");
      setError(errorMessage(reason));
    }
  };

  const cleanUp = async () => {
    if (!result) return;
    setError(undefined);
    try {
      setStage("deleting");
      const idToken = await getIdToken();
      await deleteProbe(idToken, result.operationId, [
        result.main.fileId,
        result.thumbnail.fileId,
      ]);
      setStage("deleted");
    } catch (reason) {
      setStage("uploaded");
      setError(errorMessage(reason));
    }
  };

  return (
    <main className="setup-page page-shell">
      <section className="setup-card">
        <p className="eyebrow"><FlaskConical size={16} /> Required feasibility check</p>
        <h1>Test Google Drive media</h1>
        <p>This temporary tool uploads one optimized image and thumbnail, displays the Drive copy, then safely trashes both test files.</p>
        <div className="probe-health"><CheckCircle2 size={18} /> {health}</div>

        {!user ? (
          <button className="button button-primary" onClick={() => void signIn()}>
            Continue with Google
          </button>
        ) : (
          <>
            <label className={`image-drop probe-picker ${sourcePreview ? "has-preview" : ""}`}>
              {sourcePreview ? (
                <img src={sourcePreview} alt="Selected test image" />
              ) : (
                <>
                  <span className="upload-icon"><ImagePlus size={26} /></span>
                  <strong>Choose a harmless test image</strong>
                  <small>JPEG, PNG or WebP · up to 10 MB</small>
                </>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} />
            </label>

            <div className="dialog-actions probe-actions">
              <button
                className="button button-primary"
                disabled={!file || !["idle", "deleted"].includes(stage)}
                onClick={() => void runUpload()}
              >
                {stage === "processing" ? "Compressing..." : stage === "uploading" ? "Uploading..." : "Upload test image"}
              </button>
              {result && stage !== "deleted" && (
                <button className="button button-secondary" disabled={stage === "deleting"} onClick={() => void cleanUp()}>
                  <Trash2 size={17} /> {stage === "deleting" ? "Deleting..." : "Delete test files"}
                </button>
              )}
            </div>

            {error && <div className="probe-error" role="alert"><strong>Test failed.</strong> {error}</div>}

            {result && stage !== "deleted" && (
              <div className="probe-result">
                <div>
                  <p className="eyebrow">Drive thumbnail result</p>
                  <img
                    src={uploadedPreview}
                    alt="Thumbnail loaded back from Google Drive"
                    onLoad={() => setDriveImageStatus("loaded")}
                    onError={() => setDriveImageStatus("blocked")}
                  />
                  {driveImageStatus === "loaded" && <small className="probe-image-note success">Drive image is readable.</small>}
                  {driveImageStatus === "blocked" && (
                    <small className="probe-image-note blocked">
                      Drive blocked this image. The media folder needs a viewer-sharing policy that works for every student browser.
                    </small>
                  )}
                </div>
                <dl>
                  <div><dt>Operation</dt><dd>{result.operationId}</dd></div>
                  <div><dt>Main image</dt><dd>{Math.round(result.main.size / 1024)} KB</dd></div>
                  <div><dt>Thumbnail</dt><dd>{Math.round(result.thumbnail.size / 1024)} KB</dd></div>
                </dl>
              </div>
            )}

            {stage === "deleted" && (
              <div className="probe-success" role="status">
                <CheckCircle2 size={20} /> Upload, display response and ownership-checked deletion all passed.
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
