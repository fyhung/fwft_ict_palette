/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type ReactNode,
  useCallback,
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
import { boards as seedBoards, classrooms as seedClasses, initialPosts, sections as seedSections } from "../demoData";
import { firebaseConfigured } from "../firebase/config";
import { auth } from "../firebase/client";
import {
  createBoardComment,
  createBoardSection,
  createOwnedClass,
  createBoardPost,
  createClassBoard,
  deleteBoardCommentData,
  deleteBoardData,
  deleteBoardPostData,
  deleteBoardSection,
  deleteEmptyManagedClass,
  listStaffCandidates,
  loadClassWorkspace,
  loadBoardPreviewImages as loadBoardPreviewImagesFromFirestore,
  reservePostId,
  reserveCommentId,
  renameBoardSection,
  reorderBoardSections,
  setTeacherApproval,
  subscribeApplicationRole,
  subscribeBoardPosts,
  subscribeBoardComments,
  subscribeTeacherWorkspace,
  upsertUserProfile,
  updateBoardComment,
  updateBoardPost,
  updateBoardSettings,
} from "../firebase/workspace";
import { deleteBoardFiles, deleteCommentFiles, deletePostFiles, deletePostTreeFiles, driveMediaUrl, uploadCommentImage, uploadPostImage } from "../services/appsScriptApi";
import { processImage, type ProcessedImage } from "../services/imageProcessor";
import type { AppRole, BoardComment, BoardPost, BoardSection, BoardSummary, Classroom, DemoUser, PostDisplayColumns, StaffCandidate, ThumbnailMode } from "../types";

interface NewPostInput {
  boardId: string;
  sectionId: string;
  caption: string;
  file: File;
  processed?: ProcessedImage;
  onStage?: (stage: "preparing" | "uploading" | "saving") => void;
}

interface AppStateValue {
  user: DemoUser | null;
  authReady: boolean;
  authError: string | null;
  dataLoading: boolean;
  dataError: string | null;
  appRole: AppRole | null;
  canCreateClass: boolean;
  classes: Classroom[];
  boards: BoardSummary[];
  sections: BoardSection[];
  posts: BoardPost[];
  comments: BoardComment[];
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string>;
  createClass: (input: { name: string; description: string }) => Promise<string>;
  createBoard: (classId: string, input: { title: string; description: string }) => Promise<string>;
  deleteClass: (classId: string) => Promise<void>;
  ensureClassLoaded: (classId: string) => Promise<void>;
  loadBoardPreviewImages: (boardId: string) => Promise<string[]>;
  loadStaffCandidates: () => Promise<StaffCandidate[]>;
  setTeacherApproved: (candidate: StaffCandidate, approved: boolean) => Promise<void>;
  toggleBoardSetting: (
    boardId: string,
    setting: "allowPosting" | "allowComments",
  ) => Promise<void>;
  updateBoard: (boardId: string, input: { title: string; description: string }) => Promise<void>;
  updateBoardDisplay: (boardId: string, input: { postColumns?: PostDisplayColumns; thumbnailMode?: ThumbnailMode }) => Promise<void>;
  deleteBoard: (boardId: string) => Promise<void>;
  addSection: (boardId: string, title: string) => Promise<void>;
  renameSection: (sectionId: string, title: string) => Promise<void>;
  deleteSection: (sectionId: string) => Promise<void>;
  moveSection: (sectionId: string, direction: -1 | 1) => Promise<void>;
  addPost: (input: NewPostInput) => Promise<void>;
  updatePost: (postId: string, input: { caption: string; sectionId: string }) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  watchBoardPosts: (classId: string, boardId: string) => () => void;
  watchBoardComments: (classId: string, boardId: string) => () => void;
  addComment: (boardId: string, postId: string, text: string, file?: File, processed?: ProcessedImage, onStage?: (stage: "preparing" | "uploading" | "saving") => void) => Promise<void>;
  updateComment: (commentId: string, text: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const teacher: DemoUser = {
  uid: "demo-teacher",
  displayName: "Ms. Chan",
  email: "teacher@school.edu.hk",
  initials: "MC",
};

const AUTH_INITIALIZATION_TIMEOUT_MS = 10_000;

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
  const [appRole, setAppRole] = useState<AppRole | null>(firebaseConfigured ? null : "owner");
  const [classes, setClasses] = useState(firebaseConfigured ? [] : seedClasses);
  const [boards, setBoards] = useState(firebaseConfigured ? [] : seedBoards);
  const [sections, setSections] = useState(firebaseConfigured ? [] : seedSections);
  const [posts, setPosts] = useState(firebaseConfigured ? [] : initialPosts);
  const [comments, setComments] = useState<BoardComment[]>([]);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      setDataLoading(false);
      setAuthError("Firebase Authentication could not start. Check the deployed Firebase configuration.");
      return;
    }

