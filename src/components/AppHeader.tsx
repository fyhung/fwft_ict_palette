import { BookOpen, LogOut, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { firebaseConfigured } from "../firebase/config";
import { useAppState } from "../state/AppState";

export function AppHeader() {
  const { user, authReady, authError, signIn, signOut } = useAppState();

  return (
    <>
      <header className="app-header">
        <Link className="brand" to="/teacher" aria-label="Classroom Image Board home">
          <span className="brand-mark"><BookOpen size={20} /></span>
          <span>
            <strong>Classroom</strong>
            <small>image board</small>
          </span>
        </Link>

        <div className="header-actions">
          {!firebaseConfigured && <span className="demo-pill">Prototype data</span>}
          {!authReady && <span className="demo-pill">Checking sign-in...</span>}
          {authReady && user ? (
            <>
              <button className="icon-button" aria-label="Settings">
                <Settings size={18} />
              </button>
              <div className="user-chip">
                <span className="avatar avatar-warm">{user.initials}</span>
                <span className="user-copy">
                  <strong>{user.displayName}</strong>
                  <small>Teacher</small>
                </span>
              </div>
              <button className="icon-button" onClick={() => void signOut()} aria-label="Sign out">
                <LogOut size={18} />
              </button>
            </>
          ) : authReady ? (
            <button className="button button-primary" onClick={() => void signIn()}>
              Continue with Google
            </button>
          ) : null}
        </div>
      </header>
      {authError && (
        <div className="auth-alert" role="alert">
          <strong>Google sign-in failed.</strong> {authError}
        </div>
      )}
    </>
  );
}
