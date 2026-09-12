import { useEffect, useState, type FormEvent } from "react";

interface UserProfile {
  id: string;
  name: string;
  email: string;
}

interface UserProfileEditorProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  onReconnect: () => void;
}

type EditorDraft = Partial<Pick<UserProfile, "name" | "email">>;

function draftFromProfile(profile: UserProfile): EditorDraft {
  return { name: profile.name, email: profile.email };
}

export function UserProfileEditor({ profile, onSave, onReconnect }: UserProfileEditorProps) {
  const [editor, setEditor] = useState<EditorDraft>(() => draftFromProfile(profile));
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setEditor(draftFromProfile(profile));
  }, []);

  useEffect(() => {
    window.addEventListener("online", () => {
      setIsOnline(true);
      onReconnect();
    });

    return () => {
      window.removeEventListener("online", () => {
        setIsOnline(true);
        onReconnect();
      });
    };
  }, [onReconnect]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      ...profile,
      name: editor.name ?? "",
      email: editor.email ?? "",
    });
  }

  return (
    <form aria-label="Profile editor" onSubmit={handleSubmit}>
      <label htmlFor="profile-name">Name</label>
      <input
        id="profile-name"
        value={editor.name ?? ""}
        onChange={(event) => setEditor({ name: event.currentTarget.value })}
      />

      <label htmlFor="profile-email">Email</label>
      <input
        id="profile-email"
        type="email"
        value={editor.email ?? ""}
        onChange={(event) => setEditor({ email: event.currentTarget.value })}
      />

      <p role="status">{isOnline ? "Online" : "Waiting for connection"}</p>
      <button type="submit">Save profile</button>
    </form>
  );
}
