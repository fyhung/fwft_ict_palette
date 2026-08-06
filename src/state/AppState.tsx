/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { boards as seedBoards, classrooms as seedClasses, initialPosts } from "../demoData";
import { firebaseConfigured } from "../firebase/config";
import { auth } from "../firebase/client";
import { createOwnedClass, deleteEmptyOwnedClass, subscribeTeacherWorkspace, upsertUserProfile } from "../firebase/workspace";
import type { BoardPost, BoardSummary, Classroom, DemoUser } from "../types";

interface NewPostInput {
  boardId: string;
  sectionId: string;
  caption: string;
  imageUrl?: string;
}

interface AppStateValue {
  user: DemoUser | null;
  authReady: boolean;
  authError: string | null;
  dataLoading: boolean;
  dataError: string | null;
  classes: Classroom[];
  boards: BoardSummary[];
  posts: BoardPost[];
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string>;
  createClass: (input: { name: string; description: string }) => Promise<string>;
  deleteClass: (classId: string) => Promise<void>;
  toggleBoardSetting: (
    boardId: string,
    setting: "allowPosting" | "allowComments",
  ) => void;
  addPost: (input: NewPostInput) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const teacher: DemoUser = {
  uid: "demo-teacher",
  displayName: "Ms. Chan",
  email: "teacher@school.edu.hk",
  initials: "MC",
};

function initialsFor(user: User) {
  const source = user.displayName || user.email || "User";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function toAppUser(user: User): DemoUser {
  return {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Google user",
    email: user.email || "",
    initials: initialsFor(user),
    photoURL: user.photoURL || undefined,
  };
}

function describeAuthError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";

  switch (code) {
    case "auth/unauthorized-domain":
      return "This address is not authorized. Add 127.0.0.1 and localhost in Firebase Authentication → Settings → Authorized domains.";
    case "auth/operation-not-allowed":
      return "Google Sign-In is disabled. Enable Google in Firebase Authentication → Sign-in method.";
    case "auth/popup-blocked":
      return "The browser blocked the Google sign-in window. Allow pop-ups for this page and try again.";
    case "auth/popup-closed-by-user":
      return "The Google sign-in window was closed before sign-in finished.";
    case "auth/network-request-failed":
      return "Firebase could not reach Google. Check the network connection and try again.";
    default:
      return error instanceof Error ? error.message : "Google sign-in failed.";
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(
    firebaseConfigured ? null : teacher,
  );
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(firebaseConfigured);
  const [dataError, setDataError] = useState<string | null>(null);
  const [classes, setClasses] = useState(firebaseConfigured ? [] : seedClasses);
  const [boards, setBoards] = useState(firebaseConfigured ? [] : seedBoards);
  const [posts, setPosts] = useState(firebaseConfigured ? [] : initialPosts);

  useEffect(() => {
    if (!auth) return;

    let stopWorkspace: () => void = () => {};
    const stopAuth = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        stopWorkspace();
        setUser(firebaseUser ? toAppUser(firebaseUser) : null);
        setAuthReady(true);
        if (firebaseUser) setAuthError(null);
        if (!firebaseUser) {
          setClasses([]);
          setBoards([]);
          setPosts([]);
          setDataLoading(false);
          setDataError(null);
          return;
        }

        setDataLoading(true);
        void upsertUserProfile(firebaseUser).catch((error) => {
          setDataError(error instanceof Error ? error.message : "PROFILE_SAVE_FAILED");
        });
        stopWorkspace = subscribeTeacherWorkspace(
          firebaseUser.uid,
          (nextClasses, nextBoards) => {
            setClasses(nextClasses);
            setBoards(nextBoards);
            setDataLoading(false);
            setDataError(null);
          },
          (error) => {
            setDataLoading(false);
            setDataError(error.message);
          },
        );
      },
      (error) => {
        setAuthReady(true);
        setAuthError(error.message);
      },
    );

    return () => {
      stopWorkspace();
      stopAuth();
    };
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      user,
      authReady,
      authError,
      dataLoading,
      dataError,
      classes,
      boards,
      posts,
      signIn: async () => {
        setAuthError(null);
        if (!auth) {
          setUser(teacher);
          return;
        }

        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: "select_account" });
          await signInWithPopup(auth, provider);
        } catch (error) {
          setAuthError(describeAuthError(error));
        }
      },
      signOut: async () => {
        setAuthError(null);
        if (!auth) {
          setUser(null);
          return;
        }

        try {
          await firebaseSignOut(auth);
        } catch (error) {
          setAuthError(describeAuthError(error));
        }
      },
      getIdToken: async () => {
        if (!auth?.currentUser) throw new Error("AUTH_REQUIRED");
        return auth.currentUser.getIdToken();
      },
      createClass: async (input) => {
        if (!user) throw new Error("AUTH_REQUIRED");
        setDataError(null);
        const classId = await createOwnedClass(user, input);
        setClasses((current) => current.some((item) => item.id === classId) ? current : [
          ...current,
          {
            id: classId,
            name: input.name,
            description: input.description,
            role: "owner",
            boardCount: 0,
            postCount: 0,
            accent: ["copper", "moss", "ink"][current.length % 3],
          },
        ]);
        return classId;
      },
      deleteClass: async (classId) => {
        setDataError(null);
        await deleteEmptyOwnedClass(classId);
        setClasses((current) => current.filter((item) => item.id !== classId));
        setBoards((current) => current.filter((item) => item.classId !== classId));
      },
      toggleBoardSetting: (boardId, setting) => {
        setBoards((current) =>
          current.map((board) =>
            board.id === boardId
              ? { ...board, [setting]: !board[setting] }
              : board,
          ),
        );
      },
      addPost: ({ boardId, sectionId, caption, imageUrl }) => {
        const id = `demo-${crypto.randomUUID()}`;
        setPosts((current) => [
          ...current,
          {
            id,
            boardId,
            sectionId,
            authorUid: user?.uid ?? "demo-student",
            authorName: user?.displayName ?? "Student",
            authorInitials: user?.initials ?? "ST",
            caption,
            imageUrl,
            visual: "visual-upload",
            createdLabel: "Just now",
            commentCount: 0,
          },
        ]);
      },
    }),
    [authError, authReady, boards, classes, dataError, dataLoading, posts, user],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error("useAppState must be used inside AppStateProvider");
  return context;
}
