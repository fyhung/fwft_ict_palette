import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";

const projectId = "demo-fwft-ict-palette";
const appOwnerEmail = "fyhung@twghfwfts.edu.hk";
const classId = "class-a";
const boardId = "board-a";
const sectionId = "section-a";
const postId = "post-a";

let testEnv: RulesTestEnvironment | undefined;

function env() {
  if (!testEnv) throw new Error("RULES_TEST_ENV_NOT_INITIALIZED");
  return testEnv;
}

function appOwnerDb() {
  return env().authenticatedContext("app-owner", {
    email: appOwnerEmail,
    email_verified: true,
  }).firestore();
}

function classRef(db: Firestore, id = classId) {
  return doc(db, "classes", id);
}

function staffRef(db: Firestore, uid: string) {
  return doc(db, "staff", uid);
}

function legacyTeacherRef(db: Firestore, uid: string) {
  return doc(db, "classes", classId, "teachers", uid);
}

function boardRef(db: Firestore) {
  return doc(db, "classes", classId, "boards", boardId);
}

function sectionRef(db: Firestore, id = sectionId) {
  return doc(db, "classes", classId, "boards", boardId, "sections", id);
}

function postRef(db: Firestore, id = postId) {
  return doc(db, "classes", classId, "boards", boardId, "posts", id);
}

function commentRef(db: Firestore, id = "comment-a") {
  return doc(db, "classes", classId, "boards", boardId, "comments", id);
}