    let stopWorkspace: () => void = () => {};
    let stopRole: () => void = () => {};
    let authSettled = false;
    const authTimeout = window.setTimeout(() => {
      if (authSettled) return;
      setAuthReady(true);
      setDataLoading(false);
      setAuthError("Firebase took too long to check sign-in. Refresh the page or select Continue with Google.");
    }, AUTH_INITIALIZATION_TIMEOUT_MS);

    const finishAuthCheck = () => {
      authSettled = true;
      window.clearTimeout(authTimeout);
    };

    const stopAuth = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        finishAuthCheck();
        stopWorkspace();
        stopRole();
        const appUser = firebaseUser ? toAppUser(firebaseUser) : null;
        setUser(appUser);
        setAuthReady(true);
        setAuthError(null);
        if (!firebaseUser) {
          setClasses([]);
          setBoards([]);
          setSections([]);
          setPosts([]);
          setComments([]);
          setAppRole(null);
          setDataLoading(false);
          setDataError(null);
          return;
        }

        setDataLoading(true);
        void upsertUserProfile(firebaseUser).catch((error) => {
          setDataError(error instanceof Error ? error.message : "PROFILE_SAVE_FAILED");
        });
        stopRole = subscribeApplicationRole(appUser!, (role) => {
          setAppRole(role);
          stopWorkspace();
          if (role === "student") {
            setClasses([]);
            setBoards([]);
            setSections([]);
            setDataLoading(false);
            setDataError(null);
            return;
          }
          stopWorkspace = subscribeTeacherWorkspace(
            firebaseUser.uid,
            role,
            (nextClasses, nextBoards, nextSections) => {
              setClasses(nextClasses);
              setBoards(nextBoards);
              setSections(nextSections);
              setDataLoading(false);
              setDataError(null);
            },
            (error) => {
              setDataLoading(false);
              setDataError(error.message);
            },
          );
        }, (error) => {
          setDataLoading(false);
          setDataError(error.message);
        });
      },
      (error) => {
        finishAuthCheck();
        setAuthReady(true);
        setDataLoading(false);
        setAuthError(error.message);
      },
    );

    return () => {
      window.clearTimeout(authTimeout);
      stopWorkspace();
      stopRole();
      stopAuth();
    };
  }, []);

  const watchBoardPosts = useCallback((classId: string, boardId: string) => {
    if (!firebaseConfigured) return () => {};
    return subscribeBoardPosts(
      classId,
      boardId,
      (nextPosts) => {
        setPosts((current) => [
          ...current.filter((item) => item.boardId !== boardId),
          ...nextPosts,
        ]);
        setDataError(null);
      },
      (error) => setDataError(error.message),
    );
  }, []);

  const watchBoardComments = useCallback((classId: string, boardId: string) => {
    if (!firebaseConfigured) return () => {};
    return subscribeBoardComments(classId, boardId, (nextComments) => {
      setComments((current) => [...current.filter((item) => item.boardId !== boardId), ...nextComments]);
    }, (error) => setDataError(error.message));
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      user,
      authReady,
      authError,
      dataLoading,
      dataError,
      appRole,
      canCreateClass: appRole === "owner" || appRole === "teacher",
      classes,
      boards,
      sections,
      posts,
      comments,
      watchBoardPosts,
      watchBoardComments,
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
        if (appRole !== "owner" && appRole !== "teacher") throw new Error("TEACHER_APPROVAL_REQUIRED");
        setDataError(null);
        const classId = await createOwnedClass(user, input);
        setClasses((current) => current.some((item) => item.id === classId) ? current : [
          ...current,
          {
            id: classId,
            name: input.name,
            description: input.description,
            role: "owner",
            ownerUid: user.uid,
            canManage: true,
            boardCount: 0,
            postCount: 0,
            accent: ["copper", "moss", "ink"][current.length % 3],
          },
        ]);
        return classId;
      },
      createBoard: async (classId, input) => {
        if (!user) throw new Error("AUTH_REQUIRED");
        const classroom = classes.find((item) => item.id === classId);
        if (!classroom?.canManage) throw new Error("CLASS_MANAGEMENT_REQUIRED");
        setDataError(null);
        const result = await createClassBoard(classId, user.uid, input);
        setBoards((current) => current.some((item) => item.id === result.board.id) ? current : [...current, result.board]);
        setSections((current) => current.some((item) => item.id === result.section.id) ? current : [...current, result.section]);
        setClasses((current) => current.map((item) => item.id === classId
          ? { ...item, boardCount: item.boardCount + 1 }
          : item));
        return result.board.id;
      },
      deleteClass: async (classId) => {
        setDataError(null);
        await deleteEmptyManagedClass(classId);
        const removedBoardIds = new Set(boards.filter((item) => item.classId === classId).map((item) => item.id));
        setClasses((current) => current.filter((item) => item.id !== classId));
        setBoards((current) => current.filter((item) => item.classId !== classId));
        setSections((current) => current.filter((item) => !removedBoardIds.has(item.boardId)));
      },
      ensureClassLoaded: async (classId) => {
        if (!user || !appRole || classes.some((item) => item.id === classId)) return;
        setDataLoading(true);
        try {
          const result = await loadClassWorkspace(classId, user.uid, appRole);
          if (!result) return;
          setClasses((current) => current.some((item) => item.id === classId) ? current : [...current, result.classroom]);
          setBoards((current) => [
            ...current.filter((item) => item.classId !== classId),
            ...result.boards,
          ]);
          const loadedBoardIds = new Set(result.boards.map((item) => item.id));
          setSections((current) => [
            ...current.filter((item) => !loadedBoardIds.has(item.boardId)),
            ...result.sections,
          ]);
          setDataError(null);
        } catch (error) {
          setDataError(error instanceof Error ? error.message : "CLASS_LOAD_FAILED");
        } finally {
          setDataLoading(false);
        }
      },
      loadBoardPreviewImages: async (boardId) => {
        const board = boards.find((item) => item.id === boardId);
        if (!board) return [];
        if (!firebaseConfigured) {
          return posts
            .filter((post) => post.boardId === boardId)
            .map((post) => post.imageUrl || post.thumbImageUrl || post.mainImageUrl || "")
            .filter(Boolean)
            .slice(0, 3);
        }
        return loadBoardPreviewImagesFromFirestore(board.classId, boardId, 3);
      },
      loadStaffCandidates: async () => {
        if (appRole !== "owner") throw new Error("OWNER_REQUIRED");
        return listStaffCandidates();
      },
      setTeacherApproved: async (candidate, approved) => {
        if (!user || appRole !== "owner") throw new Error("OWNER_REQUIRED");
        await setTeacherApproval(candidate, approved, user.uid);
      },
      toggleBoardSetting: async (boardId, setting) => {
        const board = boards.find((item) => item.id === boardId);
        if (!board) throw new Error("BOARD_NOT_FOUND");
        const nextValue = !board[setting];
        if (firebaseConfigured) await updateBoardSettings(board.classId, boardId, { [setting]: nextValue });
        setBoards((current) =>
          current.map((board) =>
            board.id === boardId
              ? { ...board, [setting]: nextValue }
              : board,
          ),
        );
      },
      updateBoard: async (boardId, input) => {
        const board = boards.find((item) => item.id === boardId);
        if (!board) throw new Error("BOARD_NOT_FOUND");
        if (firebaseConfigured) await updateBoardSettings(board.classId, boardId, input);
        setBoards((current) => current.map((item) => item.id === boardId ? { ...item, ...input } : item));
      },
      updateBoardDisplay: async (boardId, input) => {
        const board = boards.find((item) => item.id === boardId);
        if (!board) throw new Error("BOARD_NOT_FOUND");
        setBoards((current) => current.map((item) => item.id === boardId ? { ...item, ...input } : item));
        try {
          if (firebaseConfigured) await updateBoardSettings(board.classId, boardId, input);
        } catch (error) {
          setBoards((current) => current.map((item) => {
            if (item.id !== boardId) return item;
            return {
              ...item,
              ...(input.postColumns !== undefined && item.postColumns === input.postColumns ? { postColumns: board.postColumns } : {}),
              ...(input.thumbnailMode !== undefined && item.thumbnailMode === input.thumbnailMode ? { thumbnailMode: board.thumbnailMode } : {}),
            };
          }));
          throw error;
        }
      },
      deleteBoard: async (boardId) => {
        const board = boards.find((item) => item.id === boardId);
        if (!board) throw new Error("BOARD_NOT_FOUND");
        if (firebaseConfigured) {
          if (!auth?.currentUser) throw new Error("AUTH_REQUIRED");
          const token = await auth.currentUser.getIdToken();
          await deleteBoardFiles(token, board.classId, boardId);
          await deleteBoardData(board.classId, boardId);
        }
        setBoards((current) => current.filter((item) => item.id !== boardId));
        setSections((current) => current.filter((item) => item.boardId !== boardId));
        setPosts((current) => current.filter((item) => item.boardId !== boardId));
        setComments((current) => current.filter((item) => item.boardId !== boardId));
      },
      addSection: async (boardId, title) => {
        const board = boards.find((item) => item.id === boardId);
        if (!board) throw new Error("BOARD_NOT_FOUND");
        const boardSections = sections.filter((item) => item.boardId === boardId);
        const section = firebaseConfigured
          ? await createBoardSection(board.classId, boardId, title, boardSections.length)
          : { id: `section-${crypto.randomUUID()}`, boardId, title, note: "", sortOrder: boardSections.length };
        setSections((current) => [...current, section]);
      },
      renameSection: async (sectionId, title) => {
        const section = sections.find((item) => item.id === sectionId);
        const board = section && boards.find((item) => item.id === section.boardId);
        if (!section || !board) throw new Error("SECTION_NOT_FOUND");
        if (firebaseConfigured) await renameBoardSection(board.classId, board.id, sectionId, title);
        setSections((current) => current.map((item) => item.id === sectionId ? { ...item, title } : item));
      },
      deleteSection: async (sectionId) => {
        const section = sections.find((item) => item.id === sectionId);
        const board = section && boards.find((item) => item.id === section.boardId);
        if (!section || !board) throw new Error("SECTION_NOT_FOUND");
        if (sections.filter((item) => item.boardId === board.id).length <= 1) throw new Error("LAST_SECTION");
        if (posts.some((item) => item.sectionId === sectionId)) throw new Error("SECTION_NOT_EMPTY");
        if (firebaseConfigured) await deleteBoardSection(board.classId, board.id, sectionId);
        setSections((current) => current.filter((item) => item.id !== sectionId));
      },
      moveSection: async (sectionId, direction) => {
        const section = sections.find((item) => item.id === sectionId);
        const board = section && boards.find((item) => item.id === section.boardId);
        if (!section || !board) throw new Error("SECTION_NOT_FOUND");
        const ordered = sections.filter((item) => item.boardId === board.id).sort((a, b) => a.sortOrder - b.sortOrder);
        const index = ordered.findIndex((item) => item.id === sectionId);
        const target = index + direction;
        if (target < 0 || target >= ordered.length) return;
        [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
        const normalized = ordered.map((item, sortOrder) => ({ ...item, sortOrder }));
        if (firebaseConfigured) await reorderBoardSections(board.classId, board.id, normalized.map((item) => item.id));
        setSections((current) => [...current.filter((item) => item.boardId !== board.id), ...normalized]);
      },
      addPost: async ({ boardId, sectionId, caption, file, processed, onStage }) => {
        if (!user) throw new Error("AUTH_REQUIRED");
        const board = boards.find((item) => item.id === boardId);
        if (!board) throw new Error("BOARD_NOT_FOUND");
        if (!board.allowPosting || board.status !== "active") throw new Error("POSTING_CLOSED");

        if (!firebaseConfigured) {
          const imageUrl = URL.createObjectURL(file);
          setPosts((current) => [...current, {
            id: `demo-${crypto.randomUUID()}`,
            boardId,
            sectionId,
            authorUid: user.uid,
            authorName: user.displayName,
            authorInitials: user.initials,
            caption,
            imageUrl,
            visual: "visual-upload",
            createdLabel: "Just now",
            commentCount: 0,
          }]);
          return;
        }

        if (!auth?.currentUser) throw new Error("AUTH_REQUIRED");
        const postId = reservePostId(board.classId, boardId);
        if (!processed) onStage?.("preparing");
        const prepared = processed || await processImage(file);
        onStage?.("uploading");
        const idToken = await auth.currentUser.getIdToken();
        const upload = await uploadPostImage(
          idToken,
          board.classId,
          boardId,
          postId,
          prepared.main,
          prepared.thumbnail,
        );
        const mainImageUrl = driveMediaUrl(upload.main);
        const thumbImageUrl = driveMediaUrl(upload.thumbnail);

        try {
          onStage?.("saving");
          const post = await createBoardPost(board.classId, boardId, postId, user, {
            sectionId,
            caption,
            mainFileId: upload.main.fileId,
            thumbFileId: upload.thumbnail.fileId,
            mainImageUrl,
            thumbImageUrl,
            imageBytes: upload.main.size,
            thumbBytes: upload.thumbnail.size,
          });
          setPosts((current) => current.some((item) => item.id === post.id) ? current : [...current, post]);
        } catch (error) {
          await deletePostFiles(idToken, board.classId, boardId, postId, [
            upload.main.fileId,
            upload.thumbnail.fileId,
          ]).catch(() => undefined);
          throw error;
        }
      },
      updatePost: async (postId, input) => {
        const post = posts.find((item) => item.id === postId);
        const board = post && boards.find((item) => item.id === post.boardId);
        if (!post || !board) throw new Error("POST_NOT_FOUND");
        setPosts((current) => current.map((item) => item.id === postId ? { ...item, ...input } : item));
        try {
          if (firebaseConfigured) await updateBoardPost(board.classId, board.id, postId, input);
        } catch (error) {
          setPosts((current) => current.map((item) => item.id === postId && item.caption === input.caption && item.sectionId === input.sectionId ? post : item));
          throw error;
        }
      },
      deletePost: async (postId) => {
        const post = posts.find((item) => item.id === postId);
        const board = post && boards.find((item) => item.id === post.boardId);
        if (!post || !board) throw new Error("POST_NOT_FOUND");
        const relatedComments = comments.filter((item) => item.postId === postId);
        if (firebaseConfigured) {
          if (!auth?.currentUser) throw new Error("AUTH_REQUIRED");
          const token = await auth.currentUser.getIdToken();
          const postFileIds = [post.mainFileId, post.thumbFileId].filter(Boolean) as string[];
          const commentFileIds = relatedComments.flatMap((comment) => [comment.mainFileId, comment.thumbFileId]).filter(Boolean) as string[];
          if (postFileIds.length || commentFileIds.length) await deletePostTreeFiles(token, board.classId, board.id, postId, [...postFileIds, ...commentFileIds]);
          await deleteBoardPostData(board.classId, board.id, postId);
        }
        setPosts((current) => current.filter((item) => item.id !== postId));
        setComments((current) => current.filter((item) => item.postId !== postId));
      },
      addComment: async (boardId, postId, text, file, processed, onStage) => {
        if (!user) throw new Error("AUTH_REQUIRED");
        const board = boards.find((item) => item.id === boardId);
        if (!board?.allowComments) throw new Error("COMMENTS_CLOSED");
        const commentId = firebaseConfigured ? reserveCommentId(board.classId, boardId) : `comment-${crypto.randomUUID()}`;
        const comment: BoardComment = {
          id: commentId, boardId, postId, authorUid: user.uid, authorName: user.displayName,
          authorInitials: user.initials, text, createdLabel: "Just now",
        };
        let uploaded: Awaited<ReturnType<typeof uploadCommentImage>> | undefined;
        let token = "";
        if (file && firebaseConfigured) {
          if (!auth?.currentUser) throw new Error("AUTH_REQUIRED");
          token = await auth.currentUser.getIdToken();
          if (!processed) onStage?.("preparing");
          const prepared = processed || await processImage(file);
          onStage?.("uploading");
          uploaded = await uploadCommentImage(token, board.classId, boardId, postId, commentId, prepared.main, prepared.thumbnail);
          Object.assign(comment, {
            mainFileId: uploaded.main.fileId, thumbFileId: uploaded.thumbnail.fileId,
            mainImageUrl: driveMediaUrl(uploaded.main), thumbImageUrl: driveMediaUrl(uploaded.thumbnail),
            imageBytes: uploaded.main.size, thumbBytes: uploaded.thumbnail.size,
          });
        } else if (file) {
          comment.mainImageUrl = URL.createObjectURL(file);
          comment.thumbImageUrl = comment.mainImageUrl;
        }
        try {
          onStage?.("saving");
          if (firebaseConfigured) await createBoardComment(board.classId, boardId, commentId, user, comment);
          setComments((current) => [...current, comment]);
        } catch (error) {
          if (uploaded) await deleteCommentFiles(token, board.classId, boardId, commentId, [uploaded.main.fileId, uploaded.thumbnail.fileId]).catch(() => undefined);
          throw error;
        }
      },
      updateComment: async (commentId, text) => {
        const comment = comments.find((item) => item.id === commentId);
        const board = comment && boards.find((item) => item.id === comment.boardId);
        if (!comment || !board) throw new Error("COMMENT_NOT_FOUND");
        if (firebaseConfigured) await updateBoardComment(board.classId, board.id, commentId, text);
        setComments((current) => current.map((item) => item.id === commentId ? { ...item, text } : item));
      },
      deleteComment: async (commentId) => {
        const comment = comments.find((item) => item.id === commentId);
        const board = comment && boards.find((item) => item.id === comment.boardId);
        if (!comment || !board) throw new Error("COMMENT_NOT_FOUND");
        if (firebaseConfigured) {
          if (!auth?.currentUser) throw new Error("AUTH_REQUIRED");
          const token = await auth.currentUser.getIdToken();
          const fileIds = [comment.mainFileId, comment.thumbFileId].filter(Boolean) as string[];
          if (fileIds.length) await deleteCommentFiles(token, board.classId, board.id, commentId, fileIds);
          await deleteBoardCommentData(board.classId, board.id, commentId);
        }
        setComments((current) => current.filter((item) => item.id !== commentId));
      },
    }),
    [appRole, authError, authReady, boards, classes, comments, dataError, dataLoading, posts, sections, user, watchBoardComments, watchBoardPosts],
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