function validPost(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    sectionId,
    authorUid: uid,
    authorName: "Student",
    authorPhotoURL: "",
    caption: "A force is visible here.",
    mainFileId: "drive-main-file",
    thumbFileId: "drive-thumb-file",
    mainImageUrl: "https://example.invalid/main",
    thumbImageUrl: "https://example.invalid/thumb",
    imageBytes: 120_000,
    thumbBytes: 20_000,
    sortOrder: 0,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function validComment(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    postId,
    authorUid: uid,
    authorName: "Student",
    authorPhotoURL: "",
    text: "Good example.",
    imageBytes: 0,
    thumbBytes: 0,
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

async function seedDatabase() {
  await env().withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(classRef(db), {
      name: "4A Physics",
      description: "Test class",
      ownerUid: "class-owner",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(staffRef(db, "class-owner"), {
      uid: "class-owner",
      displayName: "Class Owner",
      email: "class-owner@example.test",
      role: "teacher",
      approvedAt: serverTimestamp(),
      approvedBy: "app-owner",
    });
    await setDoc(staffRef(db, "teacher"), {
      uid: "teacher",
      displayName: "Other Teacher",
      email: "teacher@example.test",
      role: "teacher",
      approvedAt: serverTimestamp(),
      approvedBy: "app-owner",
    });
    await setDoc(legacyTeacherRef(db, "class-owner"), {
      uid: "class-owner",
      role: "owner",
    });
    await setDoc(boardRef(db), {
      title: "Forces",
      description: "Test board",
      allowPosting: true,
      allowComments: true,
      status: "active",
      createdBy: "class-owner",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(sectionRef(db), {
      title: "Balanced forces",
      note: "",
      sortOrder: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(postRef(db), validPost("student-a"));
    await setDoc(commentRef(db), validComment("student-b"));
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await env().clearFirestore();
  await seedDatabase();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("student board access", () => {
  test("anonymous visitors cannot read a board", async () => {
    await assertFails(getDoc(boardRef(env().unauthenticatedContext().firestore())));
  });

  test("signed-in students can read a class and its active board content by path", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertSucceeds(getDoc(classRef(db)));
    await assertSucceeds(getDoc(boardRef(db)));
    await assertSucceeds(getDoc(sectionRef(db)));
    await assertSucceeds(getDoc(postRef(db)));
    await assertSucceeds(getDoc(commentRef(db)));
  });

  test("students cannot enumerate all classes", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertFails(getDocs(collection(db, "classes")));
  });
});

describe("student contributions", () => {
  test("student can create a valid post as themselves", async () => {
    const db = env().authenticatedContext("student-b").firestore();
    await assertSucceeds(setDoc(postRef(db, "post-b"), validPost("student-b")));
  });

  test("student cannot impersonate another author or post into a missing section", async () => {
    const db = env().authenticatedContext("student-b").firestore();
    await assertFails(setDoc(postRef(db, "post-b"), validPost("student-a")));
    await assertFails(setDoc(postRef(db, "post-c"), validPost("student-b", { sectionId: "missing" })));
  });

  test("student cannot post when posting is closed", async () => {
    await env().withSecurityRulesDisabled(async (context) => {
      await updateDoc(boardRef(context.firestore()), { allowPosting: false });
    });
    await assertFails(setDoc(postRef(env().authenticatedContext("student-b").firestore(), "post-b"), validPost("student-b")));
  });

  test("student cannot update placement and can delete only their own post", async () => {
    const ownDb = env().authenticatedContext("student-a").firestore();
    const otherDb = env().authenticatedContext("student-b").firestore();
    await assertFails(updateDoc(postRef(ownDb), { sortOrder: 99 }));
    await assertFails(deleteDoc(postRef(otherDb)));
    await assertSucceeds(deleteDoc(postRef(ownDb)));
  });

  test("student can create a comment as themselves but cannot delete comments", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertSucceeds(setDoc(commentRef(db, "comment-b"), validComment("student-a")));
    await assertFails(setDoc(commentRef(db, "comment-c"), validComment("student-b")));
    await assertFails(deleteDoc(commentRef(db)));
  });

  test("student cannot comment when comments are closed", async () => {
    await env().withSecurityRulesDisabled(async (context) => {
      await updateDoc(boardRef(context.firestore()), { allowComments: false });
    });
    const db = env().authenticatedContext("student-a").firestore();
    await assertFails(setDoc(commentRef(db, "comment-b"), validComment("student-a")));
  });
});

describe("class creation and discovery", () => {
  test("students cannot create classes", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertFails(setDoc(classRef(db, "student-class"), {
      name: "Student class",
      description: "",
      ownerUid: "student-a",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });

  test("approved teachers can create classes they own and list all classes", async () => {
    const db = env().authenticatedContext("teacher").firestore();
    await assertSucceeds(setDoc(classRef(db, "teacher-class"), {
      name: "Teacher class",
      description: "",
      ownerUid: "teacher",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(getDocs(collection(db, "classes")));
  });

  test("application owner can list all classes", async () => {
    await assertSucceeds(getDocs(collection(appOwnerDb(), "classes")));
  });
});

describe("class management boundaries", () => {
  test("class owner can manage boards, sections, posts and comments", async () => {
    const db = env().authenticatedContext("class-owner").firestore();
    await assertSucceeds(updateDoc(boardRef(db), { allowPosting: false }));
    await assertSucceeds(setDoc(sectionRef(db, "section-b"), {
      title: "Unbalanced forces",
      note: "",
      sortOrder: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(postRef(db), { sortOrder: 2 }));
    await assertSucceeds(deleteDoc(commentRef(db)));
  });

  test("approved teacher cannot manage another teacher's class", async () => {
    const db = env().authenticatedContext("teacher").firestore();
    await assertFails(updateDoc(boardRef(db), { allowPosting: false }));
    await assertFails(updateDoc(postRef(db), { sortOrder: 2 }));
    await assertFails(deleteDoc(commentRef(db)));
    await assertFails(deleteDoc(classRef(db)));
  });

  test("application owner can manage every class and its content", async () => {
    const db = appOwnerDb();
    await assertSucceeds(updateDoc(boardRef(db), { allowPosting: false }));
    await assertSucceeds(updateDoc(postRef(db), { sortOrder: 2 }));
    await assertSucceeds(deleteDoc(commentRef(db)));
  });

  test("students cannot manage boards or sections", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    await assertFails(updateDoc(boardRef(db), { allowPosting: false }));
    await assertFails(updateDoc(sectionRef(db), { title: "Changed" }));
  });

  test("legacy membership can only be removed with its class", async () => {
    const db = env().authenticatedContext("class-owner").firestore();
    await assertFails(deleteDoc(legacyTeacherRef(db, "class-owner")));
    const batch = writeBatch(db);
    batch.delete(legacyTeacherRef(db, "class-owner"));
    batch.delete(classRef(db));
    await assertSucceeds(batch.commit());
  });
});

describe("application staff management", () => {
  test("only application owner can approve or revoke teachers", async () => {
    const ownerDb = appOwnerDb();
    const teacherDb = env().authenticatedContext("class-owner").firestore();
    const studentDb = env().authenticatedContext("student-a").firestore();
    const record = {
      uid: "teacher-b",
      displayName: "Teacher B",
      email: "teacher-b@example.test",
      role: "teacher",
      approvedAt: serverTimestamp(),
      approvedBy: "app-owner",
    };
    await assertFails(setDoc(staffRef(studentDb, "teacher-b"), record));
    await assertFails(setDoc(staffRef(teacherDb, "teacher-b"), record));
    await assertSucceeds(setDoc(staffRef(ownerDb, "teacher-b"), record));
    await assertSucceeds(deleteDoc(staffRef(ownerDb, "teacher-b")));
  });

  test("users can write only their own profile; owner can list profiles", async () => {
    const db = env().authenticatedContext("student-a").firestore();
    const profile = {
      uid: "student-a",
      displayName: "Student A",
      email: "student-a@example.test",
      photoURL: "",
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(db, "users", "student-a"), profile));
    await assertFails(setDoc(doc(db, "users", "student-b"), profile));
    await assertSucceeds(getDocs(collection(appOwnerDb(), "users")));
  });
});
